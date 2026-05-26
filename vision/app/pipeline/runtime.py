# ============================================================
# File: vision/app/pipeline/runtime.py
# Purpose:
# - Offline video processing orchestrator for one camera.
# - Track-centric chain:
#   frame -> PersonTrackingEngine -> TrackEpisodeRegistry
#   -> QualityGate -> TrackObservation -> HeadwearDetector
#   -> IncidentEngine -> Evidence/Overlay/API.
# - Does not create/resolve person_id or day_person_id.
# - Incidents are keyed by track_episode_id.
# ============================================================

from __future__ import annotations

import logging
import math
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.clients.backend_client import BackendClient
from app.config import Settings
from app.models.schemas import (
    BBox,
    ComplianceSignal,
    HeadwearAssessment,
    IncidentCase,
    IncidentCaseResponse,
    IncidentState,
    QualityAssessment,
    RuntimeStats,
    RuntimeStatusResponse,
    TrackEpisodeRecord,
    TrackEpisodeResponse,
)
from app.pipeline.head_detector import HeadObservation, build_head_detector
from app.pipeline.headwear_detector import HeadwearDetector
from app.pipeline.headwear_observation import HeadwearObservation, TrackEpisodeBinding, build_headwear_observation_from_assessment
from app.pipeline.human_observation import TrackObservation, build_track_observation_from_tracking
from app.pipeline.incident_engine import IncidentEngine
from app.pipeline.incident_evidence_limiter import IncidentEvidenceLimiter
from app.pipeline.person_box_gate import PersonBoxGate
from app.pipeline.person_tracking_engine import PersonTrackingEngine
from app.pipeline.quality_gate import QualityGate
from app.pipeline.runtime_metrics import RuntimeMetricsRecorder
from app.pipeline.track_diagnostics import TrackDiagnosticsAnalyzer
from app.pipeline.track_episode_registry import TrackEpisodeRegistry
from app.pipeline.tracking_types import TrackEpisodeAssignment, TrackEpisodeFrameResult, TrackedPersonObservation, TrackingFrameResult
from app.storage.frame_store import FrameStore
from app.storage.person_crop_dataset_store import PersonCropDatasetStore
from app.utils.time_utils import utc_now


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class _PreviewOverlayItem:
    bbox: BBox
    track_id: int
    track_episode_id: str | None
    display_id: str
    signal: ComplianceSignal
    confidence: float
    quality_score: float
    reason: str
    incident_state: IncidentState | None = None
    stage: str = "accepted"
    reason_codes: list[str] | None = None


@dataclass(slots=True)
class _FrameObservationBundle:
    track: TrackedPersonObservation
    quality: QualityAssessment
    episode_assignment: TrackEpisodeAssignment
    observation: TrackObservation
    head_observation: HeadObservation | None = None
    headwear: HeadwearAssessment | None = None
    headwear_observation: HeadwearObservation | None = None
    evidence_frame_path: str | None = None
    incident_case: IncidentCase | None = None


@dataclass(slots=True)
class _FrameProcessingResult:
    items: list[_PreviewOverlayItem]
    valid_quality_count: int = 0
    quality_rejected_count: int = 0
    headwear_evaluable_count: int = 0
    headwear_not_evaluable_count: int = 0
    headwear_unknown_count: int = 0
    shadow_tracks_count: int = 0
    suppressed_duplicate_tracks_count: int = 0
    partial_track_suppressed_count: int = 0
    candidate_tracks_count: int = 0
    promoted_tracks_count: int = 0
    head_crop_rejected_count: int = 0
    headwear_skipped_bad_crop_count: int = 0
    headwear_model_called_count: int = 0
    headwear_pre_skipped_count: int = 0
    headwear_skipped_visibility_count: int = 0
    headwear_classification_not_scheduled_count: int = 0
    person_bbox_raw_count: int = 0
    person_bbox_accepted_count: int = 0
    person_bbox_rejected_count: int = 0
    person_bbox_rejected_too_small_count: int = 0
    person_bbox_rejected_border_count: int = 0
    person_bbox_rejected_bad_aspect_count: int = 0
    person_bbox_rejected_no_head_zone_count: int = 0
    person_bbox_rejected_partial_count: int = 0
    person_bbox_rejected_overlap_count: int = 0
    person_bbox_rejected_scene_occlusion_count: int = 0
    person_bbox_rejected_headwear_zone_occluded_count: int = 0
    person_bbox_rejected_exit_fragment_count: int = 0
    person_bbox_rejected_edge_fragment_for_headwear_count: int = 0
    person_bbox_rejected_internal_occluder_fragment_count: int = 0
    person_bbox_rejected_headless_internal_fragment_count: int = 0
    person_bbox_rejected_peer_duplicate_fragment_count: int = 0
    person_bbox_rejected_limb_shape_fragment_count: int = 0
    track_id_switch_suspicions: int = 0
    track_fragmentation_suspicions: int = 0
    track_merge_suspicions: int = 0
    track_split_suspicions: int = 0
    active_episode_count: int = 0
    lost_episode_count: int = 0
    ended_episode_count: int = 0
    interaction_risk_count: int = 0
    lower_body_only_count: int = 0
    limb_only_count: int = 0
    bent_over_count: int = 0


@dataclass(slots=True)
class _TrackSuppressionResult:
    visible_tracks: list[TrackedPersonObservation]
    duplicate_count: int = 0
    partial_count: int = 0
    reason_by_track_id: dict[int, list[str]] | None = None


