'use strict';
const nodemailer = require('nodemailer');
const { getSettings } = require('../db/admin');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createTransporter() {
  const rows = getSettings();
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  if (!s.smtp_host) return null;
  const port = Number(s.smtp_port) || 587;
  return nodemailer.createTransport({
    host: s.smtp_host,
    port,
    secure: port === 465,
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_password } : undefined,
  });
}

async function sendWelcomeEmail(user, claimUrl) {
  const transporter = createTransporter();
  if (!transporter) return;
  const from = process.env.SMTP_FROM || 'noreply@shiftable.local';
  const safeName = escapeHtml(user.name);
  try {
    await transporter.sendMail({
      from,
      to: user.email,
      subject: 'Welcome to Shiftable — claim your account',
      text: `Hi ${user.name},\n\nYour account is ready. Claim it here (link expires in 72 hours):\n${claimUrl}\n`,
      html: `<p>Hi ${safeName},</p><p>Your account is ready. Click to claim it (expires in 72 hours):</p><p><a href="${claimUrl}">${claimUrl}</a></p>`,
    });
  } catch (err) {
    console.error('[email] sendWelcomeEmail failed:', err.message);
  }
}

async function sendPinResetEmail(user, claimUrl) {
  const transporter = createTransporter();
  if (!transporter) return;
  const from = process.env.SMTP_FROM || 'noreply@shiftable.local';
  const safeName = escapeHtml(user.name);
  try {
    await transporter.sendMail({
      from,
      to: user.email,
      subject: 'Shiftable — reset your PIN',
      text: `Hi ${user.name},\n\nUse this link to reset your PIN (expires in 72 hours):\n${claimUrl}\n`,
      html: `<p>Hi ${safeName},</p><p>Use this link to reset your PIN (expires in 72 hours):</p><p><a href="${claimUrl}">${claimUrl}</a></p>`,
    });
  } catch (err) {
    console.error('[email] sendPinResetEmail failed:', err.message);
  }
}

module.exports = { sendWelcomeEmail, sendPinResetEmail };
