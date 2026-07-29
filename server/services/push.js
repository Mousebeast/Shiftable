'use strict';
const webpush = require('web-push');
const { getSubscriptionsForUser, deleteSubscription } = require('../db/push');

const VAPID_CONFIGURED = !!(
  process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_SUBJECT
);

if (VAPID_CONFIGURED) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('[push] VAPID keys not configured — push notifications disabled');
}

async function _sendOne(sub, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      deleteSubscription(sub.endpoint);
    }
  }
}

function sendToUser(userId, payload) {
  if (!VAPID_CONFIGURED) return;
  const subs = getSubscriptionsForUser(userId);
  for (const sub of subs) {
    _sendOne(sub, payload); // intentionally not awaited — fire-and-forget
  }
}

function sendToUsers(userIds, payload) {
  for (const userId of userIds) {
    sendToUser(userId, payload);
  }
}

module.exports = { sendToUser, sendToUsers };
