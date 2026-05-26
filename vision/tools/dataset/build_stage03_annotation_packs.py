# ============================================================
# File: vision/tools/dataset/build_stage03_annotation_packs.py
# Purpose:
# - Build quota-based annotation packs from Stage02 planning manifests.
# - Avoid random sampling and avoid temporal leakage.
# - Create manageable annotation manifests:
#   1) person detector refinement pack
#   2) head detector annotation pack
#   3) headwear classifier pending plan
# - Do not copy images and do not modify raw collections.
# ============================================================

from __future__ import annotations

import argparse
import hashlib
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


def _stable_hash_percent(value: str) -> int:
    digest = hashlib.md5(value.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def _assign_split(split_group_id: str) -> str:
    bucket = _stable_hash_percent(split_group_id)
    if bucket < 70:
        return "train"
    if bucket < 85:
        return "val"
    return "test"


def _ensure_numeric_person_frames(df: pd.DataFrame) -> pd.DataFrame:
    for col in [
        "first_timestamp",
        "last_timestamp",
        "bboxes_in_selected_pool",
        "max_annotation_priority",
        "bottom_entry_cases",
        "edge_cases",
        "suspicious_fragment_cases",
    ]:
        if col in df.columns:
            df[col] = _to_float(df[col])
    return df


def _ensure_numeric_candidates(df: pd.DataFrame) -> pd.DataFrame:
    for col in [
        "timestamp_seconds",
        "frame_index",
        "person_conf",
        "crop_width",
        "crop_height",
        "aspect_ratio",
        "area_ratio",
        "annotation_priority",
        "is_bottom_entry_candidate",
        "is_edge_crop",
        "is_suspicious_fragment_candidate",
        "quality_score",
    ]:
        if col in df.columns:
            df[col] = _to_float(df[col])
    return df


def _frame_bucket(row: pd.Series) -> str:
    suspicious = float(row.get("suspicious_fragment_cases", 0))
    bottom = float(row.get("bottom_entry_cases", 0))
    edge = float(row.get("edge_cases", 0))
    bbox_count = float(row.get("bboxes_in_selected_pool", 0))

    if suspicious > 0:
        return "fragment_or_hard_negative_review"
    if bottom > 0:
        return "bottom_entry_person_trackable"
    if edge > 0:
        return "edge_or_partial_person"
    if bbox_count >= 2:
        return "multi_bbox_frame"
    return "normal_person_trackable"


def _head_bucket(row: pd.Series) -> str:
    suspicious = int(float(row.get("is_suspicious_fragment_candidate", 0)))
    bottom = int(float(row.get("is_bottom_entry_candidate", 0)))
    edge = int(float(row.get("is_edge_crop", 0)))
    role = str(row.get("head_detector_review_role", ""))

    if suspicious == 1 or "fragment" in role:
        return "no_actionable_head_or_fragment_review"
    if bottom == 1:
        return "bottom_entry_head"
    if edge == 1:
        return "edge_or_partial_head"
    return "normal_head_visible_candidate"


def _pick_spread_by_group(
    df: pd.DataFrame,
    target: int,
    group_col: str,
    sort_cols: list[str],
    ascending: list[bool],
    max_per_group_first_pass: int = 1,
) -> pd.DataFrame:
    if target <= 0 or len(df) == 0:
        return df.head(0).copy()

    ordered = df.sort_values(sort_cols, ascending=ascending).copy()

    selected_indices: list[int] = []

    for _, group in ordered.groupby(group_col, sort=False):
        take = group.head(max_per_group_first_pass)
        selected_indices.extend(take.index.tolist())
        if len(selected_indices) >= target:
            break

    if len(selected_indices) < target:
        already = set(selected_indices)
        rest = ordered[~ordered.index.isin(already)]
        selected_indices.extend(rest.head(target - len(selected_indices)).index.tolist())

    return df.loc[selected_indices[:target]].copy()


def _quota_select(
    df: pd.DataFrame,
    bucket_col: str,
    quotas: dict[str, int],
    group_col: str,
    sort_cols: list[str],
    ascending: list[bool],
) -> pd.DataFrame:
    selected_parts: list[pd.DataFrame] = []

    for bucket, target in quotas.items():
        part = df[df[bucket_col] == bucket].copy()
        picked = _pick_spread_by_group(
            part,
            target=target,
            group_col=group_col,
            sort_cols=sort_cols,
            ascending=ascending,
            max_per_group_first_pass=1,
        )
        selected_parts.append(picked)

    selected = pd.concat(selected_parts, ignore_index=False) if selected_parts else df.head(0).copy()

    selected_ids = set(selected.index.tolist())
    target_total = sum(quotas.values())

    if len(selected) < target_total:
        rest = df[~df.index.isin(selected_ids)].copy()
        rest_picked = _pick_spread_by_group(
            rest,
            target=target_total - len(selected),
            group_col=group_col,
            sort_cols=sort_cols,
            ascending=ascending,
            max_per_group_first_pass=1,
        )
        selected = pd.concat([selected, rest_picked], ignore_index=False)

    return selected.drop_duplicates().copy()


def _build_person_pack(
    frame_candidates: pd.DataFrame,
    bbox_candidates: pd.DataFrame,
    target_frames: int,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    frames = _ensure_numeric_person_frames(frame_candidates.copy())
    frames["stage03_bucket"] = frames.apply(_frame_bucket, axis=1)

    frames["time_bucket_5min"] = np.floor(_to_float(frames["first_timestamp"]) / 300.0).astype("int64")
    frames["selection_group_id"] = (
        frames["source_run"].astype(str)
        + "__tb5m_"
        + frames["time_bucket_5min"].astype(str)
        + "__bucket_"
        + frames["stage03_bucket"].astype(str)
    )

    quotas = {
        "normal_person_trackable": int(target_frames * 0.30),
        "bottom_entry_person_trackable": int(target_frames * 0.25),
        "fragment_or_hard_negative_review": int(target_frames * 0.20),
        "edge_or_partial_person": int(target_frames * 0.15),
        "multi_bbox_frame": target_frames,
    }
    quotas["multi_bbox_frame"] = target_frames - sum(v for k, v in quotas.items() if k != "multi_bbox_frame")

    selected_frames = _quota_select(
        frames,
        bucket_col="stage03_bucket",
        quotas=quotas,
        group_col="selection_group_id",
        sort_cols=[
            "max_annotation_priority",
            "bboxes_in_selected_pool",
            "first_timestamp",
            "absolute_frame_path",
        ],
        ascending=[False, False, True, True],
    )

    selected_frames["split_group_id"] = (
        selected_frames["source_run"].astype(str)
        + "__tb5m_"
        + selected_frames["time_bucket_5min"].astype(str)
    )
    selected_frames["split"] = selected_frames["split_group_id"].map(_assign_split)

    selected_frames["annotation_task"] = "person_detector_refinement"
    selected_frames["annotation_instruction"] = (
        "review full frame: mark person_trackable; mark fragments as context/ignore; leave hard negatives empty"
    )

    selected_frame_paths = set(selected_frames["absolute_frame_path"].astype(str).tolist())

    boxes = bbox_candidates.copy()
    boxes = _ensure_numeric_candidates(boxes)
    selected_boxes = boxes[boxes["absolute_frame_path"].astype(str).isin(selected_frame_paths)].copy()

    frame_split_map = selected_frames.set_index("absolute_frame_path")["split"].to_dict()
    frame_group_map = selected_frames.set_index("absolute_frame_path")["split_group_id"].to_dict()
    frame_bucket_map = selected_frames.set_index("absolute_frame_path")["stage03_bucket"].to_dict()

    selected_boxes["split"] = selected_boxes["absolute_frame_path"].map(frame_split_map).fillna("")
    selected_boxes["split_group_id"] = selected_boxes["absolute_frame_path"].map(frame_group_map).fillna("")
    selected_boxes["stage03_frame_bucket"] = selected_boxes["absolute_frame_path"].map(frame_bucket_map).fillna("")

    selected_boxes["annotation_task"] = "person_detector_refinement_bbox_context"
    selected_boxes["annotation_instruction"] = (
        "use as current detector proposal context; final YOLO label must be reviewed on full frame"
    )

    return selected_frames, selected_boxes


def _build_head_pack(head_candidates: pd.DataFrame, target_crops: int) -> pd.DataFrame:
    heads = _ensure_numeric_candidates(head_candidates.copy())
    heads["stage03_bucket"] = heads.apply(_head_bucket, axis=1)

    heads["selection_group_id"] = (
        heads["source_run"].astype(str)
        + "__"
        + heads["temporal_cluster_id"].astype(str)
        + "__bucket_"
        + heads["stage03_bucket"].astype(str)
    )

    quotas = {
        "normal_head_visible_candidate": int(target_crops * 0.40),
        "bottom_entry_head": int(target_crops * 0.25),
        "no_actionable_head_or_fragment_review": int(target_crops * 0.20),
        "edge_or_partial_head": target_crops,
    }
    quotas["edge_or_partial_head"] = target_crops - sum(v for k, v in quotas.items() if k != "edge_or_partial_head")

    selected = _quota_select(
        heads,
        bucket_col="stage03_bucket",
        quotas=quotas,
        group_col="selection_group_id",
        sort_cols=[
            "annotation_priority",
            "quality_score",
            "person_conf",
            "timestamp_seconds",
            "global_sample_id",
        ],
        ascending=[False, False, False, True, True],
    )

    selected["split_group_id"] = (
        selected["source_run"].astype(str)
        + "__"
        + selected["temporal_cluster_id"].astype(str)
    )
    selected["split"] = selected["split_group_id"].map(_assign_split)

    selected["annotation_task"] = "head_detector_v1"
    selected["annotation_instruction"] = (
        "draw head bbox if actionable head is visible; otherwise mark no_actionable_head/empty label"
    )

    return selected.sort_values(
        ["stage03_bucket", "split", "timestamp_seconds", "global_sample_id"],
        ascending=[True, True, True, True],
    )


def _write_pack_summary(
    stage03_root: Path,
    person_frames: pd.DataFrame,
    person_boxes: pd.DataFrame,
    head_crops: pd.DataFrame,
) -> None:
    rows = [
        ("person_pack_unique_frames", len(person_frames)),
        ("person_pack_detector_proposal_boxes", len(person_boxes)),
        ("head_pack_person_crops", len(head_crops)),
        ("person_pack_train_frames", int((person_frames["split"] == "train").sum())),
        ("person_pack_val_frames", int((person_frames["split"] == "val").sum())),
        ("person_pack_test_frames", int((person_frames["split"] == "test").sum())),
        ("head_pack_train_crops", int((head_crops["split"] == "train").sum())),
        ("head_pack_val_crops", int((head_crops["split"] == "val").sum())),
        ("head_pack_test_crops", int((head_crops["split"] == "test").sum())),
    ]

    for bucket, count in person_frames["stage03_bucket"].value_counts().sort_index().items():
        rows.append((f"person_bucket_{bucket}", int(count)))

    for bucket, count in head_crops["stage03_bucket"].value_counts().sort_index().items():
        rows.append((f"head_bucket_{bucket}", int(count)))

    pd.DataFrame(rows, columns=["metric", "value"]).to_csv(
        stage03_root / "stage03_summary.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )


def _write_readme(stage03_root: Path) -> None:
    readme = """# Stage03 annotation packs

Этот этап не копирует изображения и не создаёт финальные train/val/test папки.
Он создаёт управляемые CSV-паки для разметки.

## Person detector refinement pack

Файл:
person_detector_refinement_pack/frames_to_annotate.csv

Назначение:
размечать full frame. Текущие bbox используются только как контекст текущего detector-а.

Классы/логика:
- person_trackable
- person_fragment_context / ignore
- hard negative / empty label

## Head detector pack

Файл:
head_detector_v1_pack/person_crops_to_annotate.csv

Назначение:
размечать head bbox внутри person crop.

Класс:
- head

Если головы нет или она непригодна:
- empty label / no_actionable_head

## Headwear classifier

Пока pending.
Он строится только после появления head bbox и экспорта head crops.
"""
    (stage03_root / "README_STAGE03.md").write_text(readme, encoding="utf-8")


def build(args: argparse.Namespace) -> None:
    stage02_root = Path(args.stage02_root)
    stage03_root = Path(args.stage03_root)

    stage03_root.mkdir(parents=True, exist_ok=True)

    planning_root = stage02_root / "dataset_planning_manifests"

    frame_candidates_path = planning_root / "person_detector_frame_candidates.csv"
    bbox_candidates_path = planning_root / "person_detector_bbox_candidates.csv"
    head_candidates_path = planning_root / "head_detector_annotation_candidates.csv"

    print("[stage03] reading Stage02 manifests")
    frame_candidates = _read_csv(frame_candidates_path)
    bbox_candidates = _read_csv(bbox_candidates_path)
    head_candidates = _read_csv(head_candidates_path)

    print("[stage03] building person detector refinement pack")
    person_frames, person_boxes = _build_person_pack(
        frame_candidates=frame_candidates,
        bbox_candidates=bbox_candidates,
        target_frames=args.person_target_frames,
    )

    print("[stage03] building head detector annotation pack")
    head_crops = _build_head_pack(
        head_candidates=head_candidates,
        target_crops=args.head_target_crops,
    )

    person_root = stage03_root / "person_detector_refinement_pack"
    head_root = stage03_root / "head_detector_v1_pack"
    headwear_root = stage03_root / "headwear_policy_classifier_pending"

    person_root.mkdir(parents=True, exist_ok=True)
    head_root.mkdir(parents=True, exist_ok=True)
    headwear_root.mkdir(parents=True, exist_ok=True)

    person_frames_path = person_root / "frames_to_annotate.csv"
    person_boxes_path = person_root / "detector_proposal_boxes_for_selected_frames.csv"
    head_crops_path = head_root / "person_crops_to_annotate.csv"

    person_frames.to_csv(person_frames_path, sep=";", index=False, encoding="utf-8-sig")
    person_boxes.to_csv(person_boxes_path, sep=";", index=False, encoding="utf-8-sig")
    head_crops.to_csv(head_crops_path, sep=";", index=False, encoding="utf-8-sig")

    pending = pd.DataFrame([
        {
            "dataset": "headwear_policy_classifier_v1",
            "status": "pending",
            "reason": "headwear classifier requires head crops generated from annotated head bbox",
            "classes": "allowed_sanitary_headwear,no_headwear,wrong_or_forbidden_headwear,unknown_unusable",
        }
    ])
    pending.to_csv(
        headwear_root / "headwear_classifier_pending_until_head_bbox.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )

    print("[stage03] writing summary and readme")
    _write_pack_summary(stage03_root, person_frames, person_boxes, head_crops)
    _write_readme(stage03_root)

    print()
    print("DONE")
    print(f"person_frames={person_frames_path}")
    print(f"person_boxes={person_boxes_path}")
    print(f"head_crops={head_crops_path}")
    print(f"summary={stage03_root / 'stage03_summary.csv'}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage02-root", required=True)
    parser.add_argument("--stage03-root", required=True)
    parser.add_argument("--person-target-frames", type=int, default=15000)
    parser.add_argument("--head-target-crops", type=int, default=30000)
    return parser.parse_args()


if __name__ == "__main__":
    build(parse_args())
