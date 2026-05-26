# ============================================================
# File: vision/app/pipeline/human_observation.py
# Purpose:
# - Track-centric observation model used by headwear and incident logic.
# - Builds one observation for one current track episode.
# - Does not create, resolve or store person/day_person identity.
# - Keeps the old HumanObservation name as a compatibility alias for modules
#   that still call HeadwearDetector.assess_observation().
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from app.models.schemas import (
    BBox,
    QualityAssessment,
    TrackObservationType,
    TrackVisibilityState,
)
from app.pipeline.headwear_crop_geometry import build_headwear_crop_box
from app.pipeline.tracking_types import TrackEpisodeAssignment, TrackedPersonObservation


class ObservationType(str, Enum):
    FULL_PERSON = TrackObservationType.FULL_PERSON.value
    UPPER_BODY = TrackObservationType.UPPER_BODY.value
    LOWER_BODY = TrackObservationType.LOWER_BODY.value
    FOOTWEAR = TrackObservationType.FOOTWEAR.value
    PARTIAL = TrackObservationType.PARTIAL.value
    UNKNOWN = TrackObservationType.UNKNOWN.value


@dataclass(init=False, slots=True)
class VisibleParts:
    head: bool = False
    face: bool = False
    upper_body: bool = False
    lower_body: bool = False
    footwear: bool = False

    def __init__(
        self,
        head: bool = False,
        face: bool = False,
        upper_body: bool = False,
        lower_body: bool = False,
        footwear: bool = False,
        head_visible: bool | None = None,
        face_visible: bool | None = None,
        upper_body_visible: bool | None = None,
        lower_body_visible: bool | None = None,
        footwear_visible: bool | None = None,
    ) -> None:
        self.head = bool(head if head_visible is None else head_visible)
        self.face = bool(face if face_visible is None else face_visible)
        self.upper_body = bool(upper_body if upper_body_visible is None else upper_body_visible)
        self.lower_body = bool(lower_body if lower_body_visible is None else lower_body_visible)
        self.footwear = bool(footwear if footwear_visible is None else footwear_visible)


@dataclass(slots=True)
class TrackObservation:
    camera_id: str
    track_episode_id: str | None
    source_track_id: int
    track_id: int
    frame_index: int
    observed_at: datetime

    bbox: BBox
    head_bbox: BBox | None
    quality: QualityAssessment
    visible_parts: VisibleParts

    observation_type: ObservationType
    visibility_state: str
    scene_zone: str

    quality_score: float
    bbox_area_ratio: float
    occlusion_ratio: float

    headwear_context_usable: bool
    interaction_risk: bool

    is_cropped: bool
    is_low_quality: bool
    is_truncated: bool
    is_occluded: bool

    reasons: list[str] = field(default_factory=list)
    reason_codes: list[str] = field(default_factory=list)

    @property
    def is_usable_for_tracking(self) -> bool:
        return bool(self.quality.is_valid)

    @property
    def is_usable_for_headwear(self) -> bool:
        return bool(self.headwear_context_usable and self.quality.is_usable_for_headwear)

    @property
    def is_usable_for_incident(self) -> bool:
        return bool(self.is_usable_for_headwear and not self.interaction_risk and not self.is_occluded)

    @property
    def is_usable_for_identity(self) -> bool:
        # Deprecated compatibility property. Person identity is disabled.
        return False

    @property
    def is_usable_for_registry(self) -> bool:
        return bool(self.is_usable_for_tracking)

    @property
    def day_person_id(self) -> None:
        return None

    @property
    def person_id(self) -> None:
        return None

    @property
    def candidate_id(self) -> None:
        return None

    @property
    def identity_state(self) -> str:
        return "track_episode"

    @property
    def identity_reason(self) -> str:
        return "person_identity_disabled"

    @property
    def subject_key(self) -> str | None:
        return self.track_episode_id

    @property
    def display_id(self) -> str:
        return self.track_episode_id or f"track_{self.track_id}"


