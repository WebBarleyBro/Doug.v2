// Pure, UI-free calculations for the client portal. Every KPI, chart, table and
// the PDF export read from the same PeriodReport so the numbers always agree.

import {
  getMonthRangeMT, getDateRangeMT, nDaysAgoMT, todayMT,
  formatMonthYear, formatShortDateMT,
} from '../../lib/formatters'
import { resolveTotal } from '../../lib/formatters'

const TZ = 'America/Denver'
const DAY_MS = 86400000

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PortalVisit {
  id: string
  account_id: string | null
  visited_at: string
  status: string
  notes?: string | null
  accounts?: { id: string; name: string; address?: string | null; account_type?: string | null } | null
}

export interface PortalPlacement {
  id: string
  account_id: string | null
  product_name: string
  placement_type?: string | null
  status: string
  created_at: string
  lost_at?: string | null
  accounts?: { id: string; name: string } | null
}

export interface PortalOrder {
  id: string
  po_number?: string | null
  deliver_to_name?: string | null
  total_amount?: number | null
  status: string
  order_type?: string | null
  created_at: string
  sent_at?: string | null
  account_id: string | null
  accounts?: { id: string; name: string } | null
  po_line_items?: Record<string, unknown>[]
}

export interface PortalEvent {
  id: string
  title: string
  event_type?: string | null
  start_time: string
  status?: string | null
  accounts?: { name: string } | null
}

export type PresetDays = 7 | 30 | 90
export type RangeMode = 'preset' | 'month' | 'custom'

export interface RangeSelection {
  mode: RangeMode
  presetDays: PresetDays
  month: string        // YYYY-MM
  customStart: string  // YYYY-MM-DD
  customEnd: string    // YYYY-MM-DD
}

export interface ResolvedRange {
  startMs: number
  endMs: number
  priorStartMs: number
  priorEndMs: number
  days: number
  label: string        // "August 2026" / "Last 30 days" / "Jun 3 – Jul 14"
  priorLabel: string   // "July 2026" / "prior 30 days"
  startISO: string
  endISO: string
  priorStartISO: string
}

export interface Delta {
  current: number
  prior: number
  diff: number
  pct: number | null   // null when prior is 0 (no meaningful %)
  dir: 'up' | 'down' | 'flat'
}

export interface TrendBucket {
  label: string        // x-axis label for the current period bucket
  current: number
  prior: number
  priorLabel: string   // date range of the matched prior bucket (tooltip)
}

export interface OutcomeRow {
  status: string
  group: OutcomeGroup
  current: number
  prior: number
  pct: number          // share of current-period visits, 0–100
}

export interface TopAccount {
  id: string
  name: string
  visits: number
  wins: number
  orders: number
  orderValue: number
}

export interface PipelineStage {
  status: string
  label: string
  count: number
}

export interface PeriodReport {
  range: ResolvedRange
  visits: PortalVisit[]           // deduped, in period, newest first
  priorVisits: PortalVisit[]
  orders: PortalOrder[]           // sent/fulfilled in period
  events: PortalEvent[]           // in period
  kpis: {
    visits: Delta
    accountsReached: Delta
    wins: Delta
    winRate: Delta                // percentage points
    inProgress: Delta             // accounts with a warm outcome
    orders: Delta
    orderValue: Delta             // dollars, 0 when the brand has no $ data
    newPlacements: Delta
    events: Delta
  }
  hasOrderValue: boolean
  trend: TrendBucket[]
  trendGranularity: 'day' | 'week' | 'month'
  outcomes: OutcomeRow[]
  topAccounts: TopAccount[]
  snapshot: {
    activePlacements: number
    onShelf: number
    pipeline: PipelineStage[]
    reach: { pct: number | null; buying: number; visited: number }        // this period
    repeat: { pct: number | null; repeatAccounts: number; ordering: number } // all order history
  }
}

// ── Outcome vocabulary ────────────────────────────────────────────────────────

export type OutcomeGroup = 'win' | 'progress' | 'neutral' | 'passed'

export const WIN_STATUSES = new Set(['New Placement', 'Menu Feature Won', 'Just Ordered'])
export const HOT_STATUSES = new Set(['Will Order Soon', 'Needs Follow Up'])

