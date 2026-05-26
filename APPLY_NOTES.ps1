\
    # Apply documentation update pack.
    # Run from repository root: C:\Users\Goman Nikita\Desktop\safety-control-admin-panel

    $ErrorActionPreference = "Stop"

    $RepoRoot = Get-Location
    Write-Host "Repository root: $RepoRoot"

    $Files = @(
      "README.md",
      "docs/README.md",
      "docs/ARCHITECTURE.md",
      "docs/REPOSITORY_GUIDE.md",
      "docs/RUNBOOK.md",
      "docs/CODE_REVIEW_FIRST_PASS.md",
      "docs/DOCUMENTATION_PLAN.md",
      "src/README.md",
      "backend/README.md",
      "vision/README.md",
      "vision/docs/README.md",
      "scripts/README.md"
    )

    Write-Host "This pack should be copied over the repository preserving paths."
    Write-Host "After copying, run:"
    Write-Host "  git status --short"
    Write-Host "  git add README.md docs src/README.md backend/README.md vision/README.md vision/docs/README.md scripts/README.md"
    Write-Host "  git commit -m `"docs: update project documentation`""
    Write-Host "  git push origin main"
