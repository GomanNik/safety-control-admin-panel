# ============================================================
# File: 07_download_headwear_v2_open_models.ps1
# Purpose:
# - Download better open-vocabulary / zero-shot models for Headwear Detector V2.
# - Do not use the old helmet classifier.
# - Keep all experimental model cache in Windows Documents.
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
$UltralyticsCache = Join-Path $ModelRoot "ultralytics"

cd $VisionRoot

New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $ModelRoot | Out-Null
New-Item -ItemType Directory -Force -Path $HuggingFaceCache | Out-Null
New-Item -ItemType Directory -Force -Path $UltralyticsCache | Out-Null

$env:HF_HOME = $HuggingFaceCache
$env:HUGGINGFACE_HUB_CACHE = Join-Path $HuggingFaceCache "hub"
$env:TRANSFORMERS_CACHE = Join-Path $HuggingFaceCache "transformers"
$env:ULTRALYTICS_SETTINGS_DIR = $UltralyticsCache

if (Test-Path -LiteralPath ".\.venv\Scripts\Activate.ps1") {
    . ".\.venv\Scripts\Activate.ps1"
}

Write-Host ""
Write-Host "Headwear Detector V2 model downloader"
Write-Host "Vision root:      $VisionRoot"
Write-Host "Workspace root:   $WorkspaceRoot"
Write-Host "Model root:       $ModelRoot"
Write-Host "HF cache:         $env:HUGGINGFACE_HUB_CACHE"
Write-Host "Ultralytics cache:$UltralyticsCache"
Write-Host ""

python -m pip install --upgrade pip

python -m pip install --upgrade `
    "transformers>=4.52.0" `
    "huggingface_hub>=0.24.0" `
    "safetensors>=0.4.3" `
    "accelerate>=0.33.0" `
    "pillow>=10.0.0" `
    "pandas>=2.0.0" `
    "numpy>=1.24.0" `
    "tqdm>=4.66.0" `
    "scikit-learn>=1.3.0" `
    "ultralytics>=8.2.0"

$TorchCheck = python -c "import torch; print(torch.__version__)" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Torch is not installed. Installing default torch/torchvision..."
    python -m pip install --upgrade torch torchvision
}

$Py = Join-Path $ToolsRoot "download_headwear_v2_open_models.py"

@'
from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

from huggingface_hub import snapshot_download


MODEL_IDS = [
    {
        "id": "google/siglip2-base-patch16-224",
        "purpose": "zero-shot crop classification: hairnet / bare head / body fragment / unclear",
        "loader": "transformers",
    },
    {
        "id": "google/owlv2-base-patch16-ensemble",
        "purpose": "zero-shot object detection: head / hairnet / hand / person / glove",
        "loader": "transformers",
    },
    {
        "id": "facebook/dinov2-small",
        "purpose": "visual embeddings for duplicates, clusters and similarity search",
        "loader": "transformers",
    },
    {
        "id": "openai/clip-vit-large-patch14",
        "purpose": "fallback zero-shot image-text scoring",
        "loader": "transformers",
    },
]

YOLO_WORLD_WEIGHTS = [
    "yolov8s-worldv2.pt",
]


def main() -> None:
    model_root = Path(os.environ["HEADWEAR_V2_MODEL_ROOT"]).resolve()
    hf_cache = Path(os.environ["HUGGINGFACE_HUB_CACHE"]).resolve()

    model_root.mkdir(parents=True, exist_ok=True)
    hf_cache.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, object] = {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "model_root": str(model_root),
        "hf_cache": str(hf_cache),
        "models": [],
        "yolo_world": [],
    }

    print("")
    print("[1/2] Downloading Hugging Face models...")
    print("")

    for item in MODEL_IDS:
        model_id = item["id"]
        print(f"[hf] {model_id}")

        path = snapshot_download(
            repo_id=model_id,
            cache_dir=str(hf_cache),
            resume_download=True,
            ignore_patterns=[
                "*.msgpack",
                "tf_model*",
                "flax_model*",
                "*.h5",
            ],
        )

        manifest["models"].append(
            {
                "id": model_id,
                "purpose": item["purpose"],
                "cache_path": path,
            }
        )

        print(f"     cached: {path}")

    print("")
    print("[2/2] Downloading YOLO-World weights through Ultralytics...")
    print("")

    try:
        from ultralytics import YOLO

        for weight_name in YOLO_WORLD_WEIGHTS:
            print(f"[ultralytics] {weight_name}")
            model = YOLO(weight_name)
            manifest["yolo_world"].append(
                {
                    "id": weight_name,
                    "purpose": "fast open-vocabulary detector for additional verification",
                    "loaded": True,
                }
            )
            print("     loaded")
    except Exception as exc:
        manifest["yolo_world"].append(
            {
                "id": YOLO_WORLD_WEIGHTS,
                "purpose": "fast open-vocabulary detector for additional verification",
                "loaded": False,
                "error": repr(exc),
            }
        )
        print("     warning:", repr(exc))

    manifest_path = model_root / "models_manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("")
    print("Downloaded model manifest:")
    print(manifest_path)
    print("")
    print("Done.")


if __name__ == "__main__":
    main()
'@ | Set-Content -LiteralPath $Py -Encoding UTF8

$env:HEADWEAR_V2_MODEL_ROOT = $ModelRoot

python $Py

Write-Host ""
Write-Host "Готово. Модели скачаны/закэшированы здесь:"
Write-Host $ModelRoot
Write-Host ""
Write-Host "Manifest:"
Write-Host (Join-Path $ModelRoot "models_manifest.json")
