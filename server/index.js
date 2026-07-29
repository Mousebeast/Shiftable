require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet(process.env.COOKIE_SECURE === 'false' ? { contentSecurityPolicy: false } : {}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── API routes ────────────────────────────────────────────────────────────────
app.post('/api/auth/login', loginLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/swaps', require('./routes/swaps'));
app.use('/api/timeoff', require('./routes/timeoff'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/users', require('./routes/users'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/approvals', require('./routes/approvals'));
app.use('/api/push', require('./routes/push'));
app.use('/api/events', require('./routes/events'));
app.use('/api/open-shifts', require('./routes/openShifts'));
app.use('/api/reports', require('./routes/reports'));

// ── Dynamic manifest ─────────────────────────────────────────────────────────
// Served before static middleware so git pulls never revert the restaurant name.
app.get('/manifest.json', (req, res) => {
  const db = require('./db/db');
  const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'restaurant_name'").get();
  const name = setting?.value || 'Shiftable';
  res.json({
    name,
    short_name: 'Shiftable',
    description: 'Restaurant shift scheduling',
    id: '/',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f172a',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  });
});

// IMPORTANT: All /api routes must be registered above this block.
// The SPA catch-all below intercepts all GET requests in production.

// ── Production static file serving ───────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  const distPath = path.join(__dirname, '../client/dist');
  // index: false is load-bearing. With the default, express.static answers "/"
  // with dist/index.html itself and the catch-all below never runs — so the root
  // URL, which is where most people land, got neither the restaurant name nor the
  // week-start injection while deep links got both.
  app.use(express.static(distPath, { index: false }));

  // SPA catch-all: inject restaurant name into index.html so title/meta tags
  // stay correct across updates (avoids patching source files at install time).
  // The week start is injected the same way rather than fetched, so client
  // modules can read it synchronously at evaluation time — no loading gate and
  // no flash of Monday-ordered day columns on a Sunday-start install.
  const { WEEK_START_DOW } = require('./services/dates');
  app.get('*', (req, res) => {
    const db = require('./db/db');
    const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'restaurant_name'").get();
    const rawName = setting?.value || 'Shiftable';
    const safeName = rawName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const html = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8')
      .replace(/<title>[^<]*<\/title>/, `<title>${safeName}</title>`)
      .replace(/apple-mobile-web-app-title" content="[^"]*"/, `apple-mobile-web-app-title" content="${safeName}"`)
      .replace('<head>', `<head><script>window.__WEEK_START_DOW__=${WEEK_START_DOW};</script>`);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Shiftable server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

module.exports = app;
