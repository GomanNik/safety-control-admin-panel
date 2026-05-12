# ============================================================
# File: vision/scripts/headwear/09_scan_video_people.ps1
# Purpose:
# - Low-rate scan of a long video to find intervals with people.
# - Run from vision/ root.
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Video,

    [string]$PersonModel = ".\models\yolo11x.pt",
    [string]$Device = "cpu",
    [double]$SampleSeconds = 5.0,
    [double]$PersonConf = 0.25,
    [double]$IntervalGapSeconds = 20.0,
    [string]$OutputDir = ".\datasets\headwear_policy_v1\video_mining\scan"
)

$ErrorActionPreference = "Stop"

python .\ml_headwear\scan_video_person_intervals.py `
  --video $Video `
  --person-model $PersonModel `
  --device $Device `
  --sample-seconds $SampleSeconds `
  --person-conf $PersonConf `
  --interval-gap-seconds $IntervalGapSeconds `
  --output-dir $OutputDir
