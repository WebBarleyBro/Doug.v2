CREATE TABLE IF NOT EXISTS agency_pipeline (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name       TEXT NOT NULL,
  contact_name     TEXT,
  contact_email    TEXT,
  contact_phone    TEXT,
  spirit_category  TEXT,
  stage            TEXT CHECK (stage IN ('prospect','contacted','meeting_scheduled','proposal_sent','negotiating','won','lost')) DEFAULT 'prospect',
  estimated_value  DECIMAL(10,2),
  notes            TEXT,
  next_action      TEXT,
  next_action_date DATE,
  lost_reason      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
