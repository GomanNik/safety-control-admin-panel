# ============================================================
# File: tools/run_quality_gate.ps1
# Purpose:
# - Runs the local production quality gate for the standalone
#   vision service.
# - Checks compileability, architecture requirements and tests.
# - Uses strict requirements mode so architecture warnings are not
#   silently ignored.
# ============================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Push-Location $RootDir

try {
    Write-Host ""
    Write-Host "============================================================"
    Write-Host "QUALITY GATE: compileall"
    Write-Host "============================================================"
    python -m compileall app tools tests

    Write-Host ""
    Write-Host "============================================================"
    Write-Host "QUALITY GATE: production architecture requirements"
    Write-Host "============================================================"
    python tools/check_requirements.py --strict

    Write-Host ""
    Write-Host "============================================================"
    Write-Host "QUALITY GATE: pytest availability"
    Write-Host "============================================================"
    python -c "import pytest" 2>$null

    if ($LASTEXITCODE -ne 0) {
        throw "pytest is not installed in current environment"
    }

    Write-Host ""
    Write-Host "============================================================"
    Write-Host "QUALITY GATE: tests"
    Write-Host "============================================================"
    python -m pytest tests -q

    Write-Host ""
    Write-Host "============================================================"
    Write-Host "QUALITY GATE PASSED"
    Write-Host "============================================================"
}
finally {
    Pop-Location
}