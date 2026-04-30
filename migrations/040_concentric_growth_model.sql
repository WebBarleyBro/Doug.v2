-- Concentric Growth Model: markets, zones, target sets, product qualifications,
-- and metric snapshots. Posture is always set manually by the user; nothing in
-- this schema auto-changes a zone's posture.

-- ─── client_settings: supply headroom field ───────────────────────────────────
-- available_cases_90d is manually entered by the owner; used to compute
-- Supply Headroom (informational warning only — never blocks any action).
ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS available_cases_90d NUMERIC;

-- ─── markets ─────────────────────────────────────────────────────────────────
-- Contiguous geographic territories where a client has presence or intent to grow.
CREATE TABLE IF NOT EXISTS markets (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  client_slug                 TEXT NOT NULL,
  priority                    BOOLEAN NOT NULL DEFAULT FALSE,
  cities                      TEXT[] DEFAULT '{}',
  counties                    TEXT[] DEFAULT '{}',
  states                      TEXT[] DEFAULT '{}',
  zip_codes                   TEXT[] DEFAULT '{}',
  default_reach_threshold     NUMERIC NOT NULL DEFAULT 55
                                CHECK (default_reach_threshold BETWEEN 0 AND 100),
  default_retention_threshold NUMERIC NOT NULL DEFAULT 65
                                CHECK (default_retention_threshold BETWEEN 0 AND 100),
  notes                       TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_slug, name)
);
CREATE INDEX IF NOT EXISTS idx_markets_client   ON markets(client_slug);
CREATE INDEX IF NOT EXISTS idx_markets_priority ON markets(priority) WHERE priority = TRUE;

ALTER TABLE markets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "markets_select" ON markets;
CREATE POLICY "markets_select" ON markets FOR SELECT USING (
  get_my_role() IN ('owner', 'admin', 'rep')
  OR (get_my_role() = 'portal' AND client_slug = get_my_client_slug())
);
DROP POLICY IF EXISTS "markets_insert" ON markets;
CREATE POLICY "markets_insert" ON markets FOR INSERT
  WITH CHECK (get_my_role() IN ('owner', 'admin'));
DROP POLICY IF EXISTS "markets_update" ON markets;
CREATE POLICY "markets_update" ON markets FOR UPDATE
  USING (get_my_role() IN ('owner', 'admin'));
DROP POLICY IF EXISTS "markets_delete" ON markets;
CREATE POLICY "markets_delete" ON markets FOR DELETE
  USING (get_my_role() IN ('owner', 'admin'));

-- ─── zones ───────────────────────────────────────────────────────────────────
-- A Phase crossed with a channel within a Market.
-- posture is always set manually; no code path auto-changes it.
CREATE TABLE IF NOT EXISTS zones (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id               UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  channel                 TEXT NOT NULL CHECK (channel IN ('on_premise', 'off_premise', 'both')),
  phase                   INTEGER NOT NULL DEFAULT 1 CHECK (phase >= 1),
  posture                 TEXT NOT NULL DEFAULT 'opportunistic'
                            CHECK (posture IN ('active', 'maintaining', 'monitoring', 'opportunistic')),
  reach_threshold         NUMERIC CHECK (reach_threshold IS NULL OR reach_threshold BETWEEN 0 AND 100),
  velocity_target         NUMERIC NOT NULL CHECK (velocity_target > 0),
  retention_threshold     NUMERIC CHECK (retention_threshold IS NULL OR retention_threshold BETWEEN 0 AND 100),
  projected_monthly_cases NUMERIC,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(market_id, name)
);
CREATE INDEX IF NOT EXISTS idx_zones_market  ON zones(market_id);
CREATE INDEX IF NOT EXISTS idx_zones_posture ON zones(posture);
CREATE INDEX IF NOT EXISTS idx_zones_phase   ON zones(phase);

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zones_select" ON zones;
CREATE POLICY "zones_select" ON zones FOR SELECT USING (
  get_my_role() IN ('owner', 'admin', 'rep')
  OR (get_my_role() = 'portal' AND EXISTS (
    SELECT 1 FROM markets m
    WHERE m.id = zones.market_id AND m.client_slug = get_my_client_slug()
  ))
);
DROP POLICY IF EXISTS "zones_insert" ON zones;
CREATE POLICY "zones_insert" ON zones FOR INSERT
  WITH CHECK (get_my_role() IN ('owner', 'admin'));
