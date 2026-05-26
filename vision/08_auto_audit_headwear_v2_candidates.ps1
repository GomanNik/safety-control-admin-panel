# ============================================================
# File: 08_auto_audit_headwear_v2_candidates.ps1
# Purpose:
# - Run automatic candidate audit with better open-vocabulary models.
# - Use isolated semantic virtual environment.
# - Do not use the old helmet classifier.
# - Do not activate the runtime .venv.
# - Split candidate crops into trusted_auto / review_required / rejected.
# ============================================================

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
$ProgressPreference = "SilentlyContinue"

$VisionRoot = "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel\vision"
$DocumentsRoot = [Environment]::GetFolderPath("MyDocuments")
$ExperimentRoot = Join-Path $DocumentsRoot "safety-control-headwear-detector-v2"
$WorkspaceRoot = Join-Path $ExperimentRoot "dataset_workspace"
$ToolsRoot = Join-Path $WorkspaceRoot "tools"
$ModelRoot = Join-Path $WorkspaceRoot "model_cache"
$HuggingFaceCache = Join-Path $ModelRoot "huggingface"

$CandidateRoot = Join-Path $WorkspaceRoot "v2_candidate_crops"
$Manifest = Join-Path $CandidateRoot "candidate_manifest.csv"
$OutRoot = Join-Path $WorkspaceRoot "v2_auto_audit_open_models"

$SemanticPython = Join-Path $VisionRoot ".venv_semantic\Scripts\python.exe"

$UseOwlV2 = $true
$UseDinoDuplicates = $true
$BatchSize = 16
$MaxImages = 0

cd $VisionRoot

if (-not (Test-Path -LiteralPath $SemanticPython)) {
    throw "Semantic Python not found: $SemanticPython"
}

if (-not (Test-Path -LiteralPath $Manifest)) {
    throw "Candidate manifest not found: $Manifest"
}

New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $OutRoot | Out-Null
New-Item -ItemType Directory -Force -Path $HuggingFaceCache | Out-Null

$env:HF_HOME = $HuggingFaceCache
$env:HUGGINGFACE_HUB_CACHE = Join-Path $HuggingFaceCache "hub"
$env:TRANSFORMERS_CACHE = Join-Path $HuggingFaceCache "transformers"
$env:HEADWEAR_V2_MODEL_ROOT = $ModelRoot

$Py = Join-Path $ToolsRoot "auto_audit_headwear_v2_candidates.py"

@'
from __future__ import annotations

import argparse
import csv
import shutil
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image, ImageDraw, ImageStat
from sklearn.neighbors import NearestNeighbors
from tqdm import tqdm
from transformers import AutoImageProcessor, AutoModel, AutoProcessor


PROMPTS: list[tuple[str, str]] = [
    ("head_allowed", "a visible human head wearing a white disposable sanitary hairnet"),
    ("head_allowed", "a visible human head wearing a bouffant cap"),
    ("head_allowed", "a visible human head wearing a sanitary hair cap"),
    ("head_allowed", "a food worker wearing a hairnet"),
    ("head_allowed", "a chef wearing a white sanitary cap"),

    ("head_no_headwear", "a visible human head with bare hair and no hat"),
    ("head_no_headwear", "a visible human head without a hairnet"),
    ("head_no_headwear", "a worker with uncovered hair"),
    ("head_no_headwear", "a person with no head covering"),

    ("head_forbidden", "a visible human head wearing a baseball cap"),
    ("head_forbidden", "a visible human head wearing a hoodie"),
    ("head_forbidden", "a visible human head wearing a winter hat"),
    ("head_forbidden", "a person wearing a non sanitary hat"),

    ("head_unknown", "a blurred human head with unclear headwear"),
    ("head_unknown", "an occluded human head with unclear head covering"),
    ("head_unknown", "a partially visible unclear head"),
    ("head_unknown", "an unclear headwear crop"),

    ("body_fragment_ignore", "a hand only"),
    ("body_fragment_ignore", "a gloved hand only"),
    ("body_fragment_ignore", "a torso without a visible head"),
    ("body_fragment_ignore", "a body fragment without a visible head"),
    ("body_fragment_ignore", "an arm or sleeve without a visible head"),
    ("body_fragment_ignore", "an apron or uniform fragment without a head"),
    ("body_fragment_ignore", "background kitchen equipment with no human head"),
]

