# ============================================================
# File: vision/tests/test_head_detector_production_chain_stage2_5.py
# Purpose:
# - Regression tests for the production head-detector based runtime chain.
# - Verifies that person bbox/tracking is only temporal binding and never
#   sufficient to run the headwear classifier or open an incident.
# - Covers disabled/mock head detector, head-person association, classifier
#   crop guard, HeadwearObservation -> IncidentEngine semantics and clean
#   image storage boundaries.
# ============================================================

from __future__ import annotations

import csv
import inspect
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

from app.config import Settings
from app.models.schemas import BBox, ComplianceSignal, HeadwearAssessment, IncidentState, QualityAssessment
from app.pipeline.head_detector import (
    DisabledHeadDetector,
    HeadDetectionCandidate,
    HeadDetectorMode,
    HeadDetectorScope,
    HeadObservation,
    HeadObservationStatus,
    LegacyGeometryHeadDetector,
    MockHeadDetector,
    build_head_detector,
    should_schedule_headwear_classifier,
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
from app.pipeline.runtime import VisionRuntimeService, _FrameObservationBundle
from app.pipeline.tracking_types import ExternalTrackState, TrackedPersonObservation, TrackingBackendType
from app.storage.frame_store import FrameStore
from app.storage.person_crop_dataset_store import PersonCropDatasetStore


# -----------------------------------------------------------------------------
# Shared fixtures/helpers
# -----------------------------------------------------------------------------


def _frame(width: int = 320, height: int = 240, value: int = 127) -> np.ndarray:
    frame = np.full((height, width, 3), value, dtype=np.uint8)
    # Add a small non-uniform patch so storage "informative crop" checks do not
    # reject completely constant synthetic images.
    cv2.rectangle(frame, (20, 20), (80, 80), (value // 2, value, min(255, value + 40)), -1)
    return frame


def _bbox(x1: int = 80, y1: int = 30, x2: int = 170, y2: int = 210) -> BBox:
    return BBox(x1=x1, y1=y1, x2=x2, y2=y2)


def _head_bbox(x1: int = 100, y1: int = 40, x2: int = 145, y2: int = 88) -> BBox:
    return BBox(x1=x1, y1=y1, x2=x2, y2=y2)


def _quality(
    *,
    valid: bool = True,
    head_visible: bool = True,
    usable_headwear: bool = True,
    context_usable: bool = True,
    low_quality: bool = False,
    cropped: bool = False,
    occluded: bool = False,
    visibility_state: str = "head_visible",
    reason_codes: list[str] | None = None,
) -> QualityAssessment:
    return QualityAssessment(
        is_valid=valid,
        quality_score=0.88 if valid else 0.0,
        head_visible=head_visible,
        is_cropped=cropped,
        occlusion_ratio=0.0 if not occluded else 0.80,
        bbox_area_ratio=0.12,
        is_usable_for_tracking=valid,
        is_usable_for_headwear=usable_headwear,
        is_low_quality=low_quality,
        is_truncated=cropped,
        is_occluded=occluded,
        is_partial_limb_only=False,
        is_lower_body_only=False,
        is_bent_over=False,
        is_interaction_risk=False,
        headwear_context_usable=context_usable,
        visibility_state=visibility_state,
        reasons=list(reason_codes or []),
        reason_codes=list(reason_codes or []),
    )


def _observation(
    *,
    bbox: BBox | None = None,
    head_bbox: BBox | None = None,
    quality: QualityAssessment | None = None,
    track_id: int = 7,
    episode_id: str | None = "episode_7",
    frame_index: int = 10,
    observed_at: datetime | None = None,
    visible_head: bool = True,
    headwear_context_usable: bool | None = None,
    interaction_risk: bool = False,
) -> HumanObservation:
    quality = quality or _quality()
    if headwear_context_usable is None:
        headwear_context_usable = bool(quality.headwear_context_usable and quality.is_usable_for_headwear and visible_head)
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
        headwear_context_usable=headwear_context_usable,
        interaction_risk=interaction_risk,
        is_cropped=quality.is_cropped,
        is_low_quality=quality.is_low_quality,
        is_truncated=quality.is_truncated,
        is_occluded=quality.is_occluded,
        reasons=list(quality.reasons),
        reason_codes=list(quality.reason_codes),
    )


def _tracked_person(track_id: int = 7, bbox: BBox | None = None, frame_index: int = 10) -> TrackedPersonObservation:
    return TrackedPersonObservation(
        track_id=track_id,
        bbox=bbox or _bbox(),
        confidence=0.91,
        observed_at=datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
        frame_index=frame_index,
        track_state=ExternalTrackState.TRACKED,
        track_age=4,
        track_hits=4,
        time_since_update=0,
        class_id=0,
        class_name="person",
        detector_confidence=0.91,
        tracking_confidence=0.91,
        source_backend=TrackingBackendType.DEVELOPMENT_SIMPLE,
        is_confirmed_track=True,
        is_visible=True,
        is_shadow=False,
        shadow_of_track_id=None,
        reason_codes=[],
    )


def _settings(**overrides: object) -> Settings:
    defaults = dict(
        headwear_detector_mode="placeholder",
        headwear_model_policy="production",
        headwear_incidents_enabled=True,
        headwear_debug_save_crops=False,
        headwear_class_names=("head_allowed", "head_no_headwear"),
        headwear_compliant_labels=("head_allowed",),
        headwear_violation_labels=("head_no_headwear",),
        headwear_unknown_labels=(),
        incident_window_size=4,
        incident_window_seconds=3.0,
        incident_open_min_valid=2,
        incident_open_violation_ratio=0.75,
        incident_open_min_duration_sec=0.0,
    )
    defaults.update(overrides)
    return Settings(**defaults)


def _binding(
    *,
    episode_id: str | None = "episode_7",
    observed_at: datetime | None = None,
    is_actionable: bool = True,
    reason_codes: list[str] | None = None,
    head_bbox: BBox | None = None,
) -> TrackEpisodeBinding:
    return TrackEpisodeBinding(
        camera_id="camera_001",
        frame_index=10,
        timestamp_seconds=1.0,
        person_bbox=_bbox(),
        head_bbox=head_bbox or _head_bbox(),
        track_id=7,
        episode_id=episode_id,
        status="bound" if episode_id else "unbound",
        confidence=0.9,
        quality={"quality_score": 0.9},
        reason_codes=list(reason_codes or []),
        source_model="test_tracking",
        is_actionable=is_actionable,
        observed_at=observed_at or datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
    )


def _head_observation(
    *,
    status: HeadObservationStatus = HeadObservationStatus.ACTIONABLE,
    head_bbox: BBox | None = None,
    is_actionable: bool | None = None,
    reason_codes: list[str] | None = None,
    episode_id: str | None = "episode_7",
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
        confidence=0.92 if head_bbox is not None else 0.0,
        quality={"head_detected": head_bbox is not None, "quality_score": 0.90},
        reason_codes=list(reason_codes or []),
        source_model="test_head_detector",
        is_actionable=bool(is_actionable),
        observed_at=datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
        detection_scope=HeadDetectorScope.PERSON_ROI,
        candidate_count=1 if head_bbox is not None else 0,
        selected_candidate_index=0 if head_bbox is not None else None,
        association_score=0.95 if head_bbox is not None else 0.0,
        crop_source="head_detector" if head_bbox is not None else "none",
        legacy_geometry_used=False,
    )


def _headwear_observation(
    *,
    signal: ComplianceSignal,
    is_actionable: bool = True,
    classifier_input_crop_type: str = "head",
    reason_codes: list[str] | None = None,
    observed_at: datetime | None = None,
) -> HeadwearObservation:
    return HeadwearObservation(
        camera_id="camera_001",
        frame_index=10,
        timestamp_seconds=1.0,
        person_bbox=_bbox(),
        head_bbox=_head_bbox() if classifier_input_crop_type == "head" else None,
        track_id=7,
        episode_id="episode_7",
        status=signal.value,
        confidence=0.91,
        quality={"quality_score": 0.91, "head_status": "head_visible"},
        reason_codes=list(reason_codes or []),
        source_model="test_headwear_classifier",
        is_actionable=is_actionable,
        signal=signal,
        raw_scores={"head_allowed": 0.09, "head_no_headwear": 0.91},
        classifier_input_crop_type=classifier_input_crop_type,
        observed_at=observed_at or datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
    )


# -----------------------------------------------------------------------------
# Config/factory contract
# -----------------------------------------------------------------------------


def test_config_has_dedicated_head_detector_fields_and_safe_defaults() -> None:
    settings = _settings()

    assert settings.head_detector_mode == "disabled"
    assert settings.head_detector_model_path == ""
    assert 0.0 <= settings.head_detector_conf_threshold <= 1.0
    assert 0.0 <= settings.head_detector_iou_threshold <= 1.0
    assert settings.head_detector_run_scope == "person_roi"
    assert settings.head_detector_input_size > 0
    assert settings.allow_legacy_geometry_head_fallback is False
    assert settings.legacy_geometry_head_fallback_actionable is False


def test_build_head_detector_disabled_by_default() -> None:
    detector = build_head_detector(SimpleNamespace())

    assert isinstance(detector, DisabledHeadDetector)
    assert detector.mode == HeadDetectorMode.DISABLED
    assert detector.ready is True


@pytest.mark.parametrize("mode", ["disabled", "off", "none", "false", "0"])
def test_build_head_detector_disabled_aliases(mode: str) -> None:
    detector = build_head_detector(SimpleNamespace(head_detector_mode=mode))

    assert isinstance(detector, DisabledHeadDetector)
    assert detector.mode == HeadDetectorMode.DISABLED


@pytest.mark.parametrize("mode", ["mock", "test", "stub"])
def test_build_head_detector_mock_aliases(mode: str) -> None:
    detector = build_head_detector(SimpleNamespace(head_detector_mode=mode))

    assert isinstance(detector, MockHeadDetector)
    assert detector.mode == HeadDetectorMode.MOCK


def test_legacy_geometry_fallback_is_disabled_unless_flag_is_true() -> None:
    detector = build_head_detector(
        SimpleNamespace(
            head_detector_mode="legacy_geometry",
            allow_legacy_geometry_head_fallback=False,
            legacy_geometry_head_fallback_actionable=False,
        )
    )

    assert isinstance(detector, DisabledHeadDetector)
    assert detector.failure_reason is not None
    assert "ALLOW_LEGACY_GEOMETRY_HEAD_FALLBACK" in detector.failure_reason


def test_legacy_geometry_fallback_can_be_created_but_is_not_actionable_by_default() -> None:
    detector = build_head_detector(
        SimpleNamespace(
            head_detector_mode="legacy_geometry",
            allow_legacy_geometry_head_fallback=True,
            legacy_geometry_head_fallback_actionable=False,
        )
    )

    assert isinstance(detector, LegacyGeometryHeadDetector)
    obs = detector.detect_for_observation(frame=_frame(), observation=_observation(), timestamp_seconds=1.0)
    assert obs.legacy_geometry_used is True
    assert obs.classifier_may_run is False
    assert "classifier_not_scheduled_legacy_geometry" in obs.reason_codes


def test_unknown_head_detector_mode_fails_closed() -> None:
    detector = build_head_detector(SimpleNamespace(head_detector_mode="some_future_mode"))

    assert isinstance(detector, DisabledHeadDetector)
    assert detector.failure_reason == "unsupported head detector mode: some_future_mode"


# -----------------------------------------------------------------------------
# HeadObservation and HeadDetector behavior
# -----------------------------------------------------------------------------


def test_disabled_head_detector_returns_head_not_detected_and_classifier_is_forbidden() -> None:
    obs = DisabledHeadDetector().detect_for_observation(
        frame=_frame(),
        observation=_observation(),
        timestamp_seconds=3.0,
    )

    assert obs.status == HeadObservationStatus.HEAD_NOT_DETECTED
    assert obs.head_bbox is None
    assert obs.is_actionable is False
    assert obs.classifier_may_run is False
    assert should_schedule_headwear_classifier(obs) is False
    assert "classifier_not_scheduled_without_head" in obs.reason_codes


def test_mock_head_detector_without_scripted_head_is_not_detected() -> None:
    obs = MockHeadDetector().detect_for_observation(
        frame=_frame(),
        observation=_observation(track_id=42, episode_id="episode_42"),
        timestamp_seconds=1.25,
    )

    assert obs.status == HeadObservationStatus.HEAD_NOT_DETECTED
    assert obs.reason_codes == ["mock_head_not_detected"]
    assert obs.classifier_may_run is False


def test_mock_head_detector_with_single_valid_head_is_actionable() -> None:
    candidate = HeadDetectionCandidate(head_bbox=_head_bbox(), confidence=0.94, class_name="head", source_model="mock")
    detector = MockHeadDetector(scripted_by_track_id={7: candidate})

    obs = detector.detect_for_observation(frame=_frame(), observation=_observation(track_id=7), timestamp_seconds=2.0)

    assert obs.status == HeadObservationStatus.ACTIONABLE
    assert obs.head_bbox == _head_bbox()
    assert obs.is_actionable is True
    assert obs.classifier_may_run is True
    assert should_schedule_headwear_classifier(obs) is True
    assert obs.crop_source == "head_detector"
    assert obs.legacy_geometry_used is False


def test_mock_head_detector_can_script_by_episode_id() -> None:
    candidate = HeadDetectionCandidate(head_bbox=_head_bbox(101, 41, 146, 89), confidence=0.88, source_model="mock")
    detector = MockHeadDetector(scripted_by_episode_id={"episode_99": candidate})

    obs = detector.detect_for_observation(
        frame=_frame(),
        observation=_observation(track_id=99, episode_id="episode_99"),
        timestamp_seconds=2.0,
    )

    assert obs.status == HeadObservationStatus.ACTIONABLE
    assert obs.episode_id == "episode_99"
    assert obs.classifier_may_run is True


def test_mock_head_detector_rejects_multiple_heads_as_ambiguous() -> None:
    detector = MockHeadDetector(
        scripted_by_track_id={
            7: [
                HeadDetectionCandidate(head_bbox=_head_bbox(), confidence=0.94, source_model="mock"),
                HeadDetectionCandidate(head_bbox=_head_bbox(110, 45, 150, 92), confidence=0.93, source_model="mock"),
            ]
        }
    )

    obs = detector.detect_for_observation(frame=_frame(), observation=_observation(), timestamp_seconds=2.0)

    assert obs.status == HeadObservationStatus.AMBIGUOUS_HEAD
    assert obs.head_bbox is None
    assert obs.is_actionable is False
    assert obs.classifier_may_run is False
    assert "classifier_not_scheduled_ambiguous_head" in obs.reason_codes


def test_mock_head_detector_rejects_too_small_head_crop() -> None:
    candidate = HeadDetectionCandidate(head_bbox=BBox(x1=100, y1=40, x2=105, y2=45), confidence=0.94)
    detector = MockHeadDetector(scripted_by_track_id={7: candidate})

    obs = detector.detect_for_observation(frame=_frame(), observation=_observation(), timestamp_seconds=2.0)

    assert obs.status == HeadObservationStatus.HEAD_UNUSABLE
    assert obs.classifier_may_run is False
    assert "head_bbox_too_small" in obs.reason_codes


def test_mock_head_detector_rejects_head_bbox_touching_frame_border() -> None:
    candidate = HeadDetectionCandidate(head_bbox=BBox(x1=100, y1=0, x2=145, y2=45), confidence=0.94)
    detector = MockHeadDetector(scripted_by_track_id={7: candidate})

    obs = detector.detect_for_observation(frame=_frame(), observation=_observation(), timestamp_seconds=2.0)

    assert obs.status == HeadObservationStatus.HEAD_CROPPED_BY_BORDER
    assert obs.classifier_may_run is False
    assert "head_cropped_by_border" in obs.reason_codes


def test_mock_head_detector_rejects_head_outside_person_bbox() -> None:
    candidate = HeadDetectionCandidate(head_bbox=BBox(x1=220, y1=20, x2=280, y2=80), confidence=0.94)
    detector = MockHeadDetector(scripted_by_track_id={7: candidate})

    obs = detector.detect_for_observation(frame=_frame(), observation=_observation(), timestamp_seconds=2.0)

    assert obs.status == HeadObservationStatus.HEAD_UNUSABLE
    assert obs.classifier_may_run is False
    assert any(code in obs.reason_codes for code in ["head_bbox_not_inside_person_bbox", "head_bbox_not_associated_with_person"])


@pytest.mark.parametrize(
    "status",
    [
        HeadObservationStatus.HEAD_NOT_DETECTED,
        HeadObservationStatus.HEAD_OCCLUDED,
        HeadObservationStatus.HEAD_CROPPED_BY_BORDER,
        HeadObservationStatus.HEAD_UNUSABLE,
        HeadObservationStatus.AMBIGUOUS_HEAD,
        HeadObservationStatus.DETECTOR_DISABLED,
        HeadObservationStatus.UNKNOWN,
    ],
)
def test_non_actionable_head_statuses_never_schedule_classifier(status: HeadObservationStatus) -> None:
    obs = _head_observation(status=status, head_bbox=None, is_actionable=False, reason_codes=[status.value])

    assert obs.classifier_may_run is False
    assert should_schedule_headwear_classifier(obs) is False


# -----------------------------------------------------------------------------
# Head-person association
# -----------------------------------------------------------------------------


def test_associator_returns_not_detected_when_no_head_candidate_matches_person() -> None:
    assoc = HeadPersonAssociator()

    result = assoc.associate_for_observation(
        camera_id="camera_001",
        frame_index=1,
        timestamp_seconds=1.0,
        observation=_observation(),
        candidates=[],
        frame_shape=_frame().shape,
        source_model="mock_head_detector",
    )

    assert result.status == HeadPersonAssociationStatus.NOT_DETECTED
    assert result.observation.status == HeadObservationStatus.HEAD_NOT_DETECTED
    assert result.observation.classifier_may_run is False
    assert "head_not_detected_for_person" in result.reason_codes


def test_associator_selects_valid_head_candidate_inside_upper_person_zone() -> None:
    assoc = HeadPersonAssociator()
    candidate = HeadDetectionCandidate(head_bbox=_head_bbox(), confidence=0.93, source_model="mock_head_detector")

    result = assoc.associate_for_observation(
        camera_id="camera_001",
        frame_index=1,
        timestamp_seconds=1.0,
        observation=_observation(),
        candidates=[candidate],
        frame_shape=_frame().shape,
        source_model="mock_head_detector",
    )

    assert result.status == HeadPersonAssociationStatus.ASSOCIATED
    assert result.observation.status == HeadObservationStatus.ACTIONABLE
    assert result.observation.head_bbox == _head_bbox()
    assert result.observation.classifier_may_run is True
    assert result.score > 0.0


def test_associator_rejects_candidate_outside_person_bbox() -> None:
    assoc = HeadPersonAssociator()
    candidate = HeadDetectionCandidate(head_bbox=BBox(x1=230, y1=40, x2=280, y2=90), confidence=0.93)

    result = assoc.associate_for_observation(
        camera_id="camera_001",
        frame_index=1,
        timestamp_seconds=1.0,
        observation=_observation(),
        candidates=[candidate],
        frame_shape=_frame().shape,
        source_model="mock_head_detector",
    )

    assert result.status == HeadPersonAssociationStatus.NOT_DETECTED
    assert result.observation.classifier_may_run is False


def test_associator_marks_close_scores_as_ambiguous() -> None:
    assoc = HeadPersonAssociator(HeadPersonAssociationConfig(ambiguity_score_delta=0.20))
    candidates = [
        HeadDetectionCandidate(head_bbox=_head_bbox(100, 40, 145, 88), confidence=0.92),
        HeadDetectionCandidate(head_bbox=_head_bbox(102, 41, 147, 89), confidence=0.90),
    ]

    result = assoc.associate_for_observation(
        camera_id="camera_001",
        frame_index=1,
        timestamp_seconds=1.0,
        observation=_observation(),
        candidates=candidates,
        frame_shape=_frame().shape,
        source_model="mock_head_detector",
    )

    assert result.status == HeadPersonAssociationStatus.AMBIGUOUS
    assert result.observation.status == HeadObservationStatus.AMBIGUOUS_HEAD
    assert result.observation.classifier_may_run is False
    assert "multiple_heads_match_person" in result.reason_codes


def test_associator_rejects_border_cropped_head() -> None:
    assoc = HeadPersonAssociator(HeadPersonAssociationConfig(reject_border_cropped=True))
    candidate = HeadDetectionCandidate(head_bbox=BBox(x1=90, y1=0, x2=140, y2=45), confidence=0.93)

    result = assoc.associate_for_observation(
        camera_id="camera_001",
        frame_index=1,
        timestamp_seconds=1.0,
        observation=_observation(bbox=BBox(x1=80, y1=0, x2=170, y2=210)),
        candidates=[candidate],
        frame_shape=_frame().shape,
        source_model="mock_head_detector",
    )

    assert result.status == HeadPersonAssociationStatus.REJECTED
    assert result.observation.status == HeadObservationStatus.HEAD_CROPPED_BY_BORDER
    assert result.observation.classifier_may_run is False


def test_associator_can_associate_head_only_visible_near_lower_frame_if_person_binding_exists() -> None:
    person_bbox = BBox(x1=80, y1=130, x2=170, y2=235)
    visible_low_head = BBox(x1=100, y1=135, x2=145, y2=180)
    result = HeadPersonAssociator().associate_for_observation(
        camera_id="camera_001",
        frame_index=1,
        timestamp_seconds=1.0,
        observation=_observation(bbox=person_bbox),
        candidates=[HeadDetectionCandidate(head_bbox=visible_low_head, confidence=0.94)],
        frame_shape=_frame().shape,
        source_model="mock_head_detector",
    )

    assert result.status == HeadPersonAssociationStatus.ASSOCIATED
    assert result.observation.head_bbox == visible_low_head
    assert result.observation.classifier_may_run is True


# -----------------------------------------------------------------------------
# Headwear classifier guard: only clean head crop may be classified
# -----------------------------------------------------------------------------


def test_assess_head_observation_returns_unknown_and_does_not_call_model_without_actionable_head(monkeypatch: pytest.MonkeyPatch) -> None:
    detector = HeadwearDetector(_settings(headwear_detector_mode="onnx_classifier"))
    frame = _frame()
    observation = _observation()
    head_observation = _head_observation(
        status=HeadObservationStatus.HEAD_NOT_DETECTED,
        head_bbox=None,
        is_actionable=False,
        reason_codes=["head_not_detected"],
    )

    def fail_if_called(*args: object, **kwargs: object) -> object:
        raise AssertionError("headwear classifier must not run without actionable real head bbox")

    monkeypatch.setattr(detector, "_assess_classifier", fail_if_called)
    monkeypatch.setattr(detector, "_assess_detector", fail_if_called)
    monkeypatch.setattr(detector, "_extract_person_crop_bundle", fail_if_called)

    result = detector.assess_head_observation(
        frame=frame,
        observation=observation,
        head_observation=head_observation,
    )

    assert result.signal == ComplianceSignal.UNKNOWN
    assert result.reason == "head_not_detected"
    assert "classifier_not_scheduled_without_actionable_head" in result.reason_codes


def test_assess_head_observation_uses_head_crop_not_person_crop(monkeypatch: pytest.MonkeyPatch) -> None:
    detector = HeadwearDetector(_settings(headwear_detector_mode="onnx_classifier"))
    detector._session = object()
    detector._input_name = "input"
    frame = _frame()
    observation = _observation()
    head_observation = _head_observation(status=HeadObservationStatus.ACTIONABLE, head_bbox=_head_bbox(), is_actionable=True)
    captured: dict[str, tuple[int, int]] = {}

    def fake_classifier(crop: np.ndarray) -> HeadwearAssessment:
        captured["shape"] = tuple(crop.shape[:2])
        return HeadwearAssessment(
            signal=ComplianceSignal.VIOLATION,
            confidence=0.91,
            reason="test_classifier_violation",
            label="head_no_headwear",
            model_name="fake_classifier",
        )

    def fail_person_crop(*args: object, **kwargs: object) -> object:
        raise AssertionError("person crop must not be extracted on assess_head_observation path")

    monkeypatch.setattr(detector, "_assess_classifier", fake_classifier)
    monkeypatch.setattr(detector, "_extract_person_crop_bundle", fail_person_crop)

    result = detector.assess_head_observation(frame=frame, observation=observation, head_observation=head_observation)

    assert result.signal == ComplianceSignal.VIOLATION
    assert captured["shape"] == (_head_bbox().height, _head_bbox().width)


def test_production_policy_refuses_legacy_person_crop_path() -> None:
    detector = HeadwearDetector(_settings(headwear_model_policy="production"))

    with pytest.raises(RuntimeError, match="refused non-head crop input"):
        detector._assert_classifier_input_crop_type("person")


def test_legacy_assess_observation_is_blocked_in_production_without_geometry_fallback() -> None:
    detector = HeadwearDetector(_settings(headwear_model_policy="production", allow_legacy_geometry_head_fallback=False))

    result = detector.assess_observation(frame=_frame(), observation=_observation())

    assert result.signal == ComplianceSignal.UNKNOWN
    assert result.reason == "head_detector_required"
    assert "classifier_not_scheduled_without_head" in result.reason_codes


def test_head_crop_unavailable_is_unknown_not_violation() -> None:
    detector = HeadwearDetector(_settings(headwear_detector_mode="onnx_classifier"))
    head_observation = _head_observation(
        status=HeadObservationStatus.ACTIONABLE,
        head_bbox=BBox(x1=10, y1=10, x2=11, y2=11),
        is_actionable=True,
    )

    result = detector.assess_head_observation(frame=_frame(), observation=_observation(), head_observation=head_observation)

    assert result.signal == ComplianceSignal.UNKNOWN
    assert result.reason == "head_crop_unavailable"
    assert "head_crop_rejected" in result.reason_codes


# -----------------------------------------------------------------------------
# HeadwearObservation DTO contract
# -----------------------------------------------------------------------------


def test_build_headwear_observation_forces_unknown_when_head_is_not_actionable_even_if_assessment_says_violation() -> None:
    assessment = HeadwearAssessment(signal=ComplianceSignal.VIOLATION, confidence=0.99, reason="bad_upstream_violation")
    head_obs = _head_observation(
        status=HeadObservationStatus.HEAD_NOT_DETECTED,
        head_bbox=None,
        is_actionable=False,
        reason_codes=["head_not_detected"],
    )

    dto = build_headwear_observation_from_assessment(
        assessment=assessment,
        track_binding=_binding(is_actionable=True, head_bbox=None),
        head_observation=head_obs,
    )

    assert dto.signal == ComplianceSignal.UNKNOWN
    assert dto.status == ComplianceSignal.UNKNOWN.value
    assert dto.classifier_input_crop_type == "none"
    assert dto.is_actionable is False
    assert dto.is_valid_for_incident_window is False
    assert "classifier_not_scheduled_without_actionable_head" in dto.reason_codes


def test_build_headwear_observation_keeps_violation_only_for_actionable_head_crop() -> None:
    assessment = HeadwearAssessment(signal=ComplianceSignal.VIOLATION, confidence=0.91, reason="head_no_headwear")
    head_obs = _head_observation(status=HeadObservationStatus.ACTIONABLE, head_bbox=_head_bbox(), is_actionable=True)

    dto = build_headwear_observation_from_assessment(
        assessment=assessment,
        track_binding=_binding(is_actionable=True, head_bbox=_head_bbox()),
        head_observation=head_obs,
    )

    assert dto.signal == ComplianceSignal.VIOLATION
    assert dto.classifier_input_crop_type == "head"
    assert dto.is_actionable is True
    assert dto.is_valid_for_incident_window is True
    assert dto.is_violation is True


def test_track_episode_binding_without_episode_is_not_actionable() -> None:
    binding = TrackEpisodeBinding.from_track_observation(
        observation=_observation(episode_id=None),
        timestamp_seconds=1.0,
        head_observation=_head_observation(status=HeadObservationStatus.ACTIONABLE, head_bbox=_head_bbox()),
    )

    assert binding.episode_id is None
    assert binding.status == "unbound"
    assert binding.is_actionable is False
    assert "track_episode_missing" in binding.reason_codes


# -----------------------------------------------------------------------------
# Incident engine with HeadwearObservation input
# -----------------------------------------------------------------------------


def test_incident_engine_does_not_create_case_for_unknown_or_non_actionable_head_state() -> None:
    engine = IncidentEngine(_settings())

    result = engine.process_headwear_observation(
        headwear_observation=_headwear_observation(
            signal=ComplianceSignal.UNKNOWN,
            is_actionable=False,
            classifier_input_crop_type="none",
            reason_codes=["head_not_detected"],
        ),
        track_binding=_binding(head_bbox=None),
    )

    assert result.case is None
    assert result.opened is False
    assert engine.snapshot() == []


@pytest.mark.parametrize(
    "reason_code",
    [
        "head_not_detected",
        "head_occluded",
        "head_cropped_by_border",
        "head_unusable",
        "ambiguous_head",
        "not_visible",
        "not_evaluable",
        "classifier_not_scheduled_without_actionable_head",
    ],
)
def test_incident_engine_blocks_violation_signal_when_non_actionable_reason_code_is_present(reason_code: str) -> None:
    engine = IncidentEngine(_settings())

    result = engine.process_headwear_observation(
        headwear_observation=_headwear_observation(
            signal=ComplianceSignal.VIOLATION,
            is_actionable=True,
            classifier_input_crop_type="head",
            reason_codes=[reason_code],
        ),
        track_binding=_binding(),
    )

    assert result.case is None
    assert engine.snapshot() == []


def test_incident_engine_creates_and_opens_case_after_stable_actionable_no_headwear_sequence() -> None:
    engine = IncidentEngine(_settings(incident_open_min_valid=2, incident_open_violation_ratio=1.0, incident_open_min_duration_sec=0.0))
    base_time = datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc)

    first = engine.process_headwear_observation(
        headwear_observation=_headwear_observation(signal=ComplianceSignal.VIOLATION, observed_at=base_time),
        track_binding=_binding(observed_at=base_time),
    )
    first_state_before_second = first.case.state if first.case is not None else None
    second = engine.process_headwear_observation(
        headwear_observation=_headwear_observation(signal=ComplianceSignal.VIOLATION, observed_at=base_time + timedelta(seconds=1)),
        track_binding=_binding(observed_at=base_time + timedelta(seconds=1)),
    )

    assert first.case is not None
    assert first_state_before_second == IncidentState.CANDIDATE
    assert second.case is not None
    assert second.case.state == IncidentState.OPEN
    assert second.opened is True
    assert len(engine.snapshot()) == 1


def test_incident_engine_does_not_create_case_for_allowed_sequence() -> None:
    engine = IncidentEngine(_settings(incident_open_min_valid=2, incident_open_min_duration_sec=0.0))
    base_time = datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc)

    for index in range(4):
        engine.process_headwear_observation(
            headwear_observation=_headwear_observation(signal=ComplianceSignal.COMPLIANT, observed_at=base_time + timedelta(seconds=index)),
            track_binding=_binding(observed_at=base_time + timedelta(seconds=index)),
        )

    assert engine.snapshot() == []


