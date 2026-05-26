# ============================================================
# File: vision/app/pipeline/head_detector.py
# Purpose:
# - Head detection contract for the production runtime chain.
# - Separates person detection/tracking from head localization.
# - Provides disabled/mock/legacy-geometry implementations without changing
#   incident logic and without forcing the headwear classifier to run.
# - Default behavior is conservative: no real head detector means
#   head_not_detected and non-actionable observation.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Protocol, Sequence

import cv2
import numpy as np

try:
    import onnxruntime as ort
except Exception:  # pragma: no cover
    ort = None  # type: ignore

from app.models.schemas import BBox, QualityAssessment
from app.pipeline.headwear_crop_geometry import build_headwear_crop_box
from app.pipeline.human_observation import TrackObservation


class HeadDetectorMode(str, Enum):
    DISABLED = "disabled"
    MOCK = "mock"
    LEGACY_GEOMETRY = "legacy_geometry"
    ONNX = "onnx"
    ULTRALYTICS = "ultralytics"


class HeadDetectorScope(str, Enum):
    PERSON_ROI = "person_roi"
    FULL_FRAME = "full_frame"
    HYBRID = "hybrid"


class HeadObservationStatus(str, Enum):
    ACTIONABLE = "head_visible"
    HEAD_NOT_DETECTED = "head_not_detected"
    HEAD_OCCLUDED = "head_occluded"
    HEAD_CROPPED_BY_BORDER = "head_cropped_by_border"
    HEAD_UNUSABLE = "head_unusable"
    AMBIGUOUS_HEAD = "ambiguous_head"
    DETECTOR_DISABLED = "detector_disabled"
    LEGACY_GEOMETRY_FALLBACK = "legacy_geometry_fallback"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class HeadDetectionCandidate:
    """One raw head detector candidate in full-frame coordinates."""

    head_bbox: BBox
    confidence: float
    class_id: int | None = None
    class_name: str | None = None
    source_model: str = "unknown"
    reason_codes: list[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return bool(self.head_bbox and self.head_bbox.is_valid and self.confidence >= 0.0)


@dataclass(frozen=True, slots=True)
class HeadObservation:
    """Normalized head observation used between tracking and classifier.

    This DTO intentionally keeps person bbox and head bbox separate. A person
    bbox can be present while head_bbox is None. In that case the headwear
    classifier must not be called by runtime integration code.
    """

    camera_id: str
    frame_index: int
    timestamp_seconds: float

    person_bbox: BBox | None
    head_bbox: BBox | None

    track_id: int | str | None
    episode_id: str | None

    status: HeadObservationStatus
    confidence: float
    quality: dict[str, Any]
    reason_codes: list[str]
    source_model: str
    is_actionable: bool

    observed_at: datetime | None = None
    detection_scope: HeadDetectorScope = HeadDetectorScope.PERSON_ROI
    candidate_count: int = 0
    selected_candidate_index: int | None = None
    association_score: float = 0.0
    crop_source: str = "none"
    legacy_geometry_used: bool = False

    @property
    def has_head_bbox(self) -> bool:
        return bool(self.head_bbox is not None and self.head_bbox.is_valid)

    @property
    def classifier_may_run(self) -> bool:
        return bool(
            self.is_actionable
            and self.status == HeadObservationStatus.ACTIONABLE
            and self.has_head_bbox
        )

    @property
    def is_not_detected(self) -> bool:
        return self.status in {
            HeadObservationStatus.HEAD_NOT_DETECTED,
            HeadObservationStatus.DETECTOR_DISABLED,
        }

    @classmethod
    def not_detected(
        cls,
        *,
        camera_id: str,
        frame_index: int,
        timestamp_seconds: float,
        person_bbox: BBox | None,
        track_id: int | str | None,
        episode_id: str | None,
        observed_at: datetime | None,
        source_model: str,
        reason: str = "head_not_detected",
        detection_scope: HeadDetectorScope = HeadDetectorScope.PERSON_ROI,
        candidate_count: int = 0,
    ) -> HeadObservation:
        return cls(
            camera_id=str(camera_id),
            frame_index=int(frame_index),
            timestamp_seconds=float(timestamp_seconds),
            person_bbox=person_bbox,
            head_bbox=None,
            track_id=track_id,
            episode_id=episode_id,
            status=HeadObservationStatus.HEAD_NOT_DETECTED,
            confidence=0.0,
            quality={"head_detected": False},
            reason_codes=[reason],
            source_model=str(source_model),
            is_actionable=False,
            observed_at=observed_at,
            detection_scope=detection_scope,
            candidate_count=max(0, int(candidate_count)),
            selected_candidate_index=None,
            association_score=0.0,
            crop_source="none",
            legacy_geometry_used=False,
        )

    @classmethod
    def disabled(
        cls,
        *,
        camera_id: str,
        frame_index: int,
        timestamp_seconds: float,
        person_bbox: BBox | None,
        track_id: int | str | None,
        episode_id: str | None,
        observed_at: datetime | None,
        source_model: str = "head_detector_disabled",
    ) -> HeadObservation:
        return cls(
            camera_id=str(camera_id),
            frame_index=int(frame_index),
            timestamp_seconds=float(timestamp_seconds),
            person_bbox=person_bbox,
            head_bbox=None,
            track_id=track_id,
            episode_id=episode_id,
            status=HeadObservationStatus.HEAD_NOT_DETECTED,
            confidence=0.0,
            quality={"head_detected": False, "detector_enabled": False},
            reason_codes=["head_detector_disabled", "classifier_not_scheduled_without_head"],
            source_model=str(source_model),
            is_actionable=False,
            observed_at=observed_at,
            detection_scope=HeadDetectorScope.PERSON_ROI,
            candidate_count=0,
            selected_candidate_index=None,
            association_score=0.0,
            crop_source="none",
            legacy_geometry_used=False,
        )


@dataclass(frozen=True, slots=True)
class HeadDetectorResult:
    """Frame-level detector output before/after person association."""

    camera_id: str
    frame_index: int
    timestamp_seconds: float
    observed_at: datetime | None
    scope: HeadDetectorScope
    source_model: str
    candidates: list[HeadDetectionCandidate]
    observations: list[HeadObservation]
    reason_codes: list[str] = field(default_factory=list)

    @property
    def actionable_observations(self) -> list[HeadObservation]:
        return [item for item in self.observations if item.classifier_may_run]


@dataclass(frozen=True, slots=True)
class HeadDetectorDiagnostics:
    mode: HeadDetectorMode
    ready: bool
    source_model: str
    failure_reason: str | None = None
    reason_codes: list[str] = field(default_factory=list)


class HeadDetector(Protocol):
    ready: bool
    failure_reason: str | None
    mode: HeadDetectorMode
    source_model: str

    def warmup(self) -> tuple[bool, str | None]:
        ...

    def detect_for_observation(
        self,
        *,
        frame: np.ndarray,
        observation: TrackObservation,
        timestamp_seconds: float,
    ) -> HeadObservation:
        ...

    def detect_for_frame(
        self,
        *,
        frame: np.ndarray,
        camera_id: str,
        frame_index: int,
        timestamp_seconds: float,
        observed_at: datetime | None = None,
        person_observations: Sequence[TrackObservation] | None = None,
    ) -> HeadDetectorResult:
        ...


class BaseHeadDetector:
    """Base implementation shared by disabled/mock/fallback detectors."""

    def __init__(self, *, mode: HeadDetectorMode, source_model: str, ready: bool = True) -> None:
        self.mode = mode
        self.source_model = source_model
        self.ready = bool(ready)
        self.failure_reason: str | None = None

    def warmup(self) -> tuple[bool, str | None]:
        return self.ready, self.failure_reason

    def detect_for_frame(
        self,
        *,
        frame: np.ndarray,
        camera_id: str,
        frame_index: int,
        timestamp_seconds: float,
        observed_at: datetime | None = None,
        person_observations: Sequence[TrackObservation] | None = None,
    ) -> HeadDetectorResult:
        observations: list[HeadObservation] = []
        for observation in person_observations or []:
            observations.append(
                self.detect_for_observation(
                    frame=frame,
                    observation=observation,
                    timestamp_seconds=timestamp_seconds,
                )
            )

        return HeadDetectorResult(
            camera_id=str(camera_id),
            frame_index=int(frame_index),
            timestamp_seconds=float(timestamp_seconds),
            observed_at=observed_at,
            scope=HeadDetectorScope.PERSON_ROI,
            source_model=self.source_model,
            candidates=[],
            observations=observations,
            reason_codes=[],
        )

    @staticmethod
    def _observation_time_seconds(
        *,
        timestamp_seconds: float | None,
        observation: TrackObservation,
    ) -> float:
        if timestamp_seconds is not None:
            return _safe_float(timestamp_seconds, default=0.0)
        return 0.0

    @staticmethod
    def _camera_id_from_observation(observation: TrackObservation) -> str:
        return str(getattr(observation, "camera_id", "") or "unknown_camera")

    @staticmethod
    def _track_id_from_observation(observation: TrackObservation) -> int | str | None:
        value = getattr(observation, "track_id", None)
        if value is not None:
            return value
        return getattr(observation, "source_track_id", None)

    @staticmethod
    def _episode_id_from_observation(observation: TrackObservation) -> str | None:
        value = getattr(observation, "track_episode_id", None)
        return str(value) if value else None


class DisabledHeadDetector(BaseHeadDetector):
    """Conservative detector used when no real head detector is configured."""

    def __init__(self) -> None:
        super().__init__(
            mode=HeadDetectorMode.DISABLED,
            source_model="head_detector_disabled",
            ready=True,
        )

    def detect_for_observation(
        self,
        *,
        frame: np.ndarray,
        observation: TrackObservation,
        timestamp_seconds: float,
    ) -> HeadObservation:
        return HeadObservation.disabled(
            camera_id=self._camera_id_from_observation(observation),
            frame_index=int(getattr(observation, "frame_index", 0)),
            timestamp_seconds=self._observation_time_seconds(
                timestamp_seconds=timestamp_seconds,
                observation=observation,
            ),
            person_bbox=getattr(observation, "bbox", None),
            track_id=self._track_id_from_observation(observation),
            episode_id=self._episode_id_from_observation(observation),
            observed_at=getattr(observation, "observed_at", None),
            source_model=self.source_model,
        )


class MockHeadDetector(BaseHeadDetector):
    """Test double for the future head detector.

    By default it returns head_not_detected. Tests can pass scripted candidates
    by track_id or by track_episode_id to validate association/classifier guards
    without loading real models.
    """

    def __init__(
        self,
        *,
        scripted_by_track_id: dict[int | str, HeadDetectionCandidate | list[HeadDetectionCandidate]] | None = None,
        scripted_by_episode_id: dict[str, HeadDetectionCandidate | list[HeadDetectionCandidate]] | None = None,
        source_model: str = "mock_head_detector",
    ) -> None:
        super().__init__(
            mode=HeadDetectorMode.MOCK,
            source_model=source_model,
            ready=True,
        )
        self._scripted_by_track_id = dict(scripted_by_track_id or {})
        self._scripted_by_episode_id = dict(scripted_by_episode_id or {})

    def detect_for_observation(
        self,
        *,
        frame: np.ndarray,
        observation: TrackObservation,
        timestamp_seconds: float,
    ) -> HeadObservation:
        candidates = self._candidates_for_observation(observation)
        if not candidates:
            return HeadObservation.not_detected(
                camera_id=self._camera_id_from_observation(observation),
                frame_index=int(getattr(observation, "frame_index", 0)),
                timestamp_seconds=self._observation_time_seconds(
                    timestamp_seconds=timestamp_seconds,
                    observation=observation,
                ),
                person_bbox=getattr(observation, "bbox", None),
                track_id=self._track_id_from_observation(observation),
                episode_id=self._episode_id_from_observation(observation),
                observed_at=getattr(observation, "observed_at", None),
                source_model=self.source_model,
                reason="mock_head_not_detected",
                candidate_count=0,
            )

        valid_candidates = [candidate for candidate in candidates if candidate.is_valid]
        if not valid_candidates:
            return self._unusable(
                observation=observation,
                timestamp_seconds=timestamp_seconds,
                reason_codes=["mock_head_candidates_invalid"],
                candidate_count=len(candidates),
            )

        if len(valid_candidates) > 1:
            return self._ambiguous(
                observation=observation,
                timestamp_seconds=timestamp_seconds,
                candidate_count=len(valid_candidates),
            )

        selected = valid_candidates[0]
        frame_height, frame_width = _frame_size(frame)
        head_bbox = selected.head_bbox.clamp(frame_width=frame_width, frame_height=frame_height)
        quality_status, reason_codes = _assess_basic_head_bbox_quality(
            frame_width=frame_width,
            frame_height=frame_height,
            head_bbox=head_bbox,
            person_bbox=getattr(observation, "bbox", None),
        )
        is_actionable = quality_status == HeadObservationStatus.ACTIONABLE

        return HeadObservation(
            camera_id=self._camera_id_from_observation(observation),
            frame_index=int(getattr(observation, "frame_index", 0)),
            timestamp_seconds=self._observation_time_seconds(
                timestamp_seconds=timestamp_seconds,
                observation=observation,
            ),
            person_bbox=getattr(observation, "bbox", None),
            head_bbox=head_bbox if head_bbox.is_valid else None,
            track_id=self._track_id_from_observation(observation),
            episode_id=self._episode_id_from_observation(observation),
            status=quality_status,
            confidence=_clip01(selected.confidence),
            quality={
                "head_detected": bool(head_bbox.is_valid),
                "head_bbox_area": int(head_bbox.area),
                "basic_quality_status": quality_status.value,
            },
            reason_codes=reason_codes or list(selected.reason_codes),
            source_model=selected.source_model or self.source_model,
            is_actionable=is_actionable,
            observed_at=getattr(observation, "observed_at", None),
            detection_scope=HeadDetectorScope.PERSON_ROI,
            candidate_count=len(valid_candidates),
            selected_candidate_index=0,
            association_score=1.0,
            crop_source="head_detector",
            legacy_geometry_used=False,
        )

    def _candidates_for_observation(self, observation: TrackObservation) -> list[HeadDetectionCandidate]:
        track_id = self._track_id_from_observation(observation)
        episode_id = self._episode_id_from_observation(observation)

        raw: HeadDetectionCandidate | list[HeadDetectionCandidate] | None = None
        if episode_id is not None and episode_id in self._scripted_by_episode_id:
            raw = self._scripted_by_episode_id[episode_id]
        elif track_id is not None and track_id in self._scripted_by_track_id:
            raw = self._scripted_by_track_id[track_id]

        if raw is None:
            return []
        if isinstance(raw, HeadDetectionCandidate):
            return [raw]
        return list(raw)

    def _unusable(
        self,
        *,
        observation: TrackObservation,
        timestamp_seconds: float,
        reason_codes: list[str],
        candidate_count: int,
    ) -> HeadObservation:
        return HeadObservation(
            camera_id=self._camera_id_from_observation(observation),
            frame_index=int(getattr(observation, "frame_index", 0)),
            timestamp_seconds=self._observation_time_seconds(
                timestamp_seconds=timestamp_seconds,
                observation=observation,
            ),
            person_bbox=getattr(observation, "bbox", None),
            head_bbox=None,
            track_id=self._track_id_from_observation(observation),
            episode_id=self._episode_id_from_observation(observation),
            status=HeadObservationStatus.HEAD_UNUSABLE,
            confidence=0.0,
            quality={"head_detected": False},
            reason_codes=reason_codes,
            source_model=self.source_model,
            is_actionable=False,
            observed_at=getattr(observation, "observed_at", None),
            detection_scope=HeadDetectorScope.PERSON_ROI,
            candidate_count=max(0, int(candidate_count)),
            selected_candidate_index=None,
            association_score=0.0,
            crop_source="none",
            legacy_geometry_used=False,
        )

    def _ambiguous(
        self,
        *,
        observation: TrackObservation,
        timestamp_seconds: float,
        candidate_count: int,
    ) -> HeadObservation:
        return HeadObservation(
            camera_id=self._camera_id_from_observation(observation),
            frame_index=int(getattr(observation, "frame_index", 0)),
            timestamp_seconds=self._observation_time_seconds(
                timestamp_seconds=timestamp_seconds,
                observation=observation,
            ),
            person_bbox=getattr(observation, "bbox", None),
            head_bbox=None,
            track_id=self._track_id_from_observation(observation),
            episode_id=self._episode_id_from_observation(observation),
            status=HeadObservationStatus.AMBIGUOUS_HEAD,
            confidence=0.0,
            quality={"head_detected": True, "ambiguous": True},
            reason_codes=["multiple_head_candidates_for_track", "classifier_not_scheduled_ambiguous_head"],
            source_model=self.source_model,
            is_actionable=False,
            observed_at=getattr(observation, "observed_at", None),
            detection_scope=HeadDetectorScope.PERSON_ROI,
            candidate_count=max(0, int(candidate_count)),
            selected_candidate_index=None,
            association_score=0.0,
            crop_source="none",
            legacy_geometry_used=False,
        )


class LegacyGeometryHeadDetector(BaseHeadDetector):
    """Temporary migration adapter around geometric head crop estimation.

    This is intentionally not enabled by default. It exists only to keep an
    explicit, auditable fallback during the migration from person-crop based
    classifier input to real head detector based input.
    """

    def __init__(self, *, actionable: bool = False) -> None:
        super().__init__(
            mode=HeadDetectorMode.LEGACY_GEOMETRY,
            source_model="legacy_geometry_head_fallback",
            ready=True,
        )
        self._actionable = bool(actionable)

    def detect_for_observation(
        self,
        *,
        frame: np.ndarray,
        observation: TrackObservation,
        timestamp_seconds: float,
    ) -> HeadObservation:
        if not _frame_is_valid(frame):
            return self._legacy_rejected(
                observation=observation,
                timestamp_seconds=timestamp_seconds,
                reason_codes=["frame_unavailable", "legacy_geometry_not_actionable"],
            )

        quality = getattr(observation, "quality", None)
        if not _quality_allows_head_attempt(quality=quality, observation=observation):
            return self._legacy_rejected(
                observation=observation,
                timestamp_seconds=timestamp_seconds,
                reason_codes=["legacy_geometry_quality_rejected", "classifier_not_scheduled_without_real_head"],
            )

        crop_box = build_headwear_crop_box(
            frame_shape=frame.shape,
            person_bbox=getattr(observation, "bbox", None),
        )
        if crop_box is None:
            return self._legacy_rejected(
                observation=observation,
                timestamp_seconds=timestamp_seconds,
                reason_codes=["legacy_geometry_head_crop_unavailable", "classifier_not_scheduled_without_real_head"],
            )

        frame_height, frame_width = _frame_size(frame)
        head_bbox = BBox(x1=crop_box.x1, y1=crop_box.y1, x2=crop_box.x2, y2=crop_box.y2).clamp(
            frame_width=frame_width,
            frame_height=frame_height,
        )
        quality_status, quality_reason_codes = _assess_basic_head_bbox_quality(
            frame_width=frame_width,
            frame_height=frame_height,
            head_bbox=head_bbox,
            person_bbox=getattr(observation, "bbox", None),
        )

        actionable = bool(self._actionable and quality_status == HeadObservationStatus.ACTIONABLE)
        status = HeadObservationStatus.LEGACY_GEOMETRY_FALLBACK
        reason_codes = [
            "legacy_geometry_head_bbox",
            "not_real_head_detector",
        ]
        reason_codes.extend(quality_reason_codes)
        if not actionable:
            reason_codes.append("classifier_not_scheduled_legacy_geometry")

        return HeadObservation(
            camera_id=self._camera_id_from_observation(observation),
            frame_index=int(getattr(observation, "frame_index", 0)),
            timestamp_seconds=self._observation_time_seconds(
                timestamp_seconds=timestamp_seconds,
                observation=observation,
            ),
            person_bbox=getattr(observation, "bbox", None),
            head_bbox=head_bbox if head_bbox.is_valid else None,
            track_id=self._track_id_from_observation(observation),
            episode_id=self._episode_id_from_observation(observation),
            status=status if not actionable else HeadObservationStatus.ACTIONABLE,
            confidence=0.0,
            quality={
                "head_detected": bool(head_bbox.is_valid),
                "legacy_geometry": True,
                "basic_quality_status": quality_status.value,
                "actionable_by_flag": actionable,
            },
            reason_codes=_unique(reason_codes),
            source_model=self.source_model,
            is_actionable=actionable,
            observed_at=getattr(observation, "observed_at", None),
            detection_scope=HeadDetectorScope.PERSON_ROI,
            candidate_count=1 if head_bbox.is_valid else 0,
            selected_candidate_index=0 if head_bbox.is_valid else None,
            association_score=0.0,
            crop_source="legacy_geometry",
            legacy_geometry_used=True,
        )

    def _legacy_rejected(
        self,
        *,
        observation: TrackObservation,
        timestamp_seconds: float,
        reason_codes: list[str],
    ) -> HeadObservation:
        return HeadObservation(
            camera_id=self._camera_id_from_observation(observation),
            frame_index=int(getattr(observation, "frame_index", 0)),
            timestamp_seconds=self._observation_time_seconds(
                timestamp_seconds=timestamp_seconds,
                observation=observation,
            ),
            person_bbox=getattr(observation, "bbox", None),
            head_bbox=None,
            track_id=self._track_id_from_observation(observation),
            episode_id=self._episode_id_from_observation(observation),
            status=HeadObservationStatus.HEAD_NOT_DETECTED,
            confidence=0.0,
            quality={"head_detected": False, "legacy_geometry": True},
            reason_codes=_unique(reason_codes),
            source_model=self.source_model,
            is_actionable=False,
            observed_at=getattr(observation, "observed_at", None),
            detection_scope=HeadDetectorScope.PERSON_ROI,
            candidate_count=0,
            selected_candidate_index=None,
            association_score=0.0,
            crop_source="none",
            legacy_geometry_used=True,
        )



class OnnxHeadDetector(BaseHeadDetector):
    """ONNX head detector adapter.

    Expected model output is a YOLO-like tensor with rows shaped as either:
    [cx, cy, w, h, objectness, class_scores...] or [x1, y1, x2, y2, score].
    Coordinates are mapped back to full-frame coordinates. If the model has a
    different output layout, the adapter fails closed: no actionable head, no
    classifier call.
    """

    def __init__(self, settings: Any) -> None:
        super().__init__(mode=HeadDetectorMode.ONNX, source_model="onnx_head_detector", ready=False)
        self._settings = settings
        self._model_path = str(getattr(settings, "head_detector_model_path", "") or "").strip()
        self._conf_threshold = _clip01(getattr(settings, "head_detector_conf_threshold", 0.45))
        self._iou_threshold = _clip01(getattr(settings, "head_detector_iou_threshold", 0.45))
        self._input_size = max(16, int(getattr(settings, "head_detector_input_size", 640) or 640))
        self._scope = _scope_from_settings(getattr(settings, "head_detector_run_scope", "person_roi"))
        self._box_format = str(getattr(settings, "head_detector_box_format", "cxcywh") or "cxcywh").strip().lower()
        self._has_objectness = str(getattr(settings, "head_detector_has_objectness", "auto") or "auto").strip().lower()
        self._session: Any | None = None
        self._input_name: str | None = None
        self._init_session()

    def _init_session(self) -> None:
        if not self._model_path:
            self.failure_reason = "HEAD_DETECTOR_MODEL_PATH is empty"
            return
        path = Path(self._model_path).expanduser()
        if not path.is_file():
            self.failure_reason = f"HEAD_DETECTOR_MODEL_PATH does not exist: {path}"
            return
        if ort is None:
            self.failure_reason = "onnxruntime is not installed"
            return
        try:
            self._session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            inputs = self._session.get_inputs()
            if not inputs:
                self.failure_reason = "head detector ONNX has no inputs"
                self._session = None
                return
            self._input_name = inputs[0].name
            self.source_model = str(path)
            self.ready = True
        except Exception as error:
            self.failure_reason = f"failed to initialize head detector ONNX: {type(error).__name__}: {error}"
            self._session = None
            self._input_name = None

    def warmup(self) -> tuple[bool, str | None]:
        if not self.ready:
            return False, self.failure_reason or "head detector is not ready"
        try:
            dummy = np.zeros((max(16, self._input_size), max(16, self._input_size), 3), dtype=np.uint8)
            self._run_on_crop(dummy)
            return True, None
        except Exception as error:
            return False, f"head detector warmup failed: {type(error).__name__}: {error}"

    def detect_for_observation(
        self,
        *,
        frame: np.ndarray,
        observation: TrackObservation,
        timestamp_seconds: float,
    ) -> HeadObservation:
        if not _frame_is_valid(frame):
            return HeadObservation.not_detected(
                camera_id=self._camera_id_from_observation(observation),
                frame_index=int(getattr(observation, "frame_index", 0)),
                timestamp_seconds=self._observation_time_seconds(timestamp_seconds=timestamp_seconds, observation=observation),
                person_bbox=getattr(observation, "bbox", None),
                track_id=self._track_id_from_observation(observation),
                episode_id=self._episode_id_from_observation(observation),
                observed_at=getattr(observation, "observed_at", None),
                source_model=self.source_model,
                reason="frame_unavailable",
                detection_scope=self._scope,
            )
        if not self.ready or self._session is None or self._input_name is None:
            return HeadObservation.not_detected(
                camera_id=self._camera_id_from_observation(observation),
                frame_index=int(getattr(observation, "frame_index", 0)),
                timestamp_seconds=self._observation_time_seconds(timestamp_seconds=timestamp_seconds, observation=observation),
                person_bbox=getattr(observation, "bbox", None),
                track_id=self._track_id_from_observation(observation),
                episode_id=self._episode_id_from_observation(observation),
                observed_at=getattr(observation, "observed_at", None),
                source_model=self.source_model,
                reason="head_detector_not_ready",
                detection_scope=self._scope,
            )

        candidates = self._detect_candidates_for_observation(frame=frame, observation=observation)
        from app.pipeline.head_person_association import build_head_person_associator

        association = build_head_person_associator(self._settings).associate_for_observation(
            camera_id=self._camera_id_from_observation(observation),
            frame_index=int(getattr(observation, "frame_index", 0)),
            timestamp_seconds=self._observation_time_seconds(timestamp_seconds=timestamp_seconds, observation=observation),
            observation=observation,
            candidates=candidates,
            frame_shape=frame.shape,
            source_model=self.source_model,
            scope=self._scope,
        )
        return association.observation

    def detect_for_frame(
        self,
        *,
        frame: np.ndarray,
        camera_id: str,
        frame_index: int,
        timestamp_seconds: float,
        observed_at: datetime | None = None,
        person_observations: Sequence[TrackObservation] | None = None,
    ) -> HeadDetectorResult:
        observations = [
            self.detect_for_observation(frame=frame, observation=observation, timestamp_seconds=timestamp_seconds)
            for observation in person_observations or []
        ]
        return HeadDetectorResult(
            camera_id=str(camera_id),
            frame_index=int(frame_index),
            timestamp_seconds=float(timestamp_seconds),
            observed_at=observed_at,
            scope=self._scope,
            source_model=self.source_model,
            candidates=[],
            observations=observations,
            reason_codes=[] if self.ready else [self.failure_reason or "head_detector_not_ready"],
        )

    def _detect_candidates_for_observation(self, *, frame: np.ndarray, observation: TrackObservation) -> list[HeadDetectionCandidate]:
        person_bbox = getattr(observation, "bbox", None)
        frame_h, frame_w = _frame_size(frame)
        if self._scope == HeadDetectorScope.FULL_FRAME or person_bbox is None or not person_bbox.is_valid:
            crop = frame
            offset_x = 0
            offset_y = 0
        else:
            clipped = person_bbox.clamp(frame_width=frame_w, frame_height=frame_h)
            if not clipped.is_valid:
                return []
            crop = frame[clipped.y1:clipped.y2, clipped.x1:clipped.x2]
            offset_x = int(clipped.x1)
            offset_y = int(clipped.y1)
        if crop is None or crop.size == 0:
            return []
        raw = self._run_on_crop(crop)
        return self._parse_outputs(raw, crop_shape=crop.shape, offset_x=offset_x, offset_y=offset_y)

    def _run_on_crop(self, crop: np.ndarray) -> list[np.ndarray]:
        if self._session is None or self._input_name is None:
            return []
        resized = cv2.resize(crop, (self._input_size, self._input_size), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        tensor = np.transpose(rgb, (2, 0, 1))[None, ...]
        return list(self._session.run(None, {self._input_name: tensor.astype(np.float32)}))

    def _parse_outputs(self, outputs: Sequence[np.ndarray], *, crop_shape: Sequence[int], offset_x: int, offset_y: int) -> list[HeadDetectionCandidate]:
        if not outputs:
            return []
        rows = np.asarray(outputs[0], dtype=np.float32)
        rows = np.squeeze(rows)
        if rows.ndim == 1:
            rows = rows.reshape(1, -1)
        if rows.ndim == 3:
            rows = rows.reshape(-1, rows.shape[-1])
        if rows.ndim != 2 or rows.shape[1] < 5:
            return []
        crop_h, crop_w = int(crop_shape[0]), int(crop_shape[1])
        scale_x = crop_w / float(max(1, self._input_size))
        scale_y = crop_h / float(max(1, self._input_size))
        candidates: list[HeadDetectionCandidate] = []
        for row in rows:
            score, class_id = self._score_row(row)
            if score < self._conf_threshold:
                continue
            bbox = self._bbox_from_row(row, scale_x=scale_x, scale_y=scale_y, offset_x=offset_x, offset_y=offset_y)
            if bbox is None or not bbox.is_valid:
                continue
            candidates.append(HeadDetectionCandidate(
                head_bbox=bbox,
                confidence=float(score),
                class_id=class_id,
                class_name=self._class_name(class_id),
                source_model=self.source_model,
                reason_codes=[],
            ))
        return _nms_candidates(candidates, iou_threshold=self._iou_threshold)

    def _score_row(self, row: np.ndarray) -> tuple[float, int | None]:
        if row.shape[0] == 5:
            return _clip01(float(row[4])), None
        objectness = 1.0
        scores_start = 4
        if self._has_objectness in {"true", "auto"} and row.shape[0] >= 6:
            objectness = _clip01(float(row[4]))
            scores_start = 5
        class_scores = row[scores_start:]
        if class_scores.size == 0:
            return objectness, None
        class_id = int(np.argmax(class_scores))
        score = objectness * _clip01(float(class_scores[class_id]))
        return float(score), class_id

    def _bbox_from_row(self, row: np.ndarray, *, scale_x: float, scale_y: float, offset_x: int, offset_y: int) -> BBox | None:
        x0, y0, x1_or_w, y1_or_h = [float(v) for v in row[:4]]
        if max(abs(x0), abs(y0), abs(x1_or_w), abs(y1_or_h)) <= 1.5:
            x0 *= self._input_size
            y0 *= self._input_size
            x1_or_w *= self._input_size
            y1_or_h *= self._input_size
        if self._box_format == "xyxy":
            x1, y1, x2, y2 = x0, y0, x1_or_w, y1_or_h
        else:
            cx, cy, w, h = x0, y0, max(0.0, x1_or_w), max(0.0, y1_or_h)
            x1, y1, x2, y2 = cx - w / 2.0, cy - h / 2.0, cx + w / 2.0, cy + h / 2.0
        return BBox(
            x1=int(round(x1 * scale_x)) + offset_x,
            y1=int(round(y1 * scale_y)) + offset_y,
            x2=int(round(x2 * scale_x)) + offset_x,
            y2=int(round(y2 * scale_y)) + offset_y,
        )

    def _class_name(self, class_id: int | None) -> str | None:
        if class_id is None:
            return None
        names = tuple(getattr(self._settings, "head_detector_class_names", ()) or ())
        if 0 <= class_id < len(names):
            return str(names[class_id])
        return str(class_id)

def build_head_detector(settings: Any) -> HeadDetector:
    """Factory used by future runtime wiring.

    Existing Settings may not yet contain new fields. Therefore every new flag
    is read through getattr with safe defaults, so adding this file does not
    require an immediate config migration.
    """

    raw_mode = str(getattr(settings, "head_detector_mode", "") or "").strip().lower()
    if not raw_mode:
        raw_mode = str(getattr(settings, "HEAD_DETECTOR_MODE", "") or "").strip().lower()
    if not raw_mode:
        raw_mode = "disabled"

    allow_legacy = _settings_bool(
        settings,
        attr_name="allow_legacy_geometry_head_fallback",
        env_like_name="ALLOW_LEGACY_GEOMETRY_HEAD_FALLBACK",
        default=False,
    )
    legacy_actionable = _settings_bool(
        settings,
        attr_name="legacy_geometry_head_fallback_actionable",
        env_like_name="LEGACY_GEOMETRY_HEAD_FALLBACK_ACTIONABLE",
        default=False,
    )

    if raw_mode in {"disabled", "off", "none", "false", "0"}:
        return DisabledHeadDetector()

    if raw_mode in {"mock", "test", "stub"}:
        return MockHeadDetector()

    if raw_mode in {"legacy", "legacy_geometry", "geometry", "geometry_fallback"}:
        if not allow_legacy:
            detector = DisabledHeadDetector()
            detector.failure_reason = "legacy geometry head fallback requested but ALLOW_LEGACY_GEOMETRY_HEAD_FALLBACK is false"
            return detector
        return LegacyGeometryHeadDetector(actionable=legacy_actionable)

    if raw_mode in {"onnx", "onnx_detector"}:
        return OnnxHeadDetector(settings)

    detector = DisabledHeadDetector()
    detector.failure_reason = f"unsupported head detector mode: {raw_mode}"
    return detector


def should_schedule_headwear_classifier(head_observation: HeadObservation | None) -> bool:
    """Single guard for future runtime integration."""

    if head_observation is None:
        return False
    return bool(head_observation.classifier_may_run)


def _frame_is_valid(frame: np.ndarray) -> bool:
    return bool(frame is not None and isinstance(frame, np.ndarray) and frame.size > 0 and frame.ndim >= 2)


def _frame_size(frame: np.ndarray) -> tuple[int, int]:
    if not _frame_is_valid(frame):
        return 0, 0
    return int(frame.shape[0]), int(frame.shape[1])


def _quality_allows_head_attempt(*, quality: QualityAssessment | None, observation: TrackObservation) -> bool:
    if quality is None:
        return False
    if not bool(getattr(quality, "is_valid", False)):
        return False
    if bool(getattr(quality, "is_partial_limb_only", False)):
        return False
    if bool(getattr(quality, "is_lower_body_only", False)):
        return False
    if bool(getattr(quality, "is_bent_over", False)):
        return False
    if bool(getattr(quality, "is_interaction_risk", False)):
        return False
    if not bool(getattr(quality, "head_visible", False)):
        return False
    if bool(getattr(observation, "interaction_risk", False)):
        return False
    return True


def _assess_basic_head_bbox_quality(
    *,
    frame_width: int,
    frame_height: int,
    head_bbox: BBox,
    person_bbox: BBox | None,
) -> tuple[HeadObservationStatus, list[str]]:
    reason_codes: list[str] = []
    if frame_width <= 0 or frame_height <= 0:
        return HeadObservationStatus.HEAD_UNUSABLE, ["frame_size_invalid"]
    if head_bbox is None or not head_bbox.is_valid:
        return HeadObservationStatus.HEAD_UNUSABLE, ["head_bbox_invalid"]

    if head_bbox.width < 8 or head_bbox.height < 8:
        return HeadObservationStatus.HEAD_UNUSABLE, ["head_bbox_too_small"]

    touches_border = (
        int(head_bbox.x1) <= 0
        or int(head_bbox.y1) <= 0
        or int(head_bbox.x2) >= int(frame_width)
        or int(head_bbox.y2) >= int(frame_height)
    )
    if touches_border:
        return HeadObservationStatus.HEAD_CROPPED_BY_BORDER, ["head_cropped_by_border"]

    if person_bbox is not None and person_bbox.is_valid:
        if not _bbox_center_inside(inner=head_bbox, outer=person_bbox):
            reason_codes.append("head_center_outside_person_bbox")
        overlap_ratio = _intersection_area(head_bbox, person_bbox) / float(max(1, head_bbox.area))
        if overlap_ratio < 0.50:
            return HeadObservationStatus.HEAD_UNUSABLE, ["head_bbox_not_associated_with_person"]

    return HeadObservationStatus.ACTIONABLE, reason_codes


def _bbox_center_inside(*, inner: BBox, outer: BBox) -> bool:
    cx, cy = inner.center
    return bool(float(outer.x1) <= cx <= float(outer.x2) and float(outer.y1) <= cy <= float(outer.y2))


def _intersection_area(a: BBox, b: BBox) -> int:
    x1 = max(int(a.x1), int(b.x1))
    y1 = max(int(a.y1), int(b.y1))
    x2 = min(int(a.x2), int(b.x2))
    y2 = min(int(a.y2), int(b.y2))
    return max(0, x2 - x1) * max(0, y2 - y1)



def _scope_from_settings(value: Any) -> HeadDetectorScope:
    normalized = str(value or "person_roi").strip().lower()
    if normalized == "full_frame":
        return HeadDetectorScope.FULL_FRAME
    if normalized == "hybrid":
        return HeadDetectorScope.HYBRID
    return HeadDetectorScope.PERSON_ROI


def _nms_candidates(candidates: list[HeadDetectionCandidate], *, iou_threshold: float) -> list[HeadDetectionCandidate]:
    ordered = sorted(candidates, key=lambda item: float(item.confidence), reverse=True)
    kept: list[HeadDetectionCandidate] = []
    for candidate in ordered:
        if all(_bbox_iou(candidate.head_bbox, kept_item.head_bbox) < iou_threshold for kept_item in kept):
            kept.append(candidate)
    return kept


def _bbox_iou(left: BBox, right: BBox) -> float:
    inter = _intersection_area(left, right)
    union = float(max(1, left.area + right.area - inter))
    return inter / union

def _settings_bool(
    settings: Any,
    *,
    attr_name: str,
    env_like_name: str,
    default: bool,
) -> bool:
    if hasattr(settings, attr_name):
        return _to_bool(getattr(settings, attr_name), default=default)
    lower_env_name = env_like_name.lower()
    if hasattr(settings, lower_env_name):
        return _to_bool(getattr(settings, lower_env_name), default=default)
    return bool(default)


def _to_bool(value: Any, *, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return bool(default)
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on", "enabled"}:
        return True
    if normalized in {"0", "false", "no", "n", "off", "disabled"}:
        return False
    return bool(default)


def _safe_float(value: Any, *, default: float) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _clip01(value: Any) -> float:
    try:
        number = float(value)
    except Exception:
        number = 0.0
    return max(0.0, min(1.0, number))


def _unique(values: Sequence[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
