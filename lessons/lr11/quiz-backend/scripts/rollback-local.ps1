param([string]$Tag = "")

$ErrorActionPreference = "Stop"
$ProjectDir      = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectDir

$ImageName       = "quiz-backend"
$PreviousTagFile = Join-Path $ProjectDir ".previous-tag"

if (-not $Tag) {
    if (Test-Path $PreviousTagFile) {
        $Tag = (Get-Content $PreviousTagFile -Raw).Trim()
    }
    if (-not $Tag) {
        Write-Host " No rollback target found."
        Write-Host "   Pass a tag explicitly: .\scripts\rollback-local.ps1 -Tag <tag>"
        Write-Host "   Or run local-release.ps1 first so it can save the current tag."
        exit 1
    }
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "Rolling back to ${ImageName}:${Tag}"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

$exists = podman image exists "${ImageName}:${Tag}" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host " Image ${ImageName}:${Tag} not found locally."
    Write-Host "   Available tags:"
    podman images $ImageName --format "  {{.Tag}}"
    exit 1
}

Write-Host "`n▶ Re-tagging ${ImageName}:${Tag} → ${ImageName}:local"
podman tag "${ImageName}:${Tag}" "${ImageName}:local"

Write-Host "`n▶ Restarting compose stack"
podman compose down --remove-orphans 2>$null
podman compose up -d
Write-Host "   Stack restarted"

Write-Host "`n▶ Smoke check"
& "$PSScriptRoot\healthcheck.ps1"

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host " Rollback to $Tag complete."
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