# Compatibility wrapper used by HeadwearDetector and older debug scripts.
# New runtime code builds TrackObservation through build_track_observation_from_tracking().
# Some legacy tests/tools still instantiate HumanObservation with the pre-track-centric
# keyword set (day_person_id, candidate_id, identity_* and usability aliases). Keep
# that surface accepted here, but normalize it into canonical TrackObservation fields.
class HumanObservation(TrackObservation):
    __slots__ = ()

    def __init__(self, **kwargs):
        track_id_raw = kwargs.pop("track_id", kwargs.pop("source_track_id", 0))
        try:
            track_id = int(track_id_raw)
        except Exception:
            track_id = 0
        source_track_id_raw = kwargs.pop("source_track_id", track_id)
        try:
            source_track_id = int(source_track_id_raw)
        except Exception:
            source_track_id = track_id

        legacy_day_person_id = kwargs.pop("day_person_id", None)
        legacy_person_id = kwargs.pop("person_id", None)
        kwargs.pop("candidate_id", None)
        kwargs.pop("identity_state", None)
        kwargs.pop("identity_reason", None)
        kwargs.pop("confidence", None)
        kwargs.pop("tracking_confidence", None)
        kwargs.pop("is_usable_for_incident", None)
        kwargs.pop("is_usable_for_registry", None)
        frame_shape = kwargs.pop("frame_shape", None)

        quality = kwargs.pop("quality")
        visible_parts = kwargs.pop("visible_parts", VisibleParts())
        bbox = kwargs.pop("bbox")
        head_bbox = kwargs.pop("head_bbox", None)
        if head_bbox is None and frame_shape is not None and bool(getattr(visible_parts, "head", False)):
            try:
                head_bbox = _build_head_bbox(frame_shape=frame_shape, person_bbox=bbox, quality=quality)
            except Exception:
                head_bbox = None

        headwear_alias = kwargs.pop("is_usable_for_headwear", None)
        if headwear_alias is None:
            headwear_context_usable = bool(
                getattr(quality, "headwear_context_usable", False)
                or (getattr(quality, "is_usable_for_headwear", False) and getattr(visible_parts, "head", False))
            )
        else:
            headwear_context_usable = bool(headwear_alias)

        super().__init__(
            camera_id=str(kwargs.pop("camera_id")),
            track_episode_id=kwargs.pop("track_episode_id", None) or legacy_day_person_id or legacy_person_id,
            source_track_id=source_track_id,
            track_id=track_id,
            frame_index=int(kwargs.pop("frame_index")),
            observed_at=kwargs.pop("observed_at"),
            bbox=bbox,
            head_bbox=head_bbox,
            quality=quality,
            visible_parts=visible_parts,
            observation_type=kwargs.pop("observation_type", ObservationType.UNKNOWN),
            visibility_state=str(kwargs.pop("visibility_state", getattr(quality, "visibility_state", TrackVisibilityState.UNKNOWN.value))),
            scene_zone=str(kwargs.pop("scene_zone", "unknown")),
            quality_score=float(kwargs.pop("quality_score", getattr(quality, "quality_score", 0.0))),
            bbox_area_ratio=float(kwargs.pop("bbox_area_ratio", getattr(quality, "bbox_area_ratio", 0.0))),
            occlusion_ratio=float(kwargs.pop("occlusion_ratio", getattr(quality, "occlusion_ratio", 0.0))),
            headwear_context_usable=bool(kwargs.pop("headwear_context_usable", headwear_context_usable)),
            interaction_risk=bool(kwargs.pop("interaction_risk", getattr(quality, "is_interaction_risk", False))),
            is_cropped=bool(kwargs.pop("is_cropped", getattr(quality, "is_cropped", False))),
            is_low_quality=bool(kwargs.pop("is_low_quality", getattr(quality, "is_low_quality", False))),
            is_truncated=bool(kwargs.pop("is_truncated", getattr(quality, "is_truncated", False))),
            is_occluded=bool(kwargs.pop("is_occluded", getattr(quality, "is_occluded", False))),
            reasons=list(kwargs.pop("reasons", getattr(quality, "reasons", []) or [])),
            reason_codes=list(kwargs.pop("reason_codes", getattr(quality, "reason_codes", []) or [])),
        )


