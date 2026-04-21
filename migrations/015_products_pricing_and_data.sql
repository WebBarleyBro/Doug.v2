-- Add pricing and metadata columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS bottle_price NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS bottle_size TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS case_count INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Rename unit_price to price if price column doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='price') THEN
    ALTER TABLE products RENAME COLUMN unit_price TO price;
  END IF;
END $$;

-- Update existing products with bottle sizes and case counts
UPDATE products SET case_count = 12, bottle_size = '1 Liter' WHERE name ILIKE '%1L%' OR name ILIKE '%1 Liter%';
UPDATE products SET case_count = 6,  bottle_size = '750ml'   WHERE bottle_size IS NULL AND name ILIKE '%750ml%';
UPDATE products SET case_count = 6,  bottle_size = '750ml'   WHERE bottle_size IS NULL;

-- Compute bottle_price from price / case_count for existing products
UPDATE products SET bottle_price = ROUND(price / case_count, 2)
  WHERE bottle_price IS NULL AND price IS NOT NULL AND case_count IS NOT NULL AND case_count > 0;

-- Set all existing products active
UPDATE products SET active = true WHERE active IS NULL;

-- Category: set from name patterns for NoCo products that don't have it yet
UPDATE products SET category = 'Ridge Mountain Well' WHERE client_slug = 'noco-distillery' AND name ILIKE '%(Ridge Mountain)%' AND category IS NULL;
UPDATE products SET category = 'Ultra Premium'        WHERE client_slug = 'noco-distillery' AND (name ILIKE '%Barrel Strength%' OR name ILIKE '%Founders%' OR name ILIKE '%Black Truffle%' OR name ILIKE '%Ultra Premium%' OR name ILIKE '%Rose Gin%') AND category IS NULL;
UPDATE products SET category = 'Second Tier'          WHERE client_slug = 'noco-distillery' AND category IS NULL;
UPDATE products SET category = 'Mezcal'               WHERE client_slug = 'por-lo-bueno' AND category IS NULL;
UPDATE products SET category = 'Moonshine'            WHERE client_slug = 'rocky-mountain-moonshine' AND category IS NULL;
UPDATE products SET category = 'Sotol'                WHERE client_slug = 'sol-2-noches' AND category IS NULL;
