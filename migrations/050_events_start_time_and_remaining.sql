-- Events table is missing start_time and possibly other columns.
-- This is the final catch-all for anything not covered by 048/049.
ALTER TABLE events ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS user_id UUID;

-- Backfill: any existing rows without start_time get created_at as fallback
UPDATE events SET start_time = created_at WHERE start_time IS NULL;
