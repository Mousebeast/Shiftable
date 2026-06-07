CREATE TABLE schedule_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE schedule_template_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES schedule_templates(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER NOT NULL REFERENCES groups(id),
  shift_template_id INTEGER REFERENCES shift_templates(id),
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  hours REAL NOT NULL
);
