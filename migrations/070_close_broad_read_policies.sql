-- Migration 070: close the broad access rules that override per-brand portal access
-- Run in: Supabase Dashboard → SQL Editor. Re-runnable (IF EXISTS / OR REPLACE throughout).
--
-- Why: Postgres grants a row if ANY policy allows it. Older rules created outside the
-- migrations ("Authenticated users can read …", "Allow all", "… public read") let every
-- signed-in user, and in a few cases anyone with the public key, read or change every
-- brand's data. The narrow rules from migration 031 (staff_all / portal_read) already
-- cover what the app needs, so the broad rules are removed, not replaced.
--
-- What keeps working after this:
--   • Staff (owner/admin/rep/intern) keep full access through the *_staff_all rules.
--   • Portal logins keep reading their own brand through the *_portal_read rules.
--   • The public tasting sign-up page reads through a server route (service role),
--     and its INSERT rule on tasting_consumers is untouched.
--   • Everyone can still read and update their own profile (except role and brand).
--
-- Nothing here deletes data.

-- ─── visits, accounts, orders, placements: any signed-in user could read every brand ───
DROP POLICY IF EXISTS "Authenticated users can read visits"          ON visits;
DROP POLICY IF EXISTS "Authenticated users can read accounts"        ON accounts;
DROP POLICY IF EXISTS "Authenticated users can read purchase_orders" ON purchase_orders;
DROP POLICY IF EXISTS "Authenticated users can read placements"      ON placements;

-- ─── contacts: "Allow all" let anyone, even logged out, read, edit or delete ───────────
DROP POLICY IF EXISTS "Allow all"                             ON contacts;
DROP POLICY IF EXISTS "Authenticated users can read contacts" ON contacts;

-- ─── events: readable by anyone, and by every signed-in user ─────────────────────────
DROP POLICY IF EXISTS "events_public_read"                  ON events;
DROP POLICY IF EXISTS "Authenticated users can read events" ON events;

-- ─── user_profiles: the whole team list was readable by anyone ───────────────────────
-- profiles_read_own (everyone) and profiles_read_staff (staff) remain.
DROP POLICY IF EXISTS "Users can view all profiles"                ON user_profiles;
DROP POLICY IF EXISTS "Authenticated users can read user_profiles" ON user_profiles;
-- Duplicate of profiles_update_own.
DROP POLICY IF EXISTS "Users can update own profile"               ON user_profiles;

-- Users may update their own profile (name, goals …) but never their own role or brand;
-- only an owner or admin can change those. Without this, a portal login could set its
-- own role to 'owner'.
CREATE OR REPLACE FUNCTION protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.client_slug IS DISTINCT FROM OLD.client_slug)
     AND auth.uid() IS NOT NULL                                  -- dashboard / service role edits are allowed
     AND COALESCE(get_my_role(), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only an owner or admin can change a user''s role or brand';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_profile_role ON user_profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_role();

-- New sign-ups cannot create themselves as staff either.
CREATE OR REPLACE FUNCTION protect_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND COALESCE(get_my_role(), '') NOT IN ('owner', 'admin')
     AND NEW.role IN ('owner', 'admin', 'rep', 'intern') THEN
    RAISE EXCEPTION 'Only an owner or admin can create staff profiles';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_profile_insert ON user_profiles;
CREATE TRIGGER trg_protect_profile_insert
  BEFORE INSERT ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_insert();

-- ─── client_suggestions: every portal login could read and edit every brand's ────────
DROP POLICY IF EXISTS "Authenticated can read suggestions"   ON client_suggestions;
DROP POLICY IF EXISTS "Authenticated can update suggestions" ON client_suggestions;
DROP POLICY IF EXISTS "Portal can insert suggestions"        ON client_suggestions;
DROP POLICY IF EXISTS "suggestions_staff_all"                ON client_suggestions;
DROP POLICY IF EXISTS "suggestions_portal_read"              ON client_suggestions;
DROP POLICY IF EXISTS "suggestions_portal_insert"            ON client_suggestions;

CREATE POLICY "suggestions_staff_all" ON client_suggestions
  FOR ALL USING (get_my_role() IN ('owner', 'admin', 'rep', 'intern'));

CREATE POLICY "suggestions_portal_read" ON client_suggestions
  FOR SELECT USING (get_my_role() = 'portal' AND client_slug = get_my_client_slug());

CREATE POLICY "suggestions_portal_insert" ON client_suggestions
  FOR INSERT WITH CHECK (get_my_role() = 'portal' AND client_slug = get_my_client_slug());

-- ─── campaign expenses/assets: older public-read rules (031 meant to drop these) ─────
-- Only the public-read rules; staff access on these tables is left as it is.
DROP POLICY IF EXISTS "portal_view_expenses"        ON campaign_expenses;
DROP POLICY IF EXISTS "portal_view_campaign_assets" ON campaign_assets;

-- ─── Check afterwards (read-only) ────────────────────────────────────────────────────
-- Any row this returns is a rule that still grants access to everyone signed in, or
-- to everyone. Expected: only tasting_consumers / client_files INSERT rules.
-- select tablename, policyname, cmd, qual, with_check from pg_policies
-- where schemaname = 'public'
--   and (qual in ('true', '(auth.role() = ''authenticated''::text)') or (qual is null and cmd <> 'INSERT'))
-- order by tablename;
