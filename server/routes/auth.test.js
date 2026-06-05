/**
 * auth.test.js — Integration tests for POST /api/auth/claim,
 *                POST /api/auth/login, DELETE /api/auth/logout
 *
 * Uses a real in-memory SQLite DB (no mocks).
 * DB_PATH=':memory:' is set before any module is required so that
 * the db.js singleton opens an in-memory database for the whole test run.
 */

'use strict';

// ── Environment setup (must come before any require of db.js) ─────────────────
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret-for-auth-tests';
process.env.NODE_ENV = 'test';

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// ── Shared in-memory DB + schema ──────────────────────────────────────────────
// Require db ONCE. All subsequent requires of './db' will get the same singleton.
const db = require('../db/db');

const schemaPath = path.join(__dirname, '../db/schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

// ── Import helpers and router AFTER db is initialised ────────────────────────
const {
  atomicClaimToken,
  getUserById,
  getActiveUsersWithPin,
  updateLastLogin,
} = require('../db/users');

const { createTestDb, seedUser, PIN_HASH_1234 } = require('../test/helpers');

const authRouter = require('./auth');

// ── Build a minimal test app ──────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  return app;
}

const app = buildApp();

// ── Test data ─────────────────────────────────────────────────────────────────
const VALID_PIN = '123456';
const VALID_PIN_HASH = bcrypt.hashSync(VALID_PIN, 4); // cost 4 — fast in tests

const ALT_PIN = '654321';
const ALT_PIN_HASH = bcrypt.hashSync(ALT_PIN, 4);

const SHARED_PIN = '999999';
const SHARED_PIN_HASH = bcrypt.hashSync(SHARED_PIN, 4);

// Future Unix timestamp (claim token not yet expired)
const FUTURE_EXPIRY = Math.floor(Date.now() / 1000) + 3600;
// Past Unix timestamp (claim token expired)
const PAST_EXPIRY = Math.floor(Date.now() / 1000) - 3600;

// ── Seed helpers ──────────────────────────────────────────────────────────────

/**
 * Insert a user row directly into the in-memory DB and return its id.
 */
