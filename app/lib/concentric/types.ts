// Concentric Growth Model — type definitions

export type ZonePosture = 'active' | 'maintaining' | 'monitoring' | 'opportunistic'
export type ZoneChannel = 'on_premise' | 'off_premise' | 'both'
export type AccountZoneStatus = 'active' | 'lapsed' | 'dormant' | 'untouched'

export interface Market {
  id: string
  name: string
  client_slug: string
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
  reach_pct: number | null
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
  last_order: string | null  // ISO timestamp of most recent sent/fulfilled order
  total_orders: number       // all-time count of sent/fulfilled orders
  orders_90d: number
  cases_90d: number
  velocity_per_month: number
}

// Full result returned by computeZoneMetrics
export interface ZoneMetrics {
  // 0–100 scale metrics
  reach_pct: number
  velocity: number          // raw cases per active account per month
  velocity_index: number    // velocity normalized 0–100 against velocity_target, capped at 100
  retention_pct: number
  retention_reorder_pct: number | null  // null = insufficient history (<60 days since first order)
  retention_menu_pct: number | null     // null = not on_premise or no active accounts
  health_score: number

  // Counts
  target_set_size: number
  active_accounts: number
  cases_90d: number

  // Trend — null if zone has fewer than 30 days of snapshot history
  health_trend_30d: number | null

  // Effective thresholds (after inheritance from Market)
  effective_reach_threshold: number
  effective_retention_threshold: number

  // Per-account breakdown
  accounts: AccountZoneMetric[]
}

// Supply Headroom — informational only, never blocks
export interface SupplyHeadroom {
  client_slug: string
  available_cases_90d: number | null
  projected_demand_90d: number  // sum of projected_monthly_cases*3 across active/maintaining zones
  headroom_pct: number | null   // null when available_cases_90d is null
  warning: boolean              // true when headroom_pct < 120 OR available_cases_90d is null
}
