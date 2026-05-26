# ============================================================
# File: vision/tests/test_head_detector_production_chain_stage2_5_extended.py
# Purpose:
# - Extended regression tests for stages 2-5 of the head-detector based
#   production chain.
# - Complements test_head_detector_production_chain_stage2_5.py with edge
#   cases that are easy to miss: config validation, ONNX parser behavior,
#   run scopes, association thresholds, legacy/diagnostic fallback boundaries,
#   incident window ratios and episode isolation.
# ============================================================

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import csv
from types import SimpleNamespace

import numpy as np
import pytest

from app.config import Settings
from app.models.schemas import BBox, ComplianceSignal, HeadwearAssessment, IncidentState, QualityAssessment
from app.pipeline.head_detector import (
    HeadDetectionCandidate,
    HeadDetectorScope,
    HeadObservation,
    HeadObservationStatus,
    OnnxHeadDetector,
    build_head_detector,
)
from app.pipeline.head_person_association import (
    HeadPersonAssociationConfig,
    HeadPersonAssociationStatus,
    HeadPersonAssociator,
)
from app.pipeline.headwear_detector import HeadwearDetector
from app.pipeline.headwear_observation import (
    HeadwearObservation,
    TrackEpisodeBinding,
    build_headwear_observation_from_assessment,
)
from app.pipeline.human_observation import HumanObservation, ObservationType, VisibleParts
from app.pipeline.incident_engine import IncidentEngine


def _frame(width: int = 320, height: int = 240, value: int = 127) -> np.ndarray:
    frame = np.full((height, width, 3), value, dtype=np.uint8)
    frame[20:80, 20:80] = (30, 160, 220)
    return frame


def _bbox(x1: int = 80, y1: int = 30, x2: int = 170, y2: int = 210) -> BBox:
    return BBox(x1=x1, y1=y1, x2=x2, y2=y2)


def _head_bbox(x1: int = 100, y1: int = 40, x2: int = 145, y2: int = 88) -> BBox:
    return BBox(x1=x1, y1=y1, x2=x2, y2=y2)


def _quality(*, valid: bool = True, head_visible: bool = True, usable_headwear: bool = True) -> QualityAssessment:
    return QualityAssessment(
        is_valid=valid,
        quality_score=0.90 if valid else 0.0,
        head_visible=head_visible,
        is_cropped=False,
        occlusion_ratio=0.0,
        bbox_area_ratio=0.10,
        is_usable_for_tracking=valid,
        is_usable_for_headwear=usable_headwear,
        is_low_quality=not valid,
        is_truncated=False,
        is_occluded=False,
        is_partial_limb_only=False,
        is_lower_body_only=False,
        is_bent_over=False,
        is_interaction_risk=False,
        headwear_context_usable=bool(valid and head_visible and usable_headwear),
        visibility_state="head_visible" if head_visible else "not_evaluable",
        reasons=[],
        reason_codes=[],
    )


def _observation(
    *,
    bbox: BBox | None = None,
    head_bbox: BBox | None = None,
    track_id: int = 7,
    episode_id: str | None = "episode_7",
    frame_index: int = 10,
    observed_at: datetime | None = None,
    quality: QualityAssessment | None = None,
    visible_head: bool = True,
    interaction_risk: bool = False,
) -> HumanObservation:
    quality = quality or _quality(head_visible=visible_head)
    return HumanObservation(
        camera_id="camera_001",
        track_episode_id=episode_id,
        source_track_id=track_id,
        track_id=track_id,
        frame_index=frame_index,
        observed_at=observed_at or datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
        bbox=bbox or _bbox(),
        head_bbox=head_bbox,
        quality=quality,
        visible_parts=VisibleParts(head=visible_head, upper_body=True, lower_body=True),
        observation_type=ObservationType.FULL_PERSON,
        visibility_state=quality.visibility_state,
        scene_zone="test_zone",
        quality_score=quality.quality_score,
        bbox_area_ratio=quality.bbox_area_ratio,
        occlusion_ratio=quality.occlusion_ratio,
        headwear_context_usable=bool(quality.headwear_context_usable),
        interaction_risk=interaction_risk,
        is_cropped=quality.is_cropped,
        is_low_quality=quality.is_low_quality,
        is_truncated=quality.is_truncated,
        is_occluded=quality.is_occluded,
        reasons=list(quality.reasons),
        reason_codes=list(quality.reason_codes),
    )


