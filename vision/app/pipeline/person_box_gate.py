# ============================================================
# File: vision/app/pipeline/person_box_gate.py
# Purpose:
# - Filters raw tracker person boxes before they enter the headwear runtime chain.
# - Separates raw detector/tracker boxes from workable person boxes.
# - Keeps rejected boxes available for overlay/debug logic.
# - Separates person-track eligibility from headwear/classifier eligibility.
# - Keeps stable person tracks even when the headwear zone is cropped/unknown;
#   real head visibility is decided later by the HeadDetector chain.
# - Rejects structural false-person fragments such as hands, limbs, apron-like
#   slices, duplicate fragments and impossible geometry.
# - Internal occluder zones are not background masks. They are camera-specific
#   foreground/structure hints used only together with fragment-like geometry.
# - Does not perform ReID, identity matching or incident logic.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from app.config import Settings
from app.models.schemas import BBox
from app.pipeline.tracking_types import TrackedPersonObservation, TrackingFrameResult


_STRUCTURAL_FRAGMENT_REASONS = {
    "person_box_rejected_too_small",
    "person_box_rejected_too_narrow",
    "person_box_rejected_bad_aspect",
    "person_box_rejected_top_cropped",
    "person_box_rejected_no_reliable_head_zone",
    "person_box_rejected_partial",
    "person_box_rejected_overlap",
    "person_box_rejected_exit_fragment",
    "person_box_rejected_edge_fragment_for_headwear",
    "person_box_rejected_internal_occluder_fragment",
    "person_box_rejected_headless_internal_fragment",
    "person_box_rejected_peer_duplicate_fragment",
    "person_box_rejected_limb_shape_fragment",
    "person_box_rejected_side_cropped",
}

_SCENE_STRUCTURAL_REASONS = {
    "person_box_rejected_top_cropped",
    "person_box_rejected_exit_fragment",
    "person_box_rejected_edge_fragment_for_headwear",
    "person_box_rejected_internal_occluder_fragment",
    "person_box_rejected_headless_internal_fragment",
    "person_box_rejected_peer_duplicate_fragment",
    "person_box_rejected_limb_shape_fragment",
    "person_box_rejected_side_cropped",
    "person_box_rejected_no_reliable_head_zone",
    "person_box_rejected_partial",
}


@dataclass(slots=True)
class PersonBoxDecision:
    track_id: int
    accepted: bool
    accepted_for_tracking: bool = True
    accepted_for_headwear: bool = False
    reason_codes: list[str] = field(default_factory=list)
    bbox_area_ratio: float = 0.0
    aspect_ratio: float = 0.0
    headwear_zone_bbox: BBox | None = None
    head_zone_bbox: BBox | None = None
    head_zone_border_risk: bool = False
    peer_overlap_ratio: float = 0.0
    scene_occlusion_ratio: float = 0.0
    headwear_zone_occlusion_ratio: float = 0.0
    internal_occluder_ratio: float = 0.0
    internal_headwear_occluder_ratio: float = 0.0
    internal_occluder_fragment_risk: bool = False
    headless_internal_fragment_risk: bool = False
    peer_duplicate_fragment_risk: bool = False
    limb_shape_fragment_risk: bool = False
    exit_fragment_risk: bool = False
    edge_fragment_for_headwear: bool = False
    visible_fraction_after_scene: float = 1.0
    scene_occlusion_is_structural: bool = False


@dataclass(slots=True)
class PersonBoxGateResult:
    accepted_tracks: list[TrackedPersonObservation]
    rejected_tracks: list[TrackedPersonObservation]
    decisions_by_track_id: dict[int, PersonBoxDecision]

    @property
    def raw_count(self) -> int:
        return len(self.accepted_tracks) + len(self.rejected_tracks)

    @property
    def accepted_count(self) -> int:
        return len(self.accepted_tracks)

    @property
    def rejected_count(self) -> int:
        return len(self.rejected_tracks)

    def rejected_count_by_reason(self, token: str) -> int:
        normalized = str(token or "").strip().lower()
        if not normalized:
            return 0

        count = 0
        for decision in self.decisions_by_track_id.values():
            if decision.accepted:
                continue

            reason_set = {str(reason).strip().lower() for reason in decision.reason_codes}
            if normalized in reason_set:
                count += 1

        return count


@dataclass(slots=True)
class _Zone:
    name: str
    bbox: BBox


@dataclass(slots=True)
class _ZoneScore:
    bbox_ratio: float = 0.0
    headwear_zone_ratio: float = 0.0
    union_bbox_ratio: float = 0.0
    union_headwear_zone_ratio: float = 0.0
    visible_fraction_after_zone: float = 1.0


@dataclass(slots=True)
class _BorderState:
    touches_top: bool
    touches_left: bool
    touches_right: bool
    touches_side: bool


