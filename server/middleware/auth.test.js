'use strict';

// Must be set before require('./auth') — the module throws at load time if missing.
process.env.JWT_SECRET = 'test-secret';

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { authenticate, requireStaff, requireManager, requireAdmin } = require('./auth');

// Use a fixed secret for all tests
const TEST_SECRET = 'test-secret';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal Express app that mounts a single GET /test handler. */
function buildApp(middleware) {
  const app = express();
  app.use(cookieParser());

  const handlers = Array.isArray(middleware) ? middleware : [middleware];

  app.get('/test', ...handlers, (req, res) => {
    res.status(200).json({ user: req.user });
  });

  return app;
}

/** Sign a token with the test secret. */
function sign(payload, options = {}) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: '1h', ...options });
}

/** Return a supertest request with a cookie header containing the given token. */
function withToken(agent, token) {
  return agent.get('/test').set('Cookie', `token=${token}`);
}

// ── authenticate ──────────────────────────────────────────────────────────────

describe('authenticate', () => {
  const app = buildApp(authenticate);

  it('returns 401 when no token cookie is present', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 when token is invalid (bad signature)', async () => {
    const badToken = jwt.sign({ userId: 1, role: 'staff', name: 'Alice' }, 'wrong-secret');
    const res = await withToken(request(app), badToken);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('returns 401 when token is expired', async () => {
    const expiredToken = sign({ userId: 1, role: 'staff', name: 'Alice' }, { expiresIn: '-1s' });
    const res = await withToken(request(app), expiredToken);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('returns 200 and populates req.user when token is valid', async () => {
    const payload = { userId: 1, role: 'staff', name: 'Alice' };
    const token = sign(payload);
    const res = await withToken(request(app), token);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject(payload);
  });
});

// ── requireStaff ──────────────────────────────────────────────────────────────

describe('requireStaff', () => {
  const app = buildApp(requireStaff);

  it('returns 200 for staff role', async () => {
    const token = sign({ userId: 1, role: 'staff', name: 'Alice' });
    const res = await withToken(request(app), token);
    expect(res.status).toBe(200);
  });

  it('returns 200 for manager role', async () => {
    const token = sign({ userId: 2, role: 'manager', name: 'Bob' });
    const res = await withToken(request(app), token);
    expect(res.status).toBe(200);
  });

  it('returns 200 for admin role', async () => {
    const token = sign({ userId: 3, role: 'admin', name: 'Carol' });
    const res = await withToken(request(app), token);
    expect(res.status).toBe(200);
  });

  it('returns 401 for unauthenticated request (no cookie)', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 for a token with a non-existent userId', async () => {
    const token = sign({ userId: 99, role: 'superuser', name: 'X' });
    const res = await withToken(request(app), token);
    expect(res.status).toBe(401);
  });
});

// ── requireManager ────────────────────────────────────────────────────────────

describe('requireManager', () => {
  const app = buildApp(requireManager);

  it('returns 200 for manager role', async () => {
    const token = sign({ userId: 2, role: 'manager', name: 'Bob' });
    const res = await withToken(request(app), token);
    expect(res.status).toBe(200);
  });

  it('returns 200 for admin role', async () => {
    const token = sign({ userId: 3, role: 'admin', name: 'Carol' });
    const res = await withToken(request(app), token);
    expect(res.status).toBe(200);
  });

  it('returns 403 for staff role', async () => {
    const token = sign({ userId: 1, role: 'staff', name: 'Alice' });
    const res = await withToken(request(app), token);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('returns 401 for unauthenticated request (no cookie)', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });
});

// ── requireAdmin ──────────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  const app = buildApp(requireAdmin);

  it('returns 200 for admin role', async () => {
    const token = sign({ userId: 3, role: 'admin', name: 'Carol' });
    const res = await withToken(request(app), token);
    expect(res.status).toBe(200);
  });

  it('returns 403 for staff role', async () => {
    const token = sign({ userId: 1, role: 'staff', name: 'Alice' });
    const res = await withToken(request(app), token);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('returns 403 for manager role', async () => {
    const token = sign({ userId: 2, role: 'manager', name: 'Bob' });
    const res = await withToken(request(app), token);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('returns 401 for unauthenticated request (no cookie)', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });
});
