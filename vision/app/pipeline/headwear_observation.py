# ============================================================
# File: vision/app/pipeline/headwear_observation.py
# Purpose:
# - Production DTOs between head detector, headwear classifier and incident engine.
# - Keeps person tracking as temporal binding only.
# - Ensures non-actionable head states stay diagnostic and cannot create violations.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.models.schemas import BBox, ComplianceSignal, HeadwearAssessment
from app.pipeline.head_detector import HeadObservation


@dataclass(frozen=True, slots=True)
class TrackEpisodeBinding:
    camera_id: str
    frame_index: int
    timestamp_seconds: float
    person_bbox: BBox | None
    head_bbox: BBox | None
    track_id: int | str | None
    episode_id: str | None
    status: str
    confidence: float | None
    quality: dict[str, Any] | None
    reason_codes: list[str] = field(default_factory=list)
    source_model: str = "person_tracking"
    is_actionable: bool = False
    observed_at: datetime | None = None

    @classmethod
    def from_track_observation(
        cls,
        *,
        observation: Any,
        timestamp_seconds: float,
        head_observation: HeadObservation | None = None,
    ) -> "TrackEpisodeBinding":
        episode_id = getattr(observation, "track_episode_id", None)
        track_id = getattr(observation, "track_id", getattr(observation, "source_track_id", None))
        person_bbox = getattr(observation, "bbox", None)
        head_bbox = head_observation.head_bbox if head_observation is not None else getattr(observation, "head_bbox", None)
        quality_score = getattr(observation, "quality_score", None)
        reason_codes = list(getattr(observation, "reason_codes", []) or [])
        if not episode_id:
            reason_codes.append("track_episode_missing")
        return cls(
            camera_id=str(getattr(observation, "camera_id", "unknown_camera")),
            frame_index=int(getattr(observation, "frame_index", 0)),
            timestamp_seconds=float(timestamp_seconds),
            person_bbox=person_bbox,
            head_bbox=head_bbox,
            track_id=track_id,
            episode_id=str(episode_id) if episode_id else None,
            status="bound" if episode_id else "unbound",
            confidence=float(getattr(observation, "tracking_confidence", 0.0) or 0.0),
            quality={"quality_score": quality_score},
            reason_codes=_unique(reason_codes),
            source_model="person_tracking_episode_registry",
            is_actionable=bool(episode_id and person_bbox is not None and getattr(person_bbox, "is_valid", False)),
            observed_at=getattr(observation, "observed_at", None),
        )


@dataclass(frozen=True, slots=True)
class HeadwearObservation:
    camera_id: str
    frame_index: int
    timestamp_seconds: float
    person_bbox: BBox | None
    head_bbox: BBox | None
    track_id: int | str | None
    episode_id: str | None
    status: str
    confidence: float | None
    quality: dict[str, Any] | None
    reason_codes: list[str] = field(default_factory=list)
    source_model: str = "headwear_classifier"
    is_actionable: bool = False
    signal: ComplianceSignal = ComplianceSignal.UNKNOWN
    raw_scores: dict[str, float] = field(default_factory=dict)
    classifier_input_crop_type: str = "head"
    observed_at: datetime | None = None

    @property
    def is_valid_for_incident_window(self) -> bool:
        return bool(self.is_actionable and self.classifier_input_crop_type == "head" and self.signal != ComplianceSignal.UNKNOWN)

    @property
    def is_violation(self) -> bool:
        return bool(self.is_valid_for_incident_window and self.signal == ComplianceSignal.VIOLATION)

    @property
    def is_compliant(self) -> bool:
        return bool(self.is_valid_for_incident_window and self.signal == ComplianceSignal.COMPLIANT)


@dataclass(frozen=True, slots=True)
class EventCandidate:
    camera_id: str
    frame_index: int
    timestamp_seconds: float
    person_bbox: BBox | None
    head_bbox: BBox | None
    track_id: int | str | None
    episode_id: str | None
    status: str
    confidence: float | None
    quality: dict[str, Any] | None
    reason_codes: list[str] = field(default_factory=list)
    source_model: str = "incident_engine"
    is_actionable: bool = False
    valid_count: int = 0
    violation_count: int = 0
    allowed_count: int = 0
    unknown_count: int = 0
    window_seconds: float = 0.0
    evidence_paths: list[str] = field(default_factory=list)


def build_headwear_observation_from_assessment(
    *,
    assessment: HeadwearAssessment,
    track_binding: TrackEpisodeBinding,
    head_observation: HeadObservation | None,
) -> HeadwearObservation:
    head_status = str(getattr(head_observation, "status", "head_observation_missing"))
    if hasattr(getattr(head_observation, "status", None), "value"):
        head_status = str(head_observation.status.value)  # type: ignore[union-attr]

    classifier_input_crop_type = "head" if bool(getattr(head_observation, "classifier_may_run", False)) else "none"
    reason_codes = list(getattr(assessment, "reason_codes", []) or [])
    if head_observation is not None:
        reason_codes.extend(list(getattr(head_observation, "reason_codes", []) or []))
    if classifier_input_crop_type != "head":
        reason_codes.append("classifier_not_scheduled_without_actionable_head")

    signal = assessment.signal if classifier_input_crop_type == "head" else ComplianceSignal.UNKNOWN
    is_actionable = bool(
        track_binding.is_actionable
        and head_observation is not None
        and head_observation.classifier_may_run
        and classifier_input_crop_type == "head"
        and signal != ComplianceSignal.UNKNOWN
    )
    return HeadwearObservation(
        camera_id=track_binding.camera_id,
        frame_index=track_binding.frame_index,
        timestamp_seconds=track_binding.timestamp_seconds,
        person_bbox=track_binding.person_bbox,
        head_bbox=head_observation.head_bbox if head_observation is not None else None,
        track_id=track_binding.track_id,
        episode_id=track_binding.episode_id,
        status=signal.value if hasattr(signal, "value") else str(signal),
        confidence=float(getattr(assessment, "confidence", 0.0) or 0.0),
        quality={"head_status": head_status, "track_binding_status": track_binding.status},
        reason_codes=_unique(reason_codes),
        source_model=str(getattr(assessment, "model_name", None) or "headwear_classifier"),
        is_actionable=is_actionable,
        signal=signal,
        raw_scores=dict(getattr(assessment, "raw_scores", {}) or {}),
        classifier_input_crop_type=classifier_input_crop_type,
        observed_at=track_binding.observed_at,
    )


def _unique(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
