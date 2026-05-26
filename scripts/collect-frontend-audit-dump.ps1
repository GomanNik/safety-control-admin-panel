# =========================
# File: scripts/collect-frontend-audit-dump.ps1
# Purpose:
# - Collect focused frontend code dumps by vertical slice
# - Produces ONE text file with files in stable analysis-friendly order
# - Designed for passing code to another model for audit/refactor/fix
# - PowerShell 7 compatible
# =========================

param(
    [ValidateSet(
        "shared-api",
        "shared-realtime",
        "site",
        "incident",
        "camera",
        "dashboard",
        "app-shell"
    )]
    [string]$Slice = "site",

    [string]$ProjectRoot = (Get-Location).Path,

    [switch]$IncludeTests,

    [switch]$IncludeStyles
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Normalize-PathSlashes {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    return ($PathValue -replace '/', '\')
}

function Resolve-AbsolutePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BasePath,

        [Parameter(Mandatory = $true)]
        [string]$RelativePath
    )

    $normalizedBase = [System.IO.Path]::GetFullPath($BasePath)
    $normalizedRelative = Normalize-PathSlashes -PathValue $RelativePath

    return [System.IO.Path]::GetFullPath(
        [System.IO.Path]::Combine($normalizedBase, $normalizedRelative)
    )
}

