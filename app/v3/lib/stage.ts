// Account Intelligence Engine
//
// Replaces numeric grades with a relationship stage + momentum signal system.
// The question this answers: "What kind of account is this, and what do I do today?"
//
// Stage = WHERE the relationship is in the funnel (set by placement/order/visit facts)
// Signal = WHERE it's GOING (momentum: rising, steady, needs attention, at risk)
// Next Action = WHAT TO DO on the next visit (derived from stage × signal)
//
// Visit cadence is auto-computed from the account's own visit history.
// No manual "visit every X days" target — the system learns from rep behavior.
//
// Theory base:
//   - Miller Heiman Strategic Selling: account status drives call objective
//   - Challenger Sale: reps with clear visit purpose outperform by ~30%
//   - BJ Fogg Tiny Habits: prompt (clear next action) is the missing leg of behavior change
//   - Three-tier spirits: WP are influencers, not sellers — measure influence health

export type AccountStage =
  | 'prospect'   // In territory, never meaningfully engaged
  | 'warming'    // Multiple visits, building relationship, no placement yet
  | 'placed'     // Product is on shelf / on menu — the first real win
  | 'velocity'   // Actively reordering — brand is genuinely moving here
  | 'champion'   // Multi-brand placed + features or staff training events logged
  | 'stalled'    // Was placed/velocity, now silent past 2× expected reorder cadence

export type AccountSignal =
  | 'rising'       // Last visit was a win OR new placement this period
  | 'steady'       // On cadence, no flags, healthy
  | 'follow_up'    // Open "Will Order Soon" or "Needs Follow Up" — must close the loop
  | 'overdue'      // Past expected visit cadence (auto-computed)
  | 'cooling'      // Order demand is decelerating (from demand engine)
  | 'urgent'       // Demand is at_risk / dormant, or stalled stage

// Colors for stage chips — calibrated for the v3 dark theme
export const STAGE_COLOR: Record<AccountStage, string> = {
  prospect:  'rgba(255,255,255,0.22)',
  warming:   '#a08440',   // muted gold — potential
  placed:    '#6878b4',   // slate blue — product is in
  velocity:  '#5a9ea0',   // teal — moving, growing
  champion:  '#c4a46e',   // warm amber — the highest relationship level
  stalled:   '#bf7850',   // sienna — attention needed
}

export const STAGE_LABEL: Record<AccountStage, string> = {
  prospect:  'Prospect',
  warming:   'Warming',
  placed:    'Placed',
  velocity:  'Velocity',
  champion:  'Champion',
  stalled:   'Stalled',
}

// One-line description shown in the funnel bar tooltip
export const STAGE_DESC: Record<AccountStage, string> = {
  prospect:  'In territory, not yet engaged',
  warming:   'Visiting regularly, building toward first placement',
  placed:    'Product on shelf or menu — not yet reordering',
  velocity:  'Actively reordering — brand is moving here',
  champion:  'Multi-brand, features, staff trained — true advocate',
  stalled:   'Was ordering; now silent past expected cadence',
}

export const SIGNAL_COLOR: Record<AccountSignal, string> = {
  rising:     '#5a9ea0',
  steady:     'rgba(255,255,255,0.35)',
  follow_up:  '#c4a46e',
  overdue:    '#a08440',
  cooling:    '#bf7850',
  urgent:     '#e05050',
}

export const SIGNAL_LABEL: Record<AccountSignal, string> = {
  rising:     'Rising',
  steady:     'Steady',
  follow_up:  'Follow Up',
  overdue:    'Overdue',
  cooling:    'Cooling',
  urgent:     'Urgent',
}

// Priority order for sorting — higher is more urgent
export const SIGNAL_WEIGHT: Record<AccountSignal, number> = {
  urgent:    6,
  cooling:   5,
  follow_up: 4,
  overdue:   3,
  steady:    1,
  rising:    2,   // rising is good but still worth visiting soon
}

export interface AccountIntel {
  stage:           AccountStage
  signal:          AccountSignal
  nextAction:      string              // Specific, actionable, visit-ready
  cadenceDays:     number              // Auto-computed expected visit interval
  daysUntilDue:    number              // Negative = overdue by that many days
  isOverdue:       boolean
  activePlacements: number
  reorderingCount:  number
  openFollowUp:     string | null      // Status text of the open follow-up visit
  openFollowUpDaysAgo: number | null
  lastVisitDaysAgo: number | null
  lastVisitStatus:  string | null
  visitCount:       number
  brandCount:       number             // # of brands placed (for champion detection)
}

// ── Stage computation ─────────────────────────────────────────────────────────

