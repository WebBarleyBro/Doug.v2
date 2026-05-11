-- Backfill sent_at for orders that were sent/fulfilled but lack a sent_at timestamp
-- Period bucketing for commission uses sent_at; this ensures historical orders count correctly.
UPDATE purchase_orders
  SET sent_at = created_at
  WHERE status IN ('sent', 'fulfilled')
    AND sent_at IS NULL
    AND created_at IS NOT NULL;
