# ============================================================
# File: vision/scripts/headwear/03_train_classifier.ps1
# Purpose:
# - Train the new 3-class sanitary headwear crop classifier.
# - Run from the vision/ project root.
# ============================================================

param(
    [string]$Device = "cpu",
    [int]$Epochs = 80,
    [int]$Batch = 16,
    [string]$BaseModel = "yolo11s-cls.pt"
)

$ErrorActionPreference = "Stop"

$VisionRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $VisionRoot "app\config.py"))) {
    throw "Run this script from the vision/ folder. Current folder: $VisionRoot"
}

$Prepared = "datasets\headwear_policy_v1\prepared"
if (-not (Test-Path $Prepared)) {
    throw "Prepared dataset not found: $Prepared. Run 02_prepare_dataset.ps1 first."
}

python ml_headwear\train_headwear_yolo_cls.py `
    --data $Prepared `
    --model $BaseModel `
    --imgsz 416 `
    --epochs $Epochs `
    --batch $Batch `
    --device $Device `
    --workers 2 `
    --project runs\headwear_policy `
    --name headwear_policy_v1_yolo_cls

Write-Host "[headwear] training completed"
Write-Host "[headwear] expected weights: runs\headwear_policy\headwear_policy_v1_yolo_cls\weights\best.pt"
