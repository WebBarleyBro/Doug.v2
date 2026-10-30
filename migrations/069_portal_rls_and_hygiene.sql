-- Migration 069: portal RLS scope + data hygiene
-- Written for the portal-v2 rebuild. NOT RUN by the build; Sara runs it after reading.
-- Run in: Supabase Dashboard → SQL Editor. Re-runnable (IF EXISTS / IF NOT EXISTS throughout).

-- ─── (a) accounts_portal_read: scope portal logins to their own brand's accounts ─────
-- Today the policy is `get_my_role() = 'portal'`, which exposes every account row to
-- every portal login. account_clients cannot be used as the scope (26 rows for 177
-- accounts), so an account belongs to a brand when it has a visit, an order or a
-- placement for that brand's slug. The subqueries run under those tables' own portal
-- policies, which already restrict rows to get_my_client_slug(), so there is no
-- recursion back into accounts.
DROP POLICY IF EXISTS "accounts_portal_read" ON accounts;
CREATE POLICY "accounts_portal_read" ON accounts
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND (
      EXISTS (SELECT 1 FROM visits v
              WHERE v.account_id = accounts.id AND v.client_slug = get_my_client_slug())
      OR EXISTS (SELECT 1 FROM purchase_orders po
              WHERE po.account_id = accounts.id AND po.client_slug = get_my_client_slug())
      OR EXISTS (SELECT 1 FROM placements p
              WHERE p.account_id = accounts.id AND p.client_slug = get_my_client_slug())
    )
  );

-- Indexes the new policy leans on (visits/orders by account + brand).
CREATE INDEX IF NOT EXISTS idx_visits_account_client ON visits(account_id, client_slug);
CREATE INDEX IF NOT EXISTS idx_po_account_client ON purchase_orders(account_id, client_slug);
CREATE INDEX IF NOT EXISTS idx_placements_account_client ON placements(account_id, client_slug);

-- ─── (b) brand_commission_structures: retire the 0.15 placeholders ───────────────────
-- All four rows were seeded as placeholders and nothing in the code reads this table.
-- clients.commission_rate is canonical for commission (12% / 12% / 10% today); retire the
-- placeholder structures by closing their effective window rather than deleting them.
UPDATE brand_commission_structures
SET effective_to = current_date,
    notes = COALESCE(notes || ' ', '') || '[069] Retired placeholder; clients.commission_rate is canonical.'
WHERE effective_to IS NULL;

-- ─── (c) products: one active product name per brand ─────────────────────────────────
-- Duplicates found in the 2026-10-30 backup (client_slug | lower(name)):
--   noco-distillery | quadruple distilled bourbon   → f57682c1 active, b25b0b3e inactive (fine: one active)
--   noco-distillery | ridge mountain spiced rum     → e50d982b active, a760d622 inactive (fine: one active)
--   rocky-mountain-moonshine | blackberry moonshine → 403ff65a active, 276dec42 active  ← BLOCKS the index
-- The index is partial (WHERE active), so the two retired NoCo rows do not conflict.
-- The Rocky Mountain Moonshine pair does: retire the newer copy first (same price, $126).
-- Orders and placements reference products by product_name, so nothing is orphaned.
UPDATE products
SET active = false
WHERE id = (
  SELECT id FROM products
  WHERE client_slug = 'rocky-mountain-moonshine' AND lower(name) = 'blackberry moonshine' AND active
  ORDER BY created_at DESC
  LIMIT 1
)
AND (SELECT count(*) FROM products
     WHERE client_slug = 'rocky-mountain-moonshine' AND lower(name) = 'blackberry moonshine' AND active) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_client_name_active
  ON products (client_slug, lower(name))
  WHERE active;

-- ─── (d) accounts.account_kind: tell distributors apart from venues ──────────────────
-- A distributor (e.g. Chieftain Distribution) receives orders but is not a bar or store
-- the field works. The portal excludes distributor accounts from account counts, the
-- accounts ledger, top accounts, the funnel and the map; their orders still count in
-- Orders and Order value. Until this runs, the portal treats any account whose name
-- contains "Distribut" as a distributor.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_kind text NOT NULL DEFAULT 'venue'
  CHECK (account_kind IN ('venue', 'distributor'));
UPDATE accounts SET account_kind = 'distributor' WHERE name ILIKE '%Chieftain Distribution%';
