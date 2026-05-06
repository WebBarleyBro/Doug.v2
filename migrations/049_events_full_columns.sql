-- The events table is missing several columns the app expects.
-- Add all of them safely with IF NOT EXISTS.
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'other'
  CHECK (event_type IN ('tasting','brand_dinner','meeting','planned_stop','milestone','training','other'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS account_id UUID;
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_slug TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'planned'
  CHECK (status IN ('planned','completed','cancelled'));

-- Backfill nulls
UPDATE events SET event_type = 'other'  WHERE event_type IS NULL;
UPDATE events SET status     = 'planned' WHERE status IS NULL;
