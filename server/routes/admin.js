'use strict';
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { requireAdmin } = require('../middleware/auth');
const {
  getSettings, upsertSetting, getAllUsersAdmin, promoteUser, countActiveAdmins,
  hasPublishedShifts, hardDeleteUser, getLoginHistory, clearExpiredTokens,
} = require('../db/admin');
const { getUserById } = require('../db/users');
const { sendWelcomeEmail } = require('../services/email');
const db = require('../db/db');

const router = express.Router();

const ALLOWED_SETTINGS = [
  'restaurant_name', 'app_url',
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password',
  'twilio_account_sid', 'twilio_auth_token', 'twilio_from_number',
  // NOTE: week_start_day is deliberately absent. Week start is chosen at install
  // time via WEEK_START in .env and read from the environment (see
  // services/dates.js). It must never become runtime-editable: existing
  // schedules, availability, and week_events are all keyed to week-start dates,
  // and every day_of_week column stores an offset from that start, so flipping it
  // after data exists would leave two incompatible keying schemes in the same
  // columns. Install-time only, on an empty database.
  'max_consecutive_days', 'closed_days',
  'scheduler_fill_order', 'day_schedule_priority',
];

// ── Public settings (no auth required) ───────────────────────────────────────

router.get('/settings/public', (req, res) => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'restaurant_name'").get();
  return res.json({ restaurantName: row?.value || 'Shiftable' });
});

// ── Settings ──────────────────────────────────────────────────────────────────

const SECRET_KEYS = new Set(['smtp_password', 'twilio_auth_token']);

router.get('/settings', requireAdmin, (req, res) => {
  const rows = getSettings();
  const settings = Object.fromEntries(
    rows.map(r => [r.key, SECRET_KEYS.has(r.key) ? (r.value ? '***' : '') : r.value])
  );
  return res.json({ settings });
});

router.patch('/settings', requireAdmin, (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return res.status(400).json({ error: 'settings object required' });
  }
  for (const [key, value] of Object.entries(settings)) {
    if (!ALLOWED_SETTINGS.includes(key)) {
      return res.status(400).json({ error: `Unknown setting key: ${key}` });
    }
    if (key === 'max_consecutive_days') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ error: 'max_consecutive_days must be a positive integer' });
      }
    }
    if (key === 'smtp_port') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        return res.status(400).json({ error: 'smtp_port must be a valid port number (1–65535)' });
      }
    }
    upsertSetting(key, String(value));
  }
  const rows = getSettings();
  return res.json({ settings: Object.fromEntries(rows.map(r => [r.key, r.value])) });
});

// ── User management ───────────────────────────────────────────────────────────

router.get('/users', requireAdmin, (req, res) => {
  return res.json({ users: getAllUsersAdmin() });
});

router.patch('/users/:id/role', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const { role } = req.body;
  if (!['staff', 'manager', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'role must be staff, manager, or admin' });
  }
  // Self-change stays blocked: it is the one move that can strand the actor.
  if (targetId === req.user.userId) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  // Demoting an admin is allowed, but never the last one that can still log in.
  // Without this an instance can be left with no admin at all, and there is no
  // vendor to restore access for a self-hosted install.
  if (target.role === 'admin' && role !== 'admin' && countActiveAdmins() <= 1) {
    return res.status(409).json({ error: 'Cannot remove the last admin. Promote another admin first.' });
  }
  promoteUser(targetId, role);
  return res.json({ ok: true });
});

router.get('/users/:id/login-history', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  return res.json({ events: getLoginHistory(targetId) });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (targetId === req.user.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') {
    return res.status(403).json({ error: 'Cannot delete an admin account' });
  }
  if (hasPublishedShifts(targetId)) {
    return res.status(409).json({ error: 'User has shifts in published schedules. Deactivate instead.' });
  }
  hardDeleteUser(targetId);
  return res.json({ ok: true });
});

// ── Backup ────────────────────────────────────────────────────────────────────

router.get('/backup', requireAdmin, (req, res) => {
  if (process.env.DB_PATH === ':memory:') {
    return res.status(503).json({ error: 'Backup not available for in-memory database' });
  }
  const tmp = path.join(os.tmpdir(), `shiftable-backup-${Date.now()}.db`);
  db.backup(tmp)
    .then(() => {
      const filename = `shiftable-backup-${new Date().toISOString().slice(0, 10)}.db`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      const stream = fs.createReadStream(tmp);
      stream.pipe(res);
      stream.on('close', () => fs.unlink(tmp, () => {}));
    })
    .catch(() => res.status(500).json({ error: 'Backup failed' }));
});

