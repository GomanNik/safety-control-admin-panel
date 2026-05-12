# ============================================================
# File: vision/tests/test_runtime_human_observation_stage2.py
# Purpose:
# - Verifies runtime-facing HumanObservation construction contract.
# - Focuses on negative/edge behavior instead of only happy path.
# ============================================================

from __future__ import annotations

from datetime import datetime, timezone

from app.models.schemas import BBox, QualityAssessment
from app.pipeline.human_observation import ObservationType, build_human_observation_from_tracking
from app.pipeline.tracking_types import (
    DayPersonAssignment,
    DayPersonAssignmentKind,
    DayPersonIdentityState,
    ExternalTrackState,
    TrackedPersonObservation,
    TrackingBackendType,
)


def _quality(*, valid: bool = True, score: float = 0.92, head_visible: bool = True) -> QualityAssessment:
    return QualityAssessment(
        is_valid=valid,
        quality_score=score,
        head_visible=head_visible,
        is_cropped=False,
        occlusion_ratio=0.0,
        bbox_area_ratio=0.08,
        reasons=[],
        reason_codes=[],
        is_usable_for_identity=valid,
        is_usable_for_headwear=valid and head_visible,
        is_low_quality=not valid,
        is_truncated=False,
        is_occluded=False,
    )


def _track(*, observed_at: datetime, track_id: int = 1, bbox: BBox | None = None) -> TrackedPersonObservation:
    return TrackedPersonObservation(
        track_id=track_id,
        bbox=bbox or BBox(x1=100, y1=20, x2=220, y2=430),
        confidence=0.90,
        observed_at=observed_at,
        frame_index=3,
        track_state=ExternalTrackState.TRACKED,
        track_age=3,
        track_hits=3,
        time_since_update=0,
        class_id=0,
        class_name="person",
        detector_confidence=0.90,
        tracking_confidence=0.90,
        embedding=None,
        embedding_quality=0.0,
        source_backend=TrackingBackendType.ULTRALYTICS,
        is_confirmed_track=True,
        is_visible=True,
        is_shadow=False,
        shadow_of_track_id=None,
        reason_codes=[],
    )


def _assignment(track_id: int) -> DayPersonAssignment:
    return DayPersonAssignment(
        track_id=track_id,
        day_person_id=None,
        candidate_id=None,
        kind=DayPersonAssignmentKind.UNKNOWN,
        state=DayPersonIdentityState.UNKNOWN,
        confidence=0.0,
        stable_hits=0,
        reason="runtime_test",
        reason_codes=[],
    )


def test_observed_at_is_passed_from_runtime_context() -> None:
    observed_at = datetime(2026, 2, 3, 4, 5, 6, tzinfo=timezone.utc)

    observation = build_human_observation_from_tracking(
        camera_id="cam_runtime",
        tracked_observation=_track(observed_at=observed_at, track_id=1),
        assignment=_assignment(1),
        quality=_quality(),
        frame_shape=(480, 640, 3),
    )

    assert observation.observed_at is observed_at
    assert observation.track_id == 1
    assert observation.day_person_id is None


def test_low_quality_observation_is_not_usable_downstream() -> None:
    observation = build_human_observation_from_tracking(
        camera_id="cam_1",
        tracked_observation=_track(
            observed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            track_id=2,
            bbox=BBox(x1=10, y1=10, x2=30, y2=42),
        ),
        assignment=_assignment(2),
        quality=_quality(valid=False, score=0.10, head_visible=False),
        frame_shape=(480, 640, 3),
    )

    assert observation.observation_type == ObservationType.UNKNOWN
    assert observation.is_usable_for_registry is False
    assert observation.is_usable_for_headwear is False
    assert observation.is_usable_for_incident is False
    assert observation.is_low_quality is True
