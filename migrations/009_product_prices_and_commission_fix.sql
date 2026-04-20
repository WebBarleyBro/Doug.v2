-- Add price per case to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);

-- Backfill commission_amount for orders where it is null or 0
-- Uses the commission_rate from the clients table
UPDATE purchase_orders po
SET commission_amount = ROUND(
  COALESCE(po.total_amount, po.total, 0) * COALESCE(c.commission_rate, 0),
  2
)
FROM clients c
WHERE c.slug = po.client_slug
  AND (po.commission_amount IS NULL OR po.commission_amount = 0)
  AND (po.total_amount > 0 OR po.total > 0)
  AND po.status IN ('sent', 'fulfilled');
