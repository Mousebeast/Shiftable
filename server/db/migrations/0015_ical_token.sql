ALTER TABLE users ADD COLUMN ical_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ical_token ON users(ical_token) WHERE ical_token IS NOT NULL;
