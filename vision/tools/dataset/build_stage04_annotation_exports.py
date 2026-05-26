# ============================================================
# File: vision/tools/dataset/build_stage04_annotation_exports.py
# Purpose:
# - Export Stage03 annotation packs into physical image folders.
# - Use hardlinks by default to avoid duplicating many image files.
# - Keep annotation metadata and detector proposals separate from labels.
# - Do not modify raw collections.
# ============================================================

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import shutil
from pathlib import Path

import pandas as pd


def _read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")
    return pd.read_csv(path, sep=";", dtype=str, keep_default_na=False).fillna("")


def _safe_text(value: object, max_len: int = 80) -> str:
    text = str(value).strip()
    allowed = []
    for ch in text:
        if ch.isalnum() or ch in ("-", "_", "."):
            allowed.append(ch)
        else:
            allowed.append("_")
    out = "".join(allowed).strip("_")
    if not out:
        out = "item"
    return out[:max_len]


def _short_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8", errors="ignore")).hexdigest()[:12]


def _ensure_dirs(root: Path) -> None:
    for split in ["train", "val", "test"]:
        (root / "images" / split).mkdir(parents=True, exist_ok=True)

    (root / "metadata").mkdir(parents=True, exist_ok=True)


def _link_or_copy(src: Path, dst: Path, mode: str) -> str:
    if dst.exists():
        return "exists"

    dst.parent.mkdir(parents=True, exist_ok=True)

    if mode == "copy":
        shutil.copy2(src, dst)
        return "copy"

    if mode == "hardlink":
        try:
            os.link(src, dst)
            return "hardlink"
        except OSError:
            shutil.copy2(src, dst)
            return "copy_fallback"

    raise ValueError(f"Unsupported link mode: {mode}")


