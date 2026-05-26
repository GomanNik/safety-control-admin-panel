# ============================================================
# File: vision/app/storage/frame_store.py
# Purpose:
# - Stores evidence images, crops and optional clips for the vision service.
# - Returns relative public paths instead of absolute filesystem paths.
# - Performs opportunistic retention cleanup.
# - Adds stage-7 evidence records with metadata without breaking old methods.
# ============================================================

from __future__ import annotations

import json
import logging
import re
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import cv2
import numpy as np

from app.models.schemas import BBox


logger = logging.getLogger(__name__)


# ============================================================
# Stage-7 evidence models
# ============================================================

@dataclass(slots=True)
class EvidenceRecord:
    evidence_id: str
    created_at: str
    observed_at: str

    frame_index: int | None = None
    track_id: int | None = None
    track_episode_id: str | None = None
    source_track_id: int | None = None
    person_id: str | None = None
    candidate_id: str | None = None
    incident_id: str | None = None

    evidence_type: str = "incident"
    image_path: str | None = None
    crop_path: str | None = None
    head_crop_path: str | None = None
    upper_body_crop_path: str | None = None
    lower_body_crop_path: str | None = None
    footwear_crop_path: str | None = None
    metadata_path: str | None = None

    quality_score: float = 0.0
    headwear_status: str = "unknown"
    identity_decision_type: str | None = None
    scene_zone: str | None = None
    visibility_state: str | None = None
    headwear_context_usable: bool | None = None
    reason_codes: list[str] = field(default_factory=list)


# ============================================================
# Frame store
# ============================================================

