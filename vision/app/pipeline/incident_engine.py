# ============================================================
# File: vision/app/pipeline/incident_engine.py
# Purpose:
# - Track-centric incident engine.
# - Aggregates per-frame headwear signals by track_episode_id.
# - Uses a time-based signal window, not a fixed tiny frame window.
# - Never depends on person_id/day_person_id/ReID/identity decisions.
# - Does not open a confirmed incident from a single frame.
# - UNKNOWN / not-evaluable frames never increase violation evidence.
# ============================================================

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Deque
from uuid import uuid4

from app.config import Settings
from app.models.schemas import ComplianceSignal, HeadwearAssessment, IncidentCase, IncidentState
from app.pipeline.human_observation import TrackObservation


class IncidentSubjectType(str, Enum):
    TRACK_EPISODE = "track_episode_id"
    UNKNOWN = "unknown"


@dataclass(slots=True)
class IncidentObservationSignal:
    observed_at: datetime
    track_episode_id: str | None
    source_track_id: int | None
    headwear_status: ComplianceSignal
    confidence: float
    quality_score: float
    visibility_state: str
    usable_for_incident: bool
    reason_codes: list[str]


@dataclass(slots=True)
class IncidentUpdateResult:
    subject_key: str | None
    subject_type: IncidentSubjectType
    case: IncidentCase | None
    changed_cases: list[IncidentCase]
    opened: bool
    buffered: bool
    reason_codes: list[str]


@dataclass(slots=True)
class _Observation:
    observed_at: datetime
    signal: ComplianceSignal
    confidence: float
    quality_score: float
    frame_path: str | None
    camera_id: str
    track_episode_id: str
    source_track_id: int | None
    visibility_state: str
    usable_for_incident: bool
    reason_codes: tuple[str, ...] = ()


@dataclass(slots=True)
class _WindowStats:
    total_count: int
    valid_count: int
    violation_count: int
    compliant_count: int
    unknown_count: int
    violation_ratio: float
    compliant_ratio: float
    first_violation_at: datetime | None
    last_violation_at: datetime | None
    last_compliant_at: datetime | None
    best_violation_confidence: float
    best_violation_frame_path: str | None
    violation_duration_sec: float


class _SignalWindow:
    def __init__(self) -> None:
        self._values: Deque[_Observation] = deque()

    def append(self, observation: _Observation) -> None:
        self._values.append(observation)

    def trim(self, *, reference_time: datetime, window_seconds: float, max_count: int) -> None:
        safe_window = max(0.1, float(window_seconds))
        while self._values:
            age_sec = max(0.0, (reference_time - self._values[0].observed_at).total_seconds())
            if age_sec <= safe_window:
                break
            self._values.popleft()

        safe_max_count = max(1, int(max_count))
        while len(self._values) > safe_max_count:
            self._values.popleft()

    def observations(self) -> list[_Observation]:
        return list(self._values)

    def stats(self) -> _WindowStats:
        total_count = len(self._values)
        valid_count = 0
        violation_count = 0
        compliant_count = 0
        unknown_count = 0

        first_violation_at: datetime | None = None
        last_violation_at: datetime | None = None
        last_compliant_at: datetime | None = None
        best_violation_confidence = 0.0
        best_violation_frame_path: str | None = None

        for item in self._values:
            if not item.usable_for_incident:
                unknown_count += 1
                continue
            if item.signal == ComplianceSignal.UNKNOWN:
                unknown_count += 1
                continue

            valid_count += 1

            if item.signal == ComplianceSignal.VIOLATION:
                violation_count += 1
                if first_violation_at is None:
                    first_violation_at = item.observed_at
                last_violation_at = item.observed_at
                if item.confidence >= best_violation_confidence:
                    best_violation_confidence = item.confidence
                    best_violation_frame_path = item.frame_path
            elif item.signal == ComplianceSignal.COMPLIANT:
                compliant_count += 1
                last_compliant_at = item.observed_at

        violation_ratio = (violation_count / valid_count) if valid_count > 0 else 0.0
        compliant_ratio = (compliant_count / valid_count) if valid_count > 0 else 0.0
        violation_duration_sec = 0.0
        if first_violation_at is not None and last_violation_at is not None:
            violation_duration_sec = max(0.0, (last_violation_at - first_violation_at).total_seconds())

        return _WindowStats(
            total_count=total_count,
            valid_count=valid_count,
            violation_count=violation_count,
            compliant_count=compliant_count,
            unknown_count=unknown_count,
            violation_ratio=violation_ratio,
            compliant_ratio=compliant_ratio,
            first_violation_at=first_violation_at,
            last_violation_at=last_violation_at,
            last_compliant_at=last_compliant_at,
            best_violation_confidence=best_violation_confidence,
            best_violation_frame_path=best_violation_frame_path,
            violation_duration_sec=violation_duration_sec,
        )


