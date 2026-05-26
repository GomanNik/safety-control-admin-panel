# ============================================================
# File: 04_prepare_headwear_v2_dataset_workspace.ps1
# Purpose:
# - Build an isolated Headwear Detector V2 dataset workspace from existing vision/datasets/external.
# - Do not touch runtime code.
# - Do not modify existing external datasets.
# - Create inventory CSV files, review sheets, labeling template and empty YOLOv8 target dataset structure.
# ============================================================

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
$ProgressPreference = "SilentlyContinue"

# ============================================================
# 0. Paths
# ============================================================

$VisionRoot = "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel\vision"

if (-not (Test-Path -LiteralPath $VisionRoot)) {
    throw "Vision root not found: $VisionRoot"
}

cd $VisionRoot

$ExternalRoot = Join-Path $VisionRoot "datasets\external"

if (-not (Test-Path -LiteralPath $ExternalRoot)) {
    throw "External datasets folder not found: $ExternalRoot"
}

$DocumentsRoot = [Environment]::GetFolderPath("MyDocuments")
$ExperimentRoot = Join-Path $DocumentsRoot "safety-control-headwear-detector-v2"
$WorkspaceRoot = Join-Path $ExperimentRoot "dataset_workspace"
$ToolsRoot = Join-Path $ExperimentRoot "tools"

New-Item -ItemType Directory -Force -Path $ExperimentRoot | Out-Null
New-Item -ItemType Directory -Force -Path $WorkspaceRoot | Out-Null
New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null

$PythonScript = Join-Path $ToolsRoot "prepare_headwear_v2_sources.py"

# ============================================================
# 1. Python builder
# ============================================================

@'
# ============================================================
# File: prepare_headwear_v2_sources.py
# Purpose:
# - Scan external YOLOv8 datasets.
# - Build inventory CSV files.
# - Build review sheets without changing source datasets.
# - Create an empty target YOLOv8 dataset structure for Headwear Detector V2.
# ============================================================

from __future__ import annotations

import argparse
import csv
import math
import random
import shutil
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

try:
    import yaml
except ImportError as exc:
    raise RuntimeError("Missing dependency: pyyaml. Install it with: python -m pip install pyyaml") from exc

try:
    from PIL import Image, ImageDraw
except ImportError as exc:
    raise RuntimeError("Missing dependency: Pillow. Install it with: python -m pip install pillow") from exc


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


TARGET_CLASSES = [
    "head_allowed",
    "head_no_headwear",
    "head_forbidden",
    "head_unknown",
    "body_fragment_ignore",
]


@dataclass(slots=True)
class YoloLabel:
    class_id: int
    xc: float
    yc: float
    width: float
    height: float


@dataclass(slots=True)
class Sample:
    dataset_name: str
    split: str
    image_path: Path
    label_path: Path | None
    image_width: int
    image_height: int
    labels: list[YoloLabel]
    old_class_names: list[str]
    suggested_v2_hint: str


def safe_read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def load_class_names(data_yaml: Path) -> dict[int, str]:
    data = yaml.safe_load(safe_read_text(data_yaml)) or {}
    raw = data.get("names", {})

    if isinstance(raw, dict):
        result: dict[int, str] = {}
        for key, value in raw.items():
            try:
                result[int(key)] = str(value)
            except (TypeError, ValueError):
                continue
        return result

    if isinstance(raw, list):
        return {index: str(value) for index, value in enumerate(raw)}

    return {}


def read_labels(label_path: Path | None) -> list[YoloLabel]:
    if label_path is None or not label_path.is_file():
        return []

    result: list[YoloLabel] = []

    for line in safe_read_text(label_path).splitlines():
        parts = line.strip().split()
        if len(parts) < 5:
            continue

        try:
            result.append(
                YoloLabel(
                    class_id=int(float(parts[0])),
                    xc=float(parts[1]),
                    yc=float(parts[2]),
                    width=float(parts[3]),
                    height=float(parts[4]),
                )
            )
        except ValueError:
            continue

    return result


def image_size(path: Path) -> tuple[int, int]:
    try:
        with Image.open(path) as image:
            return image.size
    except Exception:
        return 0, 0