def test_allowed_then_head_not_detected_does_not_turn_into_violation() -> None:
    engine = IncidentEngine(_settings(incident_open_min_valid=2, incident_open_min_duration_sec=0.0))
    base_time = datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc)

    engine.process_headwear_observation(
        headwear_observation=_headwear_observation(signal=ComplianceSignal.COMPLIANT, observed_at=base_time),
        track_binding=_binding(observed_at=base_time),
    )
    engine.process_headwear_observation(
        headwear_observation=_headwear_observation(
            signal=ComplianceSignal.UNKNOWN,
            is_actionable=False,
            classifier_input_crop_type="none",
            reason_codes=["head_not_detected"],
            observed_at=base_time + timedelta(seconds=1),
        ),
        track_binding=_binding(head_bbox=None, observed_at=base_time + timedelta(seconds=1)),
    )

    assert engine.snapshot() == []


def test_unknown_forbidden_head_status_is_not_mixed_with_no_headwear_violation() -> None:
    engine = IncidentEngine(_settings(incident_open_min_valid=2, incident_open_violation_ratio=1.0, incident_open_min_duration_sec=0.0))
    base_time = datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc)

    engine.process_headwear_observation(
        headwear_observation=_headwear_observation(
            signal=ComplianceSignal.UNKNOWN,
            is_actionable=False,
            classifier_input_crop_type="none",
            reason_codes=["head_unknown"],
            observed_at=base_time,
        ),
        track_binding=_binding(observed_at=base_time),
    )
    result = engine.process_headwear_observation(
        headwear_observation=_headwear_observation(signal=ComplianceSignal.VIOLATION, observed_at=base_time + timedelta(seconds=1)),
        track_binding=_binding(observed_at=base_time + timedelta(seconds=1)),
    )

    assert result.case is not None
    assert result.case.state == IncidentState.CANDIDATE
    assert result.opened is False


