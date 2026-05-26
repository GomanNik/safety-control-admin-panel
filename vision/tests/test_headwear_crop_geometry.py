# ============================================================
# File: vision/tests/test_headwear_crop_geometry.py
# Purpose:
# - Verifies canonical headwear crop geometry used by runtime and mining.
# - Prevents silent drift between training crop extraction and runtime crops.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass

from app.pipeline.headwear_crop_geometry import (
    HEADWEAR_CROP_RECIPE_VERSION,
    build_headwear_crop_box,
)


@dataclass(slots=True)
class _BBox:
    x1: int
    y1: int
    x2: int
    y2: int


def test_headwear_crop_geometry_matches_policy_constants() -> None:
    person_bbox = _BBox(x1=100, y1=50, x2=300, y2=550)

    crop = build_headwear_crop_box(
        frame_shape=(720, 1280, 3),
        person_bbox=person_bbox,
        min_width=8,
        min_height=8,
    )

    assert crop is not None
    assert crop.as_xyxy() == (142, 50, 258, 200)
    assert crop.width == 116
    assert crop.height == 150
    assert HEADWEAR_CROP_RECIPE_VERSION == "head_top_030_centerw_058_v3"


def test_headwear_crop_geometry_clamps_to_frame() -> None:
    person_bbox = _BBox(x1=5, y1=0, x2=105, y2=200)

    crop = build_headwear_crop_box(
        frame_shape=(100, 120, 3),
        person_bbox=person_bbox,
        min_width=8,
        min_height=8,
    )

    assert crop is not None
    assert crop.as_xyxy() == (26, 0, 84, 30)


def test_headwear_crop_geometry_rejects_tiny_crop() -> None:
    person_bbox = _BBox(x1=10, y1=10, x2=20, y2=20)

    crop = build_headwear_crop_box(
        frame_shape=(100, 100, 3),
        person_bbox=person_bbox,
        min_width=16,
        min_height=16,
    )

    assert crop is None
