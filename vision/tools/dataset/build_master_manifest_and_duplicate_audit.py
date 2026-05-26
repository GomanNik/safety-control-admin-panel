# ============================================================
# File: vision/tools/dataset/build_master_manifest_and_duplicate_audit.py
# Purpose:
# - Build a unified master manifest from raw person crop collections.
# - Resolve moved crop/frame paths after raw directories were relocated.
# - Compute exact image hashes and perceptual hashes.
# - Build duplicate/temporal audit reports.
# - Build a deterministic preliminary filtered pool manifest.
# ============================================================

from __future__ import annotations

import argparse
import csv
import hashlib
import math
import os
import time
from dataclasses import dataclass
from pathlib import Path, PureWindowsPath
from typing import Iterable

import cv2
import numpy as np
import pandas as pd


DEFAULT_FRAME_WIDTH = 1920
DEFAULT_FRAME_HEIGHT = 1080


@dataclass(frozen=True)
class SourceRun:
    name: str
    run_dir: Path


def _read_csv_semicolon(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")
    return pd.read_csv(path, sep=";", dtype=str, keep_default_na=False).fillna("")


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        text = str(value).strip().replace(",", ".")
        if text == "":
            return default
        return float(text)
    except Exception:
        return default


def _safe_int(value: object, default: int = 0) -> int:
    try:
        text = str(value).strip()
        if text == "":
            return default
        return int(float(text.replace(",", ".")))
    except Exception:
        return default


def _first_existing(paths: Iterable[Path]) -> Path | None:
    for path in paths:
        try:
            if path.exists():
                return path
        except OSError:
            continue
    return None


def _resolve_moved_path(original: str, run_dir: Path, kind: str) -> str:
    """
    Raw manifests may contain old absolute paths from C:\\sc_v2...
    After moving raw collections into Documents, we rebuild paths relative
    to the current run_dir.

    kind:
      crop  -> run_dir/crops/accepted/<basename>
      frame -> run_dir/frames/<basename>
    """
    original = str(original).strip()

    candidates: list[Path] = []

    if original:
        original_path = Path(original)
        candidates.append(original_path)

        try:
            win_parts = PureWindowsPath(original).parts
            person_crops_idx = None
            for idx, part in enumerate(win_parts):
                if part.endswith("_person_crops"):
                    person_crops_idx = idx
            if person_crops_idx is not None:
                rel_parts = win_parts[person_crops_idx + 1 :]
                if rel_parts:
                    candidates.append(run_dir.joinpath(*rel_parts))
        except Exception:
            pass

        basename = Path(original).name
        if basename:
            if kind == "crop":
                candidates.append(run_dir / "crops" / "accepted" / basename)
            elif kind == "frame":
                candidates.append(run_dir / "frames" / basename)

    found = _first_existing(candidates)
    if found is not None:
        return str(found)

    if original:
        basename = Path(original).name
        if kind == "crop" and basename:
            return str(run_dir / "crops" / "accepted" / basename)
        if kind == "frame" and basename:
            return str(run_dir / "frames" / basename)

    return ""


def _ensure_column(df: pd.DataFrame, name: str, default: str = "") -> None:
    if name not in df.columns:
        df[name] = default


def _load_one_run(source: SourceRun) -> pd.DataFrame:
    manifest_path = source.run_dir / "manifest.csv"
    df = _read_csv_semicolon(manifest_path)

    required_defaults = {
        "sample_id": "",
        "frame_index": "",
        "timestamp_seconds": "",
        "person_conf": "",
        "bbox_x1": "",
        "bbox_y1": "",
        "bbox_x2": "",
        "bbox_y2": "",
        "crop_width": "",
        "crop_height": "",
        "aspect_ratio": "",
        "area_ratio": "",
        "crop_path": "",
        "frame_path": "",
        "frame_width": str(DEFAULT_FRAME_WIDTH),
        "frame_height": str(DEFAULT_FRAME_HEIGHT),
        "accepted": "1",
        "reason_codes": "",
    }

    for col, default in required_defaults.items():
        _ensure_column(df, col, default)

    df["source_run"] = source.name
    df["source_run_dir"] = str(source.run_dir)
    df["source_manifest_path"] = str(manifest_path)

    df["absolute_crop_path"] = [
        _resolve_moved_path(value, source.run_dir, "crop")
        for value in df["crop_path"].astype(str).tolist()
    ]

    df["absolute_frame_path"] = [
        _resolve_moved_path(value, source.run_dir, "frame")
        for value in df["frame_path"].astype(str).tolist()
    ]

    if df["sample_id"].astype(str).str.len().min() == 0:
        df["sample_id"] = [
            f"{source.name}_{i:09d}" for i in range(len(df))
        ]

    df["global_sample_id"] = source.name + "__" + df["sample_id"].astype(str)

    return df


def _to_numeric_columns(df: pd.DataFrame) -> pd.DataFrame:
    numeric_cols = [
        "frame_index",
        "timestamp_seconds",
        "person_conf",
        "bbox_x1",
        "bbox_y1",
        "bbox_x2",
        "bbox_y2",
        "crop_width",
        "crop_height",
        "aspect_ratio",
        "area_ratio",
        "frame_width",
        "frame_height",
    ]

    for col in numeric_cols:
        df[col] = df[col].map(_safe_float)

    df["frame_index"] = df["frame_index"].round().astype("int64")
    df["crop_width"] = df["crop_width"].round().astype("int64")
    df["crop_height"] = df["crop_height"].round().astype("int64")
    df["frame_width"] = df["frame_width"].replace(0, DEFAULT_FRAME_WIDTH).round().astype("int64")
    df["frame_height"] = df["frame_height"].replace(0, DEFAULT_FRAME_HEIGHT).round().astype("int64")

    return df


def _add_quality_flags(df: pd.DataFrame) -> pd.DataFrame:
    fw = df["frame_width"].replace(0, DEFAULT_FRAME_WIDTH).astype(float)
    fh = df["frame_height"].replace(0, DEFAULT_FRAME_HEIGHT).astype(float)

    x1 = df["bbox_x1"].astype(float)
    y1 = df["bbox_y1"].astype(float)
    x2 = df["bbox_x2"].astype(float)
    y2 = df["bbox_y2"].astype(float)

    bw = (x2 - x1).clip(lower=1)
    bh = (y2 - y1).clip(lower=1)
    cx = x1 + bw / 2.0
    cy = y1 + bh / 2.0

    df["bbox_width"] = bw.round(3)
    df["bbox_height"] = bh.round(3)
    df["bbox_center_x_norm"] = (cx / fw).round(6)
    df["bbox_center_y_norm"] = (cy / fh).round(6)
    df["bbox_width_norm"] = (bw / fw).round(6)
    df["bbox_height_norm"] = (bh / fh).round(6)

    df["time_bucket_1s"] = np.floor(df["timestamp_seconds"].astype(float)).astype("int64")
    df["time_bucket_5s"] = np.floor(df["timestamp_seconds"].astype(float) / 5.0).astype("int64")
    df["time_bucket_60s"] = np.floor(df["timestamp_seconds"].astype(float) / 60.0).astype("int64")

    df["spatial_cell_x"] = np.floor(df["bbox_center_x_norm"].clip(0, 0.999999) * 12).astype("int64")
    df["spatial_cell_y"] = np.floor(df["bbox_center_y_norm"].clip(0, 0.999999) * 12).astype("int64")
    df["spatial_cell"] = df["spatial_cell_x"].astype(str) + "_" + df["spatial_cell_y"].astype(str)

    edge_margin = 0.02
    df["is_left_edge_crop"] = (x1 <= fw * edge_margin).astype("int8")
    df["is_right_edge_crop"] = (x2 >= fw * (1.0 - edge_margin)).astype("int8")
    df["is_top_edge_crop"] = (y1 <= fh * edge_margin).astype("int8")
    df["is_bottom_edge_crop"] = (y2 >= fh * (1.0 - edge_margin)).astype("int8")

    df["is_edge_crop"] = (
        (df["is_left_edge_crop"] == 1)
        | (df["is_right_edge_crop"] == 1)
        | (df["is_top_edge_crop"] == 1)
        | (df["is_bottom_edge_crop"] == 1)
    ).astype("int8")

    # Important project-specific case:
    # people enter from bottom edge and may still be valid if head/upper body is visible.
    df["is_bottom_entry_candidate"] = (
        (df["is_bottom_edge_crop"] == 1)
        & (df["bbox_center_y_norm"] > 0.55)
        & (df["bbox_height_norm"] > 0.18)
    ).astype("int8")

    df["is_small_person_candidate"] = (
        (df["bbox_height_norm"] < 0.22)
        | (df["area_ratio"].astype(float) < 0.025)
    ).astype("int8")

    df["is_large_person_candidate"] = (
        (df["bbox_height_norm"] > 0.72)
        | (df["area_ratio"].astype(float) > 0.16)
    ).astype("int8")

    df["is_narrow_fragment_candidate"] = (
        df["aspect_ratio"].astype(float) < 0.30
    ).astype("int8")

    df["is_wide_fragment_candidate"] = (
        df["aspect_ratio"].astype(float) > 1.35
    ).astype("int8")

    df["is_suspicious_fragment_candidate"] = (
        (df["is_narrow_fragment_candidate"] == 1)
        | (df["is_wide_fragment_candidate"] == 1)
        | ((df["area_ratio"].astype(float) < 0.012) & (df["person_conf"].astype(float) < 0.80))
    ).astype("int8")

    df["person_analysis_role_hint"] = "person_trackable_candidate"
    df.loc[df["is_suspicious_fragment_candidate"] == 1, "person_analysis_role_hint"] = "needs_review_fragment_candidate"
    df.loc[df["is_bottom_entry_candidate"] == 1, "person_analysis_role_hint"] = "person_trackable_bottom_entry_candidate"

    df["critical_case_hint"] = (
        (df["is_bottom_entry_candidate"] == 1)
        | (df["is_edge_crop"] == 1)
        | (df["is_suspicious_fragment_candidate"] == 1)
        | (df["is_small_person_candidate"] == 1)
        | (df["is_large_person_candidate"] == 1)
    ).astype("int8")

    return df


def _sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _phash_cv2(path: Path) -> str:
    image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if image is None or image.size == 0:
        return ""

    image = cv2.resize(image, (32, 32), interpolation=cv2.INTER_AREA)
    image = np.float32(image)
    dct = cv2.dct(image)
    low = dct[:8, :8].copy()

    values = low.flatten()
    # Ignore DC component for threshold.
    median = np.median(values[1:])
    bits = (values > median).astype(np.uint8)

    out = 0
    for bit in bits:
        out = (out << 1) | int(bit)

    return f"{out:016x}"


def _image_basic_stats(path: Path) -> tuple[float, float, float]:
    image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if image is None or image.size == 0:
        return 0.0, 0.0, 0.0

    brightness = float(np.mean(image))
    contrast = float(np.std(image))
    blur = float(cv2.Laplacian(image, cv2.CV_64F).var())

    return round(brightness, 4), round(contrast, 4), round(blur, 4)


def _build_fingerprints(
    df: pd.DataFrame,
    out_path: Path,
    progress_every: int = 5000,
) -> pd.DataFrame:
    if out_path.exists():
        cached = _read_csv_semicolon(out_path)
        if len(cached) == len(df) and "global_sample_id" in cached.columns:
            print(f"[fingerprints] using existing cache: {out_path}")
            return cached

    out_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "global_sample_id",
        "absolute_crop_path",
        "crop_exists",
        "file_size",
        "sha256",
        "phash",
        "brightness_mean",
        "contrast_std",
        "blur_laplacian",
        "fingerprint_error",
    ]

    started_at = time.time()
    written = 0

    with out_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        writer.writeheader()

        for row in df[["global_sample_id", "absolute_crop_path"]].itertuples(index=False):
            gid = str(row.global_sample_id)
            path_text = str(row.absolute_crop_path)
            path = Path(path_text)

            result = {
                "global_sample_id": gid,
                "absolute_crop_path": path_text,
                "crop_exists": "0",
                "file_size": "0",
                "sha256": "",
                "phash": "",
                "brightness_mean": "0",
                "contrast_std": "0",
                "blur_laplacian": "0",
                "fingerprint_error": "",
            }

            try:
                if path.exists() and path.is_file():
                    result["crop_exists"] = "1"
                    result["file_size"] = str(path.stat().st_size)
                    result["sha256"] = _sha256_file(path)
                    result["phash"] = _phash_cv2(path)

                    brightness, contrast, blur = _image_basic_stats(path)
                    result["brightness_mean"] = str(brightness)
                    result["contrast_std"] = str(contrast)
                    result["blur_laplacian"] = str(blur)
                else:
                    result["fingerprint_error"] = "crop_missing"
            except Exception as exc:
                result["fingerprint_error"] = f"{type(exc).__name__}: {exc}"

            writer.writerow(result)
            written += 1

            if written % progress_every == 0:
                elapsed = max(time.time() - started_at, 0.001)
                rate = written / elapsed
                print(f"[fingerprints] {written}/{len(df)} | {rate:.1f} img/s")

    return _read_csv_semicolon(out_path)


