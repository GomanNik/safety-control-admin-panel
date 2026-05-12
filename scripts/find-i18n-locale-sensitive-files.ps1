# =====================
# scripts/find-i18n-locale-sensitive-files.ps1
# =====================

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path ".").Path
$srcRoot = Join-Path $projectRoot "src"

if (-not (Test-Path $srcRoot)) {
    Write-Host "src folder not found: $srcRoot"
    exit 1
}

$filePatterns = @("*.ts", "*.tsx", "*.js", "*.jsx")

function Get-RelativePath {
    param(
        [string]$BasePath,
        [string]$FullPath
    )

    $base = [System.IO.Path]::GetFullPath($BasePath)
    $full = [System.IO.Path]::GetFullPath($FullPath)

    if ($full.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $full.Substring($base.Length).TrimStart('\', '/') -replace '\\', '/'
    }

    return $full -replace '\\', '/'
}

$files = Get-ChildItem -Path $srcRoot -Recurse -File -Include $filePatterns

$results = New-Object System.Collections.Generic.List[object]

foreach ($file in $files) {
    $content = $null

    try {
        $content = [System.IO.File]::ReadAllText($file.FullName)
    } catch {
        continue
    }

    if ([string]::IsNullOrWhiteSpace($content)) {
        continue
    }

    $usesI18nContext = $content.Contains("useI18nContext(")
    $usesTranslation = $content.Contains("useTranslation(")

    if (-not ($usesI18nContext -or $usesTranslation)) {
        continue
    }

    $usesMemo = $content.Contains("useMemo(")
    $usesCallback = $content.Contains("useCallback(")
    $usesEffect = $content.Contains("useEffect(")

    $results.Add([PSCustomObject]@{
        Path           = Get-RelativePath -BasePath $projectRoot -FullPath $file.FullName
        useI18nContext = $usesI18nContext
        useTranslation = $usesTranslation
        useMemo        = $usesMemo
        useCallback    = $usesCallback
        useEffect      = $usesEffect
    })
}

$results = $results | Sort-Object Path

if (-not $results -or $results.Count -eq 0) {
    Write-Host "No i18n-aware files found."
    exit 0
}

Write-Host ""
Write-Host "Found i18n-aware files:"
Write-Host ""

$results | Format-Table -AutoSize

Write-Host ""
Write-Host "Paths only:"
Write-Host ""

$results | ForEach-Object {
    Write-Host $_.Path
}

$reportPath = Join-Path $projectRoot "i18n-locale-sensitive-files.csv"
$results | Export-Csv -Path $reportPath -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host "CSV report saved: $reportPath"