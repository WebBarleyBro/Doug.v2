-- Category column was already added in migration 010, but ensure it exists with a default
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Backfill nulls to 'general'
UPDATE contacts SET category = 'general' WHERE category IS NULL;