# -----------------------------------------------------------------------------
# Runtime guard around the new chain without running video/models
# -----------------------------------------------------------------------------


class _FakeHeadDetector:
    def __init__(self, head_observation: HeadObservation) -> None:
        self.head_observation = head_observation
        self.calls = 0

    def detect_for_observation(self, **kwargs: object) -> HeadObservation:
        self.calls += 1
        return self.head_observation


class _FakeHeadwearDetector:
    def __init__(self, assessment: HeadwearAssessment | None = None) -> None:
        self.assessment = assessment or HeadwearAssessment(signal=ComplianceSignal.VIOLATION, confidence=0.95, reason="fake_no_headwear")
        self.calls = 0

    def assess_head_observation(self, **kwargs: object) -> HeadwearAssessment:
        self.calls += 1
        return self.assessment


class _FakeIncidentEngine:
    def __init__(self) -> None:
        self.calls = 0

    def process_headwear_observation(self, **kwargs: object) -> SimpleNamespace:
        self.calls += 1
        return SimpleNamespace(case=None)


class _FakeRegistry:
    def __init__(self) -> None:
        self.calls = []

    def mark_headwear_result(self, **kwargs: object) -> None:
        self.calls.append(kwargs)


class _FakeMetrics:
    def __init__(self) -> None:
        self.rows = []

    def record_observation(self, **kwargs: object) -> None:
        self.rows.append(kwargs)