def _settings(**overrides: object) -> Settings:
    defaults = dict(
        person_tracking_backend="development_simple",
        person_tracking_allow_dev_simple=True,
        person_tracking_require_external=False,
        runtime_require_real_headwear=False,
        headwear_detector_mode="placeholder",
        headwear_model_policy="production",
        headwear_model_path="",
        headwear_class_names=("head_allowed", "head_no_headwear"),
        headwear_compliant_labels=("head_allowed",),
        headwear_violation_labels=("head_no_headwear",),
        headwear_unknown_labels=(),
        headwear_debug_save_crops=False,
        headwear_classifier_conf_threshold=0.50,
        headwear_classifier_margin=0.05,
        headwear_incidents_enabled=True,
        incident_window_size=4,
        incident_window_seconds=4.0,
        incident_open_min_valid=2,
        incident_open_violation_ratio=0.75,
        incident_open_min_duration_sec=0.0,
        incident_cooldown_seconds=2.0,
        incident_close_seconds=5.0,
    )
    defaults.update(overrides)
    return Settings(**defaults)


def _head_observation(
    *,
    status: HeadObservationStatus = HeadObservationStatus.ACTIONABLE,
    head_bbox: BBox | None = None,
    episode_id: str | None = "episode_7",
    is_actionable: bool | None = None,
    reason_codes: list[str] | None = None,
) -> HeadObservation:
    if is_actionable is None:
        is_actionable = status == HeadObservationStatus.ACTIONABLE and head_bbox is not None
    return HeadObservation(
        camera_id="camera_001",
        frame_index=10,
        timestamp_seconds=1.0,
        person_bbox=_bbox(),
        head_bbox=head_bbox,
        track_id=7,
        episode_id=episode_id,
        status=status,
        confidence=0.91 if head_bbox else 0.0,
        quality={"quality_score": 0.91, "head_detected": head_bbox is not None},
        reason_codes=list(reason_codes or []),
        source_model="test_head_detector",
        is_actionable=bool(is_actionable),
        observed_at=datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
        detection_scope=HeadDetectorScope.PERSON_ROI,
        candidate_count=1 if head_bbox else 0,
        selected_candidate_index=0 if head_bbox else None,
        association_score=0.90 if head_bbox else 0.0,
        crop_source="head_detector" if head_bbox else "none",
        legacy_geometry_used=False,
    )


def _binding(
    *,
    episode_id: str | None = "episode_7",
    track_id: int = 7,
    is_actionable: bool = True,
    observed_at: datetime | None = None,
    reason_codes: list[str] | None = None,
    head_bbox: BBox | None = None,
) -> TrackEpisodeBinding:
    return TrackEpisodeBinding(
        camera_id="camera_001",
        frame_index=10,
        timestamp_seconds=1.0,
        person_bbox=_bbox(),
        head_bbox=head_bbox or _head_bbox(),
        track_id=track_id,
        episode_id=episode_id,
        status="bound" if episode_id else "unbound",
        confidence=0.90,
        quality={"quality_score": 0.90},
        reason_codes=list(reason_codes or []),
        source_model="test_tracking",
        is_actionable=bool(is_actionable),
        observed_at=observed_at or datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
    )


def _headwear_observation(
    *,
    signal: ComplianceSignal,
    episode_id: str | None = "episode_7",
    track_id: int = 7,
    observed_at: datetime | None = None,
    is_actionable: bool = True,
    classifier_input_crop_type: str = "head",
    reason_codes: list[str] | None = None,
    confidence: float = 0.91,
) -> HeadwearObservation:
    return HeadwearObservation(
        camera_id="camera_001",
        frame_index=10,
        timestamp_seconds=1.0,
        person_bbox=_bbox(),
        head_bbox=_head_bbox() if classifier_input_crop_type == "head" else None,
        track_id=track_id,
        episode_id=episode_id,
        status=signal.value,
        confidence=confidence,
        quality={"quality_score": 0.90, "head_status": "head_visible"},
        reason_codes=list(reason_codes or []),
        source_model="test_headwear_classifier",
        is_actionable=is_actionable,
        signal=signal,
        raw_scores={"head_allowed": 1.0 - confidence, "head_no_headwear": confidence},
        classifier_input_crop_type=classifier_input_crop_type,
        observed_at=observed_at or datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
    )


