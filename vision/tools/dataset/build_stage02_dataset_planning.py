# ============================================================
# File: vision/tools/dataset/build_stage02_dataset_planning.py
# Purpose:
# - Build deterministic filtered pools from stage01 audit results.
# - Reduce temporal duplicates without losing important production cases.
# - Create planning manifests for three future datasets:
#   1) person detector refinement
#   2) head detector
#   3) headwear policy classifier
# - Do not copy images and do not modify raw collections.
# ============================================================

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


def _read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")
    return pd.read_csv(path, sep=";", dtype=str, keep_default_na=False).fillna("")


def _to_float(series: pd.Series, default: float = 0.0) -> pd.Series:
    return pd.to_numeric(series.astype(str).str.replace(",", ".", regex=False), errors="coerce").fillna(default)


def _to_int(series: pd.Series, default: int = 0) -> pd.Series:
    return _to_float(series, float(default)).round().astype("int64")


def _ensure_numeric(df: pd.DataFrame) -> pd.DataFrame:
    numeric_float_cols = [
        "timestamp_seconds",
        "person_conf",
        "bbox_x1",
        "bbox_y1",
        "bbox_x2",
        "bbox_y2",
        "aspect_ratio",
        "area_ratio",
        "bbox_center_x_norm",
        "bbox_center_y_norm",
        "bbox_width_norm",
        "bbox_height_norm",
    ]

    numeric_int_cols = [
        "frame_index",
        "crop_width",
        "crop_height",
        "frame_width",
        "frame_height",
        "is_bottom_entry_candidate",
        "is_edge_crop",
        "is_suspicious_fragment_candidate",
        "is_small_person_candidate",
        "is_large_person_candidate",
        "critical_case_hint",
    ]

    for col in numeric_float_cols:
        if col in df.columns:
            df[col] = _to_float(df[col])

    for col in numeric_int_cols:
        if col in df.columns:
            df[col] = _to_int(df[col])

    return df


def _merge_fingerprints(master: pd.DataFrame, fingerprints: pd.DataFrame) -> pd.DataFrame:
    fp_cols = [
        "global_sample_id",
        "crop_exists",
        "file_size",
        "sha256",
        "phash",
        "brightness_mean",
        "contrast_std",
        "blur_laplacian",
        "fingerprint_error",
    ]

    fp = fingerprints[fp_cols].copy()
    fp = fp.rename(columns={
        "crop_exists": "fp_crop_exists",
        "file_size": "fp_file_size",
        "sha256": "fp_sha256",
        "phash": "fp_phash",
        "brightness_mean": "fp_brightness_mean",
        "contrast_std": "fp_contrast_std",
        "blur_laplacian": "fp_blur_laplacian",
        "fingerprint_error": "fp_fingerprint_error",
    })

    out = master.merge(fp, on="global_sample_id", how="left")

    out["crop_exists"] = out["fp_crop_exists"].fillna("0")
    out["file_size"] = out["fp_file_size"].fillna("0")
    out["sha256"] = out["fp_sha256"].fillna("")
    out["phash"] = out["fp_phash"].fillna("")
    out["brightness_mean"] = _to_float(out["fp_brightness_mean"])
    out["contrast_std"] = _to_float(out["fp_contrast_std"])
    out["blur_laplacian"] = _to_float(out["fp_blur_laplacian"])
    out["fingerprint_error"] = out["fp_fingerprint_error"].fillna("")

    out = out[out["crop_exists"].astype(str) == "1"].copy()

    return out


def _add_quality_score(df: pd.DataFrame) -> pd.DataFrame:
    conf = _to_float(df["person_conf"])
    blur = _to_float(df["blur_laplacian"])
    brightness = _to_float(df["brightness_mean"])
    area = _to_float(df["area_ratio"])

    blur_score = np.clip(blur / 120.0, 0.0, 1.0)
    brightness_score = np.where((brightness >= 25.0) & (brightness <= 235.0), 1.0, 0.3)
    area_score = np.clip(area / 0.12, 0.0, 1.0)

    df["quality_score"] = (
        conf * 0.50
        + blur_score * 0.20
        + brightness_score * 0.15
        + area_score * 0.15
    ).round(6)

    return df


