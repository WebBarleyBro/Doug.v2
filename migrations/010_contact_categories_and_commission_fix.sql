-- Add category column to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS category TEXT;

-- Add missing columns to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10,2);

-- Copy old "total" column → total_amount
UPDATE purchase_orders
SET total_amount = "total"
WHERE (total_amount IS NULL OR total_amount = 0)
  AND "total" IS NOT NULL AND "total" > 0;

-- Backfill category from role where role looks like a known category
UPDATE contacts
SET category = CASE
  WHEN LOWER(role) LIKE '%distrib%' OR LOWER(role) LIKE '%rep%' THEN 'distributor'
  WHEN LOWER(role) LIKE '%buyer%'   THEN 'buyer'
  WHEN LOWER(role) LIKE '%manager%' OR LOWER(role) LIKE '%gm%' THEN 'manager'
  WHEN LOWER(role) LIKE '%owner%'   THEN 'owner'
  WHEN LOWER(role) LIKE '%bar%'     THEN 'bartender'
  WHEN LOWER(role) LIKE '%somm%'    THEN 'sommelier'
  ELSE 'other'
END
WHERE category IS NULL AND role IS NOT NULL;

-- Ensure total_amount is populated from line items (catches any remaining gaps)
-- Old CRM columns: unit_price, cases, bottles, total
UPDATE purchase_orders po
SET total_amount = (
  SELECT COALESCE(
    SUM(COALESCE(
      li.total,
      li.unit_price * (COALESCE(li.cases,0) + COALESCE(li.bottles,0)),
      0
    )),
    0
  )
  FROM po_line_items li
  WHERE li.po_id = po.id
)
WHERE (po.total_amount IS NULL OR po.total_amount = 0)
  AND EXISTS (SELECT 1 FROM po_line_items li WHERE li.po_id = po.id);

-- Backfill commission_amount for all sent/fulfilled orders that still have 0 commission
UPDATE purchase_orders po
SET commission_amount = ROUND(
  COALESCE(po.total_amount, 0) * COALESCE(c.commission_rate, 0),
  2
)
FROM clients c
WHERE c.slug = po.client_slug
  AND (po.commission_amount IS NULL OR po.commission_amount = 0)
  AND COALESCE(po.total_amount, 0) > 0
  AND po.status IN ('sent', 'fulfilled');