function computeStage(params: {
  visitCount:        number
  recentWinVisits:   number   // win-status visits in last 90d
  activePlacements:  number   // placements not lost_at
  reorderingCount:   number   // placements with status === 'reordering'
  brandCount:        number   // distinct client_slugs with active placement
  hasWinEvent:       boolean  // any "Menu Feature Won" visit
  demandWorstState:  string   // from demand engine
  lastVisitDaysAgo:  number | null
  expectedCadence:   number
}): AccountStage {
  const {
    visitCount, recentWinVisits, activePlacements,
    reorderingCount, brandCount, hasWinEvent,
    demandWorstState, lastVisitDaysAgo, expectedCadence,
  } = params

  // Champion: multiple brands placed AND (has feature win OR multi-brand reordering)
  if (brandCount >= 2 && reorderingCount >= 1 && (hasWinEvent || reorderingCount >= 2)) {
    return 'champion'
  }

  // Stalled: was placed or active, now demand is dormant AND overdue on visits
  if (
    activePlacements > 0 &&
    ['dormant', 'at_risk'].includes(demandWorstState) &&
    lastVisitDaysAgo !== null &&
    lastVisitDaysAgo > expectedCadence * 1.5
  ) {
    return 'stalled'
  }

  // Velocity: actively reordering at least one brand
  if (reorderingCount >= 1) return 'velocity'

  // Placed: product in, but not yet reordering
  if (activePlacements > 0) return 'placed'

  // Warming: multiple meaningful visits (not just check-ins), no placement yet
  if (visitCount >= 3 || recentWinVisits >= 1) return 'warming'

  return 'prospect'
}

// ── Signal computation ────────────────────────────────────────────────────────

function computeSignal(params: {
  stage:             AccountStage
  lastVisitStatus:   string | null
  lastVisitDaysAgo:  number | null
  openFollowUp:      string | null   // 'Will Order Soon' | 'Needs Follow Up' | null
  demandWorstState:  string
  isOverdue:         boolean
  recentWinVisits:   number
  placementGainedThisMonth: boolean
}): AccountSignal {
  const {
    stage, lastVisitStatus, openFollowUp, demandWorstState,
    isOverdue, recentWinVisits, placementGainedThisMonth,
  } = params

  // Urgent: stalled stage, or demand is at_risk/dormant
  if (stage === 'stalled') return 'urgent'
  if (['at_risk', 'dormant'].includes(demandWorstState)) return 'urgent'

  // Cooling: demand is cooling or overdue (early warning)
  if (['cooling', 'overdue'].includes(demandWorstState)) return 'cooling'

  // Follow-up: open soft commitment that needs closing
  if (openFollowUp === 'Will Order Soon' || openFollowUp === 'Needs Follow Up') return 'follow_up'

  // Overdue on visit cadence
  if (isOverdue) return 'overdue'

  // Rising: last visit was a win, or just gained a placement
  const WIN = new Set(['New Placement', 'Menu Feature Won', 'Just Ordered'])
  if ((lastVisitStatus && WIN.has(lastVisitStatus)) || placementGainedThisMonth || recentWinVisits >= 2) return 'rising'

  return 'steady'
}

// ── Next-action generator ─────────────────────────────────────────────────────
// Research basis: reps with explicit visit objectives are ~30% more effective
// (Sales Management Association, 2019). The prompt must be specific enough to
// say OUT LOUD walking in the door.

function nextAction(
  stage: AccountStage,
  signal: AccountSignal,
  context: {
    openFollowUpDaysAgo: number | null
    activePlacements:    number
    lastVisitDaysAgo:    number | null
    brandCount:          number
    reorderingCount:     number
  }
): string {
  const { openFollowUpDaysAgo, activePlacements, lastVisitDaysAgo, brandCount } = context

  // Stalled accounts always get the same objective — re-verify the placement
  if (stage === 'stalled') {
    return 'Verify product is still on shelf and find out why reorders stopped'
  }

  if (stage === 'champion') {
    return 'Deepen the relationship — ask for a referral or co-hosted tasting event'
  }

  if (stage === 'velocity') {
    if (signal === 'cooling') return 'Reorder cadence is slowing — check shelf position and staff knowledge'
    if (signal === 'urgent')  return 'Orders have stopped — investigate shelf position and reorder process'
    if (brandCount < 2)       return 'Strong velocity — introduce a second brand while the relationship is warm'
    return 'Reinforce the relationship — discuss exclusive menu feature or upcoming events'
  }

  if (stage === 'placed') {
    if (signal === 'follow_up' && openFollowUpDaysAgo !== null) {
      return `Will Order Soon was logged ${openFollowUpDaysAgo}d ago — close the loop today and confirm the order`
    }
    if (signal === 'cooling' || signal === 'urgent') {
      return 'Placement is at risk — offer staff training or a pour promotion to drive sell-through'
    }
    return 'Product is placed — offer staff training to drive sell-through and earn the reorder'
  }

  if (stage === 'warming') {
    if (signal === 'follow_up' && openFollowUpDaysAgo !== null) {
      return `Follow-up was logged ${openFollowUpDaysAgo}d ago — ask for the placement commitment today`
    }
    if (lastVisitDaysAgo !== null && lastVisitDaysAgo < 7) {
      return 'Recent visit — prepare a formal placement proposal with pricing and a pour-cost analysis'
    }
    return 'Relationship is building — come with a placement proposal and samples for the decision maker'
  }

  // Prospect
  return 'First meaningful contact — find the buyer, introduce the brand, and leave samples'
}

