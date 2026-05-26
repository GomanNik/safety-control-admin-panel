# ============================================================
# File: vision/tests/test_track_episode_registry_production_semantics.py
# Purpose:
# - Regression tests for the canonical track/episode semantics.
# - A tracker id is a volatile technical id; a track episode is one
#   anonymous visible worker in the camera view during a continuous passage.
# - Head/headwear visibility must not be required to create/keep an episode.
# ============================================================

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.config import Settings
from app.models.schemas import BBox, QualityAssessment, TrackEpisodeStatus
from app.pipeline.person_box_gate import PersonBoxGate
from app.pipeline.track_episode_registry import TrackEpisodeRegistry
from app.pipeline.tracking_types import (
    ExternalTrackState,
    TrackedPersonObservation,
    TrackingBackendType,
    TrackingDiagnostics,
    TrackingFrameResult,
)


def _settings(**overrides: object) -> Settings:
    defaults = dict(
        person_tracking_backend="development_simple",
        person_tracking_allow_dev_simple=True,
        person_tracking_require_external=False,
        runtime_require_real_headwear=False,
        track_episode_min_promote_hits=1,
        track_episode_fast_promote_hits=1,
        track_episode_min_stable_hits=1,
        track_episode_min_promote_quality=0.20,
        track_episode_fast_promote_quality=0.20,
        track_episode_require_head_for_new=False,
        track_episode_rebind_enabled=True,
        track_episode_rebind_max_frame_gap=12,
        track_episode_rebind_min_score=0.45,
        track_episode_rebind_max_center_shift_ratio=0.75,
        track_episode_rebind_min_size_similarity=0.30,
        track_episode_prevent_covisible_rebind=True,
        min_quality_score=0.20,
    )
    defaults.update(overrides)
    return Settings(**defaults)


def _time(frame_index: int) -> datetime:
    return datetime(2026, 5, 22, 12, 0, 0, tzinfo=timezone.utc) + timedelta(seconds=frame_index)


def _track(
    *,
    track_id: int,
    frame_index: int,
    bbox: BBox | None = None,
    hits: int = 3,
    confidence: float = 0.92,
    visible: bool = True,
    shadow: bool = False,
    reason_codes: list[str] | None = None,
) -> TrackedPersonObservation:
    return TrackedPersonObservation(
        track_id=track_id,
        bbox=bbox or BBox(x1=100, y1=40, x2=230, y2=420),
        confidence=confidence,
        observed_at=_time(frame_index),
        frame_index=frame_index,
        track_state=ExternalTrackState.TRACKED,
        track_age=hits,
        track_hits=hits,
        time_since_update=0,
        class_id=0,
        class_name="person",
        detector_confidence=confidence,
        tracking_confidence=confidence,
        source_backend=TrackingBackendType.DEVELOPMENT_SIMPLE,
        is_confirmed_track=True,
        is_visible=visible,
        is_shadow=shadow,
        shadow_of_track_id=None,
        reason_codes=list(reason_codes or []),
    )


def _quality(
    *,
    valid: bool = True,
    score: float = 0.86,
    head_visible: bool = True,
    cropped: bool = False,
    bent_over: bool = False,
    lower_body_only: bool = False,
    limb_only: bool = False,
    interaction_risk: bool = False,
    reason_codes: list[str] | None = None,
) -> QualityAssessment:
    codes = list(reason_codes or [])
    return QualityAssessment(
        is_valid=valid,
        quality_score=score,
        head_visible=head_visible,
        is_cropped=cropped,
        occlusion_ratio=0.0,
        bbox_area_ratio=0.10,
        is_usable_for_tracking=valid,
        is_usable_for_headwear=valid and head_visible and not cropped,
        is_low_quality=not valid,
        is_truncated=cropped,
        is_occluded=False,
        is_partial_limb_only=limb_only,
        is_lower_body_only=lower_body_only,
        is_bent_over=bent_over,
        is_interaction_risk=interaction_risk,
        headwear_context_usable=valid and head_visible and not cropped,
        visibility_state="head_visible" if head_visible else "not_evaluable",
        reasons=codes,
        reason_codes=codes,
    )


def _frame_result(
    *,
    frame_index: int,
    visible_tracks: list[TrackedPersonObservation],
    lost_ids: list[int] | None = None,
    removed_ids: list[int] | None = None,
) -> TrackingFrameResult:
    return TrackingFrameResult(
        observed_at=_time(frame_index),
        frame_index=frame_index,
        visible_tracks=visible_tracks,
        lost_track_ids=list(lost_ids or []),
        removed_track_ids=list(removed_ids or []),
        backend=TrackingBackendType.DEVELOPMENT_SIMPLE,
        diagnostics=TrackingDiagnostics(
            backend_name="development_simple",
            model_path=None,
            tracker_config_path=None,
            processed_detections=len(visible_tracks),
            visible_tracks_count=len(visible_tracks),
            raw_tracks_count=len(visible_tracks),
        ),
    )


