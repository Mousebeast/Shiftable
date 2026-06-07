-- SQLite requires full table recreation to remove a column-level UNIQUE constraint.
-- Note: transaction is managed by the migration runner; no BEGIN/COMMIT here.
PRAGMA foreign_keys = OFF;

CREATE TABLE schedules_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by INTEGER NOT NULL REFERENCES users(id),
  published_by INTEGER REFERENCES users(id),
  parent_schedule_id INTEGER REFERENCES schedules(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER
);

INSERT INTO schedules_new
  (id, week_start_date, status, created_by, published_by, parent_schedule_id, created_at, published_at)
SELECT id, week_start_date, status, created_by, published_by, NULL, created_at, published_at
FROM schedules;

DROP TABLE schedules;
ALTER TABLE schedules_new RENAME TO schedules;

-- At most one published schedule per week (drafts and archived rows are unconstrained).
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_published_per_week
ON schedules(week_start_date) WHERE status = 'published';

PRAGMA foreign_key_check;

PRAGMA foreign_keys = ON;
