# ============================================================
# File: vision/scripts/headwear/01_make_real_crop_label_template.ps1
# Purpose:
# - Create a CSV template for manual labeling of real runtime headwear
#   debug crops.
# - Run from the vision/ project root.
# ============================================================

$ErrorActionPreference = "Stop"

$VisionRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $VisionRoot "app\config.py"))) {
    throw "Run this script from the vision/ folder. Current folder: $VisionRoot"
}

$DebugCsv = "data\debug\headwear\headwear_debug_log.csv"
$OutputCsv = "datasets\headwear_policy_v1\manual_labels\runtime_debug_manual_labels.csv"

if (-not (Test-Path $DebugCsv)) {
    throw "Debug CSV not found: $DebugCsv. First run the runtime so it writes headwear debug crops/log."
}

python ml_headwear\make_headwear_debug_label_template.py `
    --debug-csv $DebugCsv `
    --output $OutputCsv

Write-Host "[headwear] manual label template created: $OutputCsv"
Write-Host "[headwear] Fill final_class with one of: allowed_sanitary_headwear, no_or_insufficient_headwear, non_sanitary_headwear, unknown_unusable"