class VisionRuntimeService:
    def __init__(self, settings: Settings) -> None:
        settings.validate_runtime_static_config_or_raise()

        self._settings = settings
        self._camera_id = settings.camera_id
        self._source_url = settings.source_url

        self._backend_client = BackendClient(settings)
        self._frame_store = FrameStore(
            settings.evidence_dir,
            image_ext=settings.evidence_image_ext,
            jpeg_quality=settings.evidence_jpeg_quality,
            retention_days=settings.evidence_retention_days,
            cleanup_interval_sec=settings.evidence_cleanup_interval_sec,
        )

        self._person_tracking_engine = PersonTrackingEngine(settings)
        self._person_box_gate = PersonBoxGate(settings)
        self._track_episode_registry = TrackEpisodeRegistry(settings, camera_id=self._camera_id)
        self._quality_gate = QualityGate(settings)
        self._head_detector = build_head_detector(settings)
        self._headwear_detector = HeadwearDetector(settings)
        self._incident_engine = IncidentEngine(settings)
        self._track_diagnostics = TrackDiagnosticsAnalyzer(settings)
        self._incident_evidence_limiter = IncidentEvidenceLimiter(
            max_per_case=settings.incident_evidence_max_per_case,
            min_interval_seconds=settings.incident_evidence_min_interval_seconds,
        )
        self._metrics = RuntimeMetricsRecorder(settings, camera_id=self._camera_id)

        self._control_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._export_in_progress = False
        self._export_thread: threading.Thread | None = None
        self._stats = RuntimeStats()

    # ========================================================
    # Public API
    # ========================================================

    def start(self, source_url: str | None = None, camera_id: str | None = None) -> tuple[bool, str]:
        return False, "Live runtime is disabled. Use POST /runtime/export-video."

    def stop(self) -> tuple[bool, str]:
        return False, "Live runtime is disabled. There is no background runtime to stop."

    def shutdown(self) -> None:
        thread = self._export_thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=0.1)

    def status(self) -> RuntimeStatusResponse:
        with self._state_lock:
            stats_copy = RuntimeStats(**self._stats.model_dump())
            running = bool(self._export_in_progress)

        diagnostics = self._person_tracking_engine.last_diagnostics()
        stats_copy.tracking_backend = diagnostics.backend_name
        stats_copy.tracking_ready = self._person_tracking_engine.ready()
        stats_copy.tracking_failure_reason = self._person_tracking_engine.failure_reason()
        stats_copy.active_track_episodes = self._track_episode_registry.active_count()
        stats_copy.lost_track_episodes = self._track_episode_registry.lost_count()
        stats_copy.ended_track_episodes = self._track_episode_registry.ended_count()
        stats_copy.day_people_count = 0

        return RuntimeStatusResponse(
            running=running,
            camera_id=self._camera_id,
            detector_ready=self._pipeline_ready_for_target(),
            headwear_detector_mode=self._headwear_detector.mode,
            stats=stats_copy,
        )

    def tracks(self) -> list[TrackEpisodeResponse]:
        with self._state_lock:
            items = [TrackEpisodeRecord(**item.model_dump()) for item in self._track_episode_registry.snapshot(include_ended=False)]
        return [self._track_episode_response(item) for item in items]

    def day_people(self) -> list[TrackEpisodeResponse]:
        # Deprecated route compatibility: returns current track episodes, not people.
        return self.tracks()

    def incidents(self) -> list[IncidentCaseResponse]:
        with self._state_lock:
            items = [IncidentCase(**item.model_dump()) for item in self._incident_engine.snapshot()]
        return [self._incident_response(item) for item in items]

    def export_processed_video(self, *, source_url: str | None = None, output_path: str | None = None, max_seconds: float | None = None) -> tuple[bool, str]:
        with self._control_lock:
            if self._export_in_progress:
                return False, "Processed video export is already running."

            effective_source_url = self._source_url
            if source_url is not None and source_url.strip():
                effective_source_url = self._resolve_runtime_source(source_url.strip())
            if not effective_source_url:
                return False, "Processed video export rejected: SOURCE_URL is empty."

            effective_max_seconds = float(self._settings.processed_video_max_seconds)
            if max_seconds is not None:
                effective_max_seconds = max(0.0, float(max_seconds))

            collection_mode = bool(getattr(self._settings, "person_crop_collection_enabled", False))
            job_name = "Person crop collection" if collection_mode else "Processed video export"

            try:
                self._settings.validate_runtime_launch_or_raise(
                    source_url=effective_source_url,
                    require_real_headwear=False if collection_mode else self._settings.runtime_require_real_headwear,
                )
            except ValueError as error:
                return False, str(error)

            readiness_errors = self._collect_startup_readiness_errors(
                source_url=effective_source_url,
                require_headwear=not collection_mode,
                detection_only=collection_mode,
            )
            if readiness_errors:
                return False, f"{job_name} rejected: " + "; ".join(readiness_errors)

            self._set_export_running(True, f"{job_name} started.")
            thread = threading.Thread(
                target=self._person_crop_collection_worker if collection_mode else self._export_worker,
                kwargs={"source_url": effective_source_url, "output_path": output_path, "max_seconds": effective_max_seconds},
                daemon=True,
            )
            self._export_thread = thread
            thread.start()
            return True, f"{job_name} started. Poll GET /runtime/status for progress."

    def collect_person_crops(
        self,
        *,
        source_url: str | None = None,
        output_dir: str | None = None,
        max_seconds: float | None = None,
        start_seconds: float | None = None,
    ) -> tuple[bool, str]:
        with self._control_lock:
            if self._export_in_progress:
                return False, "Person crop collection is already running."

            effective_source_url = self._source_url
            if source_url is not None and source_url.strip():
                effective_source_url = self._resolve_runtime_source(source_url.strip())
            if not effective_source_url:
                return False, "Person crop collection rejected: SOURCE_URL is empty."

            effective_max_seconds = float(self._settings.processed_video_max_seconds)
            if max_seconds is not None:
                effective_max_seconds = max(0.0, float(max_seconds))

            effective_start_seconds = 0.0
            if start_seconds is not None:
                effective_start_seconds = max(0.0, float(start_seconds))

            try:
                self._settings.validate_runtime_launch_or_raise(
                    source_url=effective_source_url,
                    require_real_headwear=False,
                )
            except ValueError as error:
                return False, str(error)

            readiness_errors = self._collect_startup_readiness_errors(
                source_url=effective_source_url,
                require_headwear=False,
                detection_only=True,
            )
            if readiness_errors:
                return False, "Person crop collection rejected: " + "; ".join(readiness_errors)

            self._set_export_running(True, "Person crop collection started.")
            thread = threading.Thread(
                target=self._person_crop_collection_worker,
                kwargs={
                    "source_url": effective_source_url,
                    "output_path": output_dir,
                    "max_seconds": effective_max_seconds,
                    "start_seconds": effective_start_seconds,
                },
                daemon=True,
            )
            self._export_thread = thread
            thread.start()
            return True, "Person crop collection started. Poll GET /runtime/status for progress."

    # ========================================================
    # Export worker
    # ========================================================

    def _export_worker(self, *, source_url: str, output_path: str | None, max_seconds: float) -> None:
        ok = False
        message = "Processed video export did not finish."
        try:
            ok, message = self._export_processed_video_locked(source_url=source_url, output_path=output_path, max_seconds=max_seconds)
        except Exception as error:
            logger.exception("Processed video export failed.")
            message = f"Processed video export failed: {type(error).__name__}: {error}"
        finally:
            with self._state_lock:
                self._stats.last_export_message = message
                if ok:
                    self._stats.export_progress_percent = 100.0
                    self._stats.export_eta_sec = 0.0
                self._export_in_progress = False

    def _person_crop_collection_worker(
        self,
        *,
        source_url: str,
        output_path: str | None,
        max_seconds: float,
        start_seconds: float = 0.0,
    ) -> None:
        ok = False
        message = "Person crop collection did not finish."
        try:
            ok, message = self._collect_person_crops_locked(
                source_url=source_url,
                output_dir=output_path,
                max_seconds=max_seconds,
                start_seconds=start_seconds,
            )
        except Exception as error:
            logger.exception("Person crop collection failed.")
            message = f"Person crop collection failed: {type(error).__name__}: {error}"
        finally:
            with self._state_lock:
                self._stats.last_export_message = message
                if ok:
                    self._stats.export_progress_percent = 100.0
                    self._stats.export_eta_sec = 0.0
                self._export_in_progress = False

    def _set_export_running(self, running: bool, message: str) -> None:
        with self._state_lock:
            self._export_in_progress = bool(running)
            if running:
                self._stats = RuntimeStats(last_export_message=message)
            else:
                self._stats.last_export_message = message

    def _collect_person_crops_locked(
        self,
        *,
        source_url: str,
        output_dir: str | None,
        max_seconds: float,
        start_seconds: float = 0.0,
    ) -> tuple[bool, str]:
        capture = cv2.VideoCapture(source_url)
        if not capture.isOpened():
            return False, f"Failed to open source video: {source_url}"

        self._person_tracking_engine.reset()
        stats = RuntimeStats()
        store: PersonCropDatasetStore | None = None

        try:
            source_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
            source_frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            fallback_fps = self._resolve_processed_video_fps(source_fps)
            safe_start_seconds = max(0.0, float(start_seconds or 0.0))
            start_frame_index = self._seek_capture_to_start_seconds(
                capture=capture,
                start_seconds=safe_start_seconds,
                source_fps=source_fps,
                source_frame_count=source_frame_count,
                fallback_fps=fallback_fps,
            )
            start_timestamp_seconds = self._frame_elapsed_seconds(
                frame_index=start_frame_index + 1,
                source_fps=source_fps,
                output_fps=fallback_fps,
            )
            collection_fps = max(0.01, float(getattr(self._settings, "person_crop_collection_fps", self._settings.processed_video_analysis_fps)))
            adaptive_sampling = bool(getattr(self._settings, "person_crop_collection_adaptive_sampling", False))
            idle_collection_fps = max(0.01, float(getattr(self._settings, "person_crop_collection_idle_fps", 0.2)))
            active_collection_fps = max(0.01, float(getattr(self._settings, "person_crop_collection_active_fps", 2.0)))
            active_hold_seconds = max(0.0, float(getattr(self._settings, "person_crop_collection_active_hold_seconds", 10.0)))
            max_samples = max(0, int(getattr(self._settings, "person_crop_collection_max_samples", 0)))
            collection_started_at = utc_now()
            wall_started_at = utc_now()

            collection_root = output_dir or str(getattr(self._settings, "person_crop_collection_dir", "./data/person_crop_collection"))
            store = PersonCropDatasetStore(
                root=collection_root,
                camera_id=self._camera_id,
                source_url=source_url,
                jpeg_quality=int(getattr(self._settings, "person_crop_collection_jpeg_quality", 92)),
                save_frames=bool(getattr(self._settings, "person_crop_collection_save_frames", True)),
                save_rejected=bool(getattr(self._settings, "person_crop_collection_save_rejected", False)),
                session_started_at=collection_started_at,
            )

            stats.total_frames_to_process = self._resolve_total_frames_to_process(
                source_frame_count=max(0, int(source_frame_count) - int(start_frame_index)),
                source_fps=source_fps,
                max_seconds=max_seconds,
            )
            stats.current_analysis_fps = collection_fps
            stats.current_tracking_fps = collection_fps
            stats.current_headwear_classification_fps = 0.0
            stats.last_export_output_path = str(store.session_dir)
            stats.last_export_message = (
                "Person crop collection is running"
                + (f" from source timestamp {start_timestamp_seconds:.3f}s." if safe_start_seconds > 0.0 else ".")
            )
            stats.tracking_backend = self._person_tracking_engine.last_diagnostics().backend_name
            stats.tracking_ready = self._person_tracking_engine.ready()
            stats.tracking_failure_reason = self._person_tracking_engine.failure_reason()

            frame_index = int(start_frame_index)
            last_collection_elapsed_sec: float | None = None
            active_collection_until_sec = start_timestamp_seconds - 1.0
            last_observed_at = collection_started_at

            while True:
                ok, frame = capture.read()
                if not ok or frame is None:
                    break

                frame_index += 1
                stats.total_frames_read += 1
                frame = self._resize_collection_frame_if_needed(frame)

                elapsed_sec = self._frame_elapsed_seconds(frame_index=frame_index, source_fps=source_fps, output_fps=fallback_fps)
                collection_elapsed_sec = max(0.0, elapsed_sec - start_timestamp_seconds)
                if max_seconds > 0.0 and collection_elapsed_sec > max_seconds:
                    break

                observed_at = collection_started_at + timedelta(seconds=collection_elapsed_sec)
                last_observed_at = observed_at

                effective_collection_fps = collection_fps
                if adaptive_sampling:
                    effective_collection_fps = active_collection_fps if elapsed_sec <= active_collection_until_sec else idle_collection_fps

                stats.current_analysis_fps = effective_collection_fps
                stats.current_tracking_fps = effective_collection_fps

                should_collect = self._should_analyze_export_frame(
                    elapsed_sec=elapsed_sec,
                    last_analysis_elapsed_sec=last_collection_elapsed_sec,
                    analysis_fps=effective_collection_fps,
                )

                if should_collect:
                    detection_result = self._person_tracking_engine.process_frame_detection_only(
                        frame=frame,
                        observed_at=observed_at,
                    )
                    person_box_result = self._person_box_gate.filter_frame(
                        tracking_result=detection_result,
                        frame_shape=frame.shape,
                    )

                    stats.total_frames_processed += 1
                    stats.active_tracks = person_box_result.accepted_count
                    stats.person_bbox_raw_count += person_box_result.raw_count
                    stats.person_bbox_accepted_count += person_box_result.accepted_count
                    stats.person_bbox_rejected_count += person_box_result.rejected_count
                    stats.person_bbox_rejected_too_small_count += person_box_result.rejected_count_by_reason("person_box_rejected_too_small")
                    stats.person_bbox_rejected_border_count += (
                        person_box_result.rejected_count_by_reason("person_box_rejected_top_cropped")
                        + person_box_result.rejected_count_by_reason("person_box_rejected_side_cropped")
                    )
                    stats.person_bbox_rejected_bad_aspect_count += person_box_result.rejected_count_by_reason("person_box_rejected_bad_aspect")
                    stats.person_bbox_rejected_no_head_zone_count += person_box_result.rejected_count_by_reason("person_box_rejected_no_reliable_head_zone")
                    stats.person_bbox_rejected_partial_count += person_box_result.rejected_count_by_reason("person_box_rejected_partial")
                    stats.person_bbox_rejected_overlap_count += person_box_result.rejected_count_by_reason("person_box_rejected_overlap")
                    stats.person_bbox_rejected_scene_occlusion_count += person_box_result.rejected_count_by_reason("person_box_rejected_scene_occlusion")
                    stats.person_bbox_rejected_headwear_zone_occluded_count += person_box_result.rejected_count_by_reason("person_box_rejected_headwear_zone_occluded")
                    stats.person_bbox_rejected_exit_fragment_count += person_box_result.rejected_count_by_reason("person_box_rejected_exit_fragment")
                    stats.person_bbox_rejected_edge_fragment_for_headwear_count += person_box_result.rejected_count_by_reason("person_box_rejected_edge_fragment_for_headwear")
                    stats.person_bbox_rejected_internal_occluder_fragment_count += person_box_result.rejected_count_by_reason("person_box_rejected_internal_occluder_fragment")
                    stats.person_bbox_rejected_headless_internal_fragment_count += person_box_result.rejected_count_by_reason("person_box_rejected_headless_internal_fragment")
                    stats.person_bbox_rejected_peer_duplicate_fragment_count += person_box_result.rejected_count_by_reason("person_box_rejected_peer_duplicate_fragment")
                    stats.person_bbox_rejected_limb_shape_fragment_count += person_box_result.rejected_count_by_reason("person_box_rejected_limb_shape_fragment")

                    if adaptive_sampling and person_box_result.raw_count > 0:
                        active_collection_until_sec = max(active_collection_until_sec, elapsed_sec + active_hold_seconds)
                        stats.current_analysis_fps = active_collection_fps
                        stats.current_tracking_fps = active_collection_fps

                    decisions = person_box_result.decisions_by_track_id
                    for track in person_box_result.accepted_tracks:
                        store.save_sample(
                            frame=frame,
                            track=track,
                            decision=decisions.get(int(track.track_id)),
                            frame_index=frame_index,
                            timestamp_seconds=elapsed_sec,
                            observed_at=observed_at,
                            accepted=True,
                        )
                    if bool(getattr(self._settings, "person_crop_collection_save_rejected", False)):
                        for track in person_box_result.rejected_tracks:
                            store.save_sample(
                                frame=frame,
                                track=track,
                                decision=decisions.get(int(track.track_id)),
                                frame_index=frame_index,
                                timestamp_seconds=elapsed_sec,
                                observed_at=observed_at,
                                accepted=False,
                            )

                    last_collection_elapsed_sec = elapsed_sec

                    if max_samples > 0 and store.accepted_count >= max_samples:
                        stats.last_export_message = f"Person crop collection sample limit reached: {store.accepted_count}."
                        self._publish_export_state(stats=stats)
                        break
                else:
                    stats.total_frames_skipped += 1

                self._update_progress_stats(stats=stats, wall_started_at=wall_started_at, current_frame_index=stats.total_frames_read, observed_at=observed_at)
                stats.last_export_output_path = str(store.session_dir)
                stats.last_export_message = (
                    "Person crop collection is running. "
                    f"start_seconds={start_timestamp_seconds:.3f}, "
                    f"accepted={store.accepted_count}, rejected={store.rejected_count}."
                )
                self._publish_export_state(stats=stats)

            stats.active_tracks = 0
            stats.active_track_episodes = 0
            stats.lost_track_episodes = 0
            stats.ended_track_episodes = 0
            stats.active_incidents_count = 0
            stats.export_progress_percent = 100.0
            stats.export_eta_sec = 0.0
            stats.last_frame_at = last_observed_at
            stats.last_export_output_path = str(store.session_dir)
            stats.last_export_message = (
                "Person crop collection finished. "
                f"start_seconds={start_timestamp_seconds:.3f}, "
                f"accepted={store.accepted_count}, rejected={store.rejected_count}, dir={store.session_dir}"
            )
            store.write_summary()
            self._publish_export_state(stats=stats)
            return True, stats.last_export_message
        finally:
            capture.release()
            if store is not None:
                store.close()

    def _export_processed_video_locked(self, *, source_url: str, output_path: str | None, max_seconds: float) -> tuple[bool, str]:
        capture = cv2.VideoCapture(source_url)
        if not capture.isOpened():
            return False, f"Failed to open source video: {source_url}"

        writer: cv2.VideoWriter | None = None
        self._person_tracking_engine.reset()
        self._track_episode_registry.reset()
        self._track_diagnostics.reset()
        self._head_detector = build_head_detector(self._settings)
        self._incident_engine = IncidentEngine(self._settings)
        self._incident_evidence_limiter.reset()

        stats = RuntimeStats()
        try:
            source_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
            source_frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            output_fps = self._resolve_processed_video_fps(source_fps)
            tracking_fps = max(0.01, float(getattr(self._settings, "tracking_fps", self._settings.processed_video_analysis_fps)))
            headwear_classification_fps = max(
                0.01,
                float(getattr(self._settings, "headwear_classification_fps", tracking_fps)),
            )
            export_started_at = utc_now()
            wall_started_at = utc_now()
            self._metrics.start_session(session_started_at=export_started_at)
            self._headwear_detector.start_debug_session(
                camera_id=self._camera_id,
                session_started_at=export_started_at,
                source_url=source_url,
            )
            output_file = self._resolve_processed_video_output_path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)

            stats.total_frames_to_process = self._resolve_total_frames_to_process(
                source_frame_count=source_frame_count,
                source_fps=source_fps,
                max_seconds=max_seconds,
            )
            stats.current_analysis_fps = tracking_fps
            stats.current_tracking_fps = tracking_fps
            stats.current_headwear_classification_fps = headwear_classification_fps
            stats.last_export_output_path = str(output_file)
            stats.last_export_message = "Processed video export is running."
            stats.tracking_backend = self._person_tracking_engine.last_diagnostics().backend_name
            stats.tracking_ready = self._person_tracking_engine.ready()
            stats.tracking_failure_reason = self._person_tracking_engine.failure_reason()

            frame_index = 0
            written_count = 0
            last_tracking_elapsed_sec: float | None = None
            last_headwear_classification_elapsed_sec: float | None = None
            next_write_elapsed_sec = 0.0
            last_overlay_items: list[_PreviewOverlayItem] = []
            last_observed_at = export_started_at

            while True:
                ok, frame = capture.read()
                if not ok or frame is None:
                    break

                frame_index += 1
                stats.total_frames_read += 1
                frame = self._resize_export_frame_if_needed(frame)

                elapsed_sec = self._frame_elapsed_seconds(frame_index=frame_index, source_fps=source_fps, output_fps=output_fps)
                if max_seconds > 0.0 and elapsed_sec > max_seconds:
                    break

                observed_at = export_started_at + timedelta(seconds=elapsed_sec)
                last_observed_at = observed_at
                should_track = self._should_analyze_export_frame(
                    elapsed_sec=elapsed_sec,
                    last_analysis_elapsed_sec=last_tracking_elapsed_sec,
                    analysis_fps=tracking_fps,
                )
                should_run_headwear = False
                if should_track:
                    should_run_headwear = self._should_analyze_export_frame(
                        elapsed_sec=elapsed_sec,
                        last_analysis_elapsed_sec=last_headwear_classification_elapsed_sec,
                        analysis_fps=headwear_classification_fps,
                    )
                should_write = self._should_write_export_frame(elapsed_sec=elapsed_sec, next_write_elapsed_sec=next_write_elapsed_sec)

                if should_track:
                    processing_result = self._process_export_frame(
                        frame=frame,
                        observed_at=observed_at,
                        run_headwear=should_run_headwear,
                    )
                    last_tracking_elapsed_sec = elapsed_sec
                    if should_run_headwear:
                        last_headwear_classification_elapsed_sec = elapsed_sec
                    last_overlay_items = processing_result.items
                    stats.total_frames_processed += 1
                    stats.valid_quality_observations += processing_result.valid_quality_count
                    stats.quality_rejected_observations += processing_result.quality_rejected_count
                    stats.headwear_evaluable_observations += processing_result.headwear_evaluable_count
                    stats.headwear_not_evaluable_observations += processing_result.headwear_not_evaluable_count
                    stats.headwear_unknown_observations += processing_result.headwear_unknown_count
                    stats.active_tracks = len(last_overlay_items)
                    stats.active_track_episodes = self._track_episode_registry.active_count()
                    stats.lost_track_episodes = self._track_episode_registry.lost_count()
                    stats.ended_track_episodes = self._track_episode_registry.ended_count()
                    stats.active_incidents_count = self._incident_engine.get_active_cases_count()
                    stats.shadow_tracks_count = processing_result.shadow_tracks_count
                    stats.suppressed_duplicate_tracks_count += processing_result.suppressed_duplicate_tracks_count
                    stats.duplicate_track_suppressed_count += processing_result.suppressed_duplicate_tracks_count
                    stats.partial_track_suppressed_count += processing_result.partial_track_suppressed_count
                    stats.candidate_tracks_count += processing_result.candidate_tracks_count
                    stats.promoted_tracks_count += processing_result.promoted_tracks_count
                    stats.head_crop_rejected_count += processing_result.head_crop_rejected_count
                    stats.headwear_skipped_bad_crop_count += processing_result.headwear_skipped_bad_crop_count
                    stats.headwear_model_called_count += processing_result.headwear_model_called_count
                    stats.headwear_pre_skipped_count += processing_result.headwear_pre_skipped_count
                    stats.headwear_skipped_visibility_count += processing_result.headwear_skipped_visibility_count
                    stats.headwear_classification_not_scheduled_count += processing_result.headwear_classification_not_scheduled_count
                    stats.person_bbox_raw_count += processing_result.person_bbox_raw_count
                    stats.person_bbox_accepted_count += processing_result.person_bbox_accepted_count
                    stats.person_bbox_rejected_count += processing_result.person_bbox_rejected_count
                    stats.person_bbox_rejected_too_small_count += processing_result.person_bbox_rejected_too_small_count
                    stats.person_bbox_rejected_border_count += processing_result.person_bbox_rejected_border_count
                    stats.person_bbox_rejected_bad_aspect_count += processing_result.person_bbox_rejected_bad_aspect_count
                    stats.person_bbox_rejected_no_head_zone_count += processing_result.person_bbox_rejected_no_head_zone_count
                    stats.person_bbox_rejected_partial_count += processing_result.person_bbox_rejected_partial_count
                    stats.person_bbox_rejected_overlap_count += processing_result.person_bbox_rejected_overlap_count
                    stats.person_bbox_rejected_scene_occlusion_count += processing_result.person_bbox_rejected_scene_occlusion_count
                    stats.person_bbox_rejected_headwear_zone_occluded_count += processing_result.person_bbox_rejected_headwear_zone_occluded_count
                    stats.person_bbox_rejected_exit_fragment_count += processing_result.person_bbox_rejected_exit_fragment_count
                    stats.person_bbox_rejected_edge_fragment_for_headwear_count += processing_result.person_bbox_rejected_edge_fragment_for_headwear_count
                    stats.track_id_switch_suspicions += processing_result.track_id_switch_suspicions
                    stats.track_fragmentation_suspicions += processing_result.track_fragmentation_suspicions
                    stats.track_merge_suspicions += processing_result.track_merge_suspicions
                    stats.track_split_suspicions += processing_result.track_split_suspicions
                    stats.short_episode_count = self._track_episode_registry.short_episode_count()

                    self._metrics.record_frame(
                        observed_at=observed_at,
                        frame_index=frame_index,
                        visible_tracks=len(last_overlay_items),
                        active_track_episodes=stats.active_track_episodes,
                        lost_track_episodes=stats.lost_track_episodes,
                        ended_track_episodes=stats.ended_track_episodes,
                        valid_quality_observations=processing_result.valid_quality_count,
                        quality_rejected_observations=processing_result.quality_rejected_count,
                        headwear_evaluable_observations=processing_result.headwear_evaluable_count,
                        headwear_not_evaluable_observations=processing_result.headwear_not_evaluable_count,
                        headwear_unknown_observations=processing_result.headwear_unknown_count,
                        interaction_risk_observations=processing_result.interaction_risk_count,
                        lower_body_only_observations=processing_result.lower_body_only_count,
                        limb_only_observations=processing_result.limb_only_count,
                        bent_over_observations=processing_result.bent_over_count,
                        open_incidents=stats.active_incidents_count,
                        shadow_tracks=processing_result.shadow_tracks_count,
                        suppressed_duplicate_tracks=processing_result.suppressed_duplicate_tracks_count,
                        partial_track_suppressed=processing_result.partial_track_suppressed_count,
                        duplicate_track_suppressed=processing_result.suppressed_duplicate_tracks_count,
                        candidate_tracks=processing_result.candidate_tracks_count,
                        promoted_tracks=processing_result.promoted_tracks_count,
                        head_crop_rejected=processing_result.head_crop_rejected_count,
                        headwear_skipped_bad_crop=processing_result.headwear_skipped_bad_crop_count,
                        headwear_model_called=processing_result.headwear_model_called_count,
                        headwear_pre_skipped=processing_result.headwear_pre_skipped_count,
                        headwear_skipped_visibility=processing_result.headwear_skipped_visibility_count,
                        headwear_classification_not_scheduled=processing_result.headwear_classification_not_scheduled_count,
                        person_bbox_raw=processing_result.person_bbox_raw_count,
                        person_bbox_accepted=processing_result.person_bbox_accepted_count,
                        person_bbox_rejected=processing_result.person_bbox_rejected_count,
                        person_bbox_rejected_too_small=processing_result.person_bbox_rejected_too_small_count,
                        person_bbox_rejected_border=processing_result.person_bbox_rejected_border_count,
                        person_bbox_rejected_bad_aspect=processing_result.person_bbox_rejected_bad_aspect_count,
                        person_bbox_rejected_no_head_zone=processing_result.person_bbox_rejected_no_head_zone_count,
                        person_bbox_rejected_partial=processing_result.person_bbox_rejected_partial_count,
                        person_bbox_rejected_overlap=processing_result.person_bbox_rejected_overlap_count,
                        person_bbox_rejected_scene_occlusion=processing_result.person_bbox_rejected_scene_occlusion_count,
                        person_bbox_rejected_headwear_zone_occluded=processing_result.person_bbox_rejected_headwear_zone_occluded_count,
                        person_bbox_rejected_exit_fragment=processing_result.person_bbox_rejected_exit_fragment_count,
                        person_bbox_rejected_edge_fragment_for_headwear=processing_result.person_bbox_rejected_edge_fragment_for_headwear_count,
                        person_bbox_rejected_internal_occluder_fragment=processing_result.person_bbox_rejected_internal_occluder_fragment_count,
                        person_bbox_rejected_headless_internal_fragment=processing_result.person_bbox_rejected_headless_internal_fragment_count,
                        person_bbox_rejected_peer_duplicate_fragment=processing_result.person_bbox_rejected_peer_duplicate_fragment_count,
                        person_bbox_rejected_limb_shape_fragment=processing_result.person_bbox_rejected_limb_shape_fragment_count,
                        track_id_switch_suspicions=processing_result.track_id_switch_suspicions,
                        track_fragmentation_suspicions=processing_result.track_fragmentation_suspicions,
                        track_merge_suspicions=processing_result.track_merge_suspicions,
                        track_split_suspicions=processing_result.track_split_suspicions,
                    )

                    changed_cases = self._incident_engine.drain_changed_cases()
                    self._sync_incidents_if_needed(stats=stats, incidents=changed_cases)
                    for changed_case in changed_cases:
                        self._metrics.record_incident(event="changed", incident=changed_case)
                else:
                    stats.total_frames_skipped += 1

                if should_write or bool(self._settings.processed_video_write_all_frames):
                    if writer is None:
                        writer, actual_output_file = self._open_video_writer(output_file=output_file, frame=frame, fps=output_fps)
                        if actual_output_file != output_file:
                            output_file = actual_output_file
                            stats.last_export_output_path = str(output_file)
                            stats.last_export_message = f"Processed video export is running. Output fallback: {output_file}"
                    canvas = self._draw_overlay(frame=frame, items=last_overlay_items, observed_at=observed_at, stats=stats)
                    writer.write(canvas)
                    written_count += 1
                    next_write_elapsed_sec += 1.0 / max(output_fps, 0.01)

                self._update_progress_stats(stats=stats, wall_started_at=wall_started_at, current_frame_index=frame_index, observed_at=observed_at)
                self._publish_export_state(stats=stats)

            self._track_episode_registry.finish_video(reference_time=last_observed_at)
            self._incident_engine.finish_video(last_observed_at)
            changed_cases = self._incident_engine.drain_changed_cases()
            self._sync_incidents_if_needed(stats=stats, incidents=changed_cases)
            for changed_case in changed_cases:
                self._metrics.record_incident(event="final_changed", incident=changed_case)
            self._metrics.write_episode_report(self._track_episode_registry.snapshot(include_ended=True))

            stats.active_tracks = 0
            stats.active_track_episodes = self._track_episode_registry.active_count()
            stats.lost_track_episodes = self._track_episode_registry.lost_count()
            stats.ended_track_episodes = self._track_episode_registry.ended_count()
            stats.short_episode_count = self._track_episode_registry.short_episode_count()
            stats.active_incidents_count = self._incident_engine.get_active_cases_count()
            stats.export_progress_percent = 100.0
            stats.export_eta_sec = 0.0
            stats.last_frame_at = last_observed_at
            stats.last_export_message = f"Processed video export finished. Frames written: {written_count}."
            self._publish_export_state(stats=stats)
            return True, f"Processed video export finished: {output_file}"
        finally:
            capture.release()
            if writer is not None:
                writer.release()

    # ========================================================
    # Frame pipeline
    # ========================================================

    def _process_export_frame(self, *, frame: np.ndarray, observed_at: datetime, run_headwear: bool) -> _FrameProcessingResult:
        raw_tracking_result = self._person_tracking_engine.process_frame(frame=frame, observed_at=observed_at)
        person_box_result = self._person_box_gate.filter_frame(
            tracking_result=raw_tracking_result,
            frame_shape=frame.shape,
        )
        workable_tracking_result = self._tracking_result_with_visible_tracks(
            source=raw_tracking_result,
            visible_tracks=person_box_result.accepted_tracks,
        )
        raw_qualities_by_track_id = self._build_quality_by_track_id(frame=frame, tracking_result=workable_tracking_result)

        suppression = self._suppress_duplicate_tracks_for_frame(
            tracks=workable_tracking_result.visible_tracks,
            qualities_by_track_id=raw_qualities_by_track_id,
        )
        tracking_result = self._tracking_result_with_visible_tracks(
            source=workable_tracking_result,
            visible_tracks=suppression.visible_tracks,
        )
        qualities_by_track_id = {
            track.track_id: raw_qualities_by_track_id[track.track_id]
            for track in suppression.visible_tracks
            if track.track_id in raw_qualities_by_track_id
        }

        episode_result = self._track_episode_registry.update_frame(
            tracking_result=tracking_result,
            qualities_by_track_id=qualities_by_track_id,
        )
        bundles = self._build_observations_for_frame(
            tracking_result=tracking_result,
            episode_result=episode_result,
            qualities_by_track_id=qualities_by_track_id,
            frame_shape=frame.shape,
        )
        diagnostics = self._track_diagnostics.process_frame(
            tracking_result=tracking_result,
            episode_result=episode_result,
            qualities_by_track_id=qualities_by_track_id,
        )
        result = self._process_headwear_and_incidents(
            frame=frame,
            bundles=bundles,
            run_headwear=run_headwear,
        )
        self._append_rejected_person_overlay_items(
            result=result,
            person_box_result=person_box_result,
        )
        result.person_bbox_raw_count = person_box_result.raw_count
        result.person_bbox_accepted_count = person_box_result.accepted_count
        result.person_bbox_rejected_count = person_box_result.rejected_count
        result.person_bbox_rejected_too_small_count = person_box_result.rejected_count_by_reason("person_box_rejected_too_small")
        result.person_bbox_rejected_border_count = (
            person_box_result.rejected_count_by_reason("person_box_rejected_top_cropped")
            + person_box_result.rejected_count_by_reason("person_box_rejected_side_cropped")
        )
        result.person_bbox_rejected_bad_aspect_count = person_box_result.rejected_count_by_reason("person_box_rejected_bad_aspect")
        result.person_bbox_rejected_no_head_zone_count = person_box_result.rejected_count_by_reason("person_box_rejected_no_reliable_head_zone")
        result.person_bbox_rejected_partial_count = person_box_result.rejected_count_by_reason("person_box_rejected_partial")
        result.person_bbox_rejected_overlap_count = person_box_result.rejected_count_by_reason("person_box_rejected_overlap")
        result.person_bbox_rejected_scene_occlusion_count = person_box_result.rejected_count_by_reason("person_box_rejected_scene_occlusion")
        result.person_bbox_rejected_headwear_zone_occluded_count = person_box_result.rejected_count_by_reason("person_box_rejected_headwear_zone_occluded")
        result.person_bbox_rejected_exit_fragment_count = person_box_result.rejected_count_by_reason("person_box_rejected_exit_fragment")
        result.person_bbox_rejected_edge_fragment_for_headwear_count = person_box_result.rejected_count_by_reason(
            "person_box_rejected_edge_fragment_for_headwear"
        )
        result.person_bbox_rejected_internal_occluder_fragment_count = person_box_result.rejected_count_by_reason(
            "person_box_rejected_internal_occluder_fragment"
        )
        result.person_bbox_rejected_headless_internal_fragment_count = person_box_result.rejected_count_by_reason(
            "person_box_rejected_headless_internal_fragment"
        )
        result.person_bbox_rejected_peer_duplicate_fragment_count = person_box_result.rejected_count_by_reason(
            "person_box_rejected_peer_duplicate_fragment"
        )
        result.person_bbox_rejected_limb_shape_fragment_count = person_box_result.rejected_count_by_reason(
            "person_box_rejected_limb_shape_fragment"
        )
        result.track_id_switch_suspicions = diagnostics.id_switch_suspicions
        result.track_fragmentation_suspicions = diagnostics.fragmentation_suspicions
        result.track_merge_suspicions = diagnostics.merge_suspicions
        result.track_split_suspicions = diagnostics.split_suspicions
        self._append_candidate_overlay_items(
            result=result,
            tracking_result=tracking_result,
            episode_result=episode_result,
            qualities_by_track_id=qualities_by_track_id,
        )
        result.shadow_tracks_count = sum(1 for track in tracking_result.visible_tracks if track.is_shadow)
        result.suppressed_duplicate_tracks_count = suppression.duplicate_count
        result.partial_track_suppressed_count = suppression.partial_count + episode_result.partial_rejected_count
        result.candidate_tracks_count = episode_result.candidate_count
        result.promoted_tracks_count = episode_result.promoted_count
        result.active_episode_count = episode_result.active_count
        result.lost_episode_count = episode_result.lost_count
        result.ended_episode_count = episode_result.ended_count
        self._incident_engine.tick(observed_at)
        return result

    def _suppress_duplicate_tracks_for_frame(
        self,
        *,
        tracks: list[TrackedPersonObservation],
        qualities_by_track_id: dict[int, QualityAssessment],
    ) -> _TrackSuppressionResult:
        if len(tracks) <= 1:
            return _TrackSuppressionResult(visible_tracks=list(tracks), reason_by_track_id={})

        ordered = sorted(
            tracks,
            key=lambda item: self._track_keep_score(
                track=item,
                quality=qualities_by_track_id.get(item.track_id),
            ),
            reverse=True,
        )

        kept: list[TrackedPersonObservation] = []
        suppressed_reasons: dict[int, list[str]] = {}
        duplicate_count = 0
        partial_count = 0

        for track in ordered:
            quality = qualities_by_track_id.get(track.track_id)
            duplicate_of: TrackedPersonObservation | None = None
            for kept_track in kept:
                if self._looks_like_duplicate_track(track, kept_track):
                    duplicate_of = kept_track
                    break

            if duplicate_of is not None:
                duplicate_count += 1
                codes = ["duplicate_track_suppressed", f"duplicate_of_track_{duplicate_of.track_id}"]
                if self._quality_is_partial_or_fragment(quality):
                    partial_count += 1
                    codes.append("partial_track_suppressed")
                suppressed_reasons[int(track.track_id)] = codes
                continue

            kept.append(track)

        kept.sort(key=lambda item: item.track_id)
        return _TrackSuppressionResult(
            visible_tracks=kept,
            duplicate_count=duplicate_count,
            partial_count=partial_count,
            reason_by_track_id=suppressed_reasons,
        )

    def _tracking_result_with_visible_tracks(
        self,
        *,
        source: TrackingFrameResult,
        visible_tracks: list[TrackedPersonObservation],
    ) -> TrackingFrameResult:
        return TrackingFrameResult(
            observed_at=source.observed_at,
            frame_index=source.frame_index,
            visible_tracks=visible_tracks,
            lost_track_ids=list(source.lost_track_ids),
            removed_track_ids=list(source.removed_track_ids),
            backend=source.backend,
            diagnostics=source.diagnostics,
        )

    def _track_keep_score(self, *, track: TrackedPersonObservation, quality: QualityAssessment | None) -> float:
        quality_score = self._clip01(getattr(quality, "quality_score", 0.0)) if quality is not None else 0.0
        partial_penalty = 0.45 if self._quality_is_partial_or_fragment(quality) else 0.0
        hits = max(0, int(getattr(track, "track_hits", 0)))
        area = max(0, int(getattr(track.bbox, "area", 0)))
        return (quality_score * 2.0) + min(1.0, hits / 8.0) + min(1.0, area / 200000.0) - partial_penalty

    def _looks_like_duplicate_track(self, left: TrackedPersonObservation, right: TrackedPersonObservation) -> bool:
        iou = self._bbox_iou(left.bbox, right.bbox)
        if iou >= self._clip01(getattr(self._settings, "track_duplicate_iou_threshold", 0.55)):
            return True

        containment = self._smaller_bbox_containment(left.bbox, right.bbox)
        if containment < self._clip01(getattr(self._settings, "track_duplicate_containment_threshold", 0.78)):
            return False

        distance = self._bbox_center_distance(left.bbox, right.bbox)
        max_dimension = max(left.bbox.width, left.bbox.height, right.bbox.width, right.bbox.height, 1)
        distance_ratio = distance / float(max_dimension)
        if distance_ratio <= max(0.0, float(getattr(self._settings, "track_duplicate_center_distance_ratio", 0.42))):
            return True

        return False

    def _quality_is_partial_or_fragment(self, quality: QualityAssessment | None) -> bool:
        if quality is None:
            return True
        codes = {str(item).lower() for item in list(getattr(quality, "reason_codes", []) or [])}
        return bool(
            getattr(quality, "is_partial_limb_only", False)
            or getattr(quality, "is_lower_body_only", False)
            or "border_fragment" in codes
            or "limb_only_or_tiny_fragment" in codes
            or "head_cropped_by_frame_border" in codes
        )

    def _bbox_iou(self, left: BBox, right: BBox) -> float:
        inter = self._bbox_intersection_area(left, right)
        if inter <= 0:
            return 0.0
        union = left.area + right.area - inter
        if union <= 0:
            return 0.0
        return self._clip01(inter / float(union))

    def _smaller_bbox_containment(self, left: BBox, right: BBox) -> float:
        inter = self._bbox_intersection_area(left, right)
        smaller = max(1, min(left.area, right.area))
        return self._clip01(inter / float(smaller))

    @staticmethod
    def _bbox_intersection_area(left: BBox, right: BBox) -> int:
        x1 = max(int(left.x1), int(right.x1))
        y1 = max(int(left.y1), int(right.y1))
        x2 = min(int(left.x2), int(right.x2))
        y2 = min(int(left.y2), int(right.y2))
        return max(0, x2 - x1) * max(0, y2 - y1)

    @staticmethod
    def _bbox_center_distance(left: BBox, right: BBox) -> float:
        lx, ly = left.center
        rx, ry = right.center
        return math.sqrt((lx - rx) ** 2 + (ly - ry) ** 2)

    def _build_quality_by_track_id(self, *, frame: np.ndarray, tracking_result: TrackingFrameResult) -> dict[int, QualityAssessment]:
        tracks = tracking_result.visible_tracks
        all_bboxes = [track.bbox for track in tracks]
        result: dict[int, QualityAssessment] = {}
        for track in tracks:
            peer_bboxes = [bbox for bbox in all_bboxes if bbox != track.bbox]
            quality = self._quality_gate.assess(frame=frame, bbox=track.bbox, peer_bboxes=peer_bboxes)
            result[track.track_id] = self._normalize_quality_for_track(track=track, quality=quality)
        return result

    def _normalize_quality_for_track(self, *, track: TrackedPersonObservation, quality: QualityAssessment) -> QualityAssessment:
        reason_codes = list(quality.reason_codes)
        headwear_context_usable = bool(getattr(quality, "headwear_context_usable", False))
        is_usable_for_tracking = bool(quality.is_valid and track.is_usable_track(min_confidence=0.0))
        is_interaction_risk = bool(getattr(quality, "is_interaction_risk", False)) or "peer_occlusion" in {str(x) for x in reason_codes}
        visibility_state = str(getattr(quality, "visibility_state", "") or "")
        if not visibility_state or visibility_state == "unknown":
            if is_interaction_risk:
                visibility_state = "interaction_risk"
            elif not quality.head_visible:
                visibility_state = "head_occluded"
            elif quality.is_low_quality:
                visibility_state = "not_evaluable"
            else:
                visibility_state = "head_visible"
        return QualityAssessment(
            is_valid=quality.is_valid,
            quality_score=quality.quality_score,
            head_visible=quality.head_visible,
            is_cropped=quality.is_cropped,
            occlusion_ratio=quality.occlusion_ratio,
            bbox_area_ratio=quality.bbox_area_ratio,
            is_usable_for_tracking=is_usable_for_tracking,
            is_usable_for_headwear=bool(quality.is_usable_for_headwear and headwear_context_usable and not is_interaction_risk),
            is_low_quality=quality.is_low_quality,
            is_truncated=quality.is_truncated,
            is_occluded=quality.is_occluded,
            is_partial_limb_only=bool(getattr(quality, "is_partial_limb_only", False)),
            is_lower_body_only=bool(getattr(quality, "is_lower_body_only", False)),
            is_bent_over=bool(getattr(quality, "is_bent_over", False)),
            is_interaction_risk=is_interaction_risk,
            headwear_context_usable=bool(headwear_context_usable and not is_interaction_risk),
            visibility_state=visibility_state,
            reasons=list(quality.reasons),
            reason_codes=reason_codes,
            is_usable_for_identity=False,
            body_usable_for_identity=False,
            upper_body_usable_for_identity=False,
            lower_body_usable_for_identity=False,
            footwear_usable_for_identity=False,
        )

    def _build_observations_for_frame(
        self,
        *,
        tracking_result: TrackingFrameResult,
        episode_result: TrackEpisodeFrameResult,
        qualities_by_track_id: dict[int, QualityAssessment],
        frame_shape: tuple[int, ...],
    ) -> list[_FrameObservationBundle]:
        bundles: list[_FrameObservationBundle] = []
        for track in tracking_result.visible_tracks:
            quality = qualities_by_track_id.get(track.track_id) or self._missing_quality()
            assignment = episode_result.assignments_by_track_id.get(track.track_id)
            if assignment is None or assignment.track_episode_id is None:
                continue
            observation = build_track_observation_from_tracking(
                camera_id=self._camera_id,
                tracked_observation=track,
                episode_assignment=assignment,
                quality=quality,
                frame_shape=frame_shape,
                registry_min_quality=float(self._settings.min_quality_score),
            )
            bundles.append(_FrameObservationBundle(track=track, quality=quality, episode_assignment=assignment, observation=observation))
        return bundles

    @staticmethod
    def _missing_quality() -> QualityAssessment:
        return QualityAssessment(
            is_valid=False,
            quality_score=0.0,
            head_visible=False,
            is_cropped=True,
            occlusion_ratio=1.0,
            bbox_area_ratio=0.0,
            reasons=["quality_missing"],
            reason_codes=["quality_missing"],
            is_usable_for_tracking=False,
            is_usable_for_headwear=False,
            is_low_quality=True,
            is_truncated=True,
            is_occluded=True,
            headwear_context_usable=False,
            visibility_state="not_evaluable",
        )

    def _append_rejected_person_overlay_items(
        self,
        *,
        result: _FrameProcessingResult,
        person_box_result: Any,
    ) -> None:
        if not bool(getattr(self._settings, "processed_video_draw_rejected_person_boxes", True)):
            return

        already_displayed = {int(item.track_id) for item in result.items}
        decisions = getattr(person_box_result, "decisions_by_track_id", {}) or {}
        for track in getattr(person_box_result, "rejected_tracks", []) or []:
            track_id = int(getattr(track, "track_id", -1))
            if track_id in already_displayed:
                continue

            decision = decisions.get(track_id)
            reason_codes = list(getattr(decision, "reason_codes", []) or list(getattr(track, "reason_codes", []) or []))
            reason = self._first_reason(reason_codes, fallback="person_box_rejected")
            result.items.append(
                _PreviewOverlayItem(
                    bbox=track.bbox,
                    track_id=track_id,
                    track_episode_id=None,
                    display_id=f"raw-rejected-{track_id}",
                    signal=ComplianceSignal.UNKNOWN,
                    confidence=0.0,
                    quality_score=0.0,
                    reason=reason,
                    incident_state=None,
                    stage="rejected_person",
                    reason_codes=reason_codes,
                )
            )

    @staticmethod
    def _first_reason(values: list[str], *, fallback: str) -> str:
        for raw in values:
            value = str(raw or "").strip()
            if value:
                return value
        return fallback

    def _append_candidate_overlay_items(
        self,
        *,
        result: _FrameProcessingResult,
        tracking_result: TrackingFrameResult,
        episode_result: TrackEpisodeFrameResult,
        qualities_by_track_id: dict[int, QualityAssessment],
    ) -> None:
        if not bool(getattr(self._settings, "track_candidate_overlay_enabled", True)):
            return

        already_displayed = {int(item.track_id) for item in result.items}
        for track in tracking_result.visible_tracks:
            track_id = int(track.track_id)
            if track_id in already_displayed:
                continue

            assignment = episode_result.assignments_by_track_id.get(track_id)
            if assignment is not None and assignment.track_episode_id:
                continue

            quality = qualities_by_track_id.get(track_id) or self._missing_quality()
            reason = self._candidate_overlay_reason(assignment=assignment, quality=quality)
            result.items.append(
                _PreviewOverlayItem(
                    bbox=track.bbox,
                    track_id=track_id,
                    track_episode_id=None,
                    display_id=f"candidate-{track_id}",
                    signal=ComplianceSignal.UNKNOWN,
                    confidence=0.0,
                    quality_score=quality.quality_score,
                    reason=reason,
                    incident_state=None,
                    stage="candidate",
                )
            )

    def _candidate_overlay_reason(
        self,
        *,
        assignment: TrackEpisodeAssignment | None,
        quality: QualityAssessment,
    ) -> str:
        if assignment is not None and getattr(assignment, "reason", None):
            return str(assignment.reason)
        visibility = str(getattr(quality, "visibility_state", "") or "")
        if visibility:
            return f"candidate:{visibility}"
        return "candidate_track"

    def _should_pre_skip_headwear(self, *, observation: TrackObservation) -> bool:
        if not bool(getattr(self._settings, "headwear_pre_skip_unusable", True)):
            return False
        return not bool(observation.is_usable_for_headwear)

    @staticmethod
    def _with_headwear_reason_code(headwear: HeadwearAssessment, code: str) -> HeadwearAssessment:
        codes = list(getattr(headwear, "reason_codes", []) or [])
        if code not in codes:
            codes.append(code)
        return HeadwearAssessment(
            signal=headwear.signal,
            confidence=headwear.confidence,
            reason=headwear.reason,
            label=headwear.label,
            class_id=headwear.class_id,
            model_name=headwear.model_name,
            quality_score=headwear.quality_score,
            reason_codes=codes,
            raw_scores=dict(headwear.raw_scores),
        )

    def _pre_skipped_headwear_assessment(self, observation: TrackObservation) -> HeadwearAssessment:
        reason = self._pre_skip_headwear_reason(observation)
        return HeadwearAssessment(
            signal=ComplianceSignal.UNKNOWN,
            confidence=0.0,
            reason=reason,
            reason_codes=["headwear_pre_skipped", "headwear_skipped_visibility", reason],
            quality_score=observation.quality_score,
        )

    @staticmethod
    def _pre_skip_headwear_reason(observation: TrackObservation) -> str:
        visibility = str(getattr(observation, "visibility_state", "") or "").strip().lower()
        if bool(getattr(observation, "interaction_risk", False)) or visibility == "interaction_risk":
            return "headwear_skipped_interaction_risk"
        if visibility in {"limb_only", "lower_body_only", "bent_over_unclear", "head_occluded", "not_evaluable", "too_small", "too_blurry"}:
            return f"headwear_skipped_{visibility}"
        if bool(getattr(observation, "is_truncated", False)):
            return "headwear_skipped_truncated_track"
        if bool(getattr(observation, "is_occluded", False)):
            return "headwear_skipped_occluded_track"
        return "headwear_skipped_not_usable"

    @staticmethod
    def _is_visibility_skip_reason(headwear: HeadwearAssessment) -> bool:
        codes = {str(item).lower() for item in list(getattr(headwear, "reason_codes", []) or [])}
        return "headwear_skipped_visibility" in codes

    def _process_headwear_and_incidents(
        self,
        *,
        frame: np.ndarray,
        bundles: list[_FrameObservationBundle],
        run_headwear: bool,
    ) -> _FrameProcessingResult:
        result = _FrameProcessingResult(items=[])
        for bundle in bundles:
            if bundle.quality.is_valid:
                result.valid_quality_count += 1
            else:
                result.quality_rejected_count += 1

            if bundle.observation.interaction_risk:
                result.interaction_risk_count += 1
            if bool(getattr(bundle.quality, "is_lower_body_only", False)):
                result.lower_body_only_count += 1
            if bool(getattr(bundle.quality, "is_partial_limb_only", False)):
                result.limb_only_count += 1
            if bool(getattr(bundle.quality, "is_bent_over", False)):
                result.bent_over_count += 1

            if bundle.observation.is_usable_for_headwear:
                result.headwear_evaluable_count += 1
            else:
                result.headwear_not_evaluable_count += 1

            incident_case: IncidentCase | None = None
            should_update_episode_headwear_stats = True
            timestamp_seconds = self._timestamp_seconds_for_observation(bundle.observation)
            head_observation = self._head_detector.detect_for_observation(
                frame=frame,
                observation=bundle.observation,
                timestamp_seconds=timestamp_seconds,
            )
            bundle.head_observation = head_observation

            if not run_headwear:
                headwear = self._headwear_not_scheduled_assessment(bundle.observation)
                result.headwear_classification_not_scheduled_count += 1
                should_update_episode_headwear_stats = False
            elif self._should_pre_skip_headwear(observation=bundle.observation):
                headwear = self._pre_skipped_headwear_assessment(bundle.observation)
                result.headwear_pre_skipped_count += 1
                if self._is_visibility_skip_reason(headwear):
                    result.headwear_skipped_visibility_count += 1
            elif not bool(head_observation.classifier_may_run):
                headwear = self._head_not_actionable_assessment(bundle.observation, head_observation)
                result.headwear_classification_not_scheduled_count += 1
            else:
                headwear = self._headwear_detector.assess_head_observation(
                    frame=frame,
                    observation=bundle.observation,
                    head_observation=head_observation,
                )
                headwear = self._with_headwear_reason_code(headwear, "headwear_model_called")
                result.headwear_model_called_count += 1

            headwear = self._apply_headwear_model_policy(headwear)
            bundle.headwear = headwear

            track_binding = TrackEpisodeBinding.from_track_observation(
                observation=bundle.observation,
                timestamp_seconds=timestamp_seconds,
                head_observation=head_observation,
            )
            headwear_observation = build_headwear_observation_from_assessment(
                assessment=headwear,
                track_binding=track_binding,
                head_observation=head_observation,
            )
            bundle.headwear_observation = headwear_observation

            if run_headwear and headwear.signal == ComplianceSignal.UNKNOWN:
                result.headwear_unknown_count += 1

            head_crop_rejected = self._head_crop_was_rejected(headwear)
            headwear_skipped_bad_crop = self._headwear_was_skipped_bad_crop(headwear)

            if run_headwear and self._headwear_incidents_are_enabled():
                incident_result = self._incident_engine.process_headwear_observation(
                    headwear_observation=headwear_observation,
                    track_binding=track_binding,
                    frame_path=None,
                )
                incident_case = incident_result.case
            bundle.incident_case = incident_case

            evidence_frame_path = None
            if run_headwear:
                evidence_frame_path = self._capture_violation_evidence_after_incident_decision(
                    frame=frame,
                    observation=bundle.observation,
                    head_observation=head_observation,
                    headwear=headwear,
                    headwear_observation=headwear_observation,
                    case=incident_case,
                )
            bundle.evidence_frame_path = evidence_frame_path
            if incident_case is not None and evidence_frame_path is not None:
                self._attach_evidence_to_case(
                    case=incident_case,
                    evidence_frame_path=evidence_frame_path,
                    confidence=headwear.confidence,
                    observed_at=bundle.observation.observed_at,
                )

            self._metrics.record_observation(
                observed_at=bundle.observation.observed_at,
                frame_index=bundle.observation.frame_index,
                source_track_id=bundle.observation.source_track_id,
                track_episode_id=bundle.observation.track_episode_id,
                bbox=RuntimeMetricsRecorder.bbox_to_text(bundle.observation.bbox),
                head_bbox=RuntimeMetricsRecorder.bbox_to_text(bundle.head_observation.head_bbox if bundle.head_observation is not None else None),
                quality_score=bundle.observation.quality_score,
                bbox_area_ratio=bundle.observation.bbox_area_ratio,
                occlusion_ratio=bundle.observation.occlusion_ratio,
                visibility_state=bundle.observation.visibility_state,
                headwear_context_usable=bundle.observation.headwear_context_usable,
                interaction_risk=bundle.observation.interaction_risk,
                is_lower_body_only=getattr(bundle.quality, "is_lower_body_only", False),
                is_partial_limb_only=getattr(bundle.quality, "is_partial_limb_only", False),
                is_bent_over=getattr(bundle.quality, "is_bent_over", False),
                is_truncated=bundle.observation.is_truncated,
                is_occluded=bundle.observation.is_occluded,
                headwear_signal=headwear.signal.value,
                headwear_label=headwear.label,
                headwear_confidence=headwear.confidence,
                head_crop_rejected=head_crop_rejected,
                headwear_skipped_bad_crop=headwear_skipped_bad_crop,
                headwear_model_called="headwear_model_called" in set(headwear.reason_codes),
                headwear_pre_skipped="headwear_pre_skipped" in set(headwear.reason_codes),
                headwear_skipped_visibility="headwear_skipped_visibility" in set(headwear.reason_codes),
                headwear_classification_not_scheduled="headwear_classification_not_scheduled" in set(headwear.reason_codes),
                incident_id=incident_case.case_id if incident_case is not None else None,
                incident_state=incident_case.state.value if incident_case is not None else None,
                reason_codes=bundle.observation.reason_codes + list(headwear.reason_codes) + [headwear.reason],
            )

            if head_crop_rejected:
                result.head_crop_rejected_count += 1
            if headwear_skipped_bad_crop:
                result.headwear_skipped_bad_crop_count += 1

            if should_update_episode_headwear_stats:
                self._track_episode_registry.mark_headwear_result(
                    track_episode_id=bundle.observation.track_episode_id,
                    headwear_evaluable=bundle.observation.is_usable_for_headwear,
                    headwear_unknown=headwear.signal == ComplianceSignal.UNKNOWN,
                    violation=headwear.signal == ComplianceSignal.VIOLATION,
                    interaction_risk=bundle.observation.interaction_risk,
                    quality_score=bundle.observation.quality_score,
                    active_incident_id=incident_case.case_id if incident_case is not None else None,
                    head_crop_rejected=head_crop_rejected,
                    headwear_skipped_bad_crop=headwear_skipped_bad_crop,
                    headwear_model_called="headwear_model_called" in set(headwear.reason_codes),
                    headwear_pre_skipped="headwear_pre_skipped" in set(headwear.reason_codes),
                    headwear_skipped_visibility="headwear_skipped_visibility" in set(headwear.reason_codes),
                )

            result.items.append(
                _PreviewOverlayItem(
                    bbox=bundle.track.bbox,
                    track_id=bundle.track.track_id,
                    track_episode_id=bundle.observation.track_episode_id,
                    display_id=self._display_id(bundle.observation),
                    signal=headwear.signal,
                    confidence=headwear.confidence,
                    quality_score=bundle.quality.quality_score,
                    reason=self._overlay_reason(observation=bundle.observation, headwear=headwear),
                    incident_state=incident_case.state if incident_case is not None else None,
                    stage="headwear_evaluable",
                    reason_codes=bundle.observation.reason_codes + list(headwear.reason_codes),
                )
            )
        return result

    @staticmethod
    def _timestamp_seconds_for_observation(observation: TrackObservation) -> float:
        value = getattr(observation, "timestamp_seconds", None)
        try:
            if value is not None:
                return float(value)
        except Exception:
            pass
        return 0.0

    @staticmethod
    def _head_not_actionable_assessment(observation: TrackObservation, head_observation: HeadObservation) -> HeadwearAssessment:
        status = getattr(head_observation, "status", "head_not_detected")
        reason = status.value if hasattr(status, "value") else str(status)
        return HeadwearAssessment(
            signal=ComplianceSignal.UNKNOWN,
            confidence=0.0,
            reason=reason,
            reason_codes=list(getattr(head_observation, "reason_codes", []) or []) + ["classifier_not_scheduled_without_actionable_head"],
            quality_score=observation.quality_score,
        )

    @staticmethod
    def _headwear_not_scheduled_assessment(observation: TrackObservation) -> HeadwearAssessment:
        return HeadwearAssessment(
            signal=ComplianceSignal.UNKNOWN,
            confidence=0.0,
            reason="headwear_classification_not_scheduled",
            reason_codes=["headwear_classification_not_scheduled"],
            quality_score=observation.quality_score,
        )


    def _apply_headwear_model_policy(self, headwear: HeadwearAssessment) -> HeadwearAssessment:
        policy = str(getattr(self._settings, "headwear_model_policy", "diagnostic_only") or "diagnostic_only").strip().lower()
        if policy == "production":
            return headwear
        if headwear.signal == ComplianceSignal.UNKNOWN:
            return headwear
        return HeadwearAssessment(
            signal=ComplianceSignal.UNKNOWN,
            confidence=headwear.confidence,
            reason=f"headwear_model_policy_{policy}_no_incident_signal",
            label=headwear.label,
            class_id=headwear.class_id,
            model_name=headwear.model_name,
            quality_score=headwear.quality_score,
            reason_codes=list(headwear.reason_codes) + ["diagnostic_model_signal_suppressed"],
            raw_scores=dict(headwear.raw_scores),
        )

    def _headwear_incidents_are_enabled(self) -> bool:
        policy = str(getattr(self._settings, "headwear_model_policy", "diagnostic_only") or "diagnostic_only").strip().lower()
        return bool(getattr(self._settings, "headwear_incidents_enabled", False)) and policy == "production"

    @staticmethod
    def _head_crop_was_rejected(headwear: HeadwearAssessment) -> bool:
        # Deprecated metric name kept for API/CSV compatibility. In the current
        # pipeline the production crop is the accepted person crop, not a narrow
        # geometric head crop.
        codes = {str(item).lower() for item in list(getattr(headwear, "reason_codes", []) or [])}
        reason = str(getattr(headwear, "reason", "") or "").lower()
        return bool(
            "head_crop_rejected" in codes
            or "person_crop_rejected" in codes
            or reason
            in {
                "head_crop_unavailable",
                "head_crop_too_small",
                "head_crop_bbox_unavailable",
                "person_crop_unavailable",
                "person_crop_too_small",
                "person_crop_bbox_invalid",
            }
        )

    @staticmethod
    def _headwear_was_skipped_bad_crop(headwear: HeadwearAssessment) -> bool:
        codes = {str(item).lower() for item in list(getattr(headwear, "reason_codes", []) or [])}
        reason = str(getattr(headwear, "reason", "") or "").lower()
        return bool(
            "headwear_skipped_bad_crop" in codes
            or reason.startswith("head_crop")
            or reason.startswith("person_crop")
        )

    # ========================================================
    # Evidence
    # ========================================================

    def _capture_violation_evidence_after_incident_decision(
        self,
        *,
        frame: np.ndarray,
        observation: TrackObservation,
        head_observation: HeadObservation | None,
        headwear: HeadwearAssessment,
        headwear_observation: HeadwearObservation | None,
        case: IncidentCase | None,
    ) -> str | None:
        if case is None:
            return None
        if case.state != IncidentState.OPEN:
            return None
        if headwear.signal != ComplianceSignal.VIOLATION:
            return None
        if headwear_observation is None or not headwear_observation.is_actionable:
            return None
        if head_observation is None or not head_observation.classifier_may_run:
            return None
        if not observation.is_usable_for_incident:
            return None
        if headwear.confidence < self._incident_min_quality_score():
            return None
        if not self._incident_evidence_limiter.should_save(
            case_id=case.case_id,
            observed_at=observation.observed_at,
            current_evidence_count=case.evidence_count,
        ):
            return None

        record = self._frame_store.save_incident_evidence(
            frame=frame,
            camera_id=self._camera_id,
            observed_at=observation.observed_at,
            frame_index=observation.frame_index,
            track_id=observation.track_id,
            track_episode_id=observation.track_episode_id,
            source_track_id=observation.source_track_id,
            person_id=None,
            candidate_id=None,
            incident_id=case.case_id,
            bbox=observation.bbox,
            head_bbox=head_observation.head_bbox if head_observation is not None else None,
            quality_score=observation.quality_score,
            headwear_status=headwear.signal.value,
            identity_decision_type="track_episode",
            scene_zone=observation.scene_zone,
            visibility_state=observation.visibility_state,
            headwear_context_usable=observation.headwear_context_usable,
            reason_codes=observation.reason_codes + [headwear.reason],
            evidence_type="incident",
            min_quality_score=self._incident_min_quality_score(),
        )
        if record is None:
            return None

        self._incident_evidence_limiter.register_saved(
            case_id=case.case_id,
            observed_at=observation.observed_at,
            confidence=headwear.confidence,
            quality_score=observation.quality_score,
            current_evidence_count=case.evidence_count + 1,
        )

        if record.head_crop_path and case.best_head_crop_path is None:
            case.best_head_crop_path = record.head_crop_path
        if record.crop_path and case.best_person_crop_path is None:
            case.best_person_crop_path = record.crop_path
        return record.image_path or record.crop_path

    def _attach_evidence_to_case(self, *, case: IncidentCase, evidence_frame_path: str, confidence: float, observed_at: datetime) -> None:
        if not evidence_frame_path:
            return
        case.evidence_count += 1
        case.last_confirmed_at = max(case.last_confirmed_at, observed_at)
        normalized_confidence = self._clip01(confidence)
        if case.best_frame_path is None or normalized_confidence >= case.max_confidence:
            case.best_frame_path = evidence_frame_path
            case.max_confidence = normalized_confidence
        marker = getattr(self._incident_engine, "_mark_case_changed", None)
        if callable(marker):
            marker(case.case_id)

    # ========================================================
    # Overlay
    # ========================================================

    def _draw_overlay(self, *, frame: np.ndarray, items: list[_PreviewOverlayItem], observed_at: datetime, stats: RuntimeStats) -> np.ndarray:
        canvas = frame.copy()
        for item in items:
            clipped = self._clip_bbox_to_canvas(item.bbox, canvas)
            if clipped is None:
                continue
            color = self._overlay_color(item.signal, stage=item.stage)
            thickness = 1 if item.stage == "rejected_person" else 2
            cv2.rectangle(canvas, (clipped.x1, clipped.y1), (clipped.x2, clipped.y2), color, thickness)
            label = self._overlay_label(item)
            self._draw_label(canvas=canvas, text=label[:170], x=clipped.x1, y=max(18, clipped.y1 - 6), color=(255, 255, 255), background=color)

        header = (
            f"{observed_at.isoformat()} | processed={stats.total_frames_processed} | "
            f"tracks={stats.active_tracks} | episodes={stats.active_track_episodes} | incidents={stats.active_incidents_count}"
        )
        self._draw_label(canvas=canvas, text=header[:180], x=12, y=28, color=(255, 255, 255), background=(35, 35, 35))
        return canvas

    @staticmethod
    def _overlay_color(signal: ComplianceSignal, *, stage: str = "accepted") -> tuple[int, int, int]:
        if stage == "rejected_person":
            return 0, 140, 255
        if stage == "candidate":
            return 0, 140, 255
        if signal == ComplianceSignal.VIOLATION:
            return 0, 0, 255
        if signal == ComplianceSignal.COMPLIANT:
            return 0, 180, 0
        return 255, 170, 40

    @staticmethod
    def _overlay_label(item: _PreviewOverlayItem) -> str:
        if item.stage == "rejected_person":
            reason = item.reason or "person_box_rejected"
            return f"{item.display_id} | rejected_for_headwear | {reason}"
        label = f"{item.display_id} | {item.signal.value} {item.confidence:.2f} | q={item.quality_score:.2f}"
        if item.incident_state is not None:
            label += f" | incident={item.incident_state.value}"
        return label

    @staticmethod
    def _draw_label(*, canvas: np.ndarray, text: str, x: int, y: int, color: tuple[int, int, int], background: tuple[int, int, int] = (0, 0, 0)) -> None:
        font = cv2.FONT_HERSHEY_SIMPLEX
        scale = 0.55
        thickness = 2
        text_size, baseline = cv2.getTextSize(text, font, scale, thickness)
        text_w, text_h = text_size
        canvas_h, canvas_w = canvas.shape[:2]
        x = max(0, min(canvas_w - 1, int(x)))
        y = max(text_h + 4, min(canvas_h - 1, int(y)))
        box_x1 = x
        box_y1 = max(0, y - text_h - baseline - 6)
        box_x2 = min(canvas_w - 1, x + text_w + 8)
        box_y2 = min(canvas_h - 1, y + baseline + 4)
        cv2.rectangle(canvas, (box_x1, box_y1), (box_x2, box_y2), background, -1)
        cv2.putText(canvas, text, (x + 4, y), font, scale, color, thickness, cv2.LINE_AA)

    @staticmethod
    def _clip_bbox_to_canvas(bbox: BBox, canvas: np.ndarray) -> BBox | None:
        height, width = canvas.shape[:2]
        clipped = BBox(
            x1=max(0, min(width - 1, int(bbox.x1))),
            y1=max(0, min(height - 1, int(bbox.y1))),
            x2=max(0, min(width - 1, int(bbox.x2))),
            y2=max(0, min(height - 1, int(bbox.y2))),
        )
        if clipped.x2 <= clipped.x1 or clipped.y2 <= clipped.y1:
            return None
        return clipped

    # ========================================================
    # Readiness / backend sync
    # ========================================================

    def _pipeline_ready_for_target(self) -> bool:
        if not self._person_tracking_engine.ready():
            return False
        if bool(getattr(self._settings, "person_crop_collection_enabled", False)):
            return True
        if self._settings.runtime_require_real_headwear and self._headwear_detector.mode == "placeholder":
            return False
        if self._headwear_detector.mode != "placeholder" and not self._headwear_detector.ready:
            return False
        return True

    def _collect_startup_readiness_errors(self, *, source_url: str, require_headwear: bool = True, detection_only: bool = False) -> list[str]:
        errors: list[str] = []
        if detection_only and hasattr(self._person_tracking_engine, "warmup_detection_only"):
            tracking_ok, tracking_reason = self._person_tracking_engine.warmup_detection_only()
        else:
            tracking_ok, tracking_reason = self._person_tracking_engine.warmup()
        if not tracking_ok:
            errors.append(tracking_reason or "person tracking backend is not ready")
        if require_headwear:
            headwear_ok, headwear_reason = self._headwear_detector.warmup()
            if not headwear_ok:
                errors.append(headwear_reason or "headwear detector is not ready")
        if self._settings.runtime_require_source_probe_success and not self._probe_source(source_url):
            errors.append(f"source probe failed: {source_url}")
        return errors

    def _sync_incidents_if_needed(self, *, stats: RuntimeStats, incidents: list[IncidentCase]) -> None:
        if not incidents or not self._backend_client.is_enabled():
            return
        unique_by_case_id = {incident.case_id: incident for incident in incidents}
        for incident in unique_by_case_id.values():
            # Candidate/cooldown are internal. Backend gets only confirmed OPEN
            # incidents and final CLOSED updates for incidents that already have evidence.
            if incident.state == IncidentState.CANDIDATE:
                continue
            if incident.state == IncidentState.COOLDOWN:
                continue
            if incident.state == IncidentState.CLOSED and incident.evidence_count <= 0:
                continue
            stats.incident_sync_attempts += 1
            ok = self._backend_client.post_json(self._settings.backend_incidents_path, self._incident_backend_payload(incident))
            if ok:
                stats.incident_sync_successes += 1

    # ========================================================
    # Video helpers
    # ========================================================

    def _resolve_runtime_source(self, source_url: str) -> str:
        text = str(source_url or "").strip()
        if not text:
            return text
        if self._is_probable_url(text):
            return text
        path = Path(text).expanduser()
        if path.is_absolute():
            return str(path)
        return str(path.resolve())

    def _resolve_processed_video_output_path(self, output_path: str | None) -> Path:
        if output_path is not None and output_path.strip():
            return Path(output_path).expanduser().resolve()
        output_dir = Path(self._settings.processed_video_dir).expanduser().resolve()
        stamp = utc_now().strftime("%Y%m%d_%H%M%S")
        return output_dir / f"{self._camera_id}_{stamp}_processed.mp4"

    def _resolve_processed_video_fps(self, source_fps: float) -> float:
        configured = float(self._settings.processed_video_fps)
        if configured > 0:
            return configured
        if source_fps > 0:
            return source_fps
        return 7.0

    @staticmethod
    def _seek_capture_to_start_seconds(
        *,
        capture: cv2.VideoCapture,
        start_seconds: float,
        source_fps: float,
        source_frame_count: int,
        fallback_fps: float,
    ) -> int:
        safe_start_seconds = max(0.0, float(start_seconds or 0.0))
        if safe_start_seconds <= 0.0:
            return 0

        fps_for_seek = source_fps if source_fps > 0.0 else fallback_fps
        requested_frame_index = int(math.floor(safe_start_seconds * max(0.01, float(fps_for_seek))))
        if source_frame_count > 0:
            requested_frame_index = min(requested_frame_index, max(0, int(source_frame_count) - 1))
        requested_frame_index = max(0, requested_frame_index)

        seek_ok = False
        if source_fps > 0.0:
            try:
                seek_ok = bool(capture.set(cv2.CAP_PROP_POS_FRAMES, requested_frame_index))
            except Exception:
                seek_ok = False

        if not seek_ok:
            try:
                seek_ok = bool(capture.set(cv2.CAP_PROP_POS_MSEC, safe_start_seconds * 1000.0))
            except Exception:
                seek_ok = False

        actual_frame_index = requested_frame_index
        try:
            reported_frame_index = int(capture.get(cv2.CAP_PROP_POS_FRAMES) or requested_frame_index)
            if reported_frame_index > 0:
                actual_frame_index = reported_frame_index
        except Exception:
            actual_frame_index = requested_frame_index

        if source_frame_count > 0:
            actual_frame_index = min(actual_frame_index, max(0, int(source_frame_count) - 1))
        return max(0, int(actual_frame_index))

    def _resolve_total_frames_to_process(self, *, source_frame_count: int, source_fps: float, max_seconds: float) -> int:
        if max_seconds > 0.0:
            fps = source_fps if source_fps > 0 else self._resolve_processed_video_fps(source_fps)
            return max(1, int(math.ceil(max_seconds * max(fps, 0.01))))
        return max(0, int(source_frame_count))

    def _resize_export_frame_if_needed(self, frame: np.ndarray) -> np.ndarray:
        max_width = int(self._settings.processed_video_max_width)
        if max_width <= 0:
            return self._ensure_video_compatible_frame_size(frame)
        height, width = frame.shape[:2]
        if width <= max_width:
            return self._ensure_video_compatible_frame_size(frame)
        scale = max_width / float(max(width, 1))
        resized = cv2.resize(frame, (max_width, max(1, int(round(height * scale)))), interpolation=cv2.INTER_AREA)
        return self._ensure_video_compatible_frame_size(resized)

    def _resize_collection_frame_if_needed(self, frame: np.ndarray) -> np.ndarray:
        max_width = int(getattr(self._settings, "person_crop_collection_max_width", 0))
        if max_width <= 0:
            return frame
        height, width = frame.shape[:2]
        if width <= max_width:
            return frame
        scale = max_width / float(max(width, 1))
        return cv2.resize(frame, (max_width, max(1, int(round(height * scale)))), interpolation=cv2.INTER_AREA)

    @staticmethod
    def _ensure_video_compatible_frame_size(frame: np.ndarray) -> np.ndarray:
        if frame is None or not isinstance(frame, np.ndarray) or frame.ndim < 2:
            return frame
        height, width = frame.shape[:2]
        safe_width = width - (width % 2)
        safe_height = height - (height % 2)
        if safe_width < 2 or safe_height < 2:
            return frame
        if safe_width == width and safe_height == height:
            return frame
        return frame[:safe_height, :safe_width].copy()

    def _open_video_writer(self, *, output_file: Path, frame: np.ndarray, fps: float) -> tuple[cv2.VideoWriter, Path]:
        frame = self._ensure_video_compatible_frame_size(frame)
        height, width = frame.shape[:2]
        if width <= 1 or height <= 1:
            raise RuntimeError(f"Failed to open output video writer: invalid frame size {width}x{height}")
        safe_fps = max(0.01, float(fps))
        configured_fourcc = str(self._settings.processed_video_fourcc or "mp4v").strip()

        candidates: list[tuple[Path, str]] = []
        suffix = output_file.suffix.lower()
        if suffix == ".mp4":
            candidates.extend([(output_file, configured_fourcc[:4]), (output_file, "mp4v"), (output_file, "avc1"), (output_file.with_suffix(".avi"), "XVID")])
        elif suffix == ".avi":
            candidates.extend([(output_file, configured_fourcc[:4]), (output_file, "XVID"), (output_file, "MJPG")])
        else:
            candidates.extend([(output_file, configured_fourcc[:4]), (output_file, "mp4v"), (output_file, "XVID")])

        tried: list[str] = []
        seen: set[tuple[str, str]] = set()
        for candidate_path, fourcc_text in candidates:
            fourcc_text = str(fourcc_text or "")[:4]
            if len(fourcc_text) != 4:
                continue
            key = (str(candidate_path).lower(), fourcc_text)
            if key in seen:
                continue
            seen.add(key)
            candidate_path.parent.mkdir(parents=True, exist_ok=True)
            fourcc = cv2.VideoWriter_fourcc(*fourcc_text)
            writer = cv2.VideoWriter(str(candidate_path), fourcc, safe_fps, (int(width), int(height)))
            tried.append(f"{candidate_path.name}:{fourcc_text}")
            if writer.isOpened():
                return writer, candidate_path
            writer.release()
        raise RuntimeError(f"Failed to open output video writer: {output_file}; tried={', '.join(tried)}")

    @staticmethod
    def _frame_elapsed_seconds(*, frame_index: int, source_fps: float, output_fps: float) -> float:
        fps = source_fps if source_fps > 0 else output_fps
        return max(0.0, float(frame_index - 1) / max(0.01, float(fps)))

    @staticmethod
    def _should_analyze_export_frame(*, elapsed_sec: float, last_analysis_elapsed_sec: float | None, analysis_fps: float) -> bool:
        if last_analysis_elapsed_sec is None:
            return True
        interval = 1.0 / max(0.01, float(analysis_fps))
        return (elapsed_sec - last_analysis_elapsed_sec) >= interval - 1e-9

    @staticmethod
    def _should_write_export_frame(*, elapsed_sec: float, next_write_elapsed_sec: float) -> bool:
        return elapsed_sec + 1e-9 >= next_write_elapsed_sec

    @staticmethod
    def _probe_source(source_url: str) -> bool:
        capture = cv2.VideoCapture(source_url)
        try:
            if not capture.isOpened():
                return False
            ok, frame = capture.read()
            return bool(ok and frame is not None and frame.size > 0)
        finally:
            capture.release()

    # ========================================================
    # Response mapping
    # ========================================================

    @staticmethod
    def _track_episode_response(item: TrackEpisodeRecord) -> TrackEpisodeResponse:
        return TrackEpisodeResponse(
            track_episode_id=item.track_episode_id,
            camera_id=item.camera_id,
            source_track_id=item.source_track_id,
            first_seen_at=item.first_seen_at,
            last_seen_at=item.last_seen_at,
            first_frame_index=item.first_frame_index,
            last_frame_index=item.last_frame_index,
            status=item.status,
            last_quality_score=item.last_quality_score,
            visible_frame_count=item.visible_frame_count,
            headwear_evaluable_frame_count=item.headwear_evaluable_frame_count,
            headwear_unknown_frame_count=item.headwear_unknown_frame_count,
            violation_frame_count=item.violation_frame_count,
            active_incident_id=item.active_incident_id,
            reason_codes=list(item.reason_codes),
        )

    @staticmethod
    def _incident_response(item: IncidentCase) -> IncidentCaseResponse:
        return IncidentCaseResponse(
            case_id=item.case_id,
            track_episode_id=item.track_episode_id,
            source_track_id=item.source_track_id,
            camera_id=item.camera_id,
            opened_at=item.opened_at,
            last_confirmed_at=item.last_confirmed_at,
            closed_at=item.closed_at,
            state=item.state,
            best_frame_path=item.best_frame_path,
            best_person_crop_path=item.best_person_crop_path,
            best_head_crop_path=item.best_head_crop_path,
            best_clip_path=item.best_clip_path,
            evidence_count=item.evidence_count,
            max_confidence=item.max_confidence,
            violation_duration_sec=item.violation_duration_sec,
            reason_codes=list(item.reason_codes),
        )

    @staticmethod
    def _incident_backend_payload(item: IncidentCase) -> dict[str, Any]:
        return {
            "caseId": item.case_id,
            "trackEpisodeId": item.track_episode_id,
            "sourceTrackId": item.source_track_id,
            "cameraId": item.camera_id,
            "openedAt": item.opened_at.isoformat(),
            "lastConfirmedAt": item.last_confirmed_at.isoformat(),
            "closedAt": item.closed_at.isoformat() if item.closed_at else None,
            "state": item.state.value,
            "bestFramePath": item.best_frame_path,
            "bestPersonCropPath": item.best_person_crop_path,
            "bestHeadCropPath": item.best_head_crop_path,
            "bestClipPath": item.best_clip_path,
            "evidenceCount": item.evidence_count,
            "maxConfidence": item.max_confidence,
            "violationDurationSec": item.violation_duration_sec,
            "reasonCodes": list(item.reason_codes),
        }

    # ========================================================
    # Generic helpers
    # ========================================================

    @staticmethod
    def _display_id(observation: TrackObservation) -> str:
        if observation.track_episode_id:
            tail = observation.track_episode_id.split("__")[-1]
            return f"track_{observation.track_id}:{tail}"
        return f"track_{observation.track_id}"

    @staticmethod
    def _overlay_reason(*, observation: TrackObservation, headwear: HeadwearAssessment) -> str:
        if headwear.reason:
            return f"{observation.visibility_state}; {headwear.reason}"
        return observation.visibility_state

    def _update_progress_stats(self, *, stats: RuntimeStats, wall_started_at: datetime, current_frame_index: int, observed_at: datetime) -> None:
        stats.last_frame_at = observed_at
        stats.tracking_backend = self._person_tracking_engine.last_diagnostics().backend_name
        stats.tracking_ready = self._person_tracking_engine.ready()
        stats.tracking_failure_reason = self._person_tracking_engine.failure_reason()
        total = max(0, int(stats.total_frames_to_process))
        if total > 0:
            stats.export_progress_percent = max(0.0, min(100.0, 100.0 * float(current_frame_index) / float(total)))
        else:
            stats.export_progress_percent = 0.0
        elapsed_wall = max(0.001, (utc_now() - wall_started_at).total_seconds())
        if current_frame_index > 0 and total > 0:
            frames_per_sec = current_frame_index / elapsed_wall
            remaining = max(0, total - current_frame_index)
            stats.export_eta_sec = remaining / max(frames_per_sec, 0.001)
        else:
            stats.export_eta_sec = 0.0

    def _publish_export_state(self, *, stats: RuntimeStats) -> None:
        with self._state_lock:
            self._stats = RuntimeStats(**stats.model_dump())

    def _incident_min_quality_score(self) -> float:
        return self._clip01(getattr(self._settings, "incident_min_quality_score", 0.35))

    @staticmethod
    def _clip01(value: object) -> float:
        try:
            number = float(value)
        except Exception:
            number = 0.0
        return max(0.0, min(1.0, number))

    @staticmethod
    def _is_probable_url(value: str) -> bool:
        normalized = str(value or "").strip().lower()
        return normalized.startswith(("http://", "https://", "rtsp://", "rtsps://", "udp://", "tcp://"))
