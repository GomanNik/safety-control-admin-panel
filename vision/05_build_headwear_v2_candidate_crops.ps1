# ============================================================
# File: 05_build_headwear_v2_candidate_crops.ps1
# Purpose:
# - Build Headwear Detector V2 candidate crops from external YOLO datasets.
# - Use existing datasets/external inside the vision project.
# - Save all experiment outputs to Windows Documents.
# - Do not touch runtime code.
# ============================================================

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
$ProgressPreference = "SilentlyContinue"

# This script is intended to be placed in:
# C:\Users\Goman Nikita\Desktop\safety-control-admin-panel\vision

$VisionRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($VisionRoot)) {
    $VisionRoot = (Get-Location).Path
}

$ExternalRoot = Join-Path $VisionRoot "datasets\external"
$DocumentsRoot = [Environment]::GetFolderPath("MyDocuments")
$ExperimentRoot = Join-Path $DocumentsRoot "safety-control-headwear-detector-v2"
$WorkspaceRoot = Join-Path $ExperimentRoot "dataset_workspace"
$ToolsRoot = Join-Path $WorkspaceRoot "tools"
$OutRoot = Join-Path $WorkspaceRoot "v2_candidate_crops"

if (-not (Test-Path -LiteralPath $ExternalRoot)) {
    throw "External datasets directory not found: $ExternalRoot"
}

New-Item -ItemType Directory -Force -Path $ExperimentRoot | Out-Null
New-Item -ItemType Directory -Force -Path $WorkspaceRoot | Out-Null
New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $OutRoot | Out-Null

$PythonScript = Join-Path $ToolsRoot "build_v2_candidate_crops_from_external_yolo.py"

@'
# ============================================================
# File: build_v2_candidate_crops_from_external_yolo.py
# Purpose:
# - Read external YOLO datasets.
# - Convert old dataset classes to Headwear Detector V2 candidate groups.
# - Save tight bbox crops, context crops, review sheets and CSV manifests.
# ============================================================

from __future__ import annotations

import argparse
import csv
import math
import re
import shutil
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import yaml
from PIL import Image, ImageDraw, ImageFont


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

TARGETS = (
    "head_allowed",
    "head_no_headwear",
    "body_fragment_ignore",
    "unknown_or_review",
)

V2_LABELS = (
    "head_allowed",
    "head_no_headwear",
    "head_forbidden",
    "head_unknown",
    "body_fragment_ignore",
    "drop",
)

EXACT_TARGET_MAP: dict[tuple[str, str], str] = {
    ("employee_safety_food", "hair-net"): "head_allowed",
    ("employee_safety_food", "no-hairnet"): "head_no_headwear",
    ("employee_safety_food", "gloves"): "body_fragment_ignore",
    ("employee_safety_food", "no-gloves"): "body_fragment_ignore",
    ("employee_safety_food", "aporn"): "unknown_or_review",
    ("employee_safety_food", "mask"): "unknown_or_review",
    ("employee_safety_food", "no-apron"): "unknown_or_review",
    ("employee_safety_food", "no-mask"): "unknown_or_review",

    ("food_kitchen_safety", "head_yes_hairnet_no_mask"): "head_allowed",
    ("food_kitchen_safety", "head_yes_hairnet_yes_mask"): "head_allowed",
    ("food_kitchen_safety", "head_no_hairnet_no_mask"): "head_no_headwear",
    ("food_kitchen_safety", "head_yes_mask_no_hairnet"): "head_no_headwear",
    ("food_kitchen_safety", "hand_touch_face_or_hair"): "body_fragment_ignore",

    ("hairnet_agts", "hairnet"): "head_allowed",
    ("hairnet_agts", "no_hairnet"): "head_no_headwear",

    ("hairnet_detection_sabina", "hairnet"): "head_allowed",
    ("hairnet_detection_sabina", "no_hairnet"): "head_no_headwear",

    ("hairnet_gloves", "hairnet"): "head_allowed",
    ("hairnet_gloves", "no_hairnet"): "head_no_headwear",
    ("hairnet_gloves", "gloves"): "body_fragment_ignore",
    ("hairnet_gloves", "no_gloves"): "body_fragment_ignore",
    ("hairnet_gloves", "no_mask"): "unknown_or_review",
    ("hairnet_gloves", "shoes"): "unknown_or_review",
}