class IncidentEngine:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._signal_windows: dict[str, _SignalWindow] = {}
        self._cases_by_id: dict[str, IncidentCase] = {}
        self._active_case_by_episode: dict[str, str] = {}
        self._last_activity_by_episode: dict[str, datetime] = {}
        self._changed_case_ids: set[str] = set()
        self._last_violation_observed_at_by_case: dict[str, datetime | None] = {}
        self._date_key = self._day_key(datetime.utcnow())

    def snapshot(self) -> list[IncidentCase]:
        return sorted(self._cases_by_id.values(), key=lambda item: item.opened_at)

    def drain_changed_cases(self) -> list[IncidentCase]:
        changed_ids = list(self._changed_case_ids)
        self._changed_case_ids.clear()
        result: list[IncidentCase] = []
        for case_id in changed_ids:
            case = self._cases_by_id.get(case_id)
            if case is not None:
                result.append(IncidentCase(**case.model_dump()))
        result.sort(key=lambda item: item.opened_at)
        return result

    def get_active_cases_count(self) -> int:
        return sum(1 for case in self._cases_by_id.values() if case.is_active)

    def reset_if_needed(self, reference_time: datetime) -> list[IncidentCase]:
        current_key = self._day_key(reference_time)
        if current_key == self._date_key:
            return []
        for case in self._cases_by_id.values():
            if case.state != IncidentState.CLOSED:
                self._close_case(case=case, closed_at=reference_time)
        changed = self.drain_changed_cases()
        self._signal_windows.clear()
        self._cases_by_id.clear()
        self._active_case_by_episode.clear()
        self._last_activity_by_episode.clear()
        self._last_violation_observed_at_by_case.clear()
        self._date_key = current_key
        return changed

    def process_headwear_assessment(
        self,
        *,
        observation: TrackObservation,
        headwear_assessment: HeadwearAssessment,
        frame_path: str | None = None,
        identity_decision: object | None = None,
    ) -> IncidentUpdateResult:
        del identity_decision

        track_episode_id = str(observation.track_episode_id or "").strip()
        if not track_episode_id:
            return IncidentUpdateResult(
                subject_key=None,
                subject_type=IncidentSubjectType.UNKNOWN,
                case=None,
                changed_cases=[],
                opened=False,
                buffered=False,
                reason_codes=["track_episode_missing"],
            )

        self.reset_if_needed(observation.observed_at)

        usable = bool(
            observation.is_usable_for_incident
            and observation.headwear_context_usable
            and not observation.interaction_risk
            and headwear_assessment.signal != ComplianceSignal.UNKNOWN
        )

        signal = _Observation(
            observed_at=observation.observed_at,
            signal=headwear_assessment.signal,
            confidence=self._clip01(headwear_assessment.confidence),
            quality_score=self._clip01(observation.quality_score),
            frame_path=frame_path,
            camera_id=observation.camera_id,
            track_episode_id=track_episode_id,
            source_track_id=observation.source_track_id,
            visibility_state=observation.visibility_state,
            usable_for_incident=usable,
            reason_codes=tuple(
                self._unique_reason_codes(
                    list(observation.reason_codes)
                    + list(headwear_assessment.reason_codes)
                    + [headwear_assessment.reason]
                )
            ),
        )

        window = self._signal_windows.setdefault(track_episode_id, _SignalWindow())
        window.append(signal)
        window.trim(
            reference_time=observation.observed_at,
            window_seconds=self._window_seconds(),
            max_count=self._window_size(),
        )
        self._last_activity_by_episode[track_episode_id] = observation.observed_at
        stats = window.stats()

        changed_before = set(self._changed_case_ids)
        case = self._get_active_case(track_episode_id)
        opened = False
        buffered = True
        reason_codes = ["signal_buffered_by_track_episode"]

        if case is None and signal.signal == ComplianceSignal.VIOLATION and usable:
            case = self._create_case(
                track_episode_id=track_episode_id,
                source_track_id=observation.source_track_id,
                camera_id=observation.camera_id,
                opened_at=observation.observed_at,
                reason_codes=["candidate_created_by_track_episode_violation"],
            )
            reason_codes.append("candidate_case_created")

        if case is not None:
            case.violation_duration_sec = max(case.violation_duration_sec, stats.violation_duration_sec)
            case.max_confidence = max(case.max_confidence, stats.best_violation_confidence)
            case.reason_codes = self._unique_reason_codes(list(case.reason_codes) + list(signal.reason_codes))
            self._last_violation_observed_at_by_case[case.case_id] = stats.last_violation_at

            if signal.signal == ComplianceSignal.VIOLATION and usable:
                case.last_confirmed_at = max(case.last_confirmed_at, observation.observed_at)

            if case.state == IncidentState.CANDIDATE and self._should_open(stats):
                case.state = IncidentState.OPEN
                opened = True
                buffered = False
                reason_codes.append("incident_opened_after_stable_track_violation")
                self._mark_case_changed(case.case_id)
            elif case.state == IncidentState.OPEN and self._should_cooldown(stats):
                case.state = IncidentState.COOLDOWN
                reason_codes.append("incident_cooldown_after_compliant_signals")
                self._mark_case_changed(case.case_id)
            elif case.state == IncidentState.COOLDOWN and self._should_reopen(stats):
                case.state = IncidentState.OPEN
                reason_codes.append("incident_reopened_after_new_violation")
                self._mark_case_changed(case.case_id)
            elif case.state == IncidentState.OPEN and signal.signal == ComplianceSignal.VIOLATION and usable:
                self._mark_case_changed(case.case_id)
            elif case.state == IncidentState.CANDIDATE:
                # Candidate remains internal until the time window proves a stable violation.
                pass

        changed_cases = [
            self._cases_by_id[item]
            for item in self._changed_case_ids - changed_before
            if item in self._cases_by_id
        ]

        return IncidentUpdateResult(
            subject_key=track_episode_id,
            subject_type=IncidentSubjectType.TRACK_EPISODE,
            case=case,
            changed_cases=changed_cases,
            opened=opened,
            buffered=buffered,
            reason_codes=self._unique_reason_codes(reason_codes),
        )

    def promote_track_buffer_to_person(self, *args: object, **kwargs: object) -> IncidentUpdateResult:
        return IncidentUpdateResult(
            subject_key=None,
            subject_type=IncidentSubjectType.UNKNOWN,
            case=None,
            changed_cases=[],
            opened=False,
            buffered=False,
            reason_codes=["person_identity_promotion_disabled"],
        )

    def tick(self, reference_time: datetime) -> list[IncidentCase]:
        self._cleanup_stale_windows(reference_time)
        changed_before = set(self._changed_case_ids)
        for episode_id, case_id in list(self._active_case_by_episode.items()):
            case = self._cases_by_id.get(case_id)
            if case is None or case.state == IncidentState.CLOSED:
                self._active_case_by_episode.pop(episode_id, None)
                continue
            last_activity = self._last_activity_by_episode.get(episode_id, case.last_confirmed_at)
            inactive_sec = max(0.0, (reference_time - last_activity).total_seconds())
            if inactive_sec >= self._close_seconds():
                self._close_case(
                    case=case,
                    closed_at=reference_time,
                    reason_codes=["incident_closed_after_inactivity"],
                )
            elif case.state == IncidentState.OPEN and inactive_sec >= self._cooldown_seconds():
                case.state = IncidentState.COOLDOWN
                case.reason_codes = self._unique_reason_codes([*case.reason_codes, "incident_cooldown_after_inactivity"])
                self._mark_case_changed(case.case_id)
        return [self._cases_by_id[item] for item in self._changed_case_ids - changed_before if item in self._cases_by_id]

    def finish_video(self, reference_time: datetime) -> None:
        """Close all active cases at EOF without inventing new evidence.

        Offline video processing has a hard boundary: once the file ends, an
        active CANDIDATE/OPEN/COOLDOWN case must become final so API clients
        and reports do not keep stale active incidents forever. This method
        marks cases as changed; callers should drain changed cases afterwards.
        """

        self._cleanup_stale_windows(reference_time)
        for episode_id, case_id in list(self._active_case_by_episode.items()):
            case = self._cases_by_id.get(case_id)
            if case is None or case.state == IncidentState.CLOSED:
                self._active_case_by_episode.pop(episode_id, None)
                continue

            self._close_case(
                case=case,
                closed_at=reference_time,
                reason_codes=["video_finished", "incident_closed_at_video_eof"],
                update_last_confirmed=False,
            )

        self._active_case_by_episode.clear()
        self._signal_windows.clear()
        self._last_activity_by_episode.clear()

    def close_episode(self, *, track_episode_id: str, closed_at: datetime) -> None:
        case = self._get_active_case(track_episode_id)
        if case is None:
            return
        self._close_case(case=case, closed_at=closed_at)

    def _create_case(
        self,
        *,
        track_episode_id: str,
        source_track_id: int | None,
        camera_id: str,
        opened_at: datetime,
        reason_codes: list[str],
    ) -> IncidentCase:
        case = IncidentCase(
            case_id=f"incident_{uuid4().hex[:16]}",
            track_episode_id=track_episode_id,
            source_track_id=source_track_id,
            camera_id=camera_id,
            opened_at=opened_at,
            last_confirmed_at=opened_at,
            state=IncidentState.CANDIDATE,
            reason_codes=self._unique_reason_codes(reason_codes),
        )
        self._cases_by_id[case.case_id] = case
        self._active_case_by_episode[track_episode_id] = case.case_id
        self._last_activity_by_episode[track_episode_id] = opened_at
        self._last_violation_observed_at_by_case[case.case_id] = opened_at
        return case

    def _get_active_case(self, track_episode_id: str) -> IncidentCase | None:
        case_id = self._active_case_by_episode.get(track_episode_id)
        if not case_id:
            return None
        case = self._cases_by_id.get(case_id)
        if case is None or case.state == IncidentState.CLOSED:
            return None
        return case

    def _close_case(
        self,
        *,
        case: IncidentCase,
        closed_at: datetime,
        reason_codes: list[str] | None = None,
        update_last_confirmed: bool = True,
    ) -> None:
        if case.state == IncidentState.CLOSED:
            return
        case.state = IncidentState.CLOSED
        case.closed_at = closed_at
        if update_last_confirmed:
            case.last_confirmed_at = max(case.last_confirmed_at, closed_at)
        if reason_codes:
            case.reason_codes = self._unique_reason_codes([*case.reason_codes, *reason_codes])
        self._active_case_by_episode.pop(case.track_episode_id, None)
        self._mark_case_changed(case.case_id)

    def _should_open(self, stats: _WindowStats) -> bool:
        if stats.valid_count < self._open_min_valid():
            return False
        if stats.violation_ratio < self._open_violation_ratio():
            return False
        if stats.violation_duration_sec < self._open_min_duration_sec():
            return False
        return True

    def _should_cooldown(self, stats: _WindowStats) -> bool:
        if stats.valid_count <= 0:
            return False
        return stats.compliant_ratio >= 0.70 and stats.compliant_count >= max(2, self._open_min_valid() // 2)

    def _should_reopen(self, stats: _WindowStats) -> bool:
        if stats.valid_count < max(2, self._open_min_valid() // 2):
            return False
        return stats.violation_ratio >= self._open_violation_ratio()

    def _cleanup_stale_windows(self, reference_time: datetime) -> None:
        ttl = self._window_ttl_seconds()
        for key, window in list(self._signal_windows.items()):
            observations = window.observations()
            if not observations:
                self._signal_windows.pop(key, None)
                continue
            last_time = observations[-1].observed_at
            if (reference_time - last_time).total_seconds() > ttl:
                self._signal_windows.pop(key, None)

    def _mark_case_changed(self, case_id: str) -> None:
        self._changed_case_ids.add(case_id)

    def _window_size(self) -> int:
        configured = self._safe_int(getattr(self._settings, "incident_window_size", 30), 30)
        fps = self._safe_float(getattr(self._settings, "processed_video_analysis_fps", 5.0), 5.0)
        needed_for_duration = int(max(1.0, fps) * max(self._window_seconds(), self._open_min_duration_sec())) + 2
        return max(1, configured, needed_for_duration)

    def _window_seconds(self) -> float:
        configured = self._safe_float(getattr(self._settings, "incident_window_seconds", 7.0), 7.0)
        return max(0.5, configured, self._open_min_duration_sec() + 1.0)

    def _open_min_valid(self) -> int:
        return max(1, self._safe_int(getattr(self._settings, "incident_open_min_valid", 6), 6))

    def _open_violation_ratio(self) -> float:
        return self._clip01(getattr(self._settings, "incident_open_violation_ratio", 0.70))

    def _open_min_duration_sec(self) -> float:
        return max(
            0.0,
            self._safe_float(
                getattr(
                    self._settings,
                    "incident_open_min_duration_sec",
                    getattr(self._settings, "incident_min_violation_duration_sec", 5.0),
                ),
                5.0,
            ),
        )

    def _cooldown_seconds(self) -> float:
        return max(0.0, self._safe_float(getattr(self._settings, "incident_cooldown_seconds", 8.0), 8.0))

    def _close_seconds(self) -> float:
        return max(0.0, self._safe_float(getattr(self._settings, "incident_close_seconds", 20.0), 20.0))

    def _window_ttl_seconds(self) -> float:
        return max(1.0, self._safe_float(getattr(self._settings, "incident_signal_window_ttl_seconds", 120.0), 120.0))

    @staticmethod
    def _day_key(value: datetime) -> str:
        return value.date().isoformat()

    @staticmethod
    def _safe_int(value: object, default: int) -> int:
        try:
            return int(value)
        except Exception:
            return int(default)

    @staticmethod
    def _safe_float(value: object, default: float) -> float:
        try:
            return float(value)
        except Exception:
            return float(default)

    @staticmethod
    def _clip01(value: object) -> float:
        try:
            number = float(value)
        except Exception:
            number = 0.0
        return max(0.0, min(1.0, number))

    @staticmethod
    def _unique_reason_codes(values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for raw in values:
            value = str(raw or "").strip()
            if not value or value in seen:
                continue
            seen.add(value)
            result.append(value)
        return result
