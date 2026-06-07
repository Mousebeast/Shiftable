'use strict';

const db = require('../db/db');

function getTwilioConfig() {
  const rows = db
    .prepare(`SELECT key, value FROM app_settings WHERE key IN ('twilio_account_sid','twilio_auth_token','twilio_from_number')`)
    .all();
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return cfg;
}

function isConfigured(cfg) {
  return cfg.twilio_account_sid && cfg.twilio_auth_token && cfg.twilio_from_number;
}

async function sendSms(to, body) {
  const cfg = getTwilioConfig();
  if (!isConfigured(cfg)) return;
  if (!to) return;

  try {
    const twilio = require('twilio');
    const client = twilio(cfg.twilio_account_sid, cfg.twilio_auth_token);
    await client.messages.create({ from: cfg.twilio_from_number, to, body });
  } catch (_err) {
    // fire-and-forget — delivery failures are non-fatal
  }
}

async function sendClaimSms(user, claimUrl) {
  const body = `Hi ${user.name}, here's your link to set up your Shiftable account: ${claimUrl}`;
  return sendSms(user.phone, body);
}

async function sendPinResetSms(user, claimUrl) {
  const body = `Hi ${user.name}, here's your link to reset your Shiftable PIN: ${claimUrl}`;
  return sendSms(user.phone, body);
}

module.exports = { sendClaimSms, sendPinResetSms };
