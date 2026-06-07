# Updating Shiftable

Updates are applied by running `update.sh` directly on your server. The script handles everything: backing up the database, pulling new code, rebuilding the client, running migrations, and restarting the service.

---

## Checking for updates

The admin panel's **System** tab checks the latest GitHub release automatically. If you're behind, it shows:

```
Update available: v1.2.0
Run: sudo bash /opt/shiftable-<slug>/update.sh
```

You can also check manually at any time from the System tab using the **Check Again** button.

---

## Running the update

SSH into your server and run the command shown in the admin panel:

```bash
sudo bash /opt/shiftable-<slug>/update.sh
```

The script will walk you through 5 steps:

```
[1/5] Backing up database...
  ✓  Backed up to /tmp/shiftable-pre-update-20260601120000.db

[2/5] Pulling latest code...
  ✓  Code updated

[3/5] Building...
  ✓  Build complete

[4/5] Running database migrations...
  ✓  Migrations applied

[5/5] Restarting service...
  ✓  Service restarted

  Updated: v1.1.0 → v1.2.0
```

Press **Enter** to begin, or **Ctrl+C** to cancel before anything changes.

---

## What gets backed up

Before any changes are made, `update.sh` copies your database to `/tmp/shiftable-pre-update-<timestamp>.db`. This backup is kept until you manually remove it.

If anything goes wrong during the update, your data is safe in that file. See [Rolling back](#rolling-back) below.

---

## Downtime

The service restarts once at step 5. On most servers this is under 5 seconds. Staff mid-session will see a brief disconnect and reconnect automatically.

Plan updates for off-peak hours where possible.

---

## Rolling back

If the update causes problems, restore from the pre-update backup:

```bash
# Stop the service
sudo systemctl stop shiftable-<slug>

# Restore the database backup
sudo cp /tmp/shiftable-pre-update-<timestamp>.db /opt/shiftable-<slug>/data/shiftable.db

# Restore the previous code version
cd /opt/shiftable-<slug>
sudo git log --oneline -5   # find the commit before the update
sudo git checkout <previous-commit-hash>
sudo npm install --silent
sudo npm run build --silent
sudo npm prune --omit=dev --silent

# Restart
sudo systemctl start shiftable-<slug>
```

After rolling back, remove the backup file when you're satisfied:

```bash
rm /tmp/shiftable-pre-update-<timestamp>.db
```

---

## What update.sh does NOT do

- It does not make any changes to your `.env` file — your secrets and configuration are preserved
- It does not touch your nginx or systemd configuration
- It does not touch your SSL certificates
- It will not run if not executed as root (`sudo` required)

---

## Staying informed about releases

Watch the [Shiftable GitHub repository](https://github.com/Mousebeast/Shiftable) to be notified of new releases. You can also check the admin panel's System tab at any time.
