ALTER TABLE users ADD COLUMN priority_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN min_shifts_per_week INTEGER;
ALTER TABLE users ADD COLUMN max_shifts_per_week INTEGER;