OWL_QUERIES: list[tuple[str, str]] = [
    ("head_allowed", "white hairnet"),
    ("head_allowed", "sanitary hair cap"),
    ("head_allowed", "bouffant cap"),
    ("head_no_headwear", "bare human head"),
    ("head_no_headwear", "human hair"),
    ("head_forbidden", "baseball cap"),
    ("head_forbidden", "hoodie"),
    ("head_unknown", "human head"),
    ("body_fragment_ignore", "hand"),
    ("body_fragment_ignore", "glove"),
    ("body_fragment_ignore", "arm"),
    ("body_fragment_ignore", "torso"),
    ("body_fragment_ignore", "person"),
]

V2_CLASSES = [
    "head_allowed",
    "head_no_headwear",
    "head_forbidden",
    "head_unknown",
    "body_fragment_ignore",
]


@dataclass(slots=True)
class ImageItem:
    index: int
    candidate_id: str
    image_path: Path
    suggested_v2_class: str
    source_image_path: str
    source_class_name: str


def load_image(path: Path) -> Image.Image | None:
    try:
        return Image.open(path).convert("RGB")
    except Exception:
        return None


def image_quality(image: Image.Image) -> dict[str, float | str]:
    width, height = image.size
    stat = ImageStat.Stat(image.convert("L"))

    gray_mean = float(stat.mean[0])
    gray_std = float(stat.stddev[0])

    arr = np.asarray(image.resize((64, 64)).convert("L"), dtype=np.float32)
    gx = np.diff(arr, axis=1)
    gy = np.diff(arr, axis=0)
    sharpness = float(np.mean(np.abs(gx)) + np.mean(np.abs(gy)))

    if width < 24 or height < 24:
        quality_flag = "too_small"
    elif gray_std < 7.0:
        quality_flag = "almost_blank"
    elif sharpness < 1.6:
        quality_flag = "very_blurry"
    else:
        quality_flag = "usable"

    return {
        "width": float(width),
        "height": float(height),
        "area": float(width * height),
        "gray_mean": gray_mean,
        "gray_std": gray_std,
        "sharpness": sharpness,
        "quality_flag": quality_flag,
    }


def chunks(items: list[ImageItem], size: int):
    for start in range(0, len(items), size):
        yield items[start:start + size]


def get_device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def grouped_scores(raw_scores: np.ndarray) -> dict[str, float]:
    result = {cls: 0.0 for cls in V2_CLASSES}

    for score, (group, _prompt) in zip(raw_scores, PROMPTS):
        result[group] = max(result[group], float(score))

    return result


def decide_class(
    siglip_scores: dict[str, float],
    owl_scores: dict[str, float] | None,
    quality_flag: str,
) -> dict[str, str | float]:
    scores = dict(siglip_scores)

    if owl_scores:
        for cls, value in owl_scores.items():
            scores[cls] = max(scores.get(cls, 0.0), float(value))

    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    top_class, top_score = ordered[0]
    second_class, second_score = ordered[1]
    margin = float(top_score - second_score)

    if quality_flag in {"too_small", "almost_blank"}:
        bucket = "rejected"
        final_class = "rejected"
        reason = quality_flag
    elif top_class == "body_fragment_ignore" and top_score >= 0.42 and margin >= 0.04:
        bucket = "trusted_auto"
        final_class = top_class
        reason = "clear_body_fragment"
    elif top_class in {"head_allowed", "head_no_headwear", "head_forbidden"} and top_score >= 0.38 and margin >= 0.055:
        bucket = "trusted_auto"
        final_class = top_class
        reason = "confident_headwear_status"
    elif top_class == "head_unknown" and top_score >= 0.34:
        bucket = "review_required"
        final_class = "head_unknown"
        reason = "unclear_head"
    else:
        bucket = "review_required"
        final_class = top_class
        reason = "low_confidence_or_mixed"

    return {
        "final_v2_class": final_class,
        "bucket": bucket,
        "reason": reason,
        "top_class": top_class,
        "top_score": float(top_score),
        "second_class": second_class,
        "second_score": float(second_score),
        "margin": margin,
    }


