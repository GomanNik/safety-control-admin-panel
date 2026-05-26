# ============================================================
# File: vision/tests/test_person_crop_collection_start_seconds.py
# Purpose:
# - Regression tests for resuming clean person-crop collection from an
#   absolute timestamp of the original source video.
# - Does not open real videos and does not touch data/datasets/runs/models.
# ============================================================

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import cv2

import run_runtime
from app.api.routes_runtime import collect_person_crops
from app.pipeline.runtime import VisionRuntimeService


class _DummyResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return {"ok": True, "message": "started"}


class _RecordingSession:
    def __init__(self) -> None:
        self.url: str | None = None
        self.params: dict[str, Any] | None = None
        self.timeout: object | None = None

    def post(self, url: str, *, params: dict[str, Any], timeout: object) -> _DummyResponse:
        self.url = url
        self.params = dict(params)
        self.timeout = timeout
        return _DummyResponse()


class _RuntimeServiceStub:
    def __init__(self) -> None:
        self.kwargs: dict[str, Any] | None = None

    def collect_person_crops(self, **kwargs: Any) -> tuple[bool, str]:
        self.kwargs = dict(kwargs)
        return True, "collection started"


class _FakeCapture:
    def __init__(self) -> None:
        self.calls: list[tuple[int, float]] = []
        self.position_frames = 0

    def set(self, prop_id: int, value: float) -> bool:
        self.calls.append((prop_id, value))
        if prop_id == cv2.CAP_PROP_POS_FRAMES:
            self.position_frames = int(value)
        return True

    def get(self, prop_id: int) -> float:
        if prop_id == cv2.CAP_PROP_POS_FRAMES:
            return float(self.position_frames)
        return 0.0


def test_run_runtime_collect_person_crops_sends_start_seconds_query_param() -> None:
    session = _RecordingSession()

    response = run_runtime.start_person_crop_collection(
        session=session,  # type: ignore[arg-type]
        base_url="http://127.0.0.1:8090",
        source_url="D:/source.mp4",
        output_dir="C:/out",
        max_seconds=None,
        start_seconds=280408.0,
    )

    assert response["ok"] is True
    assert session.url == "http://127.0.0.1:8090/runtime/collect-person-crops"
    assert session.params == {
        "source_url": "D:/source.mp4",
        "output_dir": "C:/out",
        "start_seconds": 280408.0,
    }


def test_runtime_route_forwards_start_seconds_to_service() -> None:
    service = _RuntimeServiceStub()
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(runtime_service=service)))

    response = collect_person_crops(  # type: ignore[arg-type]
        request=request,
        source_url="D:/source.mp4",
        output_dir="C:/out",
        max_seconds=60.0,
        start_seconds=280408.0,
    )

    assert response.ok is True
    assert service.kwargs == {
        "source_url": "D:/source.mp4",
        "output_dir": "C:/out",
        "max_seconds": 60.0,
        "start_seconds": 280408.0,
    }


def test_seek_capture_to_start_seconds_prefers_absolute_frame_index_when_fps_is_known() -> None:
    capture = _FakeCapture()

    start_frame = VisionRuntimeService._seek_capture_to_start_seconds(
        capture=capture,  # type: ignore[arg-type]
        start_seconds=280408.0,
        source_fps=7.0,
        source_frame_count=2_500_000,
        fallback_fps=7.0,
    )

    assert start_frame == 1_962_856
    assert capture.calls == [(cv2.CAP_PROP_POS_FRAMES, 1_962_856)]


def test_seek_capture_to_start_seconds_clamps_to_last_available_frame() -> None:
    capture = _FakeCapture()

    start_frame = VisionRuntimeService._seek_capture_to_start_seconds(
        capture=capture,  # type: ignore[arg-type]
        start_seconds=999999999.0,
        source_fps=7.0,
        source_frame_count=100,
        fallback_fps=7.0,
    )

    assert start_frame == 99
    assert capture.calls == [(cv2.CAP_PROP_POS_FRAMES, 99)]


def test_seek_capture_to_start_seconds_falls_back_to_msec_when_source_fps_is_unknown() -> None:
    capture = _FakeCapture()

    start_frame = VisionRuntimeService._seek_capture_to_start_seconds(
        capture=capture,  # type: ignore[arg-type]
        start_seconds=12.5,
        source_fps=0.0,
        source_frame_count=0,
        fallback_fps=10.0,
    )

    assert start_frame == 125
    assert capture.calls == [(cv2.CAP_PROP_POS_MSEC, 12500.0)]
