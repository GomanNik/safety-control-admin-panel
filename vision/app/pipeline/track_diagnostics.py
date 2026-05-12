# ============================================================
# File: vision/app/pipeline/track_diagnostics.py
# Purpose:
# - Runtime diagnostics for external tracker stability.
# - Detects suspicious track fragments, ID switches, merges and splits
#   using only short-term spatial/temporal continuity.
# - Does not merge track episodes and does not perform ReID/person identity.
# - Produces counters and reason codes for metrics/status only.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from app.config import Settings
from app.models.schemas import BBox, QualityAssessment
from app.pipeline.tracking_types import (
    TrackEpisodeAssignmentKind,
    TrackEpisodeFrameResult,
    TrackedPersonObservation,
    TrackingFrameResult,
)


class TrackDiagnosticEventType(str, Enum):
    ID_SWITCH_SUSPICION = "id_switch_suspicion"
    FRAGMENTATION_SUSPICION = "fragmentation_suspicion"
    MERGE_SUSPICION = "merge_suspicion"
    SPLIT_SUSPICION = "split_suspicion"


@dataclass(slots=True)
class TrackDiagnosticEvent:
    event_type: TrackDiagnosticEventType
    observed_at: datetime
    frame_index: int
    source_track_id: int | None
    source_track_episode_id: str | None
    target_track_id: int | None = None
    target_track_episode_id: str | None = None
    confidence: float = 0.0
    reason_codes: list[str] = field(default_factory=list)


@dataclass(slots=True)
class TrackDiagnosticFrameResult:
    events: list[TrackDiagnosticEvent] = field(default_factory=list)
    id_switch_suspicions: int = 0
    fragmentation_suspicions: int = 0
    merge_suspicions: int = 0
    split_suspicions: int = 0


@dataclass(slots=True)
class _EpisodeSnapshot:
    track_id: int
    track_episode_id: str
    bbox: BBox
    observed_at: datetime
    frame_index: int
    visible_frame_count: int = 1
    last_quality_score: float = 0.0


