CREATE TABLE IF NOT EXISTS competitive_sightings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID REFERENCES accounts(id) ON DELETE CASCADE,
  visit_id       UUID REFERENCES visits(id) ON DELETE SET NULL,
  brand_name     TEXT NOT NULL,
  product_name   TEXT,
  placement_type TEXT CHECK (placement_type IN ('well','shelf','menu','cocktail','retail','seasonal')),
  notes          TEXT,
  sighted_at     TIMESTAMPTZ DEFAULT NOW()
);
