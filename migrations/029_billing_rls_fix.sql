-- Fix overly permissive portal depletion policy (was FOR ALL, allowing delete/update)
DROP POLICY IF EXISTS "depletions_portal_own" ON billing_depletions;

CREATE POLICY "depletions_portal_read" ON billing_depletions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'portal' AND client_slug = billing_depletions.client_slug)
  );

CREATE POLICY "depletions_portal_insert" ON billing_depletions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'portal' AND client_slug = billing_depletions.client_slug)
  );