def _write_exact_duplicate_report(fingerprints: pd.DataFrame, out_path: Path) -> None:
    rows = fingerprints[
        (fingerprints["crop_exists"].astype(str) == "1")
        & (fingerprints["sha256"].astype(str) != "")
    ].copy()

    group_sizes = rows.groupby("sha256").size().reset_index(name="group_size")
    dup_hashes = set(group_sizes[group_sizes["group_size"] > 1]["sha256"].astype(str))

    if not dup_hashes:
        pd.DataFrame(columns=[
            "duplicate_group_id",
            "sha256",
            "group_size",
            "global_sample_id",
            "absolute_crop_path",
            "file_size",
        ]).to_csv(out_path, sep=";", index=False, encoding="utf-8-sig")
        return

    dup_rows = rows[rows["sha256"].isin(dup_hashes)].copy()
    dup_rows = dup_rows.merge(group_sizes, on="sha256", how="left")
    dup_rows = dup_rows.sort_values(["group_size", "sha256", "global_sample_id"], ascending=[False, True, True])
    dup_rows["duplicate_group_id"] = "exact_" + dup_rows["sha256"].astype(str).str[:16]

    out = dup_rows[[
        "duplicate_group_id",
        "sha256",
        "group_size",
        "global_sample_id",
        "absolute_crop_path",
        "file_size",
    ]]

    out.to_csv(out_path, sep=";", index=False, encoding="utf-8-sig")


