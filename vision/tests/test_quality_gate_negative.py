# ============================================================
# File: vision/tests/test_quality_gate_negative.py
# Purpose:
# - Negative and boundary tests for QualityGate.
# - Validates that bad geometry, truncation and occlusion block downstream use.
# ============================================================

from __future__ import annotations

from types import SimpleNamespace

import numpy as np

from app.models.schemas import BBox
from app.pipeline.quality_gate import QualityGate


def _settings(**overrides):
    base = {
        "min_quality_score": 0.45,
        "max_occlusion_ratio": 0.45,
        "min_bbox_area_ratio": 0.008,
        "min_bbox_height_px": 80,
        "crop_border_px": 4,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_invalid_frame_dimensions_return_blocking_quality() -> None:
    quality = QualityGate(_settings()).assess(
        bbox=BBox(x1=10, y1=10, x2=100, y2=200),
        peer_bboxes=[],
        frame_shape=(0, 640, 3),
    )

    assert quality.is_valid is False
    assert quality.is_low_quality is True
    assert quality.is_usable_for_identity is False
    assert "invalid_frame_dimensions" in quality.reason_codes


def test_invalid_bbox_after_clipping_is_rejected() -> None:
    quality = QualityGate(_settings()).assess(
        bbox=BBox(x1=700, y1=700, x2=800, y2=900),
        peer_bboxes=[],
        frame_shape=(480, 640, 3),
    )

    assert quality.is_valid is False
    assert quality.occlusion_ratio == 1.0
    assert "invalid_bbox_after_clipping" in quality.reason_codes


def test_small_bbox_is_not_usable_for_identity_or_headwear() -> None:
    quality = QualityGate(_settings()).assess(
        bbox=BBox(x1=10, y1=10, x2=25, y2=35),
        peer_bboxes=[],
        frame_shape=(480, 640, 3),
    )

    assert quality.is_usable_for_identity is False
    assert quality.is_usable_for_headwear is False
    assert "bbox_too_small" in quality.reason_codes or "bbox_height_too_small" in quality.reason_codes


def test_cropped_head_blocks_headwear_context() -> None:
    quality = QualityGate(_settings()).assess(
        bbox=BBox(x1=100, y1=0, x2=200, y2=350),
        peer_bboxes=[],
        frame_shape=(480, 640, 3),
    )

    assert quality.head_visible is False
    assert quality.is_cropped is True
    assert quality.is_usable_for_headwear is False
    assert "bbox_truncated" in quality.reason_codes


def test_peer_occlusion_blocks_usable_result() -> None:
    target = BBox(x1=100, y1=60, x2=220, y2=430)
    peer = BBox(x1=105, y1=65, x2=215, y2=420)

    quality = QualityGate(_settings()).assess(
        bbox=target,
        peer_bboxes=[peer],
        frame_shape=(480, 640, 3),
    )

    assert quality.is_occluded is True
    assert quality.is_usable_for_headwear is False
    assert "bbox_occluded" in quality.reason_codes


def test_good_bbox_with_non_empty_frame_is_valid_enough_for_downstream() -> None:
    frame = np.full((480, 640, 3), 120, dtype=np.uint8)
    # Add a high-contrast head region so blur/exposure checks do not dominate the result.
    frame[60:180, 120:220] = np.indices((120, 100)).sum(axis=0)[:, :, None] % 255

    quality = QualityGate(_settings(min_quality_score=0.35)).assess(
        bbox=BBox(x1=120, y1=60, x2=220, y2=430),
        peer_bboxes=[],
        frame=frame,
    )

    assert quality.is_valid is True
    assert quality.quality_score > 0.35
    assert quality.bbox_area_ratio > 0.0
    assert quality.is_low_quality is False
