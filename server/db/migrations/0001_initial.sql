-- Migration 001 — Initial schema baseline
-- Establishes all tables and indexes for the initial TSchedule release.
-- This mirrors schema.sql exactly; subsequent migrations add deltas only.

-- users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  pin_hash TEXT,
  role TEXT NOT NULL DEFAULT 'staff', -- admin | manager | staff
  min_hours_per_week INTEGER NOT NULL DEFAULT 0,
  max_hours_per_week INTEGER NOT NULL DEFAULT 40,
  claim_token TEXT,
  claim_token_expires_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER
);

-- groups
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- user_groups
CREATE TABLE IF NOT EXISTS user_groups (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

-- shift_templates
CREATE TABLE IF NOT EXISTS shift_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL, -- HH:MM 24hr
  hours REAL NOT NULL
);

-- availability
CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL, -- 0=Mon ... 6=Sun
  start_time TEXT NOT NULL, -- HH:MM
  end_time TEXT NOT NULL,   -- HH:MM
  effective_from TEXT NOT NULL, -- ISO date, must be a Monday
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied
  approved_by INTEGER REFERENCES users(id),
  approved_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- time_off_requests
CREATE TABLE IF NOT EXISTS time_off_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL, -- ISO date
  end_date TEXT NOT NULL,   -- ISO date
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied
  manager_note TEXT,
  approved_by INTEGER REFERENCES users(id),
  approved_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- fixed_schedules
CREATE TABLE IF NOT EXISTS fixed_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL, -- 0=Mon ... 6=Sun
  shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
  UNIQUE (user_id, day_of_week)
);

-- schedules
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start_date TEXT NOT NULL UNIQUE, -- ISO date, always a Monday
  status TEXT NOT NULL DEFAULT 'draft', -- draft | published
  created_by INTEGER NOT NULL REFERENCES users(id),
  published_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER
);

-- schedule_shifts
CREATE TABLE IF NOT EXISTS schedule_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  shift_template_id INTEGER REFERENCES shift_templates(id),
  date TEXT NOT NULL, -- ISO date
  start_time TEXT NOT NULL, -- HH:MM
  hours REAL NOT NULL,
  is_fixed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- shift_swaps
CREATE TABLE IF NOT EXISTS shift_swaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_shift_id INTEGER NOT NULL REFERENCES schedule_shifts(id) ON DELETE CASCADE,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  claimer_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open',
  -- open | claimed | auto_approved | pending_manager | manager_approved | denied | cancelled
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  resolved_at INTEGER
);

-- push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  -- schedule_published | swap_offered | swap_resolved | timeoff_resolved
  -- availability_resolved | shift_changed | broadcast
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data TEXT, -- JSON string, deep link context
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- coverage_rules
CREATE TABLE IF NOT EXISTS coverage_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
  min_staff INTEGER NOT NULL DEFAULT 1,
  UNIQUE (group_id, day_of_week, shift_template_id)
);

-- app_settings
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_claim_token ON users(claim_token);
CREATE INDEX IF NOT EXISTS idx_availability_user ON availability(user_id);
CREATE INDEX IF NOT EXISTS idx_time_off_user ON time_off_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_schedule ON schedule_shifts(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_user ON schedule_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