def _onnx_detector_stub(
    *,
    scope: HeadDetectorScope = HeadDetectorScope.PERSON_ROI,
    box_format: str = "cxcywh",
    has_objectness: str = "auto",
    conf_threshold: float = 0.45,
    iou_threshold: float = 0.45,
    input_size: int = 100,
    class_names: tuple[str, ...] = ("head",),
) -> OnnxHeadDetector:
    detector = object.__new__(OnnxHeadDetector)
    detector.mode = "onnx"  # type: ignore[attr-defined]
    detector.source_model = "stub_head_detector"  # type: ignore[attr-defined]
    detector.ready = True  # type: ignore[attr-defined]
    detector.failure_reason = None  # type: ignore[attr-defined]
    detector._settings = SimpleNamespace(head_detector_class_names=class_names)  # type: ignore[attr-defined]
    detector._conf_threshold = conf_threshold  # type: ignore[attr-defined]
    detector._iou_threshold = iou_threshold  # type: ignore[attr-defined]
    detector._input_size = input_size  # type: ignore[attr-defined]
    detector._scope = scope  # type: ignore[attr-defined]
    detector._box_format = box_format  # type: ignore[attr-defined]
    detector._has_objectness = has_objectness  # type: ignore[attr-defined]
    detector._session = object()  # type: ignore[attr-defined]
    detector._input_name = "input"  # type: ignore[attr-defined]
    return detector


# -----------------------------------------------------------------------------
# Config validation and launch guard edge cases
# -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("field", "value", "expected_message"),
    [
        ("head_detector_mode", "bad_mode", "HEAD_DETECTOR_MODE has unsupported value"),
        ("head_detector_run_scope", "bad_scope", "HEAD_DETECTOR_RUN_SCOPE"),
        ("head_detector_conf_threshold", -0.1, "HEAD_DETECTOR_CONF_THRESHOLD"),
        ("head_detector_iou_threshold", 1.5, "HEAD_DETECTOR_IOU_THRESHOLD"),
        ("head_detector_input_size", 8, "HEAD_DETECTOR_INPUT_SIZE"),
        ("head_detector_box_format", "bad", "HEAD_DETECTOR_BOX_FORMAT"),
        ("head_detector_min_head_width_px", 0, "HEAD_DETECTOR_MIN_HEAD_WIDTH_PX"),
        ("head_person_association_min_inside_ratio", 1.5, "HEAD_PERSON_ASSOCIATION_MIN_INSIDE_RATIO"),
        ("head_person_association_ambiguity_delta", -0.01, "HEAD_PERSON_ASSOCIATION_AMBIGUITY_DELTA"),
    ],
)
def test_runtime_static_config_rejects_invalid_head_detector_fields(field: str, value: object, expected_message: str) -> None:
    settings = _settings(**{field: value})

    with pytest.raises(ValueError, match=expected_message):
        settings.validate_runtime_static_config_or_raise()


@pytest.mark.parametrize("mode", ["disabled", "mock"])
def test_runtime_launch_rejects_disabled_or_mock_head_detector_when_real_headwear_is_required(mode: str, tmp_path: Path) -> None:
    headwear_model = tmp_path / "headwear.onnx"
    headwear_model.write_bytes(b"fake")
    settings = _settings(
        runtime_require_real_headwear=True,
        headwear_detector_mode="onnx_classifier",
        headwear_model_path=str(headwear_model),
        head_detector_mode=mode,
    )

    with pytest.raises(ValueError, match="HEAD_DETECTOR_MODE=disabled/mock"):
        settings.validate_runtime_launch_or_raise(source_url="synthetic.mp4", require_real_headwear=True)


