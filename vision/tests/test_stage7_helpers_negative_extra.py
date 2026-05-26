# ============================================================
# File: vision/tests/test_stage7_helpers_negative_extra.py
# Purpose:
# - Extra tests for pure Stage-7 formatting/finalization helpers.
# - Focuses on missing fields, malformed objects and API-safe outputs.
# ============================================================

from __future__ import annotations

from datetime import datetime
from enum import Enum
from types import SimpleNamespace

import pytest

from app.models.schemas import ComplianceSignal, IncidentState
from app.pipeline.stage7_helpers import (
    OverlayIdentityState,
    _best_snapshot_ref,
    _enum_value,
    _first_attr,
    _format_score,
    _json_safe,
    _normalize_headwear_signal,
    _normalize_identity_state,
    _object_to_dict,
    _safe_float,
    _safe_int,
    _safe_list,
    _safe_short_reason,
    _unique,
    build_day_people_result,
    build_headwear_overlay_label,
    build_incidents_result,
    build_overlay_identity_info,
    build_overlay_label,
    build_runtime_final_result,
    safe_finalize_without_unsafe_merge,
)


@pytest.mark.parametrize(
    ("state", "expected"),
    [
        (None, OverlayIdentityState.UNKNOWN),
        ("confirmed", OverlayIdentityState.CONFIRMED),
        ("OverlayIdentityState.PROBABLE", OverlayIdentityState.PROBABLE),
        ("conflict", OverlayIdentityState.CONFLICT),
        ("bad", OverlayIdentityState.UNKNOWN),
    ],
)
def test_normalize_identity_state_handles_missing_enum_and_bad_values(state: str | None, expected: OverlayIdentityState) -> None:
    assert _normalize_identity_state(state) == expected


@pytest.mark.parametrize(
    ("signal", "expected"),
    [
        (ComplianceSignal.COMPLIANT, ComplianceSignal.COMPLIANT),
        ("ok", ComplianceSignal.COMPLIANT),
        ("headwear_ok", ComplianceSignal.COMPLIANT),
        ("no headwear", ComplianceSignal.VIOLATION),
        ("no-headwear", ComplianceSignal.VIOLATION),
        (None, ComplianceSignal.UNKNOWN),
        ("garbage", ComplianceSignal.UNKNOWN),
    ],
)
def test_normalize_headwear_signal_handles_aliases(signal, expected: ComplianceSignal) -> None:
    assert _normalize_headwear_signal(signal) == expected


@pytest.mark.parametrize(
    ("signal", "label"),
    [
        (ComplianceSignal.COMPLIANT, "HEADWEAR OK"),
        (ComplianceSignal.VIOLATION, "NO HEADWEAR"),
        (ComplianceSignal.UNKNOWN, "UNKNOWN"),
    ],
)
def test_headwear_overlay_label_uses_three_stable_labels(signal: ComplianceSignal, label: str) -> None:
    assert build_headwear_overlay_label(signal) == label


def test_overlay_label_for_conflict_prioritizes_conflict_ids() -> None:
    assert build_overlay_label(identity_state="conflict", conflict_person_ids=["p1", "", "p2"]) == "CONFLICT | p1/p2"
    assert build_overlay_label(identity_state="conflict") == "CONFLICT"


def test_overlay_label_for_person_candidate_track_and_unknown_fragments() -> None:
    assert build_overlay_label(person_id="p1", identity_state="confirmed", identity_score=0.876).startswith("p1 | CONFIRMED | score=0.88")
    assert build_overlay_label(person_id="p1", identity_state="probable") == "p1? | PROBABLE"
    assert build_overlay_label(candidate_id="c1", visible_parts=["head", "torso"]) == "c1 | PARTIAL | head+torso"
    assert build_overlay_label(track_id=5, reason="bad") == "UNKNOWN_FRAGMENT | track_5 | bad"
    assert build_overlay_label(reason="bad") == "UNKNOWN_FRAGMENT | bad"
    assert build_overlay_label() == "UNKNOWN_FRAGMENT"


def test_overlay_label_truncates_long_unknown_reason() -> None:
    label = build_overlay_label(track_id=1, reason="x" * 100)

    assert label.endswith("…")
    assert len(label) < 80


def test_overlay_identity_info_falls_back_when_decision_missing() -> None:
    info = build_overlay_identity_info(identity_decision=None, fallback_track_id=9)

    assert info.state == OverlayIdentityState.UNKNOWN
    assert "track_9" in info.label


def test_overlay_identity_info_supports_object_decision_and_conflict() -> None:
    decision = SimpleNamespace(person_id="p1", competing_person_id="p2", decision_type="conflict", score="0.75", reason="ambiguous")

    info = build_overlay_identity_info(identity_decision=decision)

    assert info.state == OverlayIdentityState.CONFLICT
    assert info.score == 0.75
    assert info.label == "CONFLICT | p1/p2"


