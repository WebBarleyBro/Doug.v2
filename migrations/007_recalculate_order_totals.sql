-- Fix orders migrated from the old CRM.
-- Old CRM used "total" column; Doug.v2 uses "total_amount".

-- Step 1: Copy old "total" → "total_amount" where total_amount is missing
UPDATE purchase_orders
SET total_amount = "total"
WHERE (total_amount IS NULL OR total_amount = 0)
  AND "total" IS NOT NULL
  AND "total" > 0;

-- Step 2: If total_amount still 0/null, compute from line items
-- (handles orders where line items exist but total wasn't stored)
UPDATE purchase_orders po
SET total_amount = (
  SELECT COALESCE(
    SUM(COALESCE(li.total, li.unit_price * (COALESCE(li.cases,0) + COALESCE(li.bottles,0)), li.price * li.quantity, 0)),
    0
  )
  FROM po_line_items li
  WHERE li.po_id = po.id
)
WHERE (po.total_amount IS NULL OR po.total_amount = 0)
  AND EXISTS (SELECT 1 FROM po_line_items li WHERE li.po_id = po.id);

-- Step 3: Add account_id column if missing
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);
