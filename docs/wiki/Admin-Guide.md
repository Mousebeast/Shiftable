# Admin Guide

The admin account has full access to all manager features plus system-level tools: app settings, user role management, database backup, and system information.

Access the admin panel from the **Admin** tile on your dashboard.

---

## Settings

### General settings

**Restaurant Name** — The name shown on the login screen, in emails, and in the browser tab. Set this to your actual restaurant name after install.

**App URL** — The full URL staff use to reach the app. This is used in email links (claim links, PIN reset emails). Set to `https://yourdomain.com`. If you change your domain, update this here.

### Email (SMTP)

Configure outgoing email here. Shiftable sends two types of emails:
- **Welcome email** — sent when a new staff member is added, contains their claim link
- **PIN reset email** — sent when a staff member uses "Forgot PIN"

See [Configuration Reference — Email](Configuration-Reference#email-smtp) for full details and Gmail instructions.

Email is optional. If SMTP isn't configured, managers can copy claim links manually from the Staff page.

### Scheduling defaults

**Max Consecutive Days** — The auto-scheduler won't assign more than this many days in a row to any one staff member. Default is 6.

**Week Start Day** — The day your scheduling week begins. Default is Monday. Change this to Sunday if your payroll week starts on Sunday.

---

## User management

Go to **Admin → Users** for system-level user operations that go beyond what managers can do.

### Changing a user's role

To promote a staff member to manager (or demote a manager back to staff), find them in the Users list and use the **Change Role** dropdown. Roles take effect immediately.

You cannot change another admin's role, and you cannot change your own role.

### Viewing login history

Click the clock icon next to any user to see their recent login history — timestamps and any notable events. Useful for security audits or confirming that a staff member has successfully claimed their account.

### Hard delete

The **Delete** button permanently removes a user from the database. This is blocked if the user has any shifts in a published schedule — use **Deactivate** from the Staff page in that case.

Hard delete is irreversible. Use it only for accounts created in error or for users who have never been scheduled.

---

## Database backup

Go to **Admin → System** and click **Download Backup** to download a copy of the SQLite database.

The backup is a complete snapshot of all data: users, schedules, shifts, swap history, time-off, settings — everything. Store it somewhere safe.

**Recommended practice:** download a backup before:
- Running an update (`update.sh`)
- Making bulk changes to staff or schedules
- Migrating to a new server

The backup endpoint streams a copy of the database — the live file is never touched or served directly.

---

## System information

The **System** tab shows:

- **Version** — your installed version, and the latest available release on GitHub. If an update is available, a badge appears with the exact command to run.
- **Server info** — Node.js version, process uptime, server memory
- **Database size**

### Checking for updates

The version check calls the GitHub releases API and compares the latest published release to your installed version. If you're behind, the panel shows:

```
Update available: v1.2.0
Run: sudo bash /opt/shiftable-<slug>/update.sh
```

Copy and run that command in your server terminal. See [Updating Shiftable](Updating-Shiftable) for the full process.

---

## Maintenance

### Clear expired tokens

**Admin → System → Clear Expired Tokens** removes claim tokens that have passed their 72-hour expiry. This is cosmetic — expired tokens don't grant access — but it keeps the database tidy.

### Log rotation

Shiftable logs through systemd journal. Log retention follows your system's journald configuration (default is typically 1–4 weeks). To view recent logs:

```bash
journalctl -u shiftable-<slug> -n 100
```

To follow logs in real time:

```bash
journalctl -u shiftable-<slug> -f
```