def _write_phash_duplicate_report(fingerprints: pd.DataFrame, out_path: Path) -> None:
    rows = fingerprints[
        (fingerprints["crop_exists"].astype(str) == "1")
        & (fingerprints["phash"].astype(str) != "")
    ].copy()

    group_sizes = rows.groupby("phash").size().reset_index(name="group_size")
    dup_hashes = set(group_sizes[group_sizes["group_size"] > 1]["phash"].astype(str))

    if not dup_hashes:
        pd.DataFrame(columns=[
            "phash_group_id",
            "phash",
            "group_size",
            "global_sample_id",
            "absolute_crop_path",
            "file_size",
        ]).to_csv(out_path, sep=";", index=False, encoding="utf-8-sig")
        return

    dup_rows = rows[rows["phash"].isin(dup_hashes)].copy()
    dup_rows = dup_rows.merge(group_sizes, on="phash", how="left")
    dup_rows = dup_rows.sort_values(["group_size", "phash", "global_sample_id"], ascending=[False, True, True])
    dup_rows["phash_group_id"] = "phash_" + dup_rows["phash"].astype(str)

    out = dup_rows[[
        "phash_group_id",
        "phash",
        "group_size",
        "global_sample_id",
        "absolute_crop_path",
        "file_size",
    ]]

    out.to_csv(out_path, sep=";", index=False, encoding="utf-8-sig")


