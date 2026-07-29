# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci && cd client && npm ci

COPY client/ ./client/
RUN npm run build

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# tzdata is required for TZ to mean anything. Alpine ships no timezone database,
# so without this a TZ of America/New_York resolves silently to UTC — the app
# would look configured while still rolling the day over at the wrong moment,
# which is the exact bug the setting exists to prevent.
RUN apk add --no-cache tzdata

COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