class TrackDiagnosticsAnalyzer:
    """Short-term tracker-stability diagnostics without person identity.

    The analyzer intentionally does not reconnect, merge or rename episodes.
    It only emits suspicion counters when the external tracker behaves in a way
    that can distort event aggregation: a new track appears in the same local
    area shortly after another track disappeared, multiple tracks overlap too
    strongly, or one recent region produces several new episodes.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._enabled = bool(getattr(settings, "track_diagnostics_enabled", True))
        self._active_by_track_id: dict[int, _EpisodeSnapshot] = {}
        self._recent_finished: list[_EpisodeSnapshot] = []

    def reset(self) -> None:
        self._active_by_track_id.clear()
        self._recent_finished.clear()

    def process_frame(
        self,
        *,
        tracking_result: TrackingFrameResult,
        episode_result: TrackEpisodeFrameResult,
        qualities_by_track_id: dict[int, QualityAssessment],
    ) -> TrackDiagnosticFrameResult:
        if not self._enabled:
            return TrackDiagnosticFrameResult()

        observed_at = tracking_result.observed_at
        self._capture_finished_tracks(tracking_result=tracking_result, observed_at=observed_at)
        self._prune_recent_finished(reference_time=observed_at)

        events: list[TrackDiagnosticEvent] = []
        visible_by_track_id = {int(track.track_id): track for track in tracking_result.visible_tracks}
        new_snapshots: list[_EpisodeSnapshot] = []

        for track in tracking_result.visible_tracks:
            track_id = int(track.track_id)
            assignment = episode_result.assignments_by_track_id.get(track_id)
            if assignment is None or assignment.track_episode_id is None:
                continue

            quality = qualities_by_track_id.get(track_id)
            snapshot = _EpisodeSnapshot(
                track_id=track_id,
                track_episode_id=str(assignment.track_episode_id),
                bbox=track.bbox,
                observed_at=observed_at,
                frame_index=int(track.frame_index),
                visible_frame_count=max(1, int(getattr(track, "track_hits", 0) or 1)),
                last_quality_score=self._clip01(getattr(quality, "quality_score", 0.0)) if quality is not None else 0.0,
            )

            if assignment.kind == TrackEpisodeAssignmentKind.NEW_EPISODE:
                new_snapshots.append(snapshot)
                candidate = self._best_recent_match(snapshot=snapshot, reference_time=observed_at)
                if candidate is not None:
                    events.extend(self._events_for_recent_match(previous=candidate, current=snapshot))

            self._active_by_track_id[track_id] = snapshot

        events.extend(self._merge_suspicion_events(tracks=list(visible_by_track_id.values()), observed_at=observed_at))
        events.extend(self._split_suspicion_events(new_snapshots=new_snapshots, observed_at=observed_at))

        unique_events = self._deduplicate_events(events)
        return TrackDiagnosticFrameResult(
            events=unique_events,
            id_switch_suspicions=sum(1 for event in unique_events if event.event_type == TrackDiagnosticEventType.ID_SWITCH_SUSPICION),
            fragmentation_suspicions=sum(1 for event in unique_events if event.event_type == TrackDiagnosticEventType.FRAGMENTATION_SUSPICION),
            merge_suspicions=sum(1 for event in unique_events if event.event_type == TrackDiagnosticEventType.MERGE_SUSPICION),
            split_suspicions=sum(1 for event in unique_events if event.event_type == TrackDiagnosticEventType.SPLIT_SUSPICION),
        )

    def _capture_finished_tracks(self, *, tracking_result: TrackingFrameResult, observed_at: datetime) -> None:
        finished_ids = {int(item) for item in list(tracking_result.lost_track_ids) + list(tracking_result.removed_track_ids)}
        visible_ids = {int(track.track_id) for track in tracking_result.visible_tracks}

        for track_id in list(self._active_by_track_id.keys()):
            if track_id not in finished_ids and track_id in visible_ids:
                continue
            if track_id not in finished_ids and track_id not in visible_ids:
                continue

            snapshot = self._active_by_track_id.pop(track_id, None)
            if snapshot is None:
                continue

            snapshot.observed_at = observed_at
            self._recent_finished.append(snapshot)

    def _best_recent_match(self, *, snapshot: _EpisodeSnapshot, reference_time: datetime) -> _EpisodeSnapshot | None:
        best: _EpisodeSnapshot | None = None
        best_score = 0.0

        for candidate in self._recent_finished:
            if candidate.track_episode_id == snapshot.track_episode_id:
                continue

            score = self._continuity_score(previous=candidate, current=snapshot, reference_time=reference_time)
            if score > best_score:
                best = candidate
                best_score = score

        if best is None:
            return None

        return best if best_score >= self._id_switch_confidence_threshold() else None

    def _events_for_recent_match(self, *, previous: _EpisodeSnapshot, current: _EpisodeSnapshot) -> list[TrackDiagnosticEvent]:
        confidence = self._continuity_score(previous=previous, current=current, reference_time=current.observed_at)
        reason_codes = [
            "same_spatial_temporal_region",
            "new_episode_near_recently_lost_episode",
            "diagnostic_only_no_reid",
        ]
        events = [
            TrackDiagnosticEvent(
                event_type=TrackDiagnosticEventType.ID_SWITCH_SUSPICION,
                observed_at=current.observed_at,
                frame_index=current.frame_index,
                source_track_id=previous.track_id,
                source_track_episode_id=previous.track_episode_id,
                target_track_id=current.track_id,
                target_track_episode_id=current.track_episode_id,
                confidence=confidence,
                reason_codes=reason_codes,
            )
        ]

        short_threshold = max(1, int(getattr(self._settings, "track_episode_short_max_frames", 6)))
        if previous.visible_frame_count <= short_threshold or current.visible_frame_count <= short_threshold:
            events.append(
                TrackDiagnosticEvent(
                    event_type=TrackDiagnosticEventType.FRAGMENTATION_SUSPICION,
                    observed_at=current.observed_at,
                    frame_index=current.frame_index,
                    source_track_id=previous.track_id,
                    source_track_episode_id=previous.track_episode_id,
                    target_track_id=current.track_id,
                    target_track_episode_id=current.track_episode_id,
                    confidence=confidence,
                    reason_codes=[*reason_codes, "short_track_near_new_episode"],
                )
            )

        return events

    def _merge_suspicion_events(self, *, tracks: list[TrackedPersonObservation], observed_at: datetime) -> list[TrackDiagnosticEvent]:
        events: list[TrackDiagnosticEvent] = []
        if len(tracks) < 2:
            return events

        for index, left in enumerate(tracks):
            for right in tracks[index + 1:]:
                iou = self._bbox_iou(left.bbox, right.bbox)
                containment = self._smaller_bbox_containment(left.bbox, right.bbox)
                if iou < self._merge_iou_threshold() and containment < self._merge_containment_threshold():
                    continue

                left_snapshot = self._active_by_track_id.get(int(left.track_id))
                right_snapshot = self._active_by_track_id.get(int(right.track_id))
                events.append(
                    TrackDiagnosticEvent(
                        event_type=TrackDiagnosticEventType.MERGE_SUSPICION,
                        observed_at=observed_at,
                        frame_index=int(max(left.frame_index, right.frame_index)),
                        source_track_id=int(left.track_id),
                        source_track_episode_id=left_snapshot.track_episode_id if left_snapshot is not None else None,
                        target_track_id=int(right.track_id),
                        target_track_episode_id=right_snapshot.track_episode_id if right_snapshot is not None else None,
                        confidence=self._clip01(max(iou, containment)),
                        reason_codes=["overlapping_active_tracks", "diagnostic_only_no_reid"],
                    )
                )

        return events

    def _split_suspicion_events(self, *, new_snapshots: list[_EpisodeSnapshot], observed_at: datetime) -> list[TrackDiagnosticEvent]:
        if len(new_snapshots) < 2:
            return []

        events: list[TrackDiagnosticEvent] = []
        for previous in self._recent_finished:
            close_new = [
                snapshot
                for snapshot in new_snapshots
                if self._continuity_score(previous=previous, current=snapshot, reference_time=observed_at) >= self._split_confidence_threshold()
            ]
            if len(close_new) < 2:
                continue

            target_ids = ",".join(snapshot.track_episode_id for snapshot in close_new[:4])
            events.append(
                TrackDiagnosticEvent(
                    event_type=TrackDiagnosticEventType.SPLIT_SUSPICION,
                    observed_at=observed_at,
                    frame_index=max(snapshot.frame_index for snapshot in close_new),
                    source_track_id=previous.track_id,
                    source_track_episode_id=previous.track_episode_id,
                    target_track_id=None,
                    target_track_episode_id=target_ids,
                    confidence=max(
                        self._continuity_score(previous=previous, current=snapshot, reference_time=observed_at)
                        for snapshot in close_new
                    ),
                    reason_codes=["one_recent_region_multiple_new_episodes", "diagnostic_only_no_reid"],
                )
            )

        return events

    def _continuity_score(self, *, previous: _EpisodeSnapshot, current: _EpisodeSnapshot, reference_time: datetime) -> float:
        gap_sec = max(0.0, (reference_time - previous.observed_at).total_seconds())
        if gap_sec > self._max_gap_seconds():
            return 0.0

        center_distance = self._bbox_center_distance(previous.bbox, current.bbox)
        max_dimension = max(previous.bbox.width, previous.bbox.height, current.bbox.width, current.bbox.height, 1)
        center_ratio = center_distance / float(max_dimension)
        if center_ratio > self._center_distance_ratio():
            return 0.0

        size_similarity = self._size_similarity(previous.bbox, current.bbox)
        if size_similarity < self._size_similarity_threshold():
            return 0.0

        iou = self._bbox_iou(previous.bbox, current.bbox)
        time_score = 1.0 - min(1.0, gap_sec / max(self._max_gap_seconds(), 1e-6))
        center_score = 1.0 - min(1.0, center_ratio / max(self._center_distance_ratio(), 1e-6))
        iou_score = max(0.0, iou)

        return self._clip01((0.40 * center_score) + (0.30 * size_similarity) + (0.20 * time_score) + (0.10 * iou_score))

    def _prune_recent_finished(self, *, reference_time: datetime) -> None:
        max_gap = self._max_gap_seconds()
        max_items = max(10, int(getattr(self._settings, "track_diagnostics_recent_cache_size", 80)))
        self._recent_finished = [
            item
            for item in self._recent_finished
            if max(0.0, (reference_time - item.observed_at).total_seconds()) <= max_gap
        ][-max_items:]

    def _deduplicate_events(self, events: list[TrackDiagnosticEvent]) -> list[TrackDiagnosticEvent]:
        result: list[TrackDiagnosticEvent] = []
        seen: set[tuple[str, str | None, str | None, int]] = set()
        for event in events:
            key = (
                event.event_type.value,
                event.source_track_episode_id,
                event.target_track_episode_id,
                int(event.frame_index),
            )
            if key in seen:
                continue
            seen.add(key)
            result.append(event)
        return result

    @staticmethod
    def _bbox_center_distance(left: BBox, right: BBox) -> float:
        lx, ly = left.center
        rx, ry = right.center
        return ((lx - rx) ** 2 + (ly - ry) ** 2) ** 0.5

    @staticmethod
    def _bbox_intersection_area(left: BBox, right: BBox) -> int:
        x1 = max(int(left.x1), int(right.x1))
        y1 = max(int(left.y1), int(right.y1))
        x2 = min(int(left.x2), int(right.x2))
        y2 = min(int(left.y2), int(right.y2))
        return max(0, x2 - x1) * max(0, y2 - y1)

    def _bbox_iou(self, left: BBox, right: BBox) -> float:
        inter = self._bbox_intersection_area(left, right)
        if inter <= 0:
            return 0.0
        union = left.area + right.area - inter
        if union <= 0:
            return 0.0
        return self._clip01(inter / float(union))

    def _smaller_bbox_containment(self, left: BBox, right: BBox) -> float:
        inter = self._bbox_intersection_area(left, right)
        smaller = max(1, min(left.area, right.area))
        return self._clip01(inter / float(smaller))

    @staticmethod
    def _size_similarity(left: BBox, right: BBox) -> float:
        left_area = max(1, int(left.area))
        right_area = max(1, int(right.area))
        return min(left_area, right_area) / float(max(left_area, right_area))

    def _max_gap_seconds(self) -> float:
        return max(0.1, float(getattr(self._settings, "track_diagnostics_max_gap_seconds", 2.0)))

    def _center_distance_ratio(self) -> float:
        return max(0.01, float(getattr(self._settings, "track_diagnostics_center_distance_ratio", 0.55)))

    def _size_similarity_threshold(self) -> float:
        return self._clip01(getattr(self._settings, "track_diagnostics_size_similarity_threshold", 0.45))

    def _id_switch_confidence_threshold(self) -> float:
        return self._clip01(getattr(self._settings, "track_diagnostics_id_switch_threshold", 0.58))

    def _split_confidence_threshold(self) -> float:
        return self._clip01(getattr(self._settings, "track_diagnostics_split_threshold", 0.55))

    def _merge_iou_threshold(self) -> float:
        return self._clip01(getattr(self._settings, "track_diagnostics_merge_iou_threshold", 0.35))

    def _merge_containment_threshold(self) -> float:
        return self._clip01(getattr(self._settings, "track_diagnostics_merge_containment_threshold", 0.72))

    @staticmethod
    def _clip01(value: object) -> float:
        try:
            number = float(value)
        except Exception:
            return 0.0
        return max(0.0, min(1.0, number))