def _pick_positions(group: pd.DataFrame, max_keep: int) -> list[int]:
    if len(group) <= max_keep:
        return group.index.tolist()

    positions = {0, len(group) - 1}

    if max_keep >= 3:
        positions.add(len(group) // 2)

    if max_keep >= 4:
        positions.add(len(group) // 3)

    if max_keep >= 5:
        positions.add((len(group) * 2) // 3)

    if max_keep >= 6:
        positions.add(len(group) // 4)

    if max_keep >= 7:
        positions.add((len(group) * 3) // 4)

    picked = group.iloc[sorted(positions)].index.tolist()
    return picked[:max_keep]


def _select_pool(df: pd.DataFrame, mode: str) -> pd.DataFrame:
    selected: set[int] = set()

    ordered = df.sort_values([
        "source_run",
        "temporal_cluster_id",
        "timestamp_seconds",
        "frame_index",
        "global_sample_id",
    ]).copy()

    for cluster_id, group in ordered.groupby("temporal_cluster_id", sort=False):
        group = group.sort_values(["timestamp_seconds", "frame_index", "global_sample_id"]).copy()
        n = len(group)

        suspicious = group[group["is_suspicious_fragment_candidate"] == 1]
        bottom = group[group["is_bottom_entry_candidate"] == 1]
        edge = group[group["is_edge_crop"] == 1]

        # The main correction:
        # bottom entry is important, but it is not a reason to keep every frame.
        if mode == "compact":
            if n <= 3:
                max_keep = 1
            elif n <= 30:
                max_keep = 2
            elif n <= 150:
                max_keep = 3
            else:
                max_keep = 4

            max_suspicious = 3
            max_bottom_extra = 1

        elif mode == "balanced":
            if n <= 3:
                max_keep = min(n, 2)
            elif n <= 15:
                max_keep = 3
            elif n <= 60:
                max_keep = 4
            elif n <= 300:
                max_keep = 5
            else:
                max_keep = 6

            max_suspicious = 6
            max_bottom_extra = 2

        else:
            raise ValueError(f"Unknown mode: {mode}")

        # Representatives across time.
        for idx in _pick_positions(group, max_keep=max_keep):
            selected.add(int(idx))

        # Best quality row per cluster.
        best_quality_idx = group.sort_values(
            ["quality_score", "person_conf", "blur_laplacian"],
            ascending=[False, False, False],
        ).head(1).index
        for idx in best_quality_idx:
            selected.add(int(idx))

        # Keep suspicious fragment candidates more carefully for person detector refinement.
        if len(suspicious) > 0:
            suspicious_best = suspicious.sort_values(
                ["quality_score", "person_conf"],
                ascending=[False, False],
            ).head(max_suspicious)
            for idx in suspicious_best.index:
                selected.add(int(idx))

        # Keep bottom-entry diversity, but do not let it dominate the dataset.
        if len(bottom) > 0:
            bottom_best = bottom.sort_values(
                ["quality_score", "person_conf"],
                ascending=[False, False],
            ).head(max_bottom_extra)
            for idx in bottom_best.index:
                selected.add(int(idx))

        # Keep one edge case if it is not already represented.
        if mode == "balanced" and len(edge) > 0:
            edge_best = edge.sort_values(
                ["quality_score", "person_conf"],
                ascending=[False, False],
            ).head(1)
            for idx in edge_best.index:
                selected.add(int(idx))

    out = df.loc[sorted(selected)].copy()
    out = out.sort_values(["source_run", "timestamp_seconds", "frame_index", "global_sample_id"])

    out["filtered_pool_mode"] = mode
    out["dedupe_strategy"] = "temporal_cluster_representatives_no_random_sampling"

    return out


def _assign_annotation_priority(df: pd.DataFrame) -> pd.DataFrame:
    priority = np.zeros(len(df), dtype=np.int32)

    priority += (df["is_suspicious_fragment_candidate"].astype(int) == 1) * 90
    priority += (df["is_bottom_entry_candidate"].astype(int) == 1) * 80
    priority += (df["is_edge_crop"].astype(int) == 1) * 50
    priority += (df["is_small_person_candidate"].astype(int) == 1) * 35
    priority += (df["is_large_person_candidate"].astype(int) == 1) * 30
    priority += (_to_float(df["person_conf"]) >= 0.90).astype(int) * 10
    priority += (_to_float(df["blur_laplacian"]) >= 25.0).astype(int) * 5

    df["annotation_priority"] = priority
    return df


def _person_detector_role(row: pd.Series) -> str:
    if int(row.get("is_suspicious_fragment_candidate", 0)) == 1:
        return "review_person_fragment_context_or_hard_negative"
    if int(row.get("is_bottom_entry_candidate", 0)) == 1:
        return "review_person_trackable_bottom_entry"
    if int(row.get("is_edge_crop", 0)) == 1:
        return "review_person_trackable_edge_case"
    return "review_person_trackable"


def _head_detector_role(row: pd.Series) -> str:
    if int(row.get("is_suspicious_fragment_candidate", 0)) == 1:
        return "mark_head_bbox_or_no_actionable_head_fragment_case"
    if int(row.get("is_bottom_entry_candidate", 0)) == 1:
        return "mark_head_bbox_bottom_entry"
    if int(row.get("is_edge_crop", 0)) == 1:
        return "mark_head_bbox_edge_case"
    return "mark_head_bbox_or_no_actionable_head"


def _build_person_detector_candidates(pool: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    df = pool.copy()
    df["person_detector_review_role"] = df.apply(_person_detector_role, axis=1)
    df["person_detector_annotation_action"] = "review_bbox_on_full_frame"
    df["yolo_class_policy_v1"] = "person_trackable_or_empty_hard_negative_after_review"

    bbox_cols = [
        "global_sample_id",
        "source_run",
        "absolute_frame_path",
        "absolute_crop_path",
        "frame_index",
        "timestamp_seconds",
        "bbox_x1",
        "bbox_y1",
        "bbox_x2",
        "bbox_y2",
        "person_conf",
        "person_detector_review_role",
        "person_detector_annotation_action",
        "yolo_class_policy_v1",
        "annotation_priority",
        "temporal_cluster_id",
        "is_bottom_entry_candidate",
        "is_edge_crop",
        "is_suspicious_fragment_candidate",
        "quality_score",
    ]

    bbox_candidates = df[bbox_cols].copy()

    frame_candidates = df.groupby("absolute_frame_path").agg(
        source_run=("source_run", "first"),
        first_timestamp=("timestamp_seconds", "min"),
        last_timestamp=("timestamp_seconds", "max"),
        bboxes_in_selected_pool=("global_sample_id", "count"),
        max_annotation_priority=("annotation_priority", "max"),
        bottom_entry_cases=("is_bottom_entry_candidate", "sum"),
        edge_cases=("is_edge_crop", "sum"),
        suspicious_fragment_cases=("is_suspicious_fragment_candidate", "sum"),
    ).reset_index()

    frame_candidates = frame_candidates.sort_values(
        ["max_annotation_priority", "bboxes_in_selected_pool", "first_timestamp"],
        ascending=[False, False, True],
    )

    return bbox_candidates, frame_candidates


def _build_head_detector_candidates(pool: pd.DataFrame) -> pd.DataFrame:
    df = pool.copy()
    df["head_detector_review_role"] = df.apply(_head_detector_role, axis=1)
    df["head_annotation_action"] = "draw_head_bbox_or_mark_no_actionable_head"
    df["head_detector_class_policy_v1"] = "single_class_head_with_empty_labels_for_no_actionable_head"

    cols = [
        "global_sample_id",
        "source_run",
        "absolute_crop_path",
        "absolute_frame_path",
        "frame_index",
        "timestamp_seconds",
        "person_conf",
        "crop_width",
        "crop_height",
        "aspect_ratio",
        "area_ratio",
        "head_detector_review_role",
        "head_annotation_action",
        "head_detector_class_policy_v1",
        "annotation_priority",
        "temporal_cluster_id",
        "is_bottom_entry_candidate",
        "is_edge_crop",
        "is_suspicious_fragment_candidate",
        "quality_score",
    ]

    return df[cols].sort_values(
        ["annotation_priority", "timestamp_seconds", "global_sample_id"],
        ascending=[False, True, True],
    )


def _write_policy_docs(stage02_root: Path) -> None:
    specs_root = stage02_root / "dataset_specs"
    specs_root.mkdir(parents=True, exist_ok=True)

    person_dir = specs_root / "person_detector_refinement_v1"
    head_dir = specs_root / "head_detector_v1"
    headwear_dir = specs_root / "headwear_policy_classifier_v1"

    for p in [person_dir, head_dir, headwear_dir]:
        p.mkdir(parents=True, exist_ok=True)

    (person_dir / "annotation_policy.md").write_text(
        """# Person detector refinement v1

## Цель
Доработать person detector так, чтобы он видел реального работника, но не превращал руки, рукава, печку и фрагменты халата в обычного человека.

## person_trackable
Размечается как человек:
- полный человек;
- человек по пояс;
- человек со спины;
- человек входит снизу кадра, если видна голова, шапочка, плечи или верх корпуса;
- человек выходит из кадра, но фигура читается;
- наклонённый человек с читаемой фигурой;
- голова + плечи / верх корпуса.

## person_fragment_context
Можно видеть диагностически, но нельзя пускать в headwear analysis:
- только рука;
- рукав;
- нога;
- обувь;
- кусок халата;
- часть тела без головы и без связной фигуры.

## hard negative / empty label
- печка;
- оборудование;
- стол;
- дверь;
- стойка;
- труба;
- тень;
- отражение;
- тёмный вертикальный объект.

## Главное правило
Край тела сам по себе не является negative. Если человек входит снизу и видна голова/шапочка/плечи — это valid person_trackable.
""",
        encoding="utf-8",
    )

    (head_dir / "annotation_policy.md").write_text(
        """# Head detector v1

## Цель
Найти реальный head bbox внутри person crop. Геометрический head crop не является истиной.

## class
0: head

## Positive head
- голова полностью видна;
- голова частично видна, но шапочка/волосы различимы;
- голова входит снизу кадра;
- голова у нижнего края кадра;
- голова со спины;
- голова сбоку;
- голова наклонена;
- маленькая, но читаемая голова.

## Empty label / no actionable head
- головы нет;
- только плечо;
- только спина без головы;
- только рука;
- кусок халата;
- сильно размытый объект;
- объект похож на голову, но неясен.

## Runtime rule
Если head bbox не найден или голова непригодна, headwear classifier не запускается.
""",
        encoding="utf-8",
    )

    (headwear_dir / "annotation_policy.md").write_text(
        """# Headwear policy classifier v1

## Classes
0: allowed_sanitary_headwear
1: no_headwear
2: wrong_or_forbidden_headwear
3: unknown_unusable

## allowed_sanitary_headwear
- санитарная шапочка;
- сетка;
- колпак;
- допустимый головной убор;
- голова у нижнего края кадра, если шапочка различима.

## no_headwear
- голова без головного убора;
- видны волосы;
- нет сетки/шапочки/колпака;
- голова у нижнего края кадра без убора, если это различимо.

## wrong_or_forbidden_headwear
- капюшон;
- обычная шапка;
- кепка;
- повязка;
- неправильный головной убор;
- головной убор есть, но волосы явно открыты.

## unknown_unusable
- голова слишком мутная;
- слишком маленькая;
- сильное перекрытие;
- слишком мало головы видно;
- невозможно уверенно понять;
- плохое освещение.

## Runtime rule
unknown_unusable не является нарушением.
""",
        encoding="utf-8",
    )

    class_rows = [
        ("0", "allowed_sanitary_headwear", "compliant"),
        ("1", "no_headwear", "violation"),
        ("2", "wrong_or_forbidden_headwear", "violation_subtype"),
        ("3", "unknown_unusable", "not_evaluable"),
    ]

    pd.DataFrame(class_rows, columns=["class_id", "class_name", "runtime_policy"]).to_csv(
        headwear_dir / "classes.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )


def _write_summary(stage02_root: Path, raw: pd.DataFrame, compact: pd.DataFrame, balanced: pd.DataFrame, person_bbox: pd.DataFrame, person_frames: pd.DataFrame, head_candidates: pd.DataFrame) -> None:
    rows = [
        ("raw_rows_total", len(raw)),
        ("compact_filtered_rows", len(compact)),
        ("balanced_filtered_rows", len(balanced)),
        ("person_detector_bbox_candidates", len(person_bbox)),
        ("person_detector_unique_frame_candidates", len(person_frames)),
        ("head_detector_annotation_candidates", len(head_candidates)),
        ("raw_temporal_clusters", raw["temporal_cluster_id"].nunique()),
        ("compact_temporal_clusters", compact["temporal_cluster_id"].nunique()),
        ("balanced_temporal_clusters", balanced["temporal_cluster_id"].nunique()),
        ("compact_bottom_entry_rows", int(compact["is_bottom_entry_candidate"].sum())),
        ("balanced_bottom_entry_rows", int(balanced["is_bottom_entry_candidate"].sum())),
        ("compact_suspicious_fragment_rows", int(compact["is_suspicious_fragment_candidate"].sum())),
        ("balanced_suspicious_fragment_rows", int(balanced["is_suspicious_fragment_candidate"].sum())),
    ]

    pd.DataFrame(rows, columns=["metric", "value"]).to_csv(
        stage02_root / "stage02_summary.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )


def build(args: argparse.Namespace) -> None:
    stage01_root = Path(args.stage01_root)
    stage02_root = Path(args.stage02_root)

    stage02_root.mkdir(parents=True, exist_ok=True)

    master_path = stage01_root / "master_person_crops_manifest_with_temporal_clusters.csv"
    fingerprints_path = stage01_root / "audit" / "image_fingerprints.csv"

    print("[stage02] reading stage01 outputs")
    master = _read_csv(master_path)
    fingerprints = _read_csv(fingerprints_path)

    master = _ensure_numeric(master)
    df = _merge_fingerprints(master, fingerprints)
    df = _ensure_numeric(df)
    df = _add_quality_score(df)
    df = _assign_annotation_priority(df)

    print("[stage02] building compact filtered pool")
    compact = _select_pool(df, mode="compact")

    print("[stage02] building balanced filtered pool")
    balanced = _select_pool(df, mode="balanced")

    filtered_dir = stage02_root / "filtered_pool_v2"
    planning_dir = stage02_root / "dataset_planning_manifests"

    filtered_dir.mkdir(parents=True, exist_ok=True)
    planning_dir.mkdir(parents=True, exist_ok=True)

    compact_path = filtered_dir / "compact_filtered_person_crops_manifest.csv"
    balanced_path = filtered_dir / "balanced_filtered_person_crops_manifest.csv"

    compact.to_csv(compact_path, sep=";", index=False, encoding="utf-8-sig")
    balanced.to_csv(balanced_path, sep=";", index=False, encoding="utf-8-sig")

    print("[stage02] building person detector candidate manifests")
    person_bbox, person_frames = _build_person_detector_candidates(balanced)
    person_bbox_path = planning_dir / "person_detector_bbox_candidates.csv"
    person_frames_path = planning_dir / "person_detector_frame_candidates.csv"

    person_bbox.to_csv(person_bbox_path, sep=";", index=False, encoding="utf-8-sig")
    person_frames.to_csv(person_frames_path, sep=";", index=False, encoding="utf-8-sig")

    print("[stage02] building head detector candidate manifest")
    head_candidates = _build_head_detector_candidates(balanced)
    head_candidates_path = planning_dir / "head_detector_annotation_candidates.csv"
    head_candidates.to_csv(head_candidates_path, sep=";", index=False, encoding="utf-8-sig")

    print("[stage02] writing headwear policy placeholder")
    headwear_plan = pd.DataFrame([
        {
            "dataset": "headwear_policy_classifier_v1",
            "status": "pending_head_bbox_annotations",
            "source": "head crops must be generated after head detector annotation/export",
            "classes": "allowed_sanitary_headwear,no_headwear,wrong_or_forbidden_headwear,unknown_unusable",
        }
    ])
    headwear_plan_path = planning_dir / "headwear_policy_classifier_pending_plan.csv"
    headwear_plan.to_csv(headwear_plan_path, sep=";", index=False, encoding="utf-8-sig")

    print("[stage02] writing annotation policy docs")
    _write_policy_docs(stage02_root)

    print("[stage02] writing summary")
    _write_summary(stage02_root, df, compact, balanced, person_bbox, person_frames, head_candidates)

    print()
    print("DONE")
    print(f"compact={compact_path}")
    print(f"balanced={balanced_path}")
    print(f"person_bbox_candidates={person_bbox_path}")
    print(f"person_frame_candidates={person_frames_path}")
    print(f"head_detector_candidates={head_candidates_path}")
    print(f"headwear_plan={headwear_plan_path}")
    print(f"summary={stage02_root / 'stage02_summary.csv'}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage01-root", required=True)
    parser.add_argument("--stage02-root", required=True)
    return parser.parse_args()


if __name__ == "__main__":
    build(parse_args())
