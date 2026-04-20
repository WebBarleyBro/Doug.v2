-- Add missing columns to visits table
ALTER TABLE visits ADD COLUMN IF NOT EXISTS tasting_notes TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS feedback TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS competitive_sightings JSONB;
