'use strict';
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { requireAdmin } = require('../middleware/auth');
const {
  getSettings, upsertSetting, getAllUsersAdmin, promoteUser,
  hasPublishedShifts, hardDeleteUser, getLoginHistory, clearExpiredTokens,
} = require('../db/admin');
const { getUserById } = require('../db/users');
const db = require('../db/db');

const router = express.Router();

const ALLOWED_SETTINGS = [
  'restaurant_name', 'app_url',
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password',
  'twilio_account_sid', 'twilio_auth_token', 'twilio_from_number',
  'max_consecutive_days', 'week_start_day',
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
  if (!['staff', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'role must be staff or manager' });
  }
  if (targetId === req.user.userId) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') {
    return res.status(403).json({ error: 'Cannot change admin role' });
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

module.exports = router;
