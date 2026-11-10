-- Migration 073: add Bom Dia Bubbles as a brand client (direct orders, 15% commission)
-- Run in: Supabase Dashboard → SQL Editor. Re-runnable: running it again changes nothing
-- that already exists. Nothing here deletes or overwrites anything.
--
-- Order of operations:
--   1. Run this file. The brand appears in Doug (Clients) and its portal exists at
--      /portal/bom-dia-bubbles.
--   2. Supabase → Authentication → Users → Invite user → kevin@bomdiabubbles.com.
--   3. Run this file again. Step C links Kevin's new login to the brand, so the invite
--      link takes him to "Choose your password" and then straight to his portal.

-- ─── A. The brand ────────────────────────────────────────────────────────────────────
INSERT INTO clients (name, slug, order_type, commission_rate, color, logo_url, contact_name, contact_email, since_date, active)
VALUES (
  'Bom Dia Bubbles',
  'bom-dia-bubbles',
  'direct',
  0.15,
  '#a78bfa',
  'https://res.cloudinary.com/dhg83nxda/image/upload/v1794270708/logo_281f658a-a975-4752-8d25-472b7d40ae98_300x_rsxcmn.svg',
  'Kevin',
  'kevin@bomdiabubbles.com',
  '2026-11-01',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ─── B. Monthly and quarterly reports switched on (a period with no visits or orders
-- is skipped automatically, so nothing goes out until there is activity).
INSERT INTO report_settings (client_slug, monthly_enabled, quarterly_enabled)
VALUES ('bom-dia-bubbles', true, true)
ON CONFLICT (client_slug) DO NOTHING;

-- ─── C. Link Kevin's login to the brand. Does nothing until he has been invited
-- (step 2 above); run the file again after inviting him.
INSERT INTO user_profiles (id, name, full_name, role, client_slug)
SELECT u.id, 'Kevin', 'Kevin', 'portal', 'bom-dia-bubbles'
FROM auth.users u
WHERE lower(u.email) = 'kevin@bomdiabubbles.com'
ON CONFLICT (id) DO NOTHING;

-- ─── Check (read-only). Expect one brand row; one login row once Kevin is invited and
-- this file has been run again.
SELECT 'brand' AS what, c.name AS name, c.slug AS detail FROM clients c WHERE c.slug = 'bom-dia-bubbles'
UNION ALL
SELECT 'portal login', u.email, p.role || ' → ' || p.client_slug
FROM user_profiles p JOIN auth.users u ON u.id = p.id
WHERE p.client_slug = 'bom-dia-bubbles';