def build_hint(class_names: Iterable[str]) -> str:
    text = " ".join(class_names).lower().replace("-", "_").replace(" ", "_")

    if not text:
        return "no_old_labels"

    allowed_words = [
        "hairnet",
        "hair_net",
        "net",
        "cap",
        "chef_hat",
        "bouffant",
        "head_cover",
        "headwear",
    ]

    no_headwear_words = [
        "no_hairnet",
        "no_headwear",
        "without_hairnet",
        "without_headwear",
        "no_cap",
    ]

    person_words = [
        "person",
        "worker",
        "employee",
        "human",
        "body",
    ]

    glove_words = [
        "glove",
        "gloves",
        "hand",
    ]

    if any(word in text for word in no_headwear_words):
        return "candidate_head_no_headwear"

    if any(word in text for word in allowed_words):
        return "candidate_head_allowed"

    if any(word in text for word in glove_words):
        return "candidate_body_fragment_ignore"

    if any(word in text for word in person_words):
        return "candidate_person_or_body"

    return "unknown_external_class"


def collect_samples(dataset_dir: Path) -> tuple[list[Sample], dict[int, str]]:
    data_yaml = dataset_dir / "data.yaml"
    if not data_yaml.is_file():
        return [], {}

    names = load_class_names(data_yaml)
    samples: list[Sample] = []

    for split in ("train", "valid", "val", "test"):
        images_dir = dataset_dir / split / "images"
        labels_dir = dataset_dir / split / "labels"

        if not images_dir.is_dir():
            continue

        normalized_split = "valid" if split == "val" else split

        for image_path in sorted(images_dir.rglob("*")):
            if image_path.suffix.lower() not in IMAGE_EXTS:
                continue

            label_path = labels_dir / f"{image_path.stem}.txt"
            labels = read_labels(label_path if label_path.is_file() else None)
            class_names = [names.get(label.class_id, f"class_{label.class_id}") for label in labels]
            width, height = image_size(image_path)

            samples.append(
                Sample(
                    dataset_name=dataset_dir.name,
                    split=normalized_split,
                    image_path=image_path,
                    label_path=label_path if label_path.is_file() else None,
                    image_width=width,
                    image_height=height,
                    labels=labels,
                    old_class_names=class_names,
                    suggested_v2_hint=build_hint(class_names),
                )
            )

    return samples, names