def _runtime_service_for_unit(head_observation: HeadObservation, assessment: HeadwearAssessment | None = None) -> VisionRuntimeService:
    service = object.__new__(VisionRuntimeService)
    service._settings = SimpleNamespace(headwear_pre_skip_unusable=False, headwear_model_policy="production", headwear_incidents_enabled=True)
    service._head_detector = _FakeHeadDetector(head_observation)
    service._headwear_detector = _FakeHeadwearDetector(assessment)
    service._incident_engine = _FakeIncidentEngine()
    service._track_episode_registry = _FakeRegistry()
    service._metrics = _FakeMetrics()
    return service


def test_runtime_calls_head_detector_but_not_classifier_when_head_not_detected() -> None:
    head_observation = _head_observation(
        status=HeadObservationStatus.HEAD_NOT_DETECTED,
        head_bbox=None,
        is_actionable=False,
        reason_codes=["head_not_detected"],
    )
    service = _runtime_service_for_unit(head_observation)
    track = _tracked_person()
    observation = _observation(headwear_context_usable=True)
    bundle = _FrameObservationBundle(track=track, quality=observation.quality, episode_assignment=None, observation=observation)  # type: ignore[arg-type]

    result = service._process_headwear_and_incidents(frame=_frame(), bundles=[bundle], run_headwear=True)

    assert service._head_detector.calls == 1
    assert service._headwear_detector.calls == 0
    assert service._incident_engine.calls == 1
    assert result.headwear_model_called_count == 0
    assert result.headwear_classification_not_scheduled_count == 1
    assert bundle.headwear is not None
    assert bundle.headwear.signal == ComplianceSignal.UNKNOWN
    assert bundle.headwear_observation is not None
    assert bundle.headwear_observation.signal == ComplianceSignal.UNKNOWN
    assert bundle.headwear_observation.classifier_input_crop_type == "none"