function Get-RelativePathSafe {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BasePath,

        [Parameter(Mandatory = $true)]
        [string]$AbsolutePath
    )

    $base = [System.IO.Path]::GetFullPath($BasePath)
    $full = [System.IO.Path]::GetFullPath($AbsolutePath)

    $baseWithSlash = if ($base.EndsWith('\')) { $base } else { "$base\" }

    if ($full.StartsWith($baseWithSlash, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $full.Substring($baseWithSlash.Length)
    }

    return $full
}

function Add-ExactFiles {
    param(
        [Parameter(Mandatory = $true)]
        [System.Collections.Generic.List[string]]$Target,

        [Parameter(Mandatory = $true)]
        [string[]]$Files,

        [Parameter(Mandatory = $true)]
        [string]$BasePath
    )

    foreach ($relativePath in $Files) {
        $absolutePath = Resolve-AbsolutePath -BasePath $BasePath -RelativePath $relativePath

        if (Test-Path $absolutePath -PathType Leaf) {
            $Target.Add((Get-RelativePathSafe -BasePath $BasePath -AbsolutePath $absolutePath))
        }
    }
}

function Add-RecursiveDirectoryFiles {
    param(
        [Parameter(Mandatory = $true)]
        [System.Collections.Generic.List[string]]$Target,

        [Parameter(Mandatory = $true)]
        [string]$Directory,

        [Parameter(Mandatory = $true)]
        [string]$BasePath,

        [string[]]$ExcludeExtensions = @(),

        [string[]]$ExcludeFileNames = @()
    )

    $absoluteDir = Resolve-AbsolutePath -BasePath $BasePath -RelativePath $Directory

    if (-not (Test-Path $absoluteDir -PathType Container)) {
        return
    }

    Get-ChildItem -Path $absoluteDir -Recurse -File |
        Sort-Object FullName |
        ForEach-Object {
            $extension = $_.Extension
            $fileName = $_.Name

            if ($ExcludeExtensions -contains $extension) {
                return
            }

            if ($ExcludeFileNames -contains $fileName) {
                return
            }

            $Target.Add((Get-RelativePathSafe -BasePath $BasePath -AbsolutePath $_.FullName))
        }
}

function Get-CommonRootFiles {
    return @(
        "package.json",
        "tsconfig.json",
        "vite.config.ts",
        "vitest.config.ts",
        "vitest.shared.config.ts",
        "index.html",
        "src\main.tsx"
    )
}

function Get-AppShellFiles {
    return @(
        "src\app\App.tsx",
        "src\app\layout\AppLayout.tsx",
        "src\app\layout\index.ts",
        "src\app\providers\AppProviders.tsx",
        "src\app\providers\createProviders.tsx",
        "src\app\providers\index.ts",
        "src\app\router\AppRouter.tsx",
        "src\app\router\index.ts",
        "src\app\router\routes.tsx",
        "src\shared\index.ts"
    )
}

function Get-SliceDefinition {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SliceName,

        [Parameter(Mandatory = $true)]
        [bool]$NeedTests,

        [Parameter(Mandatory = $true)]
        [bool]$NeedStyles
    )

    $definition = [ordered]@{
        Title = ""
        ExactFiles = New-Object System.Collections.Generic.List[string]
        RecursiveDirs = New-Object System.Collections.Generic.List[string]
        TestDirs = New-Object System.Collections.Generic.List[string]
    }

    foreach ($file in (Get-CommonRootFiles)) {
        $definition.ExactFiles.Add($file)
    }

    foreach ($file in (Get-AppShellFiles)) {
        $definition.ExactFiles.Add($file)
    }

    switch ($SliceName) {
        "shared-api" {
            $definition.Title = "shared api slice"

            foreach ($file in @(
                "src\shared\api\client-factory.ts",
                "src\shared\api\configured-client.ts",
                "src\shared\api\errors.ts",
                "src\shared\api\http-client.ts",
                "src\shared\api\index.ts",
                "src\shared\api\interceptors.ts",
                "src\shared\api\primitives.ts",
                "src\shared\api\react.tsx",
                "src\shared\api\types.ts",
                "src\shared\config\app-config.ts",
                "src\shared\config\env.ts",
                "src\shared\config\feature-flags.ts",
                "src\shared\config\index.ts",
                "src\shared\config\types.ts",
                "src\shared\logging\index.ts",
                "src\shared\logging\logger.ts"
            )) {
                $definition.ExactFiles.Add($file)
            }

            if ($NeedTests) {
                foreach ($dir in @(
                    "src\test\shared\api",
                    "src\test\shared\config",
                    "src\test\shared\logging"
                )) {
                    $definition.TestDirs.Add($dir)
                }
            }
        }

        "shared-realtime" {
            $definition.Title = "shared realtime slice"

            foreach ($file in @(
                "src\shared\realtime\client.ts",
                "src\shared\realtime\configured.ts",
                "src\shared\realtime\connection-manager.ts",
                "src\shared\realtime\hooks.ts",
                "src\shared\realtime\index.ts",
                "src\shared\realtime\mock-bridge.ts",
                "src\shared\realtime\provider.ts",
                "src\shared\realtime\types.ts",
                "src\shared\realtime\transports\ws-client.ts",
                "src\shared\realtime\utils\resolveUrl.ts",
                "src\shared\config\app-config.ts",
                "src\shared\config\index.ts",
                "src\shared\config\types.ts",
                "src\shared\logging\index.ts",
                "src\shared\logging\logger.ts"
            )) {
                $definition.ExactFiles.Add($file)
            }

            if ($NeedTests) {
                foreach ($dir in @(
                    "src\test\shared\realtime"
                )) {
                    $definition.TestDirs.Add($dir)
                }

                $definition.ExactFiles.Add("src\test\utils\mockWebSocket.ts")
            }
        }

        "site" {
            $definition.Title = "site vertical slice"

            foreach ($file in @(
                "src\pages\SiteCreatePage\index.tsx",
                "src\pages\SiteDetailsPage\index.tsx",
                "src\pages\SiteEditPage\index.tsx",

                "src\widgets\sites\index.ts",
                "src\widgets\sites\_shared\SiteCamerasSetupSection.tsx",

                "src\entities\site\api.ts",
                "src\entities\site\formatters.ts",
                "src\entities\site\hooks.ts",
                "src\entities\site\index.ts",
                "src\entities\site\mappers.ts",
                "src\entities\site\model.ts",
                "src\entities\site\types.ts",

                "src\entities\camera\api.ts",
                "src\entities\camera\hooks.ts",
                "src\entities\camera\index.ts",
                "src\entities\camera\mappers.ts",
                "src\entities\camera\model.ts",
                "src\entities\camera\types.ts",

                "src\entities\address-registry\api.ts",
                "src\entities\address-registry\hooks.ts",
                "src\entities\address-registry\index.ts",
                "src\entities\address-registry\types.ts",

                "src\features\site\index.ts",
                "src\features\site\_shared\mutation.ts",
                "src\features\site\site-delete\hooks.ts",
                "src\features\site\site-delete\index.ts",
                "src\features\site\site-delete\types.ts",
                "src\features\site\site-form\hooks.ts",
                "src\features\site\site-form\index.ts",
                "src\features\site\site-form\mappers.ts",
                "src\features\site\site-form\types.ts",
                "src\features\site\site-form\validation.ts",

                "src\shared\api\index.ts",
                "src\shared\api\types.ts",
                "src\shared\api\primitives.ts",
                "src\shared\api\errors.ts",
                "src\shared\api\http-client.ts",
                "src\shared\api\client-factory.ts",
                "src\shared\api\configured-client.ts",
                "src\shared\api\react.tsx",
                "src\shared\config\app-config.ts",
                "src\shared\config\env.ts",
                "src\shared\config\feature-flags.ts",
                "src\shared\config\index.ts",
                "src\shared\config\types.ts",
                "src\shared\date\parse.ts",
                "src\shared\logging\index.ts",
                "src\shared\logging\logger.ts",
                "src\shared\ui\classNames.ts",
                "src\shared\ui\index.ts"
            )) {
                $definition.ExactFiles.Add($file)
            }

            foreach ($dir in @(
                "src\widgets\sites\SiteCreateWidget",
                "src\widgets\sites\SiteDetailsWidget",
                "src\widgets\sites\SiteEditWidget",
                "src\widgets\sites\SiteFormWidget"
            )) {
                $definition.RecursiveDirs.Add($dir)
            }
        }

        "incident" {
            $definition.Title = "incident vertical slice"

            foreach ($file in @(
                "src\pages\IncidentDetailsPage\index.tsx",
                "src\pages\IncidentsPage\index.tsx",

                "src\widgets\incidents\index.ts",

                "src\entities\incident\api.ts",
                "src\entities\incident\formatters.ts",
                "src\entities\incident\hooks.ts",
                "src\entities\incident\index.ts",
                "src\entities\incident\mappers.ts",
                "src\entities\incident\model.ts",
                "src\entities\incident\store-hooks.ts",
                "src\entities\incident\store.ts",
                "src\entities\incident\types.ts",

                "src\features\incident\index.ts",
                "src\features\incident\incident-details\hooks.ts",
                "src\features\incident\incident-details\index.ts",
                "src\features\incident\incident-details\mappers.ts",
                "src\features\incident\incident-details\types.ts",
                "src\features\incident\incident-details\validation.ts",
                "src\features\incident\incident-filters\hooks.ts",
                "src\features\incident\incident-filters\index.ts",
                "src\features\incident\incident-filters\selectors.ts",
                "src\features\incident\incident-filters\types.ts",
                "src\features\incident\incident-metrics\hooks.ts",
                "src\features\incident\incident-metrics\index.ts",
                "src\features\incident\incident-metrics\selectors.ts",
                "src\features\incident\incident-metrics\types.ts",
                "src\features\incident\incident-table\hooks.ts",
                "src\features\incident\incident-table\index.ts",
                "src\features\incident\incident-table\mappers.ts",
                "src\features\incident\incident-table\types.ts",
                "src\features\incident\incident-table\validation.ts",

                "src\shared\api\index.ts",
                "src\shared\api\types.ts",
                "src\shared\api\primitives.ts",
                "src\shared\api\errors.ts",
                "src\shared\date\parse.ts",
                "src\shared\i18n\index.ts",
                "src\shared\logging\index.ts",
                "src\shared\logging\logger.ts"
            )) {
                $definition.ExactFiles.Add($file)
            }

            foreach ($dir in @(
                "src\widgets\incidents\IncidentDetailsWidget",
                "src\widgets\incidents\IncidentsWorkspaceWidget"
            )) {
                $definition.RecursiveDirs.Add($dir)
            }
        }

        "camera" {
            $definition.Title = "camera vertical slice"

            foreach ($file in @(
                "src\pages\CameraDetailsPage\index.tsx",
                "src\pages\CamerasPage\index.tsx",

                "src\widgets\cameras\index.ts",

                "src\entities\camera\api.ts",
                "src\entities\camera\formatters.ts",
                "src\entities\camera\hooks.ts",
                "src\entities\camera\index.ts",
                "src\entities\camera\mappers.ts",
                "src\entities\camera\model.ts",
                "src\entities\camera\realtime-contract.ts",
                "src\entities\camera\store-hooks.ts",
                "src\entities\camera\store.ts",
                "src\entities\camera\types.ts",

                "src\entities\site\api.ts",
                "src\entities\site\hooks.ts",
                "src\entities\site\index.ts",
                "src\entities\site\mappers.ts",
                "src\entities\site\model.ts",
                "src\entities\site\types.ts",

                "src\features\camera\index.ts",
                "src\features\camera\_shared\mutation.ts",
                "src\features\camera\camera-create\hooks.ts",
                "src\features\camera\camera-create\index.ts",
                "src\features\camera\camera-create\mappers.ts",
                "src\features\camera\camera-create\types.ts",
                "src\features\camera\camera-create\validation.ts",
                "src\features\camera\camera-delete\hooks.ts",
                "src\features\camera\camera-delete\index.ts",
                "src\features\camera\camera-delete\types.ts",
                "src\features\camera\camera-details\hooks.ts",
                "src\features\camera\camera-details\index.ts",
                "src\features\camera\camera-details\types.ts",
                "src\features\camera\camera-details-screen\hooks.ts",
                "src\features\camera\camera-details-screen\index.ts",
                "src\features\camera\camera-details-screen\mappers.ts",
                "src\features\camera\camera-details-screen\types.ts",
                "src\features\camera\camera-filters\hooks.ts",
                "src\features\camera\camera-filters\index.ts",
                "src\features\camera\camera-filters\storage.ts",
                "src\features\camera\camera-filters\types.ts",
                "src\features\camera\camera-query\hooks.ts",
                "src\features\camera\camera-query\index.ts",
                "src\features\camera\camera-query\types.ts",
                "src\features\camera\camera-realtime\hooks.ts",
                "src\features\camera\camera-realtime\index.ts",
                "src\features\camera\camera-realtime\mappers.ts",
                "src\features\camera\camera-realtime\types.ts",
                "src\features\camera\camera-table\hooks.ts",
                "src\features\camera\camera-table\index.ts",
                "src\features\camera\camera-table\mappers.ts",
                "src\features\camera\camera-table\types.ts",
                "src\features\camera\camera-video\hooks.ts",
                "src\features\camera\camera-video\index.ts",
                "src\features\camera\camera-video\mappers.ts",
                "src\features\camera\camera-video\realtime.ts",
                "src\features\camera\camera-video\types.ts",

                "src\shared\api\index.ts",
                "src\shared\api\types.ts",
                "src\shared\api\primitives.ts",
                "src\shared\api\errors.ts",
                "src\shared\realtime\client.ts",
                "src\shared\realtime\configured.ts",
                "src\shared\realtime\connection-manager.ts",
                "src\shared\realtime\hooks.ts",
                "src\shared\realtime\index.ts",
                "src\shared\realtime\mock-bridge.ts",
                "src\shared\realtime\provider.ts",
                "src\shared\realtime\types.ts",
                "src\shared\realtime\transports\ws-client.ts",
                "src\shared\realtime\utils\resolveUrl.ts",
                "src\shared\i18n\index.ts",
                "src\shared\logging\index.ts",
                "src\shared\logging\logger.ts"
            )) {
                $definition.ExactFiles.Add($file)
            }

            foreach ($dir in @(
                "src\widgets\cameras\CameraDetailsWidget",
                "src\widgets\cameras\CamerasWorkspaceWidget"
            )) {
                $definition.RecursiveDirs.Add($dir)
            }
        }

        "dashboard" {
            $definition.Title = "dashboard vertical slice"

            foreach ($file in @(
                "src\pages\DashboardPage\index.tsx",

                "src\widgets\overview\index.ts",
                "src\widgets\overview\dashboard-section-help\DashboardSectionHelpPopover.tsx",
                "src\widgets\overview\dashboard-section-help\index.ts",

                "src\features\common\index.ts",
                "src\features\common\overview-dashboard\hooks.ts",
                "src\features\common\overview-dashboard\index.ts",
                "src\features\common\overview-dashboard\mappers.ts",
                "src\features\common\overview-dashboard\types.ts",

                "src\entities\site\api.ts",
                "src\entities\site\hooks.ts",
                "src\entities\site\index.ts",
                "src\entities\site\mappers.ts",
                "src\entities\site\model.ts",
                "src\entities\site\types.ts",

                "src\entities\camera\api.ts",
                "src\entities\camera\formatters.ts",
                "src\entities\camera\hooks.ts",
                "src\entities\camera\index.ts",
                "src\entities\camera\mappers.ts",
                "src\entities\camera\model.ts",
                "src\entities\camera\types.ts",

                "src\entities\incident\api.ts",
                "src\entities\incident\formatters.ts",
                "src\entities\incident\hooks.ts",
                "src\entities\incident\index.ts",
                "src\entities\incident\mappers.ts",
                "src\entities\incident\model.ts",
                "src\entities\incident\types.ts",

                "src\shared\api\index.ts",
                "src\shared\api\types.ts",
                "src\shared\api\primitives.ts",
                "src\shared\api\errors.ts",
                "src\shared\i18n\index.ts",
                "src\shared\logging\index.ts",
                "src\shared\logging\logger.ts"
            )) {
                $definition.ExactFiles.Add($file)
            }

            foreach ($dir in @(
                "src\widgets\overview\DashboardWorkspaceWidget"
            )) {
                $definition.RecursiveDirs.Add($dir)
            }
        }

        "app-shell" {
            $definition.Title = "app shell slice"

            foreach ($file in @(
                "src\app\App.tsx",
                "src\app\layout\AppLayout.tsx",
                "src\app\layout\index.ts",
                "src\app\providers\AppProviders.tsx",
                "src\app\providers\createProviders.tsx",
                "src\app\providers\index.ts",
                "src\app\router\AppRouter.tsx",
                "src\app\router\index.ts",
                "src\app\router\routes.tsx",
                "src\shared\api\index.ts",
                "src\shared\config\index.ts",
                "src\shared\i18n\index.ts",
                "src\shared\realtime\index.ts",
                "src\shared\theme\index.ts",
                "src\widgets\errors\index.ts"
            )) {
                $definition.ExactFiles.Add($file)
            }

            foreach ($dir in @(
                "src\widgets\errors\AppErrorBoundaryWidget",
                "src\widgets\errors\Error404Widget",
                "src\widgets\errors\HttpErrorWidget"
            )) {
                $definition.RecursiveDirs.Add($dir)
            }
        }
    }

    if ($NeedStyles) {
        foreach ($dir in @(
            "src\app\styles",
            "src\shared\foundation",
            "src\shared\ui\styles"
        )) {
            $definition.RecursiveDirs.Add($dir)
        }
    }

    return $definition
}

$resolvedProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
$definition = Get-SliceDefinition -SliceName $Slice -NeedTests:$IncludeTests -NeedStyles:$IncludeStyles

$filesToDump = New-Object System.Collections.Generic.List[string]

Add-ExactFiles -Target $filesToDump -Files $definition.ExactFiles.ToArray() -BasePath $resolvedProjectRoot

foreach ($dir in $definition.RecursiveDirs) {
    Add-RecursiveDirectoryFiles `
        -Target $filesToDump `
        -Directory $dir `
        -BasePath $resolvedProjectRoot `
        -ExcludeExtensions @() `
        -ExcludeFileNames @()
}

if ($IncludeTests) {
    foreach ($dir in $definition.TestDirs) {
        Add-RecursiveDirectoryFiles `
            -Target $filesToDump `
            -Directory $dir `
            -BasePath $resolvedProjectRoot `
            -ExcludeExtensions @() `
            -ExcludeFileNames @()
    }

    Add-ExactFiles -Target $filesToDump -Files @("src\test\setup.ts") -BasePath $resolvedProjectRoot
}