// ── Visit cadence (auto-computed) ─────────────────────────────────────────────
// Learn from actual visit rhythm. No manual targets.
// Falls back to stage-based defaults when history is thin (<4 visits).

function computeCadence(
  visitDates: string[],  // ISO date strings, any order
  stage: AccountStage,
): number {
  if (visitDates.length >= 4) {
    const sorted = [...visitDates]
      .map(d => new Date(d).getTime())
      .sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i] - sorted[i - 1]) / 86400000)
    }
    // Median interval
    const mid  = Math.floor(gaps.length / 2)
    const sorted_gaps = [...gaps].sort((a, b) => a - b)
    return Math.round(sorted_gaps.length % 2 === 0
      ? (sorted_gaps[mid - 1] + sorted_gaps[mid]) / 2
      : sorted_gaps[mid])
  }

  // Stage-based defaults (derived from on-premise spirits industry norms):
  // Champion/Velocity accounts are high-value — visit more frequently
  // Prospects don't need constant attention until warming begins
  const defaults: Record<AccountStage, number> = {
    champion:  14,
    velocity:  14,
    placed:    21,
    warming:   30,
    stalled:   21,   // stalled accounts need more attention, not less
    prospect:  45,
  }
  return defaults[stage]
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeAccountIntel(params: {
  accountId:   string
  visits:      any[]       // all visits for this account
  placements:  any[]       // all placements for this account (may include lost)
  orders:      any[]       // all orders for this account
  clientSlugs: string[]    // all client slugs in the system
  demandByBrand: Record<string, { state: string }>  // from demand engine
  now?:        number      // override for testing
}): AccountIntel {
  const { accountId, visits, placements, orders, clientSlugs, demandByBrand, now = Date.now() } = params

  const WIN_STATUS  = new Set(['New Placement', 'Menu Feature Won', 'Just Ordered'])
  const FOLLOW_UP_STATUS = new Set(['Will Order Soon', 'Needs Follow Up'])

  // ── Visits
  const sortedVisits = [...visits]
    .sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime())

  const visitCount = sortedVisits.length
  const last90 = now - 90 * 86400000
  const last30 = now - 30 * 86400000

  const recentWinVisits = sortedVisits.filter(v =>
    WIN_STATUS.has(v.status) && new Date(v.visited_at).getTime() > last90
  ).length

  const hasWinEvent = sortedVisits.some(v => v.status === 'Menu Feature Won')

  const lastVisit = sortedVisits[0] ?? null
  const lastVisitDaysAgo = lastVisit
    ? Math.floor((now - new Date(lastVisit.visited_at).getTime()) / 86400000)
    : null
  const lastVisitStatus = lastVisit?.status ?? null

  // Most recent open follow-up (not cleared)
  const openFollowUpVisit = sortedVisits.find(v =>
    FOLLOW_UP_STATUS.has(v.status) &&
    !v.follow_up_cleared_at &&
    !v.follow_up_dismissed_at
  )
  const openFollowUp = openFollowUpVisit?.status ?? null
  const openFollowUpDaysAgo = openFollowUpVisit
    ? Math.floor((now - new Date(openFollowUpVisit.visited_at).getTime()) / 86400000)
    : null

  // ── Placements
  const activePlacements = placements.filter(p => !p.lost_at)
  const reorderingCount  = activePlacements.filter(p => p.status === 'reordering').length
  const brandCount       = new Set(activePlacements.map(p => p.client_slug)).size

  // Placement gained this month?
  const placementGainedThisMonth = placements.some(p =>
    !p.lost_at && new Date(p.created_at).getTime() > last30
  )

  // ── Demand (worst across all brands)
  const demandStates = Object.values(demandByBrand).map(d => d.state)
  const DEMAND_SEVERITY_MAP: Record<string, number> = {
    establishing: 0, steady: 1, heating: 2, cooling: 3, overdue: 4, at_risk: 5, dormant: 6,
  }
  const demandWorstState = demandStates.reduce((worst, s) =>
    (DEMAND_SEVERITY_MAP[s] ?? 0) > (DEMAND_SEVERITY_MAP[worst] ?? 0) ? s : worst,
    'establishing'
  )

  // ── Stage and cadence (computed together — cadence depends on stage)
  // Temporary stage for cadence default selection (before final stage calculation)
  const provisionalStage = computeStage({
    visitCount,
    recentWinVisits,
    activePlacements: activePlacements.length,
    reorderingCount,
    brandCount,
    hasWinEvent,
    demandWorstState,
    lastVisitDaysAgo,
    expectedCadence: 30, // rough placeholder for the stalled check
  })

  const visitDates = sortedVisits.map(v => v.visited_at as string)
  const cadenceDays = computeCadence(visitDates, provisionalStage)

  // Final stage using accurate cadence
  const stage = computeStage({
    visitCount,
    recentWinVisits,
    activePlacements: activePlacements.length,
    reorderingCount,
    brandCount,
    hasWinEvent,
    demandWorstState,
    lastVisitDaysAgo,
    expectedCadence: cadenceDays,
  })

  // ── Overdue on visits
  const daysUntilDue = lastVisitDaysAgo !== null
    ? cadenceDays - lastVisitDaysAgo
    : -cadenceDays   // never visited = overdue by a full cadence
  const isOverdue = daysUntilDue < 0

  // ── Signal
  const signal = computeSignal({
    stage,
    lastVisitStatus,
    lastVisitDaysAgo,
    openFollowUp,
    demandWorstState,
    isOverdue,
    recentWinVisits,
    placementGainedThisMonth,
  })

  // ── Next action
  const action = nextAction(stage, signal, {
    openFollowUpDaysAgo,
    activePlacements: activePlacements.length,
    lastVisitDaysAgo,
    brandCount,
    reorderingCount,
  })

  return {
    stage,
    signal,
    nextAction:           action,
    cadenceDays,
    daysUntilDue,
    isOverdue,
    activePlacements:     activePlacements.length,
    reorderingCount,
    openFollowUp,
    openFollowUpDaysAgo,
    lastVisitDaysAgo,
    lastVisitStatus,
    visitCount,
    brandCount,
  }
}

