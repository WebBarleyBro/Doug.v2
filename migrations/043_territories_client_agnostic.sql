-- Migration 043: Make territories (markets) client-agnostic.
-- Client ownership moves from markets → zones (focus areas).
-- One territory can now hold focus areas for multiple clients.
-- Existing data is preserved: zones are backfilled from their parent market's client_slug.

-- 1. Add client_slug to zones (nullable initially so backfill can run)
ALTER TABLE zones ADD COLUMN IF NOT EXISTS client_slug TEXT REFERENCES clients(slug);

-- 2. Backfill: copy client_slug from parent market into each zone
UPDATE zones z
SET client_slug = m.client_slug
FROM markets m
WHERE z.market_id = m.id
  AND z.client_slug IS NULL
  AND m.client_slug IS NOT NULL;

-- 3. Index for filtering zones by client
CREATE INDEX IF NOT EXISTS idx_zones_client_slug ON zones(client_slug);

-- 4. Make markets.client_slug nullable — territories are now just geography
ALTER TABLE markets ALTER COLUMN client_slug DROP NOT NULL;

-- 5. Drop the old (client_slug, name) unique constraint; territories are unique by name only
ALTER TABLE markets DROP CONSTRAINT IF EXISTS markets_client_slug_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_markets_name_unique ON markets(name);

-- 6. Update markets RLS: portal users can see a territory if any of its zones belong to them
DROP POLICY IF EXISTS "markets_select" ON markets;
CREATE POLICY "markets_select" ON markets FOR SELECT USING (
  get_my_role() IN ('owner', 'admin', 'rep')
  OR (get_my_role() = 'portal' AND EXISTS (
    SELECT 1 FROM zones z
    WHERE z.market_id = markets.id AND z.client_slug = get_my_client_slug()
  ))
);

-- 7. Update zones RLS: use the zone's own client_slug instead of joining through markets
DROP POLICY IF EXISTS "zones_select" ON zones;
CREATE POLICY "zones_select" ON zones FOR SELECT USING (
  get_my_role() IN ('owner', 'admin', 'rep')
  OR (get_my_role() = 'portal' AND client_slug = get_my_client_slug())
);

-- 8. Update zone_target_accounts RLS: use zone's client_slug (one join fewer)
DROP POLICY IF EXISTS "zta_select" ON zone_target_accounts;
CREATE POLICY "zta_select" ON zone_target_accounts FOR SELECT USING (
  get_my_role() IN ('owner', 'admin', 'rep')
  OR (get_my_role() = 'portal' AND EXISTS (
    SELECT 1 FROM zones z
    WHERE z.id = zone_target_accounts.zone_id AND z.client_slug = get_my_client_slug()
  ))
);
