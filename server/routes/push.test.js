'use strict';
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.VAPID_PUBLIC_KEY = 'test-public-key';

const path = require('path');
const fs = require('fs');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const db = require('../db/db');
db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

const { seedUser } = require('../test/helpers');
const pushRouter = require('./push');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/push', pushRouter);
  return app;
}

function staffToken(id) {
  return jwt.sign({ userId: id, role: 'staff' }, 'test-secret', { expiresIn: '1h' });
}

const SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test123',
  keys: { p256dh: 'p256dhkey', auth: 'authkey' },
};

let app, staff, staff2;
beforeEach(() => {
  db.prepare('DELETE FROM push_subscriptions').run();
  db.prepare('DELETE FROM users').run();
  app = buildApp();
  staff = seedUser(db, { email: 'staff@test.com', role: 'staff' });
  staff2 = seedUser(db, { email: 'staff2@test.com', role: 'staff' });
});

describe('GET /api/push/vapid-key', () => {
  it('returns publicKey for authenticated staff', async () => {
    const res = await request(app)
      .get('/api/push/vapid-key')
      .set('Cookie', `token=${staffToken(staff.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe('test-public-key');
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/push/vapid-key');
    expect(res.status).toBe(401);
  });

  it('returns 503 when VAPID_PUBLIC_KEY is not set', async () => {
    const saved = process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    const res = await request(app)
      .get('/api/push/vapid-key')
      .set('Cookie', `token=${staffToken(staff.id)}`);
    process.env.VAPID_PUBLIC_KEY = saved;
    expect(res.status).toBe(503);
  });
});

describe('POST /api/push/subscribe', () => {
  it('saves subscription and returns ok', async () => {
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Cookie', `token=${staffToken(staff.id)}`)
      .send(SUB);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    const row = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').get(staff.id);
    expect(row.endpoint).toBe(SUB.endpoint);
    expect(row.p256dh).toBe(SUB.keys.p256dh);
    expect(row.auth).toBe(SUB.keys.auth);
  });

  it('upserts on duplicate endpoint (same user)', async () => {
    await request(app)
      .post('/api/push/subscribe')
      .set('Cookie', `token=${staffToken(staff.id)}`)
      .send(SUB);
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Cookie', `token=${staffToken(staff.id)}`)
      .send({ ...SUB, keys: { p256dh: 'newkey', auth: 'newauth' } });
    expect(res.status).toBe(201);
    const rows = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').all(SUB.endpoint);
    expect(rows.length).toBe(1);
    expect(rows[0].p256dh).toBe('newkey');
  });

  it('returns 400 for missing keys', async () => {
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Cookie', `token=${staffToken(staff.id)}`)
      .send({ endpoint: 'https://example.com' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/push/unsubscribe', () => {
  it('deletes subscription by endpoint', async () => {
    db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)')
      .run(staff.id, SUB.endpoint, 'p', 'a');
    const res = await request(app)
      .delete('/api/push/unsubscribe')
      .set('Cookie', `token=${staffToken(staff.id)}`)
      .send({ endpoint: SUB.endpoint });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(SUB.endpoint);
    expect(row).toBeUndefined();
  });

  it('returns 400 for missing endpoint', async () => {
    const res = await request(app)
      .delete('/api/push/unsubscribe')
      .set('Cookie', `token=${staffToken(staff.id)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('does not delete another user\'s subscription', async () => {
    db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)')
      .run(staff.id, SUB.endpoint, 'p', 'a');
    // staff2 tries to delete staff's subscription
    const res = await request(app)
      .delete('/api/push/unsubscribe')
      .set('Cookie', `token=${staffToken(staff2.id)}`)
      .send({ endpoint: SUB.endpoint });
    expect(res.status).toBe(200); // still 200 (idempotent), but subscription must still exist
    const row = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(SUB.endpoint);
    expect(row).toBeTruthy(); // not deleted
  });
});