function insertUser({ name, email, role = 'staff', pinHash = null, claimToken = null, claimTokenExpiresAt = null, isActive = 1 }) {
  const result = db
    .prepare(
      `INSERT INTO users (name, email, role, pin_hash, claim_token, claim_token_expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, email, role, pinHash, claimToken, claimTokenExpiresAt, isActive);
  return result.lastInsertRowid;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  // Wipe users table before each test so tests are fully independent
  db.prepare('DELETE FROM users').run();
  // Reset autoincrement counter (best-effort; SQLite only resets if table is empty)
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'users'").run();
});

// ── POST /api/auth/claim ──────────────────────────────────────────────────────

describe('POST /api/auth/claim', () => {
  it('returns 400 when token is missing', async () => {
    const res = await request(app).post('/api/auth/claim').send({ pin: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/token/i);
  });

  it('returns 400 when token is an empty string', async () => {
    const res = await request(app).post('/api/auth/claim').send({ token: '  ', pin: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/token/i);
  });

  it('returns 400 when pin is missing', async () => {
    const res = await request(app).post('/api/auth/claim').send({ token: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pin/i);
  });

  it('returns 400 when pin has fewer than 4 digits', async () => {
    const res = await request(app).post('/api/auth/claim').send({ token: 'abc', pin: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pin/i);
  });

  it('returns 400 when pin has more than 6 digits', async () => {
    const res = await request(app).post('/api/auth/claim').send({ token: 'abc', pin: '1234567' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pin/i);
  });

  it('returns 400 when pin contains non-digit characters', async () => {
    const res = await request(app).post('/api/auth/claim').send({ token: 'abc', pin: '12ab56' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pin/i);
  });

  it('returns 400 for an unknown claim token', async () => {
    const res = await request(app)
      .post('/api/auth/claim')
      .send({ token: 'no-such-token', pin: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('returns 400 for an expired claim token', async () => {
    insertUser({
      name: 'Expired User',
      email: 'expired@example.com',
      claimToken: 'expired-token',
      claimTokenExpiresAt: PAST_EXPIRY,
    });

    const res = await request(app)
      .post('/api/auth/claim')
      .send({ token: 'expired-token', pin: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('returns 200 and sets a JWT cookie on valid claim', async () => {
    insertUser({
      name: 'Alice',
      email: 'alice@example.com',
      claimToken: 'valid-token',
      claimTokenExpiresAt: FUTURE_EXPIRY,
    });

    const res = await request(app)
      .post('/api/auth/claim')
      .send({ token: 'valid-token', pin: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Alice', role: 'staff' });

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
  });

  it('clears the claim token after successful claim (single-use)', async () => {
    insertUser({
      name: 'Bob',
      email: 'bob@example.com',
      claimToken: 'use-once-token',
      claimTokenExpiresAt: FUTURE_EXPIRY,
    });

    // First claim — should succeed
    const first = await request(app)
      .post('/api/auth/claim')
      .send({ token: 'use-once-token', pin: '123456' });
    expect(first.status).toBe(200);

    // Second claim with same token — should fail
    const second = await request(app)
      .post('/api/auth/claim')
      .send({ token: 'use-once-token', pin: '123456' });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/invalid or expired/i);
  });

  it('atomicClaimToken prevents TOCTOU: second call with the same token returns undefined', () => {
    // Insert a user with a valid claim token
    insertUser({
      name: 'Toctou',
      email: 'toctou@example.com',
      claimToken: 'race-token',
      claimTokenExpiresAt: FUTURE_EXPIRY,
    });

    // First atomic call consumes the token and returns the user row
    const firstResult = atomicClaimToken('race-token', db);
    expect(firstResult).toBeDefined();
    expect(firstResult.name).toBe('Toctou');

    // Second atomic call with the same token finds no matching row (already cleared)
    const secondResult = atomicClaimToken('race-token', db);
    expect(secondResult).toBeUndefined();
  });

  it('returns 400 for a claim token belonging to an inactive user', async () => {
    insertUser({
      name: 'Inactive',
      email: 'inactive@example.com',
      claimToken: 'inactive-token',
      claimTokenExpiresAt: FUTURE_EXPIRY,
      isActive: 0,
    });

    const res = await request(app)
      .post('/api/auth/claim')
      .send({ token: 'inactive-token', pin: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 400 when pin is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pin/i);
  });

  it('returns 400 when pin format is invalid', async () => {
    const res = await request(app).post('/api/auth/login').send({ pin: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pin/i);
  });

  it('returns 401 for a PIN that matches no user', async () => {
    const res = await request(app).post('/api/auth/login').send({ pin: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid pin/i);
  });

  it('returns 200 and sets a JWT cookie for a correct PIN (single match)', async () => {
    insertUser({ name: 'Carol', email: 'carol@example.com', pinHash: VALID_PIN_HASH });

    const res = await request(app).post('/api/auth/login').send({ pin: VALID_PIN });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Carol', role: 'staff' });
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
  });

  it('returns needsPicker when multiple users share the same PIN', async () => {
    insertUser({ name: 'Dave', email: 'dave@example.com', pinHash: SHARED_PIN_HASH });
    insertUser({ name: 'Eve', email: 'eve@example.com', pinHash: SHARED_PIN_HASH });

    const res = await request(app).post('/api/auth/login').send({ pin: SHARED_PIN });

    expect(res.status).toBe(200);
    expect(res.body.needsPicker).toBe(true);
    expect(res.body.users).toHaveLength(2);
    const names = res.body.users.map((u) => u.name);
    expect(names).toContain('Dave');
    expect(names).toContain('Eve');
    // No cookie should be set when picker is returned
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some((c) => c.startsWith('token='))).toBe(false);
  });

  it('does not include pin_hash in the needsPicker users list', async () => {
    insertUser({ name: 'Frank', email: 'frank@example.com', pinHash: SHARED_PIN_HASH });
    insertUser({ name: 'Grace', email: 'grace@example.com', pinHash: SHARED_PIN_HASH });

    const res = await request(app).post('/api/auth/login').send({ pin: SHARED_PIN });
    expect(res.status).toBe(200);
    expect(res.body.needsPicker).toBe(true);
    res.body.users.forEach((u) => {
      expect(u).not.toHaveProperty('pin_hash');
    });
  });

  it('returns 200 + JWT after picker re-POST with { pin, userId }', async () => {
    const id = insertUser({ name: 'Heidi', email: 'heidi@example.com', pinHash: VALID_PIN_HASH });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ pin: VALID_PIN, userId: id });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Heidi', role: 'staff' });
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
  });

  it('returns 401 for correct PIN but wrong userId', async () => {
    insertUser({ name: 'Ivan', email: 'ivan@example.com', pinHash: VALID_PIN_HASH });
    const otherId = insertUser({ name: 'Judy', email: 'judy@example.com', pinHash: ALT_PIN_HASH });

    // VALID_PIN belongs to Ivan; try to log in as Judy (who has ALT_PIN)
    const res = await request(app)
      .post('/api/auth/login')
      .send({ pin: VALID_PIN, userId: otherId });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid pin/i);
  });

  it('returns 401 for a userId that does not exist', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ pin: VALID_PIN, userId: 99999 });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid pin/i);
  });

  it('does not log in an inactive user even with a correct PIN', async () => {
    const id = insertUser({
      name: 'Karl',
      email: 'karl@example.com',
      pinHash: VALID_PIN_HASH,
      isActive: 0,
    });

    // Via userId path
    const res = await request(app)
      .post('/api/auth/login')
      .send({ pin: VALID_PIN, userId: id });
    expect(res.status).toBe(401);
  });

  it('issues an 8-hour JWT for admin role', async () => {
    const jwt = require('jsonwebtoken');
    insertUser({
      name: 'Laura',
      email: 'laura@example.com',
      role: 'admin',
      pinHash: VALID_PIN_HASH,
    });

    const res = await request(app).post('/api/auth/login').send({ pin: VALID_PIN });
    expect(res.status).toBe(200);

    const cookieHeader = res.headers['set-cookie'].find((c) => c.startsWith('token='));
    const tokenValue = cookieHeader.split(';')[0].replace('token=', '');
    const decoded = jwt.verify(tokenValue, process.env.JWT_SECRET);
    const duration = decoded.exp - decoded.iat;
    // 8 hours = 28800 seconds (allow ±5s for test timing)
    expect(duration).toBeCloseTo(28800, -1);
  });

  it('issues a 12-hour JWT for staff role', async () => {
    const jwt = require('jsonwebtoken');
    insertUser({
      name: 'Mike',
      email: 'mike@example.com',
      role: 'staff',
      pinHash: VALID_PIN_HASH,
    });

    const res = await request(app).post('/api/auth/login').send({ pin: VALID_PIN });
    expect(res.status).toBe(200);

    const cookieHeader = res.headers['set-cookie'].find((c) => c.startsWith('token='));
    const tokenValue = cookieHeader.split(';')[0].replace('token=', '');
    const decoded = jwt.verify(tokenValue, process.env.JWT_SECRET);
    const duration = decoded.exp - decoded.iat;
    // 12 hours = 43200 seconds
    expect(duration).toBeCloseTo(43200, -1);
  });
});

// ── DELETE /api/auth/logout ───────────────────────────────────────────────────

describe('DELETE /api/auth/logout', () => {
  it('returns 200 with a logged-out message', async () => {
    const res = await request(app).delete('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });

  it('clears the token cookie', async () => {
    const res = await request(app).delete('/api/auth/logout');
    const cookies = res.headers['set-cookie'] || [];
    // The Set-Cookie header should contain a token= directive that expires it
    const tokenCookie = cookies.find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();
    // clearCookie sets an empty value and past expiry
    expect(tokenCookie).toMatch(/token=;/);
  });

  it('succeeds even when no token cookie is present (no auth required)', async () => {
    const res = await request(app).delete('/api/auth/logout');
    expect(res.status).toBe(200);
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns 401 with no cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns user when valid JWT cookie present', async () => {
    const id = insertUser({ name: 'Test User', email: 'test@example.com', pinHash: VALID_PIN_HASH });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ pin: VALID_PIN, userId: id });

    const cookie = loginRes.headers['set-cookie'];

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(id);
    expect(res.body.user.name).toBe('Test User');
    expect(res.body.user.role).toBe('staff');
  });
});
