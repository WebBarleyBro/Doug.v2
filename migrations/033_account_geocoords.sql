-- Add geocoordinate columns to accounts for map view
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lat FLOAT8;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lng FLOAT8;

CREATE INDEX IF NOT EXISTS idx_accounts_geo ON accounts (lat, lng) WHERE lat IS NOT NULL;
