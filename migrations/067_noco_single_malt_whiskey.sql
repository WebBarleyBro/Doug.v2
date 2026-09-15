-- Add Single Malt Whiskey to NoCo Distillery's catalog.
-- $55.15 per 750ml bottle, 6 bottles per case -> $330.90 per case.
-- Category and bottle size mirror Saffron Gin, which sits at the identical
-- price point and case size.
--
-- NOTE: products has no unique constraint on (client_slug, name), so
-- ON CONFLICT DO NOTHING will NOT stop a duplicate. The guard below does.

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active)
SELECT 'noco-distillery', 'Single Malt Whiskey', 'Second Tier', 330.90, 55.15, '750ml', 6, true
WHERE NOT EXISTS (
  SELECT 1 FROM products
  WHERE client_slug = 'noco-distillery' AND lower(name) = lower('Single Malt Whiskey')
);
