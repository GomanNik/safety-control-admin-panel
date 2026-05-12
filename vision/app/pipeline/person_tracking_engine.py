# ============================================================
# File: vision/app/pipeline/person_tracking_engine.py
# Purpose:
# - Production adapter over an external person tracking backend.
# - Primary backend: Ultralytics YOLO tracking with BoT-SORT / ByteTrack.
# - Emits temporary external track_id values only.
# - Never creates person_id/day_person_id.
# - Never performs headwear detection or incident logic.
# - Fails fast on unsafe production tracking configuration.
# ============================================================

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

from app.config import Settings
from app.models.schemas import BBox
from app.pipeline.tracking_types import (
    ExternalTrackState,
    TrackedPersonObservation,
    TrackingBackendType,
    TrackingDiagnostics,
    TrackingFrameResult,
)


logger = logging.getLogger(__name__)


_BUILTIN_ULTRALYTICS_TRACKERS = {"botsort.yaml", "bytetrack.yaml"}
_ULTRALYTICS_BACKENDS = {"ultralytics", "yolo", "yolo_track", "botsort", "bytetrack"}
_DEV_BACKENDS = {"development_simple", "simple", "dev_simple", "test"}
_DISABLED_BACKENDS = {"disabled", "none", "off"}


@dataclass(slots=True)
class _BackendResolution:
    backend_type: TrackingBackendType
    reason: str | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass(slots=True)
class _ParsedUltralyticsResult:
    visible_tracks: list[TrackedPersonObservation]
    raw_tracks_count: int
    processed_detections: int
    reason_codes: list[str]
    warnings: list[str]


