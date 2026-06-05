#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Shiftable Installer — Ubuntu 22.04+
#
# Usage:     sudo bash install.sh
# Dev/test:  sudo bash install.sh --dev   (skips HTTPS, sets COOKIE_SECURE=false)
#
# Supports multiple instances on one server — each gets its own port,
# subdomain, system user, and systemd service.
# ─────────────────────────────────────────────────────────────────────────────

REPO_URL="https://github.com/Mousebeast/shiftable.git"
REPO_BRANCH="master"

# ── Flags ─────────────────────────────────────────────────────────────────────
DEV_MODE=false
for arg in "$@"; do
  [[ "$arg" == "--dev" ]] && DEV_MODE=true
done

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}[$1]${NC} $2"; }
ok()   { echo -e "  ${GREEN}✓${NC}  $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC}   $1"; }
fail() { echo -e "\n${RED}ERROR:${NC} $1" >&2; exit 1; }

# ── Root check ────────────────────────────────────────────────────────────────
[[ $(id -u) -eq 0 ]] || fail "This script must be run with sudo: sudo bash install.sh"

# ── Welcome ───────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}"
echo "  ╔════════════════════════════════════════════╗"
echo "  ║           Shiftable  Installer             ║"
echo "  ║    Restaurant Staff Scheduling  PWA        ║"
echo "  ╚════════════════════════════════════════════╝"
echo -e "${NC}"

if $DEV_MODE; then
  echo -e "  ${YELLOW}${BOLD}⚠  DEV MODE${NC}"
  echo -e "  ${YELLOW}HTTPS will be skipped. COOKIE_SECURE will be disabled.${NC}"
  echo -e "  ${YELLOW}Push notifications and PWA install will NOT work.${NC}"
  echo -e "  ${YELLOW}Do not use this mode on a public-facing server.${NC}\n"
fi

# ── Collect inputs ────────────────────────────────────────────────────────────
echo -e "${BOLD}  A few questions before we begin:\n${NC}"

# Restaurant name
while true; do
  read -rp "  Restaurant name: " RESTAURANT_NAME
  [[ -n "${RESTAURANT_NAME// /}" ]] && break
  echo "    Please enter a name."
done

# Derive instance slug from name
DEFAULT_SLUG=$(echo "$RESTAURANT_NAME" \
  | tr '[:upper:]' '[:lower:]' \
  | sed 's/[^a-z0-9]/-/g' \
  | sed 's/--*/-/g' \
  | sed 's/^-*//' \
  | sed 's/-*$//')
[[ -z "$DEFAULT_SLUG" ]] && DEFAULT_SLUG="app"

echo "  (Used for the install directory and service name)"
read -rp "  Instance ID [$DEFAULT_SLUG]: " SLUG_INPUT
SLUG="${SLUG_INPUT:-$DEFAULT_SLUG}"

APP_DIR="/opt/shiftable-$SLUG"
SERVICE_NAME="shiftable-$SLUG"
NGINX_CONF="/etc/nginx/sites-available/$SERVICE_NAME"

[[ -d "$APP_DIR" ]] && fail "$APP_DIR already exists. Re-running the installer on an existing install will corrupt the database. To update, pull new code and restart the service."

# ── Domain / connectivity setup ───────────────────────────────────────────────
USE_HTTPS=true
DUCKDNS_SUBDOMAIN=""
DUCKDNS_TOKEN=""

if $DEV_MODE; then
  DOMAIN="localhost"
  USE_HTTPS=false
