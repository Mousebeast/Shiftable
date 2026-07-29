# Quickstart

You've just run the installer and Shiftable is live. Here's what to do in the first 10 minutes.

## 1. Sign in as admin

Open your Shiftable URL in a browser and enter the PIN you created during install. You'll land on the dashboard.

## 2. Confirm your restaurant name

Go to **Admin → Settings**. Check that **Restaurant Name** is set correctly — this name appears in emails and on the login screen. Save if you need to change it.

## 3. Set up staff groups

Go to **Groups** from the dashboard. Groups represent your roles (Servers, Bartenders, Hosts, Kitchen, etc.).

For each group:
1. Click **New Group**, give it a name and a colour
2. Add **Shift Templates** — the shifts this group works (e.g. Lunch 11am, 5 hours / Dinner 5pm, 6 hours)
3. Set **Coverage Rules** — minimum staff required per shift per day

Groups and their shift templates are what the auto-scheduler uses to fill a week. Getting these right first saves manual editing later.

## 4. Add your staff

Go to **Staff** from the dashboard. Click **Add Staff Member** for each person.

- Enter their name and email
- The system generates a claim link — copy it or let the welcome email send it
- Staff click the link, set a PIN, and the app installs to their phone automatically

> **Tip:** You can add everyone now and send links later. Staff accounts are inactive until the PIN is claimed.

## 5. Assign staff to groups

Still on the **Staff** page, open each staff member and assign them to one or more groups. This determines which shifts they're eligible for in the auto-scheduler.

## 6. Build your first schedule

Go to **Schedule Builder**. Pick the week, click **Generate Draft**. The auto-scheduler will fill shifts based on:
- Staff group membership
- Availability (none set yet — everyone is fully available by default)
- Coverage rules
- Hour limits per staff member

Review the draft. Click any cell to adjust manually. When you're happy, click **Publish** — staff will receive a push notification that the schedule is live.

## 7. Enable push notifications (optional)

Staff will be prompted to allow notifications when they first open the app. This is required for:
- Schedule published alerts
- Swap request notifications
- Time-off and availability approvals

Push notifications require HTTPS. If you installed with HTTP-only mode, notifications won't work until you add SSL — see [Configuration Reference](Configuration-Reference#adding-ssl-later).

## Next steps

- [Staff Guide](Staff-Guide) — share this with your team
- [Manager Guide](Manager-Guide) — deep dive into scheduling, approvals, and groups
- [Configuration Reference](Configuration-Reference) — SMTP setup for email, advanced settings
