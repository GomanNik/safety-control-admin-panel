# ============================================================
# File: vision/app/pipeline/track_episode_registry.py
# Purpose:
# - Track-centric episode registry for the offline runtime.
# - Converts external tracker IDs into explicit track_episode_id values.
# - Does not compare or identify physical people between appearances.
# - Rejects partial/fragment tracks as candidates until they are stable and
#   usable enough to become a real track episode.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from app.config import Settings
from app.models.schemas import QualityAssessment, TrackEpisodeRecord, TrackEpisodeStatus
from app.pipeline.tracking_types import (
    TrackEpisodeAssignment,
    TrackEpisodeAssignmentKind,
    TrackEpisodeFrameResult,
    TrackedPersonObservation,
    TrackingFrameResult,
)


@dataclass(slots=True)
class _CandidateStabilityState:
    stable_hits: int = 0
    last_bbox: object | None = None
    last_frame_index: int = -1


class TrackEpisodeRegistry:
    def __init__(self, settings: Settings, *, camera_id: str) -> None:
        self._settings = settings
        self._camera_id = str(camera_id)
        self._session_id = self._new_session_id()
        self._next_episode_seq = 1
        self._active_episode_by_track_id: dict[int, str] = {}
        self._episodes_by_id: dict[str, TrackEpisodeRecord] = {}
        self._candidate_hits_by_track_id: dict[int, int] = {}
        self._candidate_stability_by_track_id: dict[int, _CandidateStabilityState] = {}
        self._rejected_hits_by_track_id: dict[int, int] = {}

    def reset(self) -> None:
        self._session_id = self._new_session_id()
        self._next_episode_seq = 1
        self._active_episode_by_track_id.clear()
        self._episodes_by_id.clear()
        self._candidate_hits_by_track_id.clear()
        self._candidate_stability_by_track_id.clear()
        self._rejected_hits_by_track_id.clear()

    def update_frame(
        self,
        *,
        tracking_result: TrackingFrameResult,
        qualities_by_track_id: dict[int, QualityAssessment],
    ) -> TrackEpisodeFrameResult:
        observed_at = tracking_result.observed_at
        assignments: dict[int, TrackEpisodeAssignment] = {}
        created_count = 0
        rejected_count = 0
        candidate_count = 0
        promoted_count = 0
        partial_rejected_count = 0

        removed_ids = set(int(item) for item in tracking_result.removed_track_ids)
        lost_ids = set(int(item) for item in tracking_result.lost_track_ids)
        visible_ids = {int(track.track_id) for track in tracking_result.visible_tracks}

        for track_id in removed_ids:
            self._end_track_episode(track_id=track_id, observed_at=observed_at, reason="tracker_removed")
            self._candidate_hits_by_track_id.pop(track_id, None)
            self._candidate_stability_by_track_id.pop(track_id, None)
            self._rejected_hits_by_track_id.pop(track_id, None)

        for track_id in lost_ids - removed_ids:
            self._mark_track_lost(track_id=track_id, observed_at=observed_at)

        for track in tracking_result.visible_tracks:
            track_id = int(track.track_id)
            quality = qualities_by_track_id.get(track_id)

            if not track.is_usable_track(min_confidence=0.0):
                assignments[track_id] = self._rejected_assignment(
                    track=track,
                    reason="track_not_usable_for_episode",
                    reason_codes=list(track.reason_codes) + ["track_not_usable_for_episode"],
                    partial=False,
                )
                rejected_count += 1
                continue

            episode_id = self._active_episode_by_track_id.get(track_id)
            is_new = False

            if episode_id is None or episode_id not in self._episodes_by_id:
                candidate_count += 1
                self._candidate_hits_by_track_id[track_id] = self._candidate_hits_by_track_id.get(track_id, 0) + 1

                promotable, reason_codes = self._can_promote_new_episode(track=track, quality=quality)
                if not promotable:
                    if self._is_partial_or_fragment_quality(quality):
                        partial_rejected_count += 1
                    rejected_count += 1
                    self._rejected_hits_by_track_id[track_id] = self._rejected_hits_by_track_id.get(track_id, 0) + 1
                    assignments[track_id] = self._rejected_assignment(
                        track=track,
                        reason="candidate_track_not_promoted",
                        reason_codes=reason_codes,
                        partial=self._is_partial_or_fragment_quality(quality),
                    )
                    continue

                episode_id = self._create_episode(track=track, observed_at=observed_at)
                is_new = True
                created_count += 1
                promoted_count += 1

            record = self._episodes_by_id[episode_id]
            self._update_episode_record(record=record, track=track, quality=quality, observed_at=observed_at)
            if is_new:
                record.promoted_frame_count += 1
            else:
                record.candidate_frame_count += 1

            assignments[track_id] = TrackEpisodeAssignment(
                track_id=track_id,
                track_episode_id=episode_id,
                source_track_id=track_id,
                kind=TrackEpisodeAssignmentKind.NEW_EPISODE if is_new else TrackEpisodeAssignmentKind.EXISTING_EPISODE,
                status=record.status,
                confidence=self._clip01(getattr(track, "tracking_confidence", track.confidence)),
                stable_hits=max(0, int(getattr(track, "track_hits", 0))),
                reason="new_track_episode" if is_new else "existing_track_episode",
                reason_codes=["track_episode_active"],
                is_confirmed=bool(getattr(track, "is_confirmed_track", False)),
                is_new_episode=is_new,
            )

        for track_id in list(self._active_episode_by_track_id.keys()):
            if track_id not in visible_ids and track_id not in lost_ids and track_id not in removed_ids:
                self._mark_track_lost(track_id=track_id, observed_at=observed_at)

        active_episode_ids = {
            episode_id
            for episode_id, record in self._episodes_by_id.items()
            if record.status == TrackEpisodeStatus.ACTIVE
        }

        return TrackEpisodeFrameResult(
            assignments_by_track_id=assignments,
            active_episode_ids=active_episode_ids,
            active_count=len(active_episode_ids),
            lost_count=sum(1 for item in self._episodes_by_id.values() if item.status == TrackEpisodeStatus.LOST_RECENTLY),
            ended_count=sum(1 for item in self._episodes_by_id.values() if item.status == TrackEpisodeStatus.ENDED),
            created_count=created_count,
            rejected_count=rejected_count,
            candidate_count=candidate_count,
            promoted_count=promoted_count,
            partial_rejected_count=partial_rejected_count,
        )

    def mark_headwear_result(
        self,
        *,
        track_episode_id: str | None,
        headwear_evaluable: bool,
        headwear_unknown: bool,
        violation: bool,
        interaction_risk: bool,
        quality_score: float,
        active_incident_id: str | None = None,
        head_crop_rejected: bool = False,
        headwear_skipped_bad_crop: bool = False,
        headwear_model_called: bool = False,
        headwear_pre_skipped: bool = False,
        headwear_skipped_visibility: bool = False,
    ) -> None:
        if not track_episode_id:
            return
        record = self._episodes_by_id.get(track_episode_id)
        if record is None:
            return

        if headwear_evaluable:
            record.headwear_evaluable_frame_count += 1
        if headwear_unknown:
            record.headwear_unknown_frame_count += 1
        if violation:
            record.violation_frame_count += 1
        if interaction_risk:
            record.interaction_risk_count += 1
        if head_crop_rejected:
            record.head_crop_rejected_count += 1
        if headwear_skipped_bad_crop:
            record.headwear_skipped_bad_crop_count += 1
        if headwear_model_called:
            record.headwear_model_called_count += 1
        if headwear_pre_skipped:
            record.headwear_pre_skipped_count += 1
        if headwear_skipped_visibility:
            record.headwear_skipped_visibility_count += 1
        record.last_quality_score = self._clip01(quality_score)
        if active_incident_id:
            record.active_incident_id = active_incident_id

    def snapshot(self, *, include_ended: bool = False) -> list[TrackEpisodeRecord]:
        items = list(self._episodes_by_id.values())
        if not include_ended:
            items = [item for item in items if item.status != TrackEpisodeStatus.ENDED]
        return sorted(items, key=lambda item: (item.first_seen_at, item.track_episode_id))

    def active_count(self) -> int:
        return sum(1 for item in self._episodes_by_id.values() if item.status == TrackEpisodeStatus.ACTIVE)

    def lost_count(self) -> int:
        return sum(1 for item in self._episodes_by_id.values() if item.status == TrackEpisodeStatus.LOST_RECENTLY)

    def ended_count(self) -> int:
        return sum(1 for item in self._episodes_by_id.values() if item.status == TrackEpisodeStatus.ENDED)

    def short_episode_count(self) -> int:
        threshold = max(1, int(getattr(self._settings, "track_episode_short_max_frames", 6)))
        return sum(1 for item in self._episodes_by_id.values() if item.visible_frame_count <= threshold)

    def finish_video(self, *, reference_time: datetime) -> None:
        for track_id in list(self._active_episode_by_track_id.keys()):
            self._end_track_episode(track_id=track_id, observed_at=reference_time, reason="video_finished")

    def _create_episode(self, *, track: TrackedPersonObservation, observed_at: datetime) -> str:
        seq = self._next_episode_seq
        self._next_episode_seq += 1
        track_id = int(track.track_id)
        episode_id = f"{self._camera_id}__session-{self._session_id}__track-{track_id}__episode-{seq:06d}"

        self._active_episode_by_track_id[track_id] = episode_id
        self._episodes_by_id[episode_id] = TrackEpisodeRecord(
            track_episode_id=episode_id,
            camera_id=self._camera_id,
            source_track_id=track_id,
            first_seen_at=observed_at,
            last_seen_at=observed_at,
            first_frame_index=max(0, int(track.frame_index)),
            last_frame_index=max(0, int(track.frame_index)),
            status=TrackEpisodeStatus.ACTIVE,
            last_bbox=track.bbox,
            last_quality_score=0.0,
            visible_frame_count=0,
            candidate_frame_count=self._candidate_hits_by_track_id.get(track_id, 0),
            reason_codes=["track_episode_created"],
        )
        return episode_id

    def _update_episode_record(
        self,
        *,
        record: TrackEpisodeRecord,
        track: TrackedPersonObservation,
        quality: QualityAssessment | None,
        observed_at: datetime,
    ) -> None:
        record.status = TrackEpisodeStatus.ACTIVE
        record.last_seen_at = observed_at
        record.last_frame_index = max(record.last_frame_index, int(track.frame_index))
        record.last_bbox = track.bbox
        record.visible_frame_count += 1
        record.lost_frame_count = 0
        if quality is not None:
            record.last_quality_score = self._clip01(quality.quality_score)
            if self._is_partial_or_fragment_quality(quality):
                record.partial_suppressed_count += 1
        record.reason_codes = self._unique([*record.reason_codes, "track_episode_visible"])

    def _mark_track_lost(self, *, track_id: int, observed_at: datetime) -> None:
        episode_id = self._active_episode_by_track_id.get(track_id)
        if episode_id is None:
            return
        record = self._episodes_by_id.get(episode_id)
        if record is None:
            return
        record.status = TrackEpisodeStatus.LOST_RECENTLY
        record.last_seen_at = observed_at
        record.lost_frame_count += 1
        record.reason_codes = self._unique([*record.reason_codes, "track_lost_recently"])

    def _end_track_episode(self, *, track_id: int, observed_at: datetime, reason: str) -> None:
        episode_id = self._active_episode_by_track_id.pop(track_id, None)
        if episode_id is None:
            return
        record = self._episodes_by_id.get(episode_id)
        if record is None:
            return
        record.status = TrackEpisodeStatus.ENDED
        record.last_seen_at = observed_at
        record.reason_codes = self._unique([*record.reason_codes, reason, "track_episode_ended"])

    def _can_promote_new_episode(
        self,
        *,
        track: TrackedPersonObservation,
        quality: QualityAssessment | None,
    ) -> tuple[bool, list[str]]:
        reasons: list[str] = []

        if quality is None:
            self._update_candidate_stability(track=track, stable=False)
            return False, ["quality_missing"]

        track_id = int(track.track_id)
        track_hits = max(0, int(getattr(track, "track_hits", 0)))
        candidate_hits = max(0, int(self._candidate_hits_by_track_id.get(track_id, 0)))

        reject_reason_hit = self._promotion_reject_reason(track=track, quality=quality)
        if reject_reason_hit is not None:
            self._update_candidate_stability(track=track, stable=False)
            return False, [reject_reason_hit, "candidate_fragment_reason_rejected"]

        per_frame_ok = bool(
            bool(getattr(quality, "is_usable_for_tracking", False))
            and bool(getattr(quality, "head_visible", False))
            and not self._is_partial_or_fragment_quality(quality)
            and not bool(getattr(quality, "is_interaction_risk", False))
        )
        temporal_stable = self._update_candidate_stability(track=track, stable=per_frame_ok)

        fast_promotable = self._is_fast_promotable_quality(quality)
        min_hits = (
            max(1, int(getattr(self._settings, "track_episode_fast_promote_hits", 2)))
            if fast_promotable
            else max(1, int(getattr(self._settings, "track_episode_min_promote_hits", 3)))
        )
        min_stable_hits = max(
            min_hits,
            int(getattr(self._settings, "track_episode_min_stable_hits", 3)),
        )

        stable_hits = self._candidate_stability_by_track_id.get(track_id, _CandidateStabilityState()).stable_hits
        if max(track_hits, candidate_hits) < min_hits:
            reasons.append("candidate_track_waiting_for_stable_hits")
        if stable_hits < min_stable_hits:
            reasons.append("candidate_track_temporally_unstable")
        if not temporal_stable:
            reasons.append("candidate_bbox_motion_unstable")

        min_quality = self._clip01(getattr(self._settings, "track_episode_min_promote_quality", 0.40))
        if float(quality.quality_score) < min_quality:
            reasons.append("candidate_quality_too_low")

        if not bool(getattr(quality, "is_usable_for_tracking", False)):
            reasons.append("candidate_not_usable_for_tracking")

        if self._is_partial_or_fragment_quality(quality):
            reasons.append("candidate_partial_fragment_rejected")

        if bool(getattr(self._settings, "track_episode_require_head_for_new", True)):
            if not bool(getattr(quality, "head_visible", False)):
                reasons.append("candidate_head_not_visible")
            if bool(getattr(quality, "is_interaction_risk", False)):
                reasons.append("candidate_interaction_risk")
            if bool(getattr(quality, "is_truncated", False)) and not fast_promotable:
                reasons.append("candidate_border_truncated")

        if not reasons:
            return True, ["candidate_promoted_to_track_episode_fast" if fast_promotable else "candidate_promoted_to_track_episode"]

        return False, self._unique(reasons)

    def _update_candidate_stability(self, *, track: TrackedPersonObservation, stable: bool) -> bool:
        track_id = int(track.track_id)
        bbox = track.bbox
        state = self._candidate_stability_by_track_id.get(track_id)
        if state is None:
            state = _CandidateStabilityState(stable_hits=1 if stable else 0, last_bbox=bbox, last_frame_index=int(track.frame_index))
            self._candidate_stability_by_track_id[track_id] = state
            return bool(stable)

        previous_bbox = state.last_bbox
        frame_gap = int(track.frame_index) - int(state.last_frame_index)
        center_stable = True
        size_stable = True
        gap_stable = frame_gap <= max(1, int(getattr(self._settings, "track_episode_stability_max_frame_gap", 2)))

        if previous_bbox is not None:
            distance = self._bbox_center_distance(previous_bbox, bbox)
            max_dimension = max(previous_bbox.width, previous_bbox.height, bbox.width, bbox.height, 1)
            center_shift_ratio = distance / float(max_dimension)
            center_stable = center_shift_ratio <= self._clip01(
                getattr(self._settings, "track_episode_max_center_shift_ratio", 0.28)
            )

            previous_area = max(1, int(previous_bbox.area))
            current_area = max(1, int(bbox.area))
            size_change_ratio = abs(current_area - previous_area) / float(max(previous_area, current_area, 1))
            size_stable = size_change_ratio <= self._clip01(
                getattr(self._settings, "track_episode_max_size_change_ratio", 0.45)
            )

        is_temporally_stable = bool(stable and gap_stable and center_stable and size_stable)
        state.stable_hits = state.stable_hits + 1 if is_temporally_stable else (1 if stable else 0)
        state.last_bbox = bbox
        state.last_frame_index = int(track.frame_index)
        return is_temporally_stable

    def _promotion_reject_reason(
        self,
        *,
        track: TrackedPersonObservation,
        quality: QualityAssessment,
    ) -> str | None:
        configured = tuple(
            str(item).strip().lower()
            for item in getattr(
                self._settings,
                "track_episode_reject_fragment_reasons_for_promotion",
                (),
            )
            if str(item).strip()
        )
        if not configured:
            configured = (
                "person_box_rejected_internal_occluder_fragment",
                "person_box_rejected_headless_internal_fragment",
                "person_box_rejected_peer_duplicate_fragment",
                "person_box_rejected_limb_shape_fragment",
                "person_box_rejected_edge_fragment_for_headwear",
                "person_box_rejected_exit_fragment",
                "person_box_rejected_overlap",
                "candidate_partial_fragment_rejected",
                "partial_track_suppressed",
                "border_fragment",
                "limb_only_or_tiny_fragment",
                "head_cropped_by_frame_border",
            )

        reason_codes = {
            str(item).strip().lower()
            for item in list(getattr(track, "reason_codes", []) or [])
            + list(getattr(quality, "reason_codes", []) or [])
            if str(item).strip()
        }
        for reason in configured:
            if reason in reason_codes:
                return reason
        return None

    @staticmethod
    def _bbox_center_distance(left: object, right: object) -> float:
        lx, ly = left.center
        rx, ry = right.center
        return ((float(lx) - float(rx)) ** 2 + (float(ly) - float(ry)) ** 2) ** 0.5

    def _is_fast_promotable_quality(self, quality: QualityAssessment | None) -> bool:
        if quality is None:
            return False
        visibility = str(getattr(quality, "visibility_state", "") or "").strip().lower()
        fast_quality = self._clip01(getattr(self._settings, "track_episode_fast_promote_quality", 0.52))
        return bool(
            float(getattr(quality, "quality_score", 0.0)) >= fast_quality
            and bool(getattr(quality, "is_usable_for_tracking", False))
            and bool(getattr(quality, "head_visible", False))
            and not bool(getattr(quality, "is_partial_limb_only", False))
            and not bool(getattr(quality, "is_lower_body_only", False))
            and not bool(getattr(quality, "is_bent_over", False))
            and not bool(getattr(quality, "is_interaction_risk", False))
            and visibility in {"head_visible", "full_body_visible", "upper_body_visible", "head_partially_visible"}
        )

    def _is_partial_or_fragment_quality(self, quality: QualityAssessment | None) -> bool:
        if quality is None:
            return True
        codes = {str(item).lower() for item in list(getattr(quality, "reason_codes", []) or [])}
        return bool(
            getattr(quality, "is_partial_limb_only", False)
            or getattr(quality, "is_lower_body_only", False)
            or getattr(quality, "is_bent_over", False)
            or "border_fragment" in codes
            or "limb_only_or_tiny_fragment" in codes
            or "head_cropped_by_frame_border" in codes
        )

    def _rejected_assignment(
        self,
        *,
        track: TrackedPersonObservation,
        reason: str,
        reason_codes: list[str],
        partial: bool,
    ) -> TrackEpisodeAssignment:
        codes = self._unique(list(reason_codes) + [reason] + (["partial_track_suppressed"] if partial else []))
        return TrackEpisodeAssignment(
            track_id=int(track.track_id),
            track_episode_id=None,
            source_track_id=int(track.track_id),
            kind=TrackEpisodeAssignmentKind.REJECTED,
            status=TrackEpisodeStatus.LOST_RECENTLY,
            confidence=self._clip01(getattr(track, "tracking_confidence", track.confidence)),
            stable_hits=max(0, int(getattr(track, "track_hits", 0))),
            reason=reason,
            reason_codes=codes,
            is_confirmed=False,
            is_new_episode=False,
        )

    @staticmethod
    def _new_session_id() -> str:
        return uuid4().hex[:12]

    @staticmethod
    def _clip01(value: object) -> float:
        try:
            number = float(value)
        except Exception:
            number = 0.0
        return max(0.0, min(1.0, number))

    @staticmethod
    def _unique(values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for raw in values:
            value = str(raw or "").strip()
            if not value or value in seen:
                continue
            seen.add(value)
            result.append(value)
        return result
