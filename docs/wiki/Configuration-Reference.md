# Configuration Reference

Shiftable is configured through two places: the `.env` file (server secrets and infrastructure settings) and the **Admin → Settings** panel (app behaviour that can be changed without a restart).

---

## .env file

Located at `/opt/shiftable-<slug>/.env`. This file is readable only by root and the service user. **Never share or commit this file.**

After editing `.env`, restart the service for changes to take effect:

```bash
sudo systemctl restart shiftable-<slug>
```

### Required variables

| Variable | Description |
|---|---|
| `NODE_ENV` | Always `production` on a live install |
| `PORT` | The internal port Express listens on (nginx proxies to this) |
| `DB_PATH` | Full path to the SQLite database file |
| `JWT_SECRET` | Secret used to sign auth tokens. Never change this on a live install — it will log out all users |
| `VAPID_PUBLIC_KEY` | Web Push public key (generated at install time) |
| `VAPID_PRIVATE_KEY` | Web Push private key. Treat like a password |
| `VAPID_SUBJECT` | `mailto:` address for push notification delivery issues |

### Optional variables

| Variable | Default | Description |
|---|---|---|
| `COOKIE_SECURE` | `true` in production | Set to `false` only for HTTP-only installs or local testing. Must be `true` (or absent) on HTTPS |
| `SMTP_FROM` | `noreply@<domain>` | The "from" address for system emails |

---

## Admin Settings panel

Go to **Admin → Settings** to configure these without restarting.

### General

| Setting | Description |
|---|---|
| **Restaurant Name** | Shown on the login screen, in emails, and in the browser tab |
| **App URL** | The full URL staff use to access the app (e.g. `https://schedule.myrestaurant.com`). Used in email links |

### Email (SMTP)

Shiftable sends emails for two things: welcome / claim links for new staff, and PIN reset emails. Configure your SMTP provider here.

| Setting | Description |
|---|---|
| **SMTP Host** | Your mail server hostname (e.g. `smtp.gmail.com`) |
| **SMTP Port** | Usually `587` (TLS) or `465` (SSL) |
| **SMTP Username** | Your email account username |
| **SMTP Password** | Your email account password or app-specific password |

> **Gmail:** Use an [App Password](https://support.google.com/accounts/answer/185833) with 2FA enabled. Regular passwords don't work with SMTP.
>
> **No SMTP?** Email is optional. Managers can copy claim links manually from the Staff page and send them any way they like (text, WhatsApp, etc.).

### SMS (Twilio)

Optional SMS notifications. Requires a [Twilio](https://www.twilio.com) account with a purchased phone number.

| Setting | Description |
|---|---|
| **Twilio Account SID** | From your Twilio console |
| **Twilio Auth Token** | From your Twilio console |
| **Twilio From Number** | Your Twilio phone number in E.164 format (e.g. `+15551234567`) |

SMS notifications are sent for the same events as push notifications. If both are configured, staff receive both.

### Scheduling

| Setting | Description |
|---|---|
| **Max Consecutive Days** | Maximum days in a row the auto-scheduler will assign to one staff member. Default: 5 |
| **Week Start Day** | The day your schedule week begins. Default: Monday |

---

## Push notifications (VAPID)

VAPID keys are generated automatically at install time and stored in `.env`. You don't need to manage these manually.

If you ever need to regenerate them (e.g. after a security incident), run:

```bash
node -e "const w=require('web-push'); const k=w.generateVAPIDKeys(); console.log('PUBLIC:',k.publicKey); console.log('PRIVATE:',k.privateKey);"
```

Update the values in `.env` and restart the service. **Note:** existing push subscriptions will stop working and staff will need to re-enable notifications the next time they open the app.

---

## Database

The SQLite database lives at the path specified in `DB_PATH`. It's a single file — you can download a backup at any time from **Admin → System → Download Backup**.

The database is not accessible over HTTP. The backup endpoint streams a copy, never the live file.
