# ============================================================
# File: vision/scripts/headwear/13_filter_mined_crops_quality.ps1
# Purpose:
# - Filters mined headwear crops before manual labeling.
# - Creates good candidate sheets and auto-unknown sheets.
# ============================================================

param(
    [string]$MetadataCsv = ".\datasets\headwear_policy_v1\video_mining\crops\metadata.csv",
    [string]$OutputDir = ".\datasets\headwear_policy_v1\video_mining\quality_review_test1000",
    [double]$MinPersonConf = 0.35,
    [int]$MinCropWidth = 90,
    [int]$MinCropHeight = 150,
    [double]$MinBlur = 25.0,
    [double]$MinBrightness = 35.0,
    [double]$MaxBrightness = 230.0,
    [double]$MinAspect = 0.45,
    [double]$MaxAspect = 3.0,
    [int]$ThumbSize = 220,
    [int]$SheetCols = 5,
    [int]$SheetRows = 4,
    [switch]$RejectTouchingBorder
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $MetadataCsv)) {
    throw "Metadata CSV not found: $MetadataCsv"
}

$argsList = @(
    "ml_headwear/filter_mined_crops_quality.py",
    "--metadata-csv", $MetadataCsv,
    "--output-dir", $OutputDir,
    "--project-root", ".",
    "--min-person-conf", "$MinPersonConf",
    "--min-crop-width", "$MinCropWidth",
    "--min-crop-height", "$MinCropHeight",
    "--min-blur", "$MinBlur",
    "--min-brightness", "$MinBrightness",
    "--max-brightness", "$MaxBrightness",
    "--min-aspect", "$MinAspect",
    "--max-aspect", "$MaxAspect",
    "--thumb-size", "$ThumbSize",
    "--sheet-cols", "$SheetCols",
    "--sheet-rows", "$SheetRows"
)

if ($RejectTouchingBorder) {
    $argsList += "--reject-touching-border"
}

python @argsList

Write-Host "[filter-crops] open good sheets:" -ForegroundColor Green
Write-Host "start $OutputDir\contact_sheets_good"
Write-Host "[filter-crops] open auto-unknown sheets:" -ForegroundColor Yellow
Write-Host "start $OutputDir\contact_sheets_auto_unknown"
Write-Host "[filter-crops] label this file:" -ForegroundColor Green
Write-Host "$OutputDir\good_candidates_for_labeling.csv"
