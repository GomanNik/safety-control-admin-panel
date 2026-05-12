# ============================================================
# File: vision/debug_headwear_runtime_video.py
# Purpose:
# - Debugs current runtime headwear decisions on a source video.
# - Uses the real production chain:
#   PersonTrackingEngine -> QualityGate -> HumanObservation -> HeadwearDetector.
# - Writes per-frame CSV with signal/confidence/reason/label.
# - Saves head crops used by the headwear model for visual verification.
# ============================================================

from __future__ import annotations

import argparse
import csv
from collections import Counter, defaultdict
from datetime import timedelta
from pathlib import Path
from statistics import mean

import cv2
import numpy as np

from app.config import get_settings
from app.pipeline.headwear_detector import HeadwearDetector
from app.pipeline.human_observation import build_human_observation_from_tracking
from app.pipeline.person_tracking_engine import PersonTrackingEngine
from app.pipeline.quality_gate import QualityGate
from app.pipeline.tracking_types import (
    DayPersonAssignment,
    DayPersonAssignmentKind,
    DayPersonIdentityState,
)
from app.utils.time_utils import utc_now


def _resolve_source(value: str) -> str:
    text = str(value or "").strip()
    if text.lower().startswith(("http://", "https://", "rtsp://", "rtsps://", "udp://", "tcp://")):
        return text

    path = Path(text).expanduser()
    if path.is_absolute():
        return str(path)

    return str(path.resolve())


def _resize_like_runtime(frame: np.ndarray, max_width: int) -> np.ndarray:
    if max_width <= 0:
        return frame

    height, width = frame.shape[:2]
    if width <= max_width:
        return frame

    scale = max_width / float(max(width, 1))
    new_width = max_width
    new_height = max(1, int(round(height * scale)))

    return cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)


def _bbox_to_text(bbox: object | None) -> str:
    if bbox is None:
        return ""

    return (
        f"{getattr(bbox, 'x1', '')},"
        f"{getattr(bbox, 'y1', '')},"
        f"{getattr(bbox, 'x2', '')},"
        f"{getattr(bbox, 'y2', '')}"
    )


def _visible_parts_to_text(visible_parts: object) -> str:
    names: list[str] = []

    if bool(getattr(visible_parts, "head", False)):
        names.append("head")
    if bool(getattr(visible_parts, "face", False)):
        names.append("face")
    if bool(getattr(visible_parts, "torso", False)):
        names.append("torso")
    if bool(getattr(visible_parts, "legs", False)):
        names.append("legs")
    if bool(getattr(visible_parts, "footwear", False)):
        names.append("footwear")
    if bool(getattr(visible_parts, "full_body", False)):
        names.append("full_body")

    return "|".join(names)


