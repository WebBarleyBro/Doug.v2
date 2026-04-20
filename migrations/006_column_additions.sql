-- Add client_id FK to existing tables (alongside client_slug for backward compat)
ALTER TABLE visits       ADD COLUMN IF NOT EXISTS client_id  UUID REFERENCES clients(id);
ALTER TABLE visits       ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';
ALTER TABLE placements   ADD COLUMN IF NOT EXISTS client_id  UUID REFERENCES clients(id);
ALTER TABLE placements   ADD COLUMN IF NOT EXISTS price_point DECIMAL(10,2);
ALTER TABLE placements   ADD COLUMN IF NOT EXISTS lost_at    TIMESTAMPTZ;
ALTER TABLE placements   ADD COLUMN IF NOT EXISTS lost_reason TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
ALTER TABLE events       ADD COLUMN IF NOT EXISTS client_id  UUID REFERENCES clients(id);
ALTER TABLE campaigns    ADD COLUMN IF NOT EXISTS client_id  UUID REFERENCES clients(id);
ALTER TABLE contacts     ADD COLUMN IF NOT EXISTS is_decision_maker BOOLEAN DEFAULT false;

-- Backfill client_id from slug
UPDATE visits       v SET client_id = c.id FROM clients c WHERE v.client_slug = c.slug AND v.client_id IS NULL;
UPDATE placements   p SET client_id = c.id FROM clients c WHERE p.client_slug = c.slug AND p.client_id IS NULL;
UPDATE purchase_orders po SET client_id = c.id FROM clients c WHERE po.client_slug = c.slug AND po.client_id IS NULL;
UPDATE events       e SET client_id = c.id FROM clients c WHERE e.client_slug = c.slug AND e.client_id IS NULL;
UPDATE campaigns    cam SET client_id = c.id FROM clients c WHERE cam.client_slug = c.slug AND cam.client_id IS NULL;

-- Fix visit_frequency_days: add if missing, set default, fill nulls
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS visit_frequency_days INTEGER DEFAULT 21;
ALTER TABLE accounts ALTER COLUMN visit_frequency_days SET DEFAULT 21;
UPDATE accounts SET visit_frequency_days = 21 WHERE visit_frequency_days IS NULL OR visit_frequency_days = 0;

-- Add is_decision_maker to contacts if missing
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_decision_maker BOOLEAN DEFAULT false;