def _assign_temporal_clusters(df: pd.DataFrame) -> pd.DataFrame:
    work = df.sort_values(
        ["source_run", "spatial_cell", "timestamp_seconds", "frame_index", "global_sample_id"]
    ).copy()

    cluster_ids: list[str] = []
    previous_key: tuple[str, str] | None = None
    previous_ts: float | None = None
    previous_cx: float | None = None
    previous_cy: float | None = None
    previous_w: float | None = None
    previous_h: float | None = None
    cluster_index = -1

    for row in work.itertuples(index=False):
        key = (str(row.source_run), str(row.spatial_cell))
        ts = float(row.timestamp_seconds)
        cx = float(row.bbox_center_x_norm)
        cy = float(row.bbox_center_y_norm)
        bw = float(row.bbox_width_norm)
        bh = float(row.bbox_height_norm)

        new_cluster = False

        if previous_key != key:
            new_cluster = True
        elif previous_ts is None:
            new_cluster = True
        else:
            dt = abs(ts - previous_ts)
            center_dist = math.sqrt((cx - float(previous_cx)) ** 2 + (cy - float(previous_cy)) ** 2)
            size_dist = abs(bw - float(previous_w)) + abs(bh - float(previous_h))

            if dt > 8.0 or center_dist > 0.08 or size_dist > 0.12:
                new_cluster = True

        if new_cluster:
            cluster_index += 1

        cluster_ids.append(f"tc_{cluster_index:08d}")

        previous_key = key
        previous_ts = ts
        previous_cx = cx
        previous_cy = cy
        previous_w = bw
        previous_h = bh

    work["temporal_cluster_id"] = cluster_ids

    return work.sort_values(["source_run", "timestamp_seconds", "frame_index", "global_sample_id"])


