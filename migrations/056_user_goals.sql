-- Add per-user visit goals to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS goal_daily   INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS goal_monthly INTEGER DEFAULT 80;

-- Set sensible defaults for existing rows
UPDATE user_profiles
  SET goal_daily   = COALESCE(goal_daily, 8),
      goal_monthly = COALESCE(goal_monthly, 80)
  WHERE goal_daily IS NULL OR goal_monthly IS NULL;
