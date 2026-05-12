# ============================================================
# File: vision/app/pipeline/stage7_helpers.py
# Purpose:
# - Pure stage-7 helpers for overlay labels, finalization and API-safe results.
# - Keeps overlay/result formatting outside identity creation logic.
# - Never creates person_id.
# - Never upgrades track-buffer incidents into person-level incidents.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from app.models.schemas import ComplianceSignal


class OverlayIdentityState(str, Enum):
    CONFIRMED = "CONFIRMED"
    PROBABLE = "PROBABLE"
    CANDIDATE = "CANDIDATE"
    UNKNOWN = "UNKNOWN"
    CONFLICT = "CONFLICT"
    NEW_PERSON = "NEW_PERSON"
    REJECTED = "REJECTED"


@dataclass(slots=True)
class OverlayIdentityInfo:
    label: str
    state: OverlayIdentityState
    score: float | None = None
    reason: str | None = None


@dataclass(slots=True)
class FinalizeResult:
    day_people: list[dict[str, Any]]
    incidents: list[dict[str, Any]]
    processed_video_path: str | None
    runtime_status: dict[str, Any]
    reason_codes: list[str] = field(default_factory=list)


# ============================================================
# Overlay helpers
# ============================================================

def build_overlay_label(
    *,
    person_id: str | None = None,
    candidate_id: str | None = None,
    identity_state: str | None = None,
    identity_score: float | None = None,
    track_id: int | None = None,
    reason: str | None = None,
    conflict_person_ids: list[str] | tuple[str, ...] | None = None,
    visible_parts: list[str] | tuple[str, ...] | None = None,
) -> str:
    state = _normalize_identity_state(identity_state)

    if state == OverlayIdentityState.CONFLICT:
        conflict_ids = [item for item in (conflict_person_ids or []) if item]
        if conflict_ids:
            return f"CONFLICT | {'/'.join(conflict_ids)}"
        return "CONFLICT"

    if person_id:
        suffix = "?" if state == OverlayIdentityState.PROBABLE else ""
        score_text = _format_score(identity_score)

        if state in {
            OverlayIdentityState.CONFIRMED,
            OverlayIdentityState.PROBABLE,
            OverlayIdentityState.NEW_PERSON,
        }:
            return f"{person_id}{suffix} | {state.value}{score_text}"

        return f"{person_id}{suffix} | {state.value}{score_text}"

    if candidate_id:
        parts = "+".join([item for item in (visible_parts or []) if item])
        if parts:
            return f"{candidate_id} | PARTIAL | {parts}"
        return f"{candidate_id} | PARTIAL"

    if track_id is not None:
        short_reason = _safe_short_reason(reason)
        if short_reason:
            return f"UNKNOWN_FRAGMENT | track_{track_id} | {short_reason}"
        return f"UNKNOWN_FRAGMENT | track_{track_id}"

    short_reason = _safe_short_reason(reason)
    if short_reason:
        return f"UNKNOWN_FRAGMENT | {short_reason}"

    return "UNKNOWN_FRAGMENT"


def build_headwear_overlay_label(signal: ComplianceSignal | str | None) -> str:
    normalized = _normalize_headwear_signal(signal)

    if normalized == ComplianceSignal.COMPLIANT:
        return "HEADWEAR OK"
    if normalized == ComplianceSignal.VIOLATION:
        return "NO HEADWEAR"
    return "UNKNOWN"


def build_overlay_identity_info(
    *,
    identity_decision: Any | None = None,
    fallback_track_id: int | None = None,
    visible_parts: list[str] | tuple[str, ...] | None = None,
    reason: str | None = None,
) -> OverlayIdentityInfo:
    if identity_decision is None:
        label = build_overlay_label(
            track_id=fallback_track_id,
            reason=reason or "identity_decision_missing",
            visible_parts=visible_parts,
        )
        return OverlayIdentityInfo(label=label, state=OverlayIdentityState.UNKNOWN)

    person_id = _first_attr(identity_decision, "person_id", "day_person_id")
    candidate_id = _first_attr(identity_decision, "candidate_id")
    raw_state = _first_attr(identity_decision, "decision_type", "state")
    score = _safe_float(_first_attr(identity_decision, "score"))
    decision_reason = str(_first_attr(identity_decision, "reason") or reason or "")

    competing_person_id = _first_attr(identity_decision, "competing_person_id")
    conflict_ids = [str(person_id), str(competing_person_id)] if person_id and competing_person_id else []

    label = build_overlay_label(
        person_id=str(person_id) if person_id else None,
        candidate_id=str(candidate_id) if candidate_id else None,
        identity_state=str(raw_state) if raw_state else None,
        identity_score=score,
        track_id=fallback_track_id,
        reason=decision_reason,
        conflict_person_ids=conflict_ids,
        visible_parts=visible_parts,
    )

    return OverlayIdentityInfo(
        label=label,
        state=_normalize_identity_state(str(raw_state) if raw_state else None),
        score=score,
        reason=decision_reason or None,
    )