def test_person_box_gate_keeps_top_cropped_person_for_tracking_but_not_headwear() -> None:
    settings = _settings(person_box_gate_top_border_px=8, person_box_gate_min_height_px=80)
    gate = PersonBoxGate(settings)
    track = _track(track_id=1, frame_index=1, bbox=BBox(x1=40, y1=0, x2=250, y2=430))

    result = gate.filter_frame(
        tracking_result=_frame_result(frame_index=1, visible_tracks=[track]),
        frame_shape=(480, 640, 3),
    )

    assert [item.track_id for item in result.accepted_tracks] == [1]
    assert result.rejected_tracks == []
    decision = result.decisions_by_track_id[1]
    assert decision.accepted_for_tracking is True
    assert decision.accepted_for_headwear is False
    assert "person_box_rejected_top_cropped" in decision.reason_codes


def test_episode_is_created_when_person_is_visible_but_head_is_not_visible() -> None:
    registry = TrackEpisodeRegistry(_settings(), camera_id="cam_1")
    track = _track(track_id=1, frame_index=1)

    result = registry.update_frame(
        tracking_result=_frame_result(frame_index=1, visible_tracks=[track]),
        qualities_by_track_id={1: _quality(head_visible=False, cropped=True, reason_codes=["head_cropped_by_frame_border"])},
    )

    assignment = result.assignments_by_track_id[1]
    assert assignment.track_episode_id is not None
    assert assignment.reason != "candidate_track_not_promoted"
    snapshot = registry.snapshot(include_ended=True)
    assert len(snapshot) == 1
    assert snapshot[0].status == TrackEpisodeStatus.ACTIVE


def test_bent_over_person_can_start_episode_because_posture_is_not_identity() -> None:
    registry = TrackEpisodeRegistry(_settings(), camera_id="cam_1")
    track = _track(track_id=7, frame_index=1, bbox=BBox(x1=120, y1=120, x2=380, y2=330))

    result = registry.update_frame(
        tracking_result=_frame_result(frame_index=1, visible_tracks=[track]),
        qualities_by_track_id={7: _quality(head_visible=False, bent_over=True, reason_codes=["bent_over_unclear"])},
    )

    assert result.assignments_by_track_id[7].track_episode_id is not None


def test_lower_body_or_limb_fragment_does_not_start_new_episode() -> None:
    registry = TrackEpisodeRegistry(_settings(), camera_id="cam_1")
    track = _track(track_id=3, frame_index=1, bbox=BBox(x1=150, y1=250, x2=250, y2=470))

    result = registry.update_frame(
        tracking_result=_frame_result(frame_index=1, visible_tracks=[track]),
        qualities_by_track_id={3: _quality(head_visible=False, lower_body_only=True, reason_codes=["lower_body_only"])},
    )

    assignment = result.assignments_by_track_id[3]
    assert assignment.track_episode_id is None
    assert assignment.kind.value == "rejected"


def test_short_tracker_id_change_is_rebound_to_same_episode() -> None:
    registry = TrackEpisodeRegistry(_settings(), camera_id="cam_1")
    first = _track(track_id=1, frame_index=1, bbox=BBox(x1=100, y1=40, x2=230, y2=420))
    result_1 = registry.update_frame(
        tracking_result=_frame_result(frame_index=1, visible_tracks=[first]),
        qualities_by_track_id={1: _quality()},
    )
    episode_id = result_1.assignments_by_track_id[1].track_episode_id

    registry.update_frame(
        tracking_result=_frame_result(frame_index=2, visible_tracks=[], lost_ids=[1]),
        qualities_by_track_id={},
    )

    rebound = _track(track_id=2, frame_index=3, bbox=BBox(x1=108, y1=45, x2=238, y2=425))
    result_3 = registry.update_frame(
        tracking_result=_frame_result(frame_index=3, visible_tracks=[rebound]),
        qualities_by_track_id={2: _quality(head_visible=False, reason_codes=["head_not_visible"])},
    )

    assignment = result_3.assignments_by_track_id[2]
    assert assignment.track_episode_id == episode_id
    assert "track_episode_rebound_after_tracker_id_change" in assignment.reason_codes
    assert len(registry.snapshot(include_ended=True)) == 1


