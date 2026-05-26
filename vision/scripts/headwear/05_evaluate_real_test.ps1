# ============================================================
# File: vision/scripts/headwear/05_evaluate_real_test.ps1
# Purpose:
# - Evaluate the exported ONNX model on real labeled runtime crops.
# - Run from the vision/ project root.
# ============================================================

param(
    [double]$ConfidenceThreshold = 0.70,
    [double]$MarginThreshold = 0.15
)

$ErrorActionPreference = "Stop"

$VisionRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $VisionRoot "app\config.py"))) {
    throw "Run this script from the vision/ folder. Current folder: $VisionRoot"
}

$Model = "models\headwear\headwear_policy_v1_cls.onnx"
$Data = "datasets\headwear_policy_v1\prepared\test_real"
$Output = "runs\headwear_policy\eval_test_real"

if (-not (Test-Path $Model)) {
    throw "ONNX model not found: $Model. Run 04_export_onnx.ps1 first."
}

if (-not (Test-Path $Data)) {
    throw "test_real dataset not found: $Data. Prepare and label real crops first."
}

python ml_headwear\evaluate_headwear_onnx.py `
    --model $Model `
    --data $Data `
    --output $Output `
    --confidence-threshold $ConfidenceThreshold `
    --margin-threshold $MarginThreshold

Write-Host "[headwear] evaluation completed: $Output"
Write-Host "[headwear] Check dangerous_false_compliant_rate first."
