# ============================================================
# File: vision/tests/test_frame_store_negative_extra.py
# Purpose:
# - Expanded negative tests for evidence/frame storage.
# - Attacks bad frames, unsafe names, crop boundaries, ranking and retention.
# ============================================================

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest

from app.models.schemas import BBox
from app.storage.frame_store import EvidenceRecord, FrameStore


def _frame(width: int = 80, height: int = 60, value: int = 127) -> np.ndarray:
    frame = np.full((height, width, 3), value, dtype=np.uint8)
    frame[:, :, 1] = np.arange(width, dtype=np.uint8)[None, :] % 255
    return frame


def _store(tmp_path: Path, **kwargs) -> FrameStore:
    return FrameStore(str(tmp_path), image_ext=kwargs.pop("image_ext", ".jpg"), jpeg_quality=kwargs.pop("jpeg_quality", 90), retention_days=kwargs.pop("retention_days", 1), cleanup_interval_sec=kwargs.pop("cleanup_interval_sec", 30.0))


def _record(**overrides) -> EvidenceRecord:
    base = {
        "evidence_id": "e1",
        "created_at": "2026-01-01T00:00:00+00:00",
        "observed_at": "2026-01-01T00:00:00+00:00",
        "frame_index": 1,
        "track_id": 1,
        "person_id": "p1",
        "candidate_id": None,
        "incident_id": "i1",
        "evidence_type": "incident",
        "image_path": "frame.jpg",
        "crop_path": None,
        "head_crop_path": None,
        "upper_body_crop_path": None,
        "lower_body_crop_path": None,
        "footwear_crop_path": None,
        "metadata_path": "metadata.json",
        "quality_score": 0.5,
        "headwear_status": "unknown",
        "identity_decision_type": None,
        "scene_zone": None,
        "reason_codes": [],
    }
    base.update(overrides)
    return EvidenceRecord(**base)


@pytest.mark.parametrize("image_ext", ["jpg", ".png"])
def test_store_constructor_normalizes_extension_and_bounds_quality(tmp_path: Path, image_ext: str) -> None:
    store = FrameStore(str(tmp_path), image_ext=image_ext, jpeg_quality=999, retention_days=-10, cleanup_interval_sec=1)

    assert store._image_ext.startswith(".")
    assert store._jpeg_quality == 100
    assert store._retention_days == 1
    assert store._cleanup_interval_sec == 30.0


@pytest.mark.parametrize("frame", [None, np.array([], dtype=np.uint8), np.zeros((0, 0, 3), dtype=np.uint8), np.zeros((10,), dtype=np.uint8)])
def test_save_full_frame_rejects_invalid_frames(tmp_path: Path, frame) -> None:
    store = _store(tmp_path)

    assert store.save_full_frame(frame=frame, camera_id="cam", timestamp=datetime.now(timezone.utc), prefix="x") is None


def test_save_full_frame_sanitizes_path_parts(tmp_path: Path) -> None:
    store = _store(tmp_path)

    path = store.save_full_frame(frame=_frame(), camera_id="cam/../../bad", timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc), prefix="../prefix bad")

    assert path is not None
    assert ".." not in Path(path).parts
    assert "/" in path
    assert (tmp_path / path).is_file()


@pytest.mark.parametrize(
    "bbox",
    [
        BBox(x1=10, y1=10, x2=10, y2=20),
        BBox(x1=1000, y1=1000, x2=1100, y2=1200),
    ],
)
def test_save_crop_rejects_invalid_or_uninformative_crop(tmp_path: Path, bbox: BBox) -> None:
    store = _store(tmp_path)

    assert store.save_crop(frame=_frame(), bbox=bbox, camera_id="cam", timestamp=datetime.now(timezone.utc), prefix="crop") is None


def test_save_crop_clips_bbox_and_writes_public_relative_path(tmp_path: Path) -> None:
    store = _store(tmp_path)

    path = store.save_crop(frame=_frame(), bbox=BBox(x1=-5, y1=-5, x2=20, y2=20), camera_id="cam", timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc), prefix="crop")

    assert path is not None
    assert not Path(path).is_absolute()
    assert (tmp_path / path).is_file()


def test_save_clip_rejects_empty_and_bad_first_frame(tmp_path: Path) -> None:
    store = _store(tmp_path)

    assert store.save_clip(frames=[], camera_id="cam", timestamp=datetime.now(timezone.utc), prefix="clip") is None
    assert store.save_clip(frames=[np.array([], dtype=np.uint8)], camera_id="cam", timestamp=datetime.now(timezone.utc), prefix="clip") is None


def test_save_clip_skips_bad_frames_and_resizes_mismatched_frames(tmp_path: Path) -> None:
    store = _store(tmp_path)

    path = store.save_clip(frames=[_frame(40, 30), np.array([], dtype=np.uint8), _frame(20, 15)], camera_id="cam", timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc), prefix="clip", fps=0)

    assert path is not None
    assert (tmp_path / path).is_file()


@pytest.mark.parametrize(
    ("kwargs", "reason"),
    [
        ({"frame": None}, "bad_frame"),
        ({"quality_score": 0.1, "min_quality_score": 0.5}, "low_quality"),
        ({"headwear_status": "compliant", "incident_id": None, "evidence_type": "incident"}, "not_useful_signal"),
        ({"bbox": BBox(x1=0, y1=0, x2=2, y2=2)}, "bad_crop"),
    ],
)
def test_save_incident_evidence_rejects_unusable_inputs(tmp_path: Path, kwargs: dict[str, object], reason: str) -> None:
    store = _store(tmp_path)
    base = {
        "frame": _frame(),
        "camera_id": "cam",
        "observed_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "incident_id": "incident_1",
        "bbox": BBox(x1=5, y1=5, x2=50, y2=50),
        "quality_score": 0.9,
        "headwear_status": "violation",
    }
    base.update(kwargs)

    assert store.save_incident_evidence(**base) is None


