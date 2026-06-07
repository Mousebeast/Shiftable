/**
 * server/routes/auth.js — Authentication routes
 *
 * POST   /api/auth/claim   — first-time account activation (claim token + PIN setup)
 * POST   /api/auth/login   — daily PIN login (returns JWT cookie)
 * DELETE /api/auth/logout  — clears the JWT cookie
 */

'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const {
  atomicClaimToken,
  setPinHash,
  getUserById,
  getUserByEmail,
  getActiveUsersWithPin,
  updateLastLogin,
  setClaimToken,
} = require('../db/users');

const db = require('../db/db');
const { authenticate } = require('../middleware/auth');
const { recordLoginEvent } = require('../db/admin');
const { sendPinResetEmail } = require('../services/email');
const { v4: uuidv4 } = require('uuid');

// ── Startup guard ─────────────────────────────────────────────────────────────

if (!process.env.JWT_SECRET) {
  throw new Error('[auth routes] JWT_SECRET environment variable is required');
}

const router = express.Router();

// ── Constants ─────────────────────────────────────────────────────────────────

const PIN_REGEX = /^\d{4,6}$/;
const BCRYPT_COST = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * issueJwt(user)
 * Signs a JWT and returns the token string.
 */
function issueJwt(user) {
  const payload = { userId: user.id, role: user.role, name: user.name };
  const expiresIn = user.role === 'admin' ? '8h' : '12h';
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

/**
 * setCookieAndRespond(res, user)
 * Issues a JWT, sets the httpOnly cookie, and returns the user payload.
 */
function setCookieAndRespond(res, user) {
  const token = issueJwt(user);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
    maxAge: (user.role === 'admin' ? 8 : 12) * 60 * 60 * 1000, // milliseconds
  });
  recordLoginEvent(user.id);
  return res.status(200).json({ user: { id: user.id, name: user.name, role: user.role } });
}

// ── POST /api/auth/claim ──────────────────────────────────────────────────────

/**
 * First-time account activation.
 * Body: { token: string, pin: string }
 *
 * 1. Validate inputs.
 * 2. Atomically claim the token (UPDATE…RETURNING): token is consumed immediately,
 *    preventing TOCTOU races where two concurrent requests both pass a SELECT check.
 * 3. Hash the PIN, set pin_hash, issue JWT.
 */
router.post('/claim', async (req, res) => {
  const { token, pin } = req.body;

  // Input validation
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return res.status(400).json({ error: 'Claim token is required' });
  }
  if (!pin || !PIN_REGEX.test(pin)) {
    return res.status(400).json({ error: 'PIN must be 4–6 digits' });
  }

  // Validate the token exists FIRST — an invalid/consumed token must return 400
  // even if the PIN happens to already be set (e.g. second claim attempt by
  // the same user). This non-destructive lookup lets us return early without
  // burning the token on a PIN-conflict rejection.
  const tokenHolder = db
    .prepare(
      `SELECT id FROM users
       WHERE claim_token = ? AND claim_token_expires_at > unixepoch() AND is_active = 1`
    )
    .get(token.trim());

  if (!tokenHolder) {
    return res.status(400).json({ error: 'Invalid or expired claim token' });
  }

  // Check PIN uniqueness among all active users EXCEPT the token holder
  // (they may already have a PIN from a prior claim attempt on this account).
  const existingUsers = getActiveUsersWithPin().filter(u => u.id !== tokenHolder.id);
  const pinMatches = await Promise.all(
    existingUsers.map(u => bcrypt.compare(pin, u.pin_hash))
  );
  if (pinMatches.some(Boolean)) {
    return res.status(409).json({ error: 'That PIN is already in use — please choose a different one' });
  }

  // Atomically consume the claim token — prevents TOCTOU race.
  // If two concurrent requests race here, only one will get a row back.
  const user = atomicClaimToken(token.trim());
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired claim token' });
  }

  // Hash PIN and persist it (token is already cleared above)
  const pinHash = await bcrypt.hash(pin, BCRYPT_COST);
  setPinHash(user.id, pinHash);
  updateLastLogin(user.id);

  return setCookieAndRespond(res, user);
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

/**
 * Daily PIN login.
 * Body: { pin: string } → JWT cookie
 * Scans all active users with a set PIN. PIN uniqueness is enforced at claim
 * time, so exactly 0 or 1 matches are expected.
 */
router.post('/login', async (req, res) => {
  const { pin } = req.body;

  if (!pin || !PIN_REGEX.test(pin)) {
    return res.status(400).json({ error: 'PIN must be 4–6 digits' });
  }

  const { userId } = req.body;

  const candidates = getActiveUsersWithPin();
  const results = await Promise.all(
    candidates.map(async (u) => {
      const match = await bcrypt.compare(pin, u.pin_hash);
      return match ? u : null;
    })
  );
  const matches = results.filter(Boolean);

  if (matches.length === 0) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  // If a userId is provided (picker re-POST), verify the PIN matches that user.
  if (userId) {
    const picked = matches.find(u => u.id === Number(userId));
    if (!picked) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }
    updateLastLogin(picked.id);
    return setCookieAndRespond(res, picked);
  }

  // Multiple users share the same PIN — return picker list, no cookie.
  if (matches.length > 1) {
    return res.status(200).json({
      needsPicker: true,
      users: matches.map(({ id, name, role }) => ({ id, name, role })),
    });
  }

  // Single match — log in directly.
  updateLastLogin(matches[0].id);
  return setCookieAndRespond(res, matches[0]);
});

// ── POST /api/auth/reset ──────────────────────────────────────────────────────

router.post('/reset', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  // Always respond 200 — never reveal whether an email exists
  const user = getUserByEmail(email.trim().toLowerCase());
  if (user && user.is_active) {
    const token = uuidv4();
    const expiresAt = Math.floor(Date.now() / 1000) + 72 * 60 * 60;
    setClaimToken(user.id, token, expiresAt);
    const appUrl = (() => {
      const db = require('../db/db');
      return db.prepare("SELECT value FROM app_settings WHERE key = 'app_url'").get()?.value || '';
    })();
    const claimUrl = `${appUrl}/claim?token=${token}`;
    sendPinResetEmail(user, claimUrl).catch(() => {});
  }
  return res.json({ ok: true });
});

// ── DELETE /api/auth/logout ───────────────────────────────────────────────────

/**
 * Logout — clears the JWT cookie.
 * No auth required; clearing a cookie is always safe.
 */
router.delete('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
  });
  return res.status(200).json({ message: 'Logged out' });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get('/me', authenticate, (req, res) => {
  const user = getUserById(req.user.userId);
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'User not found or inactive' });
  }
  const db = require('../db/db');
  const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'restaurant_name'").get();
  return res.json({ user: { id: user.id, name: user.name, role: user.role }, restaurantName: setting?.value || 'Shiftable' });
});

module.exports = router;
