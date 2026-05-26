# ============================================================
# File: vision/app/pipeline/headwear_detector.py
# Purpose:
# - Conservative headwear assessment for one person crop.
# - Supports placeholder, ONNX classifier and ONNX detector modes.
# - Treats weak/contradictory evidence as UNKNOWN.
# - Uses the accepted person bbox/person crop as the production model input.
# - Does not send a narrow geometric head crop to the model.
# - Prevents bad visibility, interaction risk and unusable head zones
#   from becoming false headwear violations.
# - Keeps model class mapping configurable through .env.
# - Saves real headwear model inputs for debugging crop/model mismatch.
# ============================================================

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any

import cv2
import numpy as np

from app.config import Settings
from app.models.schemas import BBox, ComplianceSignal, HeadwearAssessment, QualityAssessment
from app.pipeline.head_detector import HeadObservation, HeadObservationStatus
from app.pipeline.human_observation import HumanObservation, ObservationType

try:
    import onnxruntime as ort
except Exception:  # pragma: no cover
    ort = None  # type: ignore


_HARDHAT_NEGATIVE_LABELS = {
    "no-hardhat",
    "no-hard-hat",
    "no-helmet",
    "without-hardhat",
    "without-hard-hat",
    "without-helmet",
    "no-safety-helmet",
    "no-construction-helmet",
}

_MIN_PERSON_CROP_WIDTH = 24
_MIN_PERSON_CROP_HEIGHT = 48


@dataclass(slots=True)
class _ClassScore:
    label: str
    score: float


@dataclass(slots=True)
class _DetectionScore:
    label: str
    score: float
    bbox: tuple[float, float, float, float]


@dataclass(slots=True)
class _PersonCropBundle:
    bbox: BBox
    crop: np.ndarray


