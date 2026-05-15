// ── Account Grading System ────────────────────────────────────────────────────
// S / A / B / C / D — Japanese/LoL-style ranking.
// S is rare. Grades drive visit prioritization, at-risk alerts, and rep focus.
//
// Formula (0–100 composite):
//   Revenue     35% — log-normalized all-time order revenue
//   Velocity    20% — order frequency in last 90 days
//   Placements  20% — active placement health (reordering > on_shelf > ordered > committed)
//   Win Rate    15% — % visits in last 90d that produced a win outcome
//   Recency     10% — days since last visit (decays)

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D'

export interface GradeResult {
  grade:    Grade
  score:    number   // 0–100
  scores: {
    revenue:   number
    velocity:  number
    placement: number
    winRate:   number
    recency:   number
  }
  momentum: 'up' | 'down' | 'flat'  // 30-day activity trend
}

const WIN = new Set(['New Placement', 'Menu Feature Won', 'Just Ordered'])

const PLAC_WEIGHT: Record<string, number> = {
  reordering: 1.00,
  on_shelf:   0.75,
  ordered:    0.25,
  committed:  0.10,
}

const GRADE_BREAK: [number, Grade][] = [
  [82, 'S'],
  [65, 'A'],
  [45, 'B'],
  [22, 'C'],
  [0,  'D'],
]

export function computeGrade(
  accountId:     string,
  allOrders:     any[],      // purchase_orders with account_id, status, total_amount, sent_at, created_at
  allVisits:     any[],      // visits from last 90 days with account_id, visited_at, status
  allPlacements: any[],      // placements with account_id, status, lost_at
  maxRevenue:    number,     // max all-time revenue across all accounts (for log normalization)
): GradeResult {
  const acctOrders = allOrders.filter(o =>
    o.account_id === accountId && ['sent', 'fulfilled'].includes(o.status)
  )
  const acctVisits = allVisits.filter(v => v.account_id === accountId)
  const acctPlac   = allPlacements.filter(p => p.account_id === accountId && !p.lost_at)

  // ── Revenue (35%) ────────────────────────────────────────────────────────
  const totalRev = acctOrders.reduce((s: number, o: any) => {
    const lineTotal = (o.po_line_items ?? []).reduce((ls: number, li: any) => ls + (Number(li.total) || 0), 0)
    return s + (lineTotal || Number(o.total_amount) || 0)
  }, 0)
  const revenueScore = maxRevenue > 1
    ? Math.min((Math.log(totalRev + 1) / Math.log(maxRevenue + 1)) * 100, 100)
    : 0

  // ── Velocity (20%) — orders in last 90 days ──────────────────────────────
  const since90 = Date.now() - 90 * 86400000
  const recentOrders = acctOrders.filter(o =>
    new Date(o.sent_at || o.created_at).getTime() > since90
  ).length
  const velocityScore = Math.min((recentOrders / 3) * 100, 100)  // 3+ orders = 100

  // ── Placement health (20%) ───────────────────────────────────────────────
  const placScore = acctPlac.length > 0
    ? Math.min(
        (acctPlac.reduce((s: number, p: any) => s + (PLAC_WEIGHT[p.status] ?? 0), 0) / acctPlac.length) * 100,
        100
      )
    : 0

  // ── Win rate (15%) — last 90 days ────────────────────────────────────────
  const wins = acctVisits.filter(v => WIN.has(v.status)).length
  const winRateScore = acctVisits.length > 0 ? (wins / acctVisits.length) * 100 : 0

  // ── Recency (10%) ────────────────────────────────────────────────────────
  let recencyScore = 0
  if (acctVisits.length > 0) {
    const latestMs = Math.max(...acctVisits.map(v => new Date(v.visited_at).getTime()))
    const daysAgo  = (Date.now() - latestMs) / 86400000
    recencyScore =
      daysAgo <= 7  ? 100 :
      daysAgo <= 14 ? 80 :
      daysAgo <= 30 ? 60 :
      daysAgo <= 60 ? 30 : 10
  }

  // ── Composite ────────────────────────────────────────────────────────────
  const score = Math.round(
    revenueScore  * 0.35 +
    velocityScore * 0.20 +
    placScore     * 0.20 +
    winRateScore  * 0.15 +
    recencyScore  * 0.10
  )

  let grade: Grade = 'D'
  for (const [threshold, g] of GRADE_BREAK) {
    if (score >= threshold) { grade = g; break }
  }

  // ── Momentum — compare first half vs second half of visit window ─────────
  const midMs   = Date.now() - 45 * 86400000
  const recent  = acctVisits.filter(v => new Date(v.visited_at).getTime() > midMs).length
  const older   = acctVisits.length - recent
  const momentum: 'up' | 'down' | 'flat' =
    recent > older * 1.4 ? 'up' :
    recent < older * 0.6 ? 'down' : 'flat'

  return {
    grade, score,
    scores: {
      revenue:   Math.round(revenueScore),
      velocity:  Math.round(velocityScore),
      placement: Math.round(placScore),
      winRate:   Math.round(winRateScore),
      recency:   Math.round(recencyScore),
    },
    momentum,
  }
}

