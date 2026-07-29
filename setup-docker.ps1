#Requires -Version 5.1
<#
.SYNOPSIS
    Shiftable setup script for Windows Server (Docker)
.DESCRIPTION
    Interactive setup for servers accessed over SSH. Requires Docker installed and running.
    Run with: iwr https://raw.githubusercontent.com/Mousebeast/Shiftable/master/setup-docker.ps1 -OutFile setup.ps1; .\setup.ps1
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$GhOrg      = "Mousebeast"
$GhRepo     = "Shiftable"
$Branch     = "master"

function Write-Step { param([string]$Msg) Write-Host "`n==> $Msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Msg) Write-Host "  OK  $Msg" -ForegroundColor Green }
function Write-Note { param([string]$Msg) Write-Host "  >>  $Msg" -ForegroundColor Yellow }
function Write-Fail { param([string]$Msg) Write-Host "`nERROR: $Msg`n" -ForegroundColor Red; exit 1 }

function Read-Required {
    param([string]$Prompt, [switch]$Secret)
    while ($true) {
        if ($Secret) {
            $secure = Read-Host -Prompt $Prompt -AsSecureString
            $val = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                     [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
        } else {
            $val = (Read-Host -Prompt $Prompt).Trim()
        }
        if ($val) { return $val }
        Write-Host "  This field is required." -ForegroundColor Yellow
    }
}

function Read-PIN {
    while ($true) {
        $secure = Read-Host -Prompt "Admin PIN (4-6 digits)" -AsSecureString
        $pin = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                 [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
        if ($pin -match '^\d{4,6}$') { return $pin }
        Write-Host "  PIN must be 4-6 digits only." -ForegroundColor Yellow
    }
}

function Get-RawUrl { param([string]$Path)
    return "https://raw.githubusercontent.com/$GhOrg/$GhRepo/$Branch/$Path"
}

# ── Header ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Shiftable Setup — Windows Server (Docker)" -ForegroundColor White
Write-Host ""

# ── Docker check ──────────────────────────────────────────────────────────────
Write-Step "Checking Docker"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host @"

  Docker is not installed.

  Install Docker Engine for Windows Server:
    https://docs.docker.com/engine/install/

  After installing, re-run this script.
"@ -ForegroundColor Yellow
    exit 1
}

$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Docker is installed but not running. Start the Docker service and try again."
}
Write-Ok "Docker is running"

# ── DuckDNS instructions ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Shiftable needs a free DuckDNS subdomain for SSL." -ForegroundColor Gray
Write-Host "  If you don't have one yet:" -ForegroundColor Gray
Write-Host "    1. Go to https://duckdns.org" -ForegroundColor Gray
Write-Host "    2. Sign in with Google or GitHub" -ForegroundColor Gray
Write-Host "    3. Create a subdomain (e.g. myrestaurant)" -ForegroundColor Gray
Write-Host "    4. Copy your token from the top of the page" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter when ready" | Out-Null

# ── Collect inputs ────────────────────────────────────────────────────────────
Write-Step "Configuration"

$restaurantName = Read-Required "Restaurant name"

# Timezone. Dates and "today" resolve in the container's local time, so leaving
# this at UTC for a non-UTC restaurant rolls the day over at the wrong moment —
# after roughly 7pm in the Americas the app starts treating tomorrow as today.
# Windows reports its own zone in Windows format, so map it to IANA where we can
# and fall back to UTC rather than writing a name the container cannot read.
$defaultTz = try {
    $winId = (Get-TimeZone).Id
    $tzi = [System.TimeZoneInfo]::FindSystemTimeZoneById($winId)
    $ianaOut = $null
    if ([System.TimeZoneInfo].GetMethod('TryConvertWindowsIdToIanaId', [type[]]@([string], [string].MakeByRefType()))) {
        if ([System.TimeZoneInfo]::TryConvertWindowsIdToIanaId($tzi.Id, [ref]$ianaOut)) { $ianaOut } else { 'UTC' }
    } else { 'UTC' }
} catch { 'UTC' }

Write-Host ""
Write-Host "  Timezone is used for dates and for deciding what counts as 'today'." -ForegroundColor Gray
Write-Host "  Use an IANA name, e.g. America/New_York or Europe/London." -ForegroundColor Gray
$tzInput  = (Read-Host "Timezone (press Enter for $defaultTz)").Trim()
$timezone = if ($tzInput) { $tzInput } else { $defaultTz }

# Week start. Schedules, availability patterns and week events are all keyed to
# this, and day_of_week values are offsets from it, so it is fixed at setup and
# has no in-app setting — changing it later reinterprets every stored week.
Write-Host ""
Write-Host "  Which day does your schedule week start on?" -ForegroundColor Gray
Write-Host "  This is fixed at setup and cannot be changed later." -ForegroundColor Gray
$weekInput = (Read-Host "Week starts on — [M]onday or [S]unday? (default: Monday)").Trim().ToLower()
$weekStart = if ($weekInput -eq 's') { 'sunday' } else { 'monday' }

$duckdnsSub     = (Read-Required "DuckDNS subdomain (just the name, not .duckdns.org)").ToLower().Trim()
$duckdnsToken   = Read-Required "DuckDNS token"
$adminName      = Read-Required "Your name (for the admin account)"
$adminEmail     = Read-Required "Your email address"
$adminPin       = Read-PIN
$domain         = "$duckdnsSub.duckdns.org"

$defaultDir = Join-Path $env:USERPROFILE "Shiftable"
$dirInput   = (Read-Host "Install directory (press Enter for $defaultDir)").Trim()
$installDir = if ($dirInput) { $dirInput } else { $defaultDir }

$stagingInput = (Read-Host "Install type — [R]eal install or [t]est run? (default: Real)").Trim().ToLower()
$staging = ($stagingInput -eq 't')

# ── Confirm ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Ready to install:" -ForegroundColor White
Write-Host "    Restaurant : $restaurantName"
Write-Host "    Timezone   : $timezone"
Write-Host "    Week starts: $weekStart"
Write-Host "    URL        : https://$domain"
Write-Host "    Admin      : $adminName <$adminEmail>"
Write-Host "    Directory  : $installDir"
if ($staging) { Write-Note "Using Let's Encrypt staging — for testing only" }
Write-Host ""
$confirm = (Read-Host "Continue? [Y/n]").Trim().ToLower()
if ($confirm -eq 'n') { Write-Host "Cancelled."; exit 0 }

# ── Create directories ────────────────────────────────────────────────────────
Write-Step "Creating install directory"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $installDir "docker") | Out-Null
Write-Ok $installDir