@dataclass(slots=True)
class BoxRecord:
    candidate_id: str
    dataset: str
    split: str
    image_path: Path
    label_path: Path
    image_width: int
    image_height: int
    old_class_id: int
    old_class_name: str
    target_hint: str
    x1: int
    y1: int
    x2: int
    y2: int
    tight_crop_path: Path
    context_crop_path: Path


def safe_name(value: str, max_len: int = 90) -> str:
    value = re.sub(r"[^A-Za-z0-9А-Яа-я_.-]+", "_", value)
    value = value.strip("._")
    return value[:max_len] if value else "item"


def load_class_names(data_yaml: Path) -> dict[int, str]:
    data = yaml.safe_load(data_yaml.read_text(encoding="utf-8", errors="ignore")) or {}
    raw = data.get("names", {})

    if isinstance(raw, dict):
        return {int(k): str(v) for k, v in raw.items()}

    if isinstance(raw, list):
        return {i: str(v) for i, v in enumerate(raw)}

    return {}


def resolve_target(dataset: str, old_class_name: str) -> str:
    key = (dataset, old_class_name)
    if key in EXACT_TARGET_MAP:
        return EXACT_TARGET_MAP[key]

    normalized = old_class_name.lower().replace("-", "_").replace(" ", "_")

    if "no_hairnet" in normalized or "nohairnet" in normalized:
        return "head_no_headwear"

    if "hairnet" in normalized or "hair_net" in normalized:
        return "head_allowed"

    if "glove" in normalized or "hand" in normalized:
        return "body_fragment_ignore"

    return "unknown_or_review"


def iter_dataset_dirs(external_root: Path) -> Iterable[Path]:
    for path in sorted(external_root.iterdir()):
        if path.is_dir() and (path / "data.yaml").is_file():
            yield path


def iter_image_paths(dataset_dir: Path) -> Iterable[tuple[str, Path]]:
    for split in ("train", "valid", "val", "test"):
        images_dir = dataset_dir / split / "images"
        if not images_dir.is_dir():
            continue

        for image_path in sorted(images_dir.rglob("*")):
            if image_path.suffix.lower() in IMAGE_EXTS:
                yield split, image_path


def read_yolo_labels(label_path: Path) -> list[tuple[int, float, float, float, float]]:
    if not label_path.is_file():
        return []

    result: list[tuple[int, float, float, float, float]] = []
    for line in label_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.strip().split()
        if len(parts) < 5:
            continue

        try:
            class_id = int(float(parts[0]))
            xc = float(parts[1])
            yc = float(parts[2])
            bw = float(parts[3])
            bh = float(parts[4])
        except ValueError:
            continue

        result.append((class_id, xc, yc, bw, bh))

    return result


def yolo_to_xyxy(
    *,
    xc: float,
    yc: float,
    bw: float,
    bh: float,
    image_width: int,
    image_height: int,
) -> tuple[int, int, int, int]:
    x1 = int(round((xc - bw / 2.0) * image_width))
    y1 = int(round((yc - bh / 2.0) * image_height))
    x2 = int(round((xc + bw / 2.0) * image_width))
    y2 = int(round((yc + bh / 2.0) * image_height))

    x1 = max(0, min(image_width - 1, x1))
    y1 = max(0, min(image_height - 1, y1))
    x2 = max(1, min(image_width, x2))
    y2 = max(1, min(image_height, y2))

    if x2 <= x1:
        x2 = min(image_width, x1 + 1)
    if y2 <= y1:
        y2 = min(image_height, y1 + 1)

    return x1, y1, x2, y2


def expand_box(
    *,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    image_width: int,
    image_height: int,
    pad_ratio: float,
) -> tuple[int, int, int, int]:
    width = max(1, x2 - x1)
    height = max(1, y2 - y1)

    pad_x = int(round(width * pad_ratio))
    pad_y = int(round(height * pad_ratio))

    cx1 = max(0, x1 - pad_x)
    cy1 = max(0, y1 - pad_y)
    cx2 = min(image_width, x2 + pad_x)
    cy2 = min(image_height, y2 + pad_y)

    return cx1, cy1, cx2, cy2


