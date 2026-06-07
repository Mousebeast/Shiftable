-- TSchedule Database Schema
-- Canonical reference. Used by reset.js to recreate the DB from scratch.
-- For incremental changes, add a new file in server/db/migrations/.

-- users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  pin_hash TEXT,
  role TEXT NOT NULL DEFAULT 'staff', -- admin | manager | staff
  min_hours_per_week INTEGER NOT NULL DEFAULT 0,
  max_hours_per_week INTEGER NOT NULL DEFAULT 40,
  priority_order INTEGER NOT NULL DEFAULT 0,
  min_shifts_per_week INTEGER,
  max_shifts_per_week INTEGER,
  phone TEXT,
  claim_token TEXT,
  claim_token_expires_at INTEGER,
  ical_token TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER
);

-- groups
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  hourly_rate REAL,
  priority INTEGER NOT NULL DEFAULT 0,
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
  is_blocked TINYINT NOT NULL DEFAULT 0,
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
  week_start_date TEXT NOT NULL, -- ISO date, always a Monday
  status TEXT NOT NULL DEFAULT 'draft', -- draft | published | archived
  created_by INTEGER NOT NULL REFERENCES users(id),
  published_by INTEGER REFERENCES users(id),
  parent_schedule_id INTEGER REFERENCES schedules(id),
  day_overrides TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_published_per_week
ON schedules(week_start_date) WHERE status = 'published';

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
  note TEXT,
  is_fixed INTEGER NOT NULL DEFAULT 0,
  is_override INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
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

-- login_events
CREATE TABLE IF NOT EXISTS login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_in_at INTEGER NOT NULL DEFAULT (unixepoch())
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

-- schedule_closed_days
CREATE TABLE IF NOT EXISTS schedule_closed_days (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  PRIMARY KEY(schedule_id, date)
);

-- week_events
CREATE TABLE IF NOT EXISTS week_events (
  id INTEGER PRIMARY KEY,
  week_start_date TEXT NOT NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

-- week_event_coverage
CREATE TABLE IF NOT EXISTS week_event_coverage (
  week_start_date TEXT NOT NULL,
  date TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
  required_staff INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (week_start_date, date)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_claim_token ON users(claim_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ical_token ON users(ical_token) WHERE ical_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_availability_user ON availability(user_id);
CREATE INDEX IF NOT EXISTS idx_time_off_user ON time_off_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_schedule ON schedule_shifts(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shifts_user ON schedule_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_sub_endpoint ON push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, logged_in_at);
CREATE INDEX IF NOT EXISTS idx_week_events_week ON week_events(week_start_date);
CREATE INDEX IF NOT EXISTS idx_week_event_coverage_week ON week_event_coverage(week_start_date);

-- open_shifts
CREATE TABLE IF NOT EXISTS open_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  shift_template_id INTEGER REFERENCES shift_templates(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  hours REAL NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  -- open | pending_manager | auto_approved | manager_approved | denied | cancelled
  claimer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_open_shifts_date ON open_shifts(date);
CREATE INDEX IF NOT EXISTS idx_open_shifts_group ON open_shifts(group_id);

-- schedule_views: tracks when staff first view a published schedule (acknowledgment)
CREATE TABLE IF NOT EXISTS schedule_views (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (schedule_id, user_id)
);

-- schedule_templates: named reusable week patterns (manager-saved)
CREATE TABLE IF NOT EXISTS schedule_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- schedule_template_shifts: shifts stored as day_of_week (0=Mon–6=Sun), not dates
CREATE TABLE IF NOT EXISTS schedule_template_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES schedule_templates(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER NOT NULL REFERENCES groups(id),
  shift_template_id INTEGER REFERENCES shift_templates(id),
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  hours REAL NOT NULL
);
