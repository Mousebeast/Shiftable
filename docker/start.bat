@echo off
setlocal enabledelayedexpansion

REM Run from your Shiftable install directory (where docker-compose.yml lives).

for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
    if "%%a"=="DOMAIN"        set DOMAIN=%%b
    if "%%a"=="ADMIN_EMAIL"   set ADMIN_EMAIL=%%b
    if "%%a"=="CERTBOT_STAGING" set CERTBOT_STAGING=%%b
)

echo.
echo   Starting Shiftable...
echo.

echo   [1/4] Starting DuckDNS...
docker compose up -d duckdns

docker compose run --rm certbot sh -c "[ -f /etc/letsencrypt/live/%DOMAIN%/fullchain.pem ] && echo yes || echo no" > "%TEMP%\cert_check.txt" 2>nul
set /p CERT_EXISTS=<"%TEMP%\cert_check.txt"

if not "%CERT_EXISTS%"=="yes" (
    echo   [2/4] Waiting 60 seconds for DNS to propagate...
    timeout /t 60 /nobreak > nul

    echo   [2/4] Requesting SSL certificate...
    set CERTBOT_ARGS=certonly --standalone --non-interactive --agree-tos -m %ADMIN_EMAIL% -d %DOMAIN%
    if defined CERTBOT_STAGING (
        set CERTBOT_ARGS=!CERTBOT_ARGS! --staging
    )
    docker compose run --rm -p 80:80 certbot !CERTBOT_ARGS!
) else (
    echo   [2/4] Certificate already exists -- skipping.
)

echo   [3/4] Starting all services...
docker compose up -d

echo   [4/4] Waiting for app to start...
timeout /t 15 /nobreak > nul

echo.
echo   Shiftable is running at https://%DOMAIN%
echo.
pause
