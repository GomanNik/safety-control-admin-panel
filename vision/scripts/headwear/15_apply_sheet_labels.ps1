param(
    [string]$BatchDir = ".\datasets\headwear_policy_v1\video_mining\labeling_batches_20000",
    [string]$AutoUnknownCsv = ".\datasets\headwear_policy_v1\video_mining\quality_review_20000_v2\auto_unknown_unusable.csv",
    [string]$OutputCsv = ".\datasets\headwear_policy_v1\video_mining\labeled_mined_crops_20000.csv",
    [switch]$RequireAllLabeled
)

$ErrorActionPreference = "Stop"

$argsList = @(
    ".\ml_headwear\apply_sheet_labels.py",
    "--sheet-items-csv", (Join-Path $BatchDir "sheet_items.csv"),
    "--sheet-defaults-csv", (Join-Path $BatchDir "sheet_defaults.csv"),
    "--label-exceptions-csv", (Join-Path $BatchDir "label_exceptions.csv"),
    "--output-csv", $OutputCsv,
    "--auto-unknown-csv", $AutoUnknownCsv
)

if ($RequireAllLabeled) {
    $argsList += "--require-all-labeled"
}

python @argsList
