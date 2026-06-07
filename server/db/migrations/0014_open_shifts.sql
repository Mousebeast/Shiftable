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
