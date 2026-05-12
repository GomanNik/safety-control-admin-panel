# ============================================================
# File: vision/app/pipeline/quality_gate.py
# Purpose:
# - Performs production quality validation for a tracked human bbox.
# - Produces a stable QualityAssessment contract for downstream modules:
#   TrackEpisodeRegistry, HumanObservation, HeadwearDetector and IncidentEngine.
# - Evaluates geometry, bbox size, crop/truncation, occlusion,
#   head visibility and downstream usability flags.
# - Does not assign person_id/day_person_id.
# - Does not perform ReID, appearance matching, headwear decision
#   or incident logic.
# - Keeps deprecated identity-related QualityAssessment fields as False
#   for backward-compatible API/schema contracts.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import cv2
import numpy as np

from app.config import Settings
from app.models.schemas import BBox, QualityAssessment


# ============================================================
# Internal constants
# ============================================================

_HEAD_BAND_HEIGHT_RATIO = 0.35
_HEAD_BAND_MIN_HEIGHT_PX = 20

_MIN_ASPECT_RATIO = 0.18
_MAX_ASPECT_RATIO = 1.25

_LAPLACIAN_BLUR_BAD = 25.0
_LAPLACIAN_BLUR_GOOD = 140.0

_MIN_STD_BAD = 10.0
_MIN_STD_GOOD = 28.0

_DARK_MEAN_BAD = 25.0
_DARK_MEAN_GOOD = 55.0

_BRIGHT_MEAN_BAD = 235.0
_BRIGHT_MEAN_GOOD = 205.0


# ============================================================
# Lightweight score container
# ============================================================

@dataclass(slots=True)
class _ComponentScore:
    value: float
    reason: str | None = None
    critical: bool = False


# ============================================================
# Quality gate
# ============================================================

