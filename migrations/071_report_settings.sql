-- Migration 071: settings for the scheduled brand reports (Brand reports page in Doug)
-- Run in: Supabase Dashboard → SQL Editor. Re-runnable.
--
-- One row per brand: whether the monthly and quarterly reports go out automatically,
-- whether the brand's portal logins receive them, and any recipients added or removed
-- by hand. The scheduled send does nothing until this table exists, and a brand with
-- no row here is treated as switched off.

CREATE TABLE IF NOT EXISTS report_settings (
  client_slug           TEXT PRIMARY KEY,
  monthly_enabled       BOOLEAN NOT NULL DEFAULT true,
  quarterly_enabled     BOOLEAN NOT NULL DEFAULT true,
  include_portal_logins BOOLEAN NOT NULL DEFAULT true,
  extra_recipients      TEXT[]  NOT NULL DEFAULT '{}',
  excluded_recipients   TEXT[]  NOT NULL DEFAULT '{}',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID
);

ALTER TABLE report_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_settings_owner_admin" ON report_settings;
CREATE POLICY "report_settings_owner_admin" ON report_settings
  FOR ALL USING (get_my_role() IN ('owner', 'admin'))
  WITH CHECK (get_my_role() IN ('owner', 'admin'));

-- Start every active brand switched on, except Sol 2 Noches (no orders entered yet).
INSERT INTO report_settings (client_slug, monthly_enabled, quarterly_enabled)
SELECT slug, slug <> 'sol-2-noches', slug <> 'sol-2-noches'
FROM clients
WHERE active = true
ON CONFLICT (client_slug) DO NOTHING;