# ── Windows Firewall ──────────────────────────────────────────────────────────
Write-Step "Windows Firewall"
$existingRule = Get-NetFirewallRule -DisplayName "Shiftable*" -ErrorAction SilentlyContinue
if ($existingRule) {
    Write-Ok "Firewall rules already exist"
} else {
    $fw = (Read-Host "  Open ports 80 and 443 in Windows Firewall? [Y/n]").Trim().ToLower()
    if ($fw -ne 'n') {
        New-NetFirewallRule -DisplayName "Shiftable HTTP"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow | Out-Null
        New-NetFirewallRule -DisplayName "Shiftable HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow | Out-Null
        Write-Ok "Ports 80 and 443 opened"
    }
}

# ── Download compose files ────────────────────────────────────────────────────
Write-Step "Downloading configuration files"
Invoke-WebRequest (Get-RawUrl "docker-compose.yml")         -OutFile (Join-Path $installDir "docker-compose.yml")
Invoke-WebRequest (Get-RawUrl "docker/nginx.conf.template") -OutFile (Join-Path $installDir "docker\nginx.conf.template")
Write-Ok "Files downloaded"

# ── Write .env ────────────────────────────────────────────────────────────────
Write-Step "Writing configuration"
$envContent = "RESTAURANT_NAME=$restaurantName`nADMIN_NAME=$adminName`nADMIN_EMAIL=$adminEmail`nADMIN_PIN=$adminPin`nDUCKDNS_SUBDOMAIN=$duckdnsSub`nDUCKDNS_TOKEN=$duckdnsToken`nDOMAIN=$domain`nNODE_ENV=production`nPORT=3000`nDB_PATH=/app/data/shiftable.db`nTZ=$timezone`nWEEK_START=$weekStart"
if ($staging) { $envContent += "`nCERTBOT_STAGING=1" }
Set-Content -Path (Join-Path $installDir ".env") -Value $envContent -Encoding UTF8

Set-Content (Join-Path $installDir "start.bat") "@echo off`ndocker compose up -d`necho Shiftable started.`npause"
Set-Content (Join-Path $installDir "stop.bat")  "@echo off`ndocker compose down`necho Shiftable stopped.`npause"
Write-Ok "Configuration written"

# ── Run setup ─────────────────────────────────────────────────────────────────
Push-Location $installDir
try {
    # Start DuckDNS
    Write-Step "Starting DuckDNS (1/4)"
    docker compose up -d duckdns
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to start DuckDNS container" }
    Write-Ok "DuckDNS running"

    # Wait for DNS propagation
    Write-Step "Waiting for DNS to propagate (2/4)"
    for ($i = 1; $i -le 12; $i++) {
        Write-Progress -Activity "DNS propagation" -Status "$($i * 5) / 60 seconds" -PercentComplete (($i / 12) * 100)
        Start-Sleep -Seconds 5
    }
    Write-Progress -Activity "DNS propagation" -Completed
    Write-Ok "DNS wait complete"

    # Get SSL certificate
    Write-Step "Requesting SSL certificate (3/4)"
    $certArgs = @("compose", "run", "--rm", "-p", "80:80", "certbot", "certonly",
                  "--standalone", "--non-interactive", "--agree-tos",
                  "-m", $adminEmail, "-d", $domain)
    if ($staging) { $certArgs += "--staging" }
    & docker $certArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "SSL certificate request failed.`n  Make sure port 80 is reachable from the internet and DNS has fully propagated."
    }
    Write-Ok "SSL certificate obtained"

    # Start all services
    Write-Step "Starting Shiftable (4/4)"
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to start services" }

    # Wait for healthy
    Write-Host "  Waiting for app to become ready..." -ForegroundColor Gray
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        $appId = (docker compose ps -q app 2>$null)
        if ($appId) {
            $health = docker inspect --format='{{.State.Health.Status}}' $appId 2>$null
            if ($health -eq 'healthy') { break }
        }
    }
    Write-Ok "App is running"

} finally {
    Pop-Location
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Green
if ($staging) {
    Write-Host "  Test setup complete!" -ForegroundColor Green
} else {
    Write-Host "  Shiftable is running!" -ForegroundColor Green
}
Write-Host "  ================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  URL: https://$domain"
Write-Host ""
if ($staging) {
    Write-Note "This is a test install. Your browser will show a security warning"
    Write-Note "because staging certificates are not browser-trusted. This is expected."
    Write-Note "Re-run the script (choose Real install) when ready to go live."
    Write-Host ""
}
Write-Host "  Log in with your admin PIN to finish setup."
Write-Host "  To restart Shiftable later, run start.bat in:"
Write-Host "  $installDir"
Write-Host ""