class PersonTrackingEngine:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

        backend_resolution = self._resolve_backend()
        self._backend_type = backend_resolution.backend_type
        self._backend_resolution_reason = backend_resolution.reason
        self._backend_resolution_warnings = list(backend_resolution.warnings)

        self._model: Any | None = None
        self._model_path = self._resolve_model_path()
        self._tracker_config_path = self._resolve_tracker_config_path()
        self._device = self._resolve_device()

        self._ready = False
        self._failure_reason: str | None = None
        self._frame_index = 0

        self._track_hits_by_id: dict[int, int] = {}
        self._track_age_by_id: dict[int, int] = {}
        self._lost_age_by_id: dict[int, int] = {}
        self._last_visible_track_ids: set[int] = set()

        self._last_diagnostics = self._build_diagnostics(
            processed_detections=0,
            visible_tracks_count=0,
            raw_tracks_count=0,
            reason_codes=["not_initialized"],
            warnings=self._backend_resolution_warnings,
        )

        self._initialize_backend()

    # ========================================================
    # Public API
    # ========================================================

    def warmup(self) -> tuple[bool, str | None]:
        if self._backend_type == TrackingBackendType.DISABLED:
            return False, self._failure_reason or "person tracking backend is disabled"

        if not self._ready:
            return False, self._failure_reason or "person tracking backend is not ready"

        if self._backend_type != TrackingBackendType.ULTRALYTICS:
            return False, "unsupported person tracking backend"

        if self._model is None:
            self._ready = False
            self._failure_reason = "ultralytics_model_unavailable"
            return False, self._failure_reason

        try:
            frame = np.zeros((160, 160, 3), dtype=np.uint8)
            _ = self._call_ultralytics_track(frame=frame, persist=False, verbose=False)
            return True, None
        except Exception as error:  # pragma: no cover - depends on external backend
            self._ready = False
            self._failure_reason = f"person tracking warmup failed: {type(error).__name__}: {error}"
            self._last_diagnostics = self._build_diagnostics(
                processed_detections=0,
                visible_tracks_count=0,
                raw_tracks_count=0,
                reason_codes=["tracking_warmup_failed"],
                warnings=[self._failure_reason],
            )
            return False, self._failure_reason

    def process_frame(self, *, frame: np.ndarray, observed_at: datetime) -> TrackingFrameResult:
        self._frame_index += 1

        if not isinstance(observed_at, datetime):
            return self._fail_result(observed_at=datetime.utcnow(), reason="invalid_observed_at")

        if self._backend_type == TrackingBackendType.DISABLED:
            return self._fail_result(
                observed_at=observed_at,
                reason=self._failure_reason or "tracking_backend_disabled",
            )

        if not self._ready:
            return self._fail_result(
                observed_at=observed_at,
                reason=self._failure_reason or "tracking_backend_not_ready",
            )

        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
            return self._fail_result(observed_at=observed_at, reason="invalid_frame")

        if frame.ndim not in {2, 3}:
            return self._fail_result(observed_at=observed_at, reason="invalid_frame_dimensions")

        if self._backend_type == TrackingBackendType.ULTRALYTICS:
            return self._process_with_ultralytics(frame=frame, observed_at=observed_at)

        return self._fail_result(observed_at=observed_at, reason="unsupported_tracking_backend")

    def reset(self) -> None:
        self._frame_index = 0
        self._track_hits_by_id.clear()
        self._track_age_by_id.clear()
        self._lost_age_by_id.clear()
        self._last_visible_track_ids.clear()

        if self._backend_type == TrackingBackendType.ULTRALYTICS and self._model is None:
            self._init_ultralytics_backend()

    def ready(self) -> bool:
        return bool(self._ready)

    def failure_reason(self) -> str | None:
        return self._failure_reason

    def last_diagnostics(self) -> TrackingDiagnostics:
        return self._last_diagnostics

    # ========================================================
    # Backend initialization
    # ========================================================

    def _initialize_backend(self) -> None:
        if self._backend_type == TrackingBackendType.DISABLED:
            self._ready = False
            self._failure_reason = self._backend_resolution_reason or "person tracking backend is disabled"
            self._last_diagnostics = self._build_diagnostics(
                processed_detections=0,
                visible_tracks_count=0,
                raw_tracks_count=0,
                reason_codes=["tracking_backend_disabled"],
                warnings=[self._failure_reason, *self._backend_resolution_warnings],
            )
            return

        if self._backend_type == TrackingBackendType.DEVELOPMENT_SIMPLE:
            self._ready = False
            self._failure_reason = (
                "development_simple tracker was removed from production runtime; "
                "use PERSON_TRACKING_BACKEND=ultralytics with botsort.yaml or bytetrack.yaml"
            )
            self._last_diagnostics = self._build_diagnostics(
                processed_detections=0,
                visible_tracks_count=0,
                raw_tracks_count=0,
                reason_codes=["development_simple_removed"],
                warnings=[self._failure_reason],
            )
            return

        if self._backend_type == TrackingBackendType.ULTRALYTICS:
            self._init_ultralytics_backend()
            return

        self._ready = False
        self._failure_reason = "unsupported person tracking backend"
        self._last_diagnostics = self._build_diagnostics(
            processed_detections=0,
            visible_tracks_count=0,
            raw_tracks_count=0,
            reason_codes=["unsupported_tracking_backend"],
            warnings=[self._failure_reason],
        )

    def _resolve_backend(self) -> _BackendResolution:
        raw_backend = str(getattr(self._settings, "person_tracking_backend", "ultralytics") or "ultralytics").strip().lower()

        require_external = bool(getattr(self._settings, "person_tracking_require_external", True))
        allow_dev_simple = bool(getattr(self._settings, "person_tracking_allow_dev_simple", False))

        if raw_backend in _ULTRALYTICS_BACKENDS:
            return _BackendResolution(backend_type=TrackingBackendType.ULTRALYTICS)

        if raw_backend in _DEV_BACKENDS:
            if require_external or not allow_dev_simple:
                return _BackendResolution(
                    backend_type=TrackingBackendType.DISABLED,
                    reason="development_simple tracking backend is not allowed in the current runtime",
                    warnings=["development_simple_disabled"],
                )
            return _BackendResolution(
                backend_type=TrackingBackendType.DEVELOPMENT_SIMPLE,
                warnings=["development_simple_backend_requested_but_removed"],
            )

        if raw_backend in _DISABLED_BACKENDS:
            return _BackendResolution(
                backend_type=TrackingBackendType.DISABLED,
                reason="PERSON_TRACKING_BACKEND disables person tracking",
                warnings=["tracking_backend_disabled_by_config"],
            )

        return _BackendResolution(
            backend_type=TrackingBackendType.DISABLED,
            reason=f"unsupported PERSON_TRACKING_BACKEND value: {raw_backend}",
            warnings=["unsupported_tracking_backend"],
        )

    def _init_ultralytics_backend(self) -> None:
        self._ready = False
        self._failure_reason = None
        self._model = None

        preflight_errors = self._validate_ultralytics_preflight()
        if preflight_errors:
            self._failure_reason = "; ".join(preflight_errors)
            self._last_diagnostics = self._build_diagnostics(
                processed_detections=0,
                visible_tracks_count=0,
                raw_tracks_count=0,
                reason_codes=["ultralytics_preflight_failed"],
                warnings=preflight_errors,
            )
            return

        try:
            from ultralytics import YOLO  # type: ignore
        except Exception as error:  # pragma: no cover - optional dependency
            self._failure_reason = "Ultralytics tracking backend is selected, but package 'ultralytics' is not installed."
            self._last_diagnostics = self._build_diagnostics(
                processed_detections=0,
                visible_tracks_count=0,
                raw_tracks_count=0,
                reason_codes=["ultralytics_not_installed"],
                warnings=[f"import_failed:{type(error).__name__}: {error}"],
            )
            return

        try:
            self._model = YOLO(self._model_path)
            self._ready = True
            self._failure_reason = None
            self._last_diagnostics = self._build_diagnostics(
                processed_detections=0,
                visible_tracks_count=0,
                raw_tracks_count=0,
                reason_codes=["ultralytics_ready"],
                warnings=[],
            )
        except Exception as error:  # pragma: no cover - depends on model/backend
            self._model = None
            self._ready = False
            self._failure_reason = f"Failed to initialize Ultralytics tracking backend: {type(error).__name__}: {error}"
            self._last_diagnostics = self._build_diagnostics(
                processed_detections=0,
                visible_tracks_count=0,
                raw_tracks_count=0,
                reason_codes=["ultralytics_init_failed"],
                warnings=[self._failure_reason],
            )

    def _validate_ultralytics_preflight(self) -> list[str]:
        errors: list[str] = []

        if not self._model_path:
            errors.append("PERSON_MODEL_PATH/YOLO_MODEL_PATH is required for Ultralytics tracking")
            return errors

        allow_auto_download = bool(getattr(self._settings, "person_allow_ultralytics_auto_download", False))
        if not allow_auto_download:
            if self._is_probable_url(self._model_path):
                errors.append("PERSON_ALLOW_ULTRALYTICS_AUTO_DOWNLOAD=false rejects URL model paths")
            else:
                model_path = Path(self._model_path).expanduser()
                if not model_path.is_file():
                    errors.append(
                        "PERSON_MODEL_PATH does not exist locally and PERSON_ALLOW_ULTRALYTICS_AUTO_DOWNLOAD=false: "
                        f"{model_path}"
                    )

        tracker_config = self._tracker_config_path
        if tracker_config and tracker_config not in _BUILTIN_ULTRALYTICS_TRACKERS:
            tracker_path = Path(tracker_config).expanduser()
            if not tracker_path.is_file():
                errors.append(
                    "PERSON_TRACKING_TRACKER_CONFIG must be botsort.yaml, bytetrack.yaml or an existing local file: "
                    f"{tracker_path}"
                )

        min_conf = self._safe_float(getattr(self._settings, "person_tracking_min_confidence", 0.35), 0.35)
        if min_conf < 0.0 or min_conf > 1.0:
            errors.append("PERSON_TRACKING_MIN_CONFIDENCE must be in [0, 1]")

        person_class_id = self._safe_int(getattr(self._settings, "person_tracking_person_class_id", 0), 0)
        if person_class_id < 0:
            errors.append("PERSON_TRACKING_PERSON_CLASS_ID must be >= 0")

        if not self._device:
            errors.append("PERSON_TRACKING_DEVICE must not be empty")

        return errors

    def _resolve_backend_type(self) -> TrackingBackendType:
        return self._resolve_backend().backend_type

    # ========================================================
    # Frame processing
    # ========================================================

    def _process_with_ultralytics(self, *, frame: np.ndarray, observed_at: datetime) -> TrackingFrameResult:
        if self._model is None:
            return self._fail_result(observed_at=observed_at, reason="ultralytics_model_unavailable")

        try:
            results = self._call_ultralytics_track(
                frame=frame,
                persist=bool(getattr(self._settings, "person_tracking_persist", True)),
                verbose=False,
            )
        except Exception as error:
            reason = f"ultralytics_track_failed:{type(error).__name__}"
            self._last_diagnostics = self._build_diagnostics(
                processed_detections=0,
                visible_tracks_count=0,
                raw_tracks_count=0,
                reason_codes=[reason],
                warnings=[str(error)],
            )
            return self._fail_result(observed_at=observed_at, reason=reason)

        parsed = self._parse_ultralytics_results(results=results, observed_at=observed_at, frame_shape=frame.shape)
        lost_track_ids, removed_track_ids = self._update_track_lifecycle(
            visible_track_ids={item.track_id for item in parsed.visible_tracks}
        )

        diagnostics = self._build_diagnostics(
            processed_detections=parsed.processed_detections,
            visible_tracks_count=len(parsed.visible_tracks),
            raw_tracks_count=parsed.raw_tracks_count,
            reason_codes=parsed.reason_codes or ["ok"],
            warnings=parsed.warnings,
        )
        self._last_diagnostics = diagnostics

        return TrackingFrameResult(
            observed_at=observed_at,
            frame_index=self._frame_index,
            visible_tracks=parsed.visible_tracks,
            lost_track_ids=lost_track_ids,
            removed_track_ids=removed_track_ids,
            backend=self._backend_type,
            diagnostics=diagnostics,
        )

    def _call_ultralytics_track(self, *, frame: np.ndarray, persist: bool, verbose: bool) -> Any:
        if self._model is None:
            raise RuntimeError("Ultralytics model is not initialized")

        return self._model.track(
            source=frame,
            persist=bool(persist),
            tracker=self._tracker_config_path or None,
            conf=self._tracking_min_confidence(),
            classes=[self._person_class_id()],
            device=self._device,
            verbose=bool(verbose),
        )

    # ========================================================
    # Ultralytics parsing
    # ========================================================

    def _parse_ultralytics_results(self, *, results: Any, observed_at: datetime, frame_shape: tuple[int, ...]) -> _ParsedUltralyticsResult:
        parsed: list[TrackedPersonObservation] = []
        reason_codes: list[str] = []
        warnings: list[str] = []

        result_items = results if isinstance(results, (list, tuple)) else [results]
        person_class_id = self._person_class_id()
        min_conf = self._tracking_min_confidence()
        tracker_min_hits = max(1, self._safe_int(getattr(self._settings, "tracker_min_hits", 1), 1))

        raw_tracks_count = 0
        processed_detections = 0

        for result in result_items:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                reason_codes.append("ultralytics_result_without_boxes")
                continue

            count = self._boxes_count(boxes)
            raw_tracks_count += count

            for index in range(count):
                class_id = self._extract_class_id(boxes=boxes, index=index)
                if class_id is None:
                    reason_codes.append("detection_without_class_id")
                    continue
                if int(class_id) != person_class_id:
                    reason_codes.append("non_person_detection_skipped")
                    continue

                confidence = self._extract_confidence(boxes=boxes, index=index)
                if confidence < min_conf:
                    reason_codes.append("low_confidence_detection_skipped")
                    continue

                track_id = self._extract_track_id(boxes=boxes, index=index)
                if track_id is None:
                    reason_codes.append("detection_without_track_id")
                    continue

                bbox = self._extract_bbox(boxes=boxes, index=index)
                if bbox is None:
                    reason_codes.append("detection_without_bbox")
                    continue

                bbox = self._normalize_bbox(bbox=bbox, frame_shape=frame_shape)
                if bbox is None:
                    reason_codes.append("invalid_bbox_skipped")
                    continue

                processed_detections += 1

                hits = self._track_hits_by_id.get(track_id, 0) + 1
                age = self._track_age_by_id.get(track_id, 0) + 1

                self._track_hits_by_id[track_id] = hits
                self._track_age_by_id[track_id] = age
                self._lost_age_by_id.pop(track_id, None)

                parsed.append(
                    TrackedPersonObservation(
                        track_id=track_id,
                        bbox=bbox,
                        confidence=confidence,
                        observed_at=observed_at,
                        frame_index=self._frame_index,
                        track_state=ExternalTrackState.NEW if hits == 1 else ExternalTrackState.TRACKED,
                        track_age=age,
                        track_hits=hits,
                        time_since_update=0,
                        class_id=int(class_id),
                        class_name="person",
                        detector_confidence=confidence,
                        tracking_confidence=confidence,
                        source_backend=TrackingBackendType.ULTRALYTICS,
                        is_confirmed_track=hits >= tracker_min_hits,
                        is_visible=True,
                        is_shadow=False,
                        shadow_of_track_id=None,
                        reason_codes=["external_tracker_visible"],
                        embedding=None,
                        embedding_quality=0.0,
                    )
                )

        parsed.sort(key=lambda item: item.track_id)
        if not reason_codes:
            reason_codes.append("ok")

        return _ParsedUltralyticsResult(
            visible_tracks=parsed,
            raw_tracks_count=raw_tracks_count,
            processed_detections=processed_detections,
            reason_codes=self._unique_values(reason_codes),
            warnings=self._unique_values(warnings),
        )

    def _extract_track_id(self, *, boxes: Any, index: int) -> int | None:
        ids = getattr(boxes, "id", None)
        track_id = self._scalar_int(ids, index=index)
        if track_id is None or track_id < 0:
            return None
        return int(track_id)

    def _extract_bbox(self, *, boxes: Any, index: int) -> BBox | None:
        xyxy = getattr(boxes, "xyxy", None)
        values = self._row_values(xyxy, index=index)
        if values is None or len(values) < 4:
            return None
        return BBox(x1=int(round(values[0])), y1=int(round(values[1])), x2=int(round(values[2])), y2=int(round(values[3])))

    def _extract_confidence(self, *, boxes: Any, index: int) -> float:
        conf = getattr(boxes, "conf", None)
        value = self._scalar_float(conf, index=index)
        return self._clip01(value if value is not None else 0.0)

    def _extract_class_id(self, *, boxes: Any, index: int) -> int | None:
        cls = getattr(boxes, "cls", None)
        class_id = self._scalar_int(cls, index=index)
        if class_id is None or class_id < 0:
            return None
        return int(class_id)

    def _normalize_bbox(self, *, bbox: BBox, frame_shape: tuple[int, ...]) -> BBox | None:
        if len(frame_shape) < 2:
            return None
        height = self._safe_int(frame_shape[0], 0)
        width = self._safe_int(frame_shape[1], 0)
        if width <= 0 or height <= 0:
            return None

        clipped = BBox(
            x1=max(0, min(width, int(bbox.x1))),
            y1=max(0, min(height, int(bbox.y1))),
            x2=max(0, min(width, int(bbox.x2))),
            y2=max(0, min(height, int(bbox.y2))),
        )
        if clipped.x2 <= clipped.x1 or clipped.y2 <= clipped.y1:
            return None
        return clipped

    # ========================================================
    # Lifecycle
    # ========================================================

    def _update_track_lifecycle(self, *, visible_track_ids: set[int]) -> tuple[list[int], list[int]]:
        max_age = max(1, self._safe_int(getattr(self._settings, "tracker_max_age_frames", 20), 20))
        known_track_ids = set(self._track_hits_by_id.keys()) | set(self._last_visible_track_ids)
        current_lost_ids = known_track_ids - set(visible_track_ids)

        for track_id in visible_track_ids:
            self._lost_age_by_id.pop(track_id, None)

        for track_id in current_lost_ids:
            self._lost_age_by_id[track_id] = self._lost_age_by_id.get(track_id, 0) + 1

        removed_track_ids: list[int] = []
        for track_id, lost_age in list(self._lost_age_by_id.items()):
            if lost_age > max_age:
                removed_track_ids.append(track_id)
                self._lost_age_by_id.pop(track_id, None)
                self._track_hits_by_id.pop(track_id, None)
                self._track_age_by_id.pop(track_id, None)

        removed_set = set(removed_track_ids)
        lost_track_ids = sorted(track_id for track_id in self._lost_age_by_id if track_id not in removed_set)
        self._last_visible_track_ids = set(visible_track_ids)
        return lost_track_ids, sorted(removed_track_ids)

    # ========================================================
    # Diagnostics / failure
    # ========================================================

    def _build_diagnostics(self, *, processed_detections: int, visible_tracks_count: int, raw_tracks_count: int, reason_codes: list[str], warnings: list[str]) -> TrackingDiagnostics:
        return TrackingDiagnostics(
            backend_name=self._backend_type.value,
            model_path=self._model_path,
            tracker_config_path=self._tracker_config_path,
            processed_detections=max(0, int(processed_detections)),
            visible_tracks_count=max(0, int(visible_tracks_count)),
            raw_tracks_count=max(0, int(raw_tracks_count)),
            reason_codes=self._unique_values(reason_codes),
            warnings=self._unique_values(warnings),
        )

    def _fail_result(self, *, observed_at: datetime, reason: str) -> TrackingFrameResult:
        diagnostics = self._build_diagnostics(
            processed_detections=0,
            visible_tracks_count=0,
            raw_tracks_count=0,
            reason_codes=[reason],
            warnings=[reason],
        )
        self._last_diagnostics = diagnostics
        return TrackingFrameResult(
            observed_at=observed_at,
            frame_index=self._frame_index,
            visible_tracks=[],
            lost_track_ids=[],
            removed_track_ids=[],
            backend=self._backend_type,
            diagnostics=diagnostics,
        )

    # ========================================================
    # Settings helpers
    # ========================================================

    def _resolve_model_path(self) -> str | None:
        value = str(getattr(self._settings, "yolo_model_path", "") or getattr(self._settings, "person_model_path", "") or "").strip()
        return value or None

    def _resolve_tracker_config_path(self) -> str | None:
        value = str(getattr(self._settings, "person_tracking_tracker_config", "botsort.yaml") or "").strip()
        if not value:
            return None
        if value in _BUILTIN_ULTRALYTICS_TRACKERS:
            return value
        path = Path(value).expanduser()
        if path.is_absolute():
            return str(path)
        if path.exists():
            return str(path.resolve())
        return value

    def _resolve_device(self) -> str:
        return str(getattr(self._settings, "person_tracking_device", "cpu") or "cpu").strip() or "cpu"

    def _tracking_min_confidence(self) -> float:
        return self._clip01(self._safe_float(getattr(self._settings, "person_tracking_min_confidence", 0.35), 0.35))

    def _person_class_id(self) -> int:
        return max(0, self._safe_int(getattr(self._settings, "person_tracking_person_class_id", 0), 0))

    # ========================================================
    # Low-level extraction helpers
    # ========================================================

    @staticmethod
    def _boxes_count(boxes: Any) -> int:
        xyxy = getattr(boxes, "xyxy", None)
        try:
            return int(len(xyxy))
        except Exception:
            pass
        try:
            return int(len(boxes))
        except Exception:
            return 0

    @staticmethod
    def _row_values(value: Any, *, index: int) -> list[float] | None:
        if value is None:
            return None
        try:
            row = value[index]
            if hasattr(row, "detach"):
                row = row.detach()
            if hasattr(row, "cpu"):
                row = row.cpu()
            if hasattr(row, "numpy"):
                row = row.numpy()
            array = np.asarray(row, dtype=float).reshape(-1)
            return [float(item) for item in array.tolist()]
        except Exception:
            return None

    @classmethod
    def _scalar_int(cls, value: Any, *, index: int) -> int | None:
        scalar = cls._scalar_float(value, index=index)
        if scalar is None:
            return None
        try:
            return int(round(float(scalar)))
        except Exception:
            return None

    @staticmethod
    def _scalar_float(value: Any, *, index: int) -> float | None:
        if value is None:
            return None
        try:
            item = value[index]
            if hasattr(item, "detach"):
                item = item.detach()
            if hasattr(item, "cpu"):
                item = item.cpu()
            if hasattr(item, "numpy"):
                item = item.numpy()
            array = np.asarray(item, dtype=float).reshape(-1)
            if array.size < 1:
                return None
            return float(array[0])
        except Exception:
            return None

    @staticmethod
    def _safe_float(value: object, default: float) -> float:
        try:
            return float(value)
        except Exception:
            return float(default)

    @staticmethod
    def _safe_int(value: object, default: int) -> int:
        try:
            return int(value)
        except Exception:
            return int(default)

    @staticmethod
    def _clip01(value: object) -> float:
        try:
            number = float(value)
        except Exception:
            number = 0.0
        return max(0.0, min(1.0, number))

    @staticmethod
    def _unique_values(values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for raw_value in values:
            value = str(raw_value or "").strip()
            if not value or value in seen:
                continue
            seen.add(value)
            result.append(value)
        return result

    @staticmethod
    def _is_probable_url(value: str) -> bool:
        normalized = str(value or "").strip().lower()
        return normalized.startswith(("http://", "https://", "rtsp://", "rtsps://", "udp://", "tcp://"))
