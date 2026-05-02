// Concentric Growth Model — type definitions

export type ZonePosture = 'active' | 'maintaining' | 'monitoring' | 'opportunistic'
export type ZoneChannel = 'on_premise' | 'off_premise' | 'both'
export type AccountZoneStatus = 'active' | 'lapsed' | 'dormant' | 'untouched'

export interface Market {
  id: string
  name: string
  client_slug?: string | null
  priority: boolean
  cities: string[]
  counties: string[]
  states: string[]
  zip_codes: string[]
  default_reach_threshold: number
  default_retention_threshold: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Zone {
  id: string
  market_id: string
  client_slug: string | null
  name: string
  channel: ZoneChannel
  phase: number
  posture: ZonePosture
  reach_threshold: number | null
  velocity_target: number
  retention_threshold: number | null
  projected_monthly_cases: number | null
  notes: string | null
  created_at: string
  updated_at: string
  // joined relations
  markets?: Market
}

export interface ZoneTargetAccount {
  id: string
  zone_id: string
  account_id: string
  added_at: string
  added_by: string | null
  removed_at: string | null
  removed_by: string | null
  removed_reason: string | null
  notes: string | null
}

export interface AccountProductQualification {
  id: string
  account_id: string
  client_slug: string
  sku: string
  qualified: boolean
  reason: string | null
  updated_at: string
  updated_by: string | null
}

export interface ZoneMetricSnapshot {
  id: string
  zone_id: string
  snapshot_date: string
  // v1 metrics (preserved for history)
  reach_pct: number | null
  // v2 metrics
  activity_rate_pct: number | null   // active_accounts / total_accounts
  volume_trend_pct: number | null    // % change vs prior 90d; null = no prior data
  cases_prior_90d: number | null
  accounts_lost: number | null       // were active last period, now lapsed/dormant
  total_accounts: number | null      // denominator for activity_rate
  // shared metrics
  velocity: number | null
  velocity_index: number | null
  retention_pct: number | null
  retention_reorder_pct: number | null
  retention_menu_pct: number | null
  health_score: number | null
  active_accounts: number | null
  target_set_size: number | null
  total_cases_90d: number | null
  computed_at: string
}

// Per-account breakdown returned by computeZoneMetrics
export interface AccountZoneMetric {
  account_id: string
  account_name: string
  address: string | null
  account_type: string
  status: AccountZoneStatus
  last_order: string | null
  total_orders: number
  orders_90d: number
  cases_90d: number
  cases_prior_90d: number
  velocity_per_month: number
}

// Full result returned by computeZoneMetrics
export interface ZoneMetrics {
  // v2 health formula inputs (0–100 scale)
  activity_rate_pct: number     // active_accounts / total_accounts
  velocity: number              // raw cases per active account per month
  velocity_index: number        // velocity normalized 0–100 against velocity_target
  retention_pct: number
  retention_reorder_pct: number | null
  retention_menu_pct: number | null
  volume_trend_pct: number | null
  health_score: number

  // Counts
  target_set_size: number
  active_accounts: number
  total_accounts: number
  cases_90d: number
  cases_prior_90d: number
  accounts_lost: number

  // v1 (kept for history, not used in health_score)
  reach_pct: number

  // Trend — null if fewer than 30 days of snapshot history
  health_trend_30d: number | null

  // Effective thresholds (after inheritance from Market)
  effective_activity_threshold: number
  effective_retention_threshold: number

  // Per-account breakdown
  accounts: AccountZoneMetric[]
}

// Supply Headroom — informational only, never blocks
export interface SupplyHeadroom {
  client_slug: string
  available_cases_90d: number | null
  projected_demand_90d: number
  headroom_pct: number | null
  warning: boolean
}
