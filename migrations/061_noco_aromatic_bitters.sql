-- Add Aromatic Bitters to NoCo Distillery product catalog
-- 12 bottles per case, $4.99/bottle, $59.88/case

INSERT INTO products (client_slug, name, price, bottle_price, case_count, active)
VALUES ('noco-distillery', 'Aromatic Bitters', 59.88, 4.99, 12, true)
ON CONFLICT DO NOTHING;
