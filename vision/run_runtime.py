# ============================================================
# File: vision/run_runtime.py
# Purpose:
# - Starts offline processed video export through the local HTTP API.
# - Polls /runtime/status and prints track-centric runtime metrics.
# - Does not use old person/day_person/ReID diagnostics.
# - Can print a short CSV metrics summary after export.
# ============================================================

from __future__ import annotations

import argparse
import csv
import time
from pathlib import Path
from typing import Any

import requests


DEFAULT_BASE_URL = "http://127.0.0.1:8090"
DEFAULT_POLL_INTERVAL_SEC = 2.0
MAX_STATUS_FAILURES = 12

CONNECT_TIMEOUT_SEC = 5.0
READ_TIMEOUT_SEC = 120.0


def _format_eta(seconds: float | int | None) -> str:
    if seconds is None:
        return "unknown"

    try:
        total = max(0, int(float(seconds)))
    except Exception:
        return "unknown"

    minutes, sec = divmod(total, 60)
    hours, minutes = divmod(minutes, 60)

    if hours > 0:
        return f"{hours}h {minutes:02d}m {sec:02d}s"

    return f"{minutes:02d}m {sec:02d}s"


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _safe_float(value: Any) -> float:
    try:
        return float(value or 0.0)
    except Exception:
        return 0.0


def _request_timeout() -> tuple[float, float]:
    return CONNECT_TIMEOUT_SEC, READ_TIMEOUT_SEC


def _get_json(response: requests.Response) -> dict[str, Any]:
    response.raise_for_status()

    data = response.json()
    if not isinstance(data, dict):
        raise ValueError("Expected JSON object response")

    return data


def start_export(
    *,
    session: requests.Session,
    base_url: str,
    source_url: str | None,
    output_path: str | None,
    max_seconds: float | None,
) -> dict[str, Any]:
    return _post_runtime_job(
        session=session,
        base_url=base_url,
        endpoint="export-video",
        source_url=source_url,
        output_value=output_path,
        output_param_name="output_path",
        max_seconds=max_seconds,
        start_seconds=None,
    )


def start_person_crop_collection(
    *,
    session: requests.Session,
    base_url: str,
    source_url: str | None,
    output_dir: str | None,
    max_seconds: float | None,
    start_seconds: float | None,
) -> dict[str, Any]:
    return _post_runtime_job(
        session=session,
        base_url=base_url,
        endpoint="collect-person-crops",
        source_url=source_url,
        output_value=output_dir,
        output_param_name="output_dir",
        max_seconds=max_seconds,
        start_seconds=start_seconds,
    )