def test_runtime_launch_allows_mock_head_detector_for_collection_mode_even_when_real_headwear_global_flag_is_true(tmp_path: Path) -> None:
    settings = _settings(
        runtime_require_real_headwear=True,
        person_crop_collection_enabled=True,
        headwear_detector_mode="placeholder",
        head_detector_mode="mock",
    )

    settings.validate_runtime_launch_or_raise(source_url="synthetic.mp4", require_real_headwear=None)


def test_runtime_launch_requires_existing_onnx_head_detector_model_path(tmp_path: Path) -> None:
    headwear_model = tmp_path / "headwear.onnx"
    headwear_model.write_bytes(b"fake")
    settings = _settings(
        runtime_require_real_headwear=True,
        headwear_detector_mode="onnx_classifier",
        headwear_model_path=str(headwear_model),
        head_detector_mode="onnx",
        head_detector_model_path=str(tmp_path / "missing_head.onnx"),
    )

    with pytest.raises(ValueError, match="HEAD_DETECTOR_MODEL_PATH does not exist locally"):
        settings.validate_runtime_launch_or_raise(source_url="synthetic.mp4", require_real_headwear=True)


def test_runtime_launch_requires_legacy_geometry_flag_when_legacy_mode_is_selected() -> None:
    settings = _settings(head_detector_mode="legacy_geometry", allow_legacy_geometry_head_fallback=False)

    with pytest.raises(ValueError, match="ALLOW_LEGACY_GEOMETRY_HEAD_FALLBACK=true"):
        settings.validate_runtime_launch_or_raise(source_url="synthetic.mp4", require_real_headwear=False)


# -----------------------------------------------------------------------------
# ONNX head detector parser and run-scope coverage without real model files
# -----------------------------------------------------------------------------


def test_onnx_head_detector_parser_maps_normalized_cxcywh_to_pixel_bbox_and_class_name() -> None:
    detector = _onnx_detector_stub(input_size=100, box_format="cxcywh", has_objectness="true", class_names=("head", "face"))
    output = np.asarray([[0.50, 0.40, 0.20, 0.30, 0.90, 0.10, 0.80]], dtype=np.float32)

    candidates = detector._parse_outputs([output], crop_shape=(200, 300, 3), offset_x=10, offset_y=20)  # type: ignore[attr-defined]

    assert len(candidates) == 1
    assert candidates[0].class_id == 1
    assert candidates[0].class_name == "face"
    assert candidates[0].confidence == pytest.approx(0.72, abs=1e-6)
    assert candidates[0].head_bbox == BBox(x1=130, y1=70, x2=190, y2=130)


def test_onnx_head_detector_parser_supports_xyxy_rows_and_filters_by_confidence() -> None:
    detector = _onnx_detector_stub(input_size=100, box_format="xyxy", has_objectness="false", conf_threshold=0.50)
    output = np.asarray(
        [
            [10, 20, 30, 60, 0.49],
            [40, 10, 80, 50, 0.90],
        ],
        dtype=np.float32,
    )

    candidates = detector._parse_outputs([output], crop_shape=(200, 300, 3), offset_x=0, offset_y=0)  # type: ignore[attr-defined]

    assert len(candidates) == 1
    assert candidates[0].confidence == pytest.approx(0.90)
    assert candidates[0].head_bbox == BBox(x1=120, y1=20, x2=240, y2=100)


def test_onnx_head_detector_nms_keeps_strongest_overlapping_candidate() -> None:
    detector = _onnx_detector_stub(input_size=100, box_format="xyxy", has_objectness="false", conf_threshold=0.10, iou_threshold=0.40)
    output = np.asarray(
        [
            [10, 10, 50, 50, 0.95],
            [12, 12, 52, 52, 0.90],
            [70, 70, 90, 90, 0.80],
        ],
        dtype=np.float32,
    )

    candidates = detector._parse_outputs([output], crop_shape=(100, 100, 3), offset_x=0, offset_y=0)  # type: ignore[attr-defined]

    assert len(candidates) == 2
    assert [round(item.confidence, 2) for item in candidates] == [0.95, 0.80]