def test_runtime_calls_classifier_only_when_head_observation_is_actionable() -> None:
    head_observation = _head_observation(status=HeadObservationStatus.ACTIONABLE, head_bbox=_head_bbox(), is_actionable=True)
    service = _runtime_service_for_unit(
        head_observation,
        HeadwearAssessment(signal=ComplianceSignal.VIOLATION, confidence=0.95, reason="fake_no_headwear"),
    )
    track = _tracked_person()
    observation = _observation(headwear_context_usable=True)
    bundle = _FrameObservationBundle(track=track, quality=observation.quality, episode_assignment=None, observation=observation)  # type: ignore[arg-type]

    result = service._process_headwear_and_incidents(frame=_frame(), bundles=[bundle], run_headwear=True)

    assert service._head_detector.calls == 1
    assert service._headwear_detector.calls == 1
    assert service._incident_engine.calls == 1
    assert result.headwear_model_called_count == 1
    assert bundle.headwear_observation is not None
    assert bundle.headwear_observation.classifier_input_crop_type == "head"


def test_runtime_source_contains_new_head_chain_calls() -> None:
    source = inspect.getsource(VisionRuntimeService._process_headwear_and_incidents)

    assert "self._head_detector.detect_for_observation" in source
    assert "self._headwear_detector.assess_head_observation" in source
    assert "build_headwear_observation_from_assessment" in source
    assert "process_headwear_observation" in source


