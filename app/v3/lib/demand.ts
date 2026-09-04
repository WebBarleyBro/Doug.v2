// Demand rhythm engine — pure computation, no network calls
// Judges each account against its own reorder cadence, not a global threshold.
// Requires minimum 3 orders before predicting; below that → 'establishing'.

export type DemandState =
  | 'establishing'  // < 3 orders — honest about thin data
  | 'heating'       // ordering faster than normal (cadence_ratio < 0.85)
  | 'steady'        // on rhythm, not yet overdue
  | 'cooling'       // slowing down but not yet late — early warning
  | 'overdue'       // past expected reorder date by > 0.5× median interval
  | 'at_risk'       // past by > 1× median interval
  | 'dormant'       // past by > 2× median interval

export interface AccountDemand {
  state: DemandState
  daysOverdue: number | null         // null when establishing
  cadenceRatio: number | null        // recent interval ÷ median interval
  medianIntervalDays: number | null  // typical gap between orders
  lastOrderDate: string | null       // YYYY-MM-DD
  expectedReorderDate: string | null // YYYY-MM-DD
  orderCount: number
}

export type BrandConstraint =
  | 'distribution'      // placed/visited < 40% — push more placements
  | 'pull_through'      // reordering/placed < 50% — placed but not selling
  | 'depth'             // both rates healthy — deepen what's working
  | 'insufficient_data' // fewer than 3 visited accounts

export const DEMAND_SEVERITY: Record<DemandState, number> = {
  establishing: 0,
  steady:       1,
  heating:      2,
  cooling:      3,
  overdue:      4,
  at_risk:      5,
  dormant:      6,
}

export const DEMAND_LABEL: Record<DemandState, string> = {
  establishing: 'New',
  heating:      'Heating',
  steady:       'Steady',
  cooling:      'Cooling',
  overdue:      'Overdue',
  at_risk:      'At Risk',
  dormant:      'Dormant',
}

export const DEMAND_COLOR: Record<DemandState, string> = {
  establishing: 'rgba(255,255,255,0.18)',
  steady:       'rgba(255,255,255,0.35)',
  heating:      '#5a9ea0',
  cooling:      '#a08440',
  overdue:      '#bf7850',
  at_risk:      '#e05050',
  dormant:      '#8b2020',
}

export const CONSTRAINT_LABEL: Record<BrandConstraint, string> = {
  distribution:      'Distribution',
  pull_through:      'Pull-through',
  depth:             'Depth',
  insufficient_data: 'Building',
}

export const CONSTRAINT_COLOR: Record<BrandConstraint, string> = {
  distribution:      '#a08440',  // gold — push placements
  pull_through:      '#bf7850',  // sienna — placed not selling
  depth:             '#5a9ea0',  // teal — deepening is the best problem to have
  insufficient_data: 'rgba(255,255,255,0.25)',
}

// ── Core helpers ──────────────────────────────────────────────────────────────

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

// ── Per-account demand computation ────────────────────────────────────────────

export function computeAccountDemand(
  orders: Array<{
    account_id?: string | null
    client_slug?: string | null
    status: string
    sent_at?: string | null
    created_at: string
  }>,
  accountId: string,
  clientSlug: string,
): AccountDemand {
  const eligible = orders
    .filter(o =>
      o.account_id === accountId &&
      o.client_slug === clientSlug &&
      ['sent', 'fulfilled'].includes(o.status),
    )
    .map(o => new Date(o.sent_at || o.created_at).getTime())
    .sort((a, b) => a - b)

  const orderCount = eligible.length
  const lastOrderMs = eligible.length > 0 ? eligible[eligible.length - 1] : null
  const lastOrderDate = lastOrderMs
    ? new Date(lastOrderMs).toISOString().slice(0, 10)
    : null

  if (orderCount < 3) {
    return {
      state: 'establishing',
      daysOverdue: null,
      cadenceRatio: null,
      medianIntervalDays: null,
      lastOrderDate,
      expectedReorderDate: null,
      orderCount,
    }
  }

  const gaps: number[] = []
  for (let i = 1; i < eligible.length; i++) {
    gaps.push((eligible[i] - eligible[i - 1]) / 86400000)
  }

  const medianInterval = median(gaps)
  const recentGaps = gaps.slice(-Math.min(3, gaps.length))
  const recentMedian = median(recentGaps)
  const cadenceRatio = recentMedian / medianInterval

  const expectedReorderMs = lastOrderMs! + medianInterval * 86400000
  const expectedReorderDate = new Date(expectedReorderMs).toISOString().slice(0, 10)
  const daysOverdue = (Date.now() - expectedReorderMs) / 86400000

  let state: DemandState
  if      (daysOverdue > medianInterval * 2)   state = 'dormant'
  else if (daysOverdue > medianInterval)        state = 'at_risk'
  else if (daysOverdue > medianInterval * 0.5)  state = 'overdue'
  else if (cadenceRatio > 1.15)                 state = 'cooling'
  else if (cadenceRatio < 0.85)                 state = 'heating'
  else                                           state = 'steady'

  return {
    state,
    daysOverdue: Math.round(daysOverdue),
    cadenceRatio: Math.round(cadenceRatio * 100) / 100,
    medianIntervalDays: Math.round(medianInterval),
    lastOrderDate,
    expectedReorderDate,
    orderCount,
  }
}

// ── Worst state across brands for one account (for the dot color) ─────────────