def test_safe_finalize_handles_registry_and_incident_engine_exceptions() -> None:
    class BadRegistry:
        def partial_candidates_snapshot(self, include_closed: bool):
            raise RuntimeError("boom")

    class BadIncidentEngine:
        def tick(self, reference_time):
            raise RuntimeError("boom")

    reasons = safe_finalize_without_unsafe_merge(
        incident_engine=BadIncidentEngine(),
        day_registry=BadRegistry(),
        reference_time=datetime(2026, 1, 1),
    )

    assert "partial_candidates_finalize_failed" in reasons
    assert "incident_engine_tick_failed" in reasons


def test_safe_finalize_closes_non_closed_partial_candidates() -> None:
    calls: list[tuple[str, str]] = []

    class Registry:
        def partial_candidates_snapshot(self, include_closed: bool):
            return [SimpleNamespace(candidate_id="c1", status="active"), SimpleNamespace(candidate_id="c2", status="closed")]

        def close_partial_candidate(self, candidate_id: str, reason: str):
            calls.append((candidate_id, reason))

    reasons = safe_finalize_without_unsafe_merge(incident_engine=None, day_registry=Registry(), reference_time=datetime(2026, 1, 1))

    assert calls == [("c1", "runtime_finalize")]
    assert reasons == ["final_merge_skipped_by_stage7_safety_policy"]


def test_build_day_people_result_skips_items_without_person_id_and_serializes_fields() -> None:
    now = datetime(2026, 1, 1, 12, 0, 0)
    people = [
        SimpleNamespace(
            day_person_id="p1",
            first_seen_at=now,
            last_seen_at=now,
            status=SimpleNamespace(value="active"),
            observation_count="3",
            confirmed_hits="bad",
            probable_hits=2,
            current_owner_track_id=10,
            fragment_track_ids=(1, 2),
            candidate_links="c1",
            co_visible_person_ids={"p2"},
            best_snapshots=["old", "new"],
        ),
        SimpleNamespace(day_person_id=""),
    ]

    result = build_day_people_result(people)

    assert len(result) == 1
    assert result[0]["person_id"] == "p1"
    assert result[0]["observations_count"] == 3
    assert result[0]["confirmed_hits"] == 0
    assert result[0]["best_snapshot_ref"] == "new"


def test_build_incidents_result_supports_person_track_and_unknown_subjects() -> None:
    now = datetime(2026, 1, 1)
    incidents = [
        SimpleNamespace(case_id="i1", day_person_id="p1", state=IncidentState.OPEN, opened_at=now, last_confirmed_at=now, reason_codes=("a", "b")),
        SimpleNamespace(incident_id="i2", track_id=5, state="open", opened_at=now, last_seen_at=now),
        SimpleNamespace(incident_id="i3"),
    ]

    result = build_incidents_result(incidents)

    assert result[0]["subject_type"] == "person_id"
    assert result[0]["subject_key"] == "p1"
    assert result[1]["subject_type"] == "track_id"
    assert result[1]["subject_key"] == "track:5"
    assert result[2]["subject_type"] == "unknown"


def test_build_runtime_final_result_is_json_safe_and_deduplicates_reasons() -> None:
    result = build_runtime_final_result(day_people=[], incidents=[], processed_video_path="out.mp4", runtime_status=SimpleNamespace(ok=True), reason_codes=["a", "a", ""])

    assert result.processed_video_path == "out.mp4"
    assert result.runtime_status == {"ok": True}
    assert result.reason_codes == ["a"]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, ""),
        (0.1234, " | score=0.12"),
        ("bad", ""),
    ],
)
def test_format_score_rejects_bad_numeric_values(value, expected: str) -> None:
    assert _format_score(value) == expected


def test_private_safe_helpers_are_defensive() -> None:
    now = datetime(2026, 1, 1)

    assert _safe_short_reason(None) == ""
    assert _first_attr({"a": 1}, "a") == 1
    assert _first_attr(SimpleNamespace(b=2), "b") == 2
    assert _first_attr(None, "x") is None
    assert _safe_float("bad") is None
    assert _safe_int("bad") == 0
    assert _safe_list(None) == []
    assert sorted(_safe_list({2, 1})) == [1, 2]
    assert _safe_list("x") == ["x"]
    assert _enum_value(SimpleNamespace(value="ok")) == "ok"
    assert _json_safe(now) == now.isoformat()
    assert _best_snapshot_ref(SimpleNamespace(best_snapshots=["a", "b"])) == "b"
    assert _object_to_dict(None) == {}
    assert _object_to_dict({"x": 1}) == {"x": 1}
    assert _unique(["a", "", "a", "b"]) == ["a", "b"]


class _BadDump:
    def model_dump(self):
        raise RuntimeError("bad")


def test_object_to_dict_swallows_bad_model_dump() -> None:
    assert _object_to_dict(_BadDump()) == {}
