// Concentric Growth Model — server-side computation module
// This file must only be imported from API routes, server actions, or cron jobs.
// It uses getSupabaseAdmin() (service role) to bypass RLS and read across all clients.

import { getSupabaseAdmin } from '../supabase-server'
import type {
  Zone, Market, ZoneMetrics, AccountZoneMetric, AccountZoneStatus, SupplyHeadroom,
} from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function emptyMetrics(
  effective_reach_threshold: number,
  effective_retention_threshold: number,
): ZoneMetrics {
  return {
    reach_pct: 0,
    velocity: 0,
    velocity_index: 0,
    retention_pct: 0,
    retention_reorder_pct: null,
    retention_menu_pct: null,
    health_score: 0,
    target_set_size: 0,
    active_accounts: 0,
    cases_90d: 0,
    health_trend_30d: null,
    effective_reach_threshold,
    effective_retention_threshold,
    accounts: [],
  }
}

// ─── computeZoneMetrics ───────────────────────────────────────────────────────

export async function computeZoneMetrics(zoneId: string): Promise<ZoneMetrics> {
  const sb = getSupabaseAdmin()

  // 1. Fetch zone with parent market
  const { data: zoneRaw, error: zoneErr } = await sb
    .from('zones')
    .select('*, markets(*)')
    .eq('id', zoneId)
    .single()

  if (zoneErr || !zoneRaw) throw new Error(`Zone not found: ${zoneId}`)

  const zone = zoneRaw as Zone & { markets: Market }
  const market = zone.markets
  const clientSlug = zone.client_slug ?? market.client_slug ?? null
  if (!clientSlug) throw new Error(`Zone ${zoneId} has no client_slug`)

  const effectiveReachThreshold = zone.reach_threshold ?? market.default_reach_threshold
  const effectiveRetentionThreshold = zone.retention_threshold ?? market.default_retention_threshold

  // 2. Fetch active Target Set members with account data
  const { data: targetRows } = await sb
    .from('zone_target_accounts')
    .select('account_id, accounts(id, name, address, account_type)')
    .eq('zone_id', zoneId)
    .is('removed_at', null)

  if (!targetRows || targetRows.length === 0) {
    const snap = await fetchTrendSnapshot(sb, zoneId)
    return { ...emptyMetrics(effectiveReachThreshold, effectiveRetentionThreshold), health_trend_30d: snap }
  }

  const accountIds = targetRows.map((r: any) => r.account_id as string)

  // 3. All-time sent/fulfilled orders for these accounts (for status, last_order, total_orders,
  //    and retention eligibility — no line items needed here)
  const { data: allOrdersRaw } = await sb
    .from('purchase_orders')
    .select('id, account_id, status, sent_at, created_at')
    .eq('client_slug', clientSlug)
    .in('account_id', accountIds)
    .in('status', ['sent', 'fulfilled'])

  const allOrders = allOrdersRaw || []

  // 4. 90-day orders WITH line items (for case counts).
  // Use sent_at as the primary date (when the order was actually placed) and
  // fall back to created_at. Pre-filter with the earlier of the two to avoid
  // missing orders where sent_at > created_at by a significant margin.
  const cutoff90 = daysAgo(90)
  const cutoff90Str = cutoff90.toISOString()
  const { data: orders90Raw } = await sb
    .from('purchase_orders')
    .select('id, account_id, sent_at, created_at, po_line_items(cases,bottles,quantity)')
    .eq('client_slug', clientSlug)
    .in('account_id', accountIds)
    .in('status', ['sent', 'fulfilled'])
    .or(`sent_at.gte.${cutoff90Str},and(sent_at.is.null,created_at.gte.${cutoff90Str})`)

  const orders90 = orders90Raw || []

  // 5. Active menu placements for on-premise zones
  const isOnPremise = zone.channel === 'on_premise' || zone.channel === 'both'
  const menuAccountIds = new Set<string>()
  if (isOnPremise) {
    const { data: menuPlacements } = await sb
      .from('placements')
      .select('account_id')
      .eq('client_slug', clientSlug)
      .in('account_id', accountIds)
      .in('placement_type', ['menu', 'cocktail', 'well'])
      .is('lost_at', null)
    for (const p of menuPlacements || []) menuAccountIds.add(p.account_id)
  }

  // 6. Per-account computation
  const cutoff180 = daysAgo(180)

  const accounts: AccountZoneMetric[] = targetRows.map((row: any) => {
    const acct = row.accounts as any
    const acctId: string = row.account_id

    const acctAllOrders = allOrders.filter(o => o.account_id === acctId)
    const acctOrders90 = orders90.filter(o => {
      const d = new Date((o.sent_at || o.created_at) as string)
      return o.account_id === acctId && d >= cutoff90
    })

    const orderDates = acctAllOrders
      .map(o => new Date((o.sent_at || o.created_at) as string))
      .sort((a, b) => b.getTime() - a.getTime())

    const lastOrderDate = orderDates[0] ?? null
    const totalOrders = acctAllOrders.length

    const orders_90d = acctOrders90.length
    const cases_90d = acctOrders90.reduce((sum, o) => {
      const qty = ((o as any).po_line_items || []).reduce(
        (s: number, li: any) =>
          s + (Number(li.cases) || 0) + (Number(li.bottles) || 0) + (Number(li.quantity) || 0),
        0,
      )
      return sum + qty
    }, 0)

    let status: AccountZoneStatus
    if (totalOrders === 0) {
      status = 'untouched'
    } else if (lastOrderDate && lastOrderDate >= cutoff90) {
      status = 'active'
    } else if (lastOrderDate && lastOrderDate >= cutoff180) {
      status = 'lapsed'
    } else {
      status = 'dormant'
    }

    const velocity_per_month = orders_90d > 0 ? cases_90d / 3 : 0

    return {
      account_id: acctId,
      account_name: acct?.name ?? 'Unknown',
      address: acct?.address ?? null,
      account_type: acct?.account_type ?? 'on_premise',
      status,
      last_order: lastOrderDate ? lastOrderDate.toISOString() : null,
      total_orders: totalOrders,
      orders_90d,
      cases_90d,
      velocity_per_month,
    }
  })

  // 7. Zone-level aggregation
  const activeAccounts = accounts.filter(a => a.status === 'active')
  const activeCount = activeAccounts.length
  const targetSetSize = accounts.length

  const reach_pct = targetSetSize > 0 ? (activeCount / targetSetSize) * 100 : 0

  const totalCases90d = accounts.reduce((s, a) => s + a.cases_90d, 0)
  const velocity = activeCount > 0 ? totalCases90d / (activeCount * 3) : 0
  const velocity_index = Math.min((velocity / zone.velocity_target) * 100, 100)

  // 8. Retention
  // Reorder eligibility: had at least one order BEFORE the 90-day window
  const eligibleForReorder = accounts.filter(a => {
    const acctAllOrders = allOrders.filter(o => o.account_id === a.account_id)
    return acctAllOrders.some(o => new Date((o.sent_at || o.created_at) as string) < cutoff90)
  })

  let retention_reorder_pct: number | null = null
  if (eligibleForReorder.length > 0) {
    const reordered = eligibleForReorder.filter(a => a.orders_90d > 0)
    retention_reorder_pct = (reordered.length / eligibleForReorder.length) * 100
  }

  let retention_menu_pct: number | null = null
  let retention_pct: number

  if (isOnPremise) {
    retention_menu_pct = activeCount > 0
      ? (activeAccounts.filter(a => menuAccountIds.has(a.account_id)).length / activeCount) * 100
      : null

    // When one component is null (no history / no active accounts), treat as 0
    // but surface the null separately so the UI can show "insufficient history"
    retention_pct =
      0.5 * (retention_reorder_pct ?? 0) + 0.5 * (retention_menu_pct ?? 0)
  } else {
    // off_premise: pure reorder rate
    retention_pct = retention_reorder_pct ?? 0
  }

  // 9. Health Score = (Reach × 0.35) + (Velocity Index × 0.30) + (Retention × 0.35)
  const health_score =
    reach_pct * 0.35 + velocity_index * 0.30 + retention_pct * 0.35

  // 10. 30-day trend from snapshots
  const health_trend_30d = await fetchTrendSnapshot(sb, zoneId, health_score)

  return {
    reach_pct,
    velocity,
    velocity_index,
    retention_pct,
    retention_reorder_pct,
    retention_menu_pct,
    health_score,
    target_set_size: targetSetSize,
    active_accounts: activeCount,
    cases_90d: totalCases90d,
    health_trend_30d,
    effective_reach_threshold: effectiveReachThreshold,
    effective_retention_threshold: effectiveRetentionThreshold,
    accounts,
  }
}

