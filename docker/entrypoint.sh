#!/bin/sh
set -e

DATA_DIR="/app/data"
SECRETS_FILE="$DATA_DIR/secrets.env"

mkdir -p "$DATA_DIR"

# ── Generate secrets on first start ──────────────────────────────────────────
if [ ! -f "$SECRETS_FILE" ]; then
  echo "[shiftable] First start — generating secrets..."

  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

  VAPID_OUTPUT=$(node -e "
    const wp = require('web-push');
    const k = wp.generateVAPIDKeys();
    process.stdout.write(k.publicKey + '\n' + k.privateKey + '\n');
  ")
  VAPID_PUBLIC=$(echo "$VAPID_OUTPUT" | head -1)
  VAPID_PRIVATE=$(echo "$VAPID_OUTPUT" | tail -1)

  printf 'JWT_SECRET=%s\nVAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\nVAPID_SUBJECT=mailto:%s\n' \
    "$JWT_SECRET" "$VAPID_PUBLIC" "$VAPID_PRIVATE" \
    "${ADMIN_EMAIL:-admin@shiftable.app}" \
    > "$SECRETS_FILE"

  echo "[shiftable] Secrets written."
fi

# ── Load generated secrets into environment ───────────────────────────────────
set -a
# shellcheck disable=SC1090
. "$SECRETS_FILE"
set +a

# ── Run migrations ────────────────────────────────────────────────────────────
echo "[shiftable] Running migrations..."
node server/db/migrate.js

# ── Seed admin on first run ───────────────────────────────────────────────────
node server/scripts/seed-admin.js

# ── Start Express ─────────────────────────────────────────────────────────────
echo "[shiftable] Starting server on port ${PORT:-3000}..."
exec node server/index.js