def _write_temporal_report(df: pd.DataFrame, out_path: Path) -> pd.DataFrame:
    clustered = _assign_temporal_clusters(df)

    grouped = clustered.groupby("temporal_cluster_id").agg(
        source_run=("source_run", "first"),
        count=("global_sample_id", "count"),
        first_timestamp=("timestamp_seconds", "min"),
        last_timestamp=("timestamp_seconds", "max"),
        first_frame=("frame_index", "min"),
        last_frame=("frame_index", "max"),
        avg_person_conf=("person_conf", "mean"),
        avg_area_ratio=("area_ratio", "mean"),
        critical_cases=("critical_case_hint", "sum"),
        bottom_entry_cases=("is_bottom_entry_candidate", "sum"),
        suspicious_fragment_cases=("is_suspicious_fragment_candidate", "sum"),
    ).reset_index()

    grouped["duration_seconds"] = (grouped["last_timestamp"] - grouped["first_timestamp"]).round(3)
    grouped["avg_person_conf"] = grouped["avg_person_conf"].round(6)
    grouped["avg_area_ratio"] = grouped["avg_area_ratio"].round(6)

    grouped = grouped.sort_values(["count", "duration_seconds"], ascending=[False, False])
    grouped.to_csv(out_path, sep=";", index=False, encoding="utf-8-sig")

    return clustered


