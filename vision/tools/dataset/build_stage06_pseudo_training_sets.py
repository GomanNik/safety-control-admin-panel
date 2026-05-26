# ============================================================
# File: vision/tools/dataset/build_stage06_pseudo_training_sets.py
# Purpose:
# - Convert Stage05 auto-verification outputs into pseudo training sets.
# - Build:
#   1) person_proposal_gate_v1 classification dataset
#   2) head_detector_pseudo_v1 YOLO detection dataset
# - Use only high-confidence pseudo labels.
# - Do not use silver/pending samples in the first training cycle.
# ============================================================

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
from pathlib import Path

import cv2
import pandas as pd


PERSON_POSITIVE_CLASS = "person_trackable"
PERSON_NEGATIVE_CLASS = "fragment_or_negative"


def _read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")
    return pd.read_csv(path, sep=";", dtype=str, keep_default_na=False).fillna("")


def _safe_split(value: object) -> str:
    split = str(value).strip().lower()
    if split not in {"train", "val", "test"}:
        return "train"
    return split


def _short_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8", errors="ignore")).hexdigest()[:12]


def _safe_ext(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
        return ext
    return ".jpg"


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


def _to_int(value: object, default: int = 0) -> int:
    try:
        return int(round(float(str(value).replace(",", "."))))
    except Exception:
        return default


def _crop_from_frame(row: pd.Series, dst: Path) -> str:
    frame_path = str(row.get("export_image_path", "")).strip()
    if not frame_path:
        frame_path = str(row.get("absolute_frame_path", "")).strip()

    frame = cv2.imread(frame_path, cv2.IMREAD_COLOR)
    if frame is None:
        return "fallback_crop_frame_missing"

    h, w = frame.shape[:2]

    x1 = max(0, min(w - 1, _to_int(row.get("bbox_x1", 0))))
    y1 = max(0, min(h - 1, _to_int(row.get("bbox_y1", 0))))
    x2 = max(0, min(w, _to_int(row.get("bbox_x2", 0))))
    y2 = max(0, min(h, _to_int(row.get("bbox_y2", 0))))

    if x2 <= x1 or y2 <= y1:
        return "fallback_crop_invalid_bbox"

    crop = frame[y1:y2, x1:x2].copy()
    dst.parent.mkdir(parents=True, exist_ok=True)

    ok = cv2.imwrite(str(dst), crop)
    if not ok:
        return "fallback_crop_write_failed"

    return "fallback_crop_written"


def _prepare_person_dirs(root: Path) -> None:
    for split in ["train", "val", "test"]:
        for cls in [PERSON_POSITIVE_CLASS, PERSON_NEGATIVE_CLASS]:
            (root / split / cls).mkdir(parents=True, exist_ok=True)
    (root / "metadata").mkdir(parents=True, exist_ok=True)


def _prepare_head_dirs(root: Path) -> None:
    for split in ["train", "val", "test"]:
        (root / "images" / split).mkdir(parents=True, exist_ok=True)
        (root / "labels" / split).mkdir(parents=True, exist_ok=True)
    (root / "metadata").mkdir(parents=True, exist_ok=True)


def _export_person_gate_dataset(stage05_root: Path, out_root: Path, link_mode: str) -> pd.DataFrame:
    gold_path = stage05_root / "person_proposal_gate" / "person_gate_gold.csv"
    neg_path = stage05_root / "person_proposal_gate" / "person_gate_fragment_or_negative.csv"

    gold = _read_csv(gold_path)
    neg = _read_csv(neg_path)

    gold["target_class"] = PERSON_POSITIVE_CLASS
    neg["target_class"] = PERSON_NEGATIVE_CLASS

    df = pd.concat([gold, neg], ignore_index=True)
    _prepare_person_dirs(out_root)

    rows = []

    for idx, row in df.reset_index(drop=True).iterrows():
        split = _safe_split(row.get("split", "train"))
        cls = str(row.get("target_class", "")).strip()

        src_text = str(row.get("absolute_crop_path", "")).strip()
        src = Path(src_text)

        ext = _safe_ext(src)
        name = f"gate_{idx:06d}__{cls}__{_short_hash(src_text + str(row.get('global_sample_id', idx)))}{ext}"
        dst = out_root / split / cls / name

        if src.exists():
            try:
                status = _link_or_copy(src, dst, link_mode)
            except Exception as exc:
                status = f"error:{type(exc).__name__}:{exc}"
        else:
            status = _crop_from_frame(row, dst)

        item = row.to_dict()
        item["dataset"] = "person_proposal_gate_v1"
        item["target_class"] = cls
        item["export_split"] = split
        item["export_image_path"] = str(dst)
        item["export_status"] = status
        rows.append(item)

    exported = pd.DataFrame(rows)
    exported.to_csv(out_root / "metadata" / "person_proposal_gate_manifest.csv", sep=";", index=False, encoding="utf-8-sig")

    classes = pd.DataFrame([
        {"class_id": 0, "class_name": PERSON_NEGATIVE_CLASS, "runtime_policy": "block_headwear_analysis"},
        {"class_id": 1, "class_name": PERSON_POSITIVE_CLASS, "runtime_policy": "allow_head_detector"},
    ])
    classes.to_csv(out_root / "metadata" / "classes.csv", sep=";", index=False, encoding="utf-8-sig")

    readme = """# person_proposal_gate_v1

Binary classification dataset.

## Classes

0: fragment_or_negative
- рука
- рукав
- нога
- кусок халата
- плохой фрагмент
- фон / оборудование / мусорный crop

1: person_trackable
- полный человек
- почти полный человек
- человек снизу кадра, если видна голова/плечи/верх корпуса
- человек, пригодный для дальнейшего поиска головы

## Runtime

person_trackable -> run head detector
fragment_or_negative -> block headwear analysis
"""
    (out_root / "README.md").write_text(readme, encoding="utf-8")

    return exported


def _write_yolo_label(label_path: Path, yolo_line: str) -> None:
    label_path.parent.mkdir(parents=True, exist_ok=True)
    label_path.write_text((yolo_line.strip() + "\n") if yolo_line.strip() else "", encoding="utf-8")


def _export_head_detector_dataset(stage05_root: Path, out_root: Path, link_mode: str) -> pd.DataFrame:
    gold_path = stage05_root / "head_pseudo_labels" / "head_pseudo_gold_face_based.csv"
    neg_path = stage05_root / "head_pseudo_labels" / "head_no_actionable_gold.csv"

    gold = _read_csv(gold_path)
    neg = _read_csv(neg_path)

    gold["target_label_type"] = "head_positive"
    neg["target_label_type"] = "empty_no_actionable_head"

    df = pd.concat([gold, neg], ignore_index=True)
    _prepare_head_dirs(out_root)

    rows = []

    for idx, row in df.reset_index(drop=True).iterrows():
        split = _safe_split(row.get("split", "train"))

        src_text = str(row.get("export_image_path", "")).strip()
        if not src_text:
            src_text = str(row.get("absolute_crop_path", "")).strip()

        src = Path(src_text)
        ext = _safe_ext(src)

        label_type = str(row.get("target_label_type", "")).strip()
        name = f"head_{idx:06d}__{label_type}__{_short_hash(src_text + str(row.get('global_sample_id', idx)))}{ext}"

        dst_img = out_root / "images" / split / name
        dst_label = out_root / "labels" / split / (Path(name).stem + ".txt")

        if src.exists():
            try:
                status = _link_or_copy(src, dst_img, link_mode)
            except Exception as exc:
                status = f"error:{type(exc).__name__}:{exc}"
        else:
            status = "source_missing"

        if label_type == "head_positive":
            yolo_line = str(row.get("yolo_head_label", "")).strip()
            if not yolo_line:
                label_status = "missing_positive_label"
            else:
                label_status = "positive_label_written"
            _write_yolo_label(dst_label, yolo_line)
        else:
            label_status = "empty_label_written"
            _write_yolo_label(dst_label, "")

        item = row.to_dict()
        item["dataset"] = "head_detector_pseudo_v1"
        item["target_label_type"] = label_type
        item["export_split"] = split
        item["export_image_path"] = str(dst_img)
        item["export_label_path"] = str(dst_label)
        item["export_status"] = status
        item["label_status"] = label_status
        rows.append(item)

    exported = pd.DataFrame(rows)
    exported.to_csv(out_root / "metadata" / "head_detector_pseudo_manifest.csv", sep=";", index=False, encoding="utf-8-sig")

    data_yaml = f"""path: {str(out_root).replace(chr(92), "/")}
train: images/train
val: images/val
test: images/test

names:
  0: head
"""
    (out_root / "data.yaml").write_text(data_yaml, encoding="utf-8")

    readme = """# head_detector_pseudo_v1

YOLO detection dataset.

## Class

0: head

## Positive labels

Source:
head_pseudo_gold_face_based.csv

These samples contain pseudo head bbox generated from face-based detection.

## Empty labels

Source:
head_no_actionable_gold.csv

These samples contain no actionable head and have empty label files.

## Not used in first cycle

- head_pseudo_silver_geometry.csv
- head_pending.csv
"""
    (out_root / "README.md").write_text(readme, encoding="utf-8")

    return exported


def _write_summary(root: Path, person: pd.DataFrame, head: pd.DataFrame) -> None:
    rows = [
        ("person_gate_total", len(person)),
        ("person_gate_positive", int((person["target_class"] == PERSON_POSITIVE_CLASS).sum())),
        ("person_gate_negative", int((person["target_class"] == PERSON_NEGATIVE_CLASS).sum())),
        ("person_gate_train", int((person["export_split"] == "train").sum())),
        ("person_gate_val", int((person["export_split"] == "val").sum())),
        ("person_gate_test", int((person["export_split"] == "test").sum())),
        ("person_gate_export_problem_rows", int((~person["export_status"].astype(str).isin(["hardlink", "copy", "copy_fallback", "exists", "fallback_crop_written"])).sum())),
        ("head_detector_total", len(head)),
        ("head_detector_positive", int((head["target_label_type"] == "head_positive").sum())),
        ("head_detector_empty", int((head["target_label_type"] == "empty_no_actionable_head").sum())),
        ("head_detector_train", int((head["export_split"] == "train").sum())),
        ("head_detector_val", int((head["export_split"] == "val").sum())),
        ("head_detector_test", int((head["export_split"] == "test").sum())),
        ("head_detector_export_problem_rows", int((~head["export_status"].astype(str).isin(["hardlink", "copy", "copy_fallback", "exists"])).sum())),
        ("head_detector_positive_missing_label_rows", int((head["label_status"] == "missing_positive_label").sum())),
    ]

    pd.DataFrame(rows, columns=["metric", "value"]).to_csv(root / "stage06_summary.csv", sep=";", index=False, encoding="utf-8-sig")


def build(args: argparse.Namespace) -> None:
    stage05_root = Path(args.stage05_root)
    output_root = Path(args.output_root)

    output_root.mkdir(parents=True, exist_ok=True)

    person_root = output_root / "person_proposal_gate_v1"
    head_root = output_root / "head_detector_pseudo_v1"

    print("[stage06] exporting person proposal gate dataset")
    person = _export_person_gate_dataset(stage05_root, person_root, args.link_mode)

    print("[stage06] exporting head detector pseudo dataset")
    head = _export_head_detector_dataset(stage05_root, head_root, args.link_mode)

    print("[stage06] writing summary")
    _write_summary(output_root, person, head)

    print()
    print("DONE")
    print(f"output_root={output_root}")
    print(f"person_dataset={person_root}")
    print(f"head_dataset={head_root}")
    print(f"summary={output_root / 'stage06_summary.csv'}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage05-root", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--link-mode", choices=["hardlink", "copy"], default="hardlink")
    return parser.parse_args()


if __name__ == "__main__":
    build(parse_args())
