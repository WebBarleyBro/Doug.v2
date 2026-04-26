-- ============================================================
-- Migration 031: Enable RLS on all remaining tables
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- This migration:
--   1. Creates two helper functions so policies can look up
--      the calling user's role/client_slug without hitting
--      RLS recursion (SECURITY DEFINER bypasses RLS)
--   2. Enables RLS + adds correct policies on every table
--      that was previously unprotected
--   3. Fixes overly permissive policies on campaign_expenses,
--      campaign_assets, and client_files


-- ─── Helper functions ─────────────────────────────────────────────────────────
-- SECURITY DEFINER = runs as the postgres owner, bypasses RLS.
-- This prevents the infinite-recursion problem where a policy on
-- table X tries to query user_profiles, which itself has RLS.

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_my_client_slug()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_slug FROM user_profiles WHERE id = auth.uid()
$$;


-- ─── user_profiles ────────────────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read_own"    ON user_profiles;
DROP POLICY IF EXISTS "profiles_read_staff"  ON user_profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON user_profiles;
DROP POLICY IF EXISTS "profiles_admin_all"   ON user_profiles;

-- Every user can read their own profile (login flow, layout-shell auth check)
CREATE POLICY "profiles_read_own" ON user_profiles
  FOR SELECT USING (id = auth.uid());

-- Staff can read all profiles (needed for visit rep names, task assignees)
CREATE POLICY "profiles_read_staff" ON user_profiles
  FOR SELECT USING (get_my_role() IN ('owner','admin','rep','intern'));

-- Users can update their own profile (name, avatar, etc.)
CREATE POLICY "profiles_update_own" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- Owner/admin can create, update, and delete any profile
CREATE POLICY "profiles_admin_all" ON user_profiles
  FOR ALL USING (get_my_role() IN ('owner','admin'));


-- ─── clients ──────────────────────────────────────────────────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_staff"       ON clients;
DROP POLICY IF EXISTS "clients_portal_read" ON clients;

CREATE POLICY "clients_staff" ON clients
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

-- Portal users can read their own brand record (contact info, commission rate, etc.)
CREATE POLICY "clients_portal_read" ON clients
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND slug = get_my_client_slug()
  );


-- ─── accounts ─────────────────────────────────────────────────────────────────
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_staff_all"   ON accounts;
DROP POLICY IF EXISTS "accounts_portal_read" ON accounts;

CREATE POLICY "accounts_staff_all" ON accounts
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

-- Portal users need account names for visit/placement display
CREATE POLICY "accounts_portal_read" ON accounts
  FOR SELECT USING (get_my_role() = 'portal');


-- ─── account_clients ──────────────────────────────────────────────────────────
ALTER TABLE account_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_clients_staff_all"   ON account_clients;
DROP POLICY IF EXISTS "account_clients_portal_read" ON account_clients;

CREATE POLICY "account_clients_staff_all" ON account_clients
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "account_clients_portal_read" ON account_clients
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND client_slug = get_my_client_slug()
  );


-- ─── visits ───────────────────────────────────────────────────────────────────
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visits_staff_all"   ON visits;
DROP POLICY IF EXISTS "visits_portal_read" ON visits;

CREATE POLICY "visits_staff_all" ON visits
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "visits_portal_read" ON visits
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND client_slug = get_my_client_slug()
  );


-- ─── placements ───────────────────────────────────────────────────────────────
ALTER TABLE placements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "placements_staff_all"   ON placements;
DROP POLICY IF EXISTS "placements_portal_read" ON placements;

CREATE POLICY "placements_staff_all" ON placements
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "placements_portal_read" ON placements
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND client_slug = get_my_client_slug()
  );


-- ─── purchase_orders ──────────────────────────────────────────────────────────
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_staff_all"   ON purchase_orders;
DROP POLICY IF EXISTS "orders_portal_read" ON purchase_orders;

CREATE POLICY "orders_staff_all" ON purchase_orders
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "orders_portal_read" ON purchase_orders
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND client_slug = get_my_client_slug()
  );