def _copy_text_file(src: Path, dst: Path) -> None:
    if src.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def _export_person_frames(
    stage03_root: Path,
    stage04_root: Path,
    stage02_root: Path,
    link_mode: str,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    src_manifest = stage03_root / "person_detector_refinement_pack" / "frames_to_annotate.csv"
    src_boxes = stage03_root / "person_detector_refinement_pack" / "detector_proposal_boxes_for_selected_frames.csv"

    frames = _read_csv(src_manifest)
    boxes = _read_csv(src_boxes)

    out_root = stage04_root / "person_detector_refinement_v1"
    _ensure_dirs(out_root)

    exported_rows = []
    error_rows = []

    for idx, row in frames.reset_index(drop=True).iterrows():
        split = str(row.get("split", "train")).strip() or "train"
        if split not in {"train", "val", "test"}:
            split = "train"

        src_path = Path(str(row.get("absolute_frame_path", "")).strip())
        source_run = _safe_text(row.get("source_run", "run"))
        timestamp = _safe_text(row.get("first_timestamp", "t"))
        bucket = _safe_text(row.get("stage03_bucket", "bucket"), max_len=50)
        ext = src_path.suffix.lower() if src_path.suffix else ".jpg"

        name = f"person_frame_{idx:06d}__{source_run}__t{timestamp}__{bucket}__{_short_hash(str(src_path))}{ext}"
        rel_dst = Path("images") / split / name
        dst_path = out_root / rel_dst

        status = "missing"

        if src_path.exists():
            try:
                status = _link_or_copy(src_path, dst_path, link_mode)
            except Exception as exc:
                status = "error"
                error_rows.append({
                    "source_path": str(src_path),
                    "target_path": str(dst_path),
                    "error": f"{type(exc).__name__}: {exc}",
                })
        else:
            error_rows.append({
                "source_path": str(src_path),
                "target_path": str(dst_path),
                "error": "source_missing",
            })

        item = row.to_dict()
        item["export_image_path"] = str(dst_path)
        item["export_relative_path"] = str(rel_dst)
        item["export_status"] = status
        item["annotation_status"] = "not_annotated"
        item["final_label_status"] = "pending_manual_review"
        item["label_policy"] = "person_trackable_or_fragment_context_or_empty_hard_negative"
        exported_rows.append(item)

    exported_frames = pd.DataFrame(exported_rows)

    path_map = exported_frames.set_index("absolute_frame_path")["export_image_path"].to_dict()
    rel_map = exported_frames.set_index("absolute_frame_path")["export_relative_path"].to_dict()
    split_map = exported_frames.set_index("absolute_frame_path")["split"].to_dict()
    status_map = exported_frames.set_index("absolute_frame_path")["export_status"].to_dict()

    boxes = boxes.copy()
    boxes["export_image_path"] = boxes["absolute_frame_path"].map(path_map).fillna("")
    boxes["export_relative_path"] = boxes["absolute_frame_path"].map(rel_map).fillna("")
    boxes["export_status"] = boxes["absolute_frame_path"].map(status_map).fillna("frame_not_selected")
    boxes["split"] = boxes["absolute_frame_path"].map(split_map).fillna("")
    boxes["proposal_only_not_ground_truth"] = "1"
    boxes["final_annotation_status"] = "pending_manual_review"

    exported_frames.to_csv(
        out_root / "metadata" / "frames_to_annotate_export.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )

    boxes.to_csv(
        out_root / "metadata" / "detector_proposal_boxes_for_selected_frames_export.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )

    pd.DataFrame(error_rows).to_csv(
        out_root / "metadata" / "export_errors.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )

    policy_src = stage02_root / "dataset_specs" / "person_detector_refinement_v1" / "annotation_policy.md"
    _copy_text_file(policy_src, out_root / "annotation_policy.md")

    return exported_frames, boxes, pd.DataFrame(error_rows)


def _export_head_crops(
    stage03_root: Path,
    stage04_root: Path,
    stage02_root: Path,
    link_mode: str,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    src_manifest = stage03_root / "head_detector_v1_pack" / "person_crops_to_annotate.csv"

    crops = _read_csv(src_manifest)

    out_root = stage04_root / "head_detector_v1"
    _ensure_dirs(out_root)

    exported_rows = []
    error_rows = []

    for idx, row in crops.reset_index(drop=True).iterrows():
        split = str(row.get("split", "train")).strip() or "train"
        if split not in {"train", "val", "test"}:
            split = "train"

        src_path = Path(str(row.get("absolute_crop_path", "")).strip())
        source_run = _safe_text(row.get("source_run", "run"))
        global_id = _safe_text(row.get("global_sample_id", f"crop_{idx:06d}"), max_len=90)
        bucket = _safe_text(row.get("stage03_bucket", "bucket"), max_len=50)
        ext = src_path.suffix.lower() if src_path.suffix else ".jpg"

        # Short filename for Windows path length safety.
        bucket_code = {
            "normal_head_visible_candidate": "normal",
            "bottom_entry_head": "bottom",
            "edge_or_partial_head": "edge",
            "no_actionable_head_or_fragment_review": "nohead",
        }.get(bucket, "head")

        name = f"headdet_{idx:06d}__{bucket_code}__{_short_hash(str(src_path))}{ext}"
        rel_dst = Path("images") / split / name
        dst_path = out_root / rel_dst

        status = "missing"

        if src_path.exists():
            try:
                status = _link_or_copy(src_path, dst_path, link_mode)
            except Exception as exc:
                status = "error"
                error_rows.append({
                    "source_path": str(src_path),
                    "target_path": str(dst_path),
                    "error": f"{type(exc).__name__}: {exc}",
                })
        else:
            error_rows.append({
                "source_path": str(src_path),
                "target_path": str(dst_path),
                "error": "source_missing",
            })

        item = row.to_dict()
        item["export_image_path"] = str(dst_path)
        item["export_relative_path"] = str(rel_dst)
        item["export_status"] = status
        item["annotation_status"] = "not_annotated"
        item["head_bbox_status"] = "pending_manual_annotation"
        item["head_label_policy"] = "draw_head_bbox_or_empty_no_actionable_head"
        exported_rows.append(item)

    exported = pd.DataFrame(exported_rows)

    exported.to_csv(
        out_root / "metadata" / "person_crops_to_annotate_export.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )

    pd.DataFrame(error_rows).to_csv(
        out_root / "metadata" / "export_errors.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )

    policy_src = stage02_root / "dataset_specs" / "head_detector_v1" / "annotation_policy.md"
    _copy_text_file(policy_src, out_root / "annotation_policy.md")

    return exported, pd.DataFrame(error_rows)


def _write_readme(stage04_root: Path, link_mode: str) -> None:
    text = f"""# Stage04 annotation exports

Этот этап физически подготовил изображения для разметки.

link_mode={link_mode}

## Person detector refinement

Папка:
person_detector_refinement_v1/images/train|val|test

Размечать нужно full frame.

Файл с заданиями:
person_detector_refinement_v1/metadata/frames_to_annotate_export.csv

Файл с текущими bbox-предложениями detector-а:
person_detector_refinement_v1/metadata/detector_proposal_boxes_for_selected_frames_export.csv

Важно:
proposal boxes — это не ground truth. Их нужно использовать только как подсказку.

## Head detector

Папка:
head_detector_v1/images/train|val|test

Размечать нужно head bbox внутри person crop.

Файл с заданиями:
head_detector_v1/metadata/person_crops_to_annotate_export.csv

Если головы нет или она непригодна — оставить empty label / no_actionable_head.

## Headwear classifier

Пока не экспортируется.
Он будет создан только после появления head bbox и генерации head crops.
"""
    (stage04_root / "README_STAGE04.md").write_text(text, encoding="utf-8")


def _write_summary(
    stage04_root: Path,
    person_frames: pd.DataFrame,
    person_boxes: pd.DataFrame,
    person_errors: pd.DataFrame,
    head_crops: pd.DataFrame,
    head_errors: pd.DataFrame,
) -> None:
    rows = [
        ("person_frames_total", len(person_frames)),
        ("person_frames_train", int((person_frames["split"] == "train").sum())),
        ("person_frames_val", int((person_frames["split"] == "val").sum())),
        ("person_frames_test", int((person_frames["split"] == "test").sum())),
        ("person_frames_export_ok", int(person_frames["export_status"].isin(["hardlink", "copy", "copy_fallback", "exists"]).sum())),
        ("person_frame_export_errors", len(person_errors)),
        ("person_detector_proposal_boxes", len(person_boxes)),
        ("head_crops_total", len(head_crops)),
        ("head_crops_train", int((head_crops["split"] == "train").sum())),
        ("head_crops_val", int((head_crops["split"] == "val").sum())),
        ("head_crops_test", int((head_crops["split"] == "test").sum())),
        ("head_crops_export_ok", int(head_crops["export_status"].isin(["hardlink", "copy", "copy_fallback", "exists"]).sum())),
        ("head_crop_export_errors", len(head_errors)),
    ]

    if "stage03_bucket" in person_frames.columns:
        for bucket, count in person_frames["stage03_bucket"].value_counts().sort_index().items():
            rows.append((f"person_bucket_{bucket}", int(count)))

    if "stage03_bucket" in head_crops.columns:
        for bucket, count in head_crops["stage03_bucket"].value_counts().sort_index().items():
            rows.append((f"head_bucket_{bucket}", int(count)))

    pd.DataFrame(rows, columns=["metric", "value"]).to_csv(
        stage04_root / "stage04_summary.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )


def build(args: argparse.Namespace) -> None:
    stage02_root = Path(args.stage02_root)
    stage03_root = Path(args.stage03_root)
    stage04_root = Path(args.stage04_root)

    stage04_root.mkdir(parents=True, exist_ok=True)

    print("[stage04] exporting person detector refinement pack")
    person_frames, person_boxes, person_errors = _export_person_frames(
        stage03_root=stage03_root,
        stage04_root=stage04_root,
        stage02_root=stage02_root,
        link_mode=args.link_mode,
    )

    print("[stage04] exporting head detector pack")
    head_crops, head_errors = _export_head_crops(
        stage03_root=stage03_root,
        stage04_root=stage04_root,
        stage02_root=stage02_root,
        link_mode=args.link_mode,
    )

    print("[stage04] writing pending headwear classifier placeholder")
    headwear_root = stage04_root / "headwear_policy_classifier_pending"
    headwear_root.mkdir(parents=True, exist_ok=True)

    pending = pd.DataFrame([
        {
            "dataset": "headwear_policy_classifier_v1",
            "status": "pending",
            "reason": "requires annotated head bbox and exported head crops",
            "classes": "allowed_sanitary_headwear,no_headwear,wrong_or_forbidden_headwear,unknown_unusable",
        }
    ])
    pending.to_csv(
        headwear_root / "headwear_classifier_pending_until_head_bbox.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )

    policy_src = stage02_root / "dataset_specs" / "headwear_policy_classifier_v1" / "annotation_policy.md"
    classes_src = stage02_root / "dataset_specs" / "headwear_policy_classifier_v1" / "classes.csv"
    _copy_text_file(policy_src, headwear_root / "annotation_policy.md")
    _copy_text_file(classes_src, headwear_root / "classes.csv")

    print("[stage04] writing summary")
    _write_summary(stage04_root, person_frames, person_boxes, person_errors, head_crops, head_errors)
    _write_readme(stage04_root, args.link_mode)

    print()
    print("DONE")
    print(f"stage04_root={stage04_root}")
    print(f"summary={stage04_root / 'stage04_summary.csv'}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage02-root", required=True)
    parser.add_argument("--stage03-root", required=True)
    parser.add_argument("--stage04-root", required=True)
    parser.add_argument("--link-mode", choices=["hardlink", "copy"], default="hardlink")
    return parser.parse_args()


if __name__ == "__main__":
    build(parse_args())
