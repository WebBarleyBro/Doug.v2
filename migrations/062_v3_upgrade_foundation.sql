-- V3 upgrade foundation
-- Adds: rep ownership on accounts, weekly goal, agency pipeline richer schema,
--       account_notes table for persistent non-visit notes.

-- ── 1. Rep ownership on accounts ─────────────────────────────────────────────
-- Which rep "owns" an account. Nullable — many accounts are unassigned.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owned_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_owned_by ON accounts(owned_by);

-- ── 2. Weekly visit goal in user_profiles ────────────────────────────────────
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS goal_weekly INT DEFAULT 40;

-- ── 3. Account notes — persistent notes separate from visit log ───────────────
-- Visits are event-driven; account notes are standing context (e.g.,
-- "always ask for Jake, GM handles all orders Tues/Wed").
CREATE TABLE IF NOT EXISTS account_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  pinned      BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_notes_account ON account_notes(account_id, created_at DESC);

ALTER TABLE account_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_notes: internal team access" ON account_notes;
CREATE POLICY "account_notes: internal team access"
  ON account_notes
  FOR ALL
  USING (get_my_role() IN ('owner', 'admin', 'rep', 'intern'));

-- ── 4. Agency pipeline — richer schema ───────────────────────────────────────
-- Update stage CHECK constraint to reflect a better funnel for brand BD.
-- Old stages: prospect | contacted | meeting_scheduled | proposal_sent | negotiating | won | lost
-- New stages: identified | outreach_sent | call_scheduled | pitch_done |
--             terms_discussion | contract_sent | won | lost | paused
--
-- Strategy basis: spirits brand BD has a longer discovery phase than typical B2B.
-- "identified" = brand fits WP's portfolio criteria, not yet contacted
-- "outreach_sent" = cold email / DM / trade intro made
-- "call_scheduled" = agreed to an intro call or meeting
-- "pitch_done" = presented WP's value prop and territory
-- "terms_discussion" = actively negotiating scope, territory, commission
-- "contract_sent" = agreement drafted and sent
-- "won" = signed; brand becomes a client (row moves to clients table)
-- "lost" = brand chose a different rep firm or went in-house
-- "paused" = timing not right; revisit in 6-12 months

-- Add new columns first
ALTER TABLE agency_pipeline ADD COLUMN IF NOT EXISTS territory       TEXT;
ALTER TABLE agency_pipeline ADD COLUMN IF NOT EXISTS annual_revenue  DECIMAL(12,2);
ALTER TABLE agency_pipeline ADD COLUMN IF NOT EXISTS priority        TEXT CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium';
ALTER TABLE agency_pipeline ADD COLUMN IF NOT EXISTS source          TEXT;  -- how we found them: referral, trade show, cold, etc.
ALTER TABLE agency_pipeline ADD COLUMN IF NOT EXISTS assigned_to     UUID REFERENCES user_profiles(id) ON DELETE SET NULL;
ALTER TABLE agency_pipeline ADD COLUMN IF NOT EXISTS paused_until    DATE;  -- for 'paused' stage — when to resurface

-- Drop old CHECK constraint and add new one
-- Note: Postgres doesn't support IF NOT EXISTS on DROP CONSTRAINT
DO $$
BEGIN
  -- Drop old constraint if it exists under its auto-generated name
  -- (constraint name may vary; use a safe DO block)
  ALTER TABLE agency_pipeline DROP CONSTRAINT IF EXISTS agency_pipeline_stage_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE agency_pipeline ADD CONSTRAINT agency_pipeline_stage_check
  CHECK (stage IN (
    'identified',
    'outreach_sent',
    'call_scheduled',
    'pitch_done',
    'terms_discussion',
    'contract_sent',
    'won',
    'lost',
    'paused'
  ));

-- Migrate existing rows to closest new stage
UPDATE agency_pipeline SET stage = 'identified'     WHERE stage = 'prospect';
UPDATE agency_pipeline SET stage = 'outreach_sent'  WHERE stage = 'contacted';
UPDATE agency_pipeline SET stage = 'call_scheduled' WHERE stage = 'meeting_scheduled';
UPDATE agency_pipeline SET stage = 'pitch_done'     WHERE stage = 'proposal_sent';
UPDATE agency_pipeline SET stage = 'terms_discussion' WHERE stage = 'negotiating';
-- 'won' and 'lost' stay the same

-- ── 5. RLS for agency_pipeline (if not already set) ──────────────────────────
ALTER TABLE agency_pipeline ENABLE ROW LEVEL SECURITY;

-- Drop and recreate so migration is re-runnable
DROP POLICY IF EXISTS "pipeline: internal team access" ON agency_pipeline;
CREATE POLICY "pipeline: internal team access"
  ON agency_pipeline
  FOR ALL
  USING (get_my_role() IN ('owner', 'admin', 'rep'));

-- ── 6. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pipeline_stage      ON agency_pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_assigned   ON agency_pipeline(assigned_to);
CREATE INDEX IF NOT EXISTS idx_pipeline_updated    ON agency_pipeline(updated_at DESC);