def _write_quality_distribution(df: pd.DataFrame, fingerprints: pd.DataFrame, out_path: Path) -> None:
    fp = fingerprints[[
        "global_sample_id",
        "crop_exists",
        "file_size",
        "brightness_mean",
        "contrast_std",
        "blur_laplacian",
        "fingerprint_error",
    ]].copy()

    fp = fp.rename(columns={
        "crop_exists": "fp_crop_exists",
        "file_size": "fp_file_size",
        "brightness_mean": "fp_brightness_mean",
        "contrast_std": "fp_contrast_std",
        "blur_laplacian": "fp_blur_laplacian",
        "fingerprint_error": "fp_fingerprint_error",
    })

    merged = df.merge(fp, on="global_sample_id", how="left")

    merged["crop_exists"] = merged["fp_crop_exists"]
    merged["file_size"] = merged["fp_file_size"]
    merged["brightness_mean"] = merged["fp_brightness_mean"]
    merged["contrast_std"] = merged["fp_contrast_std"]
    merged["blur_laplacian"] = merged["fp_blur_laplacian"]
    merged["fingerprint_error"] = merged["fp_fingerprint_error"]

    summary_rows = []

    def add_metric(name: str, series: pd.Series) -> None:
        numeric = pd.to_numeric(series, errors="coerce").dropna()
        if len(numeric) == 0:
            summary_rows.append({
                "metric": name,
                "count": 0,
                "min": "",
                "p05": "",
                "p25": "",
                "mean": "",
                "median": "",
                "p75": "",
                "p95": "",
                "max": "",
            })
            return

        summary_rows.append({
            "metric": name,
            "count": int(len(numeric)),
            "min": round(float(numeric.min()), 6),
            "p05": round(float(numeric.quantile(0.05)), 6),
            "p25": round(float(numeric.quantile(0.25)), 6),
            "mean": round(float(numeric.mean()), 6),
            "median": round(float(numeric.median()), 6),
            "p75": round(float(numeric.quantile(0.75)), 6),
            "p95": round(float(numeric.quantile(0.95)), 6),
            "max": round(float(numeric.max()), 6),
        })

    for metric in [
        "person_conf",
        "crop_width",
        "crop_height",
        "aspect_ratio",
        "area_ratio",
        "bbox_width_norm",
        "bbox_height_norm",
        "brightness_mean",
        "contrast_std",
        "blur_laplacian",
        "file_size",
    ]:
        add_metric(metric, merged[metric])

    pd.DataFrame(summary_rows).to_csv(out_path, sep=";", index=False, encoding="utf-8-sig")