class FrameStore:
    def __init__(
        self,
        base_dir: str,
        *,
        image_ext: str = ".jpg",
        jpeg_quality: int = 90,
        retention_days: int = 14,
        cleanup_interval_sec: float = 300.0,
    ) -> None:
        self._base_dir = Path(base_dir).resolve()
        self._image_ext = image_ext if image_ext.startswith(".") else f".{image_ext}"
        self._jpeg_quality = max(1, min(100, int(jpeg_quality)))
        self._retention_days = max(1, int(retention_days))
        self._cleanup_interval_sec = max(30.0, float(cleanup_interval_sec))

        self._lock = threading.Lock()
        self._last_cleanup_monotonic = 0.0

        self._base_dir.mkdir(parents=True, exist_ok=True)

    # ========================================================
    # Backward-compatible public methods
    # ========================================================

    def save_full_frame(
        self,
        *,
        frame: np.ndarray,
        camera_id: str,
        timestamp: datetime,
        prefix: str,
    ) -> str | None:
        if not self._is_valid_frame(frame):
            return None

        safe_camera_id = self._sanitize(camera_id)
        safe_prefix = self._sanitize(prefix)

        directory = self._build_directory(timestamp=timestamp, camera_id=safe_camera_id, kind="full_frames")
        filename = self._build_filename(timestamp=timestamp, prefix=safe_prefix)
        path = directory / filename

        with self._lock:
            self._maybe_cleanup_retention_locked()
            directory.mkdir(parents=True, exist_ok=True)

            if self._write_image(path, frame):
                return self._public_path(path)

        return None

    def save_crop(
        self,
        *,
        frame: np.ndarray,
        bbox: BBox,
        camera_id: str,
        timestamp: datetime,
        prefix: str,
    ) -> str | None:
        if not self._is_valid_frame(frame):
            return None

        crop = self._safe_crop(frame, bbox)
        if crop is None:
            return None

        safe_camera_id = self._sanitize(camera_id)
        safe_prefix = self._sanitize(prefix)

        directory = self._build_directory(timestamp=timestamp, camera_id=safe_camera_id, kind="crops")
        filename = self._build_filename(timestamp=timestamp, prefix=safe_prefix)
        path = directory / filename

        with self._lock:
            self._maybe_cleanup_retention_locked()
            directory.mkdir(parents=True, exist_ok=True)

            if self._write_image(path, crop):
                return self._public_path(path)

        return None

    def save_clip(
        self,
        *,
        frames: list[np.ndarray],
        camera_id: str,
        timestamp: datetime,
        prefix: str,
        fps: float = 8.0,
    ) -> str | None:
        if not frames:
            return None

        first = frames[0]
        if not self._is_valid_frame(first):
            return None

        safe_camera_id = self._sanitize(camera_id)
        safe_prefix = self._sanitize(prefix)

        directory = self._build_directory(timestamp=timestamp, camera_id=safe_camera_id, kind="clips")
        filename = self._build_filename(timestamp=timestamp, prefix=safe_prefix, extension=".mp4")
        path = directory / filename

        height, width = first.shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")

        with self._lock:
            self._maybe_cleanup_retention_locked()
            directory.mkdir(parents=True, exist_ok=True)

            writer = cv2.VideoWriter(str(path), fourcc, max(1.0, float(fps)), (width, height))
            try:
                if not writer.isOpened():
                    return None

                for frame in frames:
                    if not self._is_valid_frame(frame):
                        continue

                    if frame.shape[:2] != (height, width):
                        frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)

                    writer.write(frame)
            finally:
                writer.release()

        return self._public_path(path) if path.exists() else None

    # ========================================================
    # Stage-7 evidence API
    # ========================================================

    def save_incident_evidence(
        self,
        *,
        frame: np.ndarray | None,
        camera_id: str,
        observed_at: datetime,
        frame_index: int | None = None,
        track_id: int | None = None,
        track_episode_id: str | None = None,
        source_track_id: int | None = None,
        person_id: str | None = None,
        candidate_id: str | None = None,
        incident_id: str | None = None,
        bbox: BBox | None = None,
        head_bbox: BBox | None = None,
        upper_body_bbox: BBox | None = None,
        lower_body_bbox: BBox | None = None,
        footwear_bbox: BBox | None = None,
        quality_score: float = 0.0,
        headwear_status: str = "unknown",
        identity_decision_type: str | None = None,
        scene_zone: str | None = None,
        visibility_state: str | None = None,
        headwear_context_usable: bool | None = None,
        reason_codes: list[str] | None = None,
        evidence_type: str = "incident",
        min_quality_score: float = 0.35,
    ) -> EvidenceRecord | None:
        if not self._is_valid_frame(frame):
            return None

        safe_quality = self._clamp01(quality_score)
        if safe_quality < max(0.0, float(min_quality_score)):
            return None

        normalized_headwear = self._normalize_status(headwear_status)
        normalized_evidence_type = self._sanitize(evidence_type)

        if not self._is_useful_evidence_signal(
            evidence_type=normalized_evidence_type,
            headwear_status=normalized_headwear,
            incident_id=incident_id,
        ):
            return None

        if bbox is not None:
            main_crop = self._safe_crop(frame, bbox)
            if not self._is_informative_crop(main_crop):
                return None

        evidence_id = f"evidence_{uuid4().hex[:16]}"
        safe_camera_id = self._sanitize(camera_id)

        created_at = datetime.now(timezone.utc)
        directory = (
            self._base_dir
            / observed_at.astimezone(timezone.utc).date().isoformat()
            / safe_camera_id
            / "evidence"
            / evidence_id
        )

        with self._lock:
            try:
                self._maybe_cleanup_retention_locked()
                directory.mkdir(parents=True, exist_ok=True)

                image_path = self._write_named_image(
                    directory=directory,
                    filename="frame",
                    image=frame,
                )

                crop_path = self._write_bbox_crop(
                    directory=directory,
                    filename="person_crop",
                    frame=frame,
                    bbox=bbox,
                )

                head_crop_path = self._write_bbox_crop(
                    directory=directory,
                    filename="head_crop",
                    frame=frame,
                    bbox=head_bbox,
                )

                upper_body_crop_path = self._write_bbox_crop(
                    directory=directory,
                    filename="upper_body_crop",
                    frame=frame,
                    bbox=upper_body_bbox,
                )

                lower_body_crop_path = self._write_bbox_crop(
                    directory=directory,
                    filename="lower_body_crop",
                    frame=frame,
                    bbox=lower_body_bbox,
                )

                footwear_crop_path = self._write_bbox_crop(
                    directory=directory,
                    filename="footwear_crop",
                    frame=frame,
                    bbox=footwear_bbox,
                )

                metadata_path = directory / "metadata.json"

                record = EvidenceRecord(
                    evidence_id=evidence_id,
                    created_at=created_at.isoformat(),
                    observed_at=observed_at.astimezone(timezone.utc).isoformat(),
                    frame_index=frame_index,
                    track_id=track_id,
                    track_episode_id=track_episode_id,
                    source_track_id=source_track_id,
                    person_id=person_id,
                    candidate_id=candidate_id,
                    incident_id=incident_id,
                    evidence_type=normalized_evidence_type,
                    image_path=image_path,
                    crop_path=crop_path,
                    head_crop_path=head_crop_path,
                    upper_body_crop_path=upper_body_crop_path,
                    lower_body_crop_path=lower_body_crop_path,
                    footwear_crop_path=footwear_crop_path,
                    metadata_path=self._public_path(metadata_path),
                    quality_score=safe_quality,
                    headwear_status=normalized_headwear,
                    identity_decision_type=identity_decision_type,
                    scene_zone=scene_zone,
                    visibility_state=visibility_state,
                    headwear_context_usable=headwear_context_usable,
                    reason_codes=self._unique_reasons(reason_codes or []),
                )

                metadata_path.write_text(
                    json.dumps(asdict(record), ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

                return record
            except Exception:
                logger.exception("Failed to save incident evidence.")
                return None

    def save_identity_crop(
        self,
        *,
        frame: np.ndarray | None,
        bbox: BBox | None,
        camera_id: str,
        timestamp: datetime,
        prefix: str,
        quality_score: float = 0.0,
        min_quality_score: float = 0.35,
    ) -> str | None:
        if not self._is_valid_frame(frame):
            return None
        if bbox is None:
            return None
        if self._clamp01(quality_score) < max(0.0, float(min_quality_score)):
            return None

        crop = self._safe_crop(frame, bbox)
        if not self._is_informative_crop(crop):
            return None

        return self.save_crop(
            frame=frame,
            bbox=bbox,
            camera_id=camera_id,
            timestamp=timestamp,
            prefix=prefix,
        )

    def save_part_crop(
        self,
        *,
        frame: np.ndarray | None,
        bbox: BBox | None,
        camera_id: str,
        timestamp: datetime,
        part_name: str,
        track_id: int | None = None,
        quality_score: float = 0.0,
        min_quality_score: float = 0.30,
    ) -> str | None:
        if not self._is_valid_frame(frame):
            return None
        if bbox is None:
            return None
        if self._clamp01(quality_score) < max(0.0, float(min_quality_score)):
            return None

        crop = self._safe_crop(frame, bbox)
        if not self._is_informative_crop(crop):
            return None

        safe_part_name = self._sanitize(part_name)
        if track_id is None:
            prefix = safe_part_name
        else:
            prefix = f"track_{track_id}_{safe_part_name}"

        return self.save_crop(
            frame=frame,
            bbox=bbox,
            camera_id=camera_id,
            timestamp=timestamp,
            prefix=prefix,
        )

    def select_better_evidence(
        self,
        left: EvidenceRecord | None,
        right: EvidenceRecord | None,
    ) -> EvidenceRecord | None:
        if left is None:
            return right
        if right is None:
            return left

        left_rank = self._evidence_rank(left)
        right_rank = self._evidence_rank(right)

        return right if right_rank > left_rank else left

    # ========================================================
    # Retention
    # ========================================================

    def cleanup_retention(self, *, now: datetime | None = None) -> None:
        reference = now or datetime.now(timezone.utc)
        cutoff = reference - timedelta(days=self._retention_days)

        with self._lock:
            self._cleanup_retention_locked(cutoff=cutoff)
            self._last_cleanup_monotonic = time.monotonic()

    def _maybe_cleanup_retention_locked(self) -> None:
        now_monotonic = time.monotonic()
        if (now_monotonic - self._last_cleanup_monotonic) < self._cleanup_interval_sec:
            return

        reference = datetime.now(timezone.utc)
        cutoff = reference - timedelta(days=self._retention_days)
        self._cleanup_retention_locked(cutoff=cutoff)
        self._last_cleanup_monotonic = now_monotonic

    def _cleanup_retention_locked(self, *, cutoff: datetime) -> None:
        for path in self._base_dir.rglob("*"):
            if not path.is_file():
                continue

            try:
                modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            except Exception:
                continue

            if modified >= cutoff:
                continue

            try:
                path.unlink()
            except Exception:
                pass

        for directory in sorted(self._base_dir.rglob("*"), reverse=True):
            if not directory.is_dir():
                continue
            try:
                next(directory.iterdir())
            except StopIteration:
                try:
                    directory.rmdir()
                except Exception:
                    pass
            except Exception:
                pass

    # ========================================================
    # Path / write helpers
    # ========================================================

    def _build_directory(self, *, timestamp: datetime, camera_id: str, kind: str) -> Path:
        date_key = timestamp.astimezone(timezone.utc).date().isoformat()
        return self._base_dir / date_key / camera_id / kind

    def _build_filename(self, *, timestamp: datetime, prefix: str, extension: str | None = None) -> str:
        ext = extension or self._image_ext
        ts = timestamp.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
        return f"{prefix}_{ts}{ext}"

    def _write_named_image(self, *, directory: Path, filename: str, image: np.ndarray) -> str | None:
        safe_filename = self._sanitize(filename)
        path = directory / f"{safe_filename}{self._image_ext}"
        if self._write_image(path, image):
            return self._public_path(path)
        return None

    def _write_bbox_crop(
        self,
        *,
        directory: Path,
        filename: str,
        frame: np.ndarray,
        bbox: BBox | None,
    ) -> str | None:
        if bbox is None:
            return None

        crop = self._safe_crop(frame, bbox)
        if not self._is_informative_crop(crop):
            return None

        return self._write_named_image(
            directory=directory,
            filename=filename,
            image=crop,
        )

    def _write_image(self, path: Path, image: np.ndarray) -> bool:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)

            if path.suffix.lower() in {".jpg", ".jpeg"}:
                return bool(cv2.imwrite(str(path), image, [cv2.IMWRITE_JPEG_QUALITY, self._jpeg_quality]))

            return bool(cv2.imwrite(str(path), image))
        except Exception:
            return False

    def _safe_crop(self, frame: np.ndarray | None, bbox: BBox) -> np.ndarray | None:
        if not self._is_valid_frame(frame):
            return None

        h, w = frame.shape[:2]

        x1 = max(0, min(w, int(bbox.x1)))
        y1 = max(0, min(h, int(bbox.y1)))
        x2 = max(0, min(w, int(bbox.x2)))
        y2 = max(0, min(h, int(bbox.y2)))

        if x2 <= x1 or y2 <= y1:
            return None

        crop = frame[y1:y2, x1:x2]
        return crop if crop.size > 0 else None

    # ========================================================
    # Validation helpers
    # ========================================================

    def _is_valid_frame(self, frame: np.ndarray | None) -> bool:
        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0 or frame.ndim < 2:
            return False

        h, w = frame.shape[:2]
        return h > 0 and w > 0

    @staticmethod
    def _is_informative_crop(crop: np.ndarray | None) -> bool:
        if crop is None or not isinstance(crop, np.ndarray) or crop.size == 0 or crop.ndim < 2:
            return False

        h, w = crop.shape[:2]
        if h < 8 or w < 8:
            return False

        if h * w < 64:
            return False

        return True

    @staticmethod
    def _is_useful_evidence_signal(
        *,
        evidence_type: str,
        headwear_status: str,
        incident_id: str | None,
    ) -> bool:
        if evidence_type in {"identity", "part", "snapshot"}:
            return True

        if incident_id:
            return True

        return headwear_status == "violation"

    @staticmethod
    def _normalize_status(value: str | None) -> str:
        if value is None:
            return "unknown"

        text = str(value).strip().lower()
        if text in {"violation", "no_headwear", "no-headwear", "no headwear"}:
            return "violation"
        if text in {"compliant", "ok", "headwear_ok", "headwear-ok"}:
            return "compliant"

        return "unknown"

    @staticmethod
    def _clamp01(value: float) -> float:
        try:
            return max(0.0, min(1.0, float(value)))
        except Exception:
            return 0.0

    @staticmethod
    def _unique_reasons(values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()

        for value in values:
            if not value:
                continue
            if value in seen:
                continue

            seen.add(value)
            result.append(value)

        return result

    @staticmethod
    def _evidence_rank(record: EvidenceRecord) -> tuple[int, float, int]:
        status_rank = 2 if record.headwear_status == "violation" else 1 if record.headwear_status == "compliant" else 0
        crop_rank = sum(
            1
            for value in (
                record.image_path,
                record.crop_path,
                record.head_crop_path,
                record.upper_body_crop_path,
                record.lower_body_crop_path,
                record.footwear_crop_path,
            )
            if value
        )
        return status_rank, float(record.quality_score), crop_rank

    def _public_path(self, path: Path) -> str:
        try:
            return path.relative_to(self._base_dir).as_posix()
        except Exception:
            return path.as_posix()

    def _sanitize(self, value: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", value.strip())
        return cleaned.strip("._-") or "item"