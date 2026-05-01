-- Add discount_amount to purchase_orders for per-order price adjustments.
-- Commission is calculated on the net amount (after discount).
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;

-- Por Lo Bueno: Espadin 750ml, $144/case of 6
INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active)
VALUES ('por-lo-bueno', 'Espadin', 'Mezcal', 144.00, 24.00, '750ml', 6, true)
ON CONFLICT DO NOTHING;
