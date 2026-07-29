CREATE TABLE schedule_closed_days (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  PRIMARY KEY(schedule_id, date)
);
