# ============================================================
# File: vision/app/utils/time_utils.py
# Purpose:
# - Time helpers used across runtime, incidents, and registry.
# ============================================================

from __future__ import annotations

from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def today_key_utc() -> str:
    return utc_now().strftime("%Y-%m-%d")


def seconds_between(left: datetime, right: datetime) -> float:
    return (right - left).total_seconds()


def to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()
