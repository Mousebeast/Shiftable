# Troubleshooting

---

## Installation issues

### The installer fails at "Certbot" step

Certbot requires your domain's DNS to already resolve to your server's IP. If DNS hasn't propagated yet, Certbot will fail.

**Fix:** Wait a few minutes and run Certbot manually:
```bash
sudo certbot --nginx -d yourdomain.com
```

You can also check propagation with:
```bash
dig +short yourdomain.com
```

### DuckDNS returned "KO" during install

The subdomain or token is incorrect.

**Fix:** Re-run the installer and double-check your DuckDNS subdomain (just the name, not the full `.duckdns.org` URL) and token (the UUID shown at the top of the DuckDNS page after signing in).

### "Address already in use" error

Another process is using the default port (3000).

**Fix:** The installer auto-detects an available port. If you're re-running after a partial install, check for a leftover process:
```bash
sudo lsof -ti:3000 | xargs sudo kill -9
```

### Port 80/443 already in use

Another nginx or web server is running.

**Fix:** Check what's using the port:
```bash
sudo ss -tlnp | grep ':80'
```

If it's a previous Shiftable instance, make sure you're using a different subdomain. Multiple instances share the same nginx process — each gets its own server block.

---

## Login issues

### Staff can't log in — "Invalid PIN"

- The staff member may not have claimed their account yet (PIN is set during the claim flow)
- The PIN was entered incorrectly
- The claim token expired before they used it (72 hour limit)

**Fix:** From the Staff page, regenerate their claim link and resend it.

### Staff are logged out frequently

The session cookie has a 12-hour lifetime for staff. If staff are being logged out sooner, it may be a `COOKIE_SECURE` mismatch.

**Fix:** If running over HTTPS, make sure `COOKIE_SECURE=false` is **not** in `.env`. If running over HTTP, make sure `COOKIE_SECURE=false` **is** in `.env`. Restart after changing.

### Login page shows but API calls return 401 immediately after login

The JWT cookie isn't being sent back to the server. This is almost always a `COOKIE_SECURE` mismatch — see above.

---

## Push notifications not working

### "Push notifications require HTTPS"

Push notifications (Web Push API) are a browser security requirement — they only work over HTTPS. HTTP-only installs cannot send push notifications.

**Fix:** Add SSL. See [Installation Guide — Adding SSL later](Installation-Guide#adding-ssl-later).

### Notifications were working and stopped

VAPID keys may have been regenerated, or push subscriptions expired.

**Fix:** Staff need to re-enable notifications. They can do this by opening the app — the subscription is automatically refreshed.

If VAPID keys were changed in `.env`, all existing subscriptions are invalid. Staff must re-enable notifications from their device settings.

---

## Schedule builder issues

### Auto-scheduler generates an empty or sparse schedule

Common causes:
- No staff are assigned to groups
- No shift templates exist for a group
- No coverage rules are set (the scheduler has no targets to fill)
- Staff have no availability set that covers the shift times (no availability = fully available by default, so this is unlikely unless you've already configured it)

**Fix:** Check **Groups** — confirm each group has shift templates, coverage rules, and staff assigned.

### "Coverage gap" warnings after generating

The auto-scheduler couldn't find enough eligible staff for one or more shifts. Possible reasons:
- Not enough staff in the group
- Too many staff have time-off that week
- Staff hour limits prevent further assignment

**Fix:** Review the warnings in the draft, assign staff manually for the flagged shifts.

---

## App appears blank / white screen

### After upgrading or changing server config

Browser cache is serving stale assets.

**Fix:** Open the app in a private/incognito window. If that works, clear the browser cache. On mobile, go to browser site settings and clear data for the Shiftable URL.

### After changing Helmet CSP settings

If you're running in dev/test mode with `contentSecurityPolicy: false` and switch to production settings, assets may fail to load over HTTP.

**Fix:** Ensure HTTPS is configured before enabling production Helmet settings.

---

## Service not starting

Check logs first:
```bash
journalctl -u shiftable-<slug> -n 50
```

Common causes:

| Log message | Fix |
|---|---|
| `JWT_SECRET is required` | `.env` file is missing or not readable by the service user |
| `EADDRINUSE` | Port is in use by another process |
| `Cannot find module` | `npm install` wasn't run, or `node_modules` was deleted |
| `SQLITE_CANTOPEN` | `data/` directory doesn't exist or wrong permissions |

### Permissions fix

```bash
sudo chown -R shiftable-<slug>:shiftable-<slug> /opt/shiftable-<slug>
sudo chmod 640 /opt/shiftable-<slug>/.env
```

---

## DuckDNS IP stopped updating

The cron job that keeps your IP current may have stopped.

**Check the cron log:**
```bash
cat /var/log/shiftable-duckdns-<slug>.log
```

It should say `OK`. If it says `KO` or the file is empty:

**Fix:** Manually test the update URL:
```bash
curl "https://www.duckdns.org/update?domains=<subdomain>&token=<token>&ip="
```

If that returns `OK`, the cron is the issue. Check `/etc/cron.d/shiftable-duckdns-<slug>` exists and the cron service is running:
```bash
sudo systemctl status cron
```

---

## Getting help

If you're stuck, [open an issue on GitHub](https://github.com/Mousebeast/Shiftable/issues) with:
- Your Ubuntu version (`lsb_release -a`)
- The relevant lines from `journalctl -u shiftable-<slug> -n 30`
- Which installation path you used (domain / DuckDNS / HTTP-only)
