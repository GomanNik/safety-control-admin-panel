# ============================================================
# File: vision/app/pipeline/head_person_association.py
# Purpose:
# - Associates real head detections with current person tracks/episodes.
# - Keeps tracking as temporal binding only and keeps headwear decisions
#   dependent on actionable head observations.
# - Handles no-head, ambiguous-head and border-cropped cases conservatively.
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Sequence

from app.models.schemas import BBox
from app.pipeline.head_detector import (
    HeadDetectionCandidate,
    HeadDetectorScope,
    HeadObservation,
    HeadObservationStatus,
)
from app.pipeline.human_observation import TrackObservation


class HeadPersonAssociationStatus(str, Enum):
    ASSOCIATED = "associated"
    NOT_DETECTED = "head_not_detected"
    AMBIGUOUS = "ambiguous_head"
    REJECTED = "rejected"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class HeadPersonAssociationConfig:
    min_score: float = 0.20
    min_head_inside_person_ratio: float = 0.50
    min_center_inside_bonus: float = 0.20
    top_zone_bonus: float = 0.15
    confidence_weight: float = 0.35
    geometry_weight: float = 0.65
    ambiguity_score_delta: float = 0.08
    reject_border_cropped: bool = True
    min_head_width_px: int = 8
    min_head_height_px: int = 8


@dataclass(frozen=True, slots=True)
class HeadPersonAssociation:
    observation: HeadObservation
    candidate: HeadDetectionCandidate | None
    status: HeadPersonAssociationStatus
    score: float
    candidate_index: int | None
    reason_codes: list[str] = field(default_factory=list)

    @property
    def is_actionable(self) -> bool:
        return bool(self.observation.classifier_may_run)


@dataclass(frozen=True, slots=True)
class CandidateScore:
    candidate: HeadDetectionCandidate
    candidate_index: int
    score: float
    reason_codes: list[str]


