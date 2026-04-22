-- Intern workflow tables: projects assigned by staff, assets submitted by interns

CREATE TABLE IF NOT EXISTS intern_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'briefed'
    CHECK (status IN ('briefed','in_progress','in_review','approved','completed')),
  due_date DATE,
  owner_feedback TEXT,
  assigned_to UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  client_slug TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intern_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'Social Media Graphic',
  project_id UUID REFERENCES intern_projects(id) ON DELETE SET NULL,
  file_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','changes_requested')),
  feedback TEXT,
  submitted_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: interns can read/update their own projects
ALTER TABLE intern_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "intern_projects_own" ON intern_projects
  FOR ALL USING (
    assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

-- RLS: interns can insert/read their own assets; staff can read all + update for feedback
ALTER TABLE intern_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "intern_assets_own" ON intern_assets
  FOR ALL USING (
    submitted_by = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

-- Storage bucket for intern file uploads must be created in Supabase Dashboard:
-- Bucket name: intern-assets (public bucket)