// Looks up the most recent snapshot at or before (today - 30 days) and returns
// current_health - snapshot_health, or null if no snapshot exists that far back.
async function fetchTrendSnapshot(
  sb: ReturnType<typeof getSupabaseAdmin>,
  zoneId: string,
  currentHealth?: number,
): Promise<number | null> {
  const { data } = await sb
    .from('zone_metric_snapshots')
    .select('health_score')
    .eq('zone_id', zoneId)
    .lte('snapshot_date', isoDate(daysAgo(30)))
    .order('snapshot_date', { ascending: false })
    .limit(1)

  if (!data || data.length === 0 || data[0].health_score === null) return null
  if (currentHealth === undefined) return null
  return currentHealth - data[0].health_score
}

// ─── computeSupplyHeadroom ────────────────────────────────────────────────────

export async function computeSupplyHeadroom(clientSlug: string): Promise<SupplyHeadroom> {
  const sb = getSupabaseAdmin()

  // Get available_cases_90d from client_settings
  const { data: settings } = await sb
    .from('client_settings')
    .select('available_cases_90d')
    .eq('client_slug', clientSlug)
    .single()

  const available = (settings as any)?.available_cases_90d ?? null

  // Get all active/maintaining zones for this client (using zone's own client_slug)
  const { data: zonesRaw } = await sb
    .from('zones')
    .select('id, projected_monthly_cases, posture')
    .eq('client_slug', clientSlug)
    .in('posture', ['active', 'maintaining'])

  const zones = zonesRaw || []

  // For zones with null projected_monthly_cases, fall back to their actual 90-day case total
  let projectedDemand90d = 0
  for (const z of zones) {
    if (z.projected_monthly_cases != null) {
      projectedDemand90d += z.projected_monthly_cases * 3
    } else {
      // Use the latest snapshot total_cases_90d as the projection fallback
      const { data: snap } = await sb
        .from('zone_metric_snapshots')
        .select('total_cases_90d')
        .eq('zone_id', z.id)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single()

      projectedDemand90d += (snap as any)?.total_cases_90d ?? 0
    }
  }

  const headroom_pct =
    available != null && projectedDemand90d > 0
      ? (available / projectedDemand90d) * 100
      : available != null && projectedDemand90d === 0
        ? null  // no active zones consuming supply — no meaningful headroom %
        : null

  // Warning when: available_cases_90d not set, or headroom < 120%
  const warning = available === null || (headroom_pct !== null && headroom_pct < 120)

  return {
    client_slug: clientSlug,
    available_cases_90d: available,
    projected_demand_90d: projectedDemand90d,
    headroom_pct,
    warning,
  }
}

// ─── upsertZoneSnapshot ───────────────────────────────────────────────────────
// Write one snapshot row for today. Called by the nightly cron and by the manual
// recompute endpoint. ON CONFLICT (zone_id, snapshot_date) updates in place.

export async function upsertZoneSnapshot(
  zoneId: string,
  metrics: ZoneMetrics,
): Promise<void> {
  const sb = getSupabaseAdmin()
  const today = isoDate(new Date())

  const { error } = await sb.from('zone_metric_snapshots').upsert(
    {
      zone_id: zoneId,
      snapshot_date: today,
      reach_pct: metrics.reach_pct,
      velocity: metrics.velocity,
      velocity_index: metrics.velocity_index,
      retention_pct: metrics.retention_pct,
      retention_reorder_pct: metrics.retention_reorder_pct,
      retention_menu_pct: metrics.retention_menu_pct,
      health_score: metrics.health_score,
      active_accounts: metrics.active_accounts,
      target_set_size: metrics.target_set_size,
      total_cases_90d: metrics.cases_90d,
      computed_at: new Date().toISOString(),
    },
    { onConflict: 'zone_id,snapshot_date' },
  )

  if (error) {
    console.error('concentric.upsertZoneSnapshot', error)
    throw error
  }
}