class HeadPersonAssociator:
    """Associates head candidates with person observations.

    The associator never creates a violation and never calls a classifier. Its
    only job is to produce HeadObservation objects that say whether a clean,
    real head bbox is available for the next stage.
    """

    def __init__(self, config: HeadPersonAssociationConfig | None = None) -> None:
        self._config = config or HeadPersonAssociationConfig()

    def associate_for_observation(
        self,
        *,
        camera_id: str,
        frame_index: int,
        timestamp_seconds: float,
        observation: TrackObservation,
        candidates: Sequence[HeadDetectionCandidate],
        frame_shape: tuple[int, ...] | Sequence[int],
        source_model: str,
        scope: HeadDetectorScope = HeadDetectorScope.PERSON_ROI,
    ) -> HeadPersonAssociation:
        frame_height, frame_width = _frame_size(frame_shape)
        person_bbox = getattr(observation, "bbox", None)
        track_id = getattr(observation, "track_id", getattr(observation, "source_track_id", None))
        episode_id = getattr(observation, "track_episode_id", None)
        observed_at = getattr(observation, "observed_at", None)

        if person_bbox is None or not person_bbox.is_valid:
            head_observation = self._make_observation(
                camera_id=camera_id,
                frame_index=frame_index,
                timestamp_seconds=timestamp_seconds,
                person_bbox=person_bbox,
                head_bbox=None,
                track_id=track_id,
                episode_id=episode_id,
                observed_at=observed_at,
                status=HeadObservationStatus.HEAD_UNUSABLE,
                confidence=0.0,
                quality={"head_detected": False},
                reason_codes=["person_bbox_invalid", "classifier_not_scheduled_without_person_binding"],
                source_model=source_model,
                is_actionable=False,
                scope=scope,
                candidate_count=len(candidates),
                selected_candidate_index=None,
                association_score=0.0,
            )
            return HeadPersonAssociation(
                observation=head_observation,
                candidate=None,
                status=HeadPersonAssociationStatus.REJECTED,
                score=0.0,
                candidate_index=None,
                reason_codes=list(head_observation.reason_codes),
            )

        scored = self.score_candidates_for_person(
            person_bbox=person_bbox,
            candidates=candidates,
            frame_shape=frame_shape,
        )
        if not scored:
            head_observation = HeadObservation.not_detected(
                camera_id=camera_id,
                frame_index=frame_index,
                timestamp_seconds=timestamp_seconds,
                person_bbox=person_bbox,
                track_id=track_id,
                episode_id=str(episode_id) if episode_id else None,
                observed_at=observed_at,
                source_model=source_model,
                reason="head_not_detected_for_person",
                detection_scope=scope,
                candidate_count=len(candidates),
            )
            return HeadPersonAssociation(
                observation=head_observation,
                candidate=None,
                status=HeadPersonAssociationStatus.NOT_DETECTED,
                score=0.0,
                candidate_index=None,
                reason_codes=list(head_observation.reason_codes),
            )

        best = scored[0]
        second = scored[1] if len(scored) > 1 else None
        if best.score < self._config.min_score:
            head_observation = HeadObservation.not_detected(
                camera_id=camera_id,
                frame_index=frame_index,
                timestamp_seconds=timestamp_seconds,
                person_bbox=person_bbox,
                track_id=track_id,
                episode_id=str(episode_id) if episode_id else None,
                observed_at=observed_at,
                source_model=source_model,
                reason="head_candidate_score_too_low",
                detection_scope=scope,
                candidate_count=len(candidates),
            )
            return HeadPersonAssociation(
                observation=head_observation,
                candidate=best.candidate,
                status=HeadPersonAssociationStatus.REJECTED,
                score=float(best.score),
                candidate_index=best.candidate_index,
                reason_codes=["head_candidate_score_too_low"],
            )

        if second is not None and abs(best.score - second.score) <= self._config.ambiguity_score_delta:
            head_observation = self._make_observation(
                camera_id=camera_id,
                frame_index=frame_index,
                timestamp_seconds=timestamp_seconds,
                person_bbox=person_bbox,
                head_bbox=None,
                track_id=track_id,
                episode_id=episode_id,
                observed_at=observed_at,
                status=HeadObservationStatus.AMBIGUOUS_HEAD,
                confidence=0.0,
                quality={
                    "head_detected": True,
                    "ambiguous": True,
                    "best_score": float(best.score),
                    "second_score": float(second.score),
                },
                reason_codes=["multiple_heads_match_person", "classifier_not_scheduled_ambiguous_head"],
                source_model=source_model,
                is_actionable=False,
                scope=scope,
                candidate_count=len(candidates),
                selected_candidate_index=None,
                association_score=float(best.score),
            )
            return HeadPersonAssociation(
                observation=head_observation,
                candidate=None,
                status=HeadPersonAssociationStatus.AMBIGUOUS,
                score=float(best.score),
                candidate_index=None,
                reason_codes=list(head_observation.reason_codes),
            )

        selected_bbox = best.candidate.head_bbox.clamp(frame_width=frame_width, frame_height=frame_height)
        status, quality_reason_codes = self._quality_status_for_selected_head(
            head_bbox=selected_bbox,
            person_bbox=person_bbox,
            frame_width=frame_width,
            frame_height=frame_height,
        )
        is_actionable = status == HeadObservationStatus.ACTIONABLE
        reason_codes = _unique(best.reason_codes + quality_reason_codes)
        if not is_actionable:
            reason_codes.append("classifier_not_scheduled_head_not_actionable")

        head_observation = self._make_observation(
            camera_id=camera_id,
            frame_index=frame_index,
            timestamp_seconds=timestamp_seconds,
            person_bbox=person_bbox,
            head_bbox=selected_bbox if selected_bbox.is_valid else None,
            track_id=track_id,
            episode_id=episode_id,
            observed_at=observed_at,
            status=status,
            confidence=best.candidate.confidence,
            quality={
                "head_detected": bool(selected_bbox.is_valid),
                "head_bbox_area": int(selected_bbox.area),
                "association_score": float(best.score),
                "inside_person_ratio": _inside_ratio(selected_bbox, person_bbox),
            },
            reason_codes=reason_codes,
            source_model=source_model,
            is_actionable=is_actionable,
            scope=scope,
            candidate_count=len(candidates),
            selected_candidate_index=best.candidate_index,
            association_score=float(best.score),
        )
        return HeadPersonAssociation(
            observation=head_observation,
            candidate=best.candidate,
            status=HeadPersonAssociationStatus.ASSOCIATED if is_actionable else HeadPersonAssociationStatus.REJECTED,
            score=float(best.score),
            candidate_index=best.candidate_index,
            reason_codes=list(head_observation.reason_codes),
        )

    def associate_frame(
        self,
        *,
        camera_id: str,
        frame_index: int,
        timestamp_seconds: float,
        observations: Sequence[TrackObservation],
        candidates: Sequence[HeadDetectionCandidate],
        frame_shape: tuple[int, ...] | Sequence[int],
        source_model: str,
        scope: HeadDetectorScope = HeadDetectorScope.PERSON_ROI,
    ) -> list[HeadPersonAssociation]:
        return [
            self.associate_for_observation(
                camera_id=camera_id,
                frame_index=frame_index,
                timestamp_seconds=timestamp_seconds,
                observation=observation,
                candidates=candidates,
                frame_shape=frame_shape,
                source_model=source_model,
                scope=scope,
            )
            for observation in observations
        ]

    def score_candidates_for_person(
        self,
        *,
        person_bbox: BBox,
        candidates: Sequence[HeadDetectionCandidate],
        frame_shape: tuple[int, ...] | Sequence[int],
    ) -> list[CandidateScore]:
        frame_height, frame_width = _frame_size(frame_shape)
        result: list[CandidateScore] = []
        for index, candidate in enumerate(candidates):
            if candidate is None or not candidate.is_valid:
                continue
            head_bbox = candidate.head_bbox.clamp(frame_width=frame_width, frame_height=frame_height)
            if not head_bbox.is_valid:
                continue

            inside_ratio = _inside_ratio(head_bbox, person_bbox)
            if inside_ratio < self._config.min_head_inside_person_ratio:
                continue

            center_inside = _center_inside(head_bbox, person_bbox)
            top_score = _top_zone_score(head_bbox=head_bbox, person_bbox=person_bbox)
            confidence = _clip01(candidate.confidence)

            geometry_score = min(1.0, inside_ratio + (self._config.min_center_inside_bonus if center_inside else 0.0) + top_score)
            score = (
                self._config.geometry_weight * geometry_score
                + self._config.confidence_weight * confidence
            )
            reason_codes: list[str] = []
            if center_inside:
                reason_codes.append("head_center_inside_person_bbox")
            if top_score > 0:
                reason_codes.append("head_in_person_upper_zone")

            result.append(
                CandidateScore(
                    candidate=HeadDetectionCandidate(
                        head_bbox=head_bbox,
                        confidence=confidence,
                        class_id=candidate.class_id,
                        class_name=candidate.class_name,
                        source_model=candidate.source_model,
                        reason_codes=list(candidate.reason_codes),
                    ),
                    candidate_index=index,
                    score=max(0.0, min(1.0, float(score))),
                    reason_codes=_unique(reason_codes + list(candidate.reason_codes)),
                )
            )

        result.sort(key=lambda item: item.score, reverse=True)
        return result

    def _quality_status_for_selected_head(
        self,
        *,
        head_bbox: BBox,
        person_bbox: BBox,
        frame_width: int,
        frame_height: int,
    ) -> tuple[HeadObservationStatus, list[str]]:
        if not head_bbox.is_valid:
            return HeadObservationStatus.HEAD_UNUSABLE, ["head_bbox_invalid"]
        if head_bbox.width < int(self._config.min_head_width_px) or head_bbox.height < int(self._config.min_head_height_px):
            return HeadObservationStatus.HEAD_UNUSABLE, ["head_bbox_too_small"]

        touches_border = (
            int(head_bbox.x1) <= 0
            or int(head_bbox.y1) <= 0
            or int(head_bbox.x2) >= int(frame_width)
            or int(head_bbox.y2) >= int(frame_height)
        )
        if touches_border and self._config.reject_border_cropped:
            return HeadObservationStatus.HEAD_CROPPED_BY_BORDER, ["head_cropped_by_border"]

        inside_ratio = _inside_ratio(head_bbox, person_bbox)
        if inside_ratio < self._config.min_head_inside_person_ratio:
            return HeadObservationStatus.HEAD_UNUSABLE, ["head_bbox_not_inside_person_bbox"]

        return HeadObservationStatus.ACTIONABLE, []

    @staticmethod
    def _make_observation(
        *,
        camera_id: str,
        frame_index: int,
        timestamp_seconds: float,
        person_bbox: BBox | None,
        head_bbox: BBox | None,
        track_id: int | str | None,
        episode_id: Any,
        observed_at: Any,
        status: HeadObservationStatus,
        confidence: float,
        quality: dict[str, Any],
        reason_codes: list[str],
        source_model: str,
        is_actionable: bool,
        scope: HeadDetectorScope,
        candidate_count: int,
        selected_candidate_index: int | None,
        association_score: float,
    ) -> HeadObservation:
        return HeadObservation(
            camera_id=str(camera_id),
            frame_index=int(frame_index),
            timestamp_seconds=float(timestamp_seconds),
            person_bbox=person_bbox,
            head_bbox=head_bbox,
            track_id=track_id,
            episode_id=str(episode_id) if episode_id else None,
            status=status,
            confidence=_clip01(confidence),
            quality=dict(quality or {}),
            reason_codes=_unique(reason_codes),
            source_model=str(source_model or "unknown_head_detector"),
            is_actionable=bool(is_actionable),
            observed_at=observed_at,
            detection_scope=scope,
            candidate_count=max(0, int(candidate_count)),
            selected_candidate_index=selected_candidate_index,
            association_score=max(0.0, min(1.0, float(association_score))),
            crop_source="head_detector" if head_bbox is not None else "none",
            legacy_geometry_used=False,
        )


