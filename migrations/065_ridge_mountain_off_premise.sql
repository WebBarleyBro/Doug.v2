-- Add NoCo Distillery's Ridge Mountain off-premise (retail) product line.
-- Distinct from the existing on-premise "Ridge Mountain Well" line — same spirits,
-- different channel and pricing, so named with an "(Off-Premise)" suffix to keep
-- them unambiguous in order forms (matches the Por Lo Bueno bottle-size precedent).

INSERT INTO products (client_slug, name, category, price, bottle_price, bottle_size, case_count, active) VALUES
  ('noco-distillery', 'Ridge Mountain Gin (Off-Premise)',           'Ridge Mountain Off-Premise', 162.00, 13.50, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Vodka (Off-Premise)',         'Ridge Mountain Off-Premise', 162.00, 13.50, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Clear Rum (Off-Premise)',     'Ridge Mountain Off-Premise', 162.00, 13.50, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Scotch (Off-Premise)',        'Ridge Mountain Off-Premise', 291.60, 24.30, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Rye (Off-Premise)',           'Ridge Mountain Off-Premise', 291.60, 24.30, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Irish Whiskey (Off-Premise)', 'Ridge Mountain Off-Premise', 291.60, 24.30, '1 Liter', 12, true),
  ('noco-distillery', 'Ridge Mountain Bourbon (Off-Premise)',       'Ridge Mountain Off-Premise', 270.00, 22.50, '1 Liter', 12, true)
ON CONFLICT DO NOTHING;
