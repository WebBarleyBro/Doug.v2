-- Client files: logos, compliance docs, photos, brand assets shared between reps and brand clients
CREATE TABLE IF NOT EXISTS client_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'other',    -- 'logo' | 'compliance' | 'photo' | 'brand_asset' | 'other'
  file_size BIGINT,
  description TEXT,
  expiry_date DATE,                           -- for compliance docs with renewal deadlines
  uploaded_by UUID REFERENCES user_profiles(id),
  uploaded_by_portal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_files_client_slug ON client_files(client_slug);

-- Row-level security: allow authenticated users to read/write files for clients they have access to
ALTER TABLE client_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_files_read" ON client_files
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "client_files_insert" ON client_files
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "client_files_delete" ON client_files
  FOR DELETE USING (
    auth.role() = 'authenticated' AND (
      uploaded_by = auth.uid() OR
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
    )
  );