def write_csv(path: Path, rows: list[dict[str, str]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


def dataset_summary_rows(samples_by_dataset: dict[str, list[Sample]]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []

    for dataset_name, samples in sorted(samples_by_dataset.items()):
        split_counter = Counter(sample.split for sample in samples)
        label_files = sum(1 for sample in samples if sample.label_path is not None)
        boxes = sum(len(sample.labels) for sample in samples)

        rows.append(
            {
                "dataset": dataset_name,
                "images_total": str(len(samples)),
                "images_train": str(split_counter.get("train", 0)),
                "images_valid": str(split_counter.get("valid", 0)),
                "images_test": str(split_counter.get("test", 0)),
                "images_with_label_file": str(label_files),
                "boxes_total": str(boxes),
            }
        )

    return rows


def class_summary_rows(
    samples_by_dataset: dict[str, list[Sample]],
    names_by_dataset: dict[str, dict[int, str]],
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []

    for dataset_name, samples in sorted(samples_by_dataset.items()):
        counter: Counter[int] = Counter()
        images_with_class: dict[int, set[str]] = defaultdict(set)

        for sample in samples:
            for label in sample.labels:
                counter[label.class_id] += 1
                images_with_class[label.class_id].add(str(sample.image_path))

        if not counter:
            rows.append(
                {
                    "dataset": dataset_name,
                    "class_id": "",
                    "old_class_name": "NO_LABELS",
                    "boxes_total": "0",
                    "images_with_class": "0",
                    "suggested_v2_hint": "no_old_labels",
                }
            )
            continue

        for class_id, count in sorted(counter.items()):
            old_name = names_by_dataset.get(dataset_name, {}).get(class_id, f"class_{class_id}")
            rows.append(
                {
                    "dataset": dataset_name,
                    "class_id": str(class_id),
                    "old_class_name": old_name,
                    "boxes_total": str(count),
                    "images_with_class": str(len(images_with_class[class_id])),
                    "suggested_v2_hint": build_hint([old_name]),
                }
            )

    return rows


def sample_manifest_rows(samples: list[Sample]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []

    for sample in samples:
        old_ids = [str(label.class_id) for label in sample.labels]
        rows.append(
            {
                "dataset": sample.dataset_name,
                "split": sample.split,
                "image_path": str(sample.image_path),
                "label_path": str(sample.label_path or ""),
                "image_width": str(sample.image_width),
                "image_height": str(sample.image_height),
                "old_class_ids": ",".join(old_ids),
                "old_class_names": ",".join(sample.old_class_names),
                "old_boxes_count": str(len(sample.labels)),
                "suggested_v2_hint": sample.suggested_v2_hint,
            }
        )

    return rows


def select_samples_for_review(
    samples_by_dataset: dict[str, list[Sample]],
    max_images_per_dataset: int,
    seed: int,
) -> list[Sample]:
    selected: list[Sample] = []
    rng = random.Random(seed)

    for dataset_name, samples in sorted(samples_by_dataset.items()):
        current = list(samples)

        if max_images_per_dataset > 0 and len(current) > max_images_per_dataset:
            by_hint: dict[str, list[Sample]] = defaultdict(list)
            for sample in current:
                by_hint[sample.suggested_v2_hint].append(sample)

            bucket_names = sorted(by_hint.keys())
            per_bucket = max(1, max_images_per_dataset // max(1, len(bucket_names)))

            picked: list[Sample] = []
            picked_paths: set[str] = set()

            for bucket_name in bucket_names:
                bucket = list(by_hint[bucket_name])
                rng.shuffle(bucket)
                for sample in bucket[:per_bucket]:
                    key = str(sample.image_path)
                    if key not in picked_paths:
                        picked.append(sample)
                        picked_paths.add(key)

            rest = [sample for sample in current if str(sample.image_path) not in picked_paths]
            rng.shuffle(rest)

            for sample in rest:
                if len(picked) >= max_images_per_dataset:
                    break
                picked.append(sample)

            current = picked

        selected.extend(current)

    return sorted(selected, key=lambda item: (item.dataset_name, item.split, str(item.image_path)))


def fit_image(image: Image.Image, width: int, height: int) -> tuple[Image.Image, float, int, int]:
    image = image.convert("RGB")
    src_w, src_h = image.size

    scale = min(width / max(1, src_w), height / max(1, src_h))
    dst_w = max(1, int(round(src_w * scale)))
    dst_h = max(1, int(round(src_h * scale)))

    resized = image.resize((dst_w, dst_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (width, height), (245, 245, 245))

    ox = (width - dst_w) // 2
    oy = (height - dst_h) // 2
    canvas.paste(resized, (ox, oy))

    return canvas, scale, ox, oy


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def draw_labels(
    *,
    tile: Image.Image,
    sample: Sample,
    names: dict[int, str],
    scale: float,
    ox: int,
    oy: int,
) -> None:
    draw = ImageDraw.Draw(tile)
    tile_w, tile_h = tile.size
    src_w = max(1, sample.image_width)
    src_h = max(1, sample.image_height)

    for label in sample.labels:
        x1 = int(round(ox + (label.xc - label.width / 2.0) * src_w * scale))
        y1 = int(round(oy + (label.yc - label.height / 2.0) * src_h * scale))
        x2 = int(round(ox + (label.xc + label.width / 2.0) * src_w * scale))
        y2 = int(round(oy + (label.yc + label.height / 2.0) * src_h * scale))

        x1 = clamp(x1, 0, tile_w - 1)
        x2 = clamp(x2, 0, tile_w - 1)
        y1 = clamp(y1, 0, tile_h - 1)
        y2 = clamp(y2, 0, tile_h - 1)

        if x2 <= x1 or y2 <= y1:
            continue

        draw.rectangle((x1, y1, x2, y2), outline=(0, 0, 0), width=2)

        class_name = names.get(label.class_id, f"class_{label.class_id}")
        text = f"{label.class_id}:{class_name}"[:34]

        text_x1 = x1
        text_y1 = max(0, y1 - 18)
        text_x2 = min(tile_w - 1, text_x1 + 7 * len(text) + 8)
        text_y2 = max(text_y1 + 1, y1)

        draw.rectangle((text_x1, text_y1, text_x2, text_y2), fill=(255, 255, 255))
        draw.text((text_x1 + 3, text_y1 + 2), text, fill=(0, 0, 0))


def make_review_sheets(
    *,
    selected: list[Sample],
    names_by_dataset: dict[str, dict[int, str]],
    sheets_dir: Path,
    batches_dir: Path,
    cols: int,
    rows: int,
    tile_w: int,
    tile_h: int,
    sheets_per_batch: int,
) -> list[dict[str, str]]:
    sheets_dir.mkdir(parents=True, exist_ok=True)
    batches_dir.mkdir(parents=True, exist_ok=True)

    per_sheet = cols * rows
    image_h = tile_h - 58
    manifest_rows: list[dict[str, str]] = []

    for sheet_index, start in enumerate(range(0, len(selected), per_sheet), start=1):
        chunk = selected[start:start + per_sheet]
        sheet_path = sheets_dir / f"sheet_{sheet_index:04d}.jpg"
        sheet = Image.new("RGB", (cols * tile_w, rows * tile_h), (230, 230, 230))
        sheet_draw = ImageDraw.Draw(sheet)

        for cell_index, sample in enumerate(chunk, start=1):
            col = (cell_index - 1) % cols
            row = (cell_index - 1) // cols
            x = col * tile_w
            y = row * tile_h
            review_id = f"sheet_{sheet_index:04d}_{cell_index:02d}"

            try:
                with Image.open(sample.image_path) as img:
                    tile, scale, ox, oy = fit_image(img, tile_w, image_h)
            except Exception:
                tile = Image.new("RGB", (tile_w, image_h), (210, 210, 210))
                scale, ox, oy = 1.0, 0, 0

            draw_labels(
                tile=tile,
                sample=sample,
                names=names_by_dataset.get(sample.dataset_name, {}),
                scale=scale,
                ox=ox,
                oy=oy,
            )

            sheet.paste(tile, (x, y))

            old_text = ",".join(sorted(set(sample.old_class_names))) if sample.old_class_names else "NO_OLD_LABELS"
            old_text = old_text[:46]
            meta_text = f"{sample.dataset_name}/{sample.split}"[:46]
            hint_text = sample.suggested_v2_hint[:46]

            sheet_draw.rectangle((x, y + image_h, x + tile_w, y + tile_h), fill=(255, 255, 255))
            sheet_draw.text((x + 4, y + image_h + 3), review_id, fill=(0, 0, 0))
            sheet_draw.text((x + 4, y + image_h + 20), meta_text, fill=(0, 0, 0))
            sheet_draw.text((x + 4, y + image_h + 36), f"{old_text} | {hint_text}"[:64], fill=(0, 0, 0))

            manifest_rows.append(
                {
                    "review_id": review_id,
                    "sheet": sheet_path.name,
                    "sheet_index": str(sheet_index),
                    "cell_index": str(cell_index),
                    "dataset": sample.dataset_name,
                    "split": sample.split,
                    "image_path": str(sample.image_path),
                    "label_path": str(sample.label_path or ""),
                    "image_width": str(sample.image_width),
                    "image_height": str(sample.image_height),
                    "old_class_names": ",".join(sample.old_class_names),
                    "old_boxes_count": str(len(sample.labels)),
                    "suggested_v2_hint": sample.suggested_v2_hint,
                }
            )

        sheet.save(sheet_path, quality=92)

    sheet_paths = sorted(sheets_dir.glob("sheet_*.jpg"))
    for index, sheet_path in enumerate(sheet_paths):
        batch_index = index // max(1, sheets_per_batch) + 1
        batch_dir = batches_dir / f"batch_{batch_index:03d}"
        batch_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(sheet_path, batch_dir / sheet_path.name)

    return manifest_rows


def write_labeling_template(path: Path, review_manifest_rows: list[dict[str, str]]) -> None:
    rows: list[dict[str, str]] = []

    for row in review_manifest_rows:
        rows.append(
            {
                "review_id": row["review_id"],
                "sheet": row["sheet"],
                "cell_index": row["cell_index"],
                "dataset": row["dataset"],
                "split": row["split"],
                "image_path": row["image_path"],
                "old_class_names": row["old_class_names"],
                "suggested_v2_hint": row["suggested_v2_hint"],
                "target_class": "",
                "use_for_v2": "",
                "comment": "",
            }
        )

    write_csv(
        path,
        rows,
        [
            "review_id",
            "sheet",
            "cell_index",
            "dataset",
            "split",
            "image_path",
            "old_class_names",
            "suggested_v2_hint",
            "target_class",
            "use_for_v2",
            "comment",
        ],
    )


def create_empty_yolo_dataset(target_dir: Path) -> None:
    for split in ("train", "valid", "test"):
        (target_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (target_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    data = {
        "path": str(target_dir.resolve()).replace("\\", "/"),
        "train": "images/train",
        "val": "images/valid",
        "test": "images/test",
        "names": {index: name for index, name in enumerate(TARGET_CLASSES)},
    }

    (target_dir / "data.yaml").write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )


def write_next_action(path: Path) -> None:
    path.write_text(
        """# Следующее действие

Этот workspace создан только для подготовки Headwear Detector V2.

## Что уже готово

- `inventory/external_dataset_summary.csv` — сводка по внешним датасетам.
- `inventory/external_class_summary.csv` — старые классы внешних датасетов.
- `inventory/external_samples_manifest.csv` — полный список найденных изображений.
- `review_pack/sheets` — листы для просмотра.
- `review_pack/batches` — те же листы, разбитые по батчам.
- `review_pack/headwear_v2_labeling_template.csv` — шаблон отбора кадров.
- `headwear_detector_v2_yolo` — пустая структура будущего YOLO-датасета под новые классы.

## Важно

Внешние датасеты нельзя напрямую считать правильной разметкой под новую задачу.

Они используются как сырье и как источник похожих кадров.

Новая целевая разметка:

```text
0 head_allowed
1 head_no_headwear
2 head_forbidden
3 head_unknown
4 body_fragment_ignore
```

## Следующий шаг

Открыть `review_pack/batches`, пройти листы и заполнить:

```text
review_pack/headwear_v2_labeling_template.csv
```

Главная цель первого отбора — найти кадры для классов:

```text
head_allowed
head_no_headwear
head_unknown
body_fragment_ignore
```

Особенно важны отрицательные случаи:

```text
рука
халат без головы
фрагмент тела
голова перекрыта
человек снизу кадра
```
""",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--external-root", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--max-images-per-dataset", type=int, default=0)
    parser.add_argument("--cols", type=int, default=10)
    parser.add_argument("--rows", type=int, default=6)
    parser.add_argument("--tile-w", type=int, default=260)
    parser.add_argument("--tile-h", type=int, default=220)
    parser.add_argument("--sheets-per-batch", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    external_root = Path(args.external_root).resolve()
    out_dir = Path(args.out).resolve()

    inventory_dir = out_dir / "inventory"
    review_dir = out_dir / "review_pack"
    sheets_dir = review_dir / "sheets"
    batches_dir = review_dir / "batches"
    target_yolo_dir = out_dir / "headwear_detector_v2_yolo"

    if not external_root.is_dir():
        raise RuntimeError(f"External root not found: {external_root}")

    dataset_dirs = [
        path for path in sorted(external_root.iterdir())
        if path.is_dir() and (path / "data.yaml").is_file()
    ]

    if not dataset_dirs:
        raise RuntimeError(f"No valid YOLOv8 datasets with data.yaml found in: {external_root}")

    if out_dir.exists():
        shutil.rmtree(out_dir)

    inventory_dir.mkdir(parents=True, exist_ok=True)
    review_dir.mkdir(parents=True, exist_ok=True)

    names_by_dataset: dict[str, dict[int, str]] = {}
    samples_by_dataset: dict[str, list[Sample]] = {}

    for dataset_dir in dataset_dirs:
        samples, names = collect_samples(dataset_dir)
        names_by_dataset[dataset_dir.name] = names
        samples_by_dataset[dataset_dir.name] = samples
        print(f"[dataset] {dataset_dir.name}: images={len(samples)}")

    all_samples = [
        sample
        for dataset_samples in samples_by_dataset.values()
        for sample in dataset_samples
    ]

    selected = select_samples_for_review(
        samples_by_dataset=samples_by_dataset,
        max_images_per_dataset=int(args.max_images_per_dataset),
        seed=int(args.seed),
    )

    write_csv(
        inventory_dir / "external_dataset_summary.csv",
        dataset_summary_rows(samples_by_dataset),
        [
            "dataset",
            "images_total",
            "images_train",
            "images_valid",
            "images_test",
            "images_with_label_file",
            "boxes_total",
        ],
    )

    write_csv(
        inventory_dir / "external_class_summary.csv",
        class_summary_rows(samples_by_dataset, names_by_dataset),
        [
            "dataset",
            "class_id",
            "old_class_name",
            "boxes_total",
            "images_with_class",
            "suggested_v2_hint",
        ],
    )

    write_csv(
        inventory_dir / "external_samples_manifest.csv",
        sample_manifest_rows(all_samples),
        [
            "dataset",
            "split",
            "image_path",
            "label_path",
            "image_width",
            "image_height",
            "old_class_ids",
            "old_class_names",
            "old_boxes_count",
            "suggested_v2_hint",
        ],
    )

    review_manifest_rows = make_review_sheets(
        selected=selected,
        names_by_dataset=names_by_dataset,
        sheets_dir=sheets_dir,
        batches_dir=batches_dir,
        cols=max(1, int(args.cols)),
        rows=max(1, int(args.rows)),
        tile_w=max(120, int(args.tile_w)),
        tile_h=max(120, int(args.tile_h)),
        sheets_per_batch=max(1, int(args.sheets_per_batch)),
    )

    write_csv(
        review_dir / "review_manifest.csv",
        review_manifest_rows,
        [
            "review_id",
            "sheet",
            "sheet_index",
            "cell_index",
            "dataset",
            "split",
            "image_path",
            "label_path",
            "image_width",
            "image_height",
            "old_class_names",
            "old_boxes_count",
            "suggested_v2_hint",
        ],
    )

    write_labeling_template(
        review_dir / "headwear_v2_labeling_template.csv",
        review_manifest_rows,
    )

    create_empty_yolo_dataset(target_yolo_dir)
    write_next_action(out_dir / "NEXT_ACTION.md")

    print("")
    print(f"out_dir={out_dir}")
    print(f"inventory={inventory_dir}")
    print(f"review_pack={review_dir}")
    print(f"target_yolo={target_yolo_dir}")
    print(f"datasets={len(dataset_dirs)}")
    print(f"images_total={len(all_samples)}")
    print(f"images_in_review={len(selected)}")
    print(f"sheets={len(list(sheets_dir.glob('sheet_*.jpg')))}")
    print(f"batches={len(list(batches_dir.glob('batch_*')))}")

    expected_sheets = math.ceil(len(selected) / max(1, int(args.cols) * int(args.rows)))
    if expected_sheets != len(list(sheets_dir.glob("sheet_*.jpg"))):
        raise RuntimeError("Review sheet count mismatch.")


if __name__ == "__main__":
    main()
'@ | Set-Content -LiteralPath $PythonScript -Encoding UTF8

# ============================================================
# 2. Run builder
# ============================================================

Write-Host ""
Write-Host "Headwear Detector V2 dataset workspace"
Write-Host "Vision root:    $VisionRoot"
Write-Host "External root:  $ExternalRoot"
Write-Host "Workspace root: $WorkspaceRoot"
Write-Host ""

python $PythonScript `
    --external-root $ExternalRoot `
    --out $WorkspaceRoot `
    --max-images-per-dataset 0 `
    --cols 10 `
    --rows 6 `
    --tile-w 260 `
    --tile-h 220 `
    --sheets-per-batch 10

# ============================================================
# 3. Final output
# ============================================================

Write-Host ""
Write-Host "Готово. Рабочая папка:"
Write-Host (Resolve-Path $WorkspaceRoot).Path
Write-Host ""
Write-Host "Открываю review-pack и inventory..."
explorer (Resolve-Path (Join-Path $WorkspaceRoot "review_pack\batches")).Path
explorer (Resolve-Path (Join-Path $WorkspaceRoot "inventory")).Path
