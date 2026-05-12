# ============================================================
# File: vision/app/api/routes_runtime.py
# Purpose:
# - HTTP routes for the offline track-centric vision service.
# - Live runtime endpoints are intentionally removed.
# - Exposes status, current track episodes, incidents and video export.
# ============================================================

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from app.models.schemas import (
    CommandResponse,
    IncidentCaseResponse,
    RuntimeStatusResponse,
    TrackEpisodeResponse,
)


router = APIRouter(prefix="/runtime", tags=["runtime"])


def _get_runtime_service(request: Request):
    service = getattr(request.app.state, "runtime_service", None)
    if service is None:
        raise HTTPException(status_code=500, detail="Runtime service is not initialized.")
    return service


@router.get("/status", response_model=RuntimeStatusResponse)
def runtime_status(request: Request) -> RuntimeStatusResponse:
    service = _get_runtime_service(request)
    return service.status()


@router.get("/incidents", response_model=list[IncidentCaseResponse])
def runtime_incidents(request: Request) -> list[IncidentCaseResponse]:
    service = _get_runtime_service(request)
    return service.incidents()


@router.get("/tracks", response_model=list[TrackEpisodeResponse])
def runtime_tracks(request: Request) -> list[TrackEpisodeResponse]:
    service = _get_runtime_service(request)
    return service.tracks()


@router.get("/track-episodes", response_model=list[TrackEpisodeResponse])
def runtime_track_episodes(request: Request) -> list[TrackEpisodeResponse]:
    service = _get_runtime_service(request)
    return service.tracks()


@router.get("/day-people", response_model=list[TrackEpisodeResponse], deprecated=True)
def runtime_day_people_compat(request: Request) -> list[TrackEpisodeResponse]:
    service = _get_runtime_service(request)
    return service.day_people()


@router.post("/export-video", response_model=CommandResponse)
def export_processed_video(
    request: Request,
    source_url: str | None = Query(default=None),
    output_path: str | None = Query(default=None),
    max_seconds: float | None = Query(default=None, ge=0),
) -> CommandResponse:
    service = _get_runtime_service(request)
    ok, message = service.export_processed_video(
        source_url=source_url,
        output_path=output_path,
        max_seconds=max_seconds,
    )
    return CommandResponse(ok=ok, message=message)
