-- Track distributor inquiry outreach status separately from order status
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS distributor_status TEXT
    DEFAULT 'not_contacted'
    CHECK (distributor_status IN ('not_contacted', 'contacted', 'confirmed', 'ordered'));

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS distributor_contacted_at TIMESTAMPTZ;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS distributor_notes TEXT;

-- Backfill: any sent/fulfilled distributor order is at least 'contacted'
UPDATE purchase_orders
SET distributor_status = 'contacted'
WHERE (order_type = 'distributor' OR po_number LIKE 'OI-%')
  AND status IN ('sent', 'fulfilled')
  AND (distributor_status IS NULL OR distributor_status = 'not_contacted');

-- Index for dashboard overdue query
CREATE INDEX IF NOT EXISTS idx_po_distributor_status
  ON purchase_orders(distributor_status, distributor_contacted_at)
  WHERE order_type = 'distributor';
