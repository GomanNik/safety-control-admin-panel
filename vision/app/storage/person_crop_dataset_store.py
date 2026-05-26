# ============================================================
# File: vision/app/storage/person_crop_dataset_store.py
# Purpose:
# - Stores clean person-crop dataset samples for offline model preparation.
# - Saves only unannotated frames/crops and tabular metadata.
# - Does not save overlays, incidents, tracks, videos or headwear predictions.
# ============================================================

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.models.schemas import BBox
from app.pipeline.person_box_gate import PersonBoxDecision
from app.pipeline.tracking_types import TrackedPersonObservation


@dataclass(slots=True)
class PersonCropSampleRecord:
    sample_id: str
    accepted: bool
    frame_path: str
    crop_path: str
    reason_codes: list[str]


class PersonCropDatasetStore:
    """Append-only storage for clean person crop collection runs."""

    MANIFEST_FIELDS = [
        "sample_id",
        "camera_id",
        "source_url",
        "frame_index",
        "timestamp_seconds",
        "observed_at",
        "detector_track_id",
        "person_conf",
        "class_id",
        "class_name",
        "frame_width",
        "frame_height",
        "bbox_x1",
        "bbox_y1",
        "bbox_x2",
        "bbox_y2",
        "crop_width",
        "crop_height",
        "aspect_ratio",
        "area_ratio",
        "touches_top",
        "touches_left",
        "touches_right",
        "touches_bottom",
        "blur_laplacian",
        "brightness_mean",
        "accepted",
        "reason_codes",
        "frame_path",
        "crop_path",
    ]

    def __init__(
        self,
        *,
        root: str | Path,
        camera_id: str,
        source_url: str,
        jpeg_quality: int = 92,
        save_frames: bool = True,
        save_rejected: bool = False,
        session_started_at: datetime | None = None,
    ) -> None:
        self.root = Path(root).expanduser().resolve()
        self.camera_id = self._safe_name(camera_id or "camera")
        self.source_url = str(source_url or "")
        self.jpeg_quality = max(1, min(100, int(jpeg_quality)))
        self.save_frames = bool(save_frames)
        self.save_rejected = bool(save_rejected)

        started = session_started_at or datetime.utcnow()
        stamp = started.strftime("%Y%m%d_%H%M%S")
        self.session_dir = self.root / self.camera_id / f"{stamp}_person_crops"
        self.frames_dir = self.session_dir / "frames"
        self.accepted_crops_dir = self.session_dir / "crops" / "accepted"
        self.rejected_crops_dir = self.session_dir / "crops" / "rejected"
        self.manifest_path = self.session_dir / "manifest.csv"
        self.summary_path = self.session_dir / "summary.csv"

        self.frames_dir.mkdir(parents=True, exist_ok=True)
        self.accepted_crops_dir.mkdir(parents=True, exist_ok=True)
        if self.save_rejected:
            self.rejected_crops_dir.mkdir(parents=True, exist_ok=True)

        self._manifest_file = self.manifest_path.open("w", encoding="utf-8-sig", newline="")
        self._writer = csv.DictWriter(self._manifest_file, fieldnames=self.MANIFEST_FIELDS, delimiter=";")
        self._writer.writeheader()
        self._manifest_file.flush()

        self.total_count = 0
        self.accepted_count = 0
        self.rejected_count = 0
        self.saved_frame_count = 0
        self.saved_crop_count = 0
        self._saved_frames_by_index: dict[int, Path] = {}

    def close(self) -> None:
        self.write_summary()
        self._manifest_file.flush()
        self._manifest_file.close()

    def write_summary(self) -> None:
        rows = [
            {"metric": "total_samples", "value": self.total_count},
            {"metric": "accepted_samples", "value": self.accepted_count},
            {"metric": "rejected_samples", "value": self.rejected_count},
            {"metric": "saved_frames", "value": self.saved_frame_count},
            {"metric": "saved_crops", "value": self.saved_crop_count},
        ]
        self.summary_path.parent.mkdir(parents=True, exist_ok=True)
        with self.summary_path.open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=["metric", "value"], delimiter=";")
            writer.writeheader()
            writer.writerows(rows)

    def save_sample(
        self,
        *,
        frame: np.ndarray,
        track: TrackedPersonObservation,
        decision: PersonBoxDecision | None,
        frame_index: int,
        timestamp_seconds: float,
        observed_at: datetime,
        accepted: bool,
    ) -> PersonCropSampleRecord | None:
        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
            return None

        if not accepted and not self.save_rejected:
            self.rejected_count += 1
            return None

        frame_height, frame_width = frame.shape[:2]
        bbox = track.bbox.clamp(frame_width=frame_width, frame_height=frame_height)
        if not bbox.is_valid:
            return None

        crop = frame[int(bbox.y1): int(bbox.y2), int(bbox.x1): int(bbox.x2)].copy()
        if crop.size == 0:
            return None

        self.total_count += 1
        if accepted:
            self.accepted_count += 1
        else:
            self.rejected_count += 1

        sample_id = self._sample_id(frame_index=frame_index, track_id=int(track.track_id), accepted=accepted)

        frame_path = ""
        if self.save_frames:
            saved_frame = self._save_frame_once(frame=frame, frame_index=frame_index, timestamp_seconds=timestamp_seconds)
            frame_path = str(saved_frame)

        crop_dir = self.accepted_crops_dir if accepted else self.rejected_crops_dir
        crop_dir.mkdir(parents=True, exist_ok=True)
        crop_path = crop_dir / f"{sample_id}.jpg"
        self._write_image(crop_path, crop)
        self.saved_crop_count += 1

        reason_codes = self._reason_codes(track=track, decision=decision, accepted=accepted)
        blur, brightness = self._image_quality(crop)
        aspect_ratio = bbox.width / float(max(1, bbox.height))
        area_ratio = bbox.area / float(max(1, int(frame_width) * int(frame_height)))

        row = {
            "sample_id": sample_id,
            "camera_id": self.camera_id,
            "source_url": self.source_url,
            "frame_index": int(frame_index),
            "timestamp_seconds": f"{float(timestamp_seconds):.6f}",
            "observed_at": observed_at.isoformat(),
            "detector_track_id": int(track.track_id),
            "person_conf": f"{float(track.confidence):.6f}",
            "class_id": "" if track.class_id is None else int(track.class_id),
            "class_name": track.class_name or "",
            "frame_width": int(frame_width),
            "frame_height": int(frame_height),
            "bbox_x1": int(bbox.x1),
            "bbox_y1": int(bbox.y1),
            "bbox_x2": int(bbox.x2),
            "bbox_y2": int(bbox.y2),
            "crop_width": int(bbox.width),
            "crop_height": int(bbox.height),
            "aspect_ratio": f"{aspect_ratio:.6f}",
            "area_ratio": f"{area_ratio:.8f}",
            "touches_top": int(bbox.y1 <= 0),
            "touches_left": int(bbox.x1 <= 0),
            "touches_right": int(bbox.x2 >= frame_width),
            "touches_bottom": int(bbox.y2 >= frame_height),
            "blur_laplacian": f"{blur:.6f}",
            "brightness_mean": f"{brightness:.6f}",
            "accepted": int(bool(accepted)),
            "reason_codes": ",".join(reason_codes),
            "frame_path": frame_path,
            "crop_path": str(crop_path),
        }

        self._writer.writerow(row)
        self._manifest_file.flush()

        return PersonCropSampleRecord(
            sample_id=sample_id,
            accepted=bool(accepted),
            frame_path=frame_path,
            crop_path=str(crop_path),
            reason_codes=reason_codes,
        )

    def _save_frame_once(self, *, frame: np.ndarray, frame_index: int, timestamp_seconds: float) -> Path:
        cached = self._saved_frames_by_index.get(int(frame_index))
        if cached is not None:
            return cached

        name = f"frame_{int(frame_index):09d}_{int(round(timestamp_seconds * 1000)):012d}ms.jpg"
        path = self.frames_dir / name
        self._write_image(path, frame)
        self._saved_frames_by_index[int(frame_index)] = path
        self.saved_frame_count += 1
        return path

    def _write_image(self, path: Path, image: np.ndarray) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        ok = cv2.imwrite(str(path), image, [int(cv2.IMWRITE_JPEG_QUALITY), self.jpeg_quality])
        if not ok:
            raise RuntimeError(f"Failed to write image: {path}")

    def _sample_id(self, *, frame_index: int, track_id: int, accepted: bool) -> str:
        prefix = "accepted" if accepted else "rejected"
        return f"{prefix}_{int(frame_index):09d}_{int(track_id):06d}"

    @staticmethod
    def _reason_codes(*, track: TrackedPersonObservation, decision: PersonBoxDecision | None, accepted: bool) -> list[str]:
        values: list[str] = []
        if decision is not None:
            values.extend(str(item) for item in (decision.reason_codes or []))
        values.extend(str(item) for item in (track.reason_codes or []))
        if not values:
            values.append("person_box_accepted" if accepted else "person_box_rejected")
        return PersonCropDatasetStore._unique_values(values)

    @staticmethod
    def _image_quality(image: np.ndarray) -> tuple[float, float]:
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
            blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            brightness = float(np.mean(gray))
            return blur, brightness
        except Exception:
            return 0.0, 0.0

    @staticmethod
    def _safe_name(value: str) -> str:
        text = str(value or "").strip() or "camera"
        result = []
        for ch in text:
            if ch.isalnum() or ch in {"-", "_"}:
                result.append(ch)
            else:
                result.append("-")
        return "".join(result).strip("-") or "camera"

    @staticmethod
    def _unique_values(values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for raw in values:
            item = str(raw or "").strip()
            if not item or item in seen:
                continue
            seen.add(item)
            result.append(item)
        return result