def _draw_debug_frame(
    *,
    frame: np.ndarray,
    person_bbox: object,
    head_bbox: object | None,
    label: str,
) -> np.ndarray:
    canvas = frame.copy()

    cv2.rectangle(
        canvas,
        (int(person_bbox.x1), int(person_bbox.y1)),
        (int(person_bbox.x2), int(person_bbox.y2)),
        (255, 255, 255),
        2,
    )

    if head_bbox is not None:
        cv2.rectangle(
            canvas,
            (int(head_bbox.x1), int(head_bbox.y1)),
            (int(head_bbox.x2), int(head_bbox.y2)),
            (0, 255, 255),
            2,
        )

    y = max(22, int(person_bbox.y1) - 8)
    cv2.putText(
        canvas,
        label[:140],
        (int(person_bbox.x1), y),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (0, 255, 255),
        2,
        cv2.LINE_AA,
    )

    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--output-dir", default="./data/debug/headwear_runtime")
    parser.add_argument("--max-frames", type=int, default=0)
    parser.add_argument("--save-every", type=int, default=25)
    args = parser.parse_args()

    settings = get_settings()

    source_url = _resolve_source(args.source_url)
    output_dir = Path(args.output_dir).expanduser().resolve()
    crops_dir = output_dir / "crops"
    frames_dir = output_dir / "frames"

    output_dir.mkdir(parents=True, exist_ok=True)
    crops_dir.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)

    csv_path = output_dir / "headwear_debug.csv"

    tracker = PersonTrackingEngine(settings)
    quality_gate = QualityGate(settings)
    headwear_detector = HeadwearDetector(settings)

    tracker_ok, tracker_reason = tracker.warmup()
    if not tracker_ok:
        raise RuntimeError(tracker_reason or "Person tracking warmup failed")

    headwear_ok, headwear_reason = headwear_detector.warmup()
    if not headwear_ok:
        raise RuntimeError(headwear_reason or "Headwear detector warmup failed")

    tracker.reset()

    capture = cv2.VideoCapture(source_url)
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open source video: {source_url}")

    source_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
    fps = source_fps if source_fps > 0 else 25.0

    started_at = utc_now()

    signal_counter: Counter[str] = Counter()
    reason_counter: Counter[str] = Counter()
    label_counter: Counter[str] = Counter()
    confidence_by_signal: dict[str, list[float]] = defaultdict(list)

    frames_read = 0
    frames_with_tracks = 0
    rows: list[dict[str, object]] = []

    try:
        while True:
            ok, frame = capture.read()
            if not ok or frame is None:
                break

            frames_read += 1
            if args.max_frames > 0 and frames_read > args.max_frames:
                break

            frame = _resize_like_runtime(
                frame,
                int(getattr(settings, "processed_video_max_width", 0)),
            )

            observed_at = started_at + timedelta(seconds=(frames_read - 1) / max(fps, 0.01))

            tracking_result = tracker.process_frame(
                frame=frame,
                observed_at=observed_at,
            )

            tracks = list(tracking_result.visible_tracks)
            if tracks:
                frames_with_tracks += 1

            all_bboxes = [track.bbox for track in tracks]

            if not tracks:
                rows.append(
                    {
                        "frame_index": frames_read,
                        "track_id": "",
                        "person_bbox": "",
                        "head_crop_bbox": "",
                        "quality_valid": "",
                        "quality_score": "",
                        "head_visible": "",
                        "usable_for_headwear": "",
                        "observation_type": "",
                        "visible_parts": "",
                        "signal": "no_track",
                        "confidence": "",
                        "label": "",
                        "reason": "no_visible_tracks",
                        "crop_path": "",
                        "frame_path": "",
                    }
                )
                continue

            for track in tracks:
                peer_bboxes = [bbox for bbox in all_bboxes if bbox != track.bbox]

                quality = quality_gate.assess(
                    frame=frame,
                    bbox=track.bbox,
                    peer_bboxes=peer_bboxes,
                )

                assignment = DayPersonAssignment(
                    track_id=track.track_id,
                    day_person_id=None,
                    candidate_id=None,
                    kind=DayPersonAssignmentKind.UNKNOWN,
                    state=DayPersonIdentityState.UNKNOWN,
                    confidence=0.0,
                    stable_hits=0,
                    reason="debug_assignment",
                    reason_codes=["debug_assignment"],
                    is_confirmed=False,
                    is_new_person=False,
                )

                observation = build_human_observation_from_tracking(
                    camera_id=settings.camera_id,
                    tracked_observation=track,
                    assignment=assignment,
                    quality=quality,
                    frame_shape=frame.shape,
                    registry_min_quality=float(settings.min_quality_score),
                )

                headwear = headwear_detector.assess_observation(
                    frame=frame,
                    observation=observation,
                )

                head_bbox = headwear_detector._build_head_crop_bbox(  # noqa: SLF001
                    frame=frame,
                    bbox=observation.bbox,
                )

                signal = headwear.signal.value
                confidence = float(headwear.confidence)

                signal_counter[signal] += 1
                reason_counter[str(headwear.reason)] += 1
                if headwear.label:
                    label_counter[str(headwear.label)] += 1
                confidence_by_signal[signal].append(confidence)

                crop_path = ""
                frame_path = ""

                should_save = (
                    args.save_every > 0
                    and frames_read % args.save_every == 0
                    and head_bbox is not None
                )

                if should_save:
                    crop = frame[head_bbox.y1:head_bbox.y2, head_bbox.x1:head_bbox.x2]
                    if crop.size > 0:
                        crop_file = crops_dir / (
                            f"frame_{frames_read:06d}_track_{track.track_id}_"
                            f"{signal}_{confidence:.3f}_{headwear.reason}.jpg"
                        )
                        crop_file = Path(str(crop_file).replace(":", "_").replace("/", "_").replace("\\", "_"))
                        crop_file = crops_dir / crop_file.name
                        cv2.imwrite(str(crop_file), crop)
                        crop_path = str(crop_file)

                    debug_frame = _draw_debug_frame(
                        frame=frame,
                        person_bbox=observation.bbox,
                        head_bbox=head_bbox,
                        label=f"{signal} {confidence:.3f} | {headwear.label} | {headwear.reason}",
                    )
                    frame_file = frames_dir / f"frame_{frames_read:06d}_track_{track.track_id}.jpg"
                    cv2.imwrite(str(frame_file), debug_frame)
                    frame_path = str(frame_file)

                rows.append(
                    {
                        "frame_index": frames_read,
                        "track_id": track.track_id,
                        "person_bbox": _bbox_to_text(observation.bbox),
                        "head_crop_bbox": _bbox_to_text(head_bbox),
                        "quality_valid": quality.is_valid,
                        "quality_score": round(float(quality.quality_score), 4),
                        "head_visible": quality.head_visible,
                        "usable_for_headwear": quality.is_usable_for_headwear,
                        "observation_type": observation.observation_type.value,
                        "visible_parts": _visible_parts_to_text(observation.visible_parts),
                        "signal": signal,
                        "confidence": round(confidence, 6),
                        "label": headwear.label or "",
                        "reason": headwear.reason,
                        "crop_path": crop_path,
                        "frame_path": frame_path,
                    }
                )

    finally:
        capture.release()

    fieldnames = [
        "frame_index",
        "track_id",
        "person_bbox",
        "head_crop_bbox",
        "quality_valid",
        "quality_score",
        "head_visible",
        "usable_for_headwear",
        "observation_type",
        "visible_parts",
        "signal",
        "confidence",
        "label",
        "reason",
        "crop_path",
        "frame_path",
    ]

    with csv_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)

    print("=" * 100)
    print("HEADWEAR DEBUG DONE")
    print("=" * 100)
    print(f"source: {source_url}")
    print(f"csv: {csv_path}")
    print(f"crops: {crops_dir}")
    print(f"frames: {frames_dir}")
    print(f"frames_read: {frames_read}")
    print(f"frames_with_tracks: {frames_with_tracks}")
    print()
    print("signals:")
    for key, value in signal_counter.most_common():
        scores = confidence_by_signal.get(key, [])
        avg = mean(scores) if scores else 0.0
        print(f"  {key}: count={value}, mean_conf={avg:.3f}")

    print()
    print("labels:")
    for key, value in label_counter.most_common():
        print(f"  {key}: {value}")

    print()
    print("top reasons:")
    for key, value in reason_counter.most_common(20):
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()