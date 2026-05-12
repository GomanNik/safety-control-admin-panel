# ============================================================
# File: vision/tests/test_headwear_detector_negative_extra.py
# Purpose:
# - Negative and decision-boundary tests for HeadwearDetector.
# - Uses fake ONNX sessions, no real model required.
# ============================================================

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import numpy as np
import pytest

from app.models.schemas import BBox, ComplianceSignal, QualityAssessment
from app.pipeline.headwear_detector import HeadwearDetector
from app.pipeline.human_observation import HumanObservation, ObservationType, VisibleParts


def _settings(**overrides):
    base = {
        "headwear_detector_mode": "placeholder",
        "headwear_input_width": 32,
        "headwear_input_height": 32,
        "headwear_class_names": ("helmet", "no-helmet", "unknown"),
        "headwear_compliant_labels": ("helmet", "hardhat"),
        "headwear_violation_labels": ("no-helmet", "no-hardhat"),
        "headwear_unknown_labels": ("unknown",),
        "headwear_model_path": "",
        "headwear_min_quality_score": 0.35,
        "headwear_classifier_conf_threshold": 0.60,
        "headwear_classifier_margin": 0.10,
        "headwear_classifier_binary_positive_means": "violation",
        "headwear_detector_conf_threshold": 0.55,
        "headwear_decision_margin": 0.12,
        "headwear_input_normalization_mode": "zero_one",
        "headwear_input_mean": None,
        "headwear_input_std": None,
        "headwear_detector_num_classes": 3,
        "headwear_detector_has_objectness": "auto",
        "headwear_detector_box_format": "cxcywh",
        "headwear_detector_nms_iou": 0.5,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class _FakeSession:
    def __init__(self, output) -> None:
        self.output = output

    def run(self, *_args, **_kwargs):
        if isinstance(self.output, BaseException):
            raise self.output
        return [self.output]


def _quality(**overrides) -> QualityAssessment:
    base = {
        "is_valid": True,
        "quality_score": 0.9,
        "head_visible": True,
        "is_low_quality": False,
        "is_usable_for_headwear": True,
    }
    base.update(overrides)
    return QualityAssessment(**base)


def _frame() -> np.ndarray:
    return np.full((120, 120, 3), 127, dtype=np.uint8)


def _detector_with_fake_session(mode: str, output, **settings_overrides) -> HeadwearDetector:
    detector = HeadwearDetector(_settings(**settings_overrides))
    detector.mode = mode
    detector.ready = True
    detector.failure_reason = None
    detector._session = _FakeSession(output)
    detector._input_name = "input"
    return detector


def _observation(**overrides) -> HumanObservation:
    base = dict(
        camera_id="cam_1",
        observed_at=datetime(2026, 1, 1),
        frame_index=1,
        track_id=1,
        day_person_id=None,
        candidate_id=None,
        identity_state="unknown",
        identity_reason="test",
        bbox=BBox(x1=20, y1=10, x2=90, y2=110),
        quality=_quality(),
        observation_type=ObservationType.UPPER_BODY,
        visible_parts=VisibleParts(head_visible=True, upper_body_visible=True),
        confidence=0.9,
        tracking_confidence=0.9,
        quality_score=0.9,
        scene_zone="center",
        is_low_quality=False,
        is_usable_for_headwear=True,
        is_usable_for_incident=True,
        is_usable_for_registry=True,
        reason_codes=[],
        frame_shape=(120, 120, 3),
    )
    base.update(overrides)
    return HumanObservation(**base)


def test_placeholder_warmup_is_ready_without_model() -> None:
    detector = HeadwearDetector(_settings())

    assert detector.ready is True
    assert detector.warmup() == (True, None)


def test_quality_rejections_prevent_false_violation() -> None:
    detector = HeadwearDetector(_settings())
    bbox = BBox(x1=20, y1=10, x2=90, y2=110)

    assert detector.assess(frame=_frame(), bbox=bbox, quality=_quality(is_valid=False)).reason == "quality_rejected"
    assert detector.assess(frame=_frame(), bbox=bbox, quality=_quality(head_visible=False)).reason == "head_not_visible"
    assert detector.assess(frame=_frame(), bbox=bbox, quality=_quality(is_low_quality=True)).reason == "quality_low_for_headwear"
    assert detector.assess(frame=_frame(), bbox=bbox, quality=_quality(is_usable_for_headwear=False)).reason == "quality_not_usable_for_headwear"


def test_observation_rejections_cover_bad_frame_bbox_type_and_flags() -> None:
    detector = HeadwearDetector(_settings())

    assert detector.assess_observation(frame=np.zeros((0, 0, 3), dtype=np.uint8), observation=_observation()).reason == "frame_unavailable"
    assert detector.assess_observation(frame=_frame(), observation=_observation(bbox=BBox(x1=1, y1=1, x2=1, y2=10))).reason == "invalid_observation_bbox"
    assert "observation_type_not_usable_for_headwear" in detector.assess_observation(
        frame=_frame(), observation=_observation(observation_type=ObservationType.LOWER_BODY)
    ).reason
    assert detector.assess_observation(
        frame=_frame(), observation=_observation(visible_parts=VisibleParts(lower_body_visible=True))
    ).reason == "head_not_visible_in_observation"
    assert detector.assess_observation(
        frame=_frame(), observation=_observation(is_low_quality=True)
    ).reason == "observation_low_quality_for_headwear"
    assert detector.assess_observation(
        frame=_frame(), observation=_observation(is_usable_for_headwear=False)
    ).reason == "observation_not_usable_for_headwear"


def test_classifier_strong_violation_and_margin_unknown() -> None:
    strong = _detector_with_fake_session("onnx_classifier", np.asarray([0.05, 0.90, 0.05], dtype=np.float32))
    conflict = _detector_with_fake_session("onnx_classifier", np.asarray([0.47, 0.50, 0.03], dtype=np.float32))

    violation = strong.assess(frame=_frame(), bbox=BBox(x1=20, y1=10, x2=90, y2=110), quality=_quality())
    unknown = conflict.assess(frame=_frame(), bbox=BBox(x1=20, y1=10, x2=90, y2=110), quality=_quality())

    assert violation.signal == ComplianceSignal.VIOLATION
    assert "classifier_violation" in violation.reason
    assert unknown.signal == ComplianceSignal.UNKNOWN
    assert unknown.reason == "classifier_margin_too_low"


def test_classifier_binary_low_confidence_is_unknown() -> None:
    detector = _detector_with_fake_session("onnx_classifier", np.asarray(0.40, dtype=np.float32))

    result = detector.assess(frame=_frame(), bbox=BBox(x1=20, y1=10, x2=90, y2=110), quality=_quality())

    assert result.signal == ComplianceSignal.UNKNOWN
    assert result.reason == "classifier_binary_confidence_too_low"


def test_detector_outputs_apply_confidence_unknown_label_and_nms() -> None:
    output = np.asarray(
        [
            [50, 50, 20, 20, 0.95, 0.90, 0.02, 0.08],  # compliant
            [51, 51, 20, 20, 0.90, 0.80, 0.01, 0.19],  # overlapping compliant suppressed
            [80, 80, 20, 20, 0.95, 0.05, 0.90, 0.05],  # violation wins
            [10, 10, 20, 20, 0.10, 0.00, 0.99, 0.01],  # low objectness ignored
            [20, 20, 20, 20, 0.95, 0.01, 0.01, 0.98],  # unknown label ignored
        ],
        dtype=np.float32,
    )
    detector = _detector_with_fake_session("onnx_detector", output)

    result = detector.assess(frame=_frame(), bbox=BBox(x1=20, y1=10, x2=90, y2=110), quality=_quality())

    assert result.signal == ComplianceSignal.VIOLATION
    assert "detector_violation" in result.reason


def test_inference_exception_returns_unknown() -> None:
    detector = _detector_with_fake_session("onnx_classifier", RuntimeError("boom"))

    result = detector.assess(frame=_frame(), bbox=BBox(x1=20, y1=10, x2=90, y2=110), quality=_quality())

    assert result.signal == ComplianceSignal.UNKNOWN
    assert result.reason == "headwear_inference_failed:RuntimeError"


def test_prepare_input_supports_custom_normalization_and_nhwc() -> None:
    detector = _detector_with_fake_session(
        "onnx_classifier",
        np.asarray([0.9, 0.1, 0.0], dtype=np.float32),
        headwear_input_normalization_mode="custom",
        headwear_input_mean=(0.5, 0.5, 0.5),
        headwear_input_std=(0.0, 0.25, 0.25),
    )
    detector._input_layout = "nhwc"

    tensor = detector._prepare_input(_frame())

    assert tensor.shape == (1, 32, 32, 3)
    assert tensor.dtype == np.float32


def test_layout_size_and_label_helpers_are_robust() -> None:
    detector = HeadwearDetector(_settings())

    assert detector._resolve_input_layout([1, 3, 64, 64]) == "nchw"
    assert detector._resolve_input_layout([1, 64, 64, 3]) == "nhwc"
    assert detector._resolve_input_size([1, 3, 64, 32]) == (32, 64)
    assert detector._resolve_input_size([1, 64, 32, 3]) == (32, 64)
    assert detector._label_for_index(99) == "99"
    assert detector._normalize_label("No Helmet") == "no-helmet"
