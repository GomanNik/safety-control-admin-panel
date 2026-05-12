# ============================================================
# File: vision/app/pipeline/headwear_crop_geometry.py
# Purpose:
# - Single source of truth for the headwear head-crop geometry.
# - Keeps runtime crop extraction and offline dataset mining aligned.
# - Builds a conservative upper-head crop bbox that is sent to the
#   sanitary headwear classifier.
# - Avoids feeding a wide full-person/shoulder crop into the headwear model.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence


HEADWEAR_CROP_RECIPE_VERSION = "head_top_030_centerw_058_v3"
HEADWEAR_HEAD_REGION_HEIGHT_RATIO = 0.30
HEADWEAR_HEAD_REGION_WIDTH_RATIO = 0.58
HEADWEAR_HEAD_REGION_MIN_WIDTH_RATIO = 0.34
HEADWEAR_HEAD_REGION_MAX_WIDTH_RATIO = 0.72

DEFAULT_RUNTIME_MIN_HEAD_CROP_WIDTH = 28
DEFAULT_RUNTIME_MIN_HEAD_CROP_HEIGHT = 28


@dataclass(frozen=True, slots=True)
class HeadwearCropBox:
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

    def as_xyxy(self) -> tuple[int, int, int, int]:
        return int(self.x1), int(self.y1), int(self.x2), int(self.y2)

    def text(self) -> str:
        return f"{int(self.x1)},{int(self.y1)},{int(self.x2)},{int(self.y2)}"


def build_headwear_crop_box(
    *,
    frame_shape: Sequence[int],
    person_bbox: Any,
    min_width: int = DEFAULT_RUNTIME_MIN_HEAD_CROP_WIDTH,
    min_height: int = DEFAULT_RUNTIME_MIN_HEAD_CROP_HEIGHT,
) -> HeadwearCropBox | None:
    """Build the canonical headwear crop bbox from a person bbox.

    The crop uses only the upper part of a person bbox and intentionally keeps
    the crop narrower than the full person box. This is important for overhead
    kitchen cameras: a full-width top crop often contains tables, ovens,
    shoulders and background, which is bad input for a headwear classifier.

    Rule:
    - height: top 30% of the person bbox;
    - width: centered 58% of the person bbox width;
    - coordinates are clamped to the frame;
    - too-small crops are rejected.
    """

    if len(frame_shape) < 2:
        return None

    frame_h = _safe_int(frame_shape[0], default=0)
    frame_w = _safe_int(frame_shape[1], default=0)
    if frame_h <= 0 or frame_w <= 0:
        return None

    x1 = _safe_int(getattr(person_bbox, "x1", None), default=0)
    y1 = _safe_int(getattr(person_bbox, "y1", None), default=0)
    x2 = _safe_int(getattr(person_bbox, "x2", None), default=0)
    y2 = _safe_int(getattr(person_bbox, "y2", None), default=0)

    x1 = max(0, min(frame_w, x1))
    y1 = max(0, min(frame_h, y1))
    x2 = max(0, min(frame_w, x2))
    y2 = max(0, min(frame_h, y2))

    person_width = max(0, x2 - x1)
    person_height = max(0, y2 - y1)
    if person_width <= 0 or person_height <= 0:
        return None

    crop_h = max(int(min_height), int(round(person_height * HEADWEAR_HEAD_REGION_HEIGHT_RATIO)))
    crop_h = min(person_height, crop_h)

    width_ratio = max(
        HEADWEAR_HEAD_REGION_MIN_WIDTH_RATIO,
        min(HEADWEAR_HEAD_REGION_MAX_WIDTH_RATIO, HEADWEAR_HEAD_REGION_WIDTH_RATIO),
    )
    crop_w = max(int(min_width), int(round(person_width * width_ratio)))
    crop_w = min(person_width, crop_w)

    center_x = (x1 + x2) / 2.0
    crop_x1 = int(round(center_x - crop_w / 2.0))
    crop_x2 = crop_x1 + crop_w

    if crop_x1 < x1:
        crop_x1 = x1
        crop_x2 = x1 + crop_w
    if crop_x2 > x2:
        crop_x2 = x2
        crop_x1 = x2 - crop_w

    crop_box = HeadwearCropBox(
        x1=max(0, min(frame_w, crop_x1)),
        y1=max(0, y1),
        x2=max(0, min(frame_w, crop_x2)),
        y2=max(0, min(frame_h, y1 + crop_h)),
    )

    if crop_box.x2 <= crop_box.x1 or crop_box.y2 <= crop_box.y1:
        return None

    if crop_box.width < int(min_width) or crop_box.height < int(min_height):
        return None

    return crop_box


def _safe_int(value: Any, *, default: int) -> int:
    try:
        return int(round(float(value)))
    except Exception:
        return int(default)
