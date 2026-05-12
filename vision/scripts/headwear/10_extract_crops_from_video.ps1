# ============================================================
# File: vision/scripts/headwear/10_extract_crops_from_video.ps1
# Purpose:
# - Extract runtime-like upper-head crops from intervals with people.
# - Run from vision/ root.
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Video,

    [string]$PersonModel = ".\models\yolo11x.pt",
    [string]$Device = "cpu",
    [string]$IntervalsCsv = ".\datasets\headwear_policy_v1\video_mining\scan\presence_intervals.csv",
    [string]$OutputDir = ".\datasets\headwear_policy_v1\video_mining\crops",
    [double]$SampleSeconds = 1.0,
    [double]$PersonConf = 0.30,
    [int]$InputSize = 416,
    [int]$MaxCrops = 0,
    [switch]$SaveFrameContext,
    [switch]$KeepBadCrops
)

$ErrorActionPreference = "Stop"

$cmd = @(
  ".\ml_headwear\extract_headwear_crops_from_video.py",
  "--video", $Video,
  "--person-model", $PersonModel,
  "--device", $Device,
  "--output-dir", $OutputDir,
  "--sample-seconds", $SampleSeconds,
  "--person-conf", $PersonConf,
  "--input-size", $InputSize
)

if (Test-Path $IntervalsCsv) {
  $cmd += @("--intervals-csv", $IntervalsCsv)
}

if ($MaxCrops -gt 0) {
  $cmd += @("--max-crops", $MaxCrops)
}

if ($SaveFrameContext) {
  $cmd += "--save-frame-context"
}

if ($KeepBadCrops) {
  $cmd += "--keep-bad-crops"
}

python @cmd
