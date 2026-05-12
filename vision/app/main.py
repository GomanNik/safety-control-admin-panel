# ============================================================
# File: vision/app/main.py
# Purpose:
# - FastAPI entrypoint for the standalone vision runtime service.
# - Fails fast on invalid app/server configuration.
# ============================================================

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes_health import router as health_router
from app.api.routes_runtime import router as runtime_router
from app.config import get_settings
from app.pipeline.runtime import VisionRuntimeService


def _configure_logging(log_level: str) -> None:
    normalized = log_level.strip().upper()
    logging.basicConfig(
        level=getattr(logging, normalized, logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


settings = get_settings()
settings.validate_app_config_or_raise()
settings.validate_runtime_static_config_or_raise()
_configure_logging(settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    runtime_service = VisionRuntimeService(settings)
    app.state.runtime_service = runtime_service
    try:
        yield
    finally:
        runtime_service.shutdown()


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(runtime_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.app_reload,
    )