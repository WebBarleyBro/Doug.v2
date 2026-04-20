-- Add bottle pricing columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS bottle_price NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS bottle_size TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS case_count INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;

-- Clear existing products (re-seed with correct data)
DELETE FROM products WHERE client_slug IN ('noco-distillery','por-lo-bueno','rocky-mountain-moonshine','sol-2-noches');

-- ── NoCo Distillery — Ridge Mountain Well Products ─────────────────────────
INSERT INTO products (client_slug, name, category, bottle_size, case_count, bottle_price, price, active) VALUES
('noco-distillery', 'Vodka (Well)',         'Ridge Mountain Well', '1 Liter', 12,   8.00,  96.00, true),
('noco-distillery', 'Gin (Well)',            'Ridge Mountain Well', '1 Liter', 12,  10.00, 120.00, true),
('noco-distillery', 'Rum (Well)',            'Ridge Mountain Well', '1 Liter', 12,  10.00, 120.00, true),
('noco-distillery', 'Bourbon (Well)',        'Ridge Mountain Well', '1 Liter', 12,  16.00, 192.00, true),
('noco-distillery', 'Rye (Well)',            'Ridge Mountain Well', '1 Liter', 12,  18.00, 216.00, true),
('noco-distillery', 'Irish (Well)',          'Ridge Mountain Well', '1 Liter', 12,  18.00, 216.00, true),
('noco-distillery', 'Scotch (Well)',         'Ridge Mountain Well', '1 Liter', 12,  18.00, 216.00, true);

-- ── NoCo Distillery — Second Tier ──────────────────────────────────────────
INSERT INTO products (client_slug, name, category, bottle_size, case_count, bottle_price, price, active) VALUES
('noco-distillery', 'Bourbon II',            'Second Tier', '750ml', 6,  45.95, 275.70, true),
('noco-distillery', 'Rye',                   'Second Tier', '750ml', 6,  42.95, 257.70, true),
('noco-distillery', 'London Dry Gin',        'Second Tier', '750ml', 6,  40.20, 241.20, true),
('noco-distillery', 'House Vodka',           'Second Tier', '750ml', 6,  17.20, 103.20, true),
('noco-distillery', 'Aged Rum',              'Second Tier', '750ml', 6,  42.50, 255.00, true),
('noco-distillery', 'Saffron Gin',           'Second Tier', '750ml', 6,  55.15, 330.90, true),
('noco-distillery', 'Orange Liqueur',        'Second Tier', '750ml', 6,  26.95, 161.70, true),
('noco-distillery', 'Peppermint Schnapps',   'Second Tier', '750ml', 6,  19.95, 119.70, true),
('noco-distillery', 'Flavored Vodka',        'Second Tier', '750ml', 6,  18.95, 113.70, true),
('noco-distillery', 'Tokila',                'Second Tier', '750ml', 6,  59.95, 359.70, true),
('noco-distillery', 'Aquavit',               'Second Tier', '750ml', 6,  47.95, 287.70, true);

-- ── NoCo Distillery — Ultra Premium ───────────────────────────────────────
INSERT INTO products (client_slug, name, category, bottle_size, case_count, bottle_price, price, active) VALUES
('noco-distillery', 'Ultra Premium Vodka',       'Ultra Premium', '750ml', 6,  42.50,  255.00, true),
('noco-distillery', 'Rose Gin',                  'Ultra Premium', '750ml', 6,  42.50,  255.00, true),
('noco-distillery', 'Bourbon Barrel Strength',   'Ultra Premium', '750ml', 6,  65.00,  390.00, true),
('noco-distillery', 'Rye Barrel Strength',       'Ultra Premium', '750ml', 6,  65.00,  390.00, true),
('noco-distillery', 'Bourbon Founders Reserve',  'Ultra Premium', '750ml', 6, 103.75,  622.50, true),
('noco-distillery', 'Rye Founders Reserve',      'Ultra Premium', '750ml', 6, 103.75,  622.50, true),
('noco-distillery', 'Black Truffle Vodka',       'Ultra Premium', '750ml', 6, 110.95,  665.70, true);

-- ── Por Lo Bueno ────────────────────────────────────────────────────────────
INSERT INTO products (client_slug, name, category, bottle_size, case_count, bottle_price, price, active) VALUES
('por-lo-bueno', 'Espadín',    'Mezcal', '1 Liter', 12,  27.00, 324.00, true),
('por-lo-bueno', 'Pechuga',    'Mezcal', '750ml',    6,  55.00, 330.00, true),
('por-lo-bueno', 'Cuixe',      'Mezcal', '750ml',    6,  55.00, 330.00, true),
('por-lo-bueno', 'Cirial',     'Mezcal', '750ml',    6,  55.00, 330.00, true),
('por-lo-bueno', 'Tobalá',     'Mezcal', '750ml',    6,  55.00, 330.00, true),
('por-lo-bueno', 'Tepextate',  'Mezcal', '750ml',    6,  77.00, 462.00, true);

-- ── Rocky Mountain Moonshine ────────────────────────────────────────────────
INSERT INTO products (client_slug, name, category, bottle_size, case_count, bottle_price, price, active) VALUES
('rocky-mountain-moonshine', 'Apple Pie',     'Moonshine', '750ml', 6, 21.00, 126.00, true),
('rocky-mountain-moonshine', 'Dark Cherry',   'Moonshine', '750ml', 6, 21.00, 126.00, true),
('rocky-mountain-moonshine', 'Summer Peach',  'Moonshine', '750ml', 6, 21.00, 126.00, true),
('rocky-mountain-moonshine', 'Chocolate',     'Moonshine', '750ml', 6, 21.00, 126.00, true),
('rocky-mountain-moonshine', 'Clear',         'Moonshine', '750ml', 6, 24.00, 144.00, true);

-- ── Sol 2 Noches ────────────────────────────────────────────────────────────
INSERT INTO products (client_slug, name, category, bottle_size, case_count, bottle_price, price, active) VALUES
('sol-2-noches', 'Sotol', 'Sotol', '750ml', 6, 30.00, 180.00, true);