// ── Funnel summary ────────────────────────────────────────────────────────────

export function buildFunnelSummary(
  intels: Record<string, AccountIntel>
): Record<AccountStage, number> {
  const counts: Record<AccountStage, number> = {
    prospect: 0, warming: 0, placed: 0, velocity: 0, champion: 0, stalled: 0,
  }
  for (const intel of Object.values(intels)) {
    counts[intel.stage]++
  }
  return counts
}

// ── Build intel map for all accounts in one pass ──────────────────────────────

export function buildIntelMap(params: {
  accountIds:   string[]
  allVisits:    any[]
  allPlacements: any[]
  allOrders:    any[]
  clientSlugs:  string[]
  demandMap:    Record<string, Record<string, { state: string }>>
}): Record<string, AccountIntel> {
  const { accountIds, allVisits, allPlacements, allOrders, clientSlugs, demandMap } = params
  const map: Record<string, AccountIntel> = {}

  for (const accountId of accountIds) {
    const visits     = allVisits.filter(v => v.account_id === accountId)
    const placements = allPlacements.filter(p => p.account_id === accountId)
    const orders     = allOrders.filter(o => o.account_id === accountId)
    const demandByBrand = demandMap[accountId] ?? {}

    map[accountId] = computeAccountIntel({
      accountId, visits, placements, orders, clientSlugs, demandByBrand,
    })
  }
  return map
}

// ── Sort comparator for accounts list ────────────────────────────────────────
// Primary: signal urgency DESC (urgent accounts first)
// Secondary: stage depth DESC (velocity/champion before prospect)
// Tertiary: overdue days DESC

const STAGE_WEIGHT: Record<AccountStage, number> = {
  stalled:  6,
  velocity: 5,
  champion: 4,
  placed:   3,
  warming:  2,
  prospect: 1,
}

export function compareByUrgency(
  a: AccountIntel,
  b: AccountIntel,
): number {
  const sigDiff = SIGNAL_WEIGHT[b.signal] - SIGNAL_WEIGHT[a.signal]
  if (sigDiff !== 0) return sigDiff
  const stageDiff = STAGE_WEIGHT[b.stage] - STAGE_WEIGHT[a.stage]
  if (stageDiff !== 0) return stageDiff
  return (a.daysUntilDue) - (b.daysUntilDue)  // more overdue = first
}
