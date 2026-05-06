-- The events table was originally created with a NOT NULL `name` column.
-- The app uses `title` as the canonical column. Make `name` nullable
-- so inserts that only send `title` don't fail the constraint.
-- Backfill `title` from `name` for any existing rows.
ALTER TABLE events ALTER COLUMN name DROP NOT NULL;
UPDATE events SET title = name WHERE title IS NULL AND name IS NOT NULL;
