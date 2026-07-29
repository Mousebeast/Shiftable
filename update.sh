#!/usr/bin/env bash
set -euo pipefail

# Shiftable Update Script
# Usage: sudo bash /opt/shiftable-<slug>/update.sh
#
# Run from the server where Shiftable is installed.
# Backs up the database, pulls latest code, rebuilds, migrates, and restarts.

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC}  $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC}   $1"; }
fail() { echo -e "\n${RED}ERROR:${NC} $1" >&2; exit 1; }
step() { echo -e "\n${CYAN}${BOLD}[$1]${NC} $2"; }

[[ $(id -u) -eq 0 ]] || fail "Run with sudo: sudo bash $0"

# ── Locate installation ───────────────────────────────────────────────────────
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="$(basename "$APP_DIR")"

[[ -f "$APP_DIR/package.json" ]] || fail "Not a Shiftable install directory: $APP_DIR"
[[ -f "$APP_DIR/.env" ]]        || fail ".env not found in $APP_DIR"

CURRENT=$(node -e "console.log(require('$APP_DIR/package.json').version)" 2>/dev/null || echo "unknown")

echo -e "\n${BOLD}  Shiftable Updater${NC}"
echo "  Install:  $APP_DIR"
echo "  Service:  $SERVICE_NAME"
echo "  Current:  v$CURRENT"
echo ""
read -rp "  Press Enter to begin, or Ctrl+C to cancel... "

# ── Backup database ───────────────────────────────────────────────────────────
step "1/5" "Backing up database..."
set -a; source "$APP_DIR/.env"; set +a

BACKUP=""
if [[ -n "${DB_PATH:-}" && "$DB_PATH" != ":memory:" && -f "$DB_PATH" ]]; then
  BACKUP="/tmp/shiftable-pre-update-$(date +%Y%m%d%H%M%S).db"
  cp "$DB_PATH" "$BACKUP"
  ok "Backed up to $BACKUP"
else
  warn "DB_PATH not set or file not found — skipping backup"
fi

# ── Pull latest code ──────────────────────────────────────────────────────────
step "2/5" "Pulling latest code..."
cd "$APP_DIR"
git pull --ff-only
ok "Code updated"

NEW=$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "unknown")

# ── Install dependencies and rebuild ─────────────────────────────────────────
step "3/5" "Building..."
npm install --silent
npm run build --silent
npm prune --omit=dev --silent
ok "Build complete"

# ── Run migrations ────────────────────────────────────────────────────────────
step "4/5" "Running database migrations..."
npm run db:migrate --silent
ok "Migrations applied"

# ── Restart service ───────────────────────────────────────────────────────────
step "5/5" "Restarting service..."
systemctl restart "$SERVICE_NAME"
sleep 2

if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Service restarted"
else
  warn "Service may not have started cleanly. Check logs:"
  warn "  journalctl -u $SERVICE_NAME -n 30"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  Updated: v$CURRENT → v$NEW${NC}"
echo ""
if [[ -n "$BACKUP" ]]; then
  echo "  DB backup at: $BACKUP"
  echo "  Remove when satisfied: rm $BACKUP"
fi
echo ""
