'use strict';
const _db = require('./db');

function saveSubscription(userId, subscription, db = _db) {
  const { endpoint, keys } = subscription;
  return db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE
      SET user_id = excluded.user_id,
          p256dh  = excluded.p256dh,
          auth    = excluded.auth
  `).run(userId, endpoint, keys.p256dh, keys.auth);
}

function getSubscriptionsForUser(userId, db = _db) {
  return db.prepare(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?'
  ).all(userId);
}

function deleteSubscription(endpoint, db = _db) {
  return db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

function deleteSubscriptionForUser(endpoint, userId, db = _db) {
  return db.prepare(
    'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?'
  ).run(endpoint, userId);
}

module.exports = { saveSubscription, getSubscriptionsForUser, deleteSubscription, deleteSubscriptionForUser };