def test_onnx_head_detector_person_roi_scope_adds_person_offset(monkeypatch: pytest.MonkeyPatch) -> None:
    detector = _onnx_detector_stub(scope=HeadDetectorScope.PERSON_ROI, input_size=100, box_format="xyxy", has_objectness="false")
    monkeypatch.setattr(detector, "_run_on_crop", lambda crop: [np.asarray([[20, 10, 60, 40, 0.95]], dtype=np.float32)])

    candidates = detector._detect_candidates_for_observation(frame=_frame(), observation=_observation(bbox=BBox(x1=80, y1=30, x2=180, y2=130)))  # type: ignore[attr-defined]

    assert len(candidates) == 1
    assert candidates[0].head_bbox == BBox(x1=100, y1=40, x2=140, y2=70)


def test_onnx_head_detector_full_frame_scope_does_not_add_person_offset(monkeypatch: pytest.MonkeyPatch) -> None:
    detector = _onnx_detector_stub(scope=HeadDetectorScope.FULL_FRAME, input_size=100, box_format="xyxy", has_objectness="false")
    monkeypatch.setattr(detector, "_run_on_crop", lambda crop: [np.asarray([[20, 10, 60, 40, 0.95]], dtype=np.float32)])

    candidates = detector._detect_candidates_for_observation(frame=_frame(width=300, height=200), observation=_observation(bbox=BBox(x1=80, y1=30, x2=180, y2=130)))  # type: ignore[attr-defined]

    assert len(candidates) == 1
    assert candidates[0].head_bbox == BBox(x1=60, y1=20, x2=180, y2=80)


def test_onnx_head_detector_not_ready_fails_closed_without_classifier_path() -> None:
    detector = build_head_detector(SimpleNamespace(head_detector_mode="onnx", head_detector_model_path=""))

    obs = detector.detect_for_observation(frame=_frame(), observation=_observation(), timestamp_seconds=1.0)

    assert obs.status == HeadObservationStatus.HEAD_NOT_DETECTED
    assert obs.classifier_may_run is False
    assert obs.reason_codes == ["head_detector_not_ready"]


# -----------------------------------------------------------------------------
# Head-person association edge cases not covered by the previous pack
# -----------------------------------------------------------------------------


def test_associator_rejects_invalid_person_bbox_even_when_head_candidate_exists() -> None:
    assoc = HeadPersonAssociator()
    result = assoc.associate_for_observation(
        camera_id="camera_001",
        frame_index=1,
        timestamp_seconds=1.0,
        observation=_observation(bbox=BBox(x1=10, y1=10, x2=10, y2=50)),
        candidates=[HeadDetectionCandidate(head_bbox=_head_bbox(), confidence=0.99)],
        frame_shape=_frame().shape,
        source_model="test",
    )

    assert result.status == HeadPersonAssociationStatus.REJECTED
    assert result.observation.status == HeadObservationStatus.HEAD_UNUSABLE
    assert result.observation.classifier_may_run is False
    assert "person_bbox_invalid" in result.reason_codes


def test_associator_can_allow_border_head_when_reject_border_cropped_is_disabled() -> None:
    assoc = HeadPersonAssociator(HeadPersonAssociationConfig(reject_border_cropped=False))
    result = assoc.associate_for_observation(
        camera_id="camera_001",
        frame_index=1,
        timestamp_seconds=1.0,
        observation=_observation(bbox=BBox(x1=80, y1=0, x2=170, y2=210)),
        candidates=[HeadDetectionCandidate(head_bbox=BBox(x1=100, y1=0, x2=145, y2=45), confidence=0.95)],
        frame_shape=_frame().shape,
        source_model="test",
    )

    assert result.status == HeadPersonAssociationStatus.ASSOCIATED
    assert result.observation.status == HeadObservationStatus.ACTIONABLE
    assert result.observation.classifier_may_run is True


def test_associator_rejects_partially_outside_head_when_inside_ratio_is_too_low() -> None:
    assoc = HeadPersonAssociator(HeadPersonAssociationConfig(min_head_inside_person_ratio=0.80))
    result = assoc.associate_for_observation(
        camera_id="camera_001",
        frame_index=1,
        timestamp_seconds=1.0,
        observation=_observation(bbox=BBox(x1=80, y1=30, x2=170, y2=210)),
        candidates=[HeadDetectionCandidate(head_bbox=BBox(x1=150, y1=40, x2=210, y2=100), confidence=0.95)],
        frame_shape=_frame().shape,
        source_model="test",
    )

    assert result.status in {HeadPersonAssociationStatus.NOT_DETECTED, HeadPersonAssociationStatus.REJECTED}
    assert result.observation.classifier_may_run is False


