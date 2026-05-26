# ============================================================
# File: vision/scripts/headwear/12_apply_cluster_labels.ps1
# Purpose:
# - Apply cluster-level labels and build prepared_real dataset.
# - Run from vision/ root after filling final_class in clusters_for_labeling.csv.
# ============================================================

param(
    [string]$ClustersCsv = ".\datasets\headwear_policy_v1\video_mining\review\clusters_for_labeling.csv",
    [string]$MembersCsv = ".\datasets\headwear_policy_v1\video_mining\review\crop_cluster_members.csv",
    [string]$OutputRoot = ".\datasets\headwear_policy_v1\prepared_real",
    [ValidateSet("train_val_test", "test_real")]
    [string]$DefaultSplitMode = "train_val_test",
    [switch]$IncludeUnknown,
    [switch]$ClearOutput
)

$ErrorActionPreference = "Stop"

$cmd = @(
  ".\ml_headwear\apply_cluster_labels_to_dataset.py",
  "--clusters-csv", $ClustersCsv,
  "--members-csv", $MembersCsv,
  "--output-root", $OutputRoot,
  "--default-split-mode", $DefaultSplitMode
)

if ($IncludeUnknown) {
  $cmd += "--include-unknown"
}

if ($ClearOutput) {
  $cmd += "--clear-output"
}

python @cmd