# -----------------------------------------------------------------------------
# Storage boundaries: clean dataset/evidence images, no overlays for collection
# -----------------------------------------------------------------------------


def test_person_crop_dataset_store_saves_clean_frame_and_crop_without_overlay_metadata(tmp_path: Path) -> None:
    frame = _frame()
    frame[50:70, 100:130] = (10, 200, 50)
    store = PersonCropDatasetStore(
        root=tmp_path,
        camera_id="camera_001",
        source_url="synthetic.mp4",
        save_frames=True,
        save_rejected=True,
        session_started_at=datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
    )
    try:
        record = store.save_sample(
            frame=frame,
            track=_tracked_person(bbox=_bbox()),
            decision=None,
            frame_index=1,
            timestamp_seconds=1.0,
            observed_at=datetime(2026, 5, 22, 10, 0, 1, tzinfo=timezone.utc),
            accepted=True,
        )
    finally:
        store.close()

    assert record is not None
    assert Path(record.frame_path).exists()
    assert Path(record.crop_path).exists()
    assert "overlay" not in record.crop_path.lower()
    assert "annotated" not in record.crop_path.lower()
    assert "bbox" not in record.crop_path.lower()

    saved_crop = cv2.imread(record.crop_path)
    expected_crop = frame[_bbox().y1:_bbox().y2, _bbox().x1:_bbox().x2]
    assert saved_crop is not None
    assert saved_crop.shape[:2] == expected_crop.shape[:2]

    manifest_rows = list(csv.DictReader(store.manifest_path.open("r", encoding="utf-8-sig"), delimiter=";"))
    assert len(manifest_rows) == 1
    assert manifest_rows[0]["accepted"] == "1"
    assert "crop_path" in manifest_rows[0]


