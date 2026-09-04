-- Add Cigar Cut Whiskey, Grape Brandy, and Quadruple Distilled Bourbon to NoCo Distillery product catalog.
-- Quadruple Distilled Bourbon is bottle-only (no case pricing).

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active)
VALUES ('noco-distillery', 'Cigar Cut Whiskey', 'Ultra Premium', 714.00, 119.00, '750ml', 6, true)
ON CONFLICT DO NOTHING;

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active)
VALUES ('noco-distillery', 'Grape Brandy', 'Second Tier', 287.70, 47.95, '750ml', 6, true)
ON CONFLICT DO NOTHING;

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active)
VALUES ('noco-distillery', 'Quadruple Distilled Bourbon', 'Ultra Premium', 0, 250.00, '750ml', NULL, true)
ON CONFLICT DO NOTHING;