def copy_for_review(src: Path, out_root: Path, bucket: str, final_class: str, candidate_id: str) -> str:
    if not src.is_file():
        return ""

    dst = out_root / bucket / final_class / f"{candidate_id}.jpg"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return str(dst)


def make_sheets(rows: list[dict[str, object]], out_dir: Path, image_key: str, title: str) -> None:
    if not rows:
        return

    cols = 10
    rows_per_sheet = 6
    tile_w = 230
    tile_h = 190
    image_h = 145
    per_sheet = cols * rows_per_sheet

    sheet_dir = out_dir / "sheets" / title
    sheet_dir.mkdir(parents=True, exist_ok=True)

    for sheet_index, start in enumerate(range(0, len(rows), per_sheet), start=1):
        chunk = rows[start:start + per_sheet]
        sheet = Image.new("RGB", (cols * tile_w, rows_per_sheet * tile_h), (235, 235, 235))
        draw = ImageDraw.Draw(sheet)

        for i, row in enumerate(chunk):
            col = i % cols
            rr = i // cols
            x = col * tile_w
            y = rr * tile_h

            path = Path(str(row.get(image_key, "")))

            try:
                img = Image.open(path).convert("RGB")
                src_w, src_h = img.size
                scale = min(tile_w / max(1, src_w), image_h / max(1, src_h))
                new_w = max(1, int(round(src_w * scale)))
                new_h = max(1, int(round(src_h * scale)))
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                canvas = Image.new("RGB", (tile_w, image_h), (245, 245, 245))
                canvas.paste(img, ((tile_w - new_w) // 2, (image_h - new_h) // 2))
            except Exception:
                canvas = Image.new("RGB", (tile_w, image_h), (210, 210, 210))

            sheet.paste(canvas, (x, y))
            draw.rectangle((x, y + image_h, x + tile_w, y + tile_h), fill=(255, 255, 255))
            draw.text((x + 4, y + image_h + 4), str(row.get("candidate_id", ""))[:28], fill=(0, 0, 0))
            draw.text((x + 4, y + image_h + 22), str(row.get("final_v2_class", ""))[:32], fill=(0, 0, 0))
            draw.text(
                (x + 4, y + image_h + 40),
                f'{float(row.get("top_score", 0.0)):.3f} / {str(row.get("reason", ""))[:20]}',
                fill=(0, 0, 0),
            )

        sheet.save(sheet_dir / f"sheet_{sheet_index:04d}.jpg", quality=92)


def run_siglip(
    items: list[ImageItem],
    batch_size: int,
    model_id: str,
    cache_dir: Path,
    out_rows: list[dict[str, object]],
    item_to_row: dict[int, int],
) -> None:
    device = get_device()
    print(f"[siglip] device={device} model={model_id}")

    processor = AutoProcessor.from_pretrained(model_id, cache_dir=str(cache_dir))
    model = AutoModel.from_pretrained(model_id, cache_dir=str(cache_dir))
    model.to(device)
    model.eval()

    prompt_texts = [prompt for _group, prompt in PROMPTS]

    with torch.no_grad():
        for batch in tqdm(list(chunks(items, batch_size)), desc="siglip"):
            images: list[Image.Image] = []
            valid_items: list[ImageItem] = []

            for item in batch:
                image = load_image(item.image_path)
                if image is not None:
                    images.append(image)
                    valid_items.append(item)

            if not images:
                continue

            inputs = processor(
                text=prompt_texts,
                images=images,
                padding="max_length",
                return_tensors="pt",
            )

            inputs = {key: value.to(device) for key, value in inputs.items()}
            outputs = model(**inputs)
            logits = outputs.logits_per_image.detach().float().cpu()
            probs = torch.sigmoid(logits).numpy()

            for item, raw in zip(valid_items, probs):
                scores = grouped_scores(raw)
                row = out_rows[item_to_row[item.index]]

                for cls in V2_CLASSES:
                    row[f"siglip_{cls}"] = float(scores[cls])

                row["siglip_top_class"] = max(scores.items(), key=lambda pair: pair[1])[0]
                row["siglip_top_score"] = float(max(scores.values()))


def run_dino_embeddings(
    items: list[ImageItem],
    batch_size: int,
    model_id: str,
    cache_dir: Path,
    out_dir: Path,
) -> np.ndarray:
    device = get_device()
    print(f"[dinov2] device={device} model={model_id}")

    processor = AutoImageProcessor.from_pretrained(model_id, cache_dir=str(cache_dir))
    model = AutoModel.from_pretrained(model_id, cache_dir=str(cache_dir))
    model.to(device)
    model.eval()

    all_embeddings: list[np.ndarray] = []

    with torch.no_grad():
        for batch in tqdm(list(chunks(items, batch_size)), desc="dinov2"):
            images: list[Image.Image] = []

            for item in batch:
                image = load_image(item.image_path)
                if image is None:
                    image = Image.new("RGB", (224, 224), (240, 240, 240))
                images.append(image)

            inputs = processor(images=images, return_tensors="pt")
            inputs = {key: value.to(device) for key, value in inputs.items()}
            outputs = model(**inputs)

            if hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
                emb = outputs.pooler_output
            else:
                emb = outputs.last_hidden_state[:, 0, :]

            emb = emb.detach().float().cpu().numpy()
            emb = emb / np.maximum(np.linalg.norm(emb, axis=1, keepdims=True), 1e-8)
            all_embeddings.append(emb)

    embeddings = np.concatenate(all_embeddings, axis=0).astype(np.float32)
    out_dir.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out_dir / "dinov2_embeddings.npz", embeddings=embeddings)

    return embeddings


def add_duplicate_groups(
    embeddings: np.ndarray,
    out_rows: list[dict[str, object]],
    threshold: float,
) -> None:
    if len(embeddings) < 2:
        return

    print(f"[duplicates] nearest-neighbor search, threshold={threshold}")

    n_neighbors = min(8, len(embeddings))
    nn = NearestNeighbors(n_neighbors=n_neighbors, metric="cosine")
    nn.fit(embeddings)

    distances, indices = nn.kneighbors(embeddings)

    parent = list(range(len(embeddings)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra = find(a)
        rb = find(b)

        if ra != rb:
            parent[rb] = ra

    for i in range(len(embeddings)):
        for dist, j in zip(distances[i][1:], indices[i][1:]):
            sim = 1.0 - float(dist)

            if sim >= threshold:
                union(i, int(j))

    root_to_group: dict[int, int] = {}
    next_group = 1

    for i, row in enumerate(out_rows):
        root = find(i)

        if root not in root_to_group:
            root_to_group[root] = next_group
            next_group += 1

        row["near_duplicate_group"] = str(root_to_group[root])


def run_owlv2(
    items: list[ImageItem],
    model_id: str,
    cache_dir: Path,
    out_rows: list[dict[str, object]],
    item_to_row: dict[int, int],
    max_items: int | None = None,
) -> None:
    device = get_device()
    print(f"[owlv2] device={device} model={model_id}")

    try:
        from transformers import Owlv2ForObjectDetection
    except Exception:
        print("[owlv2] unavailable in installed transformers, skipped")
        return

    processor = AutoProcessor.from_pretrained(model_id, cache_dir=str(cache_dir))
    model = Owlv2ForObjectDetection.from_pretrained(model_id, cache_dir=str(cache_dir))
    model.to(device)
    model.eval()

    query_texts = [query for _group, query in OWL_QUERIES]
    selected_items = items if max_items is None else items[:max_items]

    with torch.no_grad():
        for item in tqdm(selected_items, desc="owlv2"):
            image = load_image(item.image_path)
            if image is None:
                continue

            inputs = processor(text=[query_texts], images=image, return_tensors="pt")
            inputs = {key: value.to(device) for key, value in inputs.items()}

            outputs = model(**inputs)
            target_sizes = torch.tensor([image.size[::-1]], device=device)

            results = processor.post_process_object_detection(
                outputs=outputs,
                target_sizes=target_sizes,
                threshold=0.08,
            )

            cls_scores = {cls: 0.0 for cls in V2_CLASSES}

            for score, label, _box in zip(
                results[0]["scores"].detach().cpu().tolist(),
                results[0]["labels"].detach().cpu().tolist(),
                results[0]["boxes"].detach().cpu().tolist(),
            ):
                if int(label) < 0 or int(label) >= len(OWL_QUERIES):
                    continue

                group, _query = OWL_QUERIES[int(label)]
                cls_scores[group] = max(cls_scores[group], float(score))

            row = out_rows[item_to_row[item.index]]

            for cls in V2_CLASSES:
                row[f"owlv2_{cls}"] = float(cls_scores[cls])

            row["owlv2_top_class"] = max(cls_scores.items(), key=lambda pair: pair[1])[0]
            row["owlv2_top_score"] = float(max(cls_scores.values()))


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    fields: list[str] = []
    seen: set[str] = set()

    for row in rows:
        for key in row.keys():
            if key not in seen:
                seen.add(key)
                fields.append(key)

    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--hf-cache", required=True)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--max-images", type=int, default=0)
    parser.add_argument("--use-owlv2", type=int, default=1)
    parser.add_argument("--use-dino-duplicates", type=int, default=1)
    parser.add_argument("--siglip-model", default="google/siglip2-base-patch16-224")
    parser.add_argument("--owlv2-model", default="google/owlv2-base-patch16-ensemble")
    parser.add_argument("--dinov2-model", default="facebook/dinov2-small")
    parser.add_argument("--duplicate-threshold", type=float, default=0.985)

    args = parser.parse_args()

    manifest_path = Path(args.manifest).resolve()
    out_dir = Path(args.out).resolve()
    hf_cache = Path(args.hf_cache).resolve()

    if out_dir.exists():
        shutil.rmtree(out_dir)

    out_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(manifest_path, sep=";", dtype=str).fillna("")

    if args.max_images and args.max_images > 0:
        df = df.head(args.max_images).copy()

    items: list[ImageItem] = []
    out_rows: list[dict[str, object]] = []

    for row_index, row in df.iterrows():
        crop_path = Path(row.get("context_crop_path", "") or row.get("tight_crop_path", ""))
        candidate_id = str(row.get("candidate_id", f"candidate_{row_index:08d}"))

        item = ImageItem(
            index=len(items),
            candidate_id=candidate_id,
            image_path=crop_path,
            suggested_v2_class=str(row.get("suggested_v2_class", "")),
            source_image_path=str(row.get("source_image_path", "")),
            source_class_name=str(row.get("source_class_name", "")),
        )

        items.append(item)

        image = load_image(crop_path)
        if image is None:
            image = Image.new("RGB", (1, 1), (0, 0, 0))

        q = image_quality(image)

        out_rows.append(
            {
                "candidate_id": candidate_id,
                "input_crop_path": str(crop_path),
                "suggested_v2_class": item.suggested_v2_class,
                "source_image_path": item.source_image_path,
                "source_class_name": item.source_class_name,
                **q,
            }
        )

    item_to_row = {item.index: i for i, item in enumerate(items)}

    print("")
    print(f"items={len(items)}")
    print(f"out={out_dir}")
    print("")

    run_siglip(
        items=items,
        batch_size=max(1, int(args.batch_size)),
        model_id=str(args.siglip_model),
        cache_dir=hf_cache,
        out_rows=out_rows,
        item_to_row=item_to_row,
    )

    if int(args.use_owlv2) == 1:
        run_owlv2(
            items=items,
            model_id=str(args.owlv2_model),
            cache_dir=hf_cache,
            out_rows=out_rows,
            item_to_row=item_to_row,
        )

    if int(args.use_dino_duplicates) == 1:
        embeddings = run_dino_embeddings(
            items=items,
            batch_size=max(1, int(args.batch_size)),
            model_id=str(args.dinov2_model),
            cache_dir=hf_cache,
            out_dir=out_dir / "embeddings",
        )

        add_duplicate_groups(
            embeddings=embeddings,
            out_rows=out_rows,
            threshold=float(args.duplicate_threshold),
        )

    for item in items:
        row = out_rows[item_to_row[item.index]]

        siglip_scores = {
            cls: float(row.get(f"siglip_{cls}", 0.0) or 0.0)
            for cls in V2_CLASSES
        }

        owl_scores = None

        if int(args.use_owlv2) == 1:
            owl_scores = {
                cls: float(row.get(f"owlv2_{cls}", 0.0) or 0.0)
                for cls in V2_CLASSES
            }

        decision = decide_class(
            siglip_scores=siglip_scores,
            owl_scores=owl_scores,
            quality_flag=str(row.get("quality_flag", "")),
        )

        row.update(decision)

        copied_path = copy_for_review(
            src=item.image_path,
            out_root=out_dir,
            bucket=str(row["bucket"]),
            final_class=str(row["final_v2_class"]),
            candidate_id=item.candidate_id,
        )

        row["copied_crop_path"] = copied_path

    write_csv(out_dir / "auto_audit_manifest.csv", out_rows)

    summary = Counter()

    for row in out_rows:
        summary[(str(row["bucket"]), str(row["final_v2_class"]))] += 1

    summary_rows = [
        {
            "bucket": bucket,
            "final_v2_class": final_class,
            "count": count,
        }
        for (bucket, final_class), count in sorted(summary.items())
    ]

    write_csv(out_dir / "auto_audit_summary.csv", summary_rows)

    review_rows = [row for row in out_rows if row.get("bucket") == "review_required"]
    trusted_rows = [row for row in out_rows if row.get("bucket") == "trusted_auto"]
    rejected_rows = [row for row in out_rows if row.get("bucket") == "rejected"]

    make_sheets(review_rows, out_dir, "copied_crop_path", "review_required")
    make_sheets(trusted_rows[:600], out_dir, "copied_crop_path", "trusted_sample")
    make_sheets(rejected_rows[:600], out_dir, "copied_crop_path", "rejected_sample")

    print("")
    print("summary:")

    for row in summary_rows:
        print(f'{row["bucket"]}/{row["final_v2_class"]}: {row["count"]}')

    print("")
    print(f"manifest={out_dir / 'auto_audit_manifest.csv'}")
    print(f"summary={out_dir / 'auto_audit_summary.csv'}")
    print(f"trusted_auto={out_dir / 'trusted_auto'}")
    print(f"review_required={out_dir / 'review_required'}")
    print(f"rejected={out_dir / 'rejected'}")
    print("")
    print("Done.")


if __name__ == "__main__":
    main()
'@ | Set-Content -LiteralPath $Py -Encoding UTF8

Write-Host ""
Write-Host "Headwear Detector V2 automatic audit"
Write-Host "Vision root:       $VisionRoot"
Write-Host "Semantic Python:   $SemanticPython"
Write-Host "Manifest:          $Manifest"
Write-Host "Output:            $OutRoot"
Write-Host "Use OWLv2:         $UseOwlV2"
Write-Host "Use DINOv2:        $UseDinoDuplicates"
Write-Host "Batch size:        $BatchSize"
Write-Host ""

Write-Host "[preflight] Checking semantic environment..."
& $SemanticPython -c "import sys, regex, transformers; print('python=', sys.executable); print('regex=', regex.__version__); print('transformers=', transformers.__version__)"

$OwlFlag = 0
if ($UseOwlV2) {
    $OwlFlag = 1
}

$DinoFlag = 0
if ($UseDinoDuplicates) {
    $DinoFlag = 1
}

& $SemanticPython $Py `
    --manifest $Manifest `
    --out $OutRoot `
    --hf-cache $env:HUGGINGFACE_HUB_CACHE `
    --batch-size $BatchSize `
    --max-images $MaxImages `
    --use-owlv2 $OwlFlag `
    --use-dino-duplicates $DinoFlag

Write-Host ""
Write-Host "Готово. Результат:"
Write-Host $OutRoot
Write-Host ""
Write-Host "Открываю результат..."
explorer $OutRoot