# ============================================================
# File: vision/app/clients/backend_client.py
# Purpose:
# - Best-effort HTTP client for sending runtime data to backend.
# - Adds:
#   1) structured logging
#   2) small retry policy
#   3) duplicate payload suppression per case
# - Never raises transport exceptions into the runtime loop.
# ============================================================

from __future__ import annotations

import json
import logging
import threading
import time
from hashlib import sha1
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from app.config import Settings


logger = logging.getLogger(__name__)


class BackendClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base_url = settings.backend_base_url.rstrip("/")
        self._timeout_sec = max(0.1, float(settings.backend_timeout_sec))
        self._enabled = bool(settings.backend_enabled and self._base_url)

        self._max_retries = max(0, int(settings.backend_max_retries))
        self._retry_delay_sec = max(0.0, float(settings.backend_retry_delay_sec))
        self._dedup_enabled = bool(settings.backend_dedup_enabled)

        self._lock = threading.Lock()
        self._last_payload_hash_by_key: dict[str, str] = {}
        self._last_success_at_by_key: dict[str, float] = {}

    def is_enabled(self) -> bool:
        return self._enabled

    def post_json(self, path: str, payload: dict[str, Any]) -> bool:
        if not self._enabled:
            return False

        url = self._build_url(path)
        payload_text = self._serialize_payload(payload)
        if payload_text is None:
            logger.warning("Backend payload serialization failed. path=%s", path)
            return False

        dedup_key = self._build_dedup_key(url=url, payload=payload)
        payload_hash = sha1(payload_text.encode("utf-8")).hexdigest()

        if self._dedup_enabled and self._is_duplicate_payload(dedup_key=dedup_key, payload_hash=payload_hash):
            logger.debug("Skipped duplicate backend payload. key=%s", dedup_key)
            return True

        data = payload_text.encode("utf-8")

        last_error: str | None = None
        attempts = max(1, self._max_retries + 1)

        for attempt in range(1, attempts + 1):
            request = Request(
                url=url,
                data=data,
                headers={
                    "Content-Type": "application/json; charset=utf-8",
                    "Accept": "application/json",
                },
                method="POST",
            )

            try:
                with urlopen(request, timeout=self._timeout_sec) as response:
                    status_code = int(getattr(response, "status", 200))

                if 200 <= status_code < 300:
                    self._mark_payload_sent(dedup_key=dedup_key, payload_hash=payload_hash)
                    logger.debug(
                        "Backend sync succeeded. path=%s attempt=%s status=%s",
                        path,
                        attempt,
                        status_code,
                    )
                    return True

                last_error = f"unexpected status {status_code}"
                logger.warning(
                    "Backend sync failed with non-2xx status. path=%s attempt=%s status=%s",
                    path,
                    attempt,
                    status_code,
                )

            except HTTPError as error:
                last_error = f"HTTPError {error.code}: {error.reason}"
                logger.warning(
                    "Backend HTTP error. path=%s attempt=%s code=%s reason=%s",
                    path,
                    attempt,
                    error.code,
                    error.reason,
                )
            except URLError as error:
                last_error = f"URLError: {error}"
                logger.warning(
                    "Backend URL error. path=%s attempt=%s error=%s",
                    path,
                    attempt,
                    error,
                )
            except TimeoutError as error:
                last_error = f"TimeoutError: {error}"
                logger.warning(
                    "Backend timeout. path=%s attempt=%s error=%s",
                    path,
                    attempt,
                    error,
                )
            except OSError as error:
                last_error = f"OSError: {error}"
                logger.warning(
                    "Backend OS error. path=%s attempt=%s error=%s",
                    path,
                    attempt,
                    error,
                )
            except Exception as error:
                last_error = f"{type(error).__name__}: {error}"
                logger.exception(
                    "Unexpected backend sync failure. path=%s attempt=%s",
                    path,
                    attempt,
                )

            if attempt < attempts:
                time.sleep(self._retry_delay_sec)

        logger.error(
            "Backend sync failed after retries. path=%s attempts=%s error=%s",
            path,
            attempts,
            last_error,
        )
        return False

    def _build_url(self, path: str) -> str:
        normalized_path = path if path.startswith("/") else f"/{path}"
        return urljoin(f"{self._base_url}/", normalized_path.lstrip("/"))

    def _serialize_payload(self, payload: dict[str, Any]) -> str | None:
        try:
            return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        except Exception:
            return None

    def _build_dedup_key(self, *, url: str, payload: dict[str, Any]) -> str:
        case_id = payload.get("caseId")
        if isinstance(case_id, str) and case_id.strip():
            return f"{url}::{case_id}"
        return url

    def _is_duplicate_payload(self, *, dedup_key: str, payload_hash: str) -> bool:
        with self._lock:
            previous_hash = self._last_payload_hash_by_key.get(dedup_key)
            return previous_hash == payload_hash

    def _mark_payload_sent(self, *, dedup_key: str, payload_hash: str) -> None:
        with self._lock:
            self._last_payload_hash_by_key[dedup_key] = payload_hash
            self._last_success_at_by_key[dedup_key] = time.monotonic()

