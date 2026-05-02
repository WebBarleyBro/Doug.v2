// Concentric Growth Model — server-side computation module
// Import only from API routes, server actions, or cron jobs (uses service role).

import { getSupabaseAdmin } from '../supabase-server'
import { matchesGeoTerms } from './geo'
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
  effective_activity_threshold: number,
  effective_retention_threshold: number,
): ZoneMetrics {
  return {
    activity_rate_pct: 0,
    reach_pct: 0,
    velocity: 0,
    velocity_index: 0,
    retention_pct: 0,
    retention_reorder_pct: null,
    retention_menu_pct: null,
    volume_trend_pct: null,
    health_score: 0,
    target_set_size: 0,
    active_accounts: 0,
    total_accounts: 0,
    cases_90d: 0,
    cases_prior_90d: 0,
    accounts_lost: 0,
    health_trend_30d: null,
    effective_activity_threshold,
    effective_retention_threshold,
    accounts: [],
  }
}

// Sum line items — uses `cases` as the canonical unit.
// `quantity` is the fallback for orders logged without explicit case counts.
// Bottles are intentionally excluded: 1 bottle ≠ 1 case.
function sumCases(lineItems: any[]): number {
  return lineItems.reduce((s: number, li: any) => {
    const c = Number(li.cases)
    if (c > 0) return s + c
    return s + (Number(li.quantity) || 0)
  }, 0)
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
  const clientSlug = zone.client_slug ?? null
  if (!clientSlug) throw new Error(`Zone ${zoneId} has no client_slug`)

  const effectiveActivityThreshold = market.default_reach_threshold   // reusing existing DB column
  const effectiveRetentionThreshold = market.default_retention_threshold

  // 2. Build account list from CRM activity + market geo filter
  // (replaces zone_target_accounts — no manual target list required)
  const geoTerms: string[] = [
    ...(market.cities ?? []),
    ...(market.counties ?? []),
    ...(market.states ?? []),
    ...(market.zip_codes ?? []),
  ].map((g: string) => g.toLowerCase().trim()).filter(Boolean)

  const [visRes, plRes, orRes] = await Promise.all([
    sb.from('visits').select('account_id').eq('client_slug', clientSlug),
    sb.from('placements').select('account_id').eq('client_slug', clientSlug).is('lost_at', null),
    sb.from('purchase_orders').select('account_id').eq('client_slug', clientSlug).in('status', ['sent', 'fulfilled']),
  ])

  const brandAccountIds = new Set<string>([
    ...(visRes.data ?? []).map((r: any) => r.account_id as string),
    ...(plRes.data ?? []).map((r: any) => r.account_id as string),
    ...(orRes.data ?? []).map((r: any) => r.account_id as string),
  ].filter(Boolean))

  if (brandAccountIds.size === 0) {
    const snap = await fetchTrendSnapshot(sb, zoneId)
    return { ...emptyMetrics(effectiveActivityThreshold, effectiveRetentionThreshold), health_trend_30d: snap }
  }

  const { data: accountsRaw } = await sb
    .from('accounts')
    .select('id, name, address, account_type')
    .in('id', [...brandAccountIds])

  const filteredAccounts = geoTerms.length > 0
    ? (accountsRaw ?? []).filter((a: any) => matchesGeoTerms(a.address ?? '', geoTerms))
    : (accountsRaw ?? [])

  if (filteredAccounts.length === 0) {
    const snap = await fetchTrendSnapshot(sb, zoneId)
    return { ...emptyMetrics(effectiveActivityThreshold, effectiveRetentionThreshold), health_trend_30d: snap }
  }

  const accountIds = filteredAccounts.map((a: any) => a.id as string)
  const targetRows = filteredAccounts.map((a: any) => ({
    account_id: a.id as string,
    accounts: a,
  }))

  // 3. All-time sent/fulfilled orders — capped at 2 years to avoid unbounded queries
  const twoYearsAgo = isoDate(daysAgo(730))
  const { data: allOrdersRaw } = await sb
    .from('purchase_orders')
    .select('id, account_id, status, sent_at, created_at')
    .eq('client_slug', clientSlug)
    .in('account_id', accountIds)
    .in('status', ['sent', 'fulfilled'])
    .gte('created_at', twoYearsAgo)

  const allOrders = allOrdersRaw || []

  // 4. Current 90-day orders WITH line items (for case counts)
  const cutoff90 = daysAgo(90)
  const cutoff90Str = cutoff90.toISOString()
  const { data: orders90Raw } = await sb
    .from('purchase_orders')
    .select('id, account_id, sent_at, created_at, po_line_items(cases,quantity)')
    .eq('client_slug', clientSlug)
    .in('account_id', accountIds)
    .in('status', ['sent', 'fulfilled'])
    .or(`sent_at.gte.${cutoff90Str},and(sent_at.is.null,created_at.gte.${cutoff90Str})`)

  const orders90 = orders90Raw || []

  // 5. Prior 90-day orders (90–180 days ago) for volume trend
  const cutoff180 = daysAgo(180)
  const cutoff180Str = cutoff180.toISOString()
  const { data: ordersPrior90Raw } = await sb
    .from('purchase_orders')
    .select('id, account_id, sent_at, created_at, po_line_items(cases,quantity)')
    .eq('client_slug', clientSlug)
    .in('account_id', accountIds)
    .in('status', ['sent', 'fulfilled'])
    .or(
      `and(sent_at.gte.${cutoff180Str},sent_at.lt.${cutoff90Str}),` +
      `and(sent_at.is.null,created_at.gte.${cutoff180Str},created_at.lt.${cutoff90Str})`
    )

  const ordersPrior90 = ordersPrior90Raw || []

  // 6. Active menu placements for on-premise zones
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

  // 7. Per-account computation
  const accounts: AccountZoneMetric[] = targetRows.map((row: any) => {
    const acct = row.accounts as any
    const acctId: string = row.account_id

    const acctAllOrders = allOrders.filter(o => o.account_id === acctId)

    // Current 90d — client-side date guard ensures correctness regardless of DB filter behavior
    const acctOrders90 = orders90.filter(o => {
      if (o.account_id !== acctId) return false
      const d = new Date((o.sent_at || o.created_at) as string)
      return d >= cutoff90
    })

    // Prior 90d
    const acctOrdersPrior90 = ordersPrior90.filter(o => {
      if (o.account_id !== acctId) return false
      const d = new Date((o.sent_at || o.created_at) as string)
      return d >= cutoff180 && d < cutoff90
    })

    const orderDates = acctAllOrders
      .map(o => new Date((o.sent_at || o.created_at) as string))
      .sort((a, b) => b.getTime() - a.getTime())

    const lastOrderDate = orderDates[0] ?? null
    const totalOrders = acctAllOrders.length
    const orders_90d = acctOrders90.length

    const cases_90d = acctOrders90.reduce((sum, o) =>
      sum + sumCases((o as any).po_line_items || []), 0)

    const cases_prior_90d = acctOrdersPrior90.reduce((sum, o) =>
      sum + sumCases((o as any).po_line_items || []), 0)

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
      account_type: acct?.account_type ?? null,
      status,
      last_order: lastOrderDate ? lastOrderDate.toISOString() : null,
      total_orders: totalOrders,
      orders_90d,
      cases_90d,
      cases_prior_90d,
      velocity_per_month,
    }
  })

  // 8. Zone-level aggregation
  const activeAccounts = accounts.filter(a => a.status === 'active')
  const activeCount = activeAccounts.length
  const targetSetSize = accounts.length

  // total_accounts = accounts with ANY all-time order (activity rate denominator)
  const totalAccounts = accounts.filter(a => a.total_orders > 0).length

  // Activity rate: what % of your known customers are currently buying?
  const activity_rate_pct = totalAccounts > 0 ? (activeCount / totalAccounts) * 100 : 0

  // Reach (v1, kept for history)
  const reach_pct = targetSetSize > 0 ? (activeCount / targetSetSize) * 100 : 0

  const totalCases90d = accounts.reduce((s, a) => s + a.cases_90d, 0)
  const totalCasesPrior90d = accounts.reduce((s, a) => s + a.cases_prior_90d, 0)

  const velocity = activeCount > 0 ? totalCases90d / (activeCount * 3) : 0
  const velocity_index = Math.min((velocity / zone.velocity_target) * 100, 100)

  // Volume trend: % change vs prior period (null if no prior data)
  let volume_trend_pct: number | null = null
  if (totalCasesPrior90d > 0) {
    volume_trend_pct = ((totalCases90d - totalCasesPrior90d) / totalCasesPrior90d) * 100
  } else if (totalCases90d > 0) {
    volume_trend_pct = 50  // new growth — assign a positive signal
  }

  // Accounts lost: were active in prior period, now inactive
  const priorActiveIds = new Set(
    accounts
      .filter(a => a.cases_prior_90d > 0 || ordersPrior90.some(o => o.account_id === a.account_id))
      .map(a => a.account_id)
  )
  const accounts_lost = [...priorActiveIds].filter(id => {
    const a = accounts.find(ac => ac.account_id === id)
    return a && a.status !== 'active'
  }).length

  // 9. Retention
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

    // Only include components where data exists; don't zero out missing data
    const components: number[] = []
    if (retention_reorder_pct !== null) components.push(retention_reorder_pct)
    if (retention_menu_pct !== null) components.push(retention_menu_pct)
    retention_pct = components.length > 0
      ? components.reduce((s, v) => s + v, 0) / components.length
      : 0
  } else {
    retention_pct = retention_reorder_pct ?? 0
  }

  // 10. Health Score v2
  // trend_score: 0 = declining 50%+, 50 = flat, 100 = growing 50%+
  const trendClamped = volume_trend_pct !== null
    ? Math.min(50, Math.max(-50, volume_trend_pct))
    : 0   // no prior data = neutral
  const trend_score = 50 + trendClamped

  const health_score =
    activity_rate_pct * 0.30 +
    velocity_index * 0.25 +
    retention_pct * 0.30 +
    trend_score * 0.15

  // 11. 30-day trend from snapshots
  const health_trend_30d = await fetchTrendSnapshot(sb, zoneId, health_score)

  return {
    activity_rate_pct,
    reach_pct,
    velocity,
    velocity_index,
    retention_pct,
    retention_reorder_pct,
    retention_menu_pct,
    volume_trend_pct,
    health_score,
    target_set_size: targetSetSize,
    active_accounts: activeCount,
    total_accounts: totalAccounts,
    cases_90d: totalCases90d,
    cases_prior_90d: totalCasesPrior90d,
    accounts_lost,
    health_trend_30d,
    effective_activity_threshold: effectiveActivityThreshold,
    effective_retention_threshold: effectiveRetentionThreshold,
    accounts,
  }
}

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

  const { data: settings } = await sb
    .from('client_settings')
    .select('available_cases_90d')
    .eq('client_slug', clientSlug)
    .single()

  const available = (settings as any)?.available_cases_90d ?? null

  const { data: zonesRaw } = await sb
    .from('zones')
    .select('id, projected_monthly_cases, posture')
    .eq('client_slug', clientSlug)
    .in('posture', ['active', 'maintaining'])

  const zones = zonesRaw || []

  // Fetch all latest snapshots in one query to avoid N+1
  const zoneIds = zones.filter((z: any) => z.projected_monthly_cases == null).map((z: any) => z.id)
  const snapMap: Record<string, number> = {}
  if (zoneIds.length > 0) {
    const { data: snaps } = await sb
      .from('zone_metric_snapshots')
      .select('zone_id, total_cases_90d, snapshot_date')
      .in('zone_id', zoneIds)
      .order('snapshot_date', { ascending: false })
    for (const s of snaps || []) {
      if (!snapMap[s.zone_id]) snapMap[s.zone_id] = (s as any).total_cases_90d ?? 0
    }
  }

  let projectedDemand90d = 0
  for (const z of zones) {
    if ((z as any).projected_monthly_cases != null) {
      projectedDemand90d += (z as any).projected_monthly_cases * 3
    } else {
      projectedDemand90d += snapMap[z.id] ?? 0
    }
  }

  const headroom_pct =
    available != null && projectedDemand90d > 0
      ? (available / projectedDemand90d) * 100
      : null

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
      // v2 metrics
      activity_rate_pct: metrics.activity_rate_pct,
      volume_trend_pct: metrics.volume_trend_pct,
      cases_prior_90d: metrics.cases_prior_90d,
      accounts_lost: metrics.accounts_lost,
      total_accounts: metrics.total_accounts,
      // shared metrics
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
