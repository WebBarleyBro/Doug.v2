-- Add Blackberry Moonshine to Rocky Mountain Moonshine catalog.
-- Add Ridge Mountain Spiced Rum to NoCo Distillery's Ridge Mountain Well line.
-- Reprice existing Ridge Mountain Gin, Ridge Mountain Rum, and House Vodka.

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active)
VALUES ('rocky-mountain-moonshine', 'Blackberry Moonshine', 'Moonshine', 126.00, 21.00, '750ml', 6, true)
ON CONFLICT DO NOTHING;

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active)
VALUES ('noco-distillery', 'Ridge Mountain Spiced Rum', 'Ridge Mountain Well', 138.00, 11.50, '1 Liter', 12, true)
ON CONFLICT DO NOTHING;

UPDATE products
SET price = 120.00, bottle_price = 10.00, case_count = 12
WHERE client_slug = 'noco-distillery' AND name = 'Ridge Mountain Gin';

UPDATE products
SET price = 120.00, bottle_price = 10.00, case_count = 12
WHERE client_slug = 'noco-distillery' AND name = 'Ridge Mountain Rum';

UPDATE products
SET bottle_price = 11.50, price = 11.50 * case_count
WHERE client_slug = 'noco-distillery' AND name = 'House Vodka';