// ── System info ───────────────────────────────────────────────────────────────

router.get('/system', requireAdmin, (req, res) => {
  const uptimeSec = Math.floor(process.uptime());
  const h = Math.floor(uptimeSec / 3600);
  const m = Math.floor((uptimeSec % 3600) / 60);
  const s = uptimeSec % 60;
  return res.json({
    nodeVersion: process.version,
    uptime: `${h}h ${m}m ${s}s`,
    uptimeSec,
    platform: os.platform(),
    totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
    freeMemMb: Math.round(os.freemem() / 1024 / 1024),
  });
});

// ── Maintenance ───────────────────────────────────────────────────────────────

router.post('/maintenance/clear-tokens', requireAdmin, (req, res) => {
  const cleared = clearExpiredTokens();
  return res.json({ cleared });
});

// ── Version check ─────────────────────────────────────────────────────────────

function semverGt(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

router.get('/version', requireAdmin, async (req, res) => {
  const pkg = require('../../package.json');
  const current = pkg.version;
  const installDir = path.resolve(process.cwd());

  const repoUrl = typeof pkg.repository === 'string'
    ? pkg.repository
    : (pkg.repository?.url || '');
  const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/);

  if (!match) {
    return res.json({ current, latest: null, updateAvailable: false, installDir });
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${match[1]}/releases/latest`,
      {
        headers: { 'User-Agent': 'Shiftable-UpdateCheck' },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!response.ok) {
      return res.json({ current, latest: null, updateAvailable: false, installDir });
    }
    const data = await response.json();
    const latest = data.tag_name?.replace(/^v/, '') || null;
    const updateAvailable = latest ? semverGt(latest, current) : false;
    return res.json({ current, latest, updateAvailable, installDir });
  } catch {
    return res.json({ current, latest: null, updateAvailable: false, installDir });
  }
});

// ── Staff migration ───────────────────────────────────────────────────────────

router.get('/export-staff', requireAdmin, (req, res) => {
  const groups = db.prepare('SELECT id, name, color, hourly_rate, priority FROM groups ORDER BY id').all();
  const shiftTemplates = db.prepare('SELECT id, group_id, name, start_time, hours FROM shift_templates ORDER BY id').all();
  const coverageRules = db.prepare('SELECT id, group_id, day_of_week, shift_template_id, min_staff FROM coverage_rules ORDER BY id').all();
  const users = db.prepare(
    `SELECT id, name, email, phone, role, min_hours_per_week, max_hours_per_week,
            priority_order, min_shifts_per_week, max_shifts_per_week, is_active
     FROM users WHERE role != 'admin' ORDER BY id`
  ).all();
  const userGroups = db.prepare('SELECT user_id, group_id FROM user_groups ORDER BY user_id').all();
  const fixedSchedules = db.prepare('SELECT id, user_id, day_of_week, shift_template_id FROM fixed_schedules ORDER BY id').all();

  const filename = `shiftable-staff-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  return res.json({ version: 1, exported_at: new Date().toISOString(), groups, shift_templates: shiftTemplates, coverage_rules: coverageRules, users, user_groups: userGroups, fixed_schedules: fixedSchedules });
});

const IMPORT_CLAIM_TTL_SEC = 72 * 60 * 60;

router.post('/import-staff', requireAdmin, (req, res) => {
  const { data } = req.body;
  if (!data || data.version !== 1) {
    return res.status(400).json({ error: 'Invalid staff package — expected version 1 JSON from Export Staff Package.' });
  }

  const existingCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role != 'admin'").get().n;
  if (existingCount > 0) {
    return res.status(409).json({ error: `Import blocked: this instance already has ${existingCount} staff/manager account${existingCount !== 1 ? 's' : ''}. Import is only supported on a fresh installation.` });
  }

  const { groups = [], shift_templates = [], coverage_rules = [], users = [], user_groups = [], fixed_schedules = [] } = data;
  if (!Array.isArray(groups) || !Array.isArray(users)) {
    return res.status(400).json({ error: 'Invalid package structure' });
  }

  try {
    const imported = db.transaction(() => {
      const ig = db.prepare('INSERT INTO groups (id, name, color, hourly_rate, priority) VALUES (?, ?, ?, ?, ?)');
      for (const g of groups) ig.run(g.id, g.name, g.color, g.hourly_rate ?? null, g.priority ?? 0);

      const it = db.prepare('INSERT INTO shift_templates (id, group_id, name, start_time, hours) VALUES (?, ?, ?, ?, ?)');
      for (const t of shift_templates) it.run(t.id, t.group_id, t.name, t.start_time, t.hours);

      const ir = db.prepare('INSERT INTO coverage_rules (id, group_id, day_of_week, shift_template_id, min_staff) VALUES (?, ?, ?, ?, ?)');
      for (const r of coverage_rules) ir.run(r.id, r.group_id, r.day_of_week, r.shift_template_id, r.min_staff);

      const iu = db.prepare(
        `INSERT INTO users (id, name, email, phone, role, min_hours_per_week, max_hours_per_week,
                            priority_order, min_shifts_per_week, max_shifts_per_week, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const u of users) {
        if (u.role === 'admin') continue;
        iu.run(u.id, u.name, u.email ?? null, u.phone ?? null, u.role,
          u.min_hours_per_week ?? 0, u.max_hours_per_week ?? 40,
          u.priority_order ?? 0, u.min_shifts_per_week ?? null, u.max_shifts_per_week ?? null,
          u.is_active ?? 1);
      }

      const iug = db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)');
      for (const ug of user_groups) iug.run(ug.user_id, ug.group_id);

      const ifs = db.prepare('INSERT INTO fixed_schedules (id, user_id, day_of_week, shift_template_id) VALUES (?, ?, ?, ?)');
      for (const fs of fixed_schedules) ifs.run(fs.id, fs.user_id, fs.day_of_week, fs.shift_template_id);

      const now = Math.floor(Date.now() / 1000);
      const setToken = db.prepare('UPDATE users SET claim_token = ?, claim_token_expires_at = ? WHERE id = ?');
      const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'app_url'").get();
      const base = setting?.value || process.env.APP_URL || 'http://localhost:5173';

      return users
        .filter(u => u.role !== 'admin')
        .map(u => {
          const token = randomUUID();
          setToken.run(token, now + IMPORT_CLAIM_TTL_SEC, u.id);
          return { id: u.id, name: u.name, email: u.email ?? null, claimUrl: `${base}/claim?token=${token}` };
        });
    })();

    return res.json({ imported: imported.length, staff: imported });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/resend-claim-emails — bulk resend to all unclaimed active staff
router.post('/resend-claim-emails', requireAdmin, async (req, res) => {
  const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'app_url'").get();
  const base = setting?.value || process.env.APP_URL || 'http://localhost:5173';

  const unclaimed = db.prepare(
    `SELECT id, name, email, claim_token, claim_token_expires_at
     FROM users
     WHERE pin_hash IS NULL AND is_active = 1 AND email IS NOT NULL`
  ).all();

  let sent = 0, failed = 0, skipped = 0;
  for (const user of unclaimed) {
    // Regenerate token if missing or expired
    if (!user.claim_token || user.claim_token_expires_at <= Math.floor(Date.now() / 1000)) {
      const token = randomUUID();
      const expiresAt = Math.floor(Date.now() / 1000) + 72 * 60 * 60;
      db.prepare(`UPDATE users SET claim_token = ?, claim_token_expires_at = ? WHERE id = ?`)
        .run(token, expiresAt, user.id);
      user.claim_token = token;
    }
    try {
      await sendWelcomeEmail(user, `${base}/claim?token=${user.claim_token}`);
      sent++;
    } catch {
      failed++;
    }
  }

  return res.json({ total: unclaimed.length, sent, failed, skipped });
});

router.post('/send-welcome-emails', requireAdmin, async (req, res) => {
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds array required' });
  }
  const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'app_url'").get();
  const base = setting?.value || process.env.APP_URL || 'http://localhost:5173';

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const id of userIds) {
    const user = db.prepare('SELECT id, name, email, claim_token FROM users WHERE id = ?').get(id);
    if (!user?.email || !user?.claim_token) { skipped++; continue; }
    try {
      await sendWelcomeEmail(user, `${base}/claim?token=${user.claim_token}`);
      sent++;
    } catch {
      failed++;
    }
  }
  return res.json({ sent, failed, skipped });
});

module.exports = router;
