-- Support multi-brand tasting events by storing an array of client slugs.
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_slugs TEXT[] DEFAULT '{}';

-- Backfill from existing single client_slug so old events still load brands correctly.
UPDATE events
SET client_slugs = ARRAY[client_slug]
WHERE client_slug IS NOT NULL
  AND (client_slugs IS NULL OR client_slugs = '{}');
