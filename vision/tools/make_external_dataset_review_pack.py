# ============================================================
# File: tools/make_external_dataset_review_pack.py
# Purpose:
# - Builds review sheets for multiple YOLOv8 datasets.
# - Draws existing YOLO boxes and class names.
# - Creates 10x6 sheets, manifest and batch folders.
# ============================================================

from __future__ import annotations

import argparse
import csv
import random
import shutil
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import yaml
from PIL import Image, ImageDraw

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@dataclass(slots=True)
class Sample:
    dataset_name: str
    split: str
    image_path: Path
    label_path: Path | None
    class_ids: list[int]
    class_names: list[str]


def load_class_names(data_yaml: Path) -> dict[int, str]:
    data = yaml.safe_load(data_yaml.read_text(encoding="utf-8", errors="ignore"))
    raw = data.get("names", {})

    if isinstance(raw, dict):
        return {int(k): str(v) for k, v in raw.items()}

    if isinstance(raw, list):
        return {i: str(v) for i, v in enumerate(raw)}

    return {}


def read_labels(label_path: Path | None) -> list[tuple[int, float, float, float, float]]:
    if label_path is None or not label_path.is_file():
        return []

    result: list[tuple[int, float, float, float, float]] = []

    for line in label_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.strip().split()
        if len(parts) < 5:
            continue

        try:
            result.append(
                (
                    int(float(parts[0])),
                    float(parts[1]),
                    float(parts[2]),
                    float(parts[3]),
                    float(parts[4]),
                )
            )
        except ValueError:
            continue

    return result


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

        for image_path in sorted(images_dir.rglob("*")):
            if image_path.suffix.lower() not in IMAGE_EXTS:
                continue

            label_path = labels_dir / f"{image_path.stem}.txt"
            labels = read_labels(label_path if label_path.is_file() else None)
            class_ids = [item[0] for item in labels]
            class_names = [names.get(class_id, f"class_{class_id}") for class_id in class_ids]

            samples.append(
                Sample(
                    dataset_name=dataset_dir.name,
                    split=split,
                    image_path=image_path,
                    label_path=label_path if label_path.is_file() else None,
                    class_ids=class_ids,
                    class_names=class_names,
                )
            )

    return samples, names


