# ============================================================
# File: vision/scripts/headwear/02_prepare_dataset.ps1
# Purpose:
# - Build datasets/headwear_policy_v1/prepared/ from configured raw
#   sources and manually labeled real runtime crops.
# - Run from the vision/ project root.
# ============================================================

$ErrorActionPreference = "Stop"

$VisionRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $VisionRoot "app\config.py"))) {
    throw "Run this script from the vision/ folder. Current folder: $VisionRoot"
}

$Config = "ml_headwear\sources.local.headwear_policy_v1.json"
if (-not (Test-Path $Config)) {
    Copy-Item "ml_headwear\sample_sources.headwear_policy_v1.json" $Config -Force
    Write-Host "[headwear] Created local config: $Config"
    Write-Host "[headwear] Edit this file first: set paths to your 31k dataset and real crop label CSV."
    throw "Stop: configure $Config before preparing dataset."
}

python ml_headwear\prepare_headwear_policy_dataset.py `
    --config $Config `
    --output datasets\headwear_policy_v1 `
    --image-size 416 `
    --near-dedup

Write-Host "[headwear] dataset prepared: datasets\headwear_policy_v1\prepared"
Write-Host "[headwear] report: datasets\headwear_policy_v1\reports\class_counts.csv"