class QualityGate:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def assess(
        self,
        *,
        bbox: BBox,
        peer_bboxes: list[BBox],
        frame: np.ndarray | None = None,
        frame_shape: tuple[int, ...] | None = None,
    ) -> QualityAssessment:
        frame_height, frame_width = self._resolve_frame_dims(
            frame=frame,
            frame_shape=frame_shape,
        )

        if frame_height <= 0 or frame_width <= 0:
            return self._build_assessment(
                is_valid=False,
                quality_score=0.0,
                head_visible=False,
                is_cropped=True,
                occlusion_ratio=1.0,
                bbox_area_ratio=0.0,
                reasons=["invalid_frame_dimensions"],
                is_usable_for_headwear=False,
                is_low_quality=True,
                is_truncated=True,
                is_occluded=True,
            )

        clipped_bbox = self._clip_bbox(
            bbox=bbox,
            frame_width=frame_width,
            frame_height=frame_height,
        )

        if clipped_bbox.width <= 0 or clipped_bbox.height <= 0 or clipped_bbox.area <= 0:
            return self._build_assessment(
                is_valid=False,
                quality_score=0.0,
                head_visible=False,
                is_cropped=True,
                occlusion_ratio=1.0,
                bbox_area_ratio=0.0,
                reasons=["invalid_bbox_after_clipping"],
                is_usable_for_headwear=False,
                is_low_quality=True,
                is_truncated=True,
                is_occluded=True,
            )

        bbox_area_ratio = clipped_bbox.area / float(max(1, frame_width * frame_height))
        aspect_ratio = clipped_bbox.width / float(max(1, clipped_bbox.height))

        head_bbox = self._build_head_band_bbox(clipped_bbox)
        head_bbox = self._clip_bbox(
            bbox=head_bbox,
            frame_width=frame_width,
            frame_height=frame_height,
        )

        is_cropped = self._is_bbox_cropped(
            bbox=clipped_bbox,
            frame_width=frame_width,
            frame_height=frame_height,
        )
        head_is_cropped = self._is_bbox_cropped(
            bbox=head_bbox,
            frame_width=frame_width,
            frame_height=frame_height,
            top_sensitive=True,
        )
        bottom_is_cropped = self._is_bbox_cropped(
            bbox=clipped_bbox,
            frame_width=frame_width,
            frame_height=frame_height,
            bottom_sensitive=True,
        )

        border = max(0, self._setting_int("crop_border_px", 4))
        left_is_cropped = clipped_bbox.x1 <= border
        top_is_cropped = clipped_bbox.y1 <= border
        right_is_cropped = clipped_bbox.x2 >= frame_width - border

        body_occlusion_ratio = self._max_occlusion_ratio(clipped_bbox, peer_bboxes)
        head_occlusion_ratio = self._max_occlusion_ratio(head_bbox, peer_bboxes)
        max_occlusion = max(body_occlusion_ratio, head_occlusion_ratio)

        area_score = self._score_area_ratio(bbox_area_ratio)
        height_score = self._score_height(clipped_bbox.height)
        aspect_score = self._score_aspect_ratio(aspect_ratio)
        border_score = self._score_border_crop(
            is_cropped=is_cropped,
            head_is_cropped=head_is_cropped,
        )
        occlusion_score = self._score_occlusion(
            body_occlusion_ratio=body_occlusion_ratio,
            head_occlusion_ratio=head_occlusion_ratio,
        )
        head_visibility_score = self._score_head_visibility(
            bbox=clipped_bbox,
            head_bbox=head_bbox,
            head_is_cropped=head_is_cropped,
            head_occlusion_ratio=head_occlusion_ratio,
        )

        scores: list[tuple[float, _ComponentScore]] = [
            (0.20, area_score),
            (0.20, height_score),
            (0.10, aspect_score),
            (0.14, border_score),
            (0.18, occlusion_score),
            (0.18, head_visibility_score),
        ]

        if frame is not None:
            blur_score = self._score_blur(frame=frame, head_bbox=head_bbox)
            exposure_score = self._score_exposure(frame=frame, head_bbox=head_bbox)

            scores.extend(
                [
                    (0.08, blur_score),
                    (0.08, exposure_score),
                ]
            )

        quality_score = self._weighted_average(scores)
        reasons = self._collect_reasons(scores)

        min_quality_score = self._setting_float("min_quality_score", 0.55)
        max_occlusion_ratio = self._setting_float("max_occlusion_ratio", 0.45)

        head_visible = bool(
            head_visibility_score.value >= 0.65
            and not head_is_cropped
            and head_occlusion_ratio <= max(0.35, max_occlusion_ratio)
        )

        structural_failure = bool(
            area_score.critical
            and area_score.value < 0.50
            or height_score.critical
            and height_score.value < 0.50
            or clipped_bbox.width <= 0
            or clipped_bbox.height <= 0
            or bbox_area_ratio <= 0.0
        )

        head_too_occluded = head_occlusion_ratio > max(0.35, max_occlusion_ratio)

        is_truncated = bool(is_cropped)
        is_occluded = bool(max_occlusion >= 0.45)

        base_valid = bool(
            not structural_failure
            and quality_score >= min_quality_score
            and bbox_area_ratio > 0.0
        )

        body_iou = self._max_iou(clipped_bbox, peer_bboxes)
        head_overlap_ratio = self._max_occlusion_ratio(head_bbox, peer_bboxes)
        interaction_iou_threshold = self._clip01(
            self._setting_float("track_interaction_iou_threshold", 0.18)
        )
        head_overlap_threshold = self._clip01(
            self._setting_float("track_head_overlap_iou_threshold", 0.05)
        )

        is_interaction_risk = bool(
            body_iou >= interaction_iou_threshold
            or head_overlap_ratio >= head_overlap_threshold
            or body_occlusion_ratio >= max(0.25, max_occlusion_ratio * 0.75)
        )

        is_partial_limb_only = bool(
            structural_failure
            or bbox_area_ratio < max(0.0003, self._setting_float("min_bbox_area_ratio", 0.008) * 0.18)
            or clipped_bbox.height < max(32, int(self._setting_int("min_bbox_height_px", 96) * 0.45))
            or aspect_ratio < 0.12
            or aspect_ratio > 1.80
        )

        is_lower_body_only = bool(
            not is_partial_limb_only
            and head_is_cropped
            and not bottom_is_cropped
            and clipped_bbox.center_y >= frame_height * 0.45
        )

        is_bent_over = bool(
            not is_partial_limb_only
            and not is_lower_body_only
            and not head_is_cropped
            and clipped_bbox.height >= 55
            and aspect_ratio >= 0.78
            and head_visibility_score.value < 0.75
        )

        is_border_fragment = bool(
            (left_is_cropped or right_is_cropped or top_is_cropped)
            and (
                head_is_cropped
                or not head_visible
                or clipped_bbox.width < frame_width * 0.16
                or bbox_area_ratio < max(
                    0.0007,
                    self._setting_float("min_bbox_area_ratio", 0.008) * 1.5,
                )
            )
        )

        is_internal_occluder_fragment = self._is_internal_occluder_fragment(
            bbox=clipped_bbox,
            head_bbox=head_bbox,
            frame_width=frame_width,
            frame_height=frame_height,
        )
        is_headless_internal_fragment = self._is_headless_internal_fragment(
            bbox=clipped_bbox,
            head_bbox=head_bbox,
            frame_width=frame_width,
            frame_height=frame_height,
        )
        is_limb_shape_fragment = self._is_limb_shape_fragment(
            bbox=clipped_bbox,
            frame_width=frame_width,
            frame_height=frame_height,
        )

        if is_internal_occluder_fragment or is_headless_internal_fragment or is_limb_shape_fragment:
            head_visible = False
            head_too_occluded = True
            is_partial_limb_only = True

        if is_partial_limb_only:
            reasons.append("limb_only_or_tiny_fragment")
        if is_lower_body_only:
            reasons.append("lower_body_only")
        if is_bent_over:
            reasons.append("bent_over_unclear")
        if is_border_fragment:
            reasons.append("border_fragment")
        if is_internal_occluder_fragment:
            reasons.append("internal_occluder_fragment")
        if is_headless_internal_fragment:
            reasons.append("headless_internal_fragment")
        if is_limb_shape_fragment:
            reasons.append("limb_shape_fragment")
        if is_interaction_risk:
            reasons.append("interaction_risk")
            if head_overlap_ratio >= head_overlap_threshold:
                reasons.append("head_overlap_with_peer")

        visibility_state = self._visibility_state(
            base_valid=base_valid,
            head_visible=head_visible,
            is_partial_limb_only=is_partial_limb_only,
            is_lower_body_only=is_lower_body_only,
            is_bent_over=is_bent_over,
            is_interaction_risk=is_interaction_risk,
            head_too_occluded=head_too_occluded,
            is_low_quality=quality_score < 0.25,
        )

        if is_border_fragment:
            visibility_state = "not_evaluable"

        headwear_context_usable = bool(
            base_valid
            and head_visible
            and not head_too_occluded
            and not head_is_cropped
            and quality_score >= 0.35
            and not is_occluded
            and visibility_state == "head_visible"
            and not is_partial_limb_only
            and not is_lower_body_only
            and not is_bent_over
            and not is_border_fragment
            and not is_internal_occluder_fragment
            and not is_headless_internal_fragment
            and not is_limb_shape_fragment
            and not is_interaction_risk
        )

        is_usable_for_tracking = bool(
            base_valid
            and not is_partial_limb_only
            and not is_border_fragment
            and not is_internal_occluder_fragment
            and not is_headless_internal_fragment
            and not is_limb_shape_fragment
            and quality_score >= 0.30
        )

        is_usable_for_headwear = bool(
            headwear_context_usable
            and head_occlusion_ratio <= 0.55
        )

        is_valid = bool(base_valid and not is_partial_limb_only)

        is_low_quality = bool(
            not is_valid
            or quality_score < 0.25
            or bbox_area_ratio <= 0.0
        )

        if not head_visible:
            reasons.append("head_not_visible")
        if head_visible and visibility_state != "head_visible":
            reasons.append("headwear_visibility_not_reliable")
        if is_occluded:
            reasons.append("headwear_blocked_by_occlusion")
        if is_cropped:
            reasons.append("bbox_truncated")
        if is_occluded:
            reasons.append("bbox_occluded")
        if not is_usable_for_headwear:
            reasons.append("not_usable_for_headwear")

        return self._build_assessment(
            is_valid=is_valid,
            quality_score=round(quality_score, 4),
            head_visible=head_visible,
            is_cropped=is_cropped,
            occlusion_ratio=round(max_occlusion, 4),
            bbox_area_ratio=round(bbox_area_ratio, 6),
            reasons=reasons,
            is_usable_for_headwear=is_usable_for_headwear,
            is_low_quality=is_low_quality,
            is_truncated=is_truncated,
            is_occluded=is_occluded,
            headwear_context_usable=headwear_context_usable,
            is_usable_for_tracking=is_usable_for_tracking,
            is_partial_limb_only=is_partial_limb_only,
            is_lower_body_only=is_lower_body_only,
            is_bent_over=is_bent_over,
            is_interaction_risk=is_interaction_risk,
            visibility_state=visibility_state,
        )

    # ========================================================
    # Assessment helper
    # ========================================================

    def _build_assessment(
        self,
        *,
        is_valid: bool,
        quality_score: float,
        head_visible: bool,
        is_cropped: bool,
        occlusion_ratio: float,
        bbox_area_ratio: float,
        reasons: list[str],
        is_usable_for_headwear: bool,
        is_low_quality: bool,
        is_truncated: bool,
        is_occluded: bool,
        body_usable_for_identity: bool = False,
        upper_body_usable_for_identity: bool = False,
        lower_body_usable_for_identity: bool = False,
        footwear_usable_for_identity: bool = False,
        headwear_context_usable: bool = False,
        is_usable_for_tracking: bool = False,
        is_partial_limb_only: bool = False,
        is_lower_body_only: bool = False,
        is_bent_over: bool = False,
        is_interaction_risk: bool = False,
        visibility_state: str = "unknown",
    ) -> QualityAssessment:
        reason_codes = self._unique_reasons(reasons)

        return QualityAssessment(
            is_valid=bool(is_valid),
            quality_score=self._clip01(quality_score),
            head_visible=bool(head_visible),
            is_cropped=bool(is_cropped),
            occlusion_ratio=self._clip01(occlusion_ratio),
            bbox_area_ratio=max(0.0, float(bbox_area_ratio)),
            reasons=reason_codes,
            reason_codes=reason_codes,
            is_usable_for_tracking=bool(is_usable_for_tracking),
            is_usable_for_headwear=bool(is_usable_for_headwear),
            is_low_quality=bool(is_low_quality),
            is_truncated=bool(is_truncated),
            is_occluded=bool(is_occluded),
            is_partial_limb_only=bool(is_partial_limb_only),
            is_lower_body_only=bool(is_lower_body_only),
            is_bent_over=bool(is_bent_over),
            is_interaction_risk=bool(is_interaction_risk),
            headwear_context_usable=bool(headwear_context_usable),
            visibility_state=str(visibility_state or "unknown"),
            body_usable_for_identity=bool(body_usable_for_identity),
            upper_body_usable_for_identity=bool(upper_body_usable_for_identity),
            lower_body_usable_for_identity=bool(lower_body_usable_for_identity),
            footwear_usable_for_identity=bool(footwear_usable_for_identity),
            is_usable_for_identity=False,
        )

    # ========================================================
    # Geometry helpers
    # ========================================================

    def _resolve_frame_dims(
        self,
        *,
        frame: np.ndarray | None,
        frame_shape: tuple[int, ...] | None,
    ) -> tuple[int, int]:
        if frame is not None:
            try:
                height, width = frame.shape[:2]
                return max(0, int(height)), max(0, int(width))
            except Exception:
                return 0, 0

        if frame_shape is not None and len(frame_shape) >= 2:
            try:
                return max(0, int(frame_shape[0])), max(0, int(frame_shape[1]))
            except Exception:
                return 0, 0

        return 0, 0

    def _clip_bbox(self, *, bbox: BBox, frame_width: int, frame_height: int) -> BBox:
        return BBox(
            x1=max(0, min(int(frame_width), int(bbox.x1))),
            y1=max(0, min(int(frame_height), int(bbox.y1))),
            x2=max(0, min(int(frame_width), int(bbox.x2))),
            y2=max(0, min(int(frame_height), int(bbox.y2))),
        )

    def _build_head_band_bbox(self, bbox: BBox) -> BBox:
        head_height = max(
            _HEAD_BAND_MIN_HEIGHT_PX,
            int(round(bbox.height * _HEAD_BAND_HEIGHT_RATIO)),
        )

        return BBox(
            x1=bbox.x1,
            y1=bbox.y1,
            x2=bbox.x2,
            y2=min(bbox.y2, bbox.y1 + head_height),
        )

    def _is_bbox_cropped(
        self,
        *,
        bbox: BBox,
        frame_width: int,
        frame_height: int,
        top_sensitive: bool = False,
        bottom_sensitive: bool = False,
    ) -> bool:
        border = max(0, self._setting_int("crop_border_px", 4))

        left_crop = bbox.x1 <= border
        top_crop = bbox.y1 <= border
        right_crop = bbox.x2 >= frame_width - border
        bottom_crop = bbox.y2 >= frame_height - border

        if top_sensitive and bottom_sensitive:
            return bool(left_crop or top_crop or right_crop or bottom_crop)

        if top_sensitive:
            return bool(left_crop or top_crop or right_crop)

        if bottom_sensitive:
            return bool(left_crop or bottom_crop or right_crop)

        return bool(left_crop or top_crop or right_crop or bottom_crop)

    def _intersection_area(self, left: BBox, right: BBox) -> int:
        x1 = max(left.x1, right.x1)
        y1 = max(left.y1, right.y1)
        x2 = min(left.x2, right.x2)
        y2 = min(left.y2, right.y2)

        width = max(0, x2 - x1)
        height = max(0, y2 - y1)

        return width * height

    def _max_occlusion_ratio(self, target: BBox, peers: Iterable[BBox]) -> float:
        if target.area <= 0:
            return 1.0

        max_ratio = 0.0

        for peer in peers:
            if self._same_bbox(target, peer):
                continue

            intersection = self._intersection_area(target, peer)
            if intersection <= 0:
                continue

            ratio = intersection / float(max(1, target.area))
            max_ratio = max(max_ratio, ratio)

        return self._clip01(max_ratio)

    def _max_iou(self, target: BBox, peers: Iterable[BBox]) -> float:
        if target.area <= 0:
            return 0.0

        max_iou = 0.0

        for peer in peers:
            if self._same_bbox(target, peer):
                continue

            intersection = self._intersection_area(target, peer)
            if intersection <= 0:
                continue

            union = target.area + peer.area - intersection
            if union <= 0:
                continue

            max_iou = max(max_iou, intersection / float(union))

        return self._clip01(max_iou)

    @staticmethod
    def _visibility_state(
        *,
        base_valid: bool,
        head_visible: bool,
        is_partial_limb_only: bool,
        is_lower_body_only: bool,
        is_bent_over: bool,
        is_interaction_risk: bool,
        head_too_occluded: bool,
        is_low_quality: bool,
    ) -> str:
        if is_interaction_risk:
            return "interaction_risk"
        if is_partial_limb_only:
            return "limb_only"
        if is_lower_body_only:
            return "lower_body_only"
        if is_bent_over:
            return "bent_over_unclear"
        if not base_valid:
            return "too_small" if not head_visible else "not_evaluable"
        if is_low_quality:
            return "too_blurry"
        if not head_visible:
            return "head_occluded"
        if head_too_occluded:
            return "head_partially_visible"

        return "head_visible"

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
            aspect_ratio >= self._setting_float(
                "person_box_gate_limb_shape_horizontal_min_aspect_ratio",
                1.35,
            )
            and height_ratio <= self._setting_float(
                "person_box_gate_limb_shape_horizontal_max_height_ratio",
                0.30,
            )
            and area_ratio <= self._setting_float(
                "person_box_gate_limb_shape_max_area_ratio",
                0.10,
            )
        )
        vertical_limb = bool(
            aspect_ratio <= self._setting_float(
                "person_box_gate_limb_shape_vertical_max_aspect_ratio",
                0.20,
            )
            and width_ratio <= self._setting_float(
                "person_box_gate_limb_shape_vertical_max_width_ratio",
                0.11,
            )
            and height_ratio >= self._setting_float(
                "person_box_gate_limb_shape_vertical_min_height_ratio",
                0.18,
            )
        )

        return bool(horizontal_limb or vertical_limb)

    def _is_internal_occluder_fragment(
        self,
        *,
        bbox: BBox,
        head_bbox: BBox,
        frame_width: int,
        frame_height: int,
    ) -> bool:
        if not bool(getattr(self._settings, "person_box_gate_reject_internal_occluder_fragments", True)):
            return False

        zones = self._parse_zones(
            raw_value=str(getattr(self._settings, "person_box_gate_internal_occluder_zones", "") or ""),
            frame_width=frame_width,
            frame_height=frame_height,
        )
        if not zones:
            return False

        body_overlap = self._max_zone_overlap_ratio(bbox, zones)
        head_overlap = self._max_zone_overlap_ratio(head_bbox, zones)

        min_body_overlap = self._setting_float(
            "person_box_gate_internal_occluder_min_overlap_ratio",
            0.24,
        )
        min_head_overlap = self._setting_float(
            "person_box_gate_internal_occluder_min_head_zone_overlap_ratio",
            0.10,
        )
        if body_overlap < min_body_overlap and head_overlap < min_head_overlap:
            return False

        width_ratio = bbox.width / float(max(1, frame_width))
        height_ratio = bbox.height / float(max(1, frame_height))
        area_ratio = bbox.area / float(max(1, frame_width * frame_height))
        aspect_ratio = bbox.width / float(max(1, bbox.height))
        center_x_ratio = bbox.center_x / float(max(1, frame_width))

        max_width_ratio = self._setting_float("person_box_gate_internal_occluder_max_width_ratio", 0.24)
        max_area_ratio = self._setting_float("person_box_gate_internal_occluder_max_area_ratio", 0.11)
        max_aspect_ratio = self._setting_float("person_box_gate_internal_occluder_max_aspect_ratio", 0.46)
        min_height_ratio = self._setting_float("person_box_gate_internal_occluder_min_height_ratio", 0.24)
        center_x_max_ratio = self._setting_float("person_box_gate_internal_occluder_center_x_max_ratio", 0.40)

        return bool(
            height_ratio >= min_height_ratio
            and center_x_ratio <= center_x_max_ratio
            and (
                width_ratio <= max_width_ratio
                or area_ratio <= max_area_ratio
                or aspect_ratio <= max_aspect_ratio
                or head_overlap >= min_head_overlap
            )
        )

    def _is_headless_internal_fragment(
        self,
        *,
        bbox: BBox,
        head_bbox: BBox,
        frame_width: int,
        frame_height: int,
    ) -> bool:
        if not bool(getattr(self._settings, "person_box_gate_reject_headless_internal_fragments", True)):
            return False

        zones = self._parse_zones(
            raw_value=str(getattr(self._settings, "person_box_gate_internal_occluder_zones", "") or ""),
            frame_width=frame_width,
            frame_height=frame_height,
        )
        body_overlap = self._max_zone_overlap_ratio(bbox, zones) if zones else 0.0
        head_overlap = self._max_zone_overlap_ratio(head_bbox, zones) if zones else 0.0

        width_ratio = bbox.width / float(max(1, frame_width))
        height_ratio = bbox.height / float(max(1, frame_height))
        area_ratio = bbox.area / float(max(1, frame_width * frame_height))
        aspect_ratio = bbox.width / float(max(1, bbox.height))
        center_x_ratio = bbox.center_x / float(max(1, frame_width))
        top_y_ratio = bbox.y1 / float(max(1, frame_height))

        center_x_max_ratio = self._setting_float("person_box_gate_headless_internal_center_x_max_ratio", 0.42)
        top_y_min_ratio = self._setting_float("person_box_gate_headless_internal_top_y_min_ratio", 0.03)
        max_width_ratio = self._setting_float("person_box_gate_headless_internal_max_width_ratio", 0.36)
        max_area_ratio = self._setting_float("person_box_gate_headless_internal_max_area_ratio", 0.18)
        max_aspect_ratio = self._setting_float("person_box_gate_headless_internal_max_aspect_ratio", 0.70)
        min_height_ratio = self._setting_float("person_box_gate_headless_internal_min_height_ratio", 0.18)
        min_zone_overlap = self._setting_float("person_box_gate_headless_internal_min_zone_overlap_ratio", 0.08)

        is_in_problem_corridor = bool(center_x_ratio <= center_x_max_ratio and top_y_ratio >= top_y_min_ratio)
        has_fragment_geometry = bool(
            height_ratio >= min_height_ratio
            and (
                width_ratio <= max_width_ratio
                or area_ratio <= max_area_ratio
                or aspect_ratio <= max_aspect_ratio
            )
        )
        has_zone_contact = bool(body_overlap >= min_zone_overlap or head_overlap >= min_zone_overlap)

        severe_geometry = bool(
            is_in_problem_corridor
            and height_ratio >= min_height_ratio
            and width_ratio <= max_width_ratio * 0.80
            and area_ratio <= max_area_ratio * 0.80
            and aspect_ratio <= max_aspect_ratio * 0.85
        )

        return bool((has_zone_contact and is_in_problem_corridor and has_fragment_geometry) or severe_geometry)

    def _parse_zones(
        self,
        *,
        raw_value: str,
        frame_width: int,
        frame_height: int,
    ) -> list[BBox]:
        if not raw_value.strip():
            return []

        zones: list[BBox] = []
        for raw_zone in raw_value.split(";"):
            token = raw_zone.strip()
            if not token:
                continue
            coords_text = token.split(":", 1)[1] if ":" in token else token
            parts = [part.strip() for part in coords_text.replace("|", ",").split(",") if part.strip()]
            if len(parts) < 4:
                continue
            try:
                x1_raw, y1_raw, x2_raw, y2_raw = [float(part) for part in parts[:4]]
            except ValueError:
                continue
            if all(0.0 <= value <= 1.0 for value in (x1_raw, y1_raw, x2_raw, y2_raw)):
                x1 = int(round(x1_raw * frame_width))
                y1 = int(round(y1_raw * frame_height))
                x2 = int(round(x2_raw * frame_width))
                y2 = int(round(y2_raw * frame_height))
            else:
                x1, y1, x2, y2 = int(round(x1_raw)), int(round(y1_raw)), int(round(x2_raw)), int(round(y2_raw))
            zone = self._clip_bbox(
                bbox=BBox(x1=x1, y1=y1, x2=x2, y2=y2),
                frame_width=frame_width,
                frame_height=frame_height,
            )
            if zone.width > 0 and zone.height > 0 and zone.area > 0:
                zones.append(zone)

        return zones

    def _max_zone_overlap_ratio(self, target: BBox, zones: Iterable[BBox]) -> float:
        if target.area <= 0:
            return 1.0

        max_ratio = 0.0
        for zone in zones:
            intersection = self._intersection_area(target, zone)
            if intersection <= 0:
                continue
            max_ratio = max(max_ratio, intersection / float(max(1, target.area)))

        return self._clip01(max_ratio)

    def _same_bbox(self, left: BBox, right: BBox) -> bool:
        return bool(
            left.x1 == right.x1
            and left.y1 == right.y1
            and left.x2 == right.x2
            and left.y2 == right.y2
        )

    # ========================================================
    # Component scoring
    # ========================================================

    def _score_area_ratio(self, bbox_area_ratio: float) -> _ComponentScore:
        min_ratio = max(1e-9, self._setting_float("min_bbox_area_ratio", 0.008))

        if bbox_area_ratio <= 0.0:
            return _ComponentScore(
                value=0.0,
                reason="bbox_area_zero",
                critical=True,
            )

        if bbox_area_ratio >= min_ratio * 1.8:
            return _ComponentScore(value=1.0)

        if bbox_area_ratio >= min_ratio:
            value = 0.75 + 0.25 * ((bbox_area_ratio - min_ratio) / max(min_ratio * 0.8, 1e-9))
            return _ComponentScore(value=self._clip01(value))

        value = bbox_area_ratio / min_ratio

        return _ComponentScore(
            value=max(0.0, min(0.74, value)),
            reason="bbox_too_small",
            critical=True,
        )

    def _score_height(self, bbox_height: int) -> _ComponentScore:
        min_height = max(1, self._setting_int("min_bbox_height_px", 96))

        if bbox_height >= int(min_height * 1.4):
            return _ComponentScore(value=1.0)

        if bbox_height >= min_height:
            value = 0.75 + 0.25 * ((bbox_height - min_height) / max(min_height * 0.4, 1))
            return _ComponentScore(value=self._clip01(value))

        value = bbox_height / float(max(min_height, 1))

        return _ComponentScore(
            value=max(0.0, min(0.74, value)),
            reason="bbox_height_too_small",
            critical=True,
        )

    def _score_aspect_ratio(self, aspect_ratio: float) -> _ComponentScore:
        if _MIN_ASPECT_RATIO <= aspect_ratio <= _MAX_ASPECT_RATIO:
            return _ComponentScore(value=1.0)

        if aspect_ratio < _MIN_ASPECT_RATIO:
            value = aspect_ratio / max(_MIN_ASPECT_RATIO, 1e-6)
            return _ComponentScore(
                value=max(0.0, min(0.79, value)),
                reason="bbox_aspect_too_narrow",
            )

        overflow = min(aspect_ratio - _MAX_ASPECT_RATIO, _MAX_ASPECT_RATIO)
        value = 1.0 - (overflow / max(_MAX_ASPECT_RATIO, 1e-6))

        return _ComponentScore(
            value=max(0.0, min(0.79, value)),
            reason="bbox_aspect_too_wide",
        )

    def _score_border_crop(self, *, is_cropped: bool, head_is_cropped: bool) -> _ComponentScore:
        if head_is_cropped:
            return _ComponentScore(
                value=0.25,
                reason="head_cropped_by_frame_border",
                critical=False,
            )

        if is_cropped:
            return _ComponentScore(
                value=0.45,
                reason="bbox_cropped_by_frame_border",
                critical=False,
            )

        return _ComponentScore(value=1.0)

    def _score_occlusion(
        self,
        *,
        body_occlusion_ratio: float,
        head_occlusion_ratio: float,
    ) -> _ComponentScore:
        worst = max(body_occlusion_ratio, head_occlusion_ratio)
        soft_limit = self._clip01(self._setting_float("max_occlusion_ratio", 0.45))

        if worst <= soft_limit * 0.5:
            return _ComponentScore(value=1.0)

        if worst <= soft_limit:
            denom = max(soft_limit * 0.5, 1e-6)
            ratio = (worst - soft_limit * 0.5) / denom
            value = 1.0 - 0.45 * ratio

            return _ComponentScore(
                value=max(0.55, min(1.0, value)),
                reason="moderate_occlusion" if worst > soft_limit * 0.75 else None,
            )

        excess = min(1.0, (worst - soft_limit) / max(1.0 - soft_limit, 1e-6))
        value = max(0.0, 0.54 - 0.54 * excess)

        return _ComponentScore(
            value=value,
            reason="too_much_occlusion",
            critical=body_occlusion_ratio > soft_limit,
        )

    def _score_head_visibility(
        self,
        *,
        bbox: BBox,
        head_bbox: BBox,
        head_is_cropped: bool,
        head_occlusion_ratio: float,
    ) -> _ComponentScore:
        if head_bbox.height < _HEAD_BAND_MIN_HEIGHT_PX:
            return _ComponentScore(
                value=0.0,
                reason="head_band_too_small",
                critical=False,
            )

        if head_is_cropped:
            return _ComponentScore(
                value=0.0,
                reason="head_not_reliably_visible",
                critical=False,
            )

        max_occlusion_ratio = self._setting_float("max_occlusion_ratio", 0.45)

        if head_occlusion_ratio > max(0.35, max_occlusion_ratio):
            penalty = self._clip01(head_occlusion_ratio)
            value = max(0.0, 0.50 - 0.50 * penalty)

            return _ComponentScore(
                value=value,
                reason="head_partially_occluded",
                critical=False,
            )

        relative_head_ratio = head_bbox.height / float(max(1, bbox.height))

        if relative_head_ratio < 0.18:
            return _ComponentScore(
                value=0.35,
                reason="head_band_relative_height_too_small",
                critical=False,
            )

        return _ComponentScore(value=1.0)

    def _score_blur(self, *, frame: np.ndarray, head_bbox: BBox) -> _ComponentScore:
        crop = self._safe_crop(frame, head_bbox)
        if crop is None:
            return _ComponentScore(
                value=0.0,
                reason="missing_head_crop_for_blur_check",
                critical=False,
            )

        gray = self._to_gray(crop)
        variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        if variance >= _LAPLACIAN_BLUR_GOOD:
            return _ComponentScore(value=1.0)

        if variance <= _LAPLACIAN_BLUR_BAD:
            return _ComponentScore(
                value=0.25,
                reason="blurred_head_region",
                critical=False,
            )

        alpha = (variance - _LAPLACIAN_BLUR_BAD) / (_LAPLACIAN_BLUR_GOOD - _LAPLACIAN_BLUR_BAD)
        value = 0.25 + 0.75 * alpha

        return _ComponentScore(value=max(0.25, min(1.0, value)))

    def _score_exposure(self, *, frame: np.ndarray, head_bbox: BBox) -> _ComponentScore:
        crop = self._safe_crop(frame, head_bbox)
        if crop is None:
            return _ComponentScore(
                value=0.0,
                reason="missing_head_crop_for_exposure_check",
                critical=False,
            )

        gray = self._to_gray(crop)

        mean_value = float(gray.mean())
        std_value = float(gray.std())

        contrast_score = self._linear_score(
            value=std_value,
            bad=_MIN_STD_BAD,
            good=_MIN_STD_GOOD,
        )
        dark_score = self._linear_score(
            value=mean_value,
            bad=_DARK_MEAN_BAD,
            good=_DARK_MEAN_GOOD,
        )
        bright_score = self._reverse_linear_score(
            value=mean_value,
            good=_BRIGHT_MEAN_GOOD,
            bad=_BRIGHT_MEAN_BAD,
        )

        value = min(contrast_score, dark_score, bright_score)

        if value < 0.40:
            return _ComponentScore(
                value=value,
                reason="poor_head_region_exposure",
                critical=False,
            )

        return _ComponentScore(value=value)

    # ========================================================
    # Generic helpers
    # ========================================================

    def _safe_crop(self, frame: np.ndarray, bbox: BBox) -> np.ndarray | None:
        try:
            height, width = frame.shape[:2]
        except Exception:
            return None

        x1 = max(0, min(int(width), int(bbox.x1)))
        y1 = max(0, min(int(height), int(bbox.y1)))
        x2 = max(0, min(int(width), int(bbox.x2)))
        y2 = max(0, min(int(height), int(bbox.y2)))

        if x2 <= x1 or y2 <= y1:
            return None

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        return crop

    def _to_gray(self, image: np.ndarray) -> np.ndarray:
        if image.ndim == 2:
            return image

        if image.ndim == 3 and image.shape[2] == 1:
            return image[:, :, 0]

        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    def _linear_score(self, *, value: float, bad: float, good: float) -> float:
        if value <= bad:
            return 0.0
        if value >= good:
            return 1.0

        return self._clip01((value - bad) / max(good - bad, 1e-9))

    def _reverse_linear_score(self, *, value: float, good: float, bad: float) -> float:
        if value <= good:
            return 1.0
        if value >= bad:
            return 0.0

        return self._clip01(1.0 - ((value - good) / max(bad - good, 1e-9)))

    def _weighted_average(self, components: list[tuple[float, _ComponentScore]]) -> float:
        usable = [
            (float(weight), self._clip01(component.value))
            for weight, component in components
            if float(weight) > 0.0
        ]

        if not usable:
            return 0.0

        total_weight = sum(weight for weight, _ in usable)
        if total_weight <= 0.0:
            return 0.0

        weighted_sum = sum(weight * value for weight, value in usable)

        return self._clip01(weighted_sum / total_weight)

    def _collect_reasons(self, components: list[tuple[float, _ComponentScore]]) -> list[str]:
        reasons: list[str] = []

        for _, component in components:
            if component.reason:
                reasons.append(component.reason)

        return self._unique_reasons(reasons)

    def _setting_float(self, name: str, default: float) -> float:
        try:
            return float(getattr(self._settings, name, default))
        except Exception:
            return float(default)

    def _setting_int(self, name: str, default: int) -> int:
        try:
            return int(getattr(self._settings, name, default))
        except Exception:
            return int(default)

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

        for raw_value in values:
            value = str(raw_value or "").strip()
            if not value or value in seen:
                continue

            seen.add(value)
            result.append(value)

        return result