export function worstDemandState(
  demandByBrand: Record<string, AccountDemand>,
): DemandState {
  let worst: DemandState = 'establishing'
  for (const d of Object.values(demandByBrand)) {
    if (DEMAND_SEVERITY[d.state] > DEMAND_SEVERITY[worst]) worst = d.state
  }
  return worst
}

// ── Brand constraint diagnosis ────────────────────────────────────────────────
// Walk the funnel in order: visited → placed → reordering.
// The first broken stage is the constraint — can't fix depth before pull-through.

export function computeBrandConstraint(
  visitedAccountIds: Set<string>,
  placedAccountIds: Set<string>,
  reorderingAccountIds: Set<string>,
): BrandConstraint {
  if (visitedAccountIds.size < 3) return 'insufficient_data'
  const placementRate = placedAccountIds.size / visitedAccountIds.size
  const reorderRate   = placedAccountIds.size > 0
    ? reorderingAccountIds.size / placedAccountIds.size
    : 0
  if (placementRate < 0.40) return 'distribution'
  if (reorderRate   < 0.50) return 'pull_through'
  return 'depth'
}

// ── Build demand map for all accounts × all brands in one pass ────────────────

export function buildDemandMap(
  orders: any[],
  accountIds: string[],
  clientSlugs: string[],
): Record<string, Record<string, AccountDemand>> {
  const map: Record<string, Record<string, AccountDemand>> = {}
  for (const accountId of accountIds) {
    map[accountId] = {}
    for (const slug of clientSlugs) {
      map[accountId][slug] = computeAccountDemand(orders, accountId, slug)
    }
  }
  return map
}

// ── Attention list scoring ────────────────────────────────────────────────────
// Sort key = urgency_tier × commission_weight so high-value cooling accounts
// outrank low-value dormant ones.

const URGENCY_WEIGHT: Record<DemandState, number> = {
  dormant:      6,
  at_risk:      5,
  overdue:      4,
  cooling:      3,
  heating:      2,  // heating = good signal, worth deepening
  steady:       0,
  establishing: 0,
}

export interface AttentionItem {
  accountId: string
  accountName: string
  demandState: DemandState
  worstBrand: string
  demand: AccountDemand
  score: number
  daysOverdueVisit?: number  // days since last visit vs visit_frequency_days
  activePlacements: number
  gradeScore: number         // 0–100 from grading system
}

export function buildAttentionList(params: {
  accounts: Array<{ id: string; name: string; last_visited?: string | null; visit_frequency_days?: number }>
  orders: any[]
  placements: any[]
  clientSlugs: string[]
  gradeMap: Record<string, { score: number }>
  limit?: number
}): AttentionItem[] {
  const { accounts, orders, placements, clientSlugs, gradeMap, limit = 10 } = params

  const accountIds = accounts.map(a => a.id)
  const demandMap  = buildDemandMap(orders, accountIds, clientSlugs)

  // Active placements per account (not lost)
  const placsByAccount: Record<string, number> = {}
  for (const p of placements) {
    if (p.account_id && !p.lost_at) {
      placsByAccount[p.account_id] = (placsByAccount[p.account_id] ?? 0) + 1
    }
  }

  const items: AttentionItem[] = []
  const now = Date.now()

  for (const account of accounts) {
    const byBrand = demandMap[account.id] ?? {}
    const worst   = worstDemandState(byBrand)
    const urgency = URGENCY_WEIGHT[worst]

    // Also flag placed-but-never-reordered accounts (urgency 3.5)
    const hasPlacement    = (placsByAccount[account.id] ?? 0) > 0
    const hasAnyOrder     = Object.values(byBrand).some(d => d.orderCount > 0)
    const placedNoOrders  = hasPlacement && !hasAnyOrder

    const effectiveUrgency = placedNoOrders && urgency < 3 ? 3.5 : urgency
    if (effectiveUrgency === 0) continue

    const gradeScore      = gradeMap[account.id]?.score ?? 0
    const commissionWeight = 0.3 + (gradeScore / 100) * 0.7
    const score            = effectiveUrgency * commissionWeight

    // Days overdue on visit frequency
    let daysOverdueVisit: number | undefined
    if (account.last_visited && account.visit_frequency_days) {
      const lastMs = new Date(account.last_visited).getTime()
      const daysAgo = (now - lastMs) / 86400000
      if (daysAgo > account.visit_frequency_days) {
        daysOverdueVisit = Math.round(daysAgo - account.visit_frequency_days)
      }
    }

    // Which brand is the most urgent for this account?
    let worstBrand = ''
    let worstDemand: AccountDemand = { state: 'establishing', daysOverdue: null, cadenceRatio: null, medianIntervalDays: null, lastOrderDate: null, expectedReorderDate: null, orderCount: 0 }
    for (const [slug, d] of Object.entries(byBrand)) {
      if (DEMAND_SEVERITY[d.state] > DEMAND_SEVERITY[worstDemand.state]) {
        worstDemand = d
        worstBrand  = slug
      }
    }

    items.push({
      accountId:        account.id,
      accountName:      account.name,
      demandState:      worst,
      worstBrand,
      demand:           worstDemand,
      score,
      daysOverdueVisit,
      activePlacements: placsByAccount[account.id] ?? 0,
      gradeScore,
    })
  }

  return items.sort((a, b) => b.score - a.score).slice(0, limit)
}
