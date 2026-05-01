-- Complete product catalog refresh with verified pricing from official price sheets.
-- Replaces all previously inserted products for all four clients.
-- Order history is unaffected — po_line_items stores product_name as a text string.

-- ─── Por Lo Bueno ─────────────────────────────────────────────────────────────
-- Removes the incorrect Espadin entry from migration 041.
DELETE FROM products WHERE client_slug = 'por-lo-bueno';

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active) VALUES
  ('por-lo-bueno', 'Espadín (750ml)',  'Mezcal', 144.00,  24.00, '750ml',    6, true),
  ('por-lo-bueno', 'Espadín (1L)',     'Mezcal', 324.00,  27.00, '1 Liter', 12, true),
  ('por-lo-bueno', 'Pachuga',          'Mezcal', 330.00,  55.00, '750ml',    6, true),
  ('por-lo-bueno', 'Cuixe',     'Mezcal', 330.00,  55.00, '750ml',    6, true),
  ('por-lo-bueno', 'Cirial',    'Mezcal', 330.00,  55.00, '750ml',    6, true),
  ('por-lo-bueno', 'Tobalá',    'Mezcal', 330.00,  55.00, '750ml',    6, true),
  ('por-lo-bueno', 'Tepextate', 'Mezcal', 462.00,  77.00, '750ml',    6, true);

-- ─── NoCo Distillery ─────────────────────────────────────────────────────────
DELETE FROM products WHERE client_slug = 'noco-distillery';

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active) VALUES
  -- Ridge Mountain Well (1 Liter, 12-count)
  ('noco-distillery', 'Ridge Mountain Vodka',      'Ridge Mountain Well',  96.00,  8.00, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Gin',        'Ridge Mountain Well', 108.00,  9.00, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Rum',        'Ridge Mountain Well', 108.00,  9.00, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Bourbon',    'Ridge Mountain Well', 192.00, 16.00, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Rye',        'Ridge Mountain Well', 216.00, 18.00, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Irish',      'Ridge Mountain Well', 216.00, 18.00, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Scotch',     'Ridge Mountain Well', 216.00, 18.00, '1 Liter', 12, true),
  -- Second Tier (750ml, 6-count)
  ('noco-distillery', 'Bourbon II',                'Second Tier', 275.70, 45.95, '750ml', 6, true),
  ('noco-distillery', 'Rye',                       'Second Tier', 257.70, 42.95, '750ml', 6, true),
  ('noco-distillery', 'London Dry Gin',            'Second Tier', 241.20, 40.20, '750ml', 6, true),
  ('noco-distillery', 'House Vodka',               'Second Tier', 103.20, 17.20, '750ml', 6, true),
  ('noco-distillery', 'Aged Rum',                  'Second Tier', 255.00, 42.50, '750ml', 6, true),
  ('noco-distillery', 'Saffron Gin',               'Second Tier', 330.90, 55.15, '750ml', 6, true),
  ('noco-distillery', 'Orange Liqueur',            'Second Tier', 161.70, 26.95, '750ml', 6, true),
  ('noco-distillery', 'Peppermint Schnapps',       'Second Tier', 119.70, 19.95, '750ml', 6, true),
  ('noco-distillery', 'Flavored Vodkas',           'Second Tier', 113.70, 18.95, '750ml', 6, true),
  ('noco-distillery', 'Tequila',                   'Second Tier', 359.70, 59.95, '750ml', 6, true),
  ('noco-distillery', 'Aquavit',                   'Second Tier', 287.70, 47.95, '750ml', 6, true),
  -- Ultra Premium (750ml, 6-count)
  ('noco-distillery', 'Ultra Premium Vodka',       'Ultra Premium', 255.00,  42.50, '750ml', 6, true),
  ('noco-distillery', 'Rose Gin',                  'Ultra Premium', 255.00,  42.50, '750ml', 6, true),
  ('noco-distillery', 'Bourbon Barrel Strength',   'Ultra Premium', 390.00,  65.00, '750ml', 6, true),
  ('noco-distillery', 'Rye Barrel Strength',       'Ultra Premium', 390.00,  65.00, '750ml', 6, true),
  ('noco-distillery', 'Bourbon Founders Reserve',  'Ultra Premium', 622.50, 103.75, '750ml', 6, true),
  ('noco-distillery', 'Rye Founders Reserve',      'Ultra Premium', 622.50, 103.75, '750ml', 6, true),
  ('noco-distillery', 'Black Truffle Vodka',       'Ultra Premium', 665.70, 110.95, '750ml', 6, true);

-- ─── Rocky Mountain Moonshine ─────────────────────────────────────────────────
DELETE FROM products WHERE client_slug = 'rocky-mountain-moonshine';

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active) VALUES
  ('rocky-mountain-moonshine', 'Apple Pie',    'Moonshine', 126.00, 21.00, '750ml', 6, true),
  ('rocky-mountain-moonshine', 'Dark Cherry',  'Moonshine', 126.00, 21.00, '750ml', 6, true),
  ('rocky-mountain-moonshine', 'Summer Peach', 'Moonshine', 126.00, 21.00, '750ml', 6, true),
  ('rocky-mountain-moonshine', 'Chocolate',    'Moonshine', 126.00, 21.00, '750ml', 6, true),
  ('rocky-mountain-moonshine', 'Clear',        'Moonshine', 144.00, 24.00, '750ml', 6, true);

-- ─── Sol 2 Noches ─────────────────────────────────────────────────────────────
DELETE FROM products WHERE client_slug = 'sol-2-noches';

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active) VALUES
  ('sol-2-noches', 'Sotol', 'Sotol', 180.00, 30.00, '750ml', 6, true);
