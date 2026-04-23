-- Allow reps to clear or dismiss a follow-up without changing the visit status
ALTER TABLE visits ADD COLUMN IF NOT EXISTS follow_up_cleared_at TIMESTAMPTZ;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS follow_up_dismissed_at TIMESTAMPTZ;