def test_save_incident_evidence_writes_metadata_and_part_crops(tmp_path: Path) -> None:
    store = _store(tmp_path)

    record = store.save_incident_evidence(
        frame=_frame(),
        camera_id="cam",
        observed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        frame_index=3,
        track_id=7,
        person_id="p1",
        incident_id="incident_1",
        bbox=BBox(x1=5, y1=5, x2=50, y2=50),
        head_bbox=BBox(x1=10, y1=5, x2=35, y2=25),
        upper_body_bbox=BBox(x1=10, y1=20, x2=45, y2=45),
        quality_score=0.9,
        headwear_status="no-headwear",
        reason_codes=["a", "a", ""],
    )

    assert record is not None
    assert record.headwear_status == "violation"
    assert record.reason_codes == ["a"]
    assert record.metadata_path is not None
    assert (tmp_path / record.metadata_path).is_file()
    assert record.image_path and (tmp_path / record.image_path).is_file()
    assert record.crop_path and (tmp_path / record.crop_path).is_file()


@pytest.mark.parametrize(
    ("quality", "bbox", "expected_none"),
    [
        (0.1, BBox(x1=5, y1=5, x2=50, y2=50), True),
        (0.9, None, True),
        (0.9, BBox(x1=5, y1=5, x2=50, y2=50), False),
    ],
)
def test_save_identity_crop_requires_quality_bbox_and_informative_crop(tmp_path: Path, quality: float, bbox: BBox | None, expected_none: bool) -> None:
    store = _store(tmp_path)

    path = store.save_identity_crop(frame=_frame(), bbox=bbox, camera_id="cam", timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc), prefix="id", quality_score=quality)

    assert (path is None) is expected_none


@pytest.mark.parametrize(
    ("part_name", "track_id", "expected_prefix"),
    [
        ("head wear", None, "head_wear"),
        ("upper/body", 5, "track_5_upper_body"),
    ],
)
def test_save_part_crop_builds_safe_prefix(tmp_path: Path, part_name: str, track_id: int | None, expected_prefix: str) -> None:
    store = _store(tmp_path)

    path = store.save_part_crop(frame=_frame(), bbox=BBox(x1=5, y1=5, x2=50, y2=50), camera_id="cam", timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc), part_name=part_name, track_id=track_id, quality_score=0.9)

    assert path is not None
    assert expected_prefix in path


def test_select_better_evidence_prefers_violation_quality_and_more_crops(tmp_path: Path) -> None:
    store = _store(tmp_path)
    unknown = _record(headwear_status="unknown", quality_score=1.0, crop_path="crop.jpg")
    compliant = _record(headwear_status="compliant", quality_score=0.1)
    violation = _record(headwear_status="violation", quality_score=0.2)

    assert store.select_better_evidence(None, unknown) is unknown
    assert store.select_better_evidence(unknown, None) is unknown
    assert store.select_better_evidence(unknown, compliant) is compliant
    assert store.select_better_evidence(compliant, violation) is violation


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, "unknown"),
        ("no_headwear", "violation"),
        ("no headwear", "violation"),
        ("ok", "compliant"),
        ("headwear-ok", "compliant"),
        ("garbage", "unknown"),
    ],
)
def test_normalize_status_handles_common_aliases(value: str | None, expected: str) -> None:
    assert FrameStore._normalize_status(value) == expected


@pytest.mark.parametrize(
    ("evidence_type", "status", "incident_id", "expected"),
    [
        ("identity", "unknown", None, True),
        ("part", "unknown", None, True),
        ("snapshot", "unknown", None, True),
        ("incident", "violation", None, True),
        ("incident", "unknown", "case_1", True),
        ("incident", "compliant", None, False),
    ],
)
def test_is_useful_evidence_signal_prevents_noise(evidence_type: str, status: str, incident_id: str | None, expected: bool) -> None:
    assert FrameStore._is_useful_evidence_signal(evidence_type=evidence_type, headwear_status=status, incident_id=incident_id) is expected


@pytest.mark.parametrize("value", [-10, 0, 0.5, 1, 10, "bad"])
def test_clamp01_never_leaves_unit_interval(value) -> None:
    result = FrameStore._clamp01(value)
    assert 0.0 <= result <= 1.0


def test_unique_reasons_removes_empty_and_duplicates() -> None:
    assert FrameStore._unique_reasons(["a", "", "a", "b"]) == ["a", "b"]


def test_sanitize_prevents_empty_and_path_traversal(tmp_path: Path) -> None:
    store = _store(tmp_path)

    assert store._sanitize("../../bad value") == "bad_value"
    assert store._sanitize("!!!") == "item"


def test_public_path_returns_absolute_when_path_is_outside_base(tmp_path: Path) -> None:
    store = _store(tmp_path)
    outside = tmp_path.parent / "outside.jpg"

    assert store._public_path(outside) == outside.as_posix()


def test_cleanup_retention_deletes_old_files_and_empty_directories(tmp_path: Path) -> None:
    store = _store(tmp_path, retention_days=1)
    old_dir = tmp_path / "old" / "nested"
    old_dir.mkdir(parents=True)
    old_file = old_dir / "old.jpg"
    old_file.write_bytes(b"old")
    old_time = (datetime.now(timezone.utc) - timedelta(days=3)).timestamp()
    os.utime(old_file, (old_time, old_time))

    store.cleanup_retention(now=datetime.now(timezone.utc))

    assert not old_file.exists()
    assert not old_dir.exists()