def _build_preliminary_filtered_pool(
    clustered: pd.DataFrame,
    fingerprints: pd.DataFrame,
    out_path: Path,
) -> None:
    fp = fingerprints[[
        "global_sample_id",
        "crop_exists",
        "file_size",
        "sha256",
        "phash",
        "brightness_mean",
        "contrast_std",
        "blur_laplacian",
        "fingerprint_error",
    ]].copy()

    fp = fp.rename(columns={
        "crop_exists": "fp_crop_exists",
        "file_size": "fp_file_size",
        "brightness_mean": "fp_brightness_mean",
        "contrast_std": "fp_contrast_std",
        "blur_laplacian": "fp_blur_laplacian",
        "fingerprint_error": "fp_fingerprint_error",
    })

    df = clustered.merge(fp, on="global_sample_id", how="left")

    df["crop_exists"] = df["fp_crop_exists"]
    df["file_size"] = df["fp_file_size"]
    df["brightness_mean"] = df["fp_brightness_mean"]
    df["contrast_std"] = df["fp_contrast_std"]
    df["blur_laplacian"] = df["fp_blur_laplacian"]
    df["fingerprint_error"] = df["fp_fingerprint_error"]

    df["crop_exists"] = df["crop_exists"].fillna("0").astype(str)
    df["file_size_num"] = pd.to_numeric(df["file_size"], errors="coerce").fillna(0)
    df["blur_num"] = pd.to_numeric(df["blur_laplacian"], errors="coerce").fillna(0)
    df["brightness_num"] = pd.to_numeric(df["brightness_mean"], errors="coerce").fillna(0)

    df = df[df["crop_exists"] == "1"].copy()

    # Strong keep rules:
    # - project-specific edge/bottom entry cases
    # - suspicious fragments for detector refinement review
    # - small/large/edge cases for robust detectors
    df["keep_priority"] = 0
    df.loc[df["critical_case_hint"] == 1, "keep_priority"] += 50
    df.loc[df["is_bottom_entry_candidate"] == 1, "keep_priority"] += 100
    df.loc[df["is_suspicious_fragment_candidate"] == 1, "keep_priority"] += 80
    df.loc[df["person_conf"].astype(float) >= 0.90, "keep_priority"] += 10
    df.loc[df["blur_num"] >= 25.0, "keep_priority"] += 5
    df.loc[(df["brightness_num"] >= 25.0) & (df["brightness_num"] <= 235.0), "keep_priority"] += 5

    df = df.sort_values([
        "temporal_cluster_id",
        "keep_priority",
        "person_conf",
        "blur_num",
        "global_sample_id",
    ], ascending=[True, False, False, False, True])

    selected_indices: list[int] = []

    for cluster_id, group in df.groupby("temporal_cluster_id", sort=False):
        group = group.copy()
        size = len(group)
        critical = group[group["critical_case_hint"] == 1]

        # Keep all critical cases only up to a limit per cluster to avoid exploding duplicates.
        if len(critical) > 0:
            selected_indices.extend(critical.head(5).index.tolist())

        # Keep deterministic representatives from the cluster.
        if size <= 3:
            selected_indices.extend(group.index.tolist())
        elif size <= 15:
            selected_indices.extend(group.head(3).index.tolist())
        elif size <= 60:
            selected_indices.extend(group.head(5).index.tolist())
            selected_indices.extend(group.iloc[[size // 2, size - 1]].index.tolist())
        else:
            selected_indices.extend(group.head(5).index.tolist())
            positions = sorted(set([
                size // 5,
                (size * 2) // 5,
                (size * 3) // 5,
                (size * 4) // 5,
                size - 1,
            ]))
            selected_indices.extend(group.iloc[positions].index.tolist())

    selected = df.loc[sorted(set(selected_indices))].copy()

    selected["dataset_candidate_person_detector"] = 1
    selected["dataset_candidate_head_detector"] = 1
    selected["dataset_candidate_headwear_classifier"] = 0

    selected["preliminary_keep_reason"] = "temporal_representative"
    selected.loc[selected["critical_case_hint"] == 1, "preliminary_keep_reason"] = "critical_case_representative"
    selected.loc[selected["is_bottom_entry_candidate"] == 1, "preliminary_keep_reason"] = "bottom_entry_keep"
    selected.loc[selected["is_suspicious_fragment_candidate"] == 1, "preliminary_keep_reason"] = "fragment_or_hard_negative_review"

    selected = selected.sort_values(["source_run", "timestamp_seconds", "frame_index", "global_sample_id"])

    selected.to_csv(out_path, sep=";", index=False, encoding="utf-8-sig")


def _write_run_summary(
    master: pd.DataFrame,
    fingerprints: pd.DataFrame,
    clustered: pd.DataFrame,
    filtered_path: Path,
    out_path: Path,
) -> None:
    exact_dup_count = int(
        fingerprints.groupby("sha256").size().reset_index(name="n").query("sha256 != '' and n > 1")["n"].sum()
    ) if len(fingerprints) else 0

    phash_dup_count = int(
        fingerprints.groupby("phash").size().reset_index(name="n").query("phash != '' and n > 1")["n"].sum()
    ) if len(fingerprints) else 0

    filtered_count = 0
    if filtered_path.exists():
        filtered_count = sum(1 for _ in filtered_path.open("r", encoding="utf-8-sig")) - 1

    rows = [
        ("raw_rows_total", len(master)),
        ("fingerprinted_rows_total", len(fingerprints)),
        ("crop_exists_total", int((fingerprints["crop_exists"].astype(str) == "1").sum())),
        ("crop_missing_total", int((fingerprints["crop_exists"].astype(str) != "1").sum())),
        ("exact_duplicate_rows_total", exact_dup_count),
        ("phash_duplicate_rows_total", phash_dup_count),
        ("temporal_clusters_total", clustered["temporal_cluster_id"].nunique()),
        ("preliminary_filtered_pool_rows", filtered_count),
        ("bottom_entry_candidates", int(master["is_bottom_entry_candidate"].sum())),
        ("edge_crop_candidates", int(master["is_edge_crop"].sum())),
        ("suspicious_fragment_candidates", int(master["is_suspicious_fragment_candidate"].sum())),
        ("small_person_candidates", int(master["is_small_person_candidate"].sum())),
        ("large_person_candidates", int(master["is_large_person_candidate"].sum())),
    ]

    pd.DataFrame(rows, columns=["metric", "value"]).to_csv(out_path, sep=";", index=False, encoding="utf-8-sig")


def build(args: argparse.Namespace) -> None:
    output_root = Path(args.output_root)
    audit_root = output_root / "audit"
    filtered_root = output_root / "filtered_pool"

    output_root.mkdir(parents=True, exist_ok=True)
    audit_root.mkdir(parents=True, exist_ok=True)
    filtered_root.mkdir(parents=True, exist_ok=True)

    sources = [
        SourceRun("run01_full_adaptive_0_25pct", Path(args.run01)),
        SourceRun("run02_sparse_25_68pct", Path(args.run02)),
        SourceRun("run03_sparse_68_100pct", Path(args.run03)),
    ]

    print("[stage 1] loading manifests")
    parts = []
    for source in sources:
        print(f"  - {source.name}: {source.run_dir}")
        parts.append(_load_one_run(source))

    master = pd.concat(parts, ignore_index=True)
    master = _to_numeric_columns(master)
    master = _add_quality_flags(master)

    master_path = output_root / "master_person_crops_manifest.csv"
    print(f"[stage 1] writing master manifest: {master_path}")
    master.to_csv(master_path, sep=";", index=False, encoding="utf-8-sig")

    fingerprints_path = audit_root / "image_fingerprints.csv"
    print("[stage 2] computing fingerprints: sha256 + pHash + image stats")
    fingerprints = _build_fingerprints(master, fingerprints_path, progress_every=args.progress_every)

    exact_path = audit_root / "exact_duplicate_groups.csv"
    phash_path = audit_root / "phash_duplicate_groups.csv"
    temporal_path = audit_root / "temporal_duplicate_groups.csv"
    quality_path = audit_root / "quality_distribution.csv"
    summary_path = output_root / "stage01_summary.csv"

    print(f"[stage 2] writing exact duplicates: {exact_path}")
    _write_exact_duplicate_report(fingerprints, exact_path)

    print(f"[stage 2] writing pHash duplicates: {phash_path}")
    _write_phash_duplicate_report(fingerprints, phash_path)

    print(f"[stage 2] writing temporal clusters: {temporal_path}")
    clustered = _write_temporal_report(master, temporal_path)

    clustered_master_path = output_root / "master_person_crops_manifest_with_temporal_clusters.csv"
    print(f"[stage 2] writing clustered master: {clustered_master_path}")
    clustered.to_csv(clustered_master_path, sep=";", index=False, encoding="utf-8-sig")

    print(f"[stage 2] writing quality distribution: {quality_path}")
    _write_quality_distribution(master, fingerprints, quality_path)

    filtered_path = filtered_root / "preliminary_filtered_person_crops_manifest.csv"
    print(f"[stage 3] writing preliminary filtered pool: {filtered_path}")
    _build_preliminary_filtered_pool(clustered, fingerprints, filtered_path)

    print(f"[summary] writing: {summary_path}")
    _write_run_summary(master, fingerprints, clustered, filtered_path, summary_path)

    print()
    print("DONE")
    print(f"master={master_path}")
    print(f"fingerprints={fingerprints_path}")
    print(f"exact_duplicates={exact_path}")
    print(f"phash_duplicates={phash_path}")
    print(f"temporal_duplicates={temporal_path}")
    print(f"quality_distribution={quality_path}")
    print(f"filtered_pool={filtered_path}")
    print(f"summary={summary_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run01", required=True)
    parser.add_argument("--run02", required=True)
    parser.add_argument("--run03", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--progress-every", type=int, default=5000)
    return parser.parse_args()


if __name__ == "__main__":
    build(parse_args())