def test_associator_selects_highest_scored_candidate_and_preserves_original_index() -> None:
    assoc = HeadPersonAssociator(HeadPersonAssociationConfig(ambiguity_score_delta=0.01))
    weak = HeadDetectionCandidate(head_bbox=BBox(x1=100, y1=110, x2=140, y2=155), confidence=0.60, reason_codes=["weak_low_zone"])
    strong = HeadDetectionCandidate(head_bbox=_head_bbox(), confidence=0.95, reason_codes=["strong_upper_zone"])

    result = assoc.associate_for_observation(
        camera_id="camera_001",
        frame_index=1,
        timestamp_seconds=1.0,
        observation=_observation(),
        candidates=[weak, strong],
        frame_shape=_frame().shape,
        source_model="test",
    )

    assert result.status == HeadPersonAssociationStatus.ASSOCIATED
    assert result.candidate_index == 1
    assert result.candidate is not None
    assert result.candidate.head_bbox == _head_bbox()
    assert "strong_upper_zone" in result.observation.reason_codes


def test_associate_frame_processes_each_person_independently_and_does_not_share_head_bbox_between_tracks() -> None:
    assoc = HeadPersonAssociator(HeadPersonAssociationConfig(ambiguity_score_delta=0.01))
    left_person = _observation(bbox=BBox(x1=20, y1=20, x2=120, y2=220), track_id=1, episode_id="ep1")
    right_person = _observation(bbox=BBox(x1=180, y1=20, x2=300, y2=220), track_id=2, episode_id="ep2")
    left_head = HeadDetectionCandidate(head_bbox=BBox(x1=50, y1=30, x2=95, y2=80), confidence=0.95)
    right_head = HeadDetectionCandidate(head_bbox=BBox(x1=215, y1=35, x2=265, y2=85), confidence=0.96)

    results = assoc.associate_frame(
        camera_id="camera_001",
        frame_index=1,
        timestamp_seconds=1.0,
        observations=[left_person, right_person],
        candidates=[right_head, left_head],
        frame_shape=_frame().shape,
        source_model="test",
    )

    assert [item.observation.episode_id for item in results] == ["ep1", "ep2"]
    assert results[0].observation.head_bbox == left_head.head_bbox
    assert results[1].observation.head_bbox == right_head.head_bbox
    assert all(item.observation.classifier_may_run for item in results)


# -----------------------------------------------------------------------------
# Headwear classifier guard and legacy/diagnostic boundaries
# -----------------------------------------------------------------------------


def test_low_level_assess_person_crop_path_raises_in_production_when_quality_would_allow_classifier() -> None:
    detector = HeadwearDetector(_settings(headwear_detector_mode="onnx_classifier", headwear_model_policy="production"))

    with pytest.raises(RuntimeError, match="refused non-head crop input"):
        detector.assess(frame=_frame(), bbox=_bbox(), quality=_quality())


def test_low_level_assess_person_crop_path_is_diagnostic_only_when_policy_is_not_production() -> None:
    detector = HeadwearDetector(_settings(headwear_detector_mode="onnx_classifier", headwear_model_policy="diagnostic_only"))

    result = detector.assess(frame=_frame(), bbox=_bbox(), quality=_quality())

    assert result.signal == ComplianceSignal.UNKNOWN
    assert result.reason in {"onnxruntime package is not installed", "HEADWEAR_MODEL_PATH is empty", "onnx_session_unavailable"}


def test_actionable_head_observation_is_still_blocked_when_track_has_interaction_risk(monkeypatch: pytest.MonkeyPatch) -> None:
    detector = HeadwearDetector(_settings(headwear_detector_mode="onnx_classifier"))
    head_obs = _head_observation(status=HeadObservationStatus.ACTIONABLE, head_bbox=_head_bbox(), is_actionable=True)

    def fail_if_called(*args: object, **kwargs: object) -> object:
        raise AssertionError("classifier must not run when interaction_risk is true")

    monkeypatch.setattr(detector, "_assess_classifier", fail_if_called)
    monkeypatch.setattr(detector, "_assess_detector", fail_if_called)

    result = detector.assess_head_observation(
        frame=_frame(),
        observation=_observation(interaction_risk=True),
        head_observation=head_obs,
    )

    assert result.signal == ComplianceSignal.UNKNOWN
    assert result.reason == "track_interaction_risk_headwear_skipped"
    assert "track_interaction_risk" in result.reason_codes