DROP POLICY IF EXISTS "zones_update" ON zones;
CREATE POLICY "zones_update" ON zones FOR UPDATE
  USING (get_my_role() IN ('owner', 'admin'));
DROP POLICY IF EXISTS "zones_delete" ON zones;
CREATE POLICY "zones_delete" ON zones FOR DELETE
  USING (get_my_role() IN ('owner', 'admin'));

-- ─── zone_target_accounts ────────────────────────────────────────────────────
-- The manually-curated Target Set for a Zone. Soft-deleted via removed_at.
-- Active membership = removed_at IS NULL.
-- A removed account can be re-added (the partial unique index only covers active rows).
CREATE TABLE IF NOT EXISTS zone_target_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id        UUID NOT NULL REFERENCES zones(id)    ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  added_at       TIMESTAMPTZ DEFAULT NOW(),
  added_by       TEXT,
  removed_at     TIMESTAMPTZ,
  removed_by     TEXT,
  removed_reason TEXT,
  notes          TEXT
);
-- Enforce unique active membership only (not across removed rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_zta_unique_active
  ON zone_target_accounts(zone_id, account_id)
  WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_zta_zone    ON zone_target_accounts(zone_id);
CREATE INDEX IF NOT EXISTS idx_zta_account ON zone_target_accounts(account_id);

ALTER TABLE zone_target_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zta_select" ON zone_target_accounts;
CREATE POLICY "zta_select" ON zone_target_accounts FOR SELECT USING (
  get_my_role() IN ('owner', 'admin', 'rep')
  OR (get_my_role() = 'portal' AND EXISTS (
    SELECT 1 FROM zones z
    JOIN markets m ON m.id = z.market_id
    WHERE z.id = zone_target_accounts.zone_id AND m.client_slug = get_my_client_slug()
  ))
);
-- Reps can add/remove accounts from target sets
DROP POLICY IF EXISTS "zta_insert" ON zone_target_accounts;
CREATE POLICY "zta_insert" ON zone_target_accounts FOR INSERT
  WITH CHECK (get_my_role() IN ('owner', 'admin', 'rep'));
DROP POLICY IF EXISTS "zta_update" ON zone_target_accounts;
CREATE POLICY "zta_update" ON zone_target_accounts FOR UPDATE
  USING (get_my_role() IN ('owner', 'admin', 'rep'));
DROP POLICY IF EXISTS "zta_delete" ON zone_target_accounts;
CREATE POLICY "zta_delete" ON zone_target_accounts FOR DELETE
  USING (get_my_role() IN ('owner', 'admin'));

-- ─── account_product_qualifications ──────────────────────────────────────────
-- Exclusion-by-default: no row = unreviewed (assumed qualified).
-- qualified = TRUE → explicitly affirmed; qualified = FALSE → explicitly excluded.
CREATE TABLE IF NOT EXISTS account_product_qualifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_slug TEXT NOT NULL,
  sku         TEXT NOT NULL,
  qualified   BOOLEAN NOT NULL DEFAULT TRUE,
  reason      TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  TEXT,
  UNIQUE(account_id, client_slug, sku)
);
CREATE INDEX IF NOT EXISTS idx_apq_account ON account_product_qualifications(account_id);
CREATE INDEX IF NOT EXISTS idx_apq_client  ON account_product_qualifications(client_slug);

ALTER TABLE account_product_qualifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apq_select" ON account_product_qualifications;
CREATE POLICY "apq_select" ON account_product_qualifications FOR SELECT USING (
  get_my_role() IN ('owner', 'admin', 'rep')
  OR (get_my_role() = 'portal' AND client_slug = get_my_client_slug())
);
DROP POLICY IF EXISTS "apq_insert" ON account_product_qualifications;
CREATE POLICY "apq_insert" ON account_product_qualifications FOR INSERT
  WITH CHECK (get_my_role() IN ('owner', 'admin', 'rep'));