export function outcomeGroup(status: string): OutcomeGroup {
  if (WIN_STATUSES.has(status)) return 'win'
  if (HOT_STATUSES.has(status)) return 'progress'
  if (status === 'Not Interested') return 'passed'
  return 'neutral'
}

export const OUTCOME_GROUP_LABEL: Record<OutcomeGroup, string> = {
  win: 'Win', progress: 'In progress', neutral: 'Check-in', passed: 'Passed',
}

// Validated against the portal surface (#0d0b08) with the dataviz palette checker:
// all adjacent pairs clear the colorblind and normal-vision floors and 3:1 contrast.
export const OUTCOME_GROUP_COLOR: Record<OutcomeGroup, string> = {
  win: '#199e70', progress: '#c98500', passed: '#d95926', neutral: '#8a8782',
}

// Plain-language explanation shown to brand clients next to each outcome.
export const OUTCOME_DESCRIPTION: Record<string, string> = {
  'New Placement':    'Product newly placed at this account',
  'Menu Feature Won': 'Featured on the menu or a display',
  'Just Ordered':     'Account placed an order',
  'Will Order Soon':  'Buyer committed to ordering',
  'Needs Follow Up':  'Interested — our team is following up',
  'Tasted':           'Staff or buyer sampled the product',
  'General Check-In': 'Routine relationship visit',
  'Not Interested':   'Account passed for now',
}

export const PIPELINE_LABEL: Record<string, string> = {
  committed: 'Committed', ordered: 'Ordered', on_shelf: 'On shelf', reordering: 'Reordering',
}
export const PIPELINE_ORDER = ['committed', 'ordered', 'on_shelf', 'reordering']

// ── Date helpers (Mountain Time) ──────────────────────────────────────────────

// Supabase timestamps may arrive without a zone suffix; they are always UTC.
export function toMs(dateStr: string | null | undefined): number {
  if (!dateStr) return NaN
  if (dateStr.length === 10) return new Date(dateStr + 'T12:00:00Z').getTime()
  if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) return new Date(dateStr + 'Z').getTime()
  return new Date(dateStr).getTime()
}

export function mtDayKey(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ })
}

export function mtShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })
}

export function mtMonthShort(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', year: '2-digit' })
}

// Last N calendar months as YYYY-MM keys, newest first (for the month picker).
export function recentMonthKeys(count: number): string[] {
  const [y, m] = todayMT().slice(0, 7).split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    let mm = m - i, yy = y
    while (mm <= 0) { mm += 12; yy -= 1 }
    out.push(`${yy}-${String(mm).padStart(2, '0')}`)
  }
  return out
}

export function defaultRangeSelection(): RangeSelection {
  return { mode: 'preset', presetDays: 30, month: todayMT().slice(0, 7), customStart: '', customEnd: '' }
}

export function resolveRange(sel: RangeSelection): ResolvedRange {
  if (sel.mode === 'month' && sel.month) {
    const [y, m] = sel.month.split('-').map(Number)
    const cur = getMonthRangeMT(y, m)
    const prevM = m === 1 ? 12 : m - 1
    const prevY = m === 1 ? y - 1 : y
    const prior = getMonthRangeMT(prevY, prevM)
    const startMs = new Date(cur.start).getTime()
    // A month still in progress ends "now" so its pace reads honestly.
    const endMs = Math.min(new Date(cur.end).getTime(), Date.now())
    return {
      startMs, endMs,
      priorStartMs: new Date(prior.start).getTime(),
      priorEndMs: new Date(prior.end).getTime(),
      days: Math.max(1, Math.round((new Date(cur.end).getTime() - startMs) / DAY_MS)),
      label: formatMonthYear(`${sel.month}-01`),
      priorLabel: formatMonthYear(`${prevY}-${String(prevM).padStart(2, '0')}-01`),
      startISO: cur.start, endISO: cur.end, priorStartISO: prior.start,
    }
  }
  if (sel.mode === 'custom' && sel.customStart && sel.customEnd) {
    const { start, end } = getDateRangeMT(sel.customStart, sel.customEnd)
    const startMs = new Date(start).getTime()
    const endMs = Math.min(new Date(end).getTime(), Date.now())
    const span = new Date(end).getTime() - startMs
    return {
      startMs, endMs,
      priorStartMs: startMs - span, priorEndMs: startMs,
      days: Math.max(1, Math.round(span / DAY_MS)),
      label: `${formatShortDateMT(sel.customStart)} – ${formatShortDateMT(sel.customEnd)}`,
      priorLabel: `the ${Math.max(1, Math.round(span / DAY_MS))} days before`,
      startISO: start, endISO: end, priorStartISO: new Date(startMs - span).toISOString(),
    }
  }
  const days = sel.presetDays
  const start = nDaysAgoMT(days - 1)
  const priorStart = nDaysAgoMT(2 * days - 1)
  const startMs = new Date(start).getTime()
  return {
    startMs, endMs: Date.now(),
    priorStartMs: new Date(priorStart).getTime(), priorEndMs: startMs,
    days,
    label: `Last ${days} days`,
    priorLabel: `the ${days} days before`,
    startISO: start, endISO: new Date().toISOString(), priorStartISO: priorStart,
  }
}

