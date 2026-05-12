# ============================================================
# File: vision/app/pipeline/incident_evidence_limiter.py
# Purpose:
# - Controls how often evidence is saved for one incident case.
# - Keeps evidence storage policy outside FrameStore.
# - Prevents long offline videos from writing evidence on every frame.
# - Does not decide whether an incident exists.
# - Does not write files and does not mutate IncidentCase.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class _EvidenceCaseState:
    saved_count: int = 0
    last_saved_at: datetime | None = None
    best_confidence: float = 0.0
    best_quality_score: float = 0.0


class IncidentEvidenceLimiter:
    def __init__(self, *, max_per_case: int, min_interval_seconds: float) -> None:
        self._max_per_case = max(0, int(max_per_case))
        self._min_interval_seconds = max(0.0, float(min_interval_seconds))
        self._state_by_case_id: dict[str, _EvidenceCaseState] = {}

    def reset(self) -> None:
        self._state_by_case_id.clear()

    def should_save(
        self,
        *,
        case_id: str,
        observed_at: datetime,
        current_evidence_count: int,
    ) -> bool:
        if not case_id:
            return False

        if self._max_per_case <= 0:
            return False

        state = self._state_by_case_id.get(case_id)
        saved_count = max(
            int(current_evidence_count or 0),
            int(state.saved_count if state is not None else 0),
        )

        if saved_count >= self._max_per_case:
            return False

        if saved_count <= 0 or state is None or state.last_saved_at is None:
            return True

        elapsed_seconds = (observed_at - state.last_saved_at).total_seconds()
        return elapsed_seconds >= self._min_interval_seconds

    def register_saved(
        self,
        *,
        case_id: str,
        observed_at: datetime,
        confidence: float,
        quality_score: float,
        current_evidence_count: int,
    ) -> None:
        if not case_id:
            return

        state = self._state_by_case_id.setdefault(case_id, _EvidenceCaseState())
        state.saved_count = max(state.saved_count + 1, int(current_evidence_count or 0))
        state.last_saved_at = observed_at
        state.best_confidence = max(state.best_confidence, self._clip01(confidence))
        state.best_quality_score = max(state.best_quality_score, self._clip01(quality_score))

    @staticmethod
    def _clip01(value: object) -> float:
        try:
            number = float(value)
        except Exception:
            return 0.0

        return max(0.0, min(1.0, number))
