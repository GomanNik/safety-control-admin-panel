# =====================
# File: scripts/run-frontend-audit.ps1
# Purpose:
# - Safe frontend audit runner
# - Does NOT modify or delete project files
# - Collects reports for:
#   1) TypeScript strict check + unused locals/params
#   2) production build
#   3) unused exports across modules
#   4) circular dependencies
#   5) large files
#   6) duplicate exported symbol names
# =====================

param(
    [string]$ProjectRoot = "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel"
)

$ErrorActionPreference = "Continue"
Set-StrictMode -Version Latest

Set-Location $ProjectRoot

$reportDir = Join-Path $ProjectRoot "frontend_audit"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

function Write-Section {
    param(
        [string]$Title
    )

    Write-Host ""
    Write-Host "============================================================"
    Write-Host $Title
    Write-Host "============================================================"
}

function Save-CommandOutput {
    param(
        [string]$Title,
        [string]$OutputPath,
        [scriptblock]$Command
    )

    Write-Section $Title

    $output = & $Command 2>&1 | ForEach-Object {
        $_.ToString()
    }

    if (-not $output -or $output.Count -eq 0) {
        $output = @("<<empty>>")
    }

    $output | Set-Content -Path $OutputPath -Encoding UTF8
    Write-Host $OutputPath
}

function Get-RelativeProjectPath {
    param(
        [string]$FullPath
    )

    $normalizedRoot = $ProjectRoot.TrimEnd('\', '/')
    $normalizedFull = $FullPath

    if ($normalizedFull.StartsWith($normalizedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $normalizedFull.Substring($normalizedRoot.Length).TrimStart('\', '/')
    }

    return $normalizedFull
}

# 1. TypeScript strict + unused locals/params
Save-CommandOutput `
    -Title "TypeScript: --noEmit --noUnusedLocals --noUnusedParameters" `
    -OutputPath (Join-Path $reportDir "01_typecheck_unused.txt") `
    -Command {
        npx tsc -p tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters
    }

# 2. Production build
Save-CommandOutput `
    -Title "Build: npm run build" `
    -OutputPath (Join-Path $reportDir "02_build.txt") `
    -Command {
        npm run build
    }

# 3. ts-prune raw
$tsPruneRawPath = Join-Path $reportDir "03_ts_prune_raw.txt"
Save-CommandOutput `
    -Title "Unused exports: ts-prune raw" `
    -OutputPath $tsPruneRawPath `
    -Command {
        npx --yes ts-prune
    }

# 4. ts-prune filtered (without 'used in module')
$tsPruneFilteredPath = Join-Path $reportDir "04_ts_prune_filtered.txt"
$tsPruneRaw = Get-Content -Path $tsPruneRawPath -Encoding UTF8

$tsPruneFiltered = $tsPruneRaw | Where-Object {
    $_ -and
    $_.Trim().Length -gt 0 -and
    $_ -notmatch '\(used in module\)'
}

if (-not $tsPruneFiltered -or $tsPruneFiltered.Count -eq 0) {
    $tsPruneFiltered = @("<<no cross-module unused exports>>")
}

$tsPruneFiltered | Set-Content -Path $tsPruneFilteredPath -Encoding UTF8

# 5. Circular dependencies
Save-CommandOutput `
    -Title "Circular dependencies: madge" `
    -OutputPath (Join-Path $reportDir "05_circular_dependencies.txt") `
    -Command {
        npx --yes madge --ts-config .\tsconfig.json --extensions ts,tsx --circular .\src
    }

# 6. Largest files by line count
Write-Section "Largest source files"

$sourceFiles = Get-ChildItem -Path (Join-Path $ProjectRoot "src") -Recurse -File |
    Where-Object {
        $_.Extension -in @(".ts", ".tsx", ".css")
    }

$largeFiles = foreach ($file in $sourceFiles) {
    $lineCount = 0

    try {
        $lineCount = (Get-Content -Path $file.FullName -Encoding UTF8 | Measure-Object -Line).Lines
    }
    catch {
        $lineCount = -1
    }

    [PSCustomObject]@{
        Lines = $lineCount
        Bytes = $file.Length
        File  = Get-RelativeProjectPath -FullPath $file.FullName
    }
}

$largeFilesReportPath = Join-Path $reportDir "06_largest_files.txt"

$largeFiles |
    Sort-Object Lines -Descending, Bytes -Descending |
    Select-Object -First 120 |
    Format-Table -AutoSize |
    Out-String -Width 4096 |
    Set-Content -Path $largeFilesReportPath -Encoding UTF8

Write-Host $largeFilesReportPath

# 7. Duplicate exported symbol names (informational only)
Write-Section "Duplicate exported symbol names"

$exportPattern = 'export\s+(?:declare\s+)?(?:type|interface|enum|class|function|const)\s+([A-Za-z_][A-Za-z0-9_]*)'
$symbols = @{}

foreach ($file in $sourceFiles | Where-Object { $_.Extension -in @(".ts", ".tsx") }) {
    $relativePath = Get-RelativeProjectPath -FullPath $file.FullName
    $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8

    $matches = [regex]::Matches($content, $exportPattern)

    foreach ($match in $matches) {
        $symbolName = $match.Groups[1].Value

        if (-not $symbols.ContainsKey($symbolName)) {
            $symbols[$symbolName] = New-Object System.Collections.Generic.List[string]
        }

        $symbols[$symbolName].Add($relativePath)
    }
}

$duplicateExportReportPath = Join-Path $reportDir "07_duplicate_export_names.txt"
$duplicateLines = New-Object System.Collections.Generic.List[string]

$duplicateEntries = $symbols.GetEnumerator() |
    Where-Object {
        ($_.Value | Sort-Object -Unique).Count -gt 1
    } |
    Sort-Object Name

if (-not $duplicateEntries -or $duplicateEntries.Count -eq 0) {
    $duplicateLines.Add("<<no duplicate exported symbol names>>")
}
else {
    foreach ($entry in $duplicateEntries) {
        $duplicateLines.Add("SYMBOL: $($entry.Key)")

        $uniqueFiles = $entry.Value | Sort-Object -Unique
        foreach ($path in $uniqueFiles) {
            $duplicateLines.Add("  - $path")
        }

        $duplicateLines.Add("")
    }
}

$duplicateLines | Set-Content -Path $duplicateExportReportPath -Encoding UTF8
Write-Host $duplicateExportReportPath

# 8. Index/barrel overview
Write-Section "Index/barrel files"

$indexFilesReportPath = Join-Path $reportDir "08_index_barrels.txt"

Get-ChildItem -Path (Join-Path $ProjectRoot "src") -Recurse -File |
    Where-Object {
        $_.Name -in @("index.ts", "index.tsx")
    } |
    ForEach-Object {
        Get-RelativeProjectPath -FullPath $_.FullName
    } |
    Sort-Object |
    Set-Content -Path $indexFilesReportPath -Encoding UTF8

Write-Host $indexFilesReportPath

Write-Section "DONE"
Write-Host "Frontend audit reports directory:"
Write-Host $reportDir