# ============================================================
# File: vision/tests/test_headwear_stage6.py
# Purpose:
# - Verifies HumanObservation-safe headwear assessment.
# ============================================================

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import numpy as np

from app.models.schemas import BBox, ComplianceSignal, QualityAssessment
from app.pipeline.headwear_detector import HeadwearDetector
from app.pipeline.human_observation import HumanObservation, ObservationType, VisibleParts


def _settings(**overrides: object) -> SimpleNamespace:
    values: dict[str, object] = {
        "headwear_detector_mode": "placeholder",
        "headwear_model_path": "",
        "headwear_input_width": 224,
        "headwear_input_height": 224,
        "headwear_class_names": ("helmet", "no_helmet", "unknown"),
        "headwear_compliant_labels": ("helmet", "hardhat", "hard-hat"),
        "headwear_violation_labels": ("no_helmet", "no-helmet", "no-hardhat"),
        "headwear_unknown_labels": ("unknown",),
        "headwear_input_normalization_mode": "zero_one",
        "headwear_input_mean": None,
        "headwear_input_std": None,
        "headwear_classifier_binary_positive_means": "violation",
        "headwear_classifier_conf_threshold": 0.70,
        "headwear_classifier_margin": 0.15,
        "headwear_detector_conf_threshold": 0.70,
        "headwear_detector_nms_iou": 0.45,
        "headwear_detector_num_classes": 0,
        "headwear_detector_has_objectness": "auto",
        "headwear_detector_box_format": "cxcywh",
        "headwear_decision_margin": 0.12,
        "headwear_min_quality_score": 0.35,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _quality(score: float = 0.80, *, usable: bool = True, low: bool = False) -> QualityAssessment:
    return QualityAssessment(
        is_valid=usable,
        quality_score=score,
        head_visible=usable,
        is_cropped=False,
        occlusion_ratio=0.0,
        bbox_area_ratio=0.10,
        reasons=[],
        reason_codes=[],
        is_usable_for_identity=usable,
        is_usable_for_headwear=usable,
        is_low_quality=low,
        is_truncated=False,
        is_occluded=False,
    )


def _observation(*, visible_parts: VisibleParts, quality: QualityAssessment, usable_headwear: bool = True) -> HumanObservation:
    return HumanObservation(
        camera_id="camera_001",
        observed_at=datetime(2026, 1, 1, 12, 0, 0),
        frame_index=1,
        track_id=11,
        day_person_id="person_001",
        candidate_id=None,
        identity_state="confirmed",
        identity_reason="test",
        bbox=BBox(x1=100, y1=80, x2=220, y2=360),
        quality=quality,
        observation_type=ObservationType.UPPER_BODY,
        visible_parts=visible_parts,
        confidence=0.90,
        tracking_confidence=0.90,
        quality_score=quality.quality_score,
        scene_zone="center",
        is_low_quality=quality.is_low_quality,
        is_usable_for_headwear=usable_headwear,
        is_usable_for_incident=usable_headwear,
        is_usable_for_registry=quality.is_usable_for_identity,
        reason_codes=[],
        frame_shape=(720, 1280, 3),
    )


def test_headwear_no_head_visible_returns_unknown() -> None:
    detector = HeadwearDetector(_settings())
    observation = _observation(
        visible_parts=VisibleParts(head_visible=False, upper_body_visible=True),
        quality=_quality(),
    )

    result = detector.assess_observation(frame=np.zeros((720, 1280, 3), dtype=np.uint8), observation=observation)

    assert result.signal == ComplianceSignal.UNKNOWN
    assert result.reason == "head_not_visible_in_observation"


def test_headwear_low_quality_observation_returns_unknown() -> None:
    detector = HeadwearDetector(_settings())
    quality = _quality(score=0.20, usable=False, low=True)
    observation = _observation(
        visible_parts=VisibleParts(head_visible=True, upper_body_visible=True),
        quality=quality,
        usable_headwear=False,
    )

    result = detector.assess_observation(frame=np.zeros((720, 1280, 3), dtype=np.uint8), observation=observation)

    assert result.signal == ComplianceSignal.UNKNOWN
    assert result.reason == "observation_low_quality_for_headwear"
