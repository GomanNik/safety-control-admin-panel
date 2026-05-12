# ============================================================
# File: vision/tests/test_frame_store_stage7.py
# Purpose:
# - Verifies stage-7 evidence storage behavior.
# ============================================================

from __future__ import annotations

import json
from datetime import datetime, timezone

import numpy as np

from app.models.schemas import BBox
from app.storage.frame_store import FrameStore


def _frame() -> np.ndarray:
    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    frame[20:100, 40:120] = 180
    return frame


def test_low_quality_observation_does_not_save_evidence(tmp_path):
    store = FrameStore(str(tmp_path))

    record = store.save_incident_evidence(
        frame=_frame(),
        camera_id="camera_001",
        observed_at=datetime.now(timezone.utc),
        bbox=BBox(x1=40, y1=20, x2=120, y2=100),
        quality_score=0.1,
        headwear_status="violation",
    )

    assert record is None


def test_violation_good_quality_saves_evidence(tmp_path):
    store = FrameStore(str(tmp_path))

    record = store.save_incident_evidence(
        frame=_frame(),
        camera_id="camera_001",
        observed_at=datetime.now(timezone.utc),
        frame_index=12,
        track_id=7,
        person_id="person_001",
        incident_id="case_001",
        bbox=BBox(x1=40, y1=20, x2=120, y2=100),
        head_bbox=BBox(x1=45, y1=20, x2=115, y2=50),
        quality_score=0.86,
        headwear_status="violation",
        identity_decision_type="CONFIRMED",
        scene_zone="center",
        reason_codes=["test_reason"],
    )

    assert record is not None
    assert record.evidence_id.startswith("evidence_")
    assert record.image_path is not None
    assert record.crop_path is not None
    assert record.head_crop_path is not None
    assert record.metadata_path is not None
    assert record.track_id == 7
    assert record.person_id == "person_001"
    assert record.incident_id == "case_001"

    metadata_path = tmp_path / record.metadata_path
    payload = json.loads(metadata_path.read_text(encoding="utf-8"))

    assert payload["track_id"] == 7
    assert payload["person_id"] == "person_001"
    assert payload["incident_id"] == "case_001"
    assert payload["headwear_status"] == "violation"


def test_empty_crop_does_not_save_evidence(tmp_path):
    store = FrameStore(str(tmp_path))

    record = store.save_incident_evidence(
        frame=_frame(),
        camera_id="camera_001",
        observed_at=datetime.now(timezone.utc),
        bbox=BBox(x1=10, y1=10, x2=10, y2=20),
        quality_score=0.9,
        headwear_status="violation",
    )

    assert record is None


def test_frame_store_creates_directories(tmp_path):
    store = FrameStore(str(tmp_path))

    record = store.save_incident_evidence(
        frame=_frame(),
        camera_id="camera_001",
        observed_at=datetime.now(timezone.utc),
        bbox=BBox(x1=40, y1=20, x2=120, y2=100),
        quality_score=0.9,
        headwear_status="violation",
    )

    assert record is not None
    assert (tmp_path / record.metadata_path).exists()


def test_evidence_id_is_unique(tmp_path):
    store = FrameStore(str(tmp_path))

    left = store.save_incident_evidence(
        frame=_frame(),
        camera_id="camera_001",
        observed_at=datetime.now(timezone.utc),
        bbox=BBox(x1=40, y1=20, x2=120, y2=100),
        quality_score=0.9,
        headwear_status="violation",
    )
    right = store.save_incident_evidence(
        frame=_frame(),
        camera_id="camera_001",
        observed_at=datetime.now(timezone.utc),
        bbox=BBox(x1=40, y1=20, x2=120, y2=100),
        quality_score=0.9,
        headwear_status="violation",
    )

    assert left is not None
    assert right is not None
    assert left.evidence_id != right.evidence_id