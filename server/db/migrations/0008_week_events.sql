CREATE TABLE week_events (
  id INTEGER PRIMARY KEY,
  week_start_date TEXT NOT NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_week_events_week ON week_events(week_start_date);

CREATE TABLE week_event_coverage (
  week_start_date TEXT NOT NULL,
  date TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
  required_staff INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (week_start_date, date)
);
CREATE INDEX idx_week_event_coverage_week ON week_event_coverage(week_start_date);