def test_person_crop_dataset_store_does_not_save_rejected_samples_when_disabled(tmp_path: Path) -> None:
    store = PersonCropDatasetStore(
        root=tmp_path,
        camera_id="camera_001",
        source_url="synthetic.mp4",
        save_frames=True,
        save_rejected=False,
        session_started_at=datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
    )
    try:
        record = store.save_sample(
            frame=_frame(),
            track=_tracked_person(),
            decision=None,
            frame_index=1,
            timestamp_seconds=1.0,
            observed_at=datetime(2026, 5, 22, 10, 0, 1, tzinfo=timezone.utc),
            accepted=False,
        )
    finally:
        store.close()

    assert record is None
    assert store.rejected_count == 1
    assert not any((store.session_dir / "crops" / "rejected").glob("*.jpg"))


def test_frame_store_saves_real_head_crop_only_when_head_bbox_is_provided(tmp_path: Path) -> None:
    store = FrameStore(str(tmp_path), jpeg_quality=95)
    frame = _frame()

    record = store.save_incident_evidence(
        frame=frame,
        camera_id="camera_001",
        observed_at=datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
        frame_index=1,
        track_id=7,
        track_episode_id="episode_7",
        incident_id="incident_1",
        bbox=_bbox(),
        head_bbox=_head_bbox(),
        quality_score=0.9,
        headwear_status="violation",
        reason_codes=["actionable_headwear_violation"],
        min_quality_score=0.1,
    )

    assert record is not None
    assert record.image_path is not None
    assert record.crop_path is not None
    assert record.head_crop_path is not None
    assert "head_crop" in record.head_crop_path


