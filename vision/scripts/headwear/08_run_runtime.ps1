# ============================================================
# File: vision/scripts/headwear/08_run_runtime.ps1
# Purpose:
# - Start the vision runtime after switching to the new headwear model.
# - Run from the vision/ project root.
# ============================================================

$ErrorActionPreference = "Stop"

$VisionRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $VisionRoot "app\config.py"))) {
    throw "Run this script from the vision/ folder. Current folder: $VisionRoot"
}

python -m app.main
