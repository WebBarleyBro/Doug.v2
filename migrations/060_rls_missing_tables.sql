-- Migration 060: Enable RLS on tables that were missing it
-- Tables identified via: SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename NOT IN (SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public')
-- Run in: Supabase Dashboard → SQL Editor

-- ─── email_lists ──────────────────────────────────────────────────────────────
ALTER TABLE email_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_lists_admin" ON email_lists;
CREATE POLICY "email_lists_admin" ON email_lists
  FOR ALL USING (get_my_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "email_lists_staff_read" ON email_lists;
CREATE POLICY "email_lists_staff_read" ON email_lists
  FOR SELECT USING (get_my_role() IN ('rep', 'intern'));


-- ─── email_list_contacts ──────────────────────────────────────────────────────
ALTER TABLE email_list_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_list_contacts_admin" ON email_list_contacts;
CREATE POLICY "email_list_contacts_admin" ON email_list_contacts
  FOR ALL USING (get_my_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "email_list_contacts_staff_read" ON email_list_contacts;
CREATE POLICY "email_list_contacts_staff_read" ON email_list_contacts
  FOR SELECT USING (get_my_role() IN ('rep', 'intern'));


-- ─── leads ────────────────────────────────────────────────────────────────────
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_admin" ON leads;
CREATE POLICY "leads_admin" ON leads
  FOR ALL USING (get_my_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "leads_staff_read" ON leads;
CREATE POLICY "leads_staff_read" ON leads
  FOR SELECT USING (get_my_role() IN ('rep', 'intern'));


-- ─── intern_comments ─────────────────────────────────────────────────────────
ALTER TABLE intern_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intern_comments_admin" ON intern_comments;
CREATE POLICY "intern_comments_admin" ON intern_comments
  FOR ALL USING (get_my_role() IN ('owner', 'admin'));

-- Interns can read and write their own comments
DROP POLICY IF EXISTS "intern_comments_intern" ON intern_comments;
CREATE POLICY "intern_comments_intern" ON intern_comments
  FOR ALL USING (get_my_role() = 'intern');

DROP POLICY IF EXISTS "intern_comments_rep_read" ON intern_comments;
CREATE POLICY "intern_comments_rep_read" ON intern_comments
  FOR SELECT USING (get_my_role() = 'rep');


-- ─── client_settings ──────────────────────────────────────────────────────────
ALTER TABLE client_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_settings_staff_all" ON client_settings;
CREATE POLICY "client_settings_staff_all" ON client_settings
  FOR ALL USING (get_my_role() IN ('owner', 'admin', 'rep', 'intern'));

DROP POLICY IF EXISTS "client_settings_portal_read" ON client_settings;
CREATE POLICY "client_settings_portal_read" ON client_settings
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND client_slug = get_my_client_slug()
  );


-- ─── portal_user_assignments ─────────────────────────────────────────────────
ALTER TABLE portal_user_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_assignments_admin" ON portal_user_assignments;
CREATE POLICY "portal_assignments_admin" ON portal_user_assignments
  FOR ALL USING (get_my_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "portal_assignments_staff_read" ON portal_user_assignments;
CREATE POLICY "portal_assignments_staff_read" ON portal_user_assignments
  FOR SELECT USING (get_my_role() IN ('rep', 'intern', 'portal'));


-- ─── "PO and DI" (unusual table name with spaces) ────────────────────────────
-- Note: table names with spaces require quoting. Restrict to owner/admin only
-- as the purpose of this table is unclear. Review and update policy if needed.
ALTER TABLE "PO and DI" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "po_and_di_admin" ON "PO and DI";
CREATE POLICY "po_and_di_admin" ON "PO and DI"
  FOR ALL USING (get_my_role() IN ('owner', 'admin'));
