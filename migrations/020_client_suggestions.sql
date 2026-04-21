CREATE TABLE IF NOT EXISTS client_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug TEXT NOT NULL,
  suggestion_type TEXT NOT NULL DEFAULT 'account',
  name TEXT NOT NULL,
  address TEXT,
  notes TEXT,
  reason TEXT NOT NULL DEFAULT 'other',
  reason_detail TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_by_name TEXT,
  submitted_by_email TEXT
);
CREATE INDEX IF NOT EXISTS idx_client_suggestions_slug ON client_suggestions(client_slug);
CREATE INDEX IF NOT EXISTS idx_client_suggestions_status ON client_suggestions(status);
ALTER TABLE client_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Portal can insert suggestions" ON client_suggestions FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can read suggestions" ON client_suggestions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can update suggestions" ON client_suggestions FOR UPDATE USING (auth.role() = 'authenticated');
