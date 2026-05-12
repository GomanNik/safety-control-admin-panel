# =========================
# File: scripts/collect-frontend-quality-report.ps1
# Purpose:
# - Collect ONE combined frontend quality report into a single txt file
# - Includes:
#   1) package.json / tsconfig / vite config
#   2) src tree
#   3) full file list from src
#   4) typecheck report
#   5) unused locals/params report
#   6) ts-prune report
#   7) build report
# - PowerShell 7 compatible
# =========================

param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$OutputFileName = "frontend_quality_report.txt"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Strip-Ansi {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text
    )

    return [System.Text.RegularExpressions.Regex]::Replace(
        $Text,
        '\x1B\[[0-9;]*[A-Za-z]',
        ''
    )
}

function Add-SectionHeader {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [System.Collections.ArrayList]$Lines,

        [Parameter(Mandatory = $true)]
        [string]$Title
    )

    [void]$Lines.Add("============================================================")
    [void]$Lines.Add($Title)
    [void]$Lines.Add("============================================================")
    [void]$Lines.Add("")
}

function Add-FileContentSection {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [System.Collections.ArrayList]$Lines,

        [Parameter(Mandatory = $true)]
        [string]$BasePath,

        [Parameter(Mandatory = $true)]
        [string]$RelativePath
    )

    $fullPath = Join-Path $BasePath $RelativePath

    Add-SectionHeader -Lines $Lines -Title ("FILE: {0}" -f $RelativePath)

    if (-not (Test-Path $fullPath -PathType Leaf)) {
        [void]$Lines.Add("[missing]")
        [void]$Lines.Add("")
        return
    }

    Get-Content -Path $fullPath -Encoding UTF8 | ForEach-Object {
        [void]$Lines.Add([string]$_)
    }

    [void]$Lines.Add("")
}

function Add-CommandOutputSection {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [System.Collections.ArrayList]$Lines,

        [Parameter(Mandatory = $true)]
        [string]$Title,

        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    Add-SectionHeader -Lines $Lines -Title $Title

    Push-Location $WorkingDirectory
    try {
        $raw = & $Command 2>&1 | Out-String -Width 4096
        $text = Strip-Ansi -Text $raw

        if ([string]::IsNullOrWhiteSpace($text)) {
            [void]$Lines.Add("[no output]")
        }
        else {
            foreach ($line in ($text -split "`r?`n")) {
                [void]$Lines.Add($line)
            }
        }
    }
    catch {
        [void]$Lines.Add("[command failed]")
        [void]$Lines.Add($_.Exception.Message)
    }
    finally {
        Pop-Location
    }

    [void]$Lines.Add("")
}

$resolvedRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
$outputFile = Join-Path $resolvedRoot $OutputFileName

$lines = New-Object System.Collections.ArrayList

Add-SectionHeader -Lines $lines -Title "FRONTEND QUALITY REPORT"
[void]$lines.Add("Root: $resolvedRoot")
[void]$lines.Add("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$lines.Add("PowerShell: $($PSVersionTable.PSVersion.ToString())")
[void]$lines.Add("")

foreach ($file in @(
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "vitest.config.ts",
    "vitest.shared.config.ts"
)) {
    Add-FileContentSection -Lines $lines -BasePath $resolvedRoot -RelativePath $file
}

Add-CommandOutputSection `
    -Lines $lines `
    -Title "SOURCE TREE: src /F" `
    -WorkingDirectory $resolvedRoot `
    -Command {
        cmd /c tree src /F
    }

Add-CommandOutputSection `
    -Lines $lines `
    -Title "SOURCE FILE LIST: src/**/*" `
    -WorkingDirectory $resolvedRoot `
    -Command {
        Get-ChildItem -Path ".\src" -Recurse -File |
            Sort-Object FullName |
            ForEach-Object {
                $_.FullName.Substring($resolvedRoot.Length + 1)
            }
    }

Add-CommandOutputSection `
    -Lines $lines `
    -Title "TYPECHECK: tsc --noEmit" `
    -WorkingDirectory $resolvedRoot `
    -Command {
        npx tsc -p tsconfig.json --noEmit --pretty false
    }

Add-CommandOutputSection `
    -Lines $lines `
    -Title "UNUSED LOCALS / PARAMETERS: tsc --noUnusedLocals --noUnusedParameters" `
    -WorkingDirectory $resolvedRoot `
    -Command {
        npx tsc -p tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters --pretty false
    }

Add-CommandOutputSection `
    -Lines $lines `
    -Title "TS-PRUNE: unused exports" `
    -WorkingDirectory $resolvedRoot `
    -Command {
        npx --yes ts-prune
    }

Add-CommandOutputSection `
    -Lines $lines `
    -Title "BUILD: npm run build" `
    -WorkingDirectory $resolvedRoot `
    -Command {
        npm run build
    }

Set-Content -Path $outputFile -Value $lines -Encoding UTF8

Write-Host ""
Write-Host "DONE:"
Write-Host $outputFile