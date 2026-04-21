-- Campaign expenses (printing, shelf talkers, events, etc.)
CREATE TABLE IF NOT EXISTS campaign_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  client_slug TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  vendor TEXT,
  expense_date DATE,
  notes TEXT,
  added_by TEXT DEFAULT 'internal',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE campaign_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_manage_expenses" ON campaign_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "portal_view_expenses" ON campaign_expenses FOR SELECT USING (true);
CREATE POLICY "portal_add_expenses" ON campaign_expenses FOR INSERT WITH CHECK (true);

-- Campaign assets (file uploads tied to a campaign)
CREATE TABLE IF NOT EXISTS campaign_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  client_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  description TEXT,
  uploaded_by TEXT DEFAULT 'client',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE campaign_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_manage_campaign_assets" ON campaign_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "portal_view_campaign_assets" ON campaign_assets FOR SELECT USING (true);
CREATE POLICY "portal_upload_campaign_assets" ON campaign_assets FOR INSERT WITH CHECK (true);
