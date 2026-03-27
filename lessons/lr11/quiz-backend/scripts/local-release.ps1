param([string]$Tag = "")

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectDir

$ImageName       = "quiz-backend"
$PreviousTagFile = Join-Path $ProjectDir ".previous-tag"

if (-not $Tag) {
    try   { $Tag = (git rev-parse --short HEAD 2>$null).Trim() } catch { }
    if (-not $Tag) { $Tag = (Get-Date -Format "yyyyMMdd-HHmmss") }
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "🚀 Local Release — tag: $Tag"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

try {
    $currentTag = (podman inspect --format '{{index .Config.Labels "quiz-tag"}}' quiz-backend 2>$null).Trim()
    if ($currentTag) {
        $currentTag | Out-File -FilePath $PreviousTagFile -Encoding utf8 -NoNewline
        Write-Host "💾 Saved previous tag: $currentTag"
    }
} catch { }

Write-Host "`n▶ Step 1/4 — Lint & test"
bun run test
Write-Host "Tests passed"

Write-Host "`n▶ Step 2/4 — Build image ${ImageName}:${Tag}"
podman build --format docker --label "quiz-tag=$Tag" -t "${ImageName}:${Tag}" -t "${ImageName}:local" .
Write-Host "Image built"

Write-Host "`n▶ Step 3/4 — Start compose stack"
podman compose down --remove-orphans 2>$null
podman compose up -d
Write-Host "Stack started"

Write-Host "`n▶ Step 4/4 — Smoke check"
& "$PSScriptRoot\healthcheck.ps1"

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "Release $Tag complete."
Write-Host "   Logs:     podman compose logs -f backend"
Write-Host "   Rollback: .\scripts\rollback-local.ps1"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
