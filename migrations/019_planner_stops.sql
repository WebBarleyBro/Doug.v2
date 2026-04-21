-- Planner stops persisted per user per day (replaces localStorage)
CREATE TABLE IF NOT EXISTS planner_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  address TEXT,
  scheduled_time TEXT,
  stop_order INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  stop_type TEXT NOT NULL DEFAULT 'account', -- 'event' | 'account' | 'task'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS planner_stops_user_date ON planner_stops(user_id, plan_date);

ALTER TABLE planner_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own planner stops"
  ON planner_stops FOR ALL USING (auth.uid() = user_id);