def balanced_select(samples: list[Sample], max_images: int, seed: int) -> list[Sample]:
    rng = random.Random(seed)

    labeled = [sample for sample in samples if sample.class_ids]
    unlabeled = [sample for sample in samples if not sample.class_ids]

    by_class: dict[int, list[Sample]] = defaultdict(list)
    for sample in labeled:
        for class_id in sorted(set(sample.class_ids)):
            by_class[class_id].append(sample)

    selected: list[Sample] = []
    selected_paths: set[str] = set()

    class_ids = sorted(by_class.keys())
    per_class = max(1, max_images // max(1, len(class_ids)))

    for class_id in class_ids:
        bucket = list(by_class[class_id])
        rng.shuffle(bucket)

        taken = 0
        for sample in bucket:
            key = str(sample.image_path)
            if key in selected_paths:
                continue

            selected.append(sample)
            selected_paths.add(key)
            taken += 1

            if taken >= per_class:
                break

    rest = [sample for sample in labeled + unlabeled if str(sample.image_path) not in selected_paths]
    rng.shuffle(rest)

    for sample in rest:
        if len(selected) >= max_images:
            break
        selected.append(sample)
        selected_paths.add(str(sample.image_path))

    return selected[:max_images]


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


def draw_boxes(
    *,
    tile: Image.Image,
    sample: Sample,
    scale: float,
    ox: int,
    oy: int,
    names: dict[int, str],
) -> None:
    draw = ImageDraw.Draw(tile)
    tile_w, tile_h = tile.size

    try:
        img = Image.open(sample.image_path)
        src_w, src_h = img.size
        img.close()
    except Exception:
        return

    for cls, xc, yc, bw, bh in read_labels(sample.label_path):
        raw_x1 = int(round(ox + (xc - bw / 2.0) * src_w * scale))
        raw_y1 = int(round(oy + (yc - bh / 2.0) * src_h * scale))
        raw_x2 = int(round(ox + (xc + bw / 2.0) * src_w * scale))
        raw_y2 = int(round(oy + (yc + bh / 2.0) * src_h * scale))

        left = max(0, min(tile_w - 1, min(raw_x1, raw_x2)))
        top = max(0, min(tile_h - 1, min(raw_y1, raw_y2)))
        right = max(0, min(tile_w - 1, max(raw_x1, raw_x2)))
        bottom = max(0, min(tile_h - 1, max(raw_y1, raw_y2)))

        if right <= left or bottom <= top:
            continue

        draw.rectangle((left, top, right, bottom), outline=(0, 0, 0), width=2)

        label = f"{cls}:{names.get(cls, f'class_{cls}')}"
        label = label[:34]

        label_x0 = left
        label_x1 = max(label_x0 + 1, min(tile_w - 1, label_x0 + 7 * len(label) + 6))

        if top >= 18:
            label_y0 = top - 17
            label_y1 = top
        else:
            label_y0 = top
            label_y1 = min(tile_h - 1, top + 17)

        if label_y1 <= label_y0:
            label_y1 = min(tile_h - 1, label_y0 + 1)

        draw.rectangle((label_x0, label_y0, label_x1, label_y1), fill=(255, 255, 255))

        text_y = max(0, min(tile_h - 1, label_y0 + 1))
        draw.text((label_x0 + 3, text_y), label, fill=(0, 0, 0))


def make_sheet(
    *,
    samples: list[Sample],
    sheet_path: Path,
    manifest_rows: list[dict[str, str]],
    sheet_index: int,
    names_by_dataset: dict[str, dict[int, str]],
    cols: int,
    rows: int,
    tile_w: int,
    tile_h: int,
) -> None:
    image_h = tile_h - 44
    sheet = Image.new("RGB", (cols * tile_w, rows * tile_h), (230, 230, 230))
    draw = ImageDraw.Draw(sheet)

    for i, sample in enumerate(samples):
        col = i % cols
        row = i // cols

        x = col * tile_w
        y = row * tile_h
        review_id = f"{sheet_path.stem}_{i + 1:02d}"

        try:
            img = Image.open(sample.image_path)
            fitted, scale, ox, oy = fit_image(img, tile_w, image_h)
            img.close()
        except Exception:
            fitted = Image.new("RGB", (tile_w, image_h), (210, 210, 210))
            scale, ox, oy = 1.0, 0, 0

        tile = fitted.copy()
        draw_boxes(
            tile=tile,
            sample=sample,
            scale=scale,
            ox=ox,
            oy=oy,
            names=names_by_dataset.get(sample.dataset_name, {}),
        )

        sheet.paste(tile, (x, y))

        class_text = ",".join(sorted(set(sample.class_names))) if sample.class_names else "NO_LABEL"
        class_text = class_text[:42]

        draw.rectangle((x, y + image_h, x + tile_w, y + tile_h), fill=(255, 255, 255))
        draw.text((x + 4, y + image_h + 3), review_id, fill=(0, 0, 0))
        draw.text((x + 4, y + image_h + 21), class_text, fill=(0, 0, 0))

        manifest_rows.append(
            {
                "review_id": review_id,
                "sheet": sheet_path.name,
                "sheet_index": str(sheet_index),
                "cell_index": str(i + 1),
                "dataset": sample.dataset_name,
                "split": sample.split,
                "image_path": str(sample.image_path),
                "label_path": str(sample.label_path or ""),
                "class_ids": ",".join(str(v) for v in sample.class_ids),
                "class_names": ",".join(sample.class_names),
            }
        )

    sheet.save(sheet_path, quality=92)


def write_csv(path: Path, rows: list[dict[str, str]], fields: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


def write_summary(
    *,
    out_dir: Path,
    all_samples: list[Sample],
    selected_samples: list[Sample],
    names_by_dataset: dict[str, dict[int, str]],
) -> None:
    rows: list[dict[str, str]] = []
    by_dataset: dict[str, list[Sample]] = defaultdict(list)

    for sample in all_samples:
        by_dataset[sample.dataset_name].append(sample)

    for dataset, samples in sorted(by_dataset.items()):
        labels_counter = Counter()
        images_with_labels = 0

        for sample in samples:
            if sample.class_ids:
                images_with_labels += 1
            for class_id in sample.class_ids:
                labels_counter[class_id] += 1

        if not labels_counter:
            rows.append(
                {
                    "dataset": dataset,
                    "class_id": "",
                    "class_name": "NO_LABELS",
                    "labels_count": "0",
                    "images_total": str(len(samples)),
                    "images_with_labels": str(images_with_labels),
                    "selected_for_review": str(sum(1 for s in selected_samples if s.dataset_name == dataset)),
                }
            )
            continue

        for class_id, count in sorted(labels_counter.items()):
            rows.append(
                {
                    "dataset": dataset,
                    "class_id": str(class_id),
                    "class_name": names_by_dataset.get(dataset, {}).get(class_id, f"class_{class_id}"),
                    "labels_count": str(count),
                    "images_total": str(len(samples)),
                    "images_with_labels": str(images_with_labels),
                    "selected_for_review": str(sum(1 for s in selected_samples if s.dataset_name == dataset)),
                }
            )

    write_csv(
        out_dir / "dataset_summary.csv",
        rows,
        [
            "dataset",
            "class_id",
            "class_name",
            "labels_count",
            "images_total",
            "images_with_labels",
            "selected_for_review",
        ],
    )


def copy_batches(sheets_dir: Path, batches_dir: Path, sheets_per_batch: int) -> None:
    sheets = sorted(sheets_dir.glob("sheet_*.jpg"))

    for index, sheet_path in enumerate(sheets):
        batch_index = index // sheets_per_batch + 1
        batch_dir = batches_dir / f"batch_{batch_index:03d}"
        batch_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(sheet_path, batch_dir / sheet_path.name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--external-root", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--max-images-per-dataset", type=int, default=600)
    parser.add_argument("--cols", type=int, default=10)
    parser.add_argument("--rows", type=int, default=6)
    parser.add_argument("--tile-w", type=int, default=220)
    parser.add_argument("--tile-h", type=int, default=190)
    parser.add_argument("--sheets-per-batch", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    external_root = Path(args.external_root).resolve()
    out_dir = Path(args.out).resolve()

    if out_dir.exists():
        shutil.rmtree(out_dir)

    sheets_dir = out_dir / "sheets"
    batches_dir = out_dir / "batches"
    sheets_dir.mkdir(parents=True, exist_ok=True)
    batches_dir.mkdir(parents=True, exist_ok=True)

    dataset_dirs = [
        path for path in sorted(external_root.iterdir())
        if path.is_dir() and (path / "data.yaml").is_file()
    ]

    if not dataset_dirs:
        raise RuntimeError(f"No valid YOLO datasets found in: {external_root}")

    all_samples: list[Sample] = []
    selected_samples: list[Sample] = []
    names_by_dataset: dict[str, dict[int, str]] = {}

    for dataset_dir in dataset_dirs:
        samples, names = collect_samples(dataset_dir)
        names_by_dataset[dataset_dir.name] = names
        all_samples.extend(samples)

        selected = balanced_select(
            samples=samples,
            max_images=max(1, int(args.max_images_per_dataset)),
            seed=int(args.seed),
        )
        selected_samples.extend(selected)

        print(f"[dataset] {dataset_dir.name}: images={len(samples)}, selected={len(selected)}")

    selected_samples = sorted(selected_samples, key=lambda s: (s.dataset_name, s.split, str(s.image_path)))

    manifest_rows: list[dict[str, str]] = []
    per_sheet = args.cols * args.rows

    for sheet_index, start in enumerate(range(0, len(selected_samples), per_sheet), start=1):
        chunk = selected_samples[start:start + per_sheet]
        make_sheet(
            samples=chunk,
            sheet_path=sheets_dir / f"sheet_{sheet_index:04d}.jpg",
            manifest_rows=manifest_rows,
            sheet_index=sheet_index,
            names_by_dataset=names_by_dataset,
            cols=args.cols,
            rows=args.rows,
            tile_w=args.tile_w,
            tile_h=args.tile_h,
        )

    write_csv(
        out_dir / "review_manifest.csv",
        manifest_rows,
        [
            "review_id",
            "sheet",
            "sheet_index",
            "cell_index",
            "dataset",
            "split",
            "image_path",
            "label_path",
            "class_ids",
            "class_names",
        ],
    )

    write_summary(
        out_dir=out_dir,
        all_samples=all_samples,
        selected_samples=selected_samples,
        names_by_dataset=names_by_dataset,
    )

    copy_batches(
        sheets_dir=sheets_dir,
        batches_dir=batches_dir,
        sheets_per_batch=max(1, int(args.sheets_per_batch)),
    )

    print("")
    print(f"out_dir={out_dir}")
    print(f"sheets_dir={sheets_dir}")
    print(f"batches_dir={batches_dir}")
    print(f"datasets={len(dataset_dirs)}")
    print(f"selected_images={len(selected_samples)}")
    print(f"sheets={len(list(sheets_dir.glob('sheet_*.jpg')))}")
    print(f"batches={len(list(batches_dir.glob('batch_*')))}")


if __name__ == "__main__":
    main()