def test_headwear_debug_sample_for_head_path_uses_head_crop_type_in_manifest(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    settings = _settings(
        headwear_detector_mode="onnx_classifier",
        headwear_model_policy="production",
        headwear_debug_save_crops=True,
        headwear_debug_dir=str(tmp_path),
        headwear_debug_max_samples=10,
        headwear_debug_every_n=1,
    )
    detector = HeadwearDetector(settings)
    detector._session = object()
    detector._input_name = "input"
    detector.start_debug_session(camera_id="camera_001", session_started_at=datetime(2026, 5, 22, 10, 0, 0), source_url="synthetic.mp4")

    monkeypatch.setattr(
        detector,
        "_assess_classifier",
        lambda crop: HeadwearAssessment(signal=ComplianceSignal.COMPLIANT, confidence=0.93, reason="test_allowed", label="head_allowed"),
    )

    result = detector.assess_head_observation(
        frame=_frame(),
        observation=_observation(),
        head_observation=_head_observation(status=HeadObservationStatus.ACTIONABLE, head_bbox=_head_bbox(), is_actionable=True),
    )

    assert result.signal == ComplianceSignal.COMPLIANT
    csv_path = next(tmp_path.rglob("headwear_debug_log.csv"))
    rows = list(csv.DictReader(csv_path.open("r", encoding="utf-8-sig"), delimiter=";"))
    assert rows
    assert rows[0]["model_input_crop_type"] == "head"
    assert "head_crop" in rows[0]["crop_path"]
    assert "person_crop" not in rows[0]["crop_path"]


# -----------------------------------------------------------------------------
# HeadwearObservation DTO and IncidentEngine edge cases
# -----------------------------------------------------------------------------


def test_track_binding_without_episode_makes_actionable_headwear_non_actionable_for_incident() -> None:
    assessment = HeadwearAssessment(signal=ComplianceSignal.VIOLATION, confidence=0.99, reason="test_violation")
    dto = build_headwear_observation_from_assessment(
        assessment=assessment,
        track_binding=_binding(episode_id=None, is_actionable=False),
        head_observation=_head_observation(status=HeadObservationStatus.ACTIONABLE, head_bbox=_head_bbox(), is_actionable=True),
    )

    assert dto.signal == ComplianceSignal.VIOLATION
    assert dto.classifier_input_crop_type == "head"
    assert dto.is_actionable is False
    assert dto.is_valid_for_incident_window is False


def test_incident_engine_rejects_headwear_observation_without_episode_binding_even_if_violation() -> None:
    engine = IncidentEngine(_settings())

    result = engine.process_headwear_observation(
        headwear_observation=_headwear_observation(signal=ComplianceSignal.VIOLATION, episode_id=None),
        track_binding=_binding(episode_id=None, is_actionable=False),
    )

    assert result.subject_key is None
    assert result.case is None
    assert result.reason_codes == ["track_episode_missing"]


def test_incident_engine_does_not_open_when_violation_ratio_is_below_threshold() -> None:
    engine = IncidentEngine(_settings(incident_open_min_valid=3, incident_open_violation_ratio=0.75))
    base = datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc)

    signals = [ComplianceSignal.VIOLATION, ComplianceSignal.COMPLIANT, ComplianceSignal.VIOLATION]
    last = None
    for idx, signal in enumerate(signals):
        t = base + timedelta(seconds=idx)
        last = engine.process_headwear_observation(
            headwear_observation=_headwear_observation(signal=signal, observed_at=t),
            track_binding=_binding(observed_at=t),
        )

    assert last is not None
    assert last.case is not None
    assert last.case.state == IncidentState.CANDIDATE
    assert last.opened is False