def build_head_person_associator(settings: Any | None = None) -> HeadPersonAssociator:
    if settings is None:
        return HeadPersonAssociator()

    config = HeadPersonAssociationConfig(
        min_score=_settings_float(settings, "head_person_association_min_score", 0.20),
        min_head_inside_person_ratio=_settings_float(settings, "head_person_association_min_inside_ratio", 0.50),
        ambiguity_score_delta=_settings_float(settings, "head_person_association_ambiguity_delta", 0.08),
        reject_border_cropped=_settings_bool(settings, "head_person_association_reject_border_cropped", True),
        min_head_width_px=_settings_int(settings, "head_detector_min_head_width_px", 8),
        min_head_height_px=_settings_int(settings, "head_detector_min_head_height_px", 8),
    )
    return HeadPersonAssociator(config=config)


def _frame_size(frame_shape: tuple[int, ...] | Sequence[int]) -> tuple[int, int]:
    if frame_shape is None or len(frame_shape) < 2:
        return 0, 0
    return max(0, int(frame_shape[0])), max(0, int(frame_shape[1]))


def _inside_ratio(inner: BBox, outer: BBox) -> float:
    if inner is None or outer is None or not inner.is_valid or not outer.is_valid:
        return 0.0
    intersection = _intersection_area(inner, outer)
    return max(0.0, min(1.0, intersection / float(max(1, inner.area))))