def test_frame_store_does_not_invent_head_crop_when_head_bbox_is_absent(tmp_path: Path) -> None:
    store = FrameStore(str(tmp_path), jpeg_quality=95)

    record = store.save_incident_evidence(
        frame=_frame(),
        camera_id="camera_001",
        observed_at=datetime(2026, 5, 22, 10, 0, 0, tzinfo=timezone.utc),
        frame_index=1,
        track_id=7,
        track_episode_id="episode_7",
        incident_id="incident_1",
        bbox=_bbox(),
        head_bbox=None,
        quality_score=0.9,
        headwear_status="violation",
        reason_codes=["legacy_person_crop_violation_should_not_have_head_crop"],
        min_quality_score=0.1,
    )

    assert record is not None
    assert record.crop_path is not None
    assert record.head_crop_path is None


# -----------------------------------------------------------------------------
# Documentation/source-level regression guards for high-risk old behavior
# -----------------------------------------------------------------------------


def test_headwear_detector_has_public_head_observation_api() -> None:
    assert hasattr(HeadwearDetector, "assess_head_observation")
    source = inspect.getsource(HeadwearDetector.assess_head_observation)
    assert "_reject_head_observation_for_headwear" in source
    assert "_assess_head_crop_candidate" in source


def test_low_level_person_crop_classifier_path_is_guarded_in_production_source() -> None:
    source = inspect.getsource(HeadwearDetector._assert_classifier_input_crop_type)

    assert "policy == \"production\"" in source
    assert "refused non-head crop input" in source


def test_runtime_evidence_capture_signature_accepts_head_observation_and_headwear_observation() -> None:
    signature = inspect.signature(VisionRuntimeService._capture_violation_evidence_after_incident_decision)

    assert "head_observation" in signature.parameters
    assert "headwear_observation" in signature.parameters
