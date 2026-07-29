#!/usr/bin/env node
'use strict';

/**
 * scripts/capture-screenshots.js
 *
 * Captures screenshots of Shiftable for README and wiki documentation.
 * Spins up a local server with rich demo data, takes mobile + desktop
 * screenshots of key pages, and saves them to docs/screenshots/.
 *
 * Usage: node scripts/capture-screenshots.js
 */

const { chromium } = require('playwright');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

const OUT_DIR    = path.join(__dirname, '..', 'docs', 'screenshots');
const DB_PATH    = path.join(os.tmpdir(), 'shiftable-screenshots.db');
const PORT       = 3098;
const BASE       = `http://localhost:${PORT}`;
const SCHEMA     = path.join(__dirname, '../server/db/schema.sql');
const MIGS_DIR   = path.join(__dirname, '../server/db/migrations');

const MOBILE  = { width: 390,  height: 844  };
const DESKTOP = { width: 1440, height: 900  };

// ── Demo users ────────────────────────────────────────────────────────────────

const USERS = {
  admin:   { name: 'Jeremy',  email: 'admin@demo.test',   pin: '111111', role: 'admin'   },
  manager: { name: 'Sarah',   email: 'sarah@demo.test',   pin: '222222', role: 'manager' },
  alex:    { name: 'Alex',    email: 'alex@demo.test',    pin: '333333', role: 'staff'   },
  maya:    { name: 'Maya',    email: 'maya@demo.test',    pin: '444444', role: 'staff'   },
  carlos:  { name: 'Carlos',  email: 'carlos@demo.test',  pin: '555555', role: 'staff'   },
  jordan:  { name: 'Jordan',  email: 'jordan@demo.test',  pin: '666666', role: 'staff'   },
  priya:   { name: 'Priya',   email: 'priya@demo.test',   pin: '777777', role: 'staff'   },
  tyler:   { name: 'Tyler',   email: 'tyler@demo.test',   pin: '888888', role: 'staff'   },
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function getThisMonday() {
  const d = new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Seed database ─────────────────────────────────────────────────────────────

function seedDB() {
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  const db = new Database(DB_PATH);
  // schema.sql is the current complete schema — no migrations needed for a fresh DB
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));

  // App settings
  db.prepare("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('restaurant_name','The Grand Bistro')").run();
  db.prepare("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('max_consecutive_days','5')").run();
  // Flat per-day cost folded into the Est. Labor row alongside the per-group
  // hourly rates, so labor-estimate.png shows both halves of the calculation.
  db.prepare("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('daily_overhead_rate','250')").run();

  // Users
  const ids = {};
  const insUser = db.prepare(
    `INSERT INTO users (name, email, pin_hash, role, is_active) VALUES (?, ?, ?, ?, 1)`
  );
  for (const [key, u] of Object.entries(USERS)) {
    ids[key] = insUser.run(u.name, u.email, bcrypt.hashSync(u.pin, 4), u.role).lastInsertRowid;
  }

  // Groups
  // Hourly rates are what make the Est. Labor row show real numbers rather
  // than $0 across the board — see daily_overhead_rate above.
  const gSrv  = db.prepare("INSERT INTO groups (name,color,hourly_rate) VALUES ('Servers','#3b82f6',16)").run().lastInsertRowid;
  const gBar  = db.prepare("INSERT INTO groups (name,color,hourly_rate) VALUES ('Bartenders','#8b5cf6',18)").run().lastInsertRowid;
  const gHost = db.prepare("INSERT INTO groups (name,color,hourly_rate) VALUES ('Hosts','#10b981',14)").run().lastInsertRowid;

  // Memberships
  const ug = db.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?,?)');
  for (const key of ['alex','maya','carlos','manager']) ug.run(ids[key], gSrv);
  for (const key of ['jordan','priya'])                 ug.run(ids[key], gBar);
  ug.run(ids.tyler, gHost);

  // Shift templates
  const ins = db.prepare(
    "INSERT INTO shift_templates (group_id,name,start_time,hours) VALUES (?,?,?,?)"
  );
  const tSrvLunch  = ins.run(gSrv,  'Lunch',   '11:00', 5).lastInsertRowid;
  const tSrvDinner = ins.run(gSrv,  'Dinner',  '17:00', 6).lastInsertRowid;
  const tBarLunch  = ins.run(gBar,  'Lunch',   '12:00', 5).lastInsertRowid;
  const tBarDinner = ins.run(gBar,  'Dinner',  '17:00', 6).lastInsertRowid;
  const tHostOpen  = ins.run(gHost, 'Opening', '10:00', 4).lastInsertRowid;

  // Coverage rules
  const cr = db.prepare(
    "INSERT INTO coverage_rules (group_id,day_of_week,shift_template_id,min_staff) VALUES (?,?,?,?)"
  );
  for (let d = 0; d < 7; d++) {
    cr.run(gSrv,  d, tSrvLunch,  2);
    cr.run(gSrv,  d, tSrvDinner, 2);
    cr.run(gBar,  d, tBarDinner, 1);
    cr.run(gHost, d, tHostOpen,  1);
  }

  // Dates for the current week
  const mon = getThisMonday();
  const [tue, wed, thu, fri, sat] = [1,2,3,4,5].map(n => addDays(mon, n));

  // Published schedule for this week
  const schedId = db.prepare(
    `INSERT INTO schedules (week_start_date, status, created_by, published_by, published_at)
     VALUES (?, 'published', ?, ?, unixepoch())`
  ).run(mon, ids.manager, ids.manager).lastInsertRowid;

  const sh = db.prepare(
    `INSERT INTO schedule_shifts (schedule_id, user_id, group_id, shift_template_id, date, start_time, hours)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  // Mon
  sh.run(schedId, ids.alex,    gSrv,  tSrvLunch,  mon, '11:00', 5);
  sh.run(schedId, ids.carlos,  gSrv,  tSrvDinner, mon, '17:00', 6);
  sh.run(schedId, ids.jordan,  gBar,  tBarDinner, mon, '17:00', 6);
  sh.run(schedId, ids.tyler,   gHost, tHostOpen,  mon, '10:00', 4);
  // Tue
  sh.run(schedId, ids.maya,    gSrv,  tSrvLunch,  tue, '11:00', 5);
  sh.run(schedId, ids.carlos,  gSrv,  tSrvDinner, tue, '17:00', 6);
  sh.run(schedId, ids.priya,   gBar,  tBarLunch,  tue, '12:00', 5);
  sh.run(schedId, ids.tyler,   gHost, tHostOpen,  tue, '10:00', 4);
  // Wed
  const alexWedShift = sh.run(schedId, ids.alex,   gSrv,  tSrvDinner, wed, '17:00', 6).lastInsertRowid;
  sh.run(schedId, ids.maya,    gSrv,  tSrvLunch,  wed, '11:00', 5);
  sh.run(schedId, ids.jordan,  gBar,  tBarDinner, wed, '17:00', 6);
  sh.run(schedId, ids.priya,   gBar,  tBarLunch,  wed, '12:00', 5);
  sh.run(schedId, ids.tyler,   gHost, tHostOpen,  wed, '10:00', 4);
  // Thu
  sh.run(schedId, ids.alex,    gSrv,  tSrvLunch,  thu, '11:00', 5);
  sh.run(schedId, ids.maya,    gSrv,  tSrvDinner, thu, '17:00', 6);
  sh.run(schedId, ids.carlos,  gSrv,  tSrvLunch,  thu, '11:00', 5);
  sh.run(schedId, ids.priya,   gBar,  tBarDinner, thu, '17:00', 6);
  sh.run(schedId, ids.tyler,   gHost, tHostOpen,  thu, '10:00', 4);
  // Fri
  sh.run(schedId, ids.maya,    gSrv,  tSrvLunch,  fri, '11:00', 5);
  sh.run(schedId, ids.carlos,  gSrv,  tSrvDinner, fri, '17:00', 6);
  sh.run(schedId, ids.jordan,  gBar,  tBarDinner, fri, '17:00', 6);
  sh.run(schedId, ids.priya,   gBar,  tBarLunch,  fri, '12:00', 5);
  sh.run(schedId, ids.tyler,   gHost, tHostOpen,  fri, '10:00', 4);
  // Sat
  sh.run(schedId, ids.alex,    gSrv,  tSrvDinner, sat, '17:00', 6);
  sh.run(schedId, ids.maya,    gSrv,  tSrvDinner, sat, '17:00', 6);
  sh.run(schedId, ids.carlos,  gSrv,  tSrvLunch,  sat, '11:00', 5);
  sh.run(schedId, ids.jordan,  gBar,  tBarDinner, sat, '17:00', 6);

  // Shift note on Alex's Wednesday dinner shift
  db.prepare(`UPDATE schedule_shifts SET note = 'Check in with Sarah before service' WHERE id = ?`).run(alexWedShift);

  // Open swap: Alex offering his Wednesday dinner shift
  db.prepare(
    `INSERT INTO shift_swaps (original_shift_id, requester_id, status, created_at)
     VALUES (?, ?, 'open', unixepoch())`
  ).run(alexWedShift, ids.alex);

  // Open shift for Servers on Tuesday dinner (Alex is free — no published shift that day)
  db.prepare(`
    INSERT INTO open_shifts (group_id, shift_template_id, date, start_time, hours, note, status, created_by, created_at)
    VALUES (?, ?, ?, '17:00', 6, 'Busy evening — coverage needed', 'open', ?, unixepoch())
  `).run(gSrv, tSrvDinner, tue, ids.manager);

  // Pending time-off: Maya requesting Friday
  db.prepare(
    `INSERT INTO time_off_requests (user_id, start_date, end_date, reason, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', unixepoch())`
  ).run(ids.maya, fri, fri, "Doctor's appointment");

  // Pending availability change: Carlos
  db.prepare(
    `INSERT INTO availability (user_id, day_of_week, start_time, end_time, effective_from, status, created_at)
     VALUES (?, 1, '11:00', '23:00', ?, 'pending', unixepoch())`
  ).run(ids.carlos, mon);

  // Notifications for Alex
  const notif = db.prepare(
    `INSERT INTO notifications (user_id, type, title, body, data, created_at)
     VALUES (?, ?, ?, ?, '{}', unixepoch())`
  );
  notif.run(ids.alex, 'schedule_published', 'Schedule published', "This week's schedule is now live.");
  notif.run(ids.alex, 'swap_resolved',      'Swap approved',      'Your swap for Monday has been approved.');

  db.close();
  console.log('✓ Database seeded');
  return ids;
}