class PersonBoxGate:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def filter_frame(
        self,
        *,
        tracking_result: TrackingFrameResult,
        frame_shape: tuple[int, ...],
    ) -> PersonBoxGateResult:
        if not bool(getattr(self._settings, "person_box_gate_enabled", True)):
            accepted = [
                self._with_reason(track, "person_box_gate_disabled")
                for track in tracking_result.visible_tracks
            ]
            decisions = {
                int(track.track_id): PersonBoxDecision(
                    track_id=int(track.track_id),
                    accepted=True,
                    accepted_for_tracking=True,
                    accepted_for_headwear=True,
                    reason_codes=["person_box_gate_disabled"],
                )
                for track in accepted
            }
            return PersonBoxGateResult(
                accepted_tracks=accepted,
                rejected_tracks=[],
                decisions_by_track_id=decisions,
            )

        frame_height, frame_width = self._resolve_frame_dims(frame_shape)
        peer_bboxes = [track.bbox for track in tracking_result.visible_tracks]

        accepted: list[TrackedPersonObservation] = []
        rejected: list[TrackedPersonObservation] = []
        decisions: dict[int, PersonBoxDecision] = {}

        for track in tracking_result.visible_tracks:
            decision = self.assess_track(
                track=track,
                frame_width=frame_width,
                frame_height=frame_height,
                peer_bboxes=peer_bboxes,
            )
            decisions[int(track.track_id)] = decision

            updated_track = self._with_reasons(track, decision.reason_codes)
            if decision.accepted_for_tracking:
                accepted.append(updated_track)
            else:
                rejected.append(updated_track)

        return PersonBoxGateResult(
            accepted_tracks=accepted,
            rejected_tracks=rejected,
            decisions_by_track_id=decisions,
        )

    def assess_track(
        self,
        *,
        track: TrackedPersonObservation,
        frame_width: int,
        frame_height: int,
        peer_bboxes: Iterable[BBox],
    ) -> PersonBoxDecision:
        if frame_width <= 0 or frame_height <= 0:
            return PersonBoxDecision(
                track_id=int(track.track_id),
                accepted=False,
                accepted_for_tracking=False,
                accepted_for_headwear=False,
                reason_codes=["person_box_rejected_invalid_frame"],
            )

        bbox = track.bbox.clamp(frame_width=frame_width, frame_height=frame_height)
        if not bbox.is_valid:
            return PersonBoxDecision(
                track_id=int(track.track_id),
                accepted=False,
                accepted_for_tracking=False,
                accepted_for_headwear=False,
                reason_codes=["person_box_rejected_invalid_bbox"],
            )

        reasons: list[str] = []

        frame_area = max(1, int(frame_width) * int(frame_height))
        bbox_area_ratio = bbox.area / float(frame_area)
        aspect_ratio = bbox.width / float(max(1, bbox.height))

        border_px = self._int_setting(
            "person_box_gate_border_px",
            int(getattr(self._settings, "crop_border_px", 4)),
            minimum=0,
        )
        top_border_px = self._int_setting(
            "person_box_gate_top_border_px",
            10,
            minimum=border_px,
        )
        side_border_px = self._int_setting(
            "person_box_gate_side_border_px",
            6,
            minimum=border_px,
        )

        border_state = self._border_state(
            bbox=bbox,
            frame_width=frame_width,
            top_border_px=top_border_px,
            side_border_px=side_border_px,
        )

        min_confidence = self._float_setting(
            "person_box_gate_min_confidence",
            float(getattr(self._settings, "person_tracking_min_confidence", 0.0)),
            minimum=0.0,
        )
        if float(track.confidence) < min_confidence:
            reasons.append("person_box_rejected_low_confidence")

        self._apply_size_rules(
            bbox=bbox,
            bbox_area_ratio=bbox_area_ratio,
            reasons=reasons,
        )
        self._apply_aspect_rules(
            aspect_ratio=aspect_ratio,
            reasons=reasons,
        )
        self._apply_border_rules(
            border_state=border_state,
            reasons=reasons,
        )

        headwear_zone = self._build_headwear_zone(bbox)
        head_zone_border_risk = self._headwear_zone_has_border_risk(
            headwear_zone=headwear_zone,
            frame_width=frame_width,
            frame_height=frame_height,
            top_border_px=top_border_px,
            side_border_px=side_border_px,
            reject_side_cropped=bool(
                getattr(self._settings, "person_box_gate_reject_side_cropped", False)
            ),
        )

        self._apply_headwear_zone_rules(
            bbox=bbox,
            headwear_zone=headwear_zone,
            head_zone_border_risk=head_zone_border_risk,
            reasons=reasons,
        )

        peer_overlap_ratio = self._max_overlap_ratio(bbox, peer_bboxes)
        peer_duplicate_fragment_risk = self._is_peer_duplicate_fragment(
            bbox=bbox,
            peer_bboxes=peer_bboxes,
        )
        if peer_duplicate_fragment_risk:
            reasons.append("person_box_rejected_peer_duplicate_fragment")
            reasons.append("person_box_rejected_overlap")

        max_peer_overlap = self._float_setting(
            "person_box_gate_max_peer_overlap_ratio",
            0.72,
            minimum=0.0,
            maximum=1.0,
        )
        if peer_overlap_ratio > max_peer_overlap:
            reasons.append("person_box_rejected_overlap")

        exit_fragment_risk = self._is_exit_fragment(
            bbox=bbox,
            frame_width=frame_width,
            frame_height=frame_height,
            side_border_px=side_border_px,
            headwear_zone=headwear_zone,
            head_zone_border_risk=head_zone_border_risk,
            border_state=border_state,
        )
        if exit_fragment_risk:
            reasons.append("person_box_rejected_exit_fragment")

        edge_fragment_for_headwear = self._is_edge_fragment_for_headwear(
            bbox=bbox,
            frame_width=frame_width,
            frame_height=frame_height,
            side_border_px=side_border_px,
            headwear_zone=headwear_zone,
            border_state=border_state,
        )
        if edge_fragment_for_headwear:
            reasons.append("person_box_rejected_edge_fragment_for_headwear")
            reasons.append("person_box_rejected_no_reliable_head_zone")

        internal_score = self._internal_occluder_score(
            bbox=bbox,
            headwear_zone=headwear_zone,
            frame_width=frame_width,
            frame_height=frame_height,
        )
        internal_occluder_fragment_risk = self._is_internal_occluder_fragment(
            bbox=bbox,
            frame_width=frame_width,
            frame_height=frame_height,
            score=internal_score,
        )
        if internal_occluder_fragment_risk:
            reasons.append("person_box_rejected_internal_occluder_fragment")
            reasons.append("person_box_rejected_no_reliable_head_zone")

        headless_internal_fragment_risk = self._is_headless_internal_fragment(
            bbox=bbox,
            frame_width=frame_width,
            frame_height=frame_height,
            internal_score=internal_score,
        )
        if headless_internal_fragment_risk:
            reasons.append("person_box_rejected_headless_internal_fragment")
            reasons.append("person_box_rejected_no_reliable_head_zone")

        limb_shape_fragment_risk = self._is_limb_shape_fragment(
            bbox=bbox,
            frame_width=frame_width,
            frame_height=frame_height,
        )
        if limb_shape_fragment_risk:
            reasons.append("person_box_rejected_limb_shape_fragment")
            reasons.append("person_box_rejected_no_reliable_head_zone")

        scene_score = self._scene_occlusion_score(
            bbox=bbox,
            headwear_zone=headwear_zone,
            frame_width=frame_width,
            frame_height=frame_height,
        )
        scene_occlusion_is_structural = self._scene_occlusion_is_structural(
            reasons=reasons,
            scene_score=scene_score,
            exit_fragment_risk=exit_fragment_risk,
            edge_fragment_for_headwear=edge_fragment_for_headwear,
            internal_occluder_fragment_risk=internal_occluder_fragment_risk,
            headless_internal_fragment_risk=headless_internal_fragment_risk,
            peer_duplicate_fragment_risk=peer_duplicate_fragment_risk,
            limb_shape_fragment_risk=limb_shape_fragment_risk,
            head_zone_border_risk=head_zone_border_risk,
        )
        self._apply_scene_occlusion_rules(
            scene_score=scene_score,
            scene_occlusion_is_structural=scene_occlusion_is_structural,
            reasons=reasons,
        )

        if track.is_shadow:
            reasons.append("person_box_rejected_shadow_track")
        if not track.is_visible:
            reasons.append("person_box_rejected_not_visible")

        accepted_for_tracking = bool(not track.is_shadow and track.is_visible and bbox.is_valid)
        accepted_for_headwear = bool(accepted_for_tracking and not reasons)

        if accepted_for_headwear:
            reasons.append("person_box_accepted_workable")

        return PersonBoxDecision(
            track_id=int(track.track_id),
            accepted=accepted_for_tracking,
            accepted_for_tracking=accepted_for_tracking,
            accepted_for_headwear=accepted_for_headwear,
            reason_codes=self._unique_reasons(reasons),
            bbox_area_ratio=bbox_area_ratio,
            aspect_ratio=aspect_ratio,
            headwear_zone_bbox=headwear_zone,
            head_zone_bbox=headwear_zone,
            head_zone_border_risk=head_zone_border_risk,
            peer_overlap_ratio=peer_overlap_ratio,
            scene_occlusion_ratio=max(scene_score.bbox_ratio, scene_score.union_bbox_ratio),
            headwear_zone_occlusion_ratio=max(
                scene_score.headwear_zone_ratio,
                scene_score.union_headwear_zone_ratio,
            ),
            internal_occluder_ratio=max(
                internal_score.bbox_ratio,
                internal_score.union_bbox_ratio,
            ),
            internal_headwear_occluder_ratio=max(
                internal_score.headwear_zone_ratio,
                internal_score.union_headwear_zone_ratio,
            ),
            internal_occluder_fragment_risk=internal_occluder_fragment_risk,
            headless_internal_fragment_risk=headless_internal_fragment_risk,
            peer_duplicate_fragment_risk=peer_duplicate_fragment_risk,
            limb_shape_fragment_risk=limb_shape_fragment_risk,
            exit_fragment_risk=exit_fragment_risk,
            edge_fragment_for_headwear=edge_fragment_for_headwear,
            visible_fraction_after_scene=scene_score.visible_fraction_after_zone,
            scene_occlusion_is_structural=scene_occlusion_is_structural,
        )

    def _apply_size_rules(
        self,
        *,
        bbox: BBox,
        bbox_area_ratio: float,
        reasons: list[str],
    ) -> None:
        min_height_px = self._int_setting(
            "person_box_gate_min_height_px",
            max(80, int(getattr(self._settings, "min_bbox_height_px", 48))),
            minimum=1,
        )
        min_width_px = self._int_setting("person_box_gate_min_width_px", 28, minimum=1)
        min_area_ratio = self._float_setting(
            "person_box_gate_min_area_ratio",
            max(0.0006, float(getattr(self._settings, "min_bbox_area_ratio", 0.0004))),
            minimum=1e-9,
        )

        if bbox.height < min_height_px:
            reasons.append("person_box_rejected_too_small")
        if bbox.width < min_width_px:
            reasons.append("person_box_rejected_too_narrow")
        if bbox_area_ratio < min_area_ratio:
            reasons.append("person_box_rejected_too_small")

    def _apply_aspect_rules(self, *, aspect_ratio: float, reasons: list[str]) -> None:
        min_aspect = self._float_setting(
            "person_box_gate_min_aspect_ratio",
            0.14,
            minimum=0.01,
        )
        max_aspect = self._float_setting(
            "person_box_gate_max_aspect_ratio",
            1.10,
            minimum=min_aspect,
        )

        if aspect_ratio < min_aspect or aspect_ratio > max_aspect:
            reasons.append("person_box_rejected_bad_aspect")

    def _apply_border_rules(
        self,
        *,
        border_state: _BorderState,
        reasons: list[str],
    ) -> None:
        reject_side_cropped = bool(
            getattr(self._settings, "person_box_gate_reject_side_cropped", False)
        )

        if border_state.touches_top:
            reasons.append("person_box_rejected_top_cropped")

        if reject_side_cropped and border_state.touches_side:
            reasons.append("person_box_rejected_side_cropped")

    def _apply_headwear_zone_rules(
        self,
        *,
        bbox: BBox,
        headwear_zone: BBox,
        head_zone_border_risk: bool,
        reasons: list[str],
    ) -> None:
        min_head_zone_height_px = self._int_setting(
            "person_box_gate_min_head_zone_height_px",
            36,
            minimum=12,
        )
        min_head_zone_width_px = self._int_setting(
            "person_box_gate_min_head_zone_width_px",
            36,
            minimum=12,
        )

        if head_zone_border_risk:
            reasons.append("person_box_rejected_no_reliable_head_zone")

        if (
            headwear_zone.height < min_head_zone_height_px
            or headwear_zone.width < min_head_zone_width_px
        ):
            reasons.append("person_box_rejected_no_reliable_head_zone")

        min_body_below_head_ratio = self._float_setting(
            "person_box_gate_min_body_below_head_ratio",
            0.15,
            minimum=0.0,
            maximum=0.80,
        )
        body_below_head = max(0, bbox.y2 - headwear_zone.y2)
        body_context_ratio = body_below_head / float(max(1, bbox.height))

        if body_context_ratio < min_body_below_head_ratio:
            reasons.append("person_box_rejected_partial")

    def _apply_scene_occlusion_rules(
        self,
        *,
        scene_score: _ZoneScore,
        scene_occlusion_is_structural: bool,
        reasons: list[str],
    ) -> None:
        if not bool(getattr(self._settings, "person_box_gate_reject_scene_occlusion", True)):
            return

        if not scene_occlusion_is_structural:
            return

        max_scene_occlusion = self._float_setting(
            "person_box_gate_max_scene_occlusion_ratio",
            0.55,
            minimum=0.0,
            maximum=1.0,
        )
        max_headwear_zone_occlusion = self._float_setting(
            "person_box_gate_max_headwear_zone_occlusion_ratio",
            0.45,
            minimum=0.0,
            maximum=1.0,
        )

        scene_body_ratio = max(scene_score.bbox_ratio, scene_score.union_bbox_ratio)
        scene_headwear_ratio = max(
            scene_score.headwear_zone_ratio,
            scene_score.union_headwear_zone_ratio,
        )

        if scene_body_ratio > max_scene_occlusion:
            reasons.append("person_box_rejected_scene_occlusion")

        if scene_headwear_ratio > max_headwear_zone_occlusion:
            reasons.append("person_box_rejected_headwear_zone_occluded")
            reasons.append("person_box_rejected_no_reliable_head_zone")

    def _build_headwear_zone(self, bbox: BBox) -> BBox:
        ratio = self._float_setting(
            "person_box_gate_head_zone_ratio",
            0.35,
            minimum=0.18,
            maximum=0.50,
        )
        height = max(1, int(round(bbox.height * ratio)))

        return BBox(
            x1=int(bbox.x1),
            y1=int(bbox.y1),
            x2=int(bbox.x2),
            y2=min(int(bbox.y2), int(bbox.y1) + height),
        )

    @staticmethod
    def _headwear_zone_has_border_risk(
        *,
        headwear_zone: BBox,
        frame_width: int,
        frame_height: int,
        top_border_px: int,
        side_border_px: int,
        reject_side_cropped: bool,
    ) -> bool:
        if headwear_zone.y1 <= top_border_px:
            return True

        if headwear_zone.y2 >= frame_height - 1:
            return True

        if reject_side_cropped:
            if headwear_zone.x1 <= side_border_px:
                return True
            if headwear_zone.x2 >= frame_width - side_border_px:
                return True

        return False

    def _is_exit_fragment(
        self,
        *,
        bbox: BBox,
        frame_width: int,
        frame_height: int,
        side_border_px: int,
        headwear_zone: BBox,
        head_zone_border_risk: bool,
        border_state: _BorderState,
    ) -> bool:
        if not bool(getattr(self._settings, "person_box_gate_reject_exit_fragments", True)):
            return False

        exit_border_px = self._int_setting(
            "person_box_gate_exit_border_px",
            24,
            minimum=side_border_px,
        )
        touches_exit_side = bool(
            bbox.x1 <= exit_border_px
            or bbox.x2 >= frame_width - exit_border_px
        )
        if not touches_exit_side:
            return False

        width_ratio = bbox.width / float(max(1, frame_width))
        area_ratio = bbox.area / float(max(1, frame_width * frame_height))
        headwear_width_ratio = headwear_zone.width / float(max(1, frame_width))

        max_width_ratio = self._float_setting(
            "person_box_gate_exit_fragment_max_width_ratio",
            0.12,
            minimum=0.01,
            maximum=1.0,
        )
        max_area_ratio = self._float_setting(
            "person_box_gate_exit_fragment_max_area_ratio",
            0.045,
            minimum=0.001,
            maximum=1.0,
        )

        very_thin_edge_slice = bool(
            width_ratio <= max_width_ratio
            and area_ratio <= max_area_ratio
        )
        unreliable_head_at_exit = bool(
            head_zone_border_risk
            and headwear_width_ratio <= max_width_ratio * 1.35
        )
        lower_or_torso_edge_slice = bool(
            width_ratio <= max_width_ratio * 0.85
            and bbox.y1 > frame_height * 0.18
        )
        topless_edge_body = bool(
            border_state.touches_side
            and bbox.y1 > frame_height * 0.12
            and width_ratio <= max_width_ratio * 1.20
        )

        return bool(
            very_thin_edge_slice
            or unreliable_head_at_exit
            or lower_or_torso_edge_slice
            or topless_edge_body
        )

    def _is_edge_fragment_for_headwear(
        self,
        *,
        bbox: BBox,
        frame_width: int,
        frame_height: int,
        side_border_px: int,
        headwear_zone: BBox,
        border_state: _BorderState,
    ) -> bool:
        if not bool(
            getattr(self._settings, "person_box_gate_reject_edge_fragments_for_headwear", True)
        ):
            return False

        edge_margin_px = self._int_setting(
            "person_box_gate_headwear_edge_margin_px",
            16,
            minimum=side_border_px,
        )
        safe_margin_px = self._int_setting(
            "person_box_gate_headwear_edge_safe_margin_px",
            18,
            minimum=edge_margin_px,
        )

        touches_left = bbox.x1 <= edge_margin_px
        touches_right = bbox.x2 >= frame_width - edge_margin_px
        touches_side = bool(touches_left or touches_right or border_state.touches_side)

        if not touches_side:
            return False

        width_ratio = bbox.width / float(max(1, frame_width))
        height_ratio = bbox.height / float(max(1, frame_height))
        area_ratio = bbox.area / float(max(1, frame_width * frame_height))
        aspect_ratio = bbox.width / float(max(1, bbox.height))
        center_x_ratio = bbox.center_x / float(max(1, frame_width))

        max_width_ratio = self._float_setting(
            "person_box_gate_edge_fragment_max_width_ratio",
            0.34,
            minimum=0.01,
            maximum=1.0,
        )
        max_area_ratio = self._float_setting(
            "person_box_gate_edge_fragment_max_area_ratio",
            0.18,
            minimum=0.001,
            maximum=1.0,
        )
        min_aspect_ratio = self._float_setting(
            "person_box_gate_edge_fragment_min_aspect_ratio",
            0.28,
            minimum=0.01,
        )
        edge_center_ratio = self._float_setting(
            "person_box_gate_edge_fragment_center_ratio",
            0.72,
            minimum=0.50,
            maximum=0.98,
        )

        headwear_zone_touches_side = bool(
            headwear_zone.x1 <= safe_margin_px
            or headwear_zone.x2 >= frame_width - safe_margin_px
        )

        narrow_edge_sample = width_ratio <= max_width_ratio
        small_edge_sample = area_ratio <= max_area_ratio
        vertical_edge_slice = aspect_ratio <= min_aspect_ratio and height_ratio >= 0.25

        center_is_on_exit_side = bool(
            (touches_left and center_x_ratio <= 1.0 - edge_center_ratio)
            or (touches_right and center_x_ratio >= edge_center_ratio)
        )

        headwear_zone_not_stable = bool(
            headwear_zone_touches_side
            and (
                narrow_edge_sample
                or small_edge_sample
                or center_is_on_exit_side
            )
        )

        body_is_edge_slice = bool(
            narrow_edge_sample
            and (
                small_edge_sample
                or vertical_edge_slice
                or center_is_on_exit_side
            )
        )

        return bool(headwear_zone_not_stable or body_is_edge_slice)

    def _is_peer_duplicate_fragment(
        self,
        *,
        bbox: BBox,
        peer_bboxes: Iterable[BBox],
    ) -> bool:
        if not bool(getattr(self._settings, "person_box_gate_reject_peer_duplicate_fragments", True)):
            return False

        if bbox.area <= 0:
            return True

        min_containment = self._float_setting(
            "person_box_gate_peer_duplicate_min_containment_ratio",
            0.52,
            minimum=0.0,
            maximum=1.0,
        )
        min_iou = self._float_setting(
            "person_box_gate_peer_duplicate_min_iou",
            0.32,
            minimum=0.0,
            maximum=1.0,
        )
        max_area_to_peer = self._float_setting(
            "person_box_gate_peer_duplicate_max_area_ratio_to_peer",
            0.78,
            minimum=0.01,
            maximum=1.0,
        )
        max_width_to_peer = self._float_setting(
            "person_box_gate_peer_duplicate_max_width_ratio_to_peer",
            0.82,
            minimum=0.01,
            maximum=1.0,
        )

        for peer in peer_bboxes:
            if self._same_bbox(bbox, peer) or peer.area <= 0:
                continue

            intersection = self._intersection_area(bbox, peer)
            if intersection <= 0:
                continue

            containment = intersection / float(max(1, bbox.area))
            union = bbox.area + peer.area - intersection
            iou = intersection / float(max(1, union))
            area_to_peer = bbox.area / float(max(1, peer.area))
            width_to_peer = bbox.width / float(max(1, peer.width))

            is_same_region = bool(containment >= min_containment or iou >= min_iou)
            is_smaller_fragment = bool(
                area_to_peer <= max_area_to_peer
                or width_to_peer <= max_width_to_peer
            )
            if is_same_region and is_smaller_fragment:
                return True

        return False

    def _is_limb_shape_fragment(
        self,
        *,
        bbox: BBox,
        frame_width: int,
        frame_height: int,
    ) -> bool:
        if not bool(getattr(self._settings, "person_box_gate_reject_limb_shape_fragments", True)):
            return False

        width_ratio = bbox.width / float(max(1, frame_width))
        height_ratio = bbox.height / float(max(1, frame_height))
        area_ratio = bbox.area / float(max(1, frame_width * frame_height))
        aspect_ratio = bbox.width / float(max(1, bbox.height))

        horizontal_limb = bool(
            aspect_ratio >= self._float_setting(
                "person_box_gate_limb_shape_horizontal_min_aspect_ratio",
                1.35,
                minimum=0.01,
            )
            and height_ratio <= self._float_setting(
                "person_box_gate_limb_shape_horizontal_max_height_ratio",
                0.30,
                minimum=0.01,
                maximum=1.0,
            )
            and area_ratio <= self._float_setting(
                "person_box_gate_limb_shape_max_area_ratio",
                0.10,
                minimum=0.001,
                maximum=1.0,
            )
        )
        vertical_limb = bool(
            aspect_ratio <= self._float_setting(
                "person_box_gate_limb_shape_vertical_max_aspect_ratio",
                0.20,
                minimum=0.01,
            )
            and width_ratio <= self._float_setting(
                "person_box_gate_limb_shape_vertical_max_width_ratio",
                0.11,
                minimum=0.01,
                maximum=1.0,
            )
            and height_ratio >= self._float_setting(
                "person_box_gate_limb_shape_vertical_min_height_ratio",
                0.18,
                minimum=0.0,
                maximum=1.0,
            )
        )

        return bool(horizontal_limb or vertical_limb)

    def _is_headless_internal_fragment(
        self,
        *,
        bbox: BBox,
        frame_width: int,
        frame_height: int,
        internal_score: _ZoneScore,
    ) -> bool:
        if not bool(getattr(self._settings, "person_box_gate_reject_headless_internal_fragments", True)):
            return False

        width_ratio = bbox.width / float(max(1, frame_width))
        height_ratio = bbox.height / float(max(1, frame_height))
        area_ratio = bbox.area / float(max(1, frame_width * frame_height))
        aspect_ratio = bbox.width / float(max(1, bbox.height))
        center_x_ratio = bbox.center_x / float(max(1, frame_width))
        top_y_ratio = bbox.y1 / float(max(1, frame_height))

        center_x_max_ratio = self._float_setting(
            "person_box_gate_headless_internal_center_x_max_ratio",
            0.42,
            minimum=0.0,
            maximum=1.0,
        )
        top_y_min_ratio = self._float_setting(
            "person_box_gate_headless_internal_top_y_min_ratio",
            0.03,
            minimum=0.0,
            maximum=1.0,
        )
        max_width_ratio = self._float_setting(
            "person_box_gate_headless_internal_max_width_ratio",
            0.36,
            minimum=0.01,
            maximum=1.0,
        )
        max_area_ratio = self._float_setting(
            "person_box_gate_headless_internal_max_area_ratio",
            0.18,
            minimum=0.001,
            maximum=1.0,
        )
        max_aspect_ratio = self._float_setting(
            "person_box_gate_headless_internal_max_aspect_ratio",
            0.70,
            minimum=0.01,
        )
        min_height_ratio = self._float_setting(
            "person_box_gate_headless_internal_min_height_ratio",
            0.18,
            minimum=0.0,
            maximum=1.0,
        )
        min_zone_overlap = self._float_setting(
            "person_box_gate_headless_internal_min_zone_overlap_ratio",
            0.08,
            minimum=0.0,
            maximum=1.0,
        )

        body_overlap = max(internal_score.bbox_ratio, internal_score.union_bbox_ratio)
        head_overlap = max(
            internal_score.headwear_zone_ratio,
            internal_score.union_headwear_zone_ratio,
        )
        has_internal_zone_contact = bool(
            body_overlap >= min_zone_overlap or head_overlap >= min_zone_overlap
        )

        is_in_problem_corridor = bool(center_x_ratio <= center_x_max_ratio and top_y_ratio >= top_y_min_ratio)
        has_fragment_geometry = bool(
            height_ratio >= min_height_ratio
            and (
                width_ratio <= max_width_ratio
                or area_ratio <= max_area_ratio
                or aspect_ratio <= max_aspect_ratio
            )
        )

        zone_assisted_headless_fragment = bool(
            has_internal_zone_contact
            and is_in_problem_corridor
            and has_fragment_geometry
        )
        # In the head-detector based chain, a geometrically "headless" person box
        # is not enough to suppress the person episode. This rule is allowed to
        # reject only when a configured internal occluder zone actually supports
        # the fragment hypothesis.
        return bool(zone_assisted_headless_fragment)

    def _is_internal_occluder_fragment(
        self,
        *,
        bbox: BBox,
        frame_width: int,
        frame_height: int,
        score: _ZoneScore,
    ) -> bool:
        if not bool(
            getattr(
                self._settings,
                "person_box_gate_reject_internal_occluder_fragments",
                True,
            )
        ):
            return False

        body_overlap = max(score.bbox_ratio, score.union_bbox_ratio)
        head_overlap = max(
            score.headwear_zone_ratio,
            score.union_headwear_zone_ratio,
        )

        if body_overlap <= 0.0 and head_overlap <= 0.0:
            return False

        min_body_overlap = self._float_setting(
            "person_box_gate_internal_occluder_min_overlap_ratio",
            0.24,
            minimum=0.0,
            maximum=1.0,
        )
        min_head_overlap = self._float_setting(
            "person_box_gate_internal_occluder_min_head_zone_overlap_ratio",
            0.10,
            minimum=0.0,
            maximum=1.0,
        )

        if body_overlap < min_body_overlap and head_overlap < min_head_overlap:
            return False

        width_ratio = bbox.width / float(max(1, frame_width))
        height_ratio = bbox.height / float(max(1, frame_height))
        area_ratio = bbox.area / float(max(1, frame_width * frame_height))
        aspect_ratio = bbox.width / float(max(1, bbox.height))
        center_x_ratio = bbox.center_x / float(max(1, frame_width))

        max_width_ratio = self._float_setting(
            "person_box_gate_internal_occluder_max_width_ratio",
            0.24,
            minimum=0.01,
            maximum=1.0,
        )
        max_area_ratio = self._float_setting(
            "person_box_gate_internal_occluder_max_area_ratio",
            0.11,
            minimum=0.001,
            maximum=1.0,
        )
        max_aspect_ratio = self._float_setting(
            "person_box_gate_internal_occluder_max_aspect_ratio",
            0.46,
            minimum=0.01,
        )
        min_height_ratio = self._float_setting(
            "person_box_gate_internal_occluder_min_height_ratio",
            0.24,
            minimum=0.0,
            maximum=1.0,
        )
        center_x_max_ratio = self._float_setting(
            "person_box_gate_internal_occluder_center_x_max_ratio",
            0.40,
            minimum=0.0,
            maximum=1.0,
        )

        tall_enough = height_ratio >= min_height_ratio
        narrow_enough = width_ratio <= max_width_ratio
        small_enough = area_ratio <= max_area_ratio
        thin_enough = aspect_ratio <= max_aspect_ratio
        center_in_occluder_corridor = center_x_ratio <= center_x_max_ratio

        fragment_geometry = bool(
            tall_enough
            and center_in_occluder_corridor
            and (
                narrow_enough
                or small_enough
                or thin_enough
            )
        )

        head_zone_unstable = bool(
            head_overlap >= min_head_overlap
            and width_ratio <= max_width_ratio * 1.08
            and center_in_occluder_corridor
        )

        body_zone_unstable = bool(
            body_overlap >= min_body_overlap
            and fragment_geometry
        )

        return bool(body_zone_unstable or head_zone_unstable)

    def _scene_occlusion_is_structural(
        self,
        *,
        reasons: list[str],
        scene_score: _ZoneScore,
        exit_fragment_risk: bool,
        edge_fragment_for_headwear: bool,
        internal_occluder_fragment_risk: bool,
        headless_internal_fragment_risk: bool,
        peer_duplicate_fragment_risk: bool,
        limb_shape_fragment_risk: bool,
        head_zone_border_risk: bool,
    ) -> bool:
        if not bool(getattr(self._settings, "person_box_gate_reject_scene_occlusion", True)):
            return False

        requires_structural_risk = bool(
            getattr(
                self._settings,
                "person_box_gate_scene_occlusion_requires_structural_risk",
                True,
            )
        )
        if not requires_structural_risk:
            return True

        reason_set = {str(reason).strip().lower() for reason in reasons}
        has_structural_reason = bool(reason_set.intersection(_SCENE_STRUCTURAL_REASONS))

        if (
            exit_fragment_risk
            or edge_fragment_for_headwear
            or internal_occluder_fragment_risk
            or headless_internal_fragment_risk
            or peer_duplicate_fragment_risk
            or limb_shape_fragment_risk
            or head_zone_border_risk
        ):
            return True

        min_visible_fraction = self._float_setting(
            "person_box_gate_min_visible_fraction_after_scene",
            0.36,
            minimum=0.0,
            maximum=1.0,
        )
        if scene_score.visible_fraction_after_zone < min_visible_fraction and has_structural_reason:
            return True

        return False

    def _scene_occlusion_score(
        self,
        *,
        bbox: BBox,
        headwear_zone: BBox,
        frame_width: int,
        frame_height: int,
    ) -> _ZoneScore:
        raw_value = str(
            getattr(self._settings, "person_box_gate_scene_occlusion_zones", "") or ""
        ).strip()
        zones = self._parse_zones(
            raw_value=raw_value,
            frame_width=frame_width,
            frame_height=frame_height,
        )
        return self._zone_score(bbox=bbox, headwear_zone=headwear_zone, zones=zones)

    def _internal_occluder_score(
        self,
        *,
        bbox: BBox,
        headwear_zone: BBox,
        frame_width: int,
        frame_height: int,
    ) -> _ZoneScore:
        raw_value = str(
            getattr(self._settings, "person_box_gate_internal_occluder_zones", "") or ""
        ).strip()
        zones = self._parse_zones(
            raw_value=raw_value,
            frame_width=frame_width,
            frame_height=frame_height,
        )
        return self._zone_score(bbox=bbox, headwear_zone=headwear_zone, zones=zones)

    def _zone_score(
        self,
        *,
        bbox: BBox,
        headwear_zone: BBox,
        zones: list[_Zone],
    ) -> _ZoneScore:
        if not zones:
            return _ZoneScore()

        max_bbox_overlap = 0.0
        max_headwear_overlap = 0.0
        union_bbox_overlap = 0
        union_headwear_overlap = 0

        for zone in zones:
            bbox_intersection = self._intersection_area(bbox, zone.bbox)
            headwear_intersection = self._intersection_area(headwear_zone, zone.bbox)

            max_bbox_overlap = max(
                max_bbox_overlap,
                bbox_intersection / float(max(1, bbox.area)),
            )
            max_headwear_overlap = max(
                max_headwear_overlap,
                headwear_intersection / float(max(1, headwear_zone.area)),
            )

            union_bbox_overlap += bbox_intersection
            union_headwear_overlap += headwear_intersection

        union_bbox_ratio = self._clip01(union_bbox_overlap / float(max(1, bbox.area)))
        union_headwear_ratio = self._clip01(
            union_headwear_overlap / float(max(1, headwear_zone.area))
        )

        return _ZoneScore(
            bbox_ratio=self._clip01(max_bbox_overlap),
            headwear_zone_ratio=self._clip01(max_headwear_overlap),
            union_bbox_ratio=union_bbox_ratio,
            union_headwear_zone_ratio=union_headwear_ratio,
            visible_fraction_after_zone=self._clip01(1.0 - union_bbox_ratio),
        )

    def _parse_zones(
        self,
        *,
        raw_value: str,
        frame_width: int,
        frame_height: int,
    ) -> list[_Zone]:
        if not raw_value:
            return []

        zones: list[_Zone] = []

        for index, raw_zone in enumerate(raw_value.split(";"), start=1):
            token = raw_zone.strip()
            if not token:
                continue

            name = f"zone_{index}"
            coords_text = token

            if ":" in token:
                raw_name, coords_text = token.split(":", 1)
                normalized_name = raw_name.strip()
                if normalized_name:
                    name = normalized_name

            parts = [
                part.strip()
                for part in coords_text.replace("|", ",").split(",")
                if part.strip()
            ]
            if len(parts) < 4:
                continue

            try:
                x1_raw, y1_raw, x2_raw, y2_raw = [float(part) for part in parts[:4]]
            except ValueError:
                continue

            x1, y1, x2, y2 = self._zone_coords_to_pixels(
                x1=x1_raw,
                y1=y1_raw,
                x2=x2_raw,
                y2=y2_raw,
                frame_width=frame_width,
                frame_height=frame_height,
            )
            zone_bbox = BBox(x1=x1, y1=y1, x2=x2, y2=y2).clamp(
                frame_width=frame_width,
                frame_height=frame_height,
            )
            if not zone_bbox.is_valid:
                continue

            zones.append(_Zone(name=name, bbox=zone_bbox))

        return zones

    @staticmethod
    def _border_state(
        *,
        bbox: BBox,
        frame_width: int,
        top_border_px: int,
        side_border_px: int,
    ) -> _BorderState:
        touches_top = bbox.y1 <= top_border_px
        touches_left = bbox.x1 <= side_border_px
        touches_right = bbox.x2 >= frame_width - side_border_px

        return _BorderState(
            touches_top=bool(touches_top),
            touches_left=bool(touches_left),
            touches_right=bool(touches_right),
            touches_side=bool(touches_left or touches_right),
        )

    @staticmethod
    def _zone_coords_to_pixels(
        *,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        frame_width: int,
        frame_height: int,
    ) -> tuple[int, int, int, int]:
        values = (x1, y1, x2, y2)
        if all(0.0 <= value <= 1.0 for value in values):
            return (
                int(round(x1 * frame_width)),
                int(round(y1 * frame_height)),
                int(round(x2 * frame_width)),
                int(round(y2 * frame_height)),
            )

        return int(round(x1)), int(round(y1)), int(round(x2)), int(round(y2))

    def _max_overlap_ratio(self, target: BBox, peers: Iterable[BBox]) -> float:
        if target.area <= 0:
            return 1.0

        max_ratio = 0.0
        for peer in peers:
            if self._same_bbox(target, peer):
                continue

            intersection = self._intersection_area(target, peer)
            if intersection <= 0:
                continue

            max_ratio = max(max_ratio, intersection / float(max(1, target.area)))

        return self._clip01(max_ratio)

    @staticmethod
    def _intersection_area(left: BBox, right: BBox) -> int:
        x1 = max(int(left.x1), int(right.x1))
        y1 = max(int(left.y1), int(right.y1))
        x2 = min(int(left.x2), int(right.x2))
        y2 = min(int(left.y2), int(right.y2))

        return max(0, x2 - x1) * max(0, y2 - y1)

    @staticmethod
    def _same_bbox(left: BBox, right: BBox) -> bool:
        return bool(
            int(left.x1) == int(right.x1)
            and int(left.y1) == int(right.y1)
            and int(left.x2) == int(right.x2)
            and int(left.y2) == int(right.y2)
        )

    @staticmethod
    def _resolve_frame_dims(frame_shape: tuple[int, ...]) -> tuple[int, int]:
        if len(frame_shape) < 2:
            return 0, 0

        return max(0, int(frame_shape[0])), max(0, int(frame_shape[1]))

    @staticmethod
    def _with_reason(track: TrackedPersonObservation, reason: str) -> TrackedPersonObservation:
        return PersonBoxGate._with_reasons(track, [reason])

    @staticmethod
    def _with_reasons(
        track: TrackedPersonObservation,
        reasons: list[str],
    ) -> TrackedPersonObservation:
        reason_codes = PersonBoxGate._unique_reasons(
            list(track.reason_codes) + list(reasons)
        )

        return TrackedPersonObservation(
            track_id=track.track_id,
            bbox=track.bbox,
            confidence=track.confidence,
            observed_at=track.observed_at,
            frame_index=track.frame_index,
            track_state=track.track_state,
            track_age=track.track_age,
            track_hits=track.track_hits,
            time_since_update=track.time_since_update,
            class_id=track.class_id,
            class_name=track.class_name,
            detector_confidence=track.detector_confidence,
            tracking_confidence=track.tracking_confidence,
            source_backend=track.source_backend,
            is_confirmed_track=track.is_confirmed_track,
            is_visible=track.is_visible,
            is_shadow=track.is_shadow,
            shadow_of_track_id=track.shadow_of_track_id,
            reason_codes=reason_codes,
            embedding=track.embedding,
            embedding_quality=track.embedding_quality,
        )

    def _int_setting(self, name: str, default: int, *, minimum: int | None = None) -> int:
        try:
            value = int(getattr(self._settings, name, default))
        except Exception:
            value = int(default)

        if minimum is not None:
            value = max(int(minimum), value)

        return value

    def _float_setting(
        self,
        name: str,
        default: float,
        *,
        minimum: float | None = None,
        maximum: float | None = None,
    ) -> float:
        try:
            value = float(getattr(self._settings, name, default))
        except Exception:
            value = float(default)

        if minimum is not None:
            value = max(float(minimum), value)
        if maximum is not None:
            value = min(float(maximum), value)

        return value

    @staticmethod
    def _clip01(value: object) -> float:
        try:
            number = float(value)
        except Exception:
            number = 0.0

        return max(0.0, min(1.0, number))

    @staticmethod
    def _unique_reasons(values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()

        for raw in values:
            value = str(raw or "").strip()
            if not value or value in seen:
                continue

            seen.add(value)
            result.append(value)

        return result