def draw_context_box(
    *,
    crop: Image.Image,
    original_box: tuple[int, int, int, int],
    context_box: tuple[int, int, int, int],
    label: str,
) -> Image.Image:
    result = crop.convert("RGB").copy()
    draw = ImageDraw.Draw(result)

    x1, y1, x2, y2 = original_box
    cx1, cy1, _, _ = context_box

    bx1 = x1 - cx1
    by1 = y1 - cy1
    bx2 = x2 - cx1
    by2 = y2 - cy1

    draw.rectangle((bx1, by1, bx2, by2), outline=(255, 255, 255), width=4)
    draw.rectangle((bx1, by1, bx2, by2), outline=(0, 0, 0), width=2)

    safe_label = label[:42]
    label_w = max(80, 7 * len(safe_label) + 8)
    top = max(0, by1 - 18)
    bottom = min(result.height, top + 18)

    if bottom > top:
        draw.rectangle((bx1, top, min(result.width, bx1 + label_w), bottom), fill=(255, 255, 255))
        draw.text((bx1 + 3, top + 2), safe_label, fill=(0, 0, 0))

    return result


def fit_tile(image: Image.Image, tile_w: int, image_h: int) -> Image.Image:
    image = image.convert("RGB")
    src_w, src_h = image.size
    scale = min(tile_w / max(1, src_w), image_h / max(1, src_h))

    dst_w = max(1, int(round(src_w * scale)))
    dst_h = max(1, int(round(src_h * scale)))

    resized = image.resize((dst_w, dst_h), Image.Resampling.LANCZOS)
    tile = Image.new("RGB", (tile_w, image_h), (238, 238, 238))

    ox = (tile_w - dst_w) // 2
    oy = (image_h - dst_h) // 2
    tile.paste(resized, (ox, oy))

    return tile


