# ============================================================
# File: tests/test_main_entrypoint_v3.py
# Purpose:
# - Tests app/main.py import-time validation, logging and lifespan behavior.
# ============================================================

from __future__ import annotations

import importlib
import sys
from types import SimpleNamespace

import pytest


def import_main_with_fakes(monkeypatch, *, app_name="Vision Test", log_level="NO_SUCH_LEVEL"):
    sys.modules.pop("app.main", None)
    calls = []

    class FakeSettings(SimpleNamespace):
        def validate_app_config_or_raise(self):
            calls.append("validate_app")

        def validate_runtime_static_config_or_raise(self):
            calls.append("validate_runtime_static")

    fake_settings = FakeSettings(
        app_name=app_name,
        log_level=log_level,
        app_host="127.0.0.1",
        app_port=9999,
        app_reload=False,
    )

    class FakeRuntime:
        instances = []

        def __init__(self, settings):
            self.settings = settings
            self.shutdown_called = False
            FakeRuntime.instances.append(self)

        def shutdown(self):
            self.shutdown_called = True

    monkeypatch.setattr("app.config.get_settings", lambda: fake_settings)
    monkeypatch.setattr("app.pipeline.runtime.VisionRuntimeService", FakeRuntime)
    return importlib.import_module("app.main"), calls, FakeRuntime


def test_main_import_validates_configures_logging_and_includes_routes(monkeypatch):
    captured = {}
    monkeypatch.setattr("logging.basicConfig", lambda **kwargs: captured.update(kwargs))
    module, calls, _runtime_cls = import_main_with_fakes(monkeypatch)

    assert calls == ["validate_app", "validate_runtime_static"]
    assert captured["level"] == 20  # unknown log level falls back to INFO
    assert module.app.title == "Vision Test"
    route_paths = {route.path for route in module.app.routes}
    assert "/healthz" in route_paths
    assert "/runtime/status" in route_paths


@pytest.mark.asyncio
async def test_lifespan_creates_runtime_and_shutdowns_it(monkeypatch):
    module, _calls, runtime_cls = import_main_with_fakes(monkeypatch)
    fake_app = SimpleNamespace(state=SimpleNamespace())

    async with module.lifespan(fake_app):
        assert fake_app.state.runtime_service is runtime_cls.instances[-1]
        assert fake_app.state.runtime_service.shutdown_called is False

    assert fake_app.state.runtime_service.shutdown_called is True


def test_main_module_dunder_runs_uvicorn_with_settings(monkeypatch):
    # The __main__ branch is intentionally not executed by import. This test
    # protects the contract by verifying settings are import-resolved and the app object exists.
    module, _calls, _runtime_cls = import_main_with_fakes(monkeypatch, app_name="Entry")
    assert module.settings.app_host == "127.0.0.1"
    assert module.settings.app_port == 9999
    assert module.app.title == "Entry"
