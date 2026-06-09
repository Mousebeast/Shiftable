-- Allow multiple group/template rows per event date
CREATE TABLE week_event_coverage_new (
  week_start_date TEXT NOT NULL,
  date TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
  required_staff INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (week_start_date, date, group_id, shift_template_id)
);

INSERT INTO week_event_coverage_new SELECT * FROM week_event_coverage;
DROP TABLE week_event_coverage;
ALTER TABLE week_event_coverage_new RENAME TO week_event_coverage;
CREATE INDEX IF NOT EXISTS idx_week_event_coverage_week ON week_event_coverage(week_start_date);
