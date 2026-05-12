# ============================================================
# File: vision/tests/test_backend_client_negative.py
# Purpose:
# - Negative tests for backend sync client.
# - Ensures runtime loop is protected from transport/serialization errors.
# ============================================================

from __future__ import annotations

from types import SimpleNamespace
from urllib.error import URLError

import pytest

from app.clients import backend_client as backend_module
from app.clients.backend_client import BackendClient


def _settings(**overrides):
    base = {
        "backend_base_url": "http://backend.local/api",
        "backend_timeout_sec": 1.0,
        "backend_enabled": True,
        "backend_max_retries": 0,
        "backend_retry_delay_sec": 0.0,
        "backend_dedup_enabled": True,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class _Response:
    def __init__(self, status: int) -> None:
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_disabled_backend_never_posts(monkeypatch: pytest.MonkeyPatch) -> None:
    called = False

    def fake_urlopen(*args, **kwargs):
        nonlocal called
        called = True
        return _Response(200)

    monkeypatch.setattr(backend_module, "urlopen", fake_urlopen)
    client = BackendClient(_settings(backend_enabled=False))

    assert client.is_enabled() is False
    assert client.post_json("/incidents", {"caseId": "case_1"}) is False
    assert called is False


def test_successful_post_is_deduplicated(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    def fake_urlopen(request, timeout):
        calls.append((request.full_url, timeout))
        return _Response(201)

    monkeypatch.setattr(backend_module, "urlopen", fake_urlopen)
    client = BackendClient(_settings())

    payload = {"caseId": "case_1", "signal": "violation"}
    assert client.post_json("incidents", payload) is True
    assert client.post_json("/incidents", payload) is True

    assert len(calls) == 1
    assert calls[0][0] == "http://backend.local/api/incidents"


def test_transport_error_is_swallowed_and_reported_as_false(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_urlopen(*args, **kwargs):
        raise URLError("network down")

    monkeypatch.setattr(backend_module, "urlopen", fake_urlopen)
    monkeypatch.setattr(backend_module.time, "sleep", lambda *_: None)

    client = BackendClient(_settings(backend_max_retries=1))
    assert client.post_json("incidents", {"caseId": "case_2"}) is False


def test_unserializable_payload_returns_false_without_http_call(monkeypatch: pytest.MonkeyPatch) -> None:
    called = False

    def fake_urlopen(*args, **kwargs):
        nonlocal called
        called = True
        return _Response(200)

    monkeypatch.setattr(backend_module, "urlopen", fake_urlopen)
    client = BackendClient(_settings())

    assert client.post_json("incidents", {"bad": object()}) is False
    assert called is False


def test_non_2xx_status_returns_false(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(backend_module, "urlopen", lambda *_, **__: _Response(500))
    client = BackendClient(_settings())

    assert client.post_json("incidents", {"caseId": "case_500"}) is False
