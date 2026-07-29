#!/usr/bin/env bash
set -euo pipefail

# Run from your Shiftable install directory (where docker-compose.yml lives).

set -a; source .env; set +a

STAGING=${CERTBOT_STAGING:-}

echo ""
echo "  Starting Shiftable..."
echo ""

echo "  [1/4] Starting DuckDNS..."
docker compose up -d duckdns

CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
CERT_EXISTS=$(docker compose run --rm certbot sh -c "[ -f '$CERT_PATH' ] && echo yes || echo no" 2>/dev/null)

if [ "$CERT_EXISTS" != "yes" ]; then
  echo "  [2/4] Waiting 60 seconds for DNS to propagate..."
  sleep 60

  echo "  [2/4] Requesting SSL certificate..."
  CERTBOT_ARGS="certonly --standalone --non-interactive --agree-tos -m $ADMIN_EMAIL -d $DOMAIN"
  [ -n "$STAGING" ] && CERTBOT_ARGS="$CERTBOT_ARGS --staging"
  # shellcheck disable=SC2086
  docker compose run --rm -p 80:80 certbot $CERTBOT_ARGS
else
  echo "  [2/4] Certificate already exists — skipping."
fi

echo "  [3/4] Starting all services..."
docker compose up -d

echo "  [4/4] Waiting for app to become healthy..."
for i in $(seq 1 30); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo "")
  [ "$STATUS" = "healthy" ] && break
  sleep 2
done

echo ""
echo "  Shiftable is running at https://$DOMAIN"
echo ""
