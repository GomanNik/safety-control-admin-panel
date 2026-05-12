# ============================================================
# File: vision/scripts/headwear/06_verify_onnx_on_debug_crops.ps1
# Purpose:
# - Run the exported ONNX classifier on several runtime debug crops
#   to verify input shape, RGB/BGR preprocessing and class mapping.
# - Run from the vision/ project root.
# ============================================================

param(
    [int]$Limit = 30
)

$ErrorActionPreference = "Stop"

$VisionRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $VisionRoot "app\config.py"))) {
    throw "Run this script from the vision/ folder. Current folder: $VisionRoot"
}

$Model = "models\headwear\headwear_policy_v1_cls.onnx"
$Images = "data\debug\headwear"

if (-not (Test-Path $Model)) {
    throw "ONNX model not found: $Model. Run 04_export_onnx.ps1 first."
}

if (-not (Test-Path $Images)) {
    throw "Debug crop folder not found: $Images"
}

python ml_headwear\verify_runtime_headwear_onnx.py `
    --model $Model `
    --image $Images `
    --limit $Limit