-- ─── po_line_items ────────────────────────────────────────────────────────────
-- FK column is po_id (not order_id)
ALTER TABLE po_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "line_items_staff_all"   ON po_line_items;
DROP POLICY IF EXISTS "line_items_portal_read" ON po_line_items;

CREATE POLICY "line_items_staff_all" ON po_line_items
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "line_items_portal_read" ON po_line_items
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = po_line_items.po_id
        AND po.client_slug = get_my_client_slug()
    )
  );


-- ─── contacts ─────────────────────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_staff_all"   ON contacts;
DROP POLICY IF EXISTS "contacts_portal_read" ON contacts;

CREATE POLICY "contacts_staff_all" ON contacts
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "contacts_portal_read" ON contacts
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND client_slug = get_my_client_slug()
  );


-- ─── tasks ────────────────────────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_admin_all"  ON tasks;
DROP POLICY IF EXISTS "tasks_staff_own"  ON tasks;

-- Owner/admin see and manage all tasks
CREATE POLICY "tasks_admin_all" ON tasks
  FOR ALL USING (get_my_role() IN ('owner','admin'));

-- Reps and interns see only tasks they created or are assigned to
CREATE POLICY "tasks_staff_own" ON tasks
  FOR ALL USING (
    get_my_role() IN ('rep','intern')
    AND (user_id = auth.uid() OR assigned_to = auth.uid())
  );


-- ─── events ───────────────────────────────────────────────────────────────────
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_staff_all"   ON events;
DROP POLICY IF EXISTS "events_portal_read" ON events;
DROP POLICY IF EXISTS "events_public_read" ON events;

CREATE POLICY "events_staff_all" ON events
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "events_portal_read" ON events
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND client_slug = get_my_client_slug()
  );

-- The public tasting registration page (/taste/[eventId]) needs to read the
-- event without a login to show the form title and client branding.
CREATE POLICY "events_public_read" ON events
  FOR SELECT USING (true);


-- ─── campaigns ────────────────────────────────────────────────────────────────
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_staff_all"   ON campaigns;
DROP POLICY IF EXISTS "campaigns_portal_read" ON campaigns;

CREATE POLICY "campaigns_staff_all" ON campaigns
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "campaigns_portal_read" ON campaigns
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND client_slug = get_my_client_slug()
  );


-- ─── campaign_milestones ──────────────────────────────────────────────────────
ALTER TABLE campaign_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "milestones_staff_all"   ON campaign_milestones;
DROP POLICY IF EXISTS "milestones_portal_read" ON campaign_milestones;

CREATE POLICY "milestones_staff_all" ON campaign_milestones
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "milestones_portal_read" ON campaign_milestones
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_milestones.campaign_id
        AND c.client_slug = get_my_client_slug()
    )
  );


-- ─── campaign_deliverables ────────────────────────────────────────────────────
ALTER TABLE campaign_deliverables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deliverables_staff_all"   ON campaign_deliverables;
DROP POLICY IF EXISTS "deliverables_portal_read" ON campaign_deliverables;

CREATE POLICY "deliverables_staff_all" ON campaign_deliverables
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "deliverables_portal_read" ON campaign_deliverables
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_deliverables.campaign_id
        AND c.client_slug = get_my_client_slug()
    )
  );


-- ─── state_registrations ──────────────────────────────────────────────────────
-- Links to clients via client_id (UUID FK), no client_slug column directly
ALTER TABLE state_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "state_regs_staff_all"   ON state_registrations;
DROP POLICY IF EXISTS "state_regs_portal_read" ON state_registrations;

CREATE POLICY "state_regs_staff_all" ON state_registrations
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "state_regs_portal_read" ON state_registrations
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = state_registrations.client_id
        AND c.slug = get_my_client_slug()
    )
  );


-- ─── competitive_sightings ────────────────────────────────────────────────────
-- Internal-only; no portal access needed
ALTER TABLE competitive_sightings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sightings_staff_all" ON competitive_sightings;

CREATE POLICY "sightings_staff_all" ON competitive_sightings
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));


