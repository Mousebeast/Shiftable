-- Make users.email optional (drop NOT NULL constraint)
-- SQLite requires full table recreation to modify column constraints

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  pin_hash TEXT,
  role TEXT NOT NULL DEFAULT 'staff',
  min_hours_per_week INTEGER NOT NULL DEFAULT 0,
  max_hours_per_week INTEGER NOT NULL DEFAULT 40,
  claim_token TEXT,
  claim_token_expires_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER,
  phone TEXT,
  ical_token TEXT,
  priority_order INTEGER NOT NULL DEFAULT 0,
  min_shifts_per_week INTEGER,
  max_shifts_per_week INTEGER
);

INSERT INTO users_new (id, name, email, pin_hash, role, min_hours_per_week, max_hours_per_week,
  claim_token, claim_token_expires_at, is_active, created_at, last_login_at,
  phone, ical_token, priority_order, min_shifts_per_week, max_shifts_per_week)
SELECT id, name, email, pin_hash, role, min_hours_per_week, max_hours_per_week,
  claim_token, claim_token_expires_at, is_active, created_at, last_login_at,
  phone, ical_token, priority_order, min_shifts_per_week, max_shifts_per_week
FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_claim_token ON users(claim_token);
CREATE UNIQUE INDEX idx_users_ical_token ON users(ical_token) WHERE ical_token IS NOT NULL;
