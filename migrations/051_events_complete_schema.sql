-- Complete events table schema. Adds every column the app needs.
-- Safe to run even if some columns already exist (IF NOT EXISTS on all).
ALTER TABLE events ADD COLUMN IF NOT EXISTS title       TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type  TEXT DEFAULT 'other';
ALTER TABLE events ADD COLUMN IF NOT EXISTS account_id  UUID;
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_slug TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_id   UUID;
ALTER TABLE events ADD COLUMN IF NOT EXISTS user_id     UUID;
ALTER TABLE events ADD COLUMN IF NOT EXISTS start_time  TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time    TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS notes       TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS url         TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS status      TEXT DEFAULT 'planned';

-- Backfill nulls
UPDATE events SET start_time  = created_at WHERE start_time IS NULL;
UPDATE events SET event_type  = 'other'    WHERE event_type IS NULL;
UPDATE events SET status      = 'planned'  WHERE status     IS NULL;
