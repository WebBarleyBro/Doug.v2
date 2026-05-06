-- Add missing columns to events that are referenced in the app but never migrated
ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'planned'
  CHECK (status IN ('planned', 'completed', 'cancelled'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS url TEXT;

-- Backfill existing rows
UPDATE events SET status = 'planned' WHERE status IS NULL;
