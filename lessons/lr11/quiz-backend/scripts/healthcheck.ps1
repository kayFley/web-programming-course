param(
    [string]$HostName  = "localhost",
    [int]   $Port      = 3000,
    [int]   $MaxRetries = 15,
    [int]   $RetryInterval = 2
)

$BaseUrl = "http://${HostName}:${Port}"
$ErrorActionPreference = "Stop"

Write-Host "Waiting for backend at $BaseUrl ..."
$ready = $false
for ($i = 1; $i -le $MaxRetries; $i++)
{
    try
    {
        $r = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 200)
        { $ready = $true; break
        }
    } catch
    {
    }
    if ($i -eq $MaxRetries)
    {
        Write-Host "Backend did not respond after $($MaxRetries * $RetryInterval)s"
        exit 1
    }
    Start-Sleep -Seconds $RetryInterval
}
Write-Host "Backend is up"

Write-Host "`n GET /health"
$r = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing
Write-Host "  Response: $($r.Content)"
if ($r.Content -notmatch '"ok"')
{ Write-Host "/health did not return ok"; exit 1
}
Write-Host "/health OK"

Write-Host "`n GET /api/auth/me (no token → expect 401)"
try
{
    Invoke-WebRequest -Uri "$BaseUrl/api/auth/me" -UseBasicParsing | Out-Null
    Write-Host "Expected 401 but got success"; exit 1
} catch
{
    $status = $_.Exception.Response.StatusCode.value__
    Write-Host "  HTTP status: $status"
    if ($status -ne 401)
    { Write-Host "Expected 401, got $status"; exit 1
    }
}
Write-Host "Auth guard OK"

Write-Host "`n GET /nonexistent (→ expect 404)"
try
{
    $r = Invoke-WebRequest -Uri "$BaseUrl/nonexistent" -UseBasicParsing -ErrorAction SilentlyContinue
    $status = $r.StatusCode
} catch
{
    $status = $_.Exception.Response.StatusCode.value__
}
Write-Host "  HTTP status: $status"
if ($status -ne 404)
{ Write-Host "Expected 404, got $status"; exit 1
}
Write-Host "404 handler OK"

Write-Host "`n All smoke checks passed."
