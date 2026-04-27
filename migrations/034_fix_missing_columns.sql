-- Add sent_at to purchase_orders (was never added — only existed on billing table)
-- Without this, any query selecting sent_at fails silently and commission shows as $0
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Backfill: orders already in 'sent' or 'fulfilled' status get sent_at = created_at
-- so the commission date-filter works for existing data
UPDATE purchase_orders
SET sent_at = created_at
WHERE status IN ('sent', 'fulfilled') AND sent_at IS NULL;

-- Add notes to campaigns (referenced in Campaign type but never migrated)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add name to campaigns if it doesn't exist (some code paths create with 'name', some with 'title')
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS name TEXT;

-- Backfill name from title for existing rows where name is null
UPDATE campaigns SET name = title WHERE name IS NULL AND title IS NOT NULL;
