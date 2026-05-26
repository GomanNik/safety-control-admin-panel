# ============================================================
# File: vision/check_video_runtime.py
# Purpose:
# - Utility CLI for checking offline track-centric video runtime
#   through the HTTP API.
# - Supports:
#   1) exporting processed video
#   2) polling export status
#   3) printing status / tracks / incidents
#   4) saving JSON snapshots
#   5) printing CSV metrics summary
# - Does not use old person/day_person/ReID diagnostics.
# ============================================================

from __future__ import annotations

import argparse
import csv
import json
import time
from pathlib import Path
from typing import Any

import requests


DEFAULT_BASE_URL = "http://localhost:8090"
DEFAULT_POLL_INTERVAL_SEC = 2.0


def _request_json(method: str, url: str, **kwargs: Any) -> dict[str, Any] | list[Any]:
    response = requests.request(method, url, timeout=30, **kwargs)
    response.raise_for_status()
    return response.json()


def _try_request_json(method: str, url: str, **kwargs: Any) -> dict[str, Any] | list[Any] | None:
    try:
        return _request_json(method, url, **kwargs)
    except requests.exceptions.HTTPError as error:
        status_code = getattr(error.response, "status_code", None)
        if status_code == 404:
            return None
        raise


def _print_json(title: str, data: Any) -> None:
    print(f"\n=== {title} ===")
    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))


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


