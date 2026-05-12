# ============================================================
# File: vision/scripts/headwear/11_cluster_crops_for_review.ps1
# Purpose:
# - Cluster extracted crops and create review contact sheets.
# - Run from vision/ root.
# ============================================================

param(
    [string]$MetadataCsv = ".\datasets\headwear_policy_v1\video_mining\crops\metadata.csv",
    [string]$OutputDir = ".\datasets\headwear_policy_v1\video_mining\review",
    [int]$HammingThreshold = 7,
    [int]$ThumbSize = 128,
    [int]$SheetCols = 5,
    [int]$SheetRows = 6
)

$ErrorActionPreference = "Stop"

python .\ml_headwear\cluster_crops_for_review.py `
  --metadata-csv $MetadataCsv `
  --output-dir $OutputDir `
  --hamming-threshold $HammingThreshold `
  --thumb-size $ThumbSize `
  --sheet-cols $SheetCols `
  --sheet-rows $SheetRows
