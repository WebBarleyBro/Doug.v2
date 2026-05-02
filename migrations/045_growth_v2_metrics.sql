-- Growth v2: replace reach_pct with activity_rate_pct in health formula.
-- Reach was circular — denominator was self-defined by the user (pursuing list).
-- Activity rate and volume trend are grounded in actual CRM data.
--
-- New health formula:
--   activity_rate × 0.30 + velocity_index × 0.25 + retention × 0.30 + trend_score × 0.15
-- where trend_score = LEAST(100, GREATEST(0, 50 + LEAST(50, GREATEST(-50, volume_trend_pct))))

ALTER TABLE zone_metric_snapshots
  ADD COLUMN IF NOT EXISTS activity_rate_pct  numeric,
  ADD COLUMN IF NOT EXISTS volume_trend_pct   numeric,
  ADD COLUMN IF NOT EXISTS cases_prior_90d    integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accounts_lost      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_accounts     integer DEFAULT 0;

-- reach_pct is preserved for historical rows but no longer drives health_score.
COMMENT ON COLUMN zone_metric_snapshots.activity_rate_pct IS
  'active_accounts / total_accounts * 100. Replaces reach_pct in health formula.';
COMMENT ON COLUMN zone_metric_snapshots.volume_trend_pct IS
  'Percent change in cases vs prior 90d window. Null when no prior data.';
COMMENT ON COLUMN zone_metric_snapshots.accounts_lost IS
  'Accounts active in prior 90d that had no orders in current 90d.';
COMMENT ON COLUMN zone_metric_snapshots.total_accounts IS
  'Accounts with at least one all-time order (activity_rate denominator).';
