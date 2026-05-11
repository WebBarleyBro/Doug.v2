-- Migration 059: Flexible commission structures per brand
-- Agency-level: Sara + Chase share all commission; no per-rep splits yet

-- ── 1. Commission structures table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_commission_structures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug   TEXT NOT NULL REFERENCES clients(slug) ON DELETE CASCADE,
  label         TEXT NOT NULL,                -- human name e.g. "Standard flat rate"
  type          TEXT NOT NULL                 -- 'flat_pct' | 'tiered_pct' | 'threshold_pct'
                CHECK (type IN ('flat_pct', 'tiered_pct', 'threshold_pct')),
  tiers         JSONB NOT NULL DEFAULT '[]',  -- see schema below
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to   DATE,                        -- NULL = currently active
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce one active structure per brand at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_bcs_active_per_brand
  ON brand_commission_structures(client_slug)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_bcs_client_slug
  ON brand_commission_structures(client_slug, effective_from DESC);

-- ── 2. JSONB tier schema (enforced at app layer, documented here) ─────────────
-- flat_pct:
--   tiers: [{ "rate": 0.15 }]
--
-- tiered_pct (rate changes by cumulative revenue band):
--   tiers: [
--     { "up_to": 5000,  "rate": 0.20 },
--     { "up_to": 15000, "rate": 0.18 },
--     { "up_to": null,  "rate": 0.15 }   -- null = remainder
--   ]
--
-- threshold_pct (single rate unlocks above a monthly revenue floor):
--   tiers: [
--     { "below_threshold": 0.00, "above_threshold": 0.12, "threshold": 3000 }
--   ]

-- ── 3. Seed: 4 active brands ──────────────────────────────────────────────────
-- IMPORTANT: Verify these slugs match exactly in your clients table before running.
-- Run: SELECT slug FROM clients; to confirm.

-- NoCo Distillery — flat rate (verify actual rate)
INSERT INTO brand_commission_structures
  (client_slug, label, type, tiers, notes)
VALUES
  ('noco-distillery', 'NoCo flat commission', 'flat_pct',
   '[{"rate": 0.15}]',
   'Update rate to match signed contract before running')
ON CONFLICT DO NOTHING;

-- Por Lo Bueno — threshold model (fill in actual threshold + rate before running)
INSERT INTO brand_commission_structures
  (client_slug, label, type, tiers, notes)
VALUES
  ('por-lo-bueno', 'PLB threshold commission', 'threshold_pct',
   '[{"threshold": 0, "below_threshold": 0.00, "above_threshold": 0.15}]',
   'TODO: fill in actual threshold amount and rates from contract')
ON CONFLICT DO NOTHING;

-- Sol 2 Noches — flat rate (verify actual rate)
INSERT INTO brand_commission_structures
  (client_slug, label, type, tiers, notes)
VALUES
  ('sol-2-noches', 'S2N flat commission', 'flat_pct',
   '[{"rate": 0.15}]',
   'Update rate to match signed contract before running')
ON CONFLICT DO NOTHING;

-- Rocky Mountain Moonshine — flat rate (verify actual rate)
INSERT INTO brand_commission_structures
  (client_slug, label, type, tiers, notes)
VALUES
  ('rocky-mountain-moonshine', 'RMM flat commission', 'flat_pct',
   '[{"rate": 0.15}]',
   'Update rate to match signed contract before running')
ON CONFLICT DO NOTHING;

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE brand_commission_structures ENABLE ROW LEVEL SECURITY;

-- Internal team: full read access
CREATE POLICY bcs_read_internal ON brand_commission_structures
  FOR SELECT
  USING (get_my_role() IN ('owner', 'admin', 'rep'));

-- Owners/admins can write
CREATE POLICY bcs_write_admin ON brand_commission_structures
  FOR ALL
  USING (get_my_role() IN ('owner', 'admin'))
  WITH CHECK (get_my_role() IN ('owner', 'admin'));

-- Portal users: no access (commission structures are internal)
