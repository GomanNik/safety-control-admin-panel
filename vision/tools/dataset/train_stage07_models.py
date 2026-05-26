# ============================================================
# File: vision/tools/dataset/train_stage07_models.py
# Purpose:
# - Train first-cycle pseudo-labeled models:
#   1) person_proposal_gate_v1 classification model
#   2) head_detector_pseudo_v1 YOLO detector
# - Use only Stage06 high-confidence pseudo datasets.
# - Save training runs outside project root.
# ============================================================

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

from ultralytics import YOLO


def _resolve_path(path: str) -> Path:
    return Path(path).expanduser().resolve()


def _require_exists(path: Path, label: str) -> None:
    if not path.exists():
        raise FileNotFoundError(f"{label} does not exist: {path}")


def _count_files(root: Path) -> int:
    if not root.exists():
        return 0
    return sum(1 for p in root.rglob("*") if p.is_file())


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _copy_best_model(run_dir: Path, target_path: Path) -> None:
    candidates = [
        run_dir / "weights" / "best.pt",
        run_dir / "weights" / "last.pt",
    ]

    for candidate in candidates:
        if candidate.exists():
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(candidate, target_path)
            return

    raise FileNotFoundError(f"No trained weights found under: {run_dir}")


def train_person_gate(args: argparse.Namespace) -> Path:
    dataset_root = _resolve_path(args.stage06_root) / "person_proposal_gate_v1"
    model_path = _resolve_path(args.classifier_model)
    output_root = _resolve_path(args.output_root)

    _require_exists(dataset_root, "person gate dataset")
    _require_exists(model_path, "classifier base model")

    train_dir = dataset_root / "train"
    val_dir = dataset_root / "val"
    test_dir = dataset_root / "test"

    _require_exists(train_dir, "person gate train dir")
    _require_exists(val_dir, "person gate val dir")
    _require_exists(test_dir, "person gate test dir")

    model = YOLO(str(model_path))

    run_name = "person_proposal_gate_v1_cls"

    print()
    print("[stage07] training person proposal gate classifier")
    print(f"dataset={dataset_root}")
    print(f"model={model_path}")
    print(f"output={output_root}")

    results = model.train(
        data=str(dataset_root),
        task="classify",
        imgsz=args.classifier_imgsz,
        epochs=args.classifier_epochs,
        batch=args.classifier_batch,
        device=args.device,
        workers=args.workers,
        project=str(output_root),
        name=run_name,
        exist_ok=True,
        patience=args.patience,
        seed=args.seed,
    )

    run_dir = output_root / run_name
    best_target = output_root / "exported_models" / "person_proposal_gate_v1_cls_best.pt"
    _copy_best_model(run_dir, best_target)

    meta = {
        "task": "classification",
        "dataset": str(dataset_root),
        "base_model": str(model_path),
        "run_dir": str(run_dir),
        "exported_best": str(best_target),
        "classes": {
            "0": "fragment_or_negative",
            "1": "person_trackable"
        },
        "train_files": _count_files(train_dir),
        "val_files": _count_files(val_dir),
        "test_files": _count_files(test_dir),
    }
    _write_json(output_root / "exported_models" / "person_proposal_gate_v1_cls_meta.json", meta)

    print(f"[stage07] person gate best={best_target}")
    return best_target


def train_head_detector(args: argparse.Namespace) -> Path:
    dataset_root = _resolve_path(args.stage06_root) / "head_detector_pseudo_v1"
    data_yaml = dataset_root / "data.yaml"
    model_path = _resolve_path(args.detector_model)
    output_root = _resolve_path(args.output_root)

    _require_exists(dataset_root, "head detector dataset")
    _require_exists(data_yaml, "head detector data.yaml")
    _require_exists(model_path, "detector base model")

    model = YOLO(str(model_path))

    run_name = "head_detector_pseudo_v1_det"

    print()
    print("[stage07] training head detector")
    print(f"dataset={dataset_root}")
    print(f"data={data_yaml}")
    print(f"model={model_path}")
    print(f"output={output_root}")

    results = model.train(
        data=str(data_yaml),
        task="detect",
        imgsz=args.detector_imgsz,
        epochs=args.detector_epochs,
        batch=args.detector_batch,
        device=args.device,
        workers=args.workers,
        project=str(output_root),
        name=run_name,
        exist_ok=True,
        patience=args.patience,
        seed=args.seed,
        single_cls=True,
    )

    run_dir = output_root / run_name
    best_target = output_root / "exported_models" / "head_detector_pseudo_v1_best.pt"
    _copy_best_model(run_dir, best_target)

    meta = {
        "task": "detection",
        "dataset": str(dataset_root),
        "data_yaml": str(data_yaml),
        "base_model": str(model_path),
        "run_dir": str(run_dir),
        "exported_best": str(best_target),
        "classes": {
            "0": "head"
        },
        "train_images": _count_files(dataset_root / "images" / "train"),
        "val_images": _count_files(dataset_root / "images" / "val"),
        "test_images": _count_files(dataset_root / "images" / "test"),
        "train_labels": _count_files(dataset_root / "labels" / "train"),
        "val_labels": _count_files(dataset_root / "labels" / "val"),
        "test_labels": _count_files(dataset_root / "labels" / "test"),
    }
    _write_json(output_root / "exported_models" / "head_detector_pseudo_v1_meta.json", meta)

    print(f"[stage07] head detector best={best_target}")
    return best_target


def build(args: argparse.Namespace) -> None:
    output_root = _resolve_path(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    if args.train_person_gate:
        train_person_gate(args)

    if args.train_head_detector:
        train_head_detector(args)

    print()
    print("DONE")
    print(f"output_root={output_root}")
    print(f"exported_models={output_root / 'exported_models'}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()

    parser.add_argument("--stage06-root", required=True)
    parser.add_argument("--output-root", required=True)

    parser.add_argument("--classifier-model", default="./yolo11n-cls.pt")
    parser.add_argument("--detector-model", default="./yolo11n.pt")

    parser.add_argument("--train-person-gate", action="store_true")
    parser.add_argument("--train-head-detector", action="store_true")

    parser.add_argument("--classifier-imgsz", type=int, default=224)
    parser.add_argument("--classifier-epochs", type=int, default=30)
    parser.add_argument("--classifier-batch", type=int, default=64)

    parser.add_argument("--detector-imgsz", type=int, default=416)
    parser.add_argument("--detector-epochs", type=int, default=40)
    parser.add_argument("--detector-batch", type=int, default=16)

    parser.add_argument("--device", default="0")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)

    return parser.parse_args()


if __name__ == "__main__":
    build(parse_args())
