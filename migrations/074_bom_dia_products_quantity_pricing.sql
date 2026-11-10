-- Migration 074: quantity pricing on products, and the Bom Dia Bubbles catalog
-- Run in: Supabase Dashboard → SQL Editor. Re-runnable. Adds a column and rows only;
-- no existing product or order is changed.
--
-- products.price_tiers: optional list of price breaks for one product, e.g.
--   [{"min_cases": 1, "price": 171.36, "bottle_price": 14.28}, {"min_cases": 3, ...}]
-- The order form charges the tier that the number of cases on the line reaches.
-- price / bottle_price stay as the 1-case prices. Products without tiers work as before.

ALTER TABLE products ADD COLUMN IF NOT EXISTS price_tiers JSONB;

-- ─── Bom Dia Bubbles ─────────────────────────────────────────────────────────────────
-- Bottle 750ml, 12 per case:  1–2 cases $171.36 ($14.28/btl) · 3–4 $159.36 ($13.28) · 5+ $144.00 ($12.00)
-- Cans, 24 per case:          1 case   $85.68  ($3.57/can)  · 2–4 $77.04  ($3.21)  · 5+ $72.00  ($3.00)
-- Cans ship either as six 4-packs or as 24 single cans; same price, so one product each.
INSERT INTO products (client_slug, name, price, bottle_price, bottle_size, case_count, active, price_tiers)
SELECT v.client_slug, v.name, v.price, v.bottle_price, v.bottle_size, v.case_count, true, v.price_tiers::jsonb
FROM (VALUES
  ('bom-dia-bubbles', 'Bottle (750ml)', 171.36, 14.28, '750ml', 12,
   '[{"min_cases":1,"price":171.36,"bottle_price":14.28},{"min_cases":3,"price":159.36,"bottle_price":13.28},{"min_cases":5,"price":144.00,"bottle_price":12.00}]'),
  ('bom-dia-bubbles', 'Cans, 4-packs (6 per case)', 85.68, 3.57, 'Can', 24,
   '[{"min_cases":1,"price":85.68,"bottle_price":3.57},{"min_cases":2,"price":77.04,"bottle_price":3.21},{"min_cases":5,"price":72.00,"bottle_price":3.00}]'),
  ('bom-dia-bubbles', 'Cans, singles (24 per case)', 85.68, 3.57, 'Can', 24,
   '[{"min_cases":1,"price":85.68,"bottle_price":3.57},{"min_cases":2,"price":77.04,"bottle_price":3.21},{"min_cases":5,"price":72.00,"bottle_price":3.00}]')
) AS v(client_slug, name, price, bottle_price, bottle_size, case_count, price_tiers)
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.client_slug = v.client_slug AND lower(p.name) = lower(v.name)
);

-- ─── Check (read-only). Expect three rows.
SELECT name, price, bottle_price, case_count, price_tiers FROM products WHERE client_slug = 'bom-dia-bubbles' ORDER BY name;
