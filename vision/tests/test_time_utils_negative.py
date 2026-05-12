# ============================================================
# File: vision/tests/test_time_utils_negative.py
# Purpose:
# - Edge tests for UTC/date helper functions.
# ============================================================

from __future__ import annotations

from datetime import datetime, timezone

from app.utils.time_utils import seconds_between, to_iso, today_key_utc, utc_now


def test_utc_now_is_timezone_aware() -> None:
    value = utc_now()

    assert value.tzinfo is not None
    assert value.utcoffset() is not None


def test_today_key_utc_has_iso_date_shape() -> None:
    key = today_key_utc()

    assert len(key) == 10
    assert key.count("-") == 2


def test_seconds_between_preserves_sign_for_reversed_values() -> None:
    left = datetime(2026, 1, 1, 0, 0, 10, tzinfo=timezone.utc)
    right = datetime(2026, 1, 1, 0, 0, 5, tzinfo=timezone.utc)

    assert seconds_between(left, right) == -5.0


def test_to_iso_accepts_none_and_datetime() -> None:
    value = datetime(2026, 1, 1, 1, 2, 3, tzinfo=timezone.utc)

    assert to_iso(None) is None
    assert to_iso(value) == value.isoformat()