else
  echo ""
  echo -e "  ${BOLD}How will staff access Shiftable?${NC}"
  echo ""
  echo "  [1] I have a domain name (e.g. schedule.myrestaurant.com)"
  echo "  [2] Set up a free DuckDNS address for me  (recommended for most)"
  echo "  [3] Static IP, HTTP only  (no SSL — push notifications disabled)"
  echo ""

  while true; do
    read -rp "  Choose [1/2/3]: " CONN_CHOICE
    case "$CONN_CHOICE" in
      1|2|3) break ;;
      *) echo "    Please enter 1, 2, or 3." ;;
    esac
  done

  case "$CONN_CHOICE" in
    1)
      echo ""
      echo "  Make sure your domain already points to this server's IP address."
      while true; do
        read -rp "  Domain (e.g. schedule.myrestaurant.com): " DOMAIN
        [[ "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$ ]] && break
        echo "    Enter a valid domain — no http://, no trailing slash."
      done
      USE_HTTPS=true
      ;;

    2)
      USE_HTTPS=true
      echo ""
      echo -e "  ${BOLD}Setting up a free DuckDNS address${NC}"
      echo ""
      echo "  You'll need a free DuckDNS account. This takes about 60 seconds:"
      echo ""
      echo -e "  ${CYAN}  1. Open https://www.duckdns.org on any device${NC}"
      echo -e "  ${CYAN}  2. Sign in with Google or GitHub${NC}"
      echo -e "  ${CYAN}  3. Create a subdomain (e.g. 'joes-bistro')${NC}"
      echo -e "  ${CYAN}  4. Copy your token from the top of the page${NC}"
      echo ""
      read -rp "  Press Enter when ready... "
      echo ""

      while true; do
        read -rp "  Your subdomain (just the name, e.g. joes-bistro): " DUCKDNS_SUBDOMAIN
        DUCKDNS_SUBDOMAIN=$(echo "$DUCKDNS_SUBDOMAIN" \
          | tr '[:upper:]' '[:lower:]' \
          | sed 's/[^a-z0-9-]/-/g' \
          | sed 's/^-*//' \
          | sed 's/-*$//')
        [[ -n "$DUCKDNS_SUBDOMAIN" ]] && break
        echo "    Please enter your subdomain name."
      done

      while true; do
        read -rp "  Your DuckDNS token: " DUCKDNS_TOKEN
        # DuckDNS tokens are UUIDs: 8-4-4-4-12 hex chars
        [[ "$DUCKDNS_TOKEN" =~ ^[0-9a-f-]{36}$ ]] && break
        echo "    Token should be in the format shown on duckdns.org (e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)."
      done

      echo ""
      echo -n "  Testing DuckDNS credentials..."
      DUCK_RESULT=$(curl -s --connect-timeout 10 \
        "https://www.duckdns.org/update?domains=$DUCKDNS_SUBDOMAIN&token=$DUCKDNS_TOKEN&ip=" \
        2>/dev/null || echo "KO")

      if [[ "$DUCK_RESULT" == "OK" ]]; then
        echo -e " ${GREEN}✓${NC}"
        ok "IP updated — your address will be ${BOLD}$DUCKDNS_SUBDOMAIN.duckdns.org${NC}"
      else
        echo ""
        warn "DuckDNS returned: $DUCK_RESULT"
        warn "Check your subdomain and token, then re-run the installer."
        echo ""
        read -rp "  Continue anyway? [y/N]: " DUCK_CONT
        [[ "$DUCK_CONT" =~ ^[Yy]$ ]] || fail "Aborted."
      fi

      DOMAIN="$DUCKDNS_SUBDOMAIN.duckdns.org"
      ;;

    3)
      USE_HTTPS=false
      echo ""
      STATIC_IP=$(curl -4 -s --connect-timeout 5 https://api.ipify.org 2>/dev/null \
        || hostname -I | awk '{print $1}')
      DOMAIN="$STATIC_IP"
      warn "HTTP-only mode selected."
      warn "Push notifications and PWA install prompts will not work without SSL."
      warn "All other features (scheduling, swaps, time-off) work normally."
      ;;
  esac
fi

# Auto-detect available port
PORT=3000
while ss -tlnp 2>/dev/null | grep -q ":$PORT "; do
  PORT=$((PORT + 1))
done
ok "Port $PORT is available"

# Admin account
echo ""
echo -e "  ${BOLD}Create your admin account:${NC}"

while true; do
  read -rp "  Your name: " ADMIN_NAME
  [[ -n "${ADMIN_NAME// /}" ]] && break
  echo "    Please enter your name."
done