def test_incident_engine_ignores_unknown_frames_inside_window_but_opens_after_two_actionable_violations() -> None:
    engine = IncidentEngine(_settings(incident_open_min_valid=2, incident_open_violation_ratio=1.0))
    base = datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc)

    engine.process_headwear_observation(
        headwear_observation=_headwear_observation(
            signal=ComplianceSignal.UNKNOWN,
            is_actionable=False,
            classifier_input_crop_type="none",
            reason_codes=["head_occluded"],
            observed_at=base,
        ),
        track_binding=_binding(head_bbox=None, observed_at=base),
    )
    engine.process_headwear_observation(
        headwear_observation=_headwear_observation(signal=ComplianceSignal.VIOLATION, observed_at=base + timedelta(seconds=1)),
        track_binding=_binding(observed_at=base + timedelta(seconds=1)),
    )
    result = engine.process_headwear_observation(
        headwear_observation=_headwear_observation(signal=ComplianceSignal.VIOLATION, observed_at=base + timedelta(seconds=2)),
        track_binding=_binding(observed_at=base + timedelta(seconds=2)),
    )

    assert result.case is not None
    assert result.case.state == IncidentState.OPEN
    assert result.opened is True


def test_incident_engine_keeps_separate_windows_for_separate_track_episodes() -> None:
    engine = IncidentEngine(_settings(incident_open_min_valid=2, incident_open_violation_ratio=1.0))
    base = datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc)

    for episode_id, track_id in [("ep1", 1), ("ep2", 2)]:
        for idx in range(2):
            t = base + timedelta(seconds=idx)
            engine.process_headwear_observation(
                headwear_observation=_headwear_observation(signal=ComplianceSignal.VIOLATION, episode_id=episode_id, track_id=track_id, observed_at=t),
                track_binding=_binding(episode_id=episode_id, track_id=track_id, observed_at=t),
            )

    cases = engine.snapshot()
    assert len(cases) == 2
    assert {case.track_episode_id for case in cases} == {"ep1", "ep2"}
    assert all(case.state == IncidentState.OPEN for case in cases)


def test_incident_engine_cooldown_and_reopen_use_only_actionable_headwear_observations() -> None:
    engine = IncidentEngine(_settings(
        incident_open_min_valid=2,
        incident_open_violation_ratio=1.0,
        incident_cooldown_seconds=100.0,
        incident_window_seconds=2.0,
        incident_window_size=3,
        processed_video_analysis_fps=1.0,
    ))
    base = datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc)

    for idx in range(2):
        t = base + timedelta(seconds=idx)
        engine.process_headwear_observation(
            headwear_observation=_headwear_observation(signal=ComplianceSignal.VIOLATION, observed_at=t),
            track_binding=_binding(observed_at=t),
        )
    case = engine.snapshot()[0]
    assert case.state == IncidentState.OPEN

    for idx in range(2, 6):
        t = base + timedelta(seconds=idx)
        engine.process_headwear_observation(
            headwear_observation=_headwear_observation(signal=ComplianceSignal.COMPLIANT, observed_at=t),
            track_binding=_binding(observed_at=t),
        )
    case = engine.snapshot()[0]
    assert case.state == IncidentState.COOLDOWN

    for idx in range(10, 12):
        t = base + timedelta(seconds=idx)
        result = engine.process_headwear_observation(
            headwear_observation=_headwear_observation(signal=ComplianceSignal.VIOLATION, observed_at=t),
            track_binding=_binding(observed_at=t),
        )

    assert result.case is not None
    assert result.case.state == IncidentState.OPEN


def test_finish_video_closes_active_headwear_case_without_creating_new_evidence() -> None:
    engine = IncidentEngine(_settings(incident_open_min_valid=2, incident_open_violation_ratio=1.0))
    base = datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc)

    for idx in range(2):
        t = base + timedelta(seconds=idx)
        engine.process_headwear_observation(
            headwear_observation=_headwear_observation(signal=ComplianceSignal.VIOLATION, observed_at=t),
            track_binding=_binding(observed_at=t),
        )

    engine.finish_video(base + timedelta(seconds=10))
    cases = engine.snapshot()
    assert len(cases) == 1
    assert cases[0].state == IncidentState.CLOSED
    assert "incident_closed_at_video_eof" in cases[0].reason_codes
