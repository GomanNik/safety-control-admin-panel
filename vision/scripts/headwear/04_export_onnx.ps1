# ============================================================
# File: vision/scripts/headwear/04_export_onnx.ps1
# Purpose:
# - Export trained headwear classifier to ONNX and place it into
#   models/headwear/headwear_policy_v1_cls.onnx.
# - Run from the vision/ project root.
# ============================================================

$ErrorActionPreference = "Stop"

$VisionRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $VisionRoot "app\config.py"))) {
    throw "Run this script from the vision/ folder. Current folder: $VisionRoot"
}

$Weights = "runs\headwear_policy\headwear_policy_v1_yolo_cls\weights\best.pt"
$Output = "models\headwear\headwear_policy_v1_cls.onnx"

if (-not (Test-Path $Weights)) {
    throw "Weights not found: $Weights. Run 03_train_classifier.ps1 first."
}

python ml_headwear\export_headwear_yolo_cls_onnx.py `
    --weights $Weights `
    --output $Output `
    --imgsz 416 `
    --opset 17

Write-Host "[headwear] ONNX exported: $Output"