while true; do
  read -rp "  Email address: " ADMIN_EMAIL
  [[ "$ADMIN_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]] && break
  echo "    Please enter a valid email address."
done

while true; do
  read -rsp "  PIN (4–6 digits): " ADMIN_PIN; echo ""
  if [[ "$ADMIN_PIN" =~ ^[0-9]{4,6}$ ]]; then
    read -rsp "  Confirm PIN: " ADMIN_PIN2; echo ""
    if [[ "$ADMIN_PIN" == "$ADMIN_PIN2" ]]; then
      break
    fi
    echo "    PINs don't match, try again."
  else
    echo "    PIN must be 4–6 digits."
  fi
done

# ── Derive app URL ─────────────────────────────────────────────────────────────
if $DEV_MODE; then
  APP_URL="http://$(hostname -I | awk '{print $1}'):$PORT"
elif $USE_HTTPS; then
  APP_URL="https://$DOMAIN"
else
  APP_URL="http://$DOMAIN"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  ── What's about to be installed ──────────────────────${NC}"
echo "  Restaurant:  $RESTAURANT_NAME"
echo "  Install dir: $APP_DIR"
echo "  Service:     $SERVICE_NAME"
echo "  Port:        $PORT"
if $DEV_MODE; then
  echo "  URL:         $APP_URL  (dev mode)"
elif [[ -n "$DUCKDNS_SUBDOMAIN" ]]; then
  echo "  Address:     $APP_URL  (DuckDNS + HTTPS)"
elif $USE_HTTPS; then
  echo "  Domain:      $APP_URL  (HTTPS via Certbot)"
else
  echo "  Address:     $APP_URL  (HTTP only)"
fi
echo "  Admin:       $ADMIN_NAME <$ADMIN_EMAIL>"
echo ""
read -rp "  Press Enter to begin, or Ctrl+C to cancel... "
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Installation steps
# ─────────────────────────────────────────────────────────────────────────────

step "1/9" "Installing system dependencies..."
apt-get update -y -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx curl gnupg2 ca-certificates git sqlite3
ok "nginx, certbot, git, sqlite3 ready"

step "2/9" "Installing Node.js 20 LTS..."
if ! node --version 2>/dev/null | grep -q "^v20"; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi
ok "Node $(node --version)  /  npm $(npm --version)"

step "3/9" "Downloading Shiftable..."
git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR" -q
ok "Downloaded to $APP_DIR"

step "4/9" "Creating system user..."
if ! id "$SERVICE_NAME" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_NAME"
  ok "User '$SERVICE_NAME' created"
else
  ok "User '$SERVICE_NAME' already exists"
fi

step "5/9" "Configuring restaurant name and building client..."

ESC_NAME=$(printf '%s' "$RESTAURANT_NAME" | sed 's/[&/\]/\\&/g')

sed -i "s|<title>[^<]*</title>|<title>$ESC_NAME</title>|g" \
  "$APP_DIR/client/index.html"
sed -i "s|apple-mobile-web-app-title\" content=\"[^\"]*\"|apple-mobile-web-app-title\" content=\"$ESC_NAME\"|g" \
  "$APP_DIR/client/index.html"
sed -i "s|\"name\": \"[^\"]*\"|\"name\": \"$ESC_NAME\"|g" \
  "$APP_DIR/client/public/manifest.json"
sed -i "s|\"short_name\": \"[^\"]*\"|\"short_name\": \"$ESC_NAME\"|g" \
  "$APP_DIR/client/public/manifest.json"

cd "$APP_DIR"
npm install --silent
npm run build --silent
npm prune --omit=dev --silent
ok "Client built"

step "6/9" "Generating secrets and configuration..."
mkdir -p "$APP_DIR/data"
DB_FILE="$APP_DIR/data/shiftable.db"
JWT_SECRET_VAL=$(openssl rand -hex 64)

VAPID_OUTPUT=$(node -e "
  const w = require('web-push');
  const k = w.generateVAPIDKeys();
  process.stdout.write(k.publicKey + '\n' + k.privateKey + '\n');
")
VAPID_PUB=$(echo "$VAPID_OUTPUT" | head -1)
VAPID_PRIV=$(echo "$VAPID_OUTPUT" | tail -1)

SMTP_FROM_DOMAIN="$( $USE_HTTPS && echo "$DOMAIN" || echo "shiftable.local" )"

cat > "$APP_DIR/.env" << ENVEOF
NODE_ENV=production
PORT=$PORT
DB_PATH=$DB_FILE
JWT_SECRET=$JWT_SECRET_VAL
VAPID_PUBLIC_KEY=$VAPID_PUB
VAPID_PRIVATE_KEY=$VAPID_PRIV
VAPID_SUBJECT=mailto:$ADMIN_EMAIL
SMTP_FROM=noreply@$SMTP_FROM_DOMAIN
ENVEOF

( $DEV_MODE || ! $USE_HTTPS ) && echo "COOKIE_SECURE=false" >> "$APP_DIR/.env"

chmod 600 "$APP_DIR/.env"
ok ".env written"

step "7/9" "Setting up database..."
set -a; source "$APP_DIR/.env"; set +a
npm run db:migrate --silent

ADMIN_NAME="$ADMIN_NAME" \
ADMIN_EMAIL="$ADMIN_EMAIL" \
ADMIN_PIN="$ADMIN_PIN" \
RESTAURANT_NAME="$RESTAURANT_NAME" \
APP_URL="$APP_URL" \
  node "$APP_DIR/server/db/seed.js"
ok "Database ready"

step "8/9" "Installing service and web server..."

chown -R "$SERVICE_NAME":"$SERVICE_NAME" "$APP_DIR"
chmod 640 "$APP_DIR/.env"

# Systemd service
cat > "/etc/systemd/system/$SERVICE_NAME.service" << SVCEOF
[Unit]
Description=Shiftable - $RESTAURANT_NAME
After=network.target

[Service]
Type=simple
User=$SERVICE_NAME
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" -q
ok "systemd service installed and enabled"

if ! $DEV_MODE; then
  # nginx config (HTTP — Certbot will add SSL block if applicable)
  cat > "$NGINX_CONF" << NGXEOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        root $APP_DIR/client/dist;
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri @node;
    }

    location @node {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }
}
NGXEOF

  [[ -L /etc/nginx/sites-enabled/default ]] && rm /etc/nginx/sites-enabled/default
  [[ ! -L "/etc/nginx/sites-enabled/$SERVICE_NAME" ]] && \
    ln -s "$NGINX_CONF" "/etc/nginx/sites-enabled/$SERVICE_NAME"

  nginx -t -q && systemctl reload nginx
  ok "nginx configured"
fi

# DuckDNS auto-update cron
if [[ -n "$DUCKDNS_SUBDOMAIN" ]]; then
  cat > "/etc/cron.d/shiftable-duckdns-$SLUG" << CRONEOF
*/5 * * * * root curl -s "https://www.duckdns.org/update?domains=$DUCKDNS_SUBDOMAIN&token=$DUCKDNS_TOKEN&ip=" -o /var/log/shiftable-duckdns-$SLUG.log 2>&1
CRONEOF
  chmod 644 "/etc/cron.d/shiftable-duckdns-$SLUG"
  ok "DuckDNS auto-update cron installed (runs every 5 minutes)"
fi

step "9/9" "Starting Shiftable..."
systemctl start "$SERVICE_NAME"
sleep 2

if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Service is running"
else
  warn "Service may not have started cleanly."
  warn "Check logs: journalctl -u $SERVICE_NAME -n 30"
fi

# ── HTTPS setup ───────────────────────────────────────────────────────────────
if ! $DEV_MODE && $USE_HTTPS; then
  echo ""
  echo -e "  ${BOLD}Setting up HTTPS...${NC}"

  if [[ -n "$DUCKDNS_SUBDOMAIN" ]]; then
    echo -e "  ${CYAN}Your IP was already sent to DuckDNS. Waiting a moment for DNS to propagate...${NC}"
    sleep 8
  else
    echo -e "  ${CYAN}Certbot will obtain a certificate for $DOMAIN.${NC}"
    echo -e "  ${CYAN}Make sure your domain's DNS is already pointing to this server.${NC}"
    echo ""
    read -rp "  Press Enter when DNS is ready (Ctrl+C to do this step later)... "
  fi

  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" -q; then
    ok "HTTPS certificate installed"
    # Update app_url in DB to confirm https://
    sqlite3 "$DB_FILE" \
      "INSERT OR REPLACE INTO app_settings(key,value) VALUES('app_url','$APP_URL');" \
      2>/dev/null && ok "app_url confirmed in database" || true
  else
    warn "Certbot failed. Once DNS is ready, run:"
    warn "  certbot --nginx -d $DOMAIN"
    if [[ -n "$DUCKDNS_SUBDOMAIN" ]]; then
      warn "DuckDNS propagation can take 1–2 minutes. Try again shortly."
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║               Shiftable is ready!                       ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  Open:   ${BOLD}$APP_URL${NC}"
echo ""

if ! $USE_HTTPS && ! $DEV_MODE; then
  warn "Running in HTTP-only mode."
  warn "Push notifications and PWA install prompts require SSL."
  warn "To add SSL later, point a domain at this server and run:"
  warn "  sudo bash $APP_DIR/configure-domain.sh"
  echo ""
fi

echo "  Sign in with the PIN you just created."
echo ""
echo "  Useful commands:"
echo "    Logs:    journalctl -u $SERVICE_NAME -f"
echo "    Restart: systemctl restart $SERVICE_NAME"
echo "    Stop:    systemctl stop $SERVICE_NAME"
echo "    Config:  $APP_DIR/.env"
if [[ -n "$DUCKDNS_SUBDOMAIN" ]]; then
  echo "    DuckDNS: tail -f /var/log/shiftable-duckdns-$SLUG.log"
fi
echo ""