$uniqueFiles = $filesToDump |
    Where-Object { $_ -and $_.Trim().Length -gt 0 } |
    Sort-Object -Unique

$outputFileName = "frontend_{0}_dump.txt" -f ($Slice -replace '-', '_')
$outputFile = Join-Path $resolvedProjectRoot $outputFileName

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("============================================================")
$lines.Add("FRONTEND AUDIT DUMP")
$lines.Add("Slice: $Slice")
$lines.Add("Title: $($definition.Title)")
$lines.Add("Root: $resolvedProjectRoot")
$lines.Add("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$lines.Add("IncludeTests: $IncludeTests")
$lines.Add("IncludeStyles: $IncludeStyles")
$lines.Add("Files: $($uniqueFiles.Count)")
$lines.Add("============================================================")
$lines.Add("")

foreach ($relativePath in $uniqueFiles) {
    $absolutePath = Resolve-AbsolutePath -BasePath $resolvedProjectRoot -RelativePath $relativePath

    if (-not (Test-Path $absolutePath -PathType Leaf)) {
        continue
    }

    $lines.Add("============================================================")
    $lines.Add("FILE: $relativePath")
    $lines.Add("============================================================")
    $lines.Add("")

    Get-Content -Path $absolutePath -Encoding UTF8 | ForEach-Object {
        $lines.Add([string]$_)
    }

    $lines.Add("")
    $lines.Add("")
}

Set-Content -Path $outputFile -Value $lines -Encoding UTF8

Write-Host ""
Write-Host "DONE:"
Write-Host $outputFile