def test_removed_old_tracker_id_after_rebind_does_not_end_rebound_episode() -> None:
    registry = TrackEpisodeRegistry(_settings(), camera_id="cam_1")
    first = _track(track_id=1, frame_index=1)
    episode_id = registry.update_frame(
        tracking_result=_frame_result(frame_index=1, visible_tracks=[first]),
        qualities_by_track_id={1: _quality()},
    ).assignments_by_track_id[1].track_episode_id

    registry.update_frame(
        tracking_result=_frame_result(frame_index=2, visible_tracks=[], lost_ids=[1]),
        qualities_by_track_id={},
    )
    second = _track(track_id=2, frame_index=3, bbox=BBox(x1=105, y1=45, x2=235, y2=425))
    registry.update_frame(
        tracking_result=_frame_result(frame_index=3, visible_tracks=[second]),
        qualities_by_track_id={2: _quality()},
    )

    result_4 = registry.update_frame(
        tracking_result=_frame_result(frame_index=4, visible_tracks=[second], removed_ids=[1]),
        qualities_by_track_id={2: _quality()},
    )

    assert result_4.assignments_by_track_id[2].track_episode_id == episode_id
    assert registry.snapshot(include_ended=True)[0].status == TrackEpisodeStatus.ACTIVE


def test_covisible_new_track_cannot_steal_active_episode_from_existing_visible_track() -> None:
    registry = TrackEpisodeRegistry(_settings(), camera_id="cam_1")
    track_1 = _track(track_id=1, frame_index=1, bbox=BBox(x1=100, y1=40, x2=230, y2=420))
    episode_1 = registry.update_frame(
        tracking_result=_frame_result(frame_index=1, visible_tracks=[track_1]),
        qualities_by_track_id={1: _quality()},
    ).assignments_by_track_id[1].track_episode_id

    track_1_next = _track(track_id=1, frame_index=2, bbox=BBox(x1=102, y1=42, x2=232, y2=422))
    track_2 = _track(track_id=2, frame_index=2, bbox=BBox(x1=112, y1=45, x2=242, y2=425))
    result_2 = registry.update_frame(
        tracking_result=_frame_result(frame_index=2, visible_tracks=[track_1_next, track_2]),
        qualities_by_track_id={1: _quality(), 2: _quality()},
    )

    assert result_2.assignments_by_track_id[1].track_episode_id == episode_1
    assert result_2.assignments_by_track_id[2].track_episode_id is not None
    assert result_2.assignments_by_track_id[2].track_episode_id != episode_1


def test_far_new_track_after_lost_episode_creates_new_episode_instead_of_jumping() -> None:
    registry = TrackEpisodeRegistry(_settings(track_episode_rebind_min_score=0.70), camera_id="cam_1")
    first = _track(track_id=1, frame_index=1, bbox=BBox(x1=80, y1=40, x2=210, y2=420))
    episode_1 = registry.update_frame(
        tracking_result=_frame_result(frame_index=1, visible_tracks=[first]),
        qualities_by_track_id={1: _quality()},
    ).assignments_by_track_id[1].track_episode_id

    registry.update_frame(
        tracking_result=_frame_result(frame_index=2, visible_tracks=[], lost_ids=[1]),
        qualities_by_track_id={},
    )

    far_track = _track(track_id=9, frame_index=3, bbox=BBox(x1=420, y1=40, x2=560, y2=420))
    result_3 = registry.update_frame(
        tracking_result=_frame_result(frame_index=3, visible_tracks=[far_track]),
        qualities_by_track_id={9: _quality()},
    )

    assert result_3.assignments_by_track_id[9].track_episode_id is not None
    assert result_3.assignments_by_track_id[9].track_episode_id != episode_1
    assert len(registry.snapshot(include_ended=True)) == 2


def test_headwear_only_reject_reason_does_not_block_episode_creation() -> None:
    registry = TrackEpisodeRegistry(_settings(), camera_id="cam_1")
    track = _track(track_id=4, frame_index=1)

    result = registry.update_frame(
        tracking_result=_frame_result(frame_index=1, visible_tracks=[track]),
        qualities_by_track_id={4: _quality(head_visible=False, reason_codes=["person_box_rejected_edge_fragment_for_headwear"])},
    )

    assert result.assignments_by_track_id[4].track_episode_id is not None


def test_structural_fragment_reason_still_blocks_episode_creation() -> None:
    registry = TrackEpisodeRegistry(_settings(), camera_id="cam_1")
    track = _track(track_id=5, frame_index=1, bbox=BBox(x1=10, y1=120, x2=45, y2=420))

    result = registry.update_frame(
        tracking_result=_frame_result(frame_index=1, visible_tracks=[track]),
        qualities_by_track_id={5: _quality(head_visible=False, limb_only=True, reason_codes=["limb_only_or_tiny_fragment"])},
    )

    assignment = result.assignments_by_track_id[5]
    assert assignment.track_episode_id is None
    assert "limb_only_or_tiny_fragment" in assignment.reason_codes


def test_rebind_settings_are_validated() -> None:
    settings = _settings(track_episode_rebind_min_score=1.5)

    try:
        settings.validate_runtime_static_config_or_raise()
    except ValueError as exc:
        assert "TRACK_EPISODE_REBIND_MIN_SCORE" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("invalid rebind score was accepted")
