# ============================================================
# File: vision/app/api/routes_health.py
# Purpose:
# - Basic health endpoints for the standalone vision service.
# ============================================================

from fastapi import APIRouter

router = APIRouter(prefix="", tags=["health"])


@router.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