def build_track_observation_from_tracking(
    *,
    camera_id: str,
    tracked_observation: TrackedPersonObservation,
    episode_assignment: TrackEpisodeAssignment,
    quality: QualityAssessment,
    frame_shape: tuple[int, ...],
    registry_min_quality: float = 0.0,
) -> TrackObservation:
    if int(episode_assignment.track_id) != int(tracked_observation.track_id):
        raise ValueError(
            "TrackEpisodeAssignment.track_id does not match TrackedPersonObservation.track_id"
        )

    visibility_state = _visibility_state_from_quality(quality)
    head_bbox = _build_head_bbox(
        frame_shape=frame_shape,
        person_bbox=tracked_observation.bbox,
        quality=quality,
    )
    visible_parts = _visible_parts_from_quality(quality=quality, head_bbox=head_bbox)
    observation_type = _observation_type_from_quality(quality=quality, visible_parts=visible_parts)

    interaction_risk = _interaction_risk_from_quality(quality)
    gate_reject_reason_codes = {
        str(reason).strip().lower()
        for reason in tracked_observation.reason_codes
        if str(reason).strip().lower().startswith("person_box_rejected_")
    }

    headwear_context_usable = bool(
        quality.is_valid
        and quality.is_usable_for_headwear
        and quality.headwear_context_usable
        and not gate_reject_reason_codes
        and visible_parts.head
        and visibility_state in {
            TrackVisibilityState.HEAD_VISIBLE.value,
            TrackVisibilityState.FULL_BODY_VISIBLE.value,
            TrackVisibilityState.UPPER_BODY_VISIBLE.value,
            TrackVisibilityState.HEAD_PARTIALLY_VISIBLE.value,
        }
        and not interaction_risk
        and not quality.is_low_quality
        and not quality.is_occluded
        and not quality.is_truncated
    )

    reason_codes = _unique_reason_codes(
        list(quality.reason_codes)
        + list(tracked_observation.reason_codes)
        + list(episode_assignment.reason_codes)
        + [visibility_state]
        + sorted(gate_reject_reason_codes)
        + ([] if headwear_context_usable else ["headwear_context_not_usable"])
    )

    return TrackObservation(
        camera_id=str(camera_id),
        track_episode_id=episode_assignment.track_episode_id,
        source_track_id=int(tracked_observation.track_id),
        track_id=int(tracked_observation.track_id),
        frame_index=int(tracked_observation.frame_index),
        observed_at=tracked_observation.observed_at,
        bbox=tracked_observation.bbox,
        head_bbox=head_bbox,
        quality=quality,
        visible_parts=visible_parts,
        observation_type=observation_type,
        visibility_state=visibility_state,
        scene_zone=_infer_scene_zone(tracked_observation.bbox, frame_shape),
        quality_score=_clip01(quality.quality_score),
        bbox_area_ratio=max(0.0, float(quality.bbox_area_ratio)),
        occlusion_ratio=_clip01(quality.occlusion_ratio),
        headwear_context_usable=headwear_context_usable,
        interaction_risk=interaction_risk,
        is_cropped=bool(quality.is_cropped),
        is_low_quality=bool(quality.is_low_quality),
        is_truncated=bool(quality.is_truncated),
        is_occluded=bool(quality.is_occluded),
        reasons=list(quality.reasons),
        reason_codes=reason_codes,
    )


# Backward-compatible function name. It accepts either the new
# episode_assignment argument or the old assignment keyword if a caller still
# uses the previous signature.
def build_human_observation_from_tracking(
    *,
    camera_id: str,
    tracked_observation: TrackedPersonObservation,
    episode_assignment: TrackEpisodeAssignment | None = None,
    assignment: object | None = None,
    quality: QualityAssessment,
    frame_shape: tuple[int, ...],
    registry_min_quality: float = 0.0,
) -> TrackObservation:
    if episode_assignment is None:
        episode_assignment = _assignment_from_legacy_or_track(
            assignment=assignment,
            tracked_observation=tracked_observation,
        )

    return build_track_observation_from_tracking(
        camera_id=camera_id,
        tracked_observation=tracked_observation,
        episode_assignment=episode_assignment,
        quality=quality,
        frame_shape=frame_shape,
        registry_min_quality=registry_min_quality,
    )


def _assignment_from_legacy_or_track(
    *,
    assignment: object | None,
    tracked_observation: TrackedPersonObservation,
) -> TrackEpisodeAssignment:
    from app.pipeline.tracking_types import TrackEpisodeAssignmentKind
    from app.models.schemas import TrackEpisodeStatus

    track_episode_id = getattr(assignment, "track_episode_id", None)
    if not track_episode_id:
        track_episode_id = f"track_{tracked_observation.track_id}"

    return TrackEpisodeAssignment(
        track_id=int(tracked_observation.track_id),
        track_episode_id=str(track_episode_id),
        source_track_id=int(tracked_observation.track_id),
        kind=TrackEpisodeAssignmentKind.EXISTING_EPISODE,
        status=TrackEpisodeStatus.ACTIVE,
        confidence=_clip01(getattr(tracked_observation, "tracking_confidence", tracked_observation.confidence)),
        stable_hits=max(0, int(getattr(tracked_observation, "track_hits", 0))),
        reason="legacy_assignment_adapter",
        reason_codes=["legacy_assignment_adapter"],
        is_confirmed=bool(getattr(tracked_observation, "is_confirmed_track", False)),
        is_new_episode=False,
    )