class HeadwearDetector:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.mode = settings.headwear_detector_mode.strip().lower()

        self.ready = False
        self.failure_reason: str | None = None

        self._session: Any | None = None
        self._input_name: str | None = None
        self._input_layout = "nchw"
        self._input_width = int(settings.headwear_input_width)
        self._input_height = int(settings.headwear_input_height)
        self._input_resize_mode = str(getattr(settings, "headwear_input_resize_mode", "letterbox") or "letterbox").strip().lower()
        if self._input_resize_mode not in {"letterbox", "stretch"}:
            self._input_resize_mode = "letterbox"
        self._letterbox_pad_value = max(0, min(255, int(getattr(settings, "headwear_input_letterbox_pad_value", 114))))

        self._class_names = tuple(settings.headwear_class_names)
        self._compliant_labels = self._normalize_label_set(settings.headwear_compliant_labels)
        self._violation_labels = self._normalize_label_set(settings.headwear_violation_labels)
        self._unknown_labels = self._normalize_label_set(settings.headwear_unknown_labels)

        self._debug_enabled = bool(getattr(settings, "headwear_debug_save_crops", False))
        self._debug_base_dir = Path(getattr(settings, "headwear_debug_dir", "./data/debug/headwear")).expanduser()
        self._debug_dir = self._debug_base_dir
        self._debug_max_samples = max(0, int(getattr(settings, "headwear_debug_max_samples", 0)))
        self._debug_every_n = max(1, int(getattr(settings, "headwear_debug_every_n", 1)))
        self._debug_counter = 0
        self._debug_saved = 0
        self._debug_lock = Lock()
        self._debug_csv_path = self._debug_dir / "headwear_debug_log.csv"

        self._init_backend()

    # ========================================================
    # Public API
    # ========================================================

    def start_debug_session(
        self,
        *,
        camera_id: str,
        session_started_at: datetime,
        source_url: str | None = None,
    ) -> None:
        if not self._debug_enabled:
            return

        stamp = session_started_at.strftime("%Y%m%d_%H%M%S") if hasattr(session_started_at, "strftime") else "session"
        source_name = self._safe_filename(Path(str(source_url or "video")).stem or "video")
        camera_name = self._safe_filename(str(camera_id or "camera"))

        with self._debug_lock:
            self._debug_counter = 0
            self._debug_saved = 0
            self._debug_dir = self._debug_base_dir / camera_name / f"{stamp}_{source_name}"
            self._debug_csv_path = self._debug_dir / "headwear_debug_log.csv"


    def warmup(self) -> tuple[bool, str | None]:
        return self._warmup_onnx_session()

    def assess_head_observation(
        self,
        *,
        frame: np.ndarray,
        observation: HumanObservation,
        head_observation: HeadObservation,
    ) -> HeadwearAssessment:
        rejection = self._reject_head_observation_for_headwear(
            frame=frame,
            observation=observation,
            head_observation=head_observation,
        )
        if rejection is not None:
            return rejection
        quality = self._quality_from_head_observation(observation=observation, head_observation=head_observation)
        return self._assess_head_crop_candidate(
            frame=frame,
            observation=observation,
            head_observation=head_observation,
            quality=quality,
        )

    def assess_observation(
        self,
        *,
        frame: np.ndarray,
        observation: HumanObservation,
    ) -> HeadwearAssessment:
        policy = str(getattr(self._settings, "headwear_model_policy", "diagnostic_only") or "diagnostic_only").strip().lower()
        if policy == "production" and not bool(getattr(self._settings, "allow_legacy_geometry_head_fallback", False)):
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="head_detector_required",
                reason_codes=["head_detector_required", "classifier_not_scheduled_without_head"],
                quality_score=getattr(observation, "quality_score", None),
            )
        rejection = self._reject_observation_for_headwear(
            frame=frame,
            observation=observation,
        )
        if rejection is not None:
            return rejection

        quality = self._quality_from_observation(observation)
        return self._assess_crop_candidate(
            frame=frame,
            observation=observation,
            quality=quality,
        )

    def assess(
        self,
        *,
        frame: np.ndarray,
        bbox: BBox,
        quality: QualityAssessment,
    ) -> HeadwearAssessment:
        # Legacy low-level API retained for tests and old debug tools only.
        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0 or frame.ndim < 2:
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="frame_unavailable")
        if bbox is None or bbox.width <= 0 or bbox.height <= 0:
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="invalid_observation_bbox")
        if not quality.is_valid:
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="quality_rejected")
        if not quality.head_visible:
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="head_not_visible")
        if bool(quality.is_low_quality):
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="quality_low_for_headwear")
        if not bool(quality.is_usable_for_headwear):
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="quality_not_usable_for_headwear")
        if bool(getattr(quality, "is_interaction_risk", False)):
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="quality_interaction_risk_headwear_skipped", reason_codes=["interaction_risk"])
        if self.mode == "placeholder":
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="placeholder_mode")
        crop_bundle = self._extract_person_crop_bundle(frame=frame, bbox=bbox)
        if crop_bundle is None:
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="person_crop_unavailable", reason_codes=["person_crop_rejected", "headwear_skipped_bad_crop"])
        self._assert_classifier_input_crop_type("person")
        if self._session is None or self._input_name is None:
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason=self.failure_reason or "onnx_session_unavailable")
        try:
            if self.mode == "onnx_classifier":
                return self._assess_classifier(crop_bundle.crop)
            if self.mode == "onnx_detector":
                return self._assess_detector(crop_bundle.crop)
        except Exception as error:
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason=f"headwear_inference_failed:{type(error).__name__}")
        return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="unknown_headwear_mode")

    def assess_human_observation(
        self,
        *,
        frame: np.ndarray,
        observation: HumanObservation,
    ) -> HeadwearAssessment:
        return self.assess_observation(frame=frame, observation=observation)

    # ========================================================
    # Internal assessment lifecycle
    # ========================================================

    def _warmup_onnx_session(self) -> tuple[bool, str | None]:
        if self.mode == "placeholder":
            return True, None

        if not self.ready:
            return False, self.failure_reason or "headwear detector is not ready"

        try:
            warmup_crop = np.zeros(
                (max(8, self._input_height), max(8, self._input_width), 3),
                dtype=np.uint8,
            )
            self._run_onnx(warmup_crop)
            return True, None
        except Exception as error:
            return False, f"headwear warmup failed: {type(error).__name__}: {error}"

    def _assess_crop_candidate(
        self,
        *,
        frame: np.ndarray,
        observation: HumanObservation,
        quality: QualityAssessment,
    ) -> HeadwearAssessment:
        person_bbox = observation.bbox

        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0 or frame.ndim < 2:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="frame_unavailable",
            )

        if not quality.is_valid:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="quality_rejected",
            )

        if not quality.head_visible:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="head_not_visible",
            )

        if bool(quality.is_low_quality):
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="quality_low_for_headwear",
            )

        if not bool(quality.is_usable_for_headwear):
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="quality_not_usable_for_headwear",
            )

        if bool(getattr(quality, "is_interaction_risk", False)):
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="quality_interaction_risk_headwear_skipped",
                reason_codes=["interaction_risk"],
            )

        if self.mode == "placeholder":
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="placeholder_mode",
            )

        crop_bundle = self._extract_person_crop_bundle(
            frame=frame,
            bbox=person_bbox,
        )
        if crop_bundle is None:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="person_crop_unavailable",
                reason_codes=["person_crop_rejected", "headwear_skipped_bad_crop"],
            )

        self._assert_classifier_input_crop_type("person")

        if self._session is None or self._input_name is None:
            assessment = HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason=self.failure_reason or "onnx_session_unavailable",
            )
            self._save_debug_sample(
                frame=frame,
                person_bbox=person_bbox,
                crop_bbox=crop_bundle.bbox,
                crop=crop_bundle.crop,
                quality=quality,
                assessment=assessment,
                observation=observation,
            )
            return assessment

        try:
            if self.mode == "onnx_classifier":
                assessment = self._assess_classifier(crop_bundle.crop)
                self._save_debug_sample(
                    frame=frame,
                    person_bbox=person_bbox,
                    crop_bbox=crop_bundle.bbox,
                    crop=crop_bundle.crop,
                    quality=quality,
                    assessment=assessment,
                    observation=observation,
                )
                return assessment

            if self.mode == "onnx_detector":
                assessment = self._assess_detector(crop_bundle.crop)
                self._save_debug_sample(
                    frame=frame,
                    person_bbox=person_bbox,
                    crop_bbox=crop_bundle.bbox,
                    crop=crop_bundle.crop,
                    quality=quality,
                    assessment=assessment,
                    observation=observation,
                )
                return assessment

        except Exception as error:
            assessment = HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason=f"headwear_inference_failed:{type(error).__name__}",
            )
            self._save_debug_sample(
                frame=frame,
                person_bbox=person_bbox,
                crop_bbox=crop_bundle.bbox,
                crop=crop_bundle.crop,
                quality=quality,
                assessment=assessment,
                observation=observation,
            )
            return assessment

        assessment = HeadwearAssessment(
            signal=ComplianceSignal.UNKNOWN,
            confidence=0.0,
            reason="unknown_headwear_mode",
        )
        self._save_debug_sample(
            frame=frame,
            person_bbox=person_bbox,
            crop_bbox=crop_bundle.bbox,
            crop=crop_bundle.crop,
            quality=quality,
            assessment=assessment,
            observation=observation,
        )
        return assessment

    def _assess_head_crop_candidate(
        self,
        *,
        frame: np.ndarray,
        observation: HumanObservation,
        head_observation: HeadObservation,
        quality: QualityAssessment,
    ) -> HeadwearAssessment:
        if self.mode == "placeholder":
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="placeholder_mode")
        crop_bundle = self._extract_head_crop_bundle(frame=frame, bbox=head_observation.head_bbox)
        if crop_bundle is None:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="head_crop_unavailable",
                reason_codes=["head_crop_rejected", "headwear_skipped_bad_crop"],
                quality_score=quality.quality_score,
            )
        self._assert_classifier_input_crop_type("head")
        if self._session is None or self._input_name is None:
            assessment = HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason=self.failure_reason or "onnx_session_unavailable")
            self._save_debug_sample(frame=frame, person_bbox=observation.bbox, crop_bbox=crop_bundle.bbox, crop=crop_bundle.crop, quality=quality, assessment=assessment, observation=observation, crop_type="head", head_bbox=head_observation.head_bbox)
            return assessment
        try:
            if self.mode == "onnx_classifier":
                assessment = self._assess_classifier(crop_bundle.crop)
            elif self.mode == "onnx_detector":
                assessment = self._assess_detector(crop_bundle.crop)
            else:
                assessment = HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="unknown_headwear_mode")
        except Exception as error:
            assessment = HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason=f"headwear_inference_failed:{type(error).__name__}")
        self._save_debug_sample(frame=frame, person_bbox=observation.bbox, crop_bbox=crop_bundle.bbox, crop=crop_bundle.crop, quality=quality, assessment=assessment, observation=observation, crop_type="head", head_bbox=head_observation.head_bbox)
        return assessment

    # ========================================================
    # Observation gate
    # ========================================================

    def _reject_head_observation_for_headwear(
        self,
        *,
        frame: np.ndarray,
        observation: HumanObservation,
        head_observation: HeadObservation,
    ) -> HeadwearAssessment | None:
        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0 or frame.ndim < 2:
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="frame_unavailable")
        if head_observation is None:
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="head_observation_missing", reason_codes=["head_observation_missing", "classifier_not_scheduled_without_head"])
        if not bool(head_observation.classifier_may_run):
            status = getattr(head_observation, "status", "head_not_actionable")
            reason = status.value if hasattr(status, "value") else str(status)
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason=reason,
                reason_codes=list(getattr(head_observation, "reason_codes", []) or []) + ["classifier_not_scheduled_without_actionable_head"],
                quality_score=getattr(observation, "quality_score", None),
            )
        if head_observation.head_bbox is None or not head_observation.head_bbox.is_valid:
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="head_crop_bbox_unavailable", reason_codes=["head_crop_rejected", "headwear_skipped_bad_crop"])
        if bool(getattr(observation, "interaction_risk", False)):
            return HeadwearAssessment(signal=ComplianceSignal.UNKNOWN, confidence=0.0, reason="track_interaction_risk_headwear_skipped", reason_codes=["track_interaction_risk"])
        return None

    def _quality_from_head_observation(self, *, observation: HumanObservation, head_observation: HeadObservation) -> QualityAssessment:
        base = self._quality_from_observation(observation)
        actionable = bool(head_observation.classifier_may_run)
        status = getattr(head_observation, "status", HeadObservationStatus.UNKNOWN)
        return QualityAssessment(
            is_valid=actionable,
            quality_score=max(float(getattr(base, "quality_score", 0.0) or 0.0), float(getattr(head_observation, "confidence", 0.0) or 0.0)),
            head_visible=actionable,
            is_cropped=status == HeadObservationStatus.HEAD_CROPPED_BY_BORDER,
            occlusion_ratio=float(getattr(base, "occlusion_ratio", 0.0) or 0.0),
            bbox_area_ratio=float(getattr(base, "bbox_area_ratio", 0.0) or 0.0),
            is_usable_for_tracking=bool(getattr(base, "is_usable_for_tracking", True)),
            is_usable_for_headwear=actionable,
            is_low_quality=not actionable,
            is_truncated=bool(getattr(base, "is_truncated", False)) or status == HeadObservationStatus.HEAD_CROPPED_BY_BORDER,
            is_occluded=bool(getattr(base, "is_occluded", False)) or status == HeadObservationStatus.HEAD_OCCLUDED,
            is_interaction_risk=bool(getattr(base, "is_interaction_risk", False)),
            headwear_context_usable=actionable,
            visibility_state=status.value if hasattr(status, "value") else str(status),
            reasons=list(getattr(base, "reasons", []) or []),
            reason_codes=list(getattr(base, "reason_codes", []) or []) + list(getattr(head_observation, "reason_codes", []) or []),
            is_usable_for_identity=False,
        )

    def _reject_observation_for_headwear(
        self,
        *,
        frame: np.ndarray,
        observation: HumanObservation,
    ) -> HeadwearAssessment | None:
        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0 or frame.ndim < 2:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="frame_unavailable",
            )

        if observation.bbox.width <= 0 or observation.bbox.height <= 0:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="invalid_observation_bbox",
            )

        if bool(getattr(observation, "interaction_risk", False)):
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="track_interaction_risk_headwear_skipped",
                reason_codes=["track_interaction_risk"],
            )

        if observation.observation_type in {
            ObservationType.LOWER_BODY,
            ObservationType.FOOTWEAR,
            ObservationType.UNKNOWN,
        }:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason=f"observation_type_not_usable_for_headwear:{observation.observation_type.value}",
            )

        if not self._observation_has_visible_head(observation):
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="head_not_visible_in_observation",
            )

        if observation.is_low_quality or observation.quality_score < self._headwear_min_quality_score():
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="observation_low_quality_for_headwear",
            )

        if not observation.is_usable_for_headwear:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="observation_not_usable_for_headwear",
            )

        if not bool(getattr(observation, "headwear_context_usable", False)):
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="headwear_context_not_usable",
                reason_codes=["headwear_context_not_usable"],
            )

        clipped_person_bbox = self._clip_bbox_to_frame(frame=frame, bbox=observation.bbox)
        if clipped_person_bbox is None:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="person_crop_bbox_invalid",
                reason_codes=["person_crop_rejected", "headwear_skipped_bad_crop"],
            )

        min_width = max(_MIN_PERSON_CROP_WIDTH, int(getattr(self._settings, "person_box_gate_min_width_px", _MIN_PERSON_CROP_WIDTH)))
        min_height = max(_MIN_PERSON_CROP_HEIGHT, int(getattr(self._settings, "person_box_gate_min_height_px", _MIN_PERSON_CROP_HEIGHT)))
        if clipped_person_bbox.width < min_width or clipped_person_bbox.height < min_height:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="person_crop_too_small",
                reason_codes=["person_crop_rejected", "headwear_skipped_bad_crop"],
            )

        return None

    def _quality_from_observation(self, observation: HumanObservation) -> QualityAssessment:
        return QualityAssessment(
            is_valid=bool(
                observation.is_usable_for_headwear
                and not observation.is_low_quality
                and observation.quality_score >= self._headwear_min_quality_score()
            ),
            quality_score=max(0.0, min(1.0, float(observation.quality_score))),
            head_visible=self._observation_has_visible_head(observation),
            is_cropped=bool(getattr(observation, "is_cropped", False)),
            occlusion_ratio=max(0.0, min(1.0, float(getattr(observation, "occlusion_ratio", 0.0)))),
            bbox_area_ratio=max(0.0, float(getattr(observation, "bbox_area_ratio", 0.0))),
            is_usable_for_tracking=bool(getattr(observation, "is_usable_for_tracking", False)),
            is_usable_for_headwear=bool(getattr(observation, "is_usable_for_headwear", False)),
            is_low_quality=bool(getattr(observation, "is_low_quality", True)),
            is_truncated=bool(getattr(observation, "is_truncated", False)),
            is_occluded=bool(getattr(observation, "is_occluded", False)),
            is_interaction_risk=bool(getattr(observation, "interaction_risk", False)),
            headwear_context_usable=bool(getattr(observation, "headwear_context_usable", False)),
            visibility_state=str(getattr(observation, "visibility_state", "unknown")),
            reasons=list(getattr(observation, "reasons", [])),
            reason_codes=list(getattr(observation, "reason_codes", [])),
            is_usable_for_identity=False,
        )

    @staticmethod
    def _observation_has_visible_head(observation: HumanObservation) -> bool:
        visible_parts = getattr(observation, "visible_parts", None)
        if visible_parts is None:
            return False

        return bool(
            getattr(visible_parts, "head", False)
            or getattr(visible_parts, "face", False)
            or getattr(visible_parts, "head_visible", False)
        )

    def _headwear_min_quality_score(self) -> float:
        value = getattr(self._settings, "headwear_min_quality_score", 0.35)
        try:
            return max(0.0, min(1.0, float(value)))
        except Exception:
            return 0.35

    # ========================================================
    # Backend initialization
    # ========================================================

    def _init_backend(self) -> None:
        if self.mode == "placeholder":
            self.ready = True
            return

        if self.mode not in {"onnx_classifier", "onnx_detector"}:
            self.failure_reason = f"unsupported headwear detector mode: {self.mode}"
            return

        if ort is None:
            self.failure_reason = "onnxruntime package is not installed"
            return

        model_path = self._settings.headwear_model_path.strip()
        if not model_path:
            self.failure_reason = "HEADWEAR_MODEL_PATH is empty"
            return

        if not Path(model_path).expanduser().is_file():
            self.failure_reason = f"HEADWEAR_MODEL_PATH does not exist: {model_path}"
            return

        try:
            providers = ["CPUExecutionProvider"]
            available = ort.get_available_providers()
            if "CUDAExecutionProvider" in available:
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        except Exception:
            providers = ["CPUExecutionProvider"]

        try:
            session = ort.InferenceSession(model_path, providers=providers)
            inputs = session.get_inputs()
            if not inputs:
                self.failure_reason = "headwear ONNX session has no inputs"
                return

            self._session = session
            self._input_name = inputs[0].name
            self._input_layout = self._resolve_input_layout(inputs[0].shape)

            inferred_w, inferred_h = self._resolve_input_size(inputs[0].shape)
            if inferred_w is not None and inferred_h is not None:
                self._input_width = inferred_w
                self._input_height = inferred_h

            self.ready = True
        except Exception as error:
            self.failure_reason = f"failed to initialize headwear ONNX: {type(error).__name__}: {error}"

    # ========================================================
    # ONNX assessment
    # ========================================================

    def _assess_classifier(self, crop: np.ndarray) -> HeadwearAssessment:
        outputs = self._run_onnx(crop)
        if not outputs:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="classifier_empty_output",
            )

        logits = np.asarray(outputs[0], dtype=np.float32).squeeze()

        if logits.ndim == 0:
            score = float(logits)
            if not 0.0 <= score <= 1.0:
                score = 1.0 / (1.0 + float(np.exp(-score)))

            positive_means = self._settings.headwear_classifier_binary_positive_means.strip().lower()
            signal = ComplianceSignal.VIOLATION if positive_means == "violation" else ComplianceSignal.COMPLIANT

            if score < self._settings.headwear_classifier_conf_threshold:
                return HeadwearAssessment(
                    signal=ComplianceSignal.UNKNOWN,
                    confidence=score,
                    reason="classifier_binary_confidence_too_low",
                    raw_scores={signal.value: score},
                )

            return HeadwearAssessment(
                signal=signal,
                confidence=score,
                reason=f"classifier_binary_{signal.value}",
                raw_scores={signal.value: score},
            )

        if logits.ndim != 1 or logits.size == 0:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="classifier_invalid_output_shape",
            )

        probs = self._softmax_if_needed(logits)
        order = np.argsort(probs)[::-1]

        best_idx = int(order[0])
        second_idx = int(order[1]) if len(order) > 1 else best_idx

        best = _ClassScore(
            label=self._label_for_index(best_idx),
            score=float(probs[best_idx]),
        )
        second_score = float(probs[second_idx]) if second_idx != best_idx else 0.0
        margin = best.score - second_score

        raw_scores = {
            self._label_for_index(int(index)): float(probs[int(index)])
            for index in order[: min(8, len(order))]
        }

        if margin < self._settings.headwear_classifier_margin:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=best.score,
                reason="classifier_margin_too_low",
                label=best.label,
                raw_scores=raw_scores,
            )

        if best.score < self._settings.headwear_classifier_conf_threshold:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=best.score,
                reason="classifier_confidence_too_low",
                label=best.label,
                raw_scores=raw_scores,
            )

        return self._decision_from_scores(
            best_compliant=best if self._is_compliant_label(best.label) else None,
            best_violation=best if self._is_violation_label(best.label) else None,
            source="classifier",
            raw_scores=raw_scores,
        )

    def _assess_detector(self, crop: np.ndarray) -> HeadwearAssessment:
        outputs = self._run_onnx(crop)
        detections = self._parse_detector_outputs(outputs)

        if not detections:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason="detector_no_confident_headwear_result",
            )

        best_compliant: _ClassScore | None = None
        best_violation: _ClassScore | None = None
        raw_scores: dict[str, float] = {}

        for detection in detections:
            item = _ClassScore(label=detection.label, score=detection.score)
            raw_scores[item.label] = max(raw_scores.get(item.label, 0.0), item.score)

            if self._is_compliant_label(item.label):
                if best_compliant is None or item.score > best_compliant.score:
                    best_compliant = item

            elif self._is_violation_label(item.label):
                if best_violation is None or item.score > best_violation.score:
                    best_violation = item

        return self._decision_from_scores(
            best_compliant=best_compliant,
            best_violation=best_violation,
            source="detector",
            raw_scores=raw_scores,
        )

    def _decision_from_scores(
        self,
        *,
        best_compliant: _ClassScore | None,
        best_violation: _ClassScore | None,
        source: str,
        raw_scores: dict[str, float] | None = None,
    ) -> HeadwearAssessment:
        normalized_raw_scores = dict(raw_scores or {})

        violation_score = best_violation.score if best_violation is not None else 0.0
        compliant_score = best_compliant.score if best_compliant is not None else 0.0

        if best_violation is not None:
            normalized_raw_scores[best_violation.label] = best_violation.score
        if best_compliant is not None:
            normalized_raw_scores[best_compliant.label] = best_compliant.score

        if violation_score <= 0.0 and compliant_score <= 0.0:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=0.0,
                reason=f"{source}_only_unknown_or_unmapped_labels",
                raw_scores=normalized_raw_scores,
            )

        threshold = (
            self._settings.headwear_classifier_conf_threshold
            if source == "classifier"
            else self._settings.headwear_detector_conf_threshold
        )
        margin_threshold = (
            self._settings.headwear_classifier_margin
            if source == "classifier"
            else self._settings.headwear_decision_margin
        )

        top_score = max(violation_score, compliant_score)
        if top_score < threshold:
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=top_score,
                reason=f"{source}_confidence_too_low",
                raw_scores=normalized_raw_scores,
            )

        if best_violation is not None and self._is_task_mismatched_hardhat_negative(best_violation.label):
            if best_compliant is None or compliant_score <= 0.0:
                return HeadwearAssessment(
                    signal=ComplianceSignal.UNKNOWN,
                    confidence=violation_score,
                    reason=f"{source}_hardhat_negative_is_not_generic_headwear_violation:{best_violation.label}",
                    label=best_violation.label,
                    raw_scores=normalized_raw_scores,
                )

        if best_violation is not None and best_compliant is not None:
            gap = abs(violation_score - compliant_score)
            if gap < margin_threshold:
                if source == "detector" and violation_score >= compliant_score:
                    return self._violation_assessment(
                        source=source,
                        item=best_violation,
                        raw_scores=normalized_raw_scores,
                    )
                return HeadwearAssessment(
                    signal=ComplianceSignal.UNKNOWN,
                    confidence=top_score,
                    reason=f"{source}_compliant_violation_conflict_margin_too_low",
                    label=best_violation.label if violation_score >= compliant_score else best_compliant.label,
                    raw_scores=normalized_raw_scores,
                )

            if violation_score > compliant_score:
                return self._violation_assessment(
                    source=source,
                    item=best_violation,
                    raw_scores=normalized_raw_scores,
                )

            return HeadwearAssessment(
                signal=ComplianceSignal.COMPLIANT,
                confidence=compliant_score,
                reason=f"{source}_compliant:{best_compliant.label}",
                label=best_compliant.label,
                raw_scores=normalized_raw_scores,
            )

        if best_violation is not None:
            return self._violation_assessment(
                source=source,
                item=best_violation,
                raw_scores=normalized_raw_scores,
            )

        if best_compliant is not None:
            return HeadwearAssessment(
                signal=ComplianceSignal.COMPLIANT,
                confidence=compliant_score,
                reason=f"{source}_compliant:{best_compliant.label}",
                label=best_compliant.label,
                raw_scores=normalized_raw_scores,
            )

        return HeadwearAssessment(
            signal=ComplianceSignal.UNKNOWN,
            confidence=top_score,
            reason=f"{source}_unsupported_decision_source",
            raw_scores=normalized_raw_scores,
        )

    def _violation_assessment(
        self,
        *,
        source: str,
        item: _ClassScore,
        raw_scores: dict[str, float] | None = None,
    ) -> HeadwearAssessment:
        normalized_raw_scores = dict(raw_scores or {})
        normalized_raw_scores[item.label] = item.score

        if self._is_task_mismatched_hardhat_negative(item.label):
            return HeadwearAssessment(
                signal=ComplianceSignal.UNKNOWN,
                confidence=item.score,
                reason=f"{source}_hardhat_negative_is_not_generic_headwear_violation:{item.label}",
                label=item.label,
                raw_scores=normalized_raw_scores,
            )

        return HeadwearAssessment(
            signal=ComplianceSignal.VIOLATION,
            confidence=item.score,
            reason=f"{source}_violation:{item.label}",
            label=item.label,
            raw_scores=normalized_raw_scores,
        )

    def _is_task_mismatched_hardhat_negative(self, label: str) -> bool:
        normalized = self._normalize_label(label)
        if normalized not in _HARDHAT_NEGATIVE_LABELS:
            return False

        return not bool(getattr(self._settings, "headwear_allow_hardhat_negative_as_violation", True))

    def _run_onnx(self, crop: np.ndarray) -> list[np.ndarray]:
        if self._session is None or self._input_name is None:
            return []

        tensor = self._prepare_input(crop)
        return list(self._session.run(None, {self._input_name: tensor}))

    def _prepare_input(self, crop: np.ndarray) -> np.ndarray:
        prepared = self._prepare_model_input_image(crop)
        rgb = cv2.cvtColor(prepared, cv2.COLOR_BGR2RGB)
        data = rgb.astype(np.float32)

        mode = self._settings.headwear_input_normalization_mode.strip().lower()

        if mode == "zero_one":
            data = data / 255.0

        elif mode == "imagenet":
            data = data / 255.0
            mean = np.asarray([0.485, 0.456, 0.406], dtype=np.float32)
            std = np.asarray([0.229, 0.224, 0.225], dtype=np.float32)
            data = (data - mean) / std

        elif mode == "custom":
            data = data / 255.0
            mean_tuple = self._settings.headwear_input_mean or (0.0, 0.0, 0.0)
            std_tuple = self._settings.headwear_input_std or (1.0, 1.0, 1.0)

            mean = np.asarray(mean_tuple, dtype=np.float32)
            std = np.asarray(std_tuple, dtype=np.float32)
            std = np.where(np.abs(std) < 1e-6, 1.0, std)

            data = (data - mean) / std

        elif mode == "none":
            pass

        if self._input_layout == "nchw":
            data = np.transpose(data, (2, 0, 1))
            data = np.expand_dims(data, axis=0)
        else:
            data = np.expand_dims(data, axis=0)

        return data.astype(np.float32)

    def _prepare_model_input_image(self, crop: np.ndarray) -> np.ndarray:
        image = self._ensure_bgr_image(crop)
        if self._input_resize_mode == "stretch":
            return cv2.resize(
                image,
                (self._input_width, self._input_height),
                interpolation=cv2.INTER_AREA,
            )

        return self._letterbox_image(
            image=image,
            target_width=self._input_width,
            target_height=self._input_height,
        )

    def _letterbox_image(self, *, image: np.ndarray, target_width: int, target_height: int) -> np.ndarray:
        source_h, source_w = image.shape[:2]
        if source_w <= 0 or source_h <= 0:
            return np.full(
                (max(1, target_height), max(1, target_width), 3),
                self._letterbox_pad_value,
                dtype=np.uint8,
            )

        scale = min(target_width / float(source_w), target_height / float(source_h))
        resized_w = max(1, min(target_width, int(round(source_w * scale))))
        resized_h = max(1, min(target_height, int(round(source_h * scale))))

        interpolation = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LINEAR
        resized = cv2.resize(image, (resized_w, resized_h), interpolation=interpolation)

        canvas = np.full(
            (target_height, target_width, 3),
            self._letterbox_pad_value,
            dtype=resized.dtype,
        )
        pad_x = max(0, (target_width - resized_w) // 2)
        pad_y = max(0, (target_height - resized_h) // 2)
        canvas[pad_y:pad_y + resized_h, pad_x:pad_x + resized_w] = resized
        return canvas

    @staticmethod
    def _ensure_bgr_image(image: np.ndarray) -> np.ndarray:
        if image.ndim == 2:
            return cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        if image.ndim == 3 and image.shape[2] == 1:
            return cv2.cvtColor(image[:, :, 0], cv2.COLOR_GRAY2BGR)
        if image.ndim == 3 and image.shape[2] == 4:
            return cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
        return image

    # ========================================================
    # Detector output parsing
    # ========================================================

    def _parse_detector_outputs(self, outputs: list[np.ndarray]) -> list[_DetectionScore]:
        if not outputs:
            return []

        raw = np.asarray(outputs[0], dtype=np.float32).squeeze()
        if raw.size == 0:
            return []

        if raw.ndim == 1:
            raw = raw.reshape(1, -1)
        elif raw.ndim == 3:
            raw = raw.squeeze()

        if raw.ndim != 2:
            return []

        configured_class_count = int(self._settings.headwear_detector_num_classes or 0)
        possible_row_widths: set[int] = set()

        if configured_class_count > 0:
            possible_row_widths.add(4 + configured_class_count)
            possible_row_widths.add(5 + configured_class_count)

        if configured_class_count > 0:
            second_dim_is_detection_row = raw.shape[1] in possible_row_widths
            first_dim_is_detection_row = raw.shape[0] in possible_row_widths

            if (
                not second_dim_is_detection_row
                and first_dim_is_detection_row
                and raw.shape[1] > raw.shape[0]
            ):
                raw = raw.T
        else:
            if raw.shape[0] < raw.shape[1] and raw.shape[0] <= 128:
                raw = raw.T

        detections: list[_DetectionScore] = []
        has_objectness = self._resolve_detector_objectness(raw)

        class_count = configured_class_count
        if class_count <= 0:
            class_count = max(0, raw.shape[1] - (5 if has_objectness else 4))

        for row in raw:
            if row.shape[0] < 5:
                continue

            if has_objectness:
                if row.shape[0] < 5 + class_count:
                    continue
                obj = float(row[4])
                class_scores = row[5:5 + class_count]
            else:
                if row.shape[0] < 4 + class_count:
                    continue
                obj = 1.0
                class_scores = row[4:4 + class_count]

            if class_scores.size == 0:
                continue

            class_idx = int(np.argmax(class_scores))
            class_score = float(class_scores[class_idx])
            score = obj * class_score

            if score < self._settings.headwear_detector_conf_threshold:
                continue

            label = self._label_for_index(class_idx)
            normalized_label = self._normalize_label(label)

            if (
                normalized_label not in self._compliant_labels
                and normalized_label not in self._violation_labels
                and normalized_label not in self._unknown_labels
            ):
                continue

            if self._is_unknown_label(label):
                continue

            x1, y1, x2, y2 = self._decode_detector_box(row[:4])

            detections.append(
                _DetectionScore(
                    label=label,
                    score=score,
                    bbox=(x1, y1, x2, y2),
                )
            )

        return self._nms(detections)

    def _resolve_detector_objectness(self, raw: np.ndarray) -> bool:
        configured = self._settings.headwear_detector_has_objectness

        if configured == "true":
            return True

        if configured == "false":
            return False

        class_count = int(self._settings.headwear_detector_num_classes or 0)
        if class_count > 0:
            return raw.shape[1] == class_count + 5

        return raw.shape[1] > 6

    def _decode_detector_box(self, values: np.ndarray) -> tuple[float, float, float, float]:
        x, y, w, h = [float(v) for v in values[:4]]

        if self._settings.headwear_detector_box_format.strip().lower() == "xyxy":
            return x, y, w, h

        return (
            x - w / 2.0,
            y - h / 2.0,
            x + w / 2.0,
            y + h / 2.0,
        )

    def _nms(self, detections: list[_DetectionScore]) -> list[_DetectionScore]:
        if not detections:
            return []

        detections = sorted(detections, key=lambda item: item.score, reverse=True)
        keep: list[_DetectionScore] = []

        for detection in detections:
            should_keep = True
            detection_label = self._normalize_label(detection.label)

            for kept in keep:
                kept_label = self._normalize_label(kept.label)

                if detection_label != kept_label:
                    continue

                if self._box_iou(detection.bbox, kept.bbox) > self._settings.headwear_detector_nms_iou:
                    should_keep = False
                    break

            if should_keep:
                keep.append(detection)

        return keep

    @staticmethod
    def _box_iou(
        left: tuple[float, float, float, float],
        right: tuple[float, float, float, float],
    ) -> float:
        lx1, ly1, lx2, ly2 = left
        rx1, ry1, rx2, ry2 = right

        ix1 = max(lx1, rx1)
        iy1 = max(ly1, ry1)
        ix2 = min(lx2, rx2)
        iy2 = min(ly2, ry2)

        iw = max(0.0, ix2 - ix1)
        ih = max(0.0, iy2 - iy1)

        inter = iw * ih
        if inter <= 0:
            return 0.0

        left_area = max(0.0, lx2 - lx1) * max(0.0, ly2 - ly1)
        right_area = max(0.0, rx2 - rx1) * max(0.0, ry2 - ry1)
        union = left_area + right_area - inter

        if union <= 0:
            return 0.0

        return float(inter / union)

    # ========================================================
    # Crop helpers
    # ========================================================

    def _extract_head_crop_bundle(
        self,
        *,
        frame: np.ndarray,
        bbox: BBox | None,
    ) -> _PersonCropBundle | None:
        if bbox is None:
            return None
        crop_bbox = self._clip_bbox_to_frame(frame=frame, bbox=bbox)
        if crop_bbox is None:
            return None
        min_width = max(4, int(getattr(self._settings, "head_detector_min_head_width_px", 8)))
        min_height = max(4, int(getattr(self._settings, "head_detector_min_head_height_px", 8)))
        if crop_bbox.width < min_width or crop_bbox.height < min_height:
            return None
        crop = frame[crop_bbox.y1:crop_bbox.y2, crop_bbox.x1:crop_bbox.x2]
        if crop.size == 0:
            return None
        return _PersonCropBundle(bbox=crop_bbox, crop=crop)

    def _assert_classifier_input_crop_type(self, crop_type: str) -> None:
        normalized = str(crop_type or "").strip().lower()
        if normalized == "head":
            return
        policy = str(getattr(self._settings, "headwear_model_policy", "diagnostic_only") or "diagnostic_only").strip().lower()
        if policy == "production":
            raise RuntimeError(
                "Production headwear classifier refused non-head crop input: "
                f"classifier_input_crop_type={normalized!r}"
            )

    def _extract_person_crop_bundle(
        self,
        *,
        frame: np.ndarray,
        bbox: BBox,
    ) -> _PersonCropBundle | None:
        if frame is None or not isinstance(frame, np.ndarray) or frame.ndim < 2 or frame.size == 0:
            return None

        crop_bbox = self._clip_bbox_to_frame(frame=frame, bbox=bbox)
        if crop_bbox is None:
            return None

        min_width = max(_MIN_PERSON_CROP_WIDTH, int(getattr(self._settings, "person_box_gate_min_width_px", _MIN_PERSON_CROP_WIDTH)))
        min_height = max(_MIN_PERSON_CROP_HEIGHT, int(getattr(self._settings, "person_box_gate_min_height_px", _MIN_PERSON_CROP_HEIGHT)))
        if crop_bbox.width < min_width or crop_bbox.height < min_height:
            return None

        crop = frame[crop_bbox.y1:crop_bbox.y2, crop_bbox.x1:crop_bbox.x2]
        if crop.size == 0:
            return None

        return _PersonCropBundle(
            bbox=crop_bbox,
            crop=crop,
        )

    @staticmethod
    def _clip_bbox_to_frame(*, frame: np.ndarray, bbox: BBox) -> BBox | None:
        if frame is None or not isinstance(frame, np.ndarray) or frame.ndim < 2:
            return None

        height, width = frame.shape[:2]
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
    # Debug saving
    # ========================================================

    def _save_debug_sample(
        self,
        *,
        frame: np.ndarray,
        person_bbox: BBox,
        crop_bbox: BBox,
        crop: np.ndarray,
        quality: QualityAssessment,
        assessment: HeadwearAssessment,
        observation: HumanObservation | None,
        crop_type: str = "person",
        head_bbox: BBox | None = None,
    ) -> None:
        if not self._debug_enabled:
            return

        with self._debug_lock:
            self._debug_counter += 1

            if self._debug_max_samples <= 0:
                return

            if self._debug_saved >= self._debug_max_samples:
                return

            if self._debug_counter % self._debug_every_n != 0:
                return

            self._debug_saved += 1
            sample_index = self._debug_saved

        try:
            self._debug_dir.mkdir(parents=True, exist_ok=True)

            created_at = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
            track_id = self._safe_text(getattr(observation, "track_id", None), fallback="no-track")
            track_episode_id = self._safe_text(getattr(observation, "track_episode_id", None), fallback="no-episode")
            label = self._safe_text(getattr(assessment, "label", None), fallback="no-label")
            signal = self._safe_text(getattr(assessment.signal, "value", assessment.signal), fallback="unknown")
            confidence = self._safe_float(getattr(assessment, "confidence", 0.0), default=0.0)

            base_name = self._safe_filename(
                f"{sample_index:06d}_{created_at}_{track_episode_id}_track-{track_id}_{signal}_{confidence:.3f}_{label}"
            )

            crop_path = self._debug_dir / f"{base_name}_{self._safe_filename(crop_type)}_crop.jpg"
            input_path = self._debug_dir / f"{base_name}_{self._safe_filename(crop_type)}_input{self._input_width}x{self._input_height}.jpg"
            frame_path = self._debug_dir / f"{base_name}_frame.jpg"

            cv2.imwrite(str(crop_path), crop)

            model_input_image = self._prepare_model_input_image(crop)
            cv2.imwrite(str(input_path), model_input_image)

            annotated = frame.copy()
            self._draw_debug_bbox(
                annotated,
                bbox=person_bbox,
                color=(255, 0, 0),
                label="person_bbox",
            )
            self._draw_debug_bbox(
                annotated,
                bbox=crop_bbox,
                color=(0, 255, 255),
                label=f"{crop_type}_crop_sent_to_model",
            )

            debug_label = f"{signal} {confidence:.3f} {label} {assessment.reason}"
            cv2.putText(
                annotated,
                debug_label[:180],
                (max(0, crop_bbox.x1), max(18, crop_bbox.y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (0, 255, 255),
                2,
                cv2.LINE_AA,
            )
            cv2.imwrite(str(frame_path), annotated)

            row = self._build_debug_csv_row(
                sample_index=sample_index,
                created_at=created_at,
                frame=frame,
                person_bbox=person_bbox,
                crop_bbox=crop_bbox,
                crop=crop,
                quality=quality,
                assessment=assessment,
                observation=observation,
                crop_path=crop_path,
                input_path=input_path,
                frame_path=frame_path,
                crop_type=crop_type,
                head_bbox=head_bbox,
            )
            self._append_debug_csv(row)

        except Exception:
            return

    def _build_debug_csv_row(
        self,
        *,
        sample_index: int,
        created_at: str,
        frame: np.ndarray,
        person_bbox: BBox,
        crop_bbox: BBox,
        crop: np.ndarray,
        quality: QualityAssessment,
        assessment: HeadwearAssessment,
        observation: HumanObservation | None,
        crop_path: Path,
        input_path: Path,
        frame_path: Path,
        crop_type: str = "person",
        head_bbox: BBox | None = None,
    ) -> dict[str, str]:
        frame_h, frame_w = frame.shape[:2]
        crop_h, crop_w = crop.shape[:2]

        raw_scores = getattr(assessment, "raw_scores", {}) or {}

        return {
            "sample_index": str(sample_index),
            "created_at_utc": created_at,
            "mode": self.mode,
            "model_path": str(getattr(self._settings, "headwear_model_path", "")),
            "input_layout": self._input_layout,
            "input_resize_mode": self._input_resize_mode,
            "input_width": str(self._input_width),
            "input_height": str(self._input_height),
            "frame_width": str(frame_w),
            "frame_height": str(frame_h),
            "crop_width": str(crop_w),
            "crop_height": str(crop_h),
            "person_bbox": self._bbox_to_text(person_bbox),
            "person_crop_bbox": self._bbox_to_text(crop_bbox),
            "model_input_crop_type": str(crop_type or "person"),
            "head_crop_bbox": self._bbox_to_text(head_bbox) if head_bbox is not None else "",
            "track_id": self._safe_text(getattr(observation, "track_id", None), fallback=""),
            "source_track_id": self._safe_text(getattr(observation, "source_track_id", None), fallback=""),
            "track_episode_id": self._safe_text(getattr(observation, "track_episode_id", None), fallback=""),
            "observation_type": self._safe_text(
                getattr(
                    getattr(observation, "observation_type", None),
                    "value",
                    getattr(observation, "observation_type", ""),
                ),
                fallback="",
            ),
            "visibility_state": self._safe_text(getattr(observation, "visibility_state", None), fallback=""),
            "headwear_context_usable": str(bool(getattr(observation, "headwear_context_usable", False))),
            "interaction_risk": str(bool(getattr(observation, "interaction_risk", False))),
            "observation_usable_for_headwear": str(bool(getattr(observation, "is_usable_for_headwear", False))),
            "observation_usable_for_incident": str(bool(getattr(observation, "is_usable_for_incident", False))),
            "observation_quality_score": f"{self._safe_float(getattr(observation, 'quality_score', 0.0), default=0.0):.6f}",
            "quality_is_valid": str(bool(getattr(quality, "is_valid", False))),
            "quality_score": f"{self._safe_float(getattr(quality, 'quality_score', 0.0), default=0.0):.6f}",
            "quality_head_visible": str(bool(getattr(quality, "head_visible", False))),
            "quality_usable_for_headwear": str(bool(getattr(quality, "is_usable_for_headwear", False))),
            "quality_occlusion_ratio": f"{self._safe_float(getattr(quality, 'occlusion_ratio', 0.0), default=0.0):.6f}",
            "quality_bbox_area_ratio": f"{self._safe_float(getattr(quality, 'bbox_area_ratio', 0.0), default=0.0):.8f}",
            "signal": self._safe_text(getattr(assessment.signal, "value", assessment.signal), fallback="unknown"),
            "confidence": f"{self._safe_float(getattr(assessment, 'confidence', 0.0), default=0.0):.6f}",
            "label": self._safe_text(getattr(assessment, "label", None), fallback=""),
            "reason": self._safe_text(getattr(assessment, "reason", None), fallback=""),
            "raw_scores_json": json.dumps(raw_scores, ensure_ascii=False, sort_keys=True),
            "crop_path": str(crop_path),
            "input_path": str(input_path),
            "frame_path": str(frame_path),
        }

    def _append_debug_csv(self, row: dict[str, str]) -> None:
        with self._debug_lock:
            self._debug_dir.mkdir(parents=True, exist_ok=True)
            file_exists = self._debug_csv_path.is_file()

            with self._debug_csv_path.open("a", encoding="utf-8", newline="") as file:
                writer = csv.DictWriter(file, fieldnames=list(row.keys()), delimiter=";")

                if not file_exists:
                    writer.writeheader()

                writer.writerow(row)

    @staticmethod
    def _draw_debug_bbox(
        image: np.ndarray,
        *,
        bbox: BBox,
        color: tuple[int, int, int],
        label: str,
    ) -> None:
        cv2.rectangle(
            image,
            (int(bbox.x1), int(bbox.y1)),
            (int(bbox.x2), int(bbox.y2)),
            color,
            2,
        )
        cv2.putText(
            image,
            label,
            (max(0, int(bbox.x1)), max(16, int(bbox.y1) - 6)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            color,
            2,
            cv2.LINE_AA,
        )

    # ========================================================
    # Generic helpers
    # ========================================================

    @staticmethod
    def _bbox_to_text(bbox: BBox) -> str:
        return f"{int(bbox.x1)},{int(bbox.y1)},{int(bbox.x2)},{int(bbox.y2)}"

    @staticmethod
    def _safe_filename(value: str) -> str:
        normalized = re.sub(r"[^a-zA-Z0-9А-Яа-я_.=-]+", "_", str(value or "").strip())
        normalized = normalized.strip("._")
        return normalized[:180] or "sample"

    @staticmethod
    def _safe_text(value: object, *, fallback: str) -> str:
        if value is None:
            return fallback

        text = str(value).strip()
        return text if text else fallback

    @staticmethod
    def _safe_float(value: object, *, default: float) -> float:
        try:
            number = float(value)
        except Exception:
            return default

        if not np.isfinite(number):
            return default

        return number

    @staticmethod
    def _softmax_if_needed(values: np.ndarray) -> np.ndarray:
        if values.size == 0:
            return values.astype(np.float32)

        if (
            np.all(values >= 0.0)
            and np.all(values <= 1.0)
            and 0.80 <= float(values.sum()) <= 1.20
        ):
            return values.astype(np.float32)

        shifted = values - np.max(values)
        exp = np.exp(shifted)
        denom = float(exp.sum())

        if denom <= 1e-12:
            return np.zeros_like(values, dtype=np.float32)

        return (exp / denom).astype(np.float32)

    def _label_for_index(self, index: int) -> str:
        if 0 <= index < len(self._class_names):
            return self._class_names[index]

        return str(index)

    def _is_compliant_label(self, label: str) -> bool:
        return self._normalize_label(label) in self._compliant_labels

    def _is_violation_label(self, label: str) -> bool:
        return self._normalize_label(label) in self._violation_labels

    def _is_unknown_label(self, label: str) -> bool:
        return self._normalize_label(label) in self._unknown_labels

    @staticmethod
    def _normalize_label(label: str) -> str:
        return (
            str(label or "")
            .strip()
            .lower()
            .replace("_", "-")
            .replace(" ", "-")
            .replace("/", "-")
        )

    def _normalize_label_set(self, labels: tuple[str, ...]) -> set[str]:
        return {self._normalize_label(label) for label in labels if str(label or "").strip()}

    def _resolve_input_layout(self, shape: list[Any] | tuple[Any, ...]) -> str:
        dims = list(shape)

        if len(dims) != 4:
            return "nchw"

        if isinstance(dims[1], int) and dims[1] in (1, 3):
            return "nchw"

        if isinstance(dims[3], int) and dims[3] in (1, 3):
            return "nhwc"

        return "nchw"

    def _resolve_input_size(self, shape: list[Any] | tuple[Any, ...]) -> tuple[int | None, int | None]:
        dims = list(shape)

        if len(dims) != 4:
            return None, None

        if self._resolve_input_layout(shape) == "nchw":
            h = dims[2]
            w = dims[3]
        else:
            h = dims[1]
            w = dims[2]

        if isinstance(w, int) and isinstance(h, int) and w > 0 and h > 0:
            return int(w), int(h)

        return None, None