// ── Core calculations ─────────────────────────────────────────────────────────

// Lower rank = more significant; picks the best visit when deduping account+day.
const STATUS_RANK: Record<string, number> = {
  'New Placement': 0, 'Menu Feature Won': 0, 'Just Ordered': 0,
  'Will Order Soon': 1, 'Needs Follow Up': 1, 'Tasted': 2,
  'General Check-In': 3, 'Not Interested': 4,
}

// One visit per account per Mountain-Time day (a multi-brand stop logs one row
// per brand; a repeat stop the same day is the same visit).
export function dedupeByAccountDay<T extends PortalVisit>(visits: T[]): T[] {
  const seen = new Map<string, T>()
  for (const v of visits) {
    const key = `${v.account_id}__${mtDayKey(toMs(v.visited_at))}`
    const ex = seen.get(key)
    if (!ex || (STATUS_RANK[v.status] ?? 5) < (STATUS_RANK[ex.status] ?? 5)) seen.set(key, v)
  }
  return [...seen.values()].sort((a, b) => toMs(b.visited_at) - toMs(a.visited_at))
}

export function delta(current: number, prior: number): Delta {
  const diff = current - prior
  const pct = prior > 0 ? Math.round((diff / prior) * 100) : null
  return { current, prior, diff, pct, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' }
}

export function orderDateMs(o: PortalOrder): number {
  return toMs(o.sent_at || o.created_at)
}

export function isClientVisibleOrder(o: PortalOrder): boolean {
  return o.status === 'sent' || o.status === 'fulfilled'
}

export function orderValue(o: PortalOrder): number {
  return resolveTotal(o as any) || 0
}

function within(ms: number, startMs: number, endMs: number): boolean {
  return ms >= startMs && ms <= endMs
}

function uniqueAccounts(visits: PortalVisit[]): number {
  return new Set(visits.map(v => v.account_id).filter(Boolean)).size
}

export function buildPeriodReport(input: {
  visits: PortalVisit[]
  placements: PortalPlacement[]
  orders: PortalOrder[]
  events: PortalEvent[]
  range: ResolvedRange
}): PeriodReport {
  const { range } = input
  const allVisits = dedupeByAccountDay(input.visits)

  const visits      = allVisits.filter(v => within(toMs(v.visited_at), range.startMs, range.endMs))
  const priorVisits = allVisits.filter(v => { const ms = toMs(v.visited_at); return ms >= range.priorStartMs && ms < range.priorEndMs })

  const visibleOrders = input.orders.filter(isClientVisibleOrder)
  const orders      = visibleOrders.filter(o => within(orderDateMs(o), range.startMs, range.endMs))
  const priorOrders = visibleOrders.filter(o => { const ms = orderDateMs(o); return ms >= range.priorStartMs && ms < range.priorEndMs })
  const orderValueSum = (list: PortalOrder[]) => Math.round(list.reduce((s, o) => s + orderValue(o), 0))
  const hasOrderValue = visibleOrders.some(o => orderValue(o) > 0)

  const events      = input.events.filter(e => within(toMs(e.start_time), range.startMs, range.endMs) && e.status !== 'cancelled')
  const priorEvents = input.events.filter(e => { const ms = toMs(e.start_time); return ms >= range.priorStartMs && ms < range.priorEndMs && e.status !== 'cancelled' })

  const newPlac      = input.placements.filter(p => within(toMs(p.created_at), range.startMs, range.endMs)).length
  const priorNewPlac = input.placements.filter(p => { const ms = toMs(p.created_at); return ms >= range.priorStartMs && ms < range.priorEndMs }).length

  const wins      = visits.filter(v => WIN_STATUSES.has(v.status))
  const priorWins = priorVisits.filter(v => WIN_STATUSES.has(v.status))
  const winRate      = visits.length ? Math.round((wins.length / visits.length) * 100) : 0
  const priorWinRate = priorVisits.length ? Math.round((priorWins.length / priorVisits.length) * 100) : 0

  const inProgress      = uniqueAccounts(visits.filter(v => HOT_STATUSES.has(v.status)))
  const priorInProgress = uniqueAccounts(priorVisits.filter(v => HOT_STATUSES.has(v.status)))

  // ── Trend buckets: current vs prior period, aligned by position ──
  const spanDays = range.days
  const granularity: 'day' | 'week' | 'month' = spanDays <= 31 ? 'day' : spanDays <= 120 ? 'week' : 'month'
  const bucketMs = granularity === 'day' ? DAY_MS : granularity === 'week' ? 7 * DAY_MS : 30 * DAY_MS
  const bucketCount = Math.max(1, Math.ceil(spanDays * DAY_MS / bucketMs))
  const trend: TrendBucket[] = Array.from({ length: bucketCount }, (_, i) => {
    const curStart = range.startMs + i * bucketMs
    const priStart = range.priorStartMs + i * bucketMs
    const label = granularity === 'month' ? mtMonthShort(curStart) : mtShortDate(curStart)
    const priorLabel = granularity === 'day'
      ? mtShortDate(priStart)
      // Half a day back from the bucket edge keeps the label on the last day across DST changes.
      : `${mtShortDate(priStart)} – ${mtShortDate(Math.min(priStart + bucketMs - DAY_MS / 2, range.priorEndMs - DAY_MS / 2))}`
    return { label, current: 0, prior: 0, priorLabel }
  })
  const bucketIndex = (ms: number, originMs: number) => Math.min(bucketCount - 1, Math.floor((ms - originMs) / bucketMs))
  for (const v of visits)      trend[bucketIndex(toMs(v.visited_at), range.startMs)].current++
  for (const v of priorVisits) { const i = bucketIndex(toMs(v.visited_at), range.priorStartMs); if (i >= 0) trend[i].prior++ }

  // ── Outcome breakdown ──
  const statusOrder = ['New Placement', 'Menu Feature Won', 'Just Ordered', 'Will Order Soon', 'Needs Follow Up', 'Tasted', 'General Check-In', 'Not Interested']
  const countBy = (list: PortalVisit[]) => list.reduce((acc, v) => { acc[v.status] = (acc[v.status] || 0) + 1; return acc }, {} as Record<string, number>)
  const curCounts = countBy(visits), priCounts = countBy(priorVisits)
  const outcomes: OutcomeRow[] = statusOrder
    .filter(s => (curCounts[s] || 0) > 0 || (priCounts[s] || 0) > 0)
    .map(s => ({
      status: s, group: outcomeGroup(s),
      current: curCounts[s] || 0, prior: priCounts[s] || 0,
      pct: visits.length ? Math.round(((curCounts[s] || 0) / visits.length) * 100) : 0,
    }))

  // ── Top accounts this period ──
  // Seeded from orders AND visits: an account that ordered heavily but wasn't
  // visited in the window is still one of the period's most important accounts.
  const acctMap = new Map<string, TopAccount>()
  const touch = (key: string, name: string): TopAccount => {
    let a = acctMap.get(key)
    if (!a) { a = { id: key, name, visits: 0, wins: 0, orders: 0, orderValue: 0 }; acctMap.set(key, a) }
    if (a.name === 'Account' && name !== 'Account') a.name = name
    return a
  }
  for (const o of orders) {
    // Orders keyed to a name-only delivery target still belong to someone.
    const key = o.account_id || (o.deliver_to_name ? `name:${o.deliver_to_name}` : '')
    if (!key) continue
    const a = touch(key, o.accounts?.name || o.deliver_to_name || 'Account')
    a.orders++
    a.orderValue += orderValue(o)
  }
  for (const v of visits) {
    if (!v.account_id) continue
    const a = touch(v.account_id, v.accounts?.name || 'Account')
    a.visits++
    if (WIN_STATUSES.has(v.status)) a.wins++
  }
  // Dollars ordered leads the ranking — it is the outcome the brand is paying for.
  const topAccounts = [...acctMap.values()]
    .map(a => ({ ...a, orderValue: Math.round(a.orderValue) }))
    .sort((a, b) => b.orderValue - a.orderValue || b.wins - a.wins || b.visits - a.visits || a.name.localeCompare(b.name))
    .slice(0, 8)

  // ── Snapshot (as of today) ──
  const active  = input.placements.filter(p => !p.lost_at)
  const onShelfPlac = active.filter(p => p.status === 'on_shelf' || p.status === 'reordering')
  const pipeline = PIPELINE_ORDER
    .map(s => ({ status: s, label: PIPELINE_LABEL[s], count: active.filter(p => p.status === s).length }))
    .filter(p => p.count > 0)

  const visitedIds = new Set(visits.map(v => v.account_id).filter(Boolean) as string[])
  const buyingIds  = new Set([
    ...onShelfPlac.map(p => p.account_id),
    ...orders.map(o => o.account_id),
  ].filter(Boolean) as string[])
  const buyingVisited = [...visitedIds].filter(id => buyingIds.has(id)).length
  const reach = { pct: visitedIds.size ? Math.round((buyingVisited / visitedIds.size) * 100) : null, buying: buyingVisited, visited: visitedIds.size }

  // Repeat business is measured from orders, not placements: an account can reorder
  // for months without anyone logging a shelf placement for it, and tying the metric
  // to placement hygiene made real reorders invisible.
  const ordersPerAccount = new Map<string, number>()
  for (const o of visibleOrders) {
    const key = o.account_id || (o.deliver_to_name ? `name:${o.deliver_to_name}` : '')
    if (!key) continue
    ordersPerAccount.set(key, (ordersPerAccount.get(key) || 0) + 1)
  }
  const orderingCount = ordersPerAccount.size
  const repeatAccounts = [...ordersPerAccount.values()].filter(n => n >= 2).length
  const repeat = {
    pct: orderingCount ? Math.round((repeatAccounts / orderingCount) * 100) : null,
    repeatAccounts, ordering: orderingCount,
  }

  return {
    range, visits, priorVisits, orders, events,
    kpis: {
      visits:          delta(visits.length, priorVisits.length),
      accountsReached: delta(uniqueAccounts(visits), uniqueAccounts(priorVisits)),
      wins:            delta(wins.length, priorWins.length),
      winRate:         delta(winRate, priorWinRate),
      inProgress:      delta(inProgress, priorInProgress),
      orders:          delta(orders.length, priorOrders.length),
      orderValue:      delta(orderValueSum(orders), orderValueSum(priorOrders)),
      newPlacements:   delta(newPlac, priorNewPlac),
      events:          delta(events.length, priorEvents.length),
    },
    hasOrderValue,
    trend, trendGranularity: granularity,
    outcomes, topAccounts,
    snapshot: { activePlacements: active.length, onShelf: onShelfPlac.length, pipeline, reach, repeat },
  }
}

// ── Formatting helpers shared by UI + PDF ─────────────────────────────────────

export function formatDelta(d: Delta, unit: 'count' | 'pts' | 'dollars' = 'count'): string {
  if (d.dir === 'flat') return 'No change'
  const sign = d.diff > 0 ? '+' : '−'
  const abs = Math.abs(d.diff)
  if (unit === 'pts') return `${sign}${abs} pts`
  if (unit === 'dollars') return `${sign}$${abs.toLocaleString()}`
  return d.pct !== null ? `${sign}${Math.abs(d.pct)}%` : `${sign}${abs}`
}

export function compactMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `$${Math.round(n / 1000)}K`
  if (n >= 1000)      return `$${(n / 1000).toFixed(1)}K`
  return `$${Math.round(n).toLocaleString()}`
}