// ── Server ────────────────────────────────────────────────────────────────────

function startServer() {
  return new Promise((resolve, reject) => {
    process.env.DB_PATH      = DB_PATH;
    process.env.JWT_SECRET   = 'screenshots-secret';
    process.env.NODE_ENV     = 'production';
    process.env.PORT         = String(PORT);
    process.env.COOKIE_SECURE = 'false';
    process.env.VAPID_PUBLIC_KEY  = 'BNXz1WQ0tzqcGWuPN9I4PRA-RUmUhA3UJmGnqzzn8n69xzNiMb3ZbiNsorXqi2fvO_ahTciqD1jgfKhhYjrOCXU';
    process.env.VAPID_PRIVATE_KEY = 'Y9Fb13JXKSNlh56clXrFSlDft1TUMAU-gLlLOJkxjJg';
    process.env.VAPID_SUBJECT     = 'mailto:demo@shiftable.app';

    // Clear module cache so env vars are picked up fresh
    Object.keys(require.cache).forEach(k => {
      if (k.includes('/server/')) delete require.cache[k];
    });

    const app = require('../server/index.js');
    const server = app.listen(PORT, () => {
      console.log(`✓ Server on port ${PORT}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

// ── Playwright helpers ────────────────────────────────────────────────────────

async function login(page, pin) {
  // Log in via fetch from within the browser context so the httpOnly cookie is set correctly
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const ok = await page.evaluate(async (p) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: p }),
      credentials: 'include',
    });
    return r.ok;
  }, pin);
  if (!ok) throw new Error(`Login failed for PIN ${pin}`);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
}

async function shot(page, filepath, opts = {}) {
  await page.waitForLoadState('networkidle');
  if (opts.scrollTo) await page.evaluate(y => window.scrollTo(0, y), opts.scrollTo);
  await page.waitForTimeout(400);
  await page.screenshot({ path: filepath, fullPage: opts.fullPage || false });
  console.log(`  ✓ ${path.basename(filepath)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const ids    = seedDB();
  const server = await startServer();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  try {
    // ── Mobile context ──────────────────────────────────────────────────────
    console.log('\nMobile screenshots:');
    const mCtx = await browser.newContext({ viewport: MOBILE });
    const mPage = await mCtx.newPage();

    // Login screen
    await mPage.goto(BASE, { waitUntil: 'networkidle' });
    await shot(mPage, `${OUT_DIR}/login.png`);

    // Staff dashboard (Alex)
    await login(mPage, USERS.alex.pin);
    await shot(mPage, `${OUT_DIR}/staff-dashboard.png`);

    // My Week
    await mPage.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
    await shot(mPage, `${OUT_DIR}/my-week.png`);

    // Full week grid — tab inside /schedule
    await mPage.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
    await mPage.getByRole('button', { name: 'Full Grid' }).click();
    await shot(mPage, `${OUT_DIR}/full-week-mobile.png`);

    // Swaps page (Alex sees his open swap)
    await mPage.goto(`${BASE}/swaps`, { waitUntil: 'networkidle' });
    await shot(mPage, `${OUT_DIR}/swaps.png`);

    // Time-off page
    await mPage.goto(`${BASE}/timeoff`, { waitUntil: 'networkidle' });
    await shot(mPage, `${OUT_DIR}/time-off.png`);

    // Notifications (Alex has 2 unread)
    await mPage.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
    await shot(mPage, `${OUT_DIR}/notifications.png`);

    // Availability page
    await mPage.goto(`${BASE}/availability`, { waitUntil: 'networkidle' });
    await shot(mPage, `${OUT_DIR}/availability.png`);

    // Manager dashboard (Sarah)
    await mCtx.clearCookies();
    await login(mPage, USERS.manager.pin);
    await shot(mPage, `${OUT_DIR}/manager-dashboard.png`);

    // Approvals queue
    await mPage.goto(`${BASE}/approvals`, { waitUntil: 'networkidle' });
    await shot(mPage, `${OUT_DIR}/approvals.png`);

    await mCtx.close();

    // ── Desktop context ─────────────────────────────────────────────────────
    console.log('\nDesktop screenshots:');
    const dCtx  = await browser.newContext({ viewport: DESKTOP });
    const dPage = await dCtx.newPage();

    // Schedule builder (Sarah)
    await login(dPage, USERS.manager.pin);
    await dPage.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
    await shot(dPage, `${OUT_DIR}/schedule-builder.png`);

    // Est. Labor row. Captures the whole grid element rather than the tfoot
    // alone — the row on its own is a strip of dollar amounts with nothing to
    // say which day each column is. Rates live on the groups; the +$/day comes
    // from daily_overhead_rate.
    const grid = dPage.locator('table').first();
    await grid.locator('tfoot tr').first().waitFor({ state: 'visible' });
    await grid.screenshot({ path: `${OUT_DIR}/labor-estimate.png` });
    console.log('  ✓ labor-estimate.png');

    // The four ways to start a week. Only rendered when the week has no
    // schedule at all, so step forward off the seeded (published) week.
    // Clipped to the top of the viewport: the buttons sit high on an
    // otherwise empty page, and the full 900px frame is mostly background.
    await dPage.getByRole('button', { name: '›' }).click();
    await dPage.getByText('No schedule for this week').waitFor({ state: 'visible' });
    await dPage.waitForTimeout(400);
    await dPage.screenshot({
      path: `${OUT_DIR}/draft-start-options.png`,
      clip: { x: 0, y: 0, width: DESKTOP.width, height: 440 },
    });
    console.log('  ✓ draft-start-options.png');

    // Full week grid desktop — tab inside /schedule
    await dPage.goto(`${BASE}/schedule`, { waitUntil: 'networkidle' });
    await dPage.getByRole('button', { name: 'Full Grid' }).click();
    await shot(dPage, `${OUT_DIR}/full-week-desktop.png`);

    // Staff management
    await dPage.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
    await shot(dPage, `${OUT_DIR}/staff-management.png`);

    // Admin panel (Jeremy)
    await dCtx.clearCookies();
    await login(dPage, USERS.admin.pin);
    await dPage.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    await shot(dPage, `${OUT_DIR}/admin-panel.png`);

    await dCtx.close();

  } finally {
    await browser.close();
    server.close();
    for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }

  console.log(`\n✓ All screenshots saved to docs/screenshots/`);
  console.log(`  ${fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png')).length} files written\n`);
}

main().catch(err => {
  console.error('Screenshot capture failed:', err.message);
  process.exit(1);
});
