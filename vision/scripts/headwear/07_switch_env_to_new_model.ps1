# ============================================================
# File: vision/scripts/headwear/07_switch_env_to_new_model.ps1
# Purpose:
# - Switch .env from the old hairnet/no_hairnet detector to the new
#   3-class ONNX classifier.
# - Run from the vision/ project root only after ONNX export.
# ============================================================

$ErrorActionPreference = "Stop"

$VisionRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $VisionRoot "app\config.py"))) {
    throw "Run this script from the vision/ folder. Current folder: $VisionRoot"
}

$EnvFile = ".env"
$Model = "models\headwear\headwear_policy_v1_cls.onnx"

if (-not (Test-Path $EnvFile)) {
    throw ".env not found in vision/."
}

if (-not (Test-Path $Model)) {
    throw "New ONNX model not found: $Model. Do not switch runtime before training/export."
}

python ml_headwear\patch_env_headwear_classifier.py `
    --env $EnvFile `
    --model $Model `
    --backup

Write-Host "[headwear] .env switched to new classifier model"
Write-Host "[headwear] backup created next to .env"
