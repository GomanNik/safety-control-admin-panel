# ============================================================
# File: vision/app/pipeline/tracking_types.py
# Purpose:
# - Shared track-centric contracts between the external tracker,
#   runtime, track episode registry and incident engine.
# - External track_id is not a physical person identity.
# - Optional appearance vectors may be attached by a tracker backend only for
#   short-term track continuity, not for person recognition across appearances.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from app.models.schemas import BBox, TrackEpisodeStatus


class TrackingBackendType(str, Enum):
    ULTRALYTICS = "ultralytics"
    DEVELOPMENT_SIMPLE = "development_simple"
    DISABLED = "disabled"


class ExternalTrackState(str, Enum):
    NEW = "new"
    TRACKED = "tracked"
    LOST = "lost"
    REMOVED = "removed"
    UNKNOWN = "unknown"


class TrackEpisodeAssignmentKind(str, Enum):
    NEW_EPISODE = "new_episode"
    EXISTING_EPISODE = "existing_episode"
    LOST_RECENTLY = "lost_recently"
    ENDED = "ended"
    REJECTED = "rejected"
    UNKNOWN = "unknown"


@dataclass(slots=True)
class TrackedPersonObservation:
    track_id: int
    bbox: BBox
    confidence: float
    observed_at: datetime
    frame_index: int
    track_state: ExternalTrackState
    track_age: int
    track_hits: int
    time_since_update: int
    class_id: int | None
    class_name: str | None
    detector_confidence: float
    tracking_confidence: float
    source_backend: TrackingBackendType
    is_confirmed_track: bool
    is_visible: bool
    is_shadow: bool
    shadow_of_track_id: int | None
    reason_codes: list[str] = field(default_factory=list)

    # Tracker-local appearance support. Do not use this to reconnect the same
    # physical person after leaving and re-entering the camera view.
    embedding: list[float] | None = None
    embedding_quality: float = 0.0

    @property
    def area(self) -> int:
        return int(self.bbox.area)

    @property
    def width(self) -> int:
        return int(self.bbox.width)

    @property
    def height(self) -> int:
        return int(self.bbox.height)

    @property
    def center(self) -> tuple[float, float]:
        return self.bbox.center

    @property
    def has_embedding(self) -> bool:
        return bool(self.embedding)

    def is_usable_track(self, min_confidence: float = 0.0) -> bool:
        if self.is_shadow:
            return False
        if not self.is_visible:
            return False
        if not self.bbox.is_valid:
            return False
        if self.confidence < min_confidence:
            return False
        return True


@dataclass(slots=True)
class TrackingDiagnostics:
    backend_name: str
    model_path: str | None
    tracker_config_path: str | None
    processed_detections: int
    visible_tracks_count: int
    raw_tracks_count: int
    reason_codes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass(slots=True)
class TrackingFrameResult:
    observed_at: datetime
    frame_index: int
    visible_tracks: list[TrackedPersonObservation]
    lost_track_ids: list[int]
    removed_track_ids: list[int]
    backend: TrackingBackendType
    diagnostics: TrackingDiagnostics


@dataclass(slots=True)
class TrackEpisodeAssignment:
    track_id: int
    track_episode_id: str | None
    source_track_id: int | None
    kind: TrackEpisodeAssignmentKind
    status: TrackEpisodeStatus
    confidence: float
    stable_hits: int
    reason: str
    reason_codes: list[str] = field(default_factory=list)
    is_confirmed: bool = False
    is_new_episode: bool = False


@dataclass(slots=True)
class TrackEpisodeFrameResult:
    assignments_by_track_id: dict[int, TrackEpisodeAssignment]
    active_episode_ids: set[str]
    active_count: int
    lost_count: int
    ended_count: int
    created_count: int
    rejected_count: int
    candidate_count: int = 0
    promoted_count: int = 0
    partial_rejected_count: int = 0


# ------------------------------------------------------------------
# Deprecated compatibility shims.
# They are intentionally not used by production runtime anymore.
# ------------------------------------------------------------------

class DayPersonIdentityState(str, Enum):
    UNKNOWN = "unknown"
    CONFIRMED = "confirmed"
    CANDIDATE = "candidate"
    LOST = "lost"
    REJECTED = "rejected"
    CONFLICT = "conflict"


class DayPersonAssignmentKind(str, Enum):
    UNKNOWN = "unknown"
    CREATED_NEW = "created_new"
    REJECTED = "rejected"


@dataclass(slots=True)
class DayPersonAssignment:
    track_id: int
    day_person_id: str | None
    candidate_id: str | None
    kind: DayPersonAssignmentKind
    state: DayPersonIdentityState
    confidence: float
    stable_hits: int
    reason: str
    reason_codes: list[str] = field(default_factory=list)
    is_confirmed: bool = False
    is_new_person: bool = False


@dataclass(slots=True)
class FrameIdentityResult:
    assignments_by_track_id: dict[int, DayPersonAssignment]
    visible_day_person_ids: set[str]
    confirmed_count: int
    candidate_count: int
    unknown_count: int
    rejected_count: int
    conflict_count: int
    created_count: int
