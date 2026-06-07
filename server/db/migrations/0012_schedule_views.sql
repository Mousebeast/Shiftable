CREATE TABLE IF NOT EXISTS schedule_views (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (schedule_id, user_id)
);