def write_csv(path: Path, rows: list[dict[str, str]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


def make_review_sheets(
    *,
    records: list[BoxRecord],
    sheets_root: Path,
    cols: int,
    rows: int,
    tile_w: int,
    tile_h: int,
) -> None:
    if sheets_root.exists():
        shutil.rmtree(sheets_root)

    sheets_root.mkdir(parents=True, exist_ok=True)

    by_target: dict[str, list[BoxRecord]] = defaultdict(list)
    for record in records:
        by_target[record.target_hint].append(record)

    per_sheet = cols * rows
    image_h = tile_h - 46

    for target in TARGETS:
        target_records = by_target.get(target, [])
        if not target_records:
            continue

        target_dir = sheets_root / target
        target_dir.mkdir(parents=True, exist_ok=True)

        for sheet_idx, start in enumerate(range(0, len(target_records), per_sheet), start=1):
            chunk = target_records[start:start + per_sheet]
            sheet = Image.new("RGB", (cols * tile_w, rows * tile_h), (230, 230, 230))
            draw = ImageDraw.Draw(sheet)

            for i, record in enumerate(chunk):
                col = i % cols
                row = i // cols
                x = col * tile_w
                y = row * tile_h

                try:
                    img = Image.open(record.context_crop_path)
                    tile = fit_tile(img, tile_w, image_h)
                    img.close()
                except Exception:
                    tile = Image.new("RGB", (tile_w, image_h), (210, 210, 210))

                sheet.paste(tile, (x, y))
                draw.rectangle((x, y + image_h, x + tile_w, y + tile_h), fill=(255, 255, 255))

                text_1 = record.candidate_id[-18:]
                text_2 = f"{record.dataset} | {record.old_class_name}"[:36]

                draw.text((x + 4, y + image_h + 4), text_1, fill=(0, 0, 0))
                draw.text((x + 4, y + image_h + 23), text_2, fill=(0, 0, 0))

            sheet.save(target_dir / f"{target}_sheet_{sheet_idx:04d}.jpg", quality=92)


def build_candidates(
    *,
    external_root: Path,
    out_root: Path,
    context_pad_ratio: float,
    min_box_size: int,
) -> None:
    if out_root.exists():
        shutil.rmtree(out_root)

    candidates_root = out_root / "candidate_crops"
    tight_root = candidates_root / "tight"
    context_root = candidates_root / "context"
    review_sheets_root = out_root / "review_sheets"

    for target in TARGETS:
        (tight_root / target).mkdir(parents=True, exist_ok=True)
        (context_root / target).mkdir(parents=True, exist_ok=True)

    records: list[BoxRecord] = []
    manifest_rows: list[dict[str, str]] = []
    labeling_rows: list[dict[str, str]] = []
    source_class_counter: Counter[tuple[str, int, str, str]] = Counter()
    image_counter: Counter[str] = Counter()
    skipped_counter: Counter[str] = Counter()

    next_id = 1

    for dataset_dir in iter_dataset_dirs(external_root):
        dataset = dataset_dir.name
        class_names = load_class_names(dataset_dir / "data.yaml")

        for split, image_path in iter_image_paths(dataset_dir):
            labels_dir = dataset_dir / split / "labels"
            label_path = labels_dir / f"{image_path.stem}.txt"

            labels = read_yolo_labels(label_path)
            image_counter[dataset] += 1

            if not labels:
                skipped_counter[f"{dataset}:no_labels"] += 1
                continue

            try:
                image = Image.open(image_path).convert("RGB")
            except Exception:
                skipped_counter[f"{dataset}:bad_image"] += 1
                continue

            image_width, image_height = image.size

            for class_id, xc, yc, bw, bh in labels:
                old_class_name = class_names.get(class_id, f"class_{class_id}")
                target_hint = resolve_target(dataset, old_class_name)

                x1, y1, x2, y2 = yolo_to_xyxy(
                    xc=xc,
                    yc=yc,
                    bw=bw,
                    bh=bh,
                    image_width=image_width,
                    image_height=image_height,
                )

                box_w = x2 - x1
                box_h = y2 - y1

                if box_w < min_box_size or box_h < min_box_size:
                    skipped_counter[f"{dataset}:too_small"] += 1
                    continue

                candidate_id = f"v2_{next_id:08d}"
                next_id += 1

                base_name = (
                    f"{candidate_id}__"
                    f"{safe_name(dataset, 36)}__"
                    f"{safe_name(split, 12)}__"
                    f"c{class_id}_{safe_name(old_class_name, 40)}__"
                    f"{safe_name(image_path.stem, 70)}.jpg"
                )

                cx1, cy1, cx2, cy2 = expand_box(
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    image_width=image_width,
                    image_height=image_height,
                    pad_ratio=context_pad_ratio,
                )

                tight_crop = image.crop((x1, y1, x2, y2))
                context_crop = image.crop((cx1, cy1, cx2, cy2))
                context_crop = draw_context_box(
                    crop=context_crop,
                    original_box=(x1, y1, x2, y2),
                    context_box=(cx1, cy1, cx2, cy2),
                    label=f"{target_hint} | {old_class_name}",
                )

                tight_crop_path = tight_root / target_hint / base_name
                context_crop_path = context_root / target_hint / base_name

                tight_crop.save(tight_crop_path, quality=94)
                context_crop.save(context_crop_path, quality=92)

                record = BoxRecord(
                    candidate_id=candidate_id,
                    dataset=dataset,
                    split=split,
                    image_path=image_path,
                    label_path=label_path,
                    image_width=image_width,
                    image_height=image_height,
                    old_class_id=class_id,
                    old_class_name=old_class_name,
                    target_hint=target_hint,
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    tight_crop_path=tight_crop_path,
                    context_crop_path=context_crop_path,
                )
                records.append(record)

                source_class_counter[(dataset, class_id, old_class_name, target_hint)] += 1

                manifest_rows.append(
                    {
                        "candidate_id": candidate_id,
                        "target_hint": target_hint,
                        "dataset": dataset,
                        "split": split,
                        "old_class_id": str(class_id),
                        "old_class_name": old_class_name,
                        "source_image_path": str(image_path),
                        "source_label_path": str(label_path),
                        "image_width": str(image_width),
                        "image_height": str(image_height),
                        "x1": str(x1),
                        "y1": str(y1),
                        "x2": str(x2),
                        "y2": str(y2),
                        "box_width": str(box_w),
                        "box_height": str(box_h),
                        "tight_crop_path": str(tight_crop_path),
                        "context_crop_path": str(context_crop_path),
                    }
                )

                labeling_rows.append(
                    {
                        "candidate_id": candidate_id,
                        "target_hint": target_hint,
                        "final_v2_label": "",
                        "keep": "",
                        "comment": "",
                        "context_crop_path": str(context_crop_path),
                        "tight_crop_path": str(tight_crop_path),
                        "dataset": dataset,
                        "old_class_name": old_class_name,
                    }
                )

            image.close()

    write_csv(
        out_root / "candidate_manifest.csv",
        manifest_rows,
        [
            "candidate_id",
            "target_hint",
            "dataset",
            "split",
            "old_class_id",
            "old_class_name",
            "source_image_path",
            "source_label_path",
            "image_width",
            "image_height",
            "x1",
            "y1",
            "x2",
            "y2",
            "box_width",
            "box_height",
            "tight_crop_path",
            "context_crop_path",
        ],
    )

    write_csv(
        out_root / "labeling_template.csv",
        labeling_rows,
        [
            "candidate_id",
            "target_hint",
            "final_v2_label",
            "keep",
            "comment",
            "context_crop_path",
            "tight_crop_path",
            "dataset",
            "old_class_name",
        ],
    )

    source_rows: list[dict[str, str]] = []
    for (dataset, class_id, old_class_name, target_hint), count in sorted(source_class_counter.items()):
        source_rows.append(
            {
                "dataset": dataset,
                "old_class_id": str(class_id),
                "old_class_name": old_class_name,
                "target_hint": target_hint,
                "boxes": str(count),
            }
        )

    write_csv(
        out_root / "source_class_mapping.csv",
        source_rows,
        ["dataset", "old_class_id", "old_class_name", "target_hint", "boxes"],
    )

    summary_rows: list[dict[str, str]] = []

    target_counts = Counter(record.target_hint for record in records)
    for target in TARGETS:
        summary_rows.append(
            {
                "section": "target",
                "name": target,
                "count": str(target_counts[target]),
            }
        )

    for dataset, count in sorted(image_counter.items()):
        summary_rows.append(
            {
                "section": "dataset_images_seen",
                "name": dataset,
                "count": str(count),
            }
        )

    for name, count in sorted(skipped_counter.items()):
        summary_rows.append(
            {
                "section": "skipped",
                "name": name,
                "count": str(count),
            }
        )

    write_csv(
        out_root / "summary.csv",
        summary_rows,
        ["section", "name", "count"],
    )

    make_review_sheets(
        records=records,
        sheets_root=review_sheets_root,
        cols=10,
        rows=6,
        tile_w=220,
        tile_h=190,
    )

    print("")
    print("Headwear Detector V2 candidate crops")
    print(f"external_root={external_root}")
    print(f"out_root={out_root}")
    print(f"records_total={len(records)}")
    print("")
    for target in TARGETS:
        print(f"{target}={target_counts[target]}")
    print("")
    print(f"manifest={out_root / 'candidate_manifest.csv'}")
    print(f"labeling_template={out_root / 'labeling_template.csv'}")
    print(f"source_class_mapping={out_root / 'source_class_mapping.csv'}")
    print(f"summary={out_root / 'summary.csv'}")
    print(f"review_sheets={review_sheets_root}")
    print("")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--external-root", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--context-pad-ratio", type=float, default=0.45)
    parser.add_argument("--min-box-size", type=int, default=8)
    args = parser.parse_args()

    build_candidates(
        external_root=Path(args.external_root).resolve(),
        out_root=Path(args.out).resolve(),
        context_pad_ratio=float(args.context_pad_ratio),
        min_box_size=int(args.min_box_size),
    )


if __name__ == "__main__":
    main()
'@ | Set-Content -LiteralPath $PythonScript -Encoding UTF8

Write-Host ""
Write-Host "Headwear Detector V2 candidate builder"
Write-Host "Vision root:    $VisionRoot"
Write-Host "External root:  $ExternalRoot"
Write-Host "Output root:    $OutRoot"
Write-Host "Python script:  $PythonScript"
Write-Host ""

python $PythonScript `
    --external-root $ExternalRoot `
    --out $OutRoot `
    --context-pad-ratio 0.45 `
    --min-box-size 8

Write-Host "Готово."
Write-Host ""
Write-Host "Открываю результат..."
explorer $OutRoot
explorer (Join-Path $OutRoot "review_sheets")