DROP POLICY IF EXISTS "apq_update" ON account_product_qualifications;
CREATE POLICY "apq_update" ON account_product_qualifications FOR UPDATE
  USING (get_my_role() IN ('owner', 'admin', 'rep'));
DROP POLICY IF EXISTS "apq_delete" ON account_product_qualifications;
CREATE POLICY "apq_delete" ON account_product_qualifications FOR DELETE
  USING (get_my_role() IN ('owner', 'admin'));

-- ─── zone_metric_snapshots ───────────────────────────────────────────────────
-- One row per zone per day, written by the nightly cron job (service role).
-- UI derives trend signals from snapshot history; no status side effects here.
CREATE TABLE IF NOT EXISTS zone_metric_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id               UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  snapshot_date         DATE NOT NULL,
  reach_pct             NUMERIC,
  velocity              NUMERIC,
  velocity_index        NUMERIC,
  retention_pct         NUMERIC,
  retention_reorder_pct NUMERIC,
  retention_menu_pct    NUMERIC,
  health_score          NUMERIC,
  active_accounts       INT,
  target_set_size       INT,
  total_cases_90d       NUMERIC,
  computed_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zone_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_zms_zone_date ON zone_metric_snapshots(zone_id, snapshot_date DESC);

ALTER TABLE zone_metric_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zms_select" ON zone_metric_snapshots;
CREATE POLICY "zms_select" ON zone_metric_snapshots FOR SELECT USING (
  get_my_role() IN ('owner', 'admin', 'rep')
  OR (get_my_role() = 'portal' AND EXISTS (
    SELECT 1 FROM zones z
    JOIN markets m ON m.id = z.market_id
    WHERE z.id = zone_metric_snapshots.zone_id AND m.client_slug = get_my_client_slug()
  ))
);
-- Snapshots are written by the nightly cron via service role (bypasses RLS).
-- These restrictive policies cover any manual writes from authenticated sessions.
DROP POLICY IF EXISTS "zms_insert" ON zone_metric_snapshots;
CREATE POLICY "zms_insert" ON zone_metric_snapshots FOR INSERT
  WITH CHECK (get_my_role() IN ('owner', 'admin'));
DROP POLICY IF EXISTS "zms_update" ON zone_metric_snapshots;
CREATE POLICY "zms_update" ON zone_metric_snapshots FOR UPDATE
  USING (get_my_role() IN ('owner', 'admin'));
DROP POLICY IF EXISTS "zms_delete" ON zone_metric_snapshots;
CREATE POLICY "zms_delete" ON zone_metric_snapshots FOR DELETE
  USING (get_my_role() IN ('owner', 'admin'));

-- ─── Seed data ────────────────────────────────────────────────────────────────
-- Northern Colorado market for NoCo (idempotent via ON CONFLICT DO NOTHING).
INSERT INTO markets (
  name, client_slug, priority, cities, counties, states,
  default_reach_threshold, default_retention_threshold
) VALUES (
  'Northern Colorado', 'noco', TRUE,
  ARRAY['Fort Collins', 'Loveland', 'Greeley', 'Windsor'],
  ARRAY['Larimer', 'Weld'],
  ARRAY['CO'],
  55, 65
) ON CONFLICT (client_slug, name) DO NOTHING;

-- Seed zone: velocity_target = 1.0 is a placeholder.
-- Sara should update this via the edit form after running top-quartile analysis
-- on current NoCo on-premise account performance.
INSERT INTO zones (
  market_id, name, channel, phase, posture,
  velocity_target, reach_threshold, retention_threshold
)
SELECT
  m.id,
  'On-Premise',
  'on_premise',
  1,
  'active',
  1.0,  -- PLACEHOLDER: update after top-quartile analysis
  NULL, -- inherits default_reach_threshold (55) from market
  NULL  -- inherits default_retention_threshold (65) from market
FROM markets m
WHERE m.name = 'Northern Colorado' AND m.client_slug = 'noco'
ON CONFLICT (market_id, name) DO NOTHING;