def _post_runtime_job(
    *,
    session: requests.Session,
    base_url: str,
    endpoint: str,
    source_url: str | None,
    output_value: str | None,
    output_param_name: str,
    max_seconds: float | None,
    start_seconds: float | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    if source_url:
        params["source_url"] = source_url
    if output_value:
        params[output_param_name] = output_value
    if max_seconds is not None:
        params["max_seconds"] = max_seconds
    if start_seconds is not None:
        params["start_seconds"] = start_seconds

    response = session.post(
        f"{base_url}/runtime/{endpoint}",
        params=params,
        timeout=_request_timeout(),
    )

    return _get_json(response)


def read_status(*, session: requests.Session, base_url: str) -> dict[str, Any]:
    response = session.get(
        f"{base_url}/runtime/status",
        timeout=_request_timeout(),
    )

    return _get_json(response)


def _print_start_response(start_response: dict[str, Any]) -> None:
    ok = bool(start_response.get("ok", False))
    message = str(start_response.get("message") or "")

    print(f"start_ok={'yes' if ok else 'no'}")
    if message:
        print(message)


def monitor_export(*, session: requests.Session, base_url: str, poll_interval: float) -> dict[str, Any]:
    last_line = ""
    status_failures = 0
    final_status: dict[str, Any] = {}

    while True:
        try:
            status = read_status(session=session, base_url=base_url)
            status_failures = 0
            final_status = status
        except requests.exceptions.RequestException as error:
            status_failures += 1

            print(
                f"Status request failed "
                f"({status_failures}/{MAX_STATUS_FAILURES}): "
                f"{type(error).__name__}: {error}"
            )

            if status_failures >= MAX_STATUS_FAILURES:
                print("Monitoring stopped: vision server did not respond after repeated attempts.")
                print("Check the server terminal with: python -m app.main")
                return final_status

            time.sleep(max(1.0, poll_interval))
            continue
        except Exception as error:
            status_failures += 1

            print(
                f"Status parsing failed "
                f"({status_failures}/{MAX_STATUS_FAILURES}): "
                f"{type(error).__name__}: {error}"
            )

            if status_failures >= MAX_STATUS_FAILURES:
                print("Monitoring stopped: invalid status response after repeated attempts.")
                return final_status

            time.sleep(max(1.0, poll_interval))
            continue

        running = bool(status.get("running", False))
        stats = status.get("stats", {}) or {}

        progress = _safe_float(stats.get("export_progress_percent"))
        eta = _format_eta(stats.get("export_eta_sec"))

        read_frames = _safe_int(stats.get("total_frames_read"))
        analyzed_frames = _safe_int(stats.get("total_frames_processed"))
        skipped_frames = _safe_int(stats.get("total_frames_skipped"))
        total_frames = _safe_int(stats.get("total_frames_to_process"))

        active_tracks = _safe_int(stats.get("active_tracks"))
        active_episodes = _safe_int(stats.get("active_track_episodes"))
        lost_episodes = _safe_int(stats.get("lost_track_episodes"))
        ended_episodes = _safe_int(stats.get("ended_track_episodes"))

        valid_quality = _safe_int(stats.get("valid_quality_observations"))
        rejected_quality = _safe_int(stats.get("quality_rejected_observations"))

        headwear_eval = _safe_int(stats.get("headwear_evaluable_observations"))
        headwear_not_eval = _safe_int(stats.get("headwear_not_evaluable_observations"))
        headwear_unknown = _safe_int(stats.get("headwear_unknown_observations"))

        incidents = _safe_int(stats.get("active_incidents_count"))

        shadow_tracks = _safe_int(stats.get("shadow_tracks_count"))
        suppressed_duplicates = _safe_int(stats.get("suppressed_duplicate_tracks_count"))
        partial_suppressed = _safe_int(stats.get("partial_track_suppressed_count"))
        candidate_tracks = _safe_int(stats.get("candidate_tracks_count"))
        promoted_tracks = _safe_int(stats.get("promoted_tracks_count"))
        bad_crops = _safe_int(stats.get("headwear_skipped_bad_crop_count"))
        short_episodes = _safe_int(stats.get("short_episode_count"))

        id_switch_suspicions = _safe_int(stats.get("track_id_switch_suspicions"))
        fragmentation_suspicions = _safe_int(stats.get("track_fragmentation_suspicions"))
        merge_suspicions = _safe_int(stats.get("track_merge_suspicions"))

        message = str(stats.get("last_export_message") or "")
        output_path = stats.get("last_export_output_path")

        line = (
            f"running={'yes' if running else 'no'} | "
            f"progress={progress:6.2f}% | "
            f"read={read_frames}/{total_frames} | "
            f"analyzed={analyzed_frames} | "
            f"skipped={skipped_frames} | "
            f"tracks={active_tracks} | "
            f"episodes={active_episodes} | "
            f"lost={lost_episodes} | "
            f"ended={ended_episodes} | "
            f"quality_ok={valid_quality} | "
            f"quality_bad={rejected_quality} | "
            f"headwear_eval={headwear_eval} | "
            f"headwear_skip={headwear_not_eval} | "
            f"unknown={headwear_unknown} | "
            f"incidents={incidents} | "
            f"shadow={shadow_tracks} | "
            f"suppressed={suppressed_duplicates} | "
            f"partial_supp={partial_suppressed} | "
            f"candidate={candidate_tracks} | "
            f"promoted={promoted_tracks} | "
            f"bad_crop={bad_crops} | "
            f"short_ep={short_episodes} | "
            f"switch={id_switch_suspicions} | "
            f"fragment={fragmentation_suspicions} | "
            f"merge={merge_suspicions} | "
            f"eta={eta}"
        )

        if line != last_line:
            print(line)
            last_line = line

        if not running:
            print(message or "Export finished.")

            if output_path:
                print(f"Output: {output_path}")

            return final_status

        time.sleep(max(1.0, poll_interval))


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        return []

    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        return [dict(row) for row in reader]


def _find_latest_metrics_dir(metrics_root: Path) -> Path | None:
    if not metrics_root.exists():
        return None

    candidates = [path for path in metrics_root.rglob("*") if path.is_dir()]
    if not candidates:
        return None

    candidates.sort(key=lambda item: item.stat().st_mtime, reverse=True)
    return candidates[0]


def _count_by(rows: list[dict[str, str]], field: str) -> dict[str, int]:
    result: dict[str, int] = {}

    for row in rows:
        key = str(row.get(field) or "").strip() or "<empty>"
        result[key] = result.get(key, 0) + 1

    return dict(sorted(result.items(), key=lambda item: item[1], reverse=True))


def _print_counter(title: str, values: dict[str, int]) -> None:
    print(f"\n=== {title} ===")

    if not values:
        print("no data")
        return

    for key, count in values.items():
        print(f"{key}: {count}")


def print_metrics_summary(metrics_root: str) -> None:
    root = Path(metrics_root).expanduser().resolve()
    latest = _find_latest_metrics_dir(root)

    print("\n=== metrics ===")
    print(f"metrics_root: {root}")

    if latest is None:
        print("latest_metrics_dir: not found")
        return

    print(f"latest_metrics_dir: {latest}")

    episode_rows = _read_csv_rows(latest / "track_episode_report.csv")
    observation_rows = _read_csv_rows(latest / "track_observation_metrics.csv")
    incident_rows = _read_csv_rows(latest / "track_incident_events.csv")
    frame_rows = _read_csv_rows(latest / "track_frame_metrics.csv")

    print(f"track_frame_metrics rows: {len(frame_rows)}")
    print(f"track_observation_metrics rows: {len(observation_rows)}")
    print(f"track_episode_report rows: {len(episode_rows)}")
    print(f"track_incident_events rows: {len(incident_rows)}")

    _print_counter(
        "headwear_context_usable",
        _count_by(observation_rows, "headwear_context_usable"),
    )
    _print_counter(
        "visibility_state",
        _count_by(observation_rows, "visibility_state"),
    )
    _print_counter(
        "headwear_signal",
        _count_by(observation_rows, "headwear_signal"),
    )
    _print_counter(
        "incident_event_type",
        _count_by(incident_rows, "event"),
    )
    _print_counter(
        "track suppression / promotion per frame",
        {
            "partial_track_suppressed": sum(_safe_int(row.get("partial_track_suppressed")) for row in frame_rows),
            "duplicate_track_suppressed": sum(_safe_int(row.get("duplicate_track_suppressed")) for row in frame_rows),
            "candidate_tracks": sum(_safe_int(row.get("candidate_tracks")) for row in frame_rows),
            "promoted_tracks": sum(_safe_int(row.get("promoted_tracks")) for row in frame_rows),
            "headwear_skipped_bad_crop": sum(_safe_int(row.get("headwear_skipped_bad_crop")) for row in frame_rows),
        },
    )

    if episode_rows:
        print("\n=== episodes ===")
        for row in episode_rows[:30]:
            print(
                "episode="
                f"{row.get('track_episode_id', '')} | "
                f"source_track={row.get('source_track_id', '')} | "
                f"status={row.get('status', '')} | "
                f"visible={row.get('visible_frame_count', '')} | "
                f"eval={row.get('headwear_evaluable_frame_count', '')} | "
                f"unknown={row.get('headwear_unknown_frame_count', '')} | "
                f"violations={row.get('violation_frame_count', '')} | "
                f"short={row.get('is_short_episode', '')} | "
                f"partial_supp={row.get('partial_suppressed_count', '')} | "
                f"bad_crop={row.get('headwear_skipped_bad_crop_count', '')} | "
                f"incident={row.get('active_incident_id', '')}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Start and monitor offline track-centric vision export.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--source-url", default=None)
    parser.add_argument("--output-path", default=None)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--collect-person-crops", action="store_true")
    parser.add_argument("--max-seconds", type=float, default=None)
    parser.add_argument("--start-seconds", type=float, default=None)
    parser.add_argument("--poll-interval", type=float, default=DEFAULT_POLL_INTERVAL_SEC)
    parser.add_argument("--print-metrics-summary", action="store_true")
    parser.add_argument("--metrics-root", default="./data/metrics")

    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")

    with requests.Session() as session:
        try:
            if args.collect_person_crops:
                start_response = start_person_crop_collection(
                    session=session,
                    base_url=base_url,
                    source_url=args.source_url,
                    output_dir=args.output_dir or args.output_path,
                    max_seconds=args.max_seconds,
                    start_seconds=args.start_seconds,
                )
            else:
                start_response = start_export(
                    session=session,
                    base_url=base_url,
                    source_url=args.source_url,
                    output_path=args.output_path,
                    max_seconds=args.max_seconds,
                )

            _print_start_response(start_response)

            if not bool(start_response.get("ok", False)):
                return

            monitor_export(
                session=session,
                base_url=base_url,
                poll_interval=args.poll_interval,
            )

            if args.print_metrics_summary:
                print_metrics_summary(args.metrics_root)

        except requests.exceptions.ConnectionError as error:
            print(f"Cannot connect to vision server: {error}")
            print("Start it first:")
            print("python -m app.main")
        except requests.exceptions.Timeout as error:
            print(f"Vision server request timed out: {error}")
            print("The server may be busy with a heavy model. Try again or lower PROCESSED_VIDEO_ANALYSIS_FPS.")
        except requests.exceptions.HTTPError as error:
            print(f"HTTP error: {error}")
        except Exception as error:
            print(f"Runtime client failed: {type(error).__name__}: {error}")


if __name__ == "__main__":
    main()