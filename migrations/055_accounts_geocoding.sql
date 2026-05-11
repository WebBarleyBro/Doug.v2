-- Add lat/lng to accounts for map view in Territory
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lat FLOAT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lng FLOAT;

CREATE INDEX IF NOT EXISTS idx_accounts_geocoded ON accounts (lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
