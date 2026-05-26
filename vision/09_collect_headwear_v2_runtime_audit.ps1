# ============================================================
# File: 09_collect_headwear_v2_runtime_audit.ps1
# Purpose:
# - Collect project source files for external code review.
# - Do not generate reports.
# - Do not run tests.
# - Do not copy datasets, models, runs, cache folders or virtual environments.
# ============================================================

param(
    [string]$VisionRoot = "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel\vision"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
$ProgressPreference = "SilentlyContinue"

$DocumentsRoot = [Environment]::GetFolderPath("MyDocuments")
$ExperimentRoot = Join-Path $DocumentsRoot "safety-control-headwear-detector-v2"
$CollectRoot = Join-Path $ExperimentRoot "code_review_sources"
$ZipPath = Join-Path $ExperimentRoot "code_review_sources.zip"

if (-not (Test-Path -LiteralPath $VisionRoot)) {
    throw "Vision root not found: $VisionRoot"
}

if (Test-Path -LiteralPath $CollectRoot) {
    Remove-Item -LiteralPath $CollectRoot -Recurse -Force
}

if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
}

New-Item -ItemType Directory -Force -Path $CollectRoot | Out-Null

$ExcludedDirNames = @(
    ".venv",
    ".venv_semantic",
    ".idea",
    "__pycache__",
    ".pytest_cache",
    "datasets",
    "runs",
    "data",
    "_handoff",
    "models",
    "model_cache",
    "node_modules"
)

$AllowedExtensions = @(
    ".py",
    ".ps1",
    ".md",
    ".txt",
    ".yaml",
    ".yml",
    ".ini",
    ".json",
    ".toml",
    ".example"
)

function Get-RelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    return ([System.IO.Path]::GetRelativePath($VisionRoot, $Path))
}

function Test-IsExcluded {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.FileInfo]$File
    )

    $Relative = Get-RelativePath -Path $File.FullName
    $Parts = $Relative -split "[\\/]+"

    foreach ($Part in $Parts) {
        if ($ExcludedDirNames -contains $Part) {
            return $true
        }
    }

    if ($File.Name -eq ".env") {
        return $true
    }

    return $false
}

Write-Host ""
Write-Host "Collecting source files for code review..."
Write-Host "Vision root:  $VisionRoot"
Write-Host "Output root:  $CollectRoot"
Write-Host ""

$Files = Get-ChildItem -LiteralPath $VisionRoot -Recurse -File | Where-Object {
    if (Test-IsExcluded -File $_) {
        return $false
    }

    $Ext = $_.Extension.ToLowerInvariant()

    if ($AllowedExtensions -contains $Ext) {
        return $true
    }

    return $false
}

$CopiedCount = 0

foreach ($File in $Files) {
    $Relative = Get-RelativePath -Path $File.FullName
    $Destination = Join-Path $CollectRoot $Relative
    $DestinationDir = Split-Path -Parent $Destination

    New-Item -ItemType Directory -Force -Path $DestinationDir | Out-Null
    Copy-Item -LiteralPath $File.FullName -Destination $Destination -Force

    $CopiedCount += 1
}

Compress-Archive -LiteralPath (Join-Path $CollectRoot "*") -DestinationPath $ZipPath -Force

Write-Host "Done."
Write-Host "Copied files: $CopiedCount"
Write-Host ""
Write-Host "Folder:"
Write-Host $CollectRoot
Write-Host ""
Write-Host "Archive:"
Write-Host $ZipPath
Write-Host ""

explorer $ExperimentRoot