def export_video(
    base_url: str,
    source_url: str | None,
    output_path: str | None,
    max_seconds: float | None,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    if source_url:
        params["source_url"] = source_url
    if output_path:
        params["output_path"] = output_path
    if max_seconds is not None:
        params["max_seconds"] = max_seconds

    data = _request_json("POST", f"{base_url}/runtime/export-video", params=params)
    if not isinstance(data, dict):
        raise ValueError("Unexpected export response")

    return data


def read_status(base_url: str) -> dict[str, Any]:
    data = _request_json("GET", f"{base_url}/runtime/status")
    if not isinstance(data, dict):
        raise ValueError("Unexpected status response")

    return data


def read_tracks(base_url: str) -> list[Any]:
    data = _try_request_json("GET", f"{base_url}/runtime/tracks")

    if data is None:
        data = _try_request_json("GET", f"{base_url}/runtime/track-episodes")

    if data is None:
        data = _try_request_json("GET", f"{base_url}/runtime/day-people")

    if data is None:
        return []

    if not isinstance(data, list):
        raise ValueError("Unexpected tracks response")

    return data


def read_incidents(base_url: str) -> list[Any]:
    data = _request_json("GET", f"{base_url}/runtime/incidents")
    if not isinstance(data, list):
        raise ValueError("Unexpected incidents response")

    return data


def monitor_export(base_url: str, poll_interval: float) -> dict[str, Any]:
    final_status: dict[str, Any] = {}

    while True:
        status = read_status(base_url)
        final_status = status
        stats = status.get("stats", {}) or {}

        progress = _safe_float(stats.get("export_progress_percent"))
        eta = _format_eta(stats.get("export_eta_sec"))

        read_frames = _safe_int(stats.get("total_frames_read"))
        analyzed = _safe_int(stats.get("total_frames_processed"))
        skipped = _safe_int(stats.get("total_frames_skipped"))
        total = _safe_int(stats.get("total_frames_to_process"))

        active_tracks = _safe_int(stats.get("active_tracks"))
        active_episodes = _safe_int(stats.get("active_track_episodes"))
        lost_episodes = _safe_int(stats.get("lost_track_episodes"))
        ended_episodes = _safe_int(stats.get("ended_track_episodes"))

        headwear_eval = _safe_int(stats.get("headwear_evaluable_observations"))
        headwear_skip = _safe_int(stats.get("headwear_not_evaluable_observations"))
        headwear_unknown = _safe_int(stats.get("headwear_unknown_observations"))

        incidents = _safe_int(stats.get("active_incidents_count"))
        suppressed = _safe_int(stats.get("suppressed_duplicate_tracks_count"))
        switch = _safe_int(stats.get("track_id_switch_suspicions"))
        fragment = _safe_int(stats.get("track_fragmentation_suspicions"))
        merge = _safe_int(stats.get("track_merge_suspicions"))

        print(
            f"progress={progress:6.2f}% | "
            f"read={read_frames}/{total} | "
            f"analyzed={analyzed} | "
            f"skipped={skipped} | "
            f"tracks={active_tracks} | "
            f"episodes={active_episodes} | "
            f"lost={lost_episodes} | "
            f"ended={ended_episodes} | "
            f"headwear_eval={headwear_eval} | "
            f"headwear_skip={headwear_skip} | "
            f"unknown={headwear_unknown} | "
            f"incidents={incidents} | "
            f"suppressed={suppressed} | "
            f"switch={switch} | "
            f"fragment={fragment} | "
            f"merge={merge} | "
            f"eta={eta}"
        )

        if not bool(status.get("running", False)):
            return final_status

        time.sleep(max(1.0, poll_interval))


def save_json_snapshots(base_url: str, output_dir: str) -> None:
    target = Path(output_dir).expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)

    status = read_status(base_url)
    tracks = read_tracks(base_url)
    incidents = read_incidents(base_url)

    (target / "runtime_status.json").write_text(
        json.dumps(status, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    (target / "runtime_tracks.json").write_text(
        json.dumps(tracks, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    (target / "runtime_incidents.json").write_text(
        json.dumps(incidents, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )

    print(f"Saved runtime JSON snapshots to: {target}")


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

    print("\n=== metrics summary ===")
    print(f"metrics_root: {root}")

    if latest is None:
        print("latest_metrics_dir: not found")
        return

    print(f"latest_metrics_dir: {latest}")

    frame_rows = _read_csv_rows(latest / "track_frame_metrics.csv")
    observation_rows = _read_csv_rows(latest / "track_observation_metrics.csv")
    episode_rows = _read_csv_rows(latest / "track_episode_report.csv")
    incident_rows = _read_csv_rows(latest / "track_incident_events.csv")

    print(f"track_frame_metrics rows: {len(frame_rows)}")
    print(f"track_observation_metrics rows: {len(observation_rows)}")
    print(f"track_episode_report rows: {len(episode_rows)}")
    print(f"track_incident_events rows: {len(incident_rows)}")

    _print_counter("headwear_context_usable", _count_by(observation_rows, "headwear_context_usable"))
    _print_counter("visibility_state", _count_by(observation_rows, "visibility_state"))
    _print_counter("headwear_signal", _count_by(observation_rows, "headwear_signal"))
    _print_counter("incident_event_type", _count_by(incident_rows, "event_type"))

    if episode_rows:
        print("\n=== first episodes ===")
        for row in episode_rows[:30]:
            print(
                f"episode={row.get('track_episode_id', '')} | "
                f"source_track={row.get('source_track_id', '')} | "
                f"status={row.get('status', '')} | "
                f"visible={row.get('visible_frame_count', '')} | "
                f"eval={row.get('headwear_evaluable_frame_count', '')} | "
                f"unknown={row.get('headwear_unknown_frame_count', '')} | "
                f"violations={row.get('violation_frame_count', '')} | "
                f"incident={row.get('active_incident_id', '')}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Check offline track-centric video runtime.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)

    parser.add_argument("--export-video", action="store_true")
    parser.add_argument("--monitor-export", action="store_true")

    parser.add_argument("--source-url", default=None)
    parser.add_argument("--output-path", default=None)
    parser.add_argument("--max-seconds", type=float, default=None)
    parser.add_argument("--poll-interval", type=float, default=DEFAULT_POLL_INTERVAL_SEC)

    parser.add_argument("--show-status", action="store_true")
    parser.add_argument("--show-tracks", action="store_true")
    parser.add_argument("--show-incidents", action="store_true")

    parser.add_argument("--save-json", default=None, help="Saves runtime status/tracks/incidents JSON snapshots.")
    parser.add_argument("--metrics-summary", action="store_true")
    parser.add_argument("--metrics-root", default="./data/metrics")

    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")

    if args.export_video:
        response = export_video(
            base_url=base_url,
            source_url=args.source_url,
            output_path=args.output_path,
            max_seconds=args.max_seconds,
        )
        _print_json("export-video", response)

    if args.monitor_export:
        final_status = monitor_export(
            base_url=base_url,
            poll_interval=args.poll_interval,
        )
        _print_json("final status", final_status)

    if args.show_status:
        _print_json("status", read_status(base_url))

    if args.show_tracks:
        _print_json("tracks", read_tracks(base_url))

    if args.show_incidents:
        _print_json("incidents", read_incidents(base_url))

    if args.save_json:
        save_json_snapshots(base_url=base_url, output_dir=args.save_json)

    if args.metrics_summary:
        print_metrics_summary(args.metrics_root)


if __name__ == "__main__":
    main()