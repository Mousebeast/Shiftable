#!/usr/bin/env bash
set -euo pipefail

# Shiftable domain/HTTPS configuration helper
# Usage: sudo bash configure-domain.sh yourdomain.com [--https]
#
# Run this AFTER install.sh to point Shiftable at a real domain.
# Pass --https to also provision a Let's Encrypt certificate via Certbot.
#
# WARNING: Do NOT re-run install.sh after this — it will overwrite the DB.

NGINX_CONF="/etc/nginx/sites-available/shiftable"

# ─── Args ─────────────────────────────────────────────────────────────────────
DOMAIN="${1:-}"
HTTPS_FLAG="${2:-}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo bash configure-domain.sh <domain> [--https]" >&2
  echo "  Example: sudo bash configure-domain.sh schedule.myrestaurant.com --https" >&2
  exit 1
fi

# ─── Must run as root ─────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Run as root (sudo)." >&2
  exit 1
fi

# ─── Verify nginx config exists ───────────────────────────────────────────────
if [ ! -f "$NGINX_CONF" ]; then
  echo "ERROR: $NGINX_CONF not found. Run install.sh first." >&2
  exit 1
fi

# ─── Replace SERVER_NAME in nginx config ──────────────────────────────────────
echo "==> Setting server_name to: $DOMAIN"
sed -i "s/server_name .*/server_name $DOMAIN;/" "$NGINX_CONF"

# Also update VAPID_SUBJECT in /opt/shiftable/.env to use the real domain
ENV_FILE="/opt/shiftable/.env"
if [ -f "$ENV_FILE" ]; then
  sed -i "s|VAPID_SUBJECT=.*|VAPID_SUBJECT=mailto:admin@$DOMAIN|" "$ENV_FILE"
  echo "==> Updated VAPID_SUBJECT in .env → mailto:admin@$DOMAIN"
fi

# ─── Test and reload nginx ────────────────────────────────────────────────────
nginx -t
systemctl reload nginx
echo "==> nginx reloaded with domain: $DOMAIN"

# ─── Optional: HTTPS via Certbot ─────────────────────────────────────────────
if [ "$HTTPS_FLAG" = "--https" ]; then
  echo "==> Provisioning HTTPS certificate for $DOMAIN via Certbot..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email \
    --redirect
  echo "==> HTTPS enabled. Certificate will auto-renew via systemd timer."
else
  echo ""
  echo "    To enable HTTPS, run:"
  echo "    sudo bash configure-domain.sh $DOMAIN --https"
fi

echo ""
echo "✓ Domain configured: http${HTTPS_FLAG:+s}://$DOMAIN"
echo "  Restart the app to apply VAPID_SUBJECT change:"
echo "  systemctl restart shiftable"