def _intersection_area(a: BBox, b: BBox) -> int:
    x1 = max(int(a.x1), int(b.x1))
    y1 = max(int(a.y1), int(b.y1))
    x2 = min(int(a.x2), int(b.x2))
    y2 = min(int(a.y2), int(b.y2))
    return max(0, x2 - x1) * max(0, y2 - y1)


def _center_inside(inner: BBox, outer: BBox) -> bool:
    cx, cy = inner.center
    return bool(float(outer.x1) <= cx <= float(outer.x2) and float(outer.y1) <= cy <= float(outer.y2))


def _top_zone_score(*, head_bbox: BBox, person_bbox: BBox) -> float:
    if not head_bbox.is_valid or not person_bbox.is_valid:
        return 0.0
    person_height = max(1, int(person_bbox.height))
    relative_center_y = (float(head_bbox.center_y) - float(person_bbox.y1)) / float(person_height)
    if relative_center_y <= 0.35:
        return 0.15
    if relative_center_y <= 0.50:
        return 0.08
    return 0.0


def _settings_float(settings: Any, attr_name: str, default: float) -> float:
    try:
        return float(getattr(settings, attr_name, default))
    except Exception:
        return float(default)


def _settings_int(settings: Any, attr_name: str, default: int) -> int:
    try:
        return int(getattr(settings, attr_name, default))
    except Exception:
        return int(default)


def _settings_bool(settings: Any, attr_name: str, default: bool) -> bool:
    value = getattr(settings, attr_name, default)
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on", "enabled"}:
        return True
    if normalized in {"0", "false", "no", "n", "off", "disabled"}:
        return False
    return bool(default)


def _clip01(value: Any) -> float:
    try:
        number = float(value)
    except Exception:
        number = 0.0
    return max(0.0, min(1.0, number))


def _unique(values: Sequence[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
