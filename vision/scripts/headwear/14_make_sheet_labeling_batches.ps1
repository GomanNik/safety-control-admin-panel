param(
    [string]$InputCsv = ".\datasets\headwear_policy_v1\video_mining\quality_review_20000_v2\good_candidates_for_labeling.csv",
    [string]$OutputDir = ".\datasets\headwear_policy_v1\video_mining\labeling_batches_20000",
    [int]$ThumbSize = 360,
    [int]$SheetCols = 3,
    [int]$SheetRows = 3,
    [int]$Limit = 0
)

$ErrorActionPreference = "Stop"
Write-Host "[sheet-labeling] input: $InputCsv"
Write-Host "[sheet-labeling] output: $OutputDir"

python .\ml_headwear\make_sheet_labeling_batches.py `
    --input-csv $InputCsv `
    --output-dir $OutputDir `
    --project-root "." `
    --thumb-size $ThumbSize `
    --sheet-cols $SheetCols `
    --sheet-rows $SheetRows `
    --sort-by timestamp_seconds `
    --sort-numeric `
    --limit $Limit
