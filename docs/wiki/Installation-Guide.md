# Installation Guide

Shiftable installs with a single command on Ubuntu 22.04 or newer. The installer walks you through everything interactively — no config files to edit by hand.

## Requirements

- Ubuntu 22.04+ (or Debian 12+)
- 1 GB RAM minimum (2 GB recommended)
- 10 GB disk space
- Root or sudo access
- An internet connection (to download packages and the app)

The installer will set up Node.js 20, nginx, and all other dependencies automatically.

## Run the installer

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mousebeast/Shiftable/master/install/install.sh)"
```

The installer will ask a series of questions before doing anything. You can press **Ctrl+C** at any point before the final confirmation to cancel.

---

## Installation paths

After entering your restaurant name and admin account details, the installer asks how staff will access Shiftable. Choose the path that matches your setup.

### Option 1 — I have a domain name

Best for: VPS hosting, servers with a static IP and a domain already pointed at it.

The installer will ask for your domain (e.g. `schedule.myrestaurant.com`), configure nginx, and run Certbot to obtain a free SSL certificate automatically.

**Before running the installer:** make sure your domain's DNS A record already points to your server's IP address. Certbot will fail if DNS hasn't propagated yet — the installer will pause and let you try again once it has.

### Option 2 — Set up a free DuckDNS address

Best for: on-premise servers with a static IP and no existing domain.

[DuckDNS](https://www.duckdns.org) provides free subdomains like `myrestaurant.duckdns.org`. The installer will:

1. Guide you through creating a free DuckDNS account (takes ~60 seconds in a browser)
2. Ask for your subdomain name and token
3. Test the credentials live
4. Configure nginx and run Certbot automatically
5. Install a background cron job that keeps your IP updated every 5 minutes

This path gives you full SSL, push notifications, and PWA install — identical to having your own domain.

### Option 3 — Static IP, HTTP only

Best for: local network installs where staff only access Shiftable on the restaurant's WiFi.

The installer will configure nginx on port 80 with no SSL. The app works fully except:
- Push notifications are disabled (require HTTPS)
- "Add to Home Screen" prompts won't appear on Android (require HTTPS)
- iOS PWA install requires manual Safari steps

You can upgrade to HTTPS later — see [Adding SSL later](#adding-ssl-later).

---

## What the installer creates

| Path | Purpose |
|---|---|
| `/opt/shiftable-<slug>/` | Application files |
| `/opt/shiftable-<slug>/data/shiftable.db` | SQLite database |
| `/opt/shiftable-<slug>/.env` | Configuration (secrets, ports, VAPID keys) |
| `/etc/systemd/system/shiftable-<slug>.service` | systemd service |
| `/etc/nginx/sites-available/shiftable-<slug>` | nginx config |
| `/etc/cron.d/shiftable-duckdns-<slug>` | DuckDNS IP updater (Option 2 only) |

The `<slug>` is derived from your restaurant name (e.g. "The Grand Bistro" → `the-grand-bistro`).

## Multiple instances on one server

The installer supports running multiple Shiftable instances on the same server — each on a different subdomain, port, and service. Just run the installer again and choose a different slug when prompted.

## Dev / testing mode

```bash
sudo bash install.sh --dev
```

Dev mode skips HTTPS and sets `COOKIE_SECURE=false`. Use this for local testing only — not for production or public-facing servers.

---

## Adding SSL later

If you installed with HTTP-only mode and later want to add SSL:

1. Point a domain (or set up DuckDNS) at your server's IP
2. Run the domain configuration helper:

```bash
sudo bash /opt/shiftable-<slug>/install/configure-domain.sh
```

This will update nginx and run Certbot. After it completes, edit `.env` to remove `COOKIE_SECURE=false` and restart the service:

```bash
sudo systemctl restart shiftable-<slug>
```

---

## Useful commands after install

```bash
# View live logs
journalctl -u shiftable-<slug> -f

# Restart the service
sudo systemctl restart shiftable-<slug>

# Stop / start
sudo systemctl stop shiftable-<slug>
sudo systemctl start shiftable-<slug>

# Edit configuration
sudo nano /opt/shiftable-<slug>/.env
```
