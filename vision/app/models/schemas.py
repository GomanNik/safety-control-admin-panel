# ============================================================
# File: vision/app/models/schemas.py
# Purpose:
# - Canonical Pydantic schemas for the standalone vision service.
# - Track-centric runtime contracts: tracking -> track episode
#   -> visibility/headwear assessment -> incident evidence/API.
# - Does not model stable physical-person identity.
# - Keeps old DayPerson* response names only as deprecated API aliases,
#   so temporary compatibility routes do not break during migration.
# ============================================================

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

try:
    from pydantic import ConfigDict
except Exception:  # pragma: no cover
    ConfigDict = None  # type: ignore


class AppModel(BaseModel):
    if ConfigDict is not None:
        model_config = ConfigDict(
            extra="forbid",
            arbitrary_types_allowed=True,
            validate_assignment=True,
            use_enum_values=False,
        )
    else:  # pragma: no cover
        class Config:
            extra = "forbid"
            arbitrary_types_allowed = True
            validate_assignment = True
            use_enum_values = False

    def model_dump(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        base_dump = getattr(super(), "model_dump", None)
        if callable(base_dump):
            return dict(base_dump(*args, **kwargs))
        return dict(self.dict(*args, **kwargs))  # pragma: no cover


class ComplianceSignal(str, Enum):
    COMPLIANT = "compliant"
    VIOLATION = "violation"
    UNKNOWN = "unknown"


class IncidentState(str, Enum):
    CANDIDATE = "candidate"
    OPEN = "open"
    COOLDOWN = "cooldown"
    CLOSED = "closed"


class TrackEpisodeStatus(str, Enum):
    ACTIVE = "active"
    LOST_RECENTLY = "lost_recently"
    ENDED = "ended"


class TrackVisibilityState(str, Enum):
    FULL_BODY_VISIBLE = "full_body_visible"
    UPPER_BODY_VISIBLE = "upper_body_visible"
    HEAD_VISIBLE = "head_visible"
    HEAD_PARTIALLY_VISIBLE = "head_partially_visible"
    HEAD_OCCLUDED = "head_occluded"
    LOWER_BODY_ONLY = "lower_body_only"
    LIMB_ONLY = "limb_only"
    BENT_OVER_UNCLEAR = "bent_over_unclear"
    TOO_SMALL = "too_small"
    TOO_BLURRY = "too_blurry"
    INTERACTION_RISK = "interaction_risk"
    NOT_EVALUABLE = "not_evaluable"
    UNKNOWN = "unknown"


class TrackObservationType(str, Enum):
    FULL_PERSON = "full_person"
    UPPER_BODY = "upper_body"
    LOWER_BODY = "lower_body"
    FOOTWEAR = "footwear"
    PARTIAL = "partial"
    UNKNOWN = "unknown"


class BBox(AppModel):
    x1: int
    y1: int
    x2: int
    y2: int

    @property
    def width(self) -> int:
        return max(0, int(self.x2) - int(self.x1))

    @property
    def height(self) -> int:
        return max(0, int(self.y2) - int(self.y1))

    @property
    def area(self) -> int:
        return self.width * self.height

    @property
    def center(self) -> tuple[float, float]:
        return ((float(self.x1) + float(self.x2)) / 2.0, (float(self.y1) + float(self.y2)) / 2.0)

    @property
    def center_x(self) -> float:
        return self.center[0]

    @property
    def center_y(self) -> float:
        return self.center[1]

    @property
    def is_valid(self) -> bool:
        return self.width > 0 and self.height > 0

    def as_xyxy(self) -> tuple[int, int, int, int]:
        return int(self.x1), int(self.y1), int(self.x2), int(self.y2)

    def clamp(self, *, frame_width: int, frame_height: int) -> BBox:
        width = max(0, int(frame_width))
        height = max(0, int(frame_height))
        return BBox(
            x1=max(0, min(width, int(self.x1))),
            y1=max(0, min(height, int(self.y1))),
            x2=max(0, min(width, int(self.x2))),
            y2=max(0, min(height, int(self.y2))),
        )


class PersonDetection(AppModel):
    bbox: BBox
    confidence: float = 0.0
    class_id: int | None = None
    class_name: str | None = None


class TrackedPerson(AppModel):
    track_id: int
    bbox: BBox
    confidence: float = 0.0
    hits: int = 0
    age: int = 0
    time_since_update: int = 0
    shadow_duplicate: bool = False
    shadow_of_track_id: int | None = None


class TrackerSuppressedDuplicate(AppModel):
    kept_track_id: int | None = None
    dropped_track_id: int | None = None
    detection_bbox: BBox | None = None
    shadow_bbox: BBox | None = None
    reason: str = "unknown"


class TrackerUpdateResult(AppModel):
    visible_tracks: list[TrackedPerson] = Field(default_factory=list)
    shadow_tracks: list[TrackedPerson] = Field(default_factory=list)
    suppressed_duplicates: list[TrackerSuppressedDuplicate] = Field(default_factory=list)
    lost_track_ids: list[int] = Field(default_factory=list)
    removed_track_ids: list[int] = Field(default_factory=list)


class QualityAssessment(AppModel):
    is_valid: bool = False
    quality_score: float = 0.0

    head_visible: bool = False
    is_cropped: bool = False
    occlusion_ratio: float = 0.0
    bbox_area_ratio: float = 0.0

    is_usable_for_tracking: bool = False
    is_usable_for_headwear: bool = False
    is_low_quality: bool = True
    is_truncated: bool = False
    is_occluded: bool = False

    is_partial_limb_only: bool = False
    is_lower_body_only: bool = False
    is_bent_over: bool = False
    is_interaction_risk: bool = False
    headwear_context_usable: bool = False
    visibility_state: str = TrackVisibilityState.UNKNOWN.value

    reasons: list[str] = Field(default_factory=list)
    reason_codes: list[str] = Field(default_factory=list)

    is_usable_for_identity: bool = False
    body_usable_for_identity: bool = False
    upper_body_usable_for_identity: bool = False
    lower_body_usable_for_identity: bool = False
    footwear_usable_for_identity: bool = False

    @property
    def usable_for_tracking(self) -> bool:
        return self.is_usable_for_tracking or self.is_valid

    @property
    def usable_for_headwear(self) -> bool:
        return self.is_usable_for_headwear and self.headwear_context_usable

    @property
    def usable_for_identity(self) -> bool:
        return False

    @property
    def has_blocking_reason(self) -> bool:
        return bool(self.reason_codes or self.reasons)


class HeadwearAssessment(AppModel):
    signal: ComplianceSignal = ComplianceSignal.UNKNOWN
    confidence: float = 0.0
    reason: str = "unknown"
    label: str | None = None
    class_id: int | None = None
    model_name: str | None = None
    quality_score: float | None = None
    reason_codes: list[str] = Field(default_factory=list)
    raw_scores: dict[str, float] = Field(default_factory=dict)

    @property
    def is_violation(self) -> bool:
        return self.signal == ComplianceSignal.VIOLATION

    @property
    def is_compliant(self) -> bool:
        return self.signal == ComplianceSignal.COMPLIANT

    @property
    def is_unknown(self) -> bool:
        return self.signal == ComplianceSignal.UNKNOWN


class TrackEpisodeRecord(AppModel):
    track_episode_id: str
    camera_id: str
    source_track_id: int
    first_seen_at: datetime
    last_seen_at: datetime
    first_frame_index: int = 0
    last_frame_index: int = 0
    status: TrackEpisodeStatus = TrackEpisodeStatus.ACTIVE
    last_bbox: BBox | None = None
    last_quality_score: float = 0.0
    visible_frame_count: int = 0
    headwear_evaluable_frame_count: int = 0
    headwear_unknown_frame_count: int = 0
    violation_frame_count: int = 0
    lost_frame_count: int = 0
    duplicate_suppressed_count: int = 0
    interaction_risk_count: int = 0
    partial_suppressed_count: int = 0
    candidate_frame_count: int = 0
    promoted_frame_count: int = 0
    head_crop_rejected_count: int = 0
    headwear_skipped_bad_crop_count: int = 0
    headwear_model_called_count: int = 0
    headwear_pre_skipped_count: int = 0
    headwear_skipped_visibility_count: int = 0
    headwear_classification_not_scheduled_count: int = 0
    active_incident_id: str | None = None
    best_evidence_score: float = 0.0
    reason_codes: list[str] = Field(default_factory=list)


class TrackEpisodeResponse(AppModel):
    track_episode_id: str
    camera_id: str
    source_track_id: int
    first_seen_at: datetime
    last_seen_at: datetime
    first_frame_index: int = 0
    last_frame_index: int = 0
    status: TrackEpisodeStatus
    last_quality_score: float = 0.0
    visible_frame_count: int = 0
    headwear_evaluable_frame_count: int = 0
    headwear_unknown_frame_count: int = 0
    violation_frame_count: int = 0
    active_incident_id: str | None = None
    partial_suppressed_count: int = 0
    candidate_frame_count: int = 0
    promoted_frame_count: int = 0
    reason_codes: list[str] = Field(default_factory=list)


class DayPersonResponse(TrackEpisodeResponse):
    pass


class DayPersonRecord(TrackEpisodeRecord):
    pass


class IncidentCase(AppModel):
    case_id: str
    track_episode_id: str
    camera_id: str
    opened_at: datetime
    last_confirmed_at: datetime
    closed_at: datetime | None = None
    source_track_id: int | None = None
    state: IncidentState = IncidentState.CANDIDATE
    best_frame_path: str | None = None
    best_person_crop_path: str | None = None
    best_head_crop_path: str | None = None
    best_clip_path: str | None = None
    evidence_count: int = 0
    max_confidence: float = 0.0
    violation_duration_sec: float = 0.0
    reason_codes: list[str] = Field(default_factory=list)

    @property
    def is_active(self) -> bool:
        return self.state in {IncidentState.CANDIDATE, IncidentState.OPEN, IncidentState.COOLDOWN}

    @property
    def is_closed(self) -> bool:
        return self.state == IncidentState.CLOSED

    @property
    def day_person_id(self) -> str:
        return self.track_episode_id


class IncidentCaseResponse(AppModel):
    case_id: str
    track_episode_id: str
    camera_id: str
    opened_at: datetime
    last_confirmed_at: datetime
    closed_at: datetime | None = None
    source_track_id: int | None = None
    state: IncidentState
    best_frame_path: str | None = None
    best_person_crop_path: str | None = None
    best_head_crop_path: str | None = None
    best_clip_path: str | None = None
    evidence_count: int = 0
    max_confidence: float = 0.0
    violation_duration_sec: float = 0.0
    reason_codes: list[str] = Field(default_factory=list)


class RuntimeStats(AppModel):
    total_frames_to_process: int = 0
    total_frames_read: int = 0
    total_frames_processed: int = 0
    total_frames_skipped: int = 0
    current_analysis_fps: float = 0.0
    current_tracking_fps: float = 0.0
    current_headwear_classification_fps: float = 0.0
    last_frame_at: datetime | None = None
    active_tracks: int = 0
    active_track_episodes: int = 0
    lost_track_episodes: int = 0
    ended_track_episodes: int = 0
    active_incidents_count: int = 0
    valid_quality_observations: int = 0
    quality_rejected_observations: int = 0
    headwear_evaluable_observations: int = 0
    headwear_not_evaluable_observations: int = 0
    headwear_unknown_observations: int = 0
    shadow_tracks_count: int = 0
    suppressed_duplicate_tracks_count: int = 0
    track_id_switch_suspicions: int = 0
    track_fragmentation_suspicions: int = 0
    track_merge_suspicions: int = 0
    track_split_suspicions: int = 0
    short_episode_count: int = 0
    partial_track_suppressed_count: int = 0
    duplicate_track_suppressed_count: int = 0
    head_crop_rejected_count: int = 0
    headwear_skipped_bad_crop_count: int = 0
    headwear_model_called_count: int = 0
    headwear_pre_skipped_count: int = 0
    headwear_skipped_visibility_count: int = 0
    headwear_classification_not_scheduled_count: int = 0
    person_bbox_raw_count: int = 0
    person_bbox_accepted_count: int = 0
    person_bbox_rejected_count: int = 0
    person_bbox_rejected_too_small_count: int = 0
    person_bbox_rejected_border_count: int = 0
    person_bbox_rejected_bad_aspect_count: int = 0
    person_bbox_rejected_no_head_zone_count: int = 0
    person_bbox_rejected_partial_count: int = 0
    person_bbox_rejected_overlap_count: int = 0
    person_bbox_rejected_scene_occlusion_count: int = 0
    person_bbox_rejected_headwear_zone_occluded_count: int = 0
    person_bbox_rejected_exit_fragment_count: int = 0
    person_bbox_rejected_edge_fragment_for_headwear_count: int = 0
    candidate_tracks_count: int = 0
    promoted_tracks_count: int = 0
    incident_sync_attempts: int = 0
    incident_sync_successes: int = 0
    export_progress_percent: float = 0.0
    export_eta_sec: float = 0.0
    last_export_output_path: str | None = None
    last_export_message: str = ""
    tracking_backend: str | None = None
    tracking_ready: bool = False
    tracking_failure_reason: str | None = None
    day_people_count: int = 0
    identity_confirmed_count: int = 0
    identity_tentative_count: int = 0
    identity_conflicts_count: int = 0
    identity_duplicate_blocks_count: int = 0
    identity_reassignments_count: int = 0


class RuntimeStatusResponse(AppModel):
    running: bool
    camera_id: str
    detector_ready: bool
    headwear_detector_mode: str
    stats: RuntimeStats


class CommandResponse(AppModel):
    ok: bool
    message: str