def _build_head_bbox(
    *,
    frame_shape: tuple[int, ...],
    person_bbox: BBox,
    quality: QualityAssessment,
) -> BBox | None:
    visibility_state = str(getattr(quality, "visibility_state", "") or "").strip().lower()
    if visibility_state in {
        TrackVisibilityState.INTERACTION_RISK.value,
        TrackVisibilityState.LIMB_ONLY.value,
        TrackVisibilityState.LOWER_BODY_ONLY.value,
        TrackVisibilityState.BENT_OVER_UNCLEAR.value,
        TrackVisibilityState.HEAD_OCCLUDED.value,
        TrackVisibilityState.NOT_EVALUABLE.value,
        TrackVisibilityState.TOO_SMALL.value,
        TrackVisibilityState.TOO_BLURRY.value,
    }:
        return None
    if not bool(getattr(quality, "head_visible", False)):
        return None
    if bool(getattr(quality, "is_lower_body_only", False)):
        return None
    if bool(getattr(quality, "is_partial_limb_only", False)):
        return None
    if bool(getattr(quality, "is_bent_over", False)):
        return None
    if bool(getattr(quality, "is_interaction_risk", False)):
        return None

    crop_box = build_headwear_crop_box(
        frame_shape=frame_shape,
        person_bbox=person_bbox,
    )
    if crop_box is None:
        return None

    return BBox(x1=crop_box.x1, y1=crop_box.y1, x2=crop_box.x2, y2=crop_box.y2)


def _visible_parts_from_quality(*, quality: QualityAssessment, head_bbox: BBox | None) -> VisibleParts:
    lower_body_only = bool(getattr(quality, "is_lower_body_only", False))
    limb_only = bool(getattr(quality, "is_partial_limb_only", False))
    head_visible = bool(getattr(quality, "head_visible", False))

    return VisibleParts(
        head=head_visible,
        face=False,
        upper_body=bool(quality.is_valid and not lower_body_only and not limb_only),
        lower_body=bool(quality.is_valid),
        footwear=bool(lower_body_only or limb_only),
    )


def _observation_type_from_quality(*, quality: QualityAssessment, visible_parts: VisibleParts) -> ObservationType:
    if bool(getattr(quality, "is_partial_limb_only", False)):
        return ObservationType.PARTIAL
    if bool(getattr(quality, "is_lower_body_only", False)):
        return ObservationType.LOWER_BODY
    if visible_parts.head and visible_parts.upper_body and visible_parts.lower_body:
        return ObservationType.FULL_PERSON
    if visible_parts.head or visible_parts.upper_body:
        return ObservationType.UPPER_BODY
    if visible_parts.lower_body:
        return ObservationType.LOWER_BODY
    return ObservationType.UNKNOWN


def _visibility_state_from_quality(quality: QualityAssessment) -> str:
    explicit = str(getattr(quality, "visibility_state", "") or "").strip()
    if explicit and explicit != TrackVisibilityState.UNKNOWN.value:
        return explicit
    if bool(getattr(quality, "is_interaction_risk", False)):
        return TrackVisibilityState.INTERACTION_RISK.value
    if bool(getattr(quality, "is_partial_limb_only", False)):
        return TrackVisibilityState.LIMB_ONLY.value
    if bool(getattr(quality, "is_lower_body_only", False)):
        return TrackVisibilityState.LOWER_BODY_ONLY.value
    if bool(getattr(quality, "is_bent_over", False)):
        return TrackVisibilityState.BENT_OVER_UNCLEAR.value
    if not bool(getattr(quality, "head_visible", False)):
        return TrackVisibilityState.HEAD_OCCLUDED.value
    if bool(getattr(quality, "is_occluded", False)):
        return TrackVisibilityState.HEAD_PARTIALLY_VISIBLE.value
    if bool(getattr(quality, "is_low_quality", True)):
        return TrackVisibilityState.NOT_EVALUABLE.value
    return TrackVisibilityState.HEAD_VISIBLE.value


def _interaction_risk_from_quality(quality: QualityAssessment) -> bool:
    if bool(getattr(quality, "is_interaction_risk", False)):
        return True
    codes = {str(item).lower() for item in list(getattr(quality, "reason_codes", []) or [])}
    return any(
        item in codes
        for item in {
            "peer_occlusion",
            "interaction_risk",
            "head_overlap_with_peer",
            "crossing_risk",
        }
    )


def _infer_scene_zone(bbox: BBox, frame_shape: tuple[int, ...]) -> str:
    if len(frame_shape) < 2:
        return "unknown"
    height = max(1, int(frame_shape[0]))
    width = max(1, int(frame_shape[1]))
    cx = bbox.center_x / float(width)
    cy = bbox.center_y / float(height)
    horizontal = "left" if cx < 0.33 else "right" if cx > 0.66 else "center"
    vertical = "top" if cy < 0.33 else "bottom" if cy > 0.66 else "middle"
    return f"{vertical}_{horizontal}"


def _unique_reason_codes(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _clip01(value: object) -> float:
    try:
        number = float(value)
    except Exception:
        number = 0.0
    return max(0.0, min(1.0, number))