// ── Grade visual config ───────────────────────────────────────────────────────

export const GRADE_CONFIG: Record<Grade, {
  color:  string
  glow:   string
  bg:     string
  border: string
  label:  string
}> = {
  S: {
    color:  '#e8d48a',
    glow:   '0 0 10px rgba(232,212,138,0.60), 0 0 22px rgba(232,212,138,0.22)',
    bg:     'rgba(232,212,138,0.10)',
    border: 'rgba(232,212,138,0.38)',
    label:  'Elite',
  },
  A: {
    color:  '#5a9ea0',
    glow:   '0 0 8px rgba(90,158,160,0.48), 0 0 18px rgba(90,158,160,0.18)',
    bg:     'rgba(90,158,160,0.09)',
    border: 'rgba(90,158,160,0.30)',
    label:  'Strong',
  },
  B: {
    color:  '#6878b4',
    glow:   '0 0 6px rgba(104,120,180,0.35)',
    bg:     'rgba(104,120,180,0.07)',
    border: 'rgba(104,120,180,0.22)',
    label:  'Solid',
  },
  C: {
    color:  '#a08440',
    glow:   'none',
    bg:     'rgba(160,132,64,0.07)',
    border: 'rgba(160,132,64,0.20)',
    label:  'Developing',
  },
  D: {
    color:  'rgba(255,255,255,0.32)',
    glow:   'none',
    bg:     'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.09)',
    label:  'Cold',
  },
}

export function gradeOrder(g: Grade): number {
  return { S: 0, A: 1, B: 2, C: 3, D: 4 }[g]
}

// Build a gradeMap for all accounts in one pass (avoids O(n²))
export function buildGradeMap(
  accounts:     { id: string }[],
  allOrders:    any[],
  allVisits:    any[],
  allPlacements: any[],
): Record<string, GradeResult> {
  // Single-pass grouping by account_id — avoids O(accounts × data) filter scans
  const ordersByAcct:  Record<string, any[]> = {}
  const visitsByAcct:  Record<string, any[]> = {}
  const placsByAcct:   Record<string, any[]> = {}
  const revByAccount:  Record<string, number> = {}

  for (const o of allOrders) {
    if (!o.account_id) continue
    ;(ordersByAcct[o.account_id] ??= []).push(o)
    if (['sent', 'fulfilled'].includes(o.status)) {
      const lineTotal = (o.po_line_items ?? []).reduce((s: number, li: any) => s + (Number(li.total) || 0), 0)
      const amount = lineTotal || Number(o.total_amount) || 0
      revByAccount[o.account_id] = (revByAccount[o.account_id] ?? 0) + amount
    }
  }
  for (const v of allVisits) {
    if (v.account_id) (visitsByAcct[v.account_id] ??= []).push(v)
  }
  for (const p of allPlacements) {
    if (p.account_id) (placsByAcct[p.account_id] ??= []).push(p)
  }

  const maxRevenue = Math.max(...Object.values(revByAccount), 1)

  const map: Record<string, GradeResult> = {}
  for (const a of accounts) {
    map[a.id] = computeGrade(
      a.id,
      ordersByAcct[a.id]  ?? [],
      visitsByAcct[a.id]  ?? [],
      placsByAcct[a.id]   ?? [],
      maxRevenue,
    )
  }
  return map
}