-- ─── depletion_entries ────────────────────────────────────────────────────────
-- Internal placement-level depletion (distinct from billing_depletions)
ALTER TABLE depletion_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "depletion_entries_staff_all"   ON depletion_entries;
DROP POLICY IF EXISTS "depletion_entries_portal_read" ON depletion_entries;

CREATE POLICY "depletion_entries_staff_all" ON depletion_entries
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "depletion_entries_portal_read" ON depletion_entries
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = depletion_entries.client_id
        AND c.slug = get_my_client_slug()
    )
  );


-- ─── tasting_consumers ────────────────────────────────────────────────────────
ALTER TABLE tasting_consumers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasting_staff_all"    ON tasting_consumers;
DROP POLICY IF EXISTS "tasting_portal_read"  ON tasting_consumers;
DROP POLICY IF EXISTS "tasting_public_insert" ON tasting_consumers;

CREATE POLICY "tasting_staff_all" ON tasting_consumers
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "tasting_portal_read" ON tasting_consumers
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = tasting_consumers.client_id
        AND c.slug = get_my_client_slug()
    )
  );

-- The public /taste/[eventId] form submits without a login
CREATE POLICY "tasting_public_insert" ON tasting_consumers
  FOR INSERT WITH CHECK (true);


-- ─── agency_pipeline ──────────────────────────────────────────────────────────
-- Prospect pipeline — owner/admin only for writes; reps can read
ALTER TABLE agency_pipeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipeline_admin"      ON agency_pipeline;
DROP POLICY IF EXISTS "pipeline_staff_read" ON agency_pipeline;

CREATE POLICY "pipeline_admin" ON agency_pipeline
  FOR ALL USING (get_my_role() IN ('owner','admin'));

CREATE POLICY "pipeline_staff_read" ON agency_pipeline
  FOR SELECT USING (get_my_role() = 'rep');


-- ─── products ─────────────────────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_staff_all"   ON products;
DROP POLICY IF EXISTS "products_portal_read" ON products;

CREATE POLICY "products_staff_all" ON products
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "products_portal_read" ON products
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND client_slug = get_my_client_slug()
  );


-- ─── Fix: campaign_expenses (was open to anonymous) ───────────────────────────
DROP POLICY IF EXISTS "auth_manage_expenses" ON campaign_expenses;
DROP POLICY IF EXISTS "portal_view_expenses" ON campaign_expenses;
DROP POLICY IF EXISTS "portal_add_expenses"  ON campaign_expenses;

CREATE POLICY "expenses_staff_all" ON campaign_expenses
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "expenses_portal_read" ON campaign_expenses
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND client_slug = get_my_client_slug()
  );


-- ─── Fix: campaign_assets (was open to anonymous) ─────────────────────────────
DROP POLICY IF EXISTS "auth_manage_campaign_assets"    ON campaign_assets;
DROP POLICY IF EXISTS "portal_view_campaign_assets"    ON campaign_assets;
DROP POLICY IF EXISTS "portal_upload_campaign_assets"  ON campaign_assets;

CREATE POLICY "assets_staff_all" ON campaign_assets
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

-- campaign_assets has no client_slug column — scope through campaigns table
CREATE POLICY "assets_portal_read" ON campaign_assets
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_assets.campaign_id
        AND c.client_slug = get_my_client_slug()
    )
  );

CREATE POLICY "assets_portal_insert" ON campaign_assets
  FOR INSERT WITH CHECK (
    get_my_role() = 'portal'
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_assets.campaign_id
        AND c.client_slug = get_my_client_slug()
    )
  );


-- ─── Fix: client_files (was leaking across tenants) ───────────────────────────
DROP POLICY IF EXISTS "client_files_read"   ON client_files;
DROP POLICY IF EXISTS "client_files_insert" ON client_files;

CREATE POLICY "client_files_read" ON client_files
  FOR SELECT USING (
    get_my_role() IN ('owner','admin','rep','intern')
    OR (get_my_role() = 'portal' AND client_slug = get_my_client_slug())
  );

CREATE POLICY "client_files_insert" ON client_files
  FOR INSERT WITH CHECK (
    get_my_role() IN ('owner','admin','rep','intern')
    OR (get_my_role() = 'portal' AND client_slug = get_my_client_slug())
  );
