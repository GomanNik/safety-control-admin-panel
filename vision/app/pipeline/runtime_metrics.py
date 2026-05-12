# ============================================================
# File: vision/app/pipeline/runtime_metrics.py
# Purpose:
# - CSV diagnostics for the track-centric runtime.
# - Writes frame, observation, incident and final episode reports.
# - Contains no business decisions and never creates person identity.
# ============================================================

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Iterable

from app.config import Settings
from app.models.schemas import BBox, IncidentCase, TrackEpisodeRecord


class RuntimeMetricsRecorder:
    def __init__(self, settings: Settings, *, camera_id: str) -> None:
        self._settings = settings
        self._camera_id = str(camera_id)
        self._enabled = bool(getattr(settings, "runtime_metrics_enabled", True))
        self._base_dir = Path(str(getattr(settings, "runtime_metrics_dir", "data/metrics"))).expanduser()
        self._session_dir: Path | None = None
        self._started = False

    @property
    def enabled(self) -> bool:
        return bool(self._enabled)

    @property
    def session_dir(self) -> Path | None:
        return self._session_dir

    def start_session(self, *, session_started_at: Any) -> None:
        if not self._enabled:
            return
        stamp = self._safe_stamp(session_started_at)
        self._session_dir = self._base_dir / self._sanitize(self._camera_id) / stamp
        self._session_dir.mkdir(parents=True, exist_ok=True)
        self._started = True

    def record_frame(self, **row: Any) -> None:
        self._append_row(
            "track_frame_metrics.csv",
            [
                "observed_at",
                "frame_index",
                "visible_tracks",
                "active_track_episodes",
                "lost_track_episodes",
                "ended_track_episodes",
                "valid_quality_observations",
                "quality_rejected_observations",
                "headwear_evaluable_observations",
                "headwear_not_evaluable_observations",
                "headwear_unknown_observations",
                "interaction_risk_observations",
                "lower_body_only_observations",
                "limb_only_observations",
                "bent_over_observations",
                "open_incidents",
                "shadow_tracks",
                "suppressed_duplicate_tracks",
                "partial_track_suppressed",
                "duplicate_track_suppressed",
                "candidate_tracks",
                "promoted_tracks",
                "head_crop_rejected",
                "headwear_skipped_bad_crop",
                "headwear_model_called",
                "headwear_pre_skipped",
                "headwear_skipped_visibility",
                "headwear_classification_not_scheduled",
                "person_bbox_raw",
                "person_bbox_accepted",
                "person_bbox_rejected",
                "person_bbox_rejected_too_small",
                "person_bbox_rejected_border",
                "person_bbox_rejected_bad_aspect",
                "person_bbox_rejected_no_head_zone",
                "person_bbox_rejected_partial",
                "person_bbox_rejected_overlap",
                "person_bbox_rejected_scene_occlusion",
                "person_bbox_rejected_headwear_zone_occluded",
                "person_bbox_rejected_exit_fragment",
                "person_bbox_rejected_edge_fragment_for_headwear",
                "person_bbox_rejected_internal_occluder_fragment",
                "person_bbox_rejected_headless_internal_fragment",
                "person_bbox_rejected_peer_duplicate_fragment",
                "person_bbox_rejected_limb_shape_fragment",
                "track_id_switch_suspicions",
                "track_fragmentation_suspicions",
                "track_merge_suspicions",
                "track_split_suspicions",
            ],
            row,
        )

    def record_observation(self, **row: Any) -> None:
        self._append_row(
            "track_observation_metrics.csv",
            [
                "observed_at",
                "frame_index",
                "source_track_id",
                "track_episode_id",
                "bbox",
                "head_bbox",
                "quality_score",
                "bbox_area_ratio",
                "occlusion_ratio",
                "visibility_state",
                "headwear_context_usable",
                "interaction_risk",
                "is_lower_body_only",
                "is_partial_limb_only",
                "is_bent_over",
                "is_truncated",
                "is_occluded",
                "headwear_signal",
                "headwear_label",
                "headwear_confidence",
                "head_crop_rejected",
                "headwear_skipped_bad_crop",
                "headwear_model_called",
                "headwear_pre_skipped",
                "headwear_skipped_visibility",
                "headwear_classification_not_scheduled",
                "track_id_switch_suspicions",
                "track_fragmentation_suspicions",
                "track_merge_suspicions",
                "track_split_suspicions",
                "incident_id",
                "incident_state",
                "reason_codes",
            ],
            row,
        )

    def record_incident(self, *, event: str, incident: IncidentCase) -> None:
        self._append_row(
            "track_incident_events.csv",
            [
                "event",
                "case_id",
                "track_episode_id",
                "source_track_id",
                "camera_id",
                "state",
                "opened_at",
                "last_confirmed_at",
                "closed_at",
                "violation_duration_sec",
                "evidence_count",
                "max_confidence",
                "best_frame_path",
                "best_person_crop_path",
                "best_head_crop_path",
                "reason_codes",
            ],
            {
                "event": event,
                "case_id": incident.case_id,
                "track_episode_id": incident.track_episode_id,
                "source_track_id": incident.source_track_id,
                "camera_id": incident.camera_id,
                "state": getattr(incident.state, "value", incident.state),
                "opened_at": self._to_text(incident.opened_at),
                "last_confirmed_at": self._to_text(incident.last_confirmed_at),
                "closed_at": self._to_text(incident.closed_at),
                "violation_duration_sec": round(float(incident.violation_duration_sec), 4),
                "evidence_count": int(incident.evidence_count),
                "max_confidence": round(float(incident.max_confidence), 4),
                "best_frame_path": incident.best_frame_path,
                "best_person_crop_path": incident.best_person_crop_path,
                "best_head_crop_path": incident.best_head_crop_path,
                "reason_codes": self._join(incident.reason_codes),
            },
        )

    def write_episode_report(self, episodes: Iterable[TrackEpisodeRecord]) -> None:
        if not self._enabled or not self._ensure_started():
            return
        path = self._session_dir / "track_episode_report.csv"  # type: ignore[operator]
        fieldnames = [
            "track_episode_id",
            "camera_id",
            "source_track_id",
            "status",
            "first_seen_at",
            "last_seen_at",
            "first_frame_index",
            "last_frame_index",
            "visible_frame_count",
            "headwear_evaluable_frame_count",
            "headwear_unknown_frame_count",
            "violation_frame_count",
            "lost_frame_count",
            "duplicate_suppressed_count",
            "interaction_risk_count",
            "partial_suppressed_count",
            "candidate_frame_count",
            "promoted_frame_count",
            "head_crop_rejected_count",
            "headwear_skipped_bad_crop_count",
            "headwear_model_called_count",
            "headwear_pre_skipped_count",
            "headwear_skipped_visibility_count",
            "is_short_episode",
            "last_quality_score",
            "active_incident_id",
            "reason_codes",
        ]
        with path.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            for item in episodes:
                writer.writerow(
                    {
                        "track_episode_id": item.track_episode_id,
                        "camera_id": item.camera_id,
                        "source_track_id": item.source_track_id,
                        "status": getattr(item.status, "value", item.status),
                        "first_seen_at": self._to_text(item.first_seen_at),
                        "last_seen_at": self._to_text(item.last_seen_at),
                        "first_frame_index": item.first_frame_index,
                        "last_frame_index": item.last_frame_index,
                        "visible_frame_count": item.visible_frame_count,
                        "headwear_evaluable_frame_count": item.headwear_evaluable_frame_count,
                        "headwear_unknown_frame_count": item.headwear_unknown_frame_count,
                        "violation_frame_count": item.violation_frame_count,
                        "lost_frame_count": item.lost_frame_count,
                        "duplicate_suppressed_count": item.duplicate_suppressed_count,
                        "interaction_risk_count": item.interaction_risk_count,
                        "partial_suppressed_count": getattr(item, "partial_suppressed_count", 0),
                        "candidate_frame_count": getattr(item, "candidate_frame_count", 0),
                        "promoted_frame_count": getattr(item, "promoted_frame_count", 0),
                        "head_crop_rejected_count": getattr(item, "head_crop_rejected_count", 0),
                        "headwear_skipped_bad_crop_count": getattr(item, "headwear_skipped_bad_crop_count", 0),
                        "headwear_model_called_count": getattr(item, "headwear_model_called_count", 0),
                        "headwear_pre_skipped_count": getattr(item, "headwear_pre_skipped_count", 0),
                        "headwear_skipped_visibility_count": getattr(item, "headwear_skipped_visibility_count", 0),
                        "is_short_episode": int(item.visible_frame_count <= max(1, int(getattr(self._settings, "track_episode_short_max_frames", 6)))),
                        "last_quality_score": item.last_quality_score,
                        "active_incident_id": item.active_incident_id,
                        "reason_codes": self._join(item.reason_codes),
                    }
                )

    def _append_row(self, filename: str, fieldnames: list[str], row: dict[str, Any]) -> None:
        if not self._enabled or not self._ensure_started():
            return
        path = self._session_dir / filename  # type: ignore[operator]
        write_header = not path.exists()
        normalized = {key: self._normalize_value(row.get(key)) for key in fieldnames}
        with path.open("a", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            if write_header:
                writer.writeheader()
            writer.writerow(normalized)

    def _ensure_started(self) -> bool:
        if self._session_dir is not None:
            self._session_dir.mkdir(parents=True, exist_ok=True)
            return True
        return False

    @staticmethod
    def bbox_to_text(bbox: BBox | None) -> str:
        if bbox is None:
            return ""
        return f"{int(bbox.x1)},{int(bbox.y1)},{int(bbox.x2)},{int(bbox.y2)}"

    @classmethod
    def _normalize_value(cls, value: Any) -> Any:
        if isinstance(value, (list, tuple, set)):
            return cls._join(value)
        if isinstance(value, BBox):
            return cls.bbox_to_text(value)
        if hasattr(value, "value"):
            return value.value
        return cls._to_text(value)

    @staticmethod
    def _to_text(value: Any) -> str:
        if value is None:
            return ""
        if hasattr(value, "isoformat"):
            return str(value.isoformat())
        return str(value)

    @staticmethod
    def _join(values: Iterable[Any]) -> str:
        return "|".join(str(item) for item in values if str(item or "").strip())

    @staticmethod
    def _safe_stamp(value: Any) -> str:
        if hasattr(value, "strftime"):
            return value.strftime("%Y%m%d_%H%M%S")
        return "session"

    @staticmethod
    def _sanitize(value: str) -> str:
        text = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in str(value or ""))
        return text.strip("._-") or "camera"