# ============================================================
# Finalization helpers
# ============================================================

def safe_finalize_without_unsafe_merge(
    *,
    incident_engine: Any | None,
    day_registry: Any | None,
    reference_time: datetime,
) -> list[str]:
    reason_codes: list[str] = ["final_merge_skipped_by_stage7_safety_policy"]

    if day_registry is not None:
        partial_snapshot = getattr(day_registry, "partial_candidates_snapshot", None)
        if callable(partial_snapshot):
            try:
                candidates = partial_snapshot(include_closed=True)
                for candidate in candidates:
                    status = getattr(candidate, "status", None)
                    if str(status).lower().endswith("closed"):
                        continue
                    close_candidate = getattr(day_registry, "close_partial_candidate", None)
                    if callable(close_candidate):
                        close_candidate(getattr(candidate, "candidate_id"), reason="runtime_finalize")
            except Exception:
                reason_codes.append("partial_candidates_finalize_failed")

    if incident_engine is not None:
        tick = getattr(incident_engine, "tick", None)
        if callable(tick):
            try:
                tick(reference_time)
                reason_codes.append("incident_engine_tick_applied")
            except Exception:
                reason_codes.append("incident_engine_tick_failed")

    return reason_codes


def build_day_people_result(day_people: list[Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []

    for item in day_people:
        person_id = _first_attr(item, "day_person_id", "person_id")
        if not person_id:
            continue

        result.append(
            {
                "person_id": str(person_id),
                "first_seen_at": _json_safe(_first_attr(item, "first_seen_at")),
                "last_seen_at": _json_safe(_first_attr(item, "last_seen_at")),
                "status": _enum_value(_first_attr(item, "status")),
                "observations_count": _safe_int(_first_attr(item, "observation_count", "observations_count")),
                "confirmed_hits": _safe_int(_first_attr(item, "confirmed_hits")),
                "probable_hits": _safe_int(_first_attr(item, "probable_hits")),
                "active_track_id": _first_attr(item, "current_owner_track_id", "active_track_id"),
                "track_ids": _safe_list(_first_attr(item, "fragment_track_ids", "track_ids")),
                "candidate_links": _safe_list(_first_attr(item, "candidate_links")),
                "co_visible_person_ids": _safe_list(_first_attr(item, "co_visible_person_ids")),
                "best_snapshot_ref": _best_snapshot_ref(item),
            }
        )

    return result


def build_incidents_result(incidents: list[Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []

    for item in incidents:
        person_id = _first_attr(item, "day_person_id", "person_id")
        track_id = _first_attr(item, "track_id")
        subject_type = "person_id" if person_id else "track_id" if track_id is not None else "unknown"
        subject_key = str(person_id) if person_id else f"track:{track_id}" if track_id is not None else None

        result.append(
            {
                "incident_id": str(_first_attr(item, "case_id", "incident_id") or ""),
                "subject_type": subject_type,
                "subject_key": subject_key,
                "person_id": str(person_id) if person_id else None,
                "track_id": track_id,
                "state": _enum_value(_first_attr(item, "state")),
                "opened_at": _json_safe(_first_attr(item, "opened_at")),
                "closed_at": _json_safe(_first_attr(item, "closed_at")),
                "last_seen_at": _json_safe(_first_attr(item, "last_confirmed_at", "last_seen_at")),
                "violation_ratio": _safe_float(_first_attr(item, "violation_ratio")),
                "valid_count": _safe_int(_first_attr(item, "valid_count")),
                "violation_count": _safe_int(_first_attr(item, "violation_count")),
                "best_evidence_ref": _first_attr(item, "best_frame_path", "best_evidence_ref"),
                "reason_codes": _safe_list(_first_attr(item, "reason_codes")),
            }
        )

    return result


def build_runtime_final_result(
    *,
    day_people: list[Any],
    incidents: list[Any],
    processed_video_path: str | None,
    runtime_status: dict[str, Any] | Any,
    reason_codes: list[str] | None = None,
) -> FinalizeResult:
    return FinalizeResult(
        day_people=build_day_people_result(day_people),
        incidents=build_incidents_result(incidents),
        processed_video_path=processed_video_path,
        runtime_status=_object_to_dict(runtime_status),
        reason_codes=_unique(reason_codes or []),
    )


# ============================================================
# Internal helpers
# ============================================================

def _normalize_identity_state(value: str | None) -> OverlayIdentityState:
    if value is None:
        return OverlayIdentityState.UNKNOWN

    text = str(value).strip().upper()

    if "." in text:
        text = text.rsplit(".", 1)[-1]

    mapping = {
        "CONFIRMED": OverlayIdentityState.CONFIRMED,
        "PROBABLE": OverlayIdentityState.PROBABLE,
        "CANDIDATE": OverlayIdentityState.CANDIDATE,
        "UNKNOWN": OverlayIdentityState.UNKNOWN,
        "CONFLICT": OverlayIdentityState.CONFLICT,
        "NEW_PERSON": OverlayIdentityState.NEW_PERSON,
        "REJECTED": OverlayIdentityState.REJECTED,
    }

    return mapping.get(text, OverlayIdentityState.UNKNOWN)


def _normalize_headwear_signal(signal: ComplianceSignal | str | None) -> ComplianceSignal:
    if isinstance(signal, ComplianceSignal):
        return signal

    if signal is None:
        return ComplianceSignal.UNKNOWN

    text = str(signal).strip().lower()
    if text in {"compliant", "ok", "headwear ok", "headwear_ok"}:
        return ComplianceSignal.COMPLIANT
    if text in {"violation", "no headwear", "no_headwear", "no-headwear"}:
        return ComplianceSignal.VIOLATION
    return ComplianceSignal.UNKNOWN


def _format_score(score: float | None) -> str:
    if score is None:
        return ""

    try:
        return f" | score={float(score):.2f}"
    except Exception:
        return ""


def _safe_short_reason(reason: str | None, max_len: int = 34) -> str:
    if not reason:
        return ""

    text = str(reason).strip()
    if len(text) <= max_len:
        return text

    return text[: max_len - 1] + "…"


def _first_attr(item: Any, *names: str) -> Any:
    if item is None:
        return None

    if isinstance(item, dict):
        for name in names:
            if name in item:
                return item[name]
        return None

    for name in names:
        if hasattr(item, name):
            return getattr(item, name)

    return None


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None

    try:
        return float(value)
    except Exception:
        return None


def _safe_int(value: Any) -> int:
    if value is None:
        return 0

    try:
        return int(value)
    except Exception:
        return 0


def _safe_list(value: Any) -> list[Any]:
    if value is None:
        return []

    if isinstance(value, list):
        return value

    if isinstance(value, tuple) or isinstance(value, set):
        return list(value)

    return [value]


def _enum_value(value: Any) -> str | None:
    if value is None:
        return None

    raw = getattr(value, "value", value)
    return str(raw)


def _json_safe(value: Any) -> Any:
    if value is None:
        return None

    if hasattr(value, "isoformat"):
        return value.isoformat()

    raw = getattr(value, "value", value)
    return raw


def _best_snapshot_ref(item: Any) -> str | None:
    snapshots = _safe_list(_first_attr(item, "best_snapshots"))
    if not snapshots:
        return None
    return str(snapshots[-1])


def _object_to_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}

    if isinstance(value, dict):
        return dict(value)

    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            return dict(model_dump())
        except Exception:
            return {}

    if hasattr(value, "__dict__"):
        return dict(value.__dict__)

    return {"value": str(value)}


def _unique(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        if not value:
            continue
        if value in seen:
            continue
        seen.add(value)
        result.append(value)

    return result