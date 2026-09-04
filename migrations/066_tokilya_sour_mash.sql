-- Add Tokilya Sour Mash to NoCo Distillery's catalog.

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active)
VALUES ('noco-distillery', 'Tokilya Sour Mash', 'Specialty', 443.40, 36.95, '1 Liter', 12, true)
ON CONFLICT DO NOTHING;
