# ============================================================
# File: vision/scripts/headwear/00_setup_workspace.ps1
# Purpose:
# - Prepare folders and Python dependencies for the sanitary headwear
#   model rebuild pipeline.
# - Run from the vision/ project root.
# ============================================================

$ErrorActionPreference = "Stop"

$VisionRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $VisionRoot "app\config.py"))) {
    throw "Run this script from the vision/ folder. Current folder: $VisionRoot"
}

Write-Host "[headwear] vision root: $VisionRoot"

$Folders = @(
    "datasets\headwear_policy_v1\raw_sources",
    "datasets\headwear_policy_v1\prepared",
    "datasets\headwear_policy_v1\reports",
    "datasets\headwear_policy_v1\debug_samples",
    "datasets\headwear_policy_v1\manual_labels",
    "data\debug\headwear",
    "models\headwear",
    "runs\headwear_policy"
)

foreach ($Folder in $Folders) {
    New-Item -ItemType Directory -Force -Path (Join-Path $VisionRoot $Folder) | Out-Null
}

Write-Host "[headwear] folders created"

python -m pip install --upgrade pip
python -m pip install ultralytics onnx onnxruntime opencv-python numpy pandas scikit-learn matplotlib tqdm

Write-Host "[headwear] Python packages installed"
Write-Host "[headwear] setup completed"
