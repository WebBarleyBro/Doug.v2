// Pure, UI-free calculations for the client portal. Every measure, chart, table,
// drawer and the PDF read from the same PeriodReport so the numbers always agree.
// Nothing in here touches the DOM or the database; everything takes an explicit
// `nowMs` so it can be unit-tested against a fixture.
//
// Two rules from the spec shape everything below:
//   - An order implies a visit: an account with an order on a day counts as visited that day.
//   - The placements table is never read; "stocked" means ordered in the last 90 days.

import { resolveTotal } from '../../lib/formatters'

const TZ = 'America/Denver'
export const DAY_MS = 86400000
export const STOCKED_WINDOW_DAYS = 90

// ── Input row shapes (what getPortalData returns) ─────────────────────────────

export interface PortalAccountRef { id: string; name: string; address?: string | null; account_type?: string | null }

export interface PortalVisit {
  id: string
  account_id: string | null
  user_id?: string | null
  visited_at: string
  status: string
  notes?: string | null
  accounts?: PortalAccountRef | null
}

export interface PortalLineItem {
  id?: string
  product_name?: string | null
  cases?: number | string | null
  bottles?: number | string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  price?: number | string | null
  total?: number | string | null
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
  po_line_items?: PortalLineItem[]
}

export interface PortalEvent {
  id: string
  title?: string | null
  event_type?: string | null
  start_time: string
  status?: string | null
  account_id?: string | null
  accounts?: { name: string } | null
}

export interface PortalAccount {
  id: string
  name: string
  account_type?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
}

// ── Period model ──────────────────────────────────────────────────────────────

export type PeriodMode = '30d' | 'month' | 'quarter' | 'custom'

export interface PeriodSelection {
  mode: PeriodMode
  anchor: string        // YYYY-MM: the month, or the first month of the quarter
  customStart: string   // YYYY-MM-DD
  customEnd: string     // YYYY-MM-DD
}

export interface ResolvedRange {
  mode: PeriodMode
  startKey: string      // first MT day of the period
  endKey: string        // last MT day used for calculations (today when the period is still running)
  fullEndKey: string    // last calendar day of the period (chart x-axis)
  priorStartKey: string
  priorEndKey: string
  startMs: number
  endMs: number
  fullEndMs: number
  priorStartMs: number
  priorEndMs: number
  days: number          // calendar days in the full period
  priorDays: number
  partial: boolean      // month/quarter that includes today
  label: string         // "October 2026" / "Q3 2026" / "Last 30 days" / "Sep 15 – Oct 15, 2026"
  labelToDate: string   // label + " to date" when partial
  compareLabel: string  // "previous month" / "previous quarter" / "previous 30 days" / "previous N days"
  navLabel: string      // "Oct 2026" / "Q3 2026"
  hash: string          // "#2026-10" / "#q3-2026" / "#30d" / "#2026-09-15_2026-10-15"
  canNext: boolean
  monthKeys: string[]   // the calendar months the period spans (3 for a quarter)
}

export interface Delta {
  current: number
  prior: number
  diff: number
  dir: 'up' | 'down' | 'flat'
}

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

// UTC ms of Mountain-Time midnight for a YYYY-MM-DD key (handles DST).
export function mtStartOfDayMs(key: string): number {
  for (const h of [6, 7]) {
    const c = new Date(`${key}T0${h}:00:00.000Z`).getTime()
    if (mtDayKey(c) === key) return c
  }
  return new Date(`${key}T07:00:00.000Z`).getTime()
}

export function mtEndOfDayMs(key: string): number {
  return mtStartOfDayMs(addDays(key, 1)) - 1
}

export function addDays(key: string, n: number): string {
  const d = new Date(key + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((new Date(toKey + 'T12:00:00Z').getTime() - new Date(fromKey + 'T12:00:00Z').getTime()) / DAY_MS)
}

export function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

export function monthStartKey(monthKey: string): string { return `${monthKey}-01` }
export function monthEndKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${monthKey}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}
export function quarterOf(monthKey: string): { year: number; q: number } {
  const [y, m] = monthKey.split('-').map(Number)
  return { year: y, q: Math.floor((m - 1) / 3) + 1 }
}
export function quarterFirstMonth(year: number, q: number): string {
  return `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}`
}

const dUTC = (key: string) => new Date(key + 'T12:00:00Z')
export function fmtShort(key: string): string { return dUTC(key).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }) }
export function fmtShortYear(key: string): string { return dUTC(key).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) }
export function fmtMonthLong(monthKey: string): string { return dUTC(monthKey.slice(0, 7) + '-15').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }) }
export function fmtMonthShort(monthKey: string): string { return dUTC(monthKey.slice(0, 7) + '-15').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }) }
export function fmtMon(monthKey: string): string { return dUTC(monthKey.slice(0, 7) + '-15').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' }) }
export function fmtWeekday(key: string): string { return dUTC(key).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' }) }
export function isoDayKey(iso: string | null | undefined): string { const ms = toMs(iso); return Number.isNaN(ms) ? '' : mtDayKey(ms) }
export function fmtIsoShort(iso: string | null | undefined): string { const k = isoDayKey(iso); return k ? fmtShort(k) : '—' }
export function fmtIsoShortYear(iso: string | null | undefined): string { const k = isoDayKey(iso); return k ? fmtShortYear(k) : '—' }

export function money(n: number): string { return '$' + Math.round(n).toLocaleString('en-US') }
export function moneyK(n: number): string {
  if (n >= 10000) return '$' + Math.round(n / 1000) + 'k'
  if (n >= 1000) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return '$' + Math.round(n)
}

// ── Selection ↔ hash ──────────────────────────────────────────────────────────

export function defaultSelection(nowMs: number): PeriodSelection {
  return { mode: 'month', anchor: mtDayKey(nowMs).slice(0, 7), customStart: '', customEnd: '' }
}

export function parseHash(hash: string, nowMs: number): PeriodSelection {
  const h = (hash || '').replace(/^#/, '').trim()
  const base = defaultSelection(nowMs)
  let m: RegExpMatchArray | null
  if (/^30d$/i.test(h)) return { ...base, mode: '30d' }
  if ((m = h.match(/^(\d{4})-(\d{2})$/)) && +m[2] >= 1 && +m[2] <= 12) return { ...base, mode: 'month', anchor: `${m[1]}-${m[2]}` }
  if ((m = h.match(/^q([1-4])-(\d{4})$/i))) return { ...base, mode: 'quarter', anchor: quarterFirstMonth(+m[2], +m[1]) }
  if ((m = h.match(/^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/)) && m[1] <= m[2]) return { ...base, mode: 'custom', customStart: m[1], customEnd: m[2] }
  return base
}

export function toHash(sel: PeriodSelection): string {
  if (sel.mode === '30d') return '#30d'
  if (sel.mode === 'quarter') { const { year, q } = quarterOf(sel.anchor); return `#q${q}-${year}` }
  if (sel.mode === 'custom') return sel.customStart && sel.customEnd ? `#${sel.customStart}_${sel.customEnd}` : '#custom'
  return `#${sel.anchor}`
}

export function stepSelection(sel: PeriodSelection, dir: 1 | -1): PeriodSelection {
  if (sel.mode === 'month') return { ...sel, anchor: addMonths(sel.anchor, dir) }
  if (sel.mode === 'quarter') return { ...sel, anchor: addMonths(sel.anchor, 3 * dir) }
  return sel
}

export function resolveRange(sel: PeriodSelection, nowMs: number): ResolvedRange {
  const today = mtDayKey(nowMs)
  const build = (p: Omit<ResolvedRange, 'startMs' | 'endMs' | 'fullEndMs' | 'priorStartMs' | 'priorEndMs' | 'days' | 'priorDays' | 'endKey' | 'labelToDate' | 'canNext'> & { endKey?: string }): ResolvedRange => {
    const endKey = p.endKey ?? (p.fullEndKey > today ? today : p.fullEndKey)
    return {
      ...p, endKey,
      startMs: mtStartOfDayMs(p.startKey), endMs: mtEndOfDayMs(endKey), fullEndMs: mtEndOfDayMs(p.fullEndKey),
      priorStartMs: mtStartOfDayMs(p.priorStartKey), priorEndMs: mtEndOfDayMs(p.priorEndKey),
      days: daysBetween(p.startKey, p.fullEndKey) + 1, priorDays: daysBetween(p.priorStartKey, p.priorEndKey) + 1,
      labelToDate: p.partial ? `${p.label} to date` : p.label,
      canNext: p.fullEndKey < today,
    }
  }
  if (sel.mode === '30d') {
    const startKey = addDays(today, -29)
    return build({
      mode: '30d', startKey, fullEndKey: today, priorStartKey: addDays(today, -59), priorEndKey: addDays(today, -30),
      partial: false, label: 'Last 30 days', compareLabel: 'previous 30 days', navLabel: `${fmtShort(startKey)} – ${fmtShort(today)}`,
      hash: '#30d', monthKeys: [startKey.slice(0, 7), today.slice(0, 7)].filter((k, i, a) => a.indexOf(k) === i),
    })
  }
  if (sel.mode === 'quarter') {
    const { year, q } = quarterOf(sel.anchor)
    const first = quarterFirstMonth(year, q)
    const last = addMonths(first, 2)
    const priorFirst = addMonths(first, -3)
    const fullEndKey = monthEndKey(last)
    return build({
      mode: 'quarter', startKey: monthStartKey(first), fullEndKey,
      priorStartKey: monthStartKey(priorFirst), priorEndKey: monthEndKey(addMonths(priorFirst, 2)),
      partial: fullEndKey >= today, label: `Q${q} ${year}`, compareLabel: 'previous quarter', navLabel: `Q${q} ${year}`,
      hash: `#q${q}-${year}`, monthKeys: [first, addMonths(first, 1), last],
    })
  }
  if (sel.mode === 'custom' && sel.customStart && sel.customEnd && sel.customStart <= sel.customEnd) {
    const n = daysBetween(sel.customStart, sel.customEnd) + 1
    const startYear = sel.customStart.slice(0, 4), endYear = sel.customEnd.slice(0, 4)
    const label = `${startYear === endYear ? fmtShort(sel.customStart) : fmtShortYear(sel.customStart)} – ${fmtShortYear(sel.customEnd)}`
    const months: string[] = []
    for (let k = sel.customStart.slice(0, 7); k <= sel.customEnd.slice(0, 7); k = addMonths(k, 1)) months.push(k)
    return build({
      mode: 'custom', startKey: sel.customStart, fullEndKey: sel.customEnd, endKey: sel.customEnd > today ? today : sel.customEnd,
      priorStartKey: addDays(sel.customStart, -n), priorEndKey: addDays(sel.customStart, -1),
      partial: false, label, compareLabel: `previous ${n} days`, navLabel: 'Custom', hash: `#${sel.customStart}_${sel.customEnd}`, monthKeys: months,
    })
  }
  // Month (also the fallback for an incomplete custom selection)
  const anchor = /^\d{4}-\d{2}$/.test(sel.anchor) ? sel.anchor : today.slice(0, 7)
  const fullEndKey = monthEndKey(anchor)
  const prior = addMonths(anchor, -1)
  return build({
    mode: 'month', startKey: monthStartKey(anchor), fullEndKey, priorStartKey: monthStartKey(prior), priorEndKey: monthEndKey(prior),
    partial: fullEndKey >= today, label: fmtMonthLong(anchor), compareLabel: 'previous month', navLabel: fmtMonthShort(anchor),
    hash: `#${anchor}`, monthKeys: [anchor],
  })
}

// ── Vocabulary ────────────────────────────────────────────────────────────────

export const CLIENT_OUTCOME_LABEL: Record<string, string> = {
  'Just Ordered': 'Ordered', 'New Placement': 'New placement', 'Menu Feature Won': 'Menu feature',
  'Will Order Soon': 'Follow-up', 'Needs Follow Up': 'Follow-up', 'Tasted': 'Tasting', 'General Check-In': 'Visit',
}
// Event types the client sees. planned_stop and other are hidden.
export const EVENT_TYPE_LABEL: Record<string, string> = {
  tasting: 'Tasting', brand_dinner: 'Brand dinner', meeting: 'Buyer meeting', training: 'Staff training', milestone: 'Milestone',
}
export function accountTypeLabel(t: string | null | undefined): string { return t === 'off_premise' ? 'Retail' : 'On-premise' }
export function accountTypeLower(t: string | null | undefined): string { return t === 'off_premise' ? 'retail' : 'on-premise' }
export function stripProductName(name: string | null | undefined): string { return String(name || '').replace(/\s*\(Off-Premise\)\s*$/i, '').trim() }
export function isRetailSku(name: string | null | undefined): boolean { return /\(Off-Premise\)\s*$/i.test(String(name || '')) }

// ── Core helpers ──────────────────────────────────────────────────────────────

// Lower rank = more significant; picks the best visit when deduping account+day.
const STATUS_RANK: Record<string, number> = {
  'New Placement': 0, 'Menu Feature Won': 0, 'Just Ordered': 0,
  'Will Order Soon': 1, 'Needs Follow Up': 1, 'Tasted': 2,
  'General Check-In': 3, 'Not Interested': 4,
}

// One visit per account per Mountain-Time day (a multi-brand stop logs one row
// per brand; a repeat stop the same day is the same visit). Newest first.
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
  const diff = Math.round((current - prior) * 100) / 100
  return { current, prior, diff, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' }
}

export function orderDateMs(o: PortalOrder): number { return toMs(o.sent_at || o.created_at) }
export function isClientVisibleOrder(o: PortalOrder): boolean { return o.status === 'sent' || o.status === 'fulfilled' }
export function orderValue(o: PortalOrder): number { return resolveTotal(o) || 0 }
export function orderAccountKey(o: PortalOrder): string { return o.account_id || (o.deliver_to_name ? `name:${o.deliver_to_name}` : '') }

function within(ms: number, startMs: number, endMs: number): boolean { return ms >= startMs && ms <= endMs }
function sum(list: number[]): number { return list.reduce((s, n) => s + n, 0) }
function round2(n: number): number { return Math.round(n * 100) / 100 }
function uniq<T>(list: T[]): T[] { return [...new Set(list)] }

export function lineQty(l: PortalLineItem): { cases: number; bottles: number } {
  const cases = Number(l.cases ?? 0) || 0
  const bottles = Number(l.bottles ?? 0) || 0
  const quantity = Number(l.quantity ?? 0) || 0
  return { cases: cases || (bottles ? 0 : quantity), bottles }
}
export function lineValue(l: PortalLineItem): number {
  const t = Number(l.total ?? 0)
  if (t > 0) return t
  const price = Number(l.unit_price ?? l.price ?? 0) || 0
  const { cases, bottles } = lineQty(l)
  return price * (cases + bottles)
}
// "2 cs Ridge Mountain Gin" / "3 btl Rye" — units exactly as stored, never converted.
export function describeLine(l: PortalLineItem): string {
  const { cases, bottles } = lineQty(l)
  const parts = [cases ? `${cases} cs` : '', bottles ? `${bottles} btl` : ''].filter(Boolean).join(' + ')
  return `${parts ? parts + ' ' : ''}${stripProductName(l.product_name)}`.trim()
}
export function describeOrder(o: PortalOrder): string {
  const lines = (o.po_line_items || []).map(describeLine).filter(Boolean)
  return lines.length ? lines.join(', ') : 'Order'
}
export function unitLabel(p: { cases: number; bottles: number }): string {
  return [p.cases ? `${p.cases} cs` : '', p.bottles ? `${p.bottles} btl` : ''].filter(Boolean).join(' + ') || '—'
}

// Cadence: average gap between an account's orders vs days since the last one.
export type CadenceFlag = 'on pace' | 'slipping' | 'overdue'
export function cadenceFor(orderDatesMs: number[], nowMs: number): { sinceDays: number; avgGapDays: number; flag: CadenceFlag } | null {
  const d = [...orderDatesMs].filter(n => !Number.isNaN(n)).sort((a, b) => a - b)
  if (d.length < 2) return null
  const gaps: number[] = []
  for (let i = 1; i < d.length; i++) gaps.push((d[i] - d[i - 1]) / DAY_MS)
  const avg = sum(gaps) / gaps.length
  const since = (nowMs - d[d.length - 1]) / DAY_MS
  const flag: CadenceFlag = since <= avg ? 'on pace' : since <= avg * 1.5 ? 'slipping' : 'overdue'
  return { sinceDays: Math.max(0, Math.round(since)), avgGapDays: Math.round(avg), flag }
}

// ── Report types ──────────────────────────────────────────────────────────────

export interface SparkSeries { months: { key: string; label: string }[]; accountsVisited: number[]; orders: number[]; orderValue: number[] }

export interface CumulativePoint { date: string; value: number; orders: number }

export interface AccountRow {
  id: string
  name: string
  type: string | null
  lastVisit: string | null     // YYYY-MM-DD (MT): latest of visit or order
  lastOrder: string | null     // YYYY-MM-DD (MT)
  visits: number               // visit rows logged (deduped)
  orders: number
  value: number
  allTimeValue: number
  allTimeOrders: number
  cadence?: { sinceDays: number; avgGapDays: number; flag: CadenceFlag } | null
}

export interface OrderRow {
  id: string
  accountId: string
  accountName: string
  date: string                 // YYYY-MM-DD (MT)
  po: string
  products: string
  lines: { name: string; retail: boolean; cases: number; bottles: number; value: number }[]
  total: number
  status: string
  statusLabel: 'Fulfilled' | 'Sent'
}

export interface ProductRow {
  name: string
  retail: boolean
  cases: number
  bottles: number
  value: number
  accounts: number             // distinct accounts ordering it in scope
  stockedAt: number            // distinct accounts with it in an order in the last 90 days
}

export interface EventRow { id: string; date: string; account: string; type: string; typeLabel: string; consumers: number }

export type StopKind = 'order' | 'placement' | 'tasting' | 'followup' | 'visit' | 'passed'
export interface TimelineStop {
  id: string
  accountId: string
  name: string
  type: string | null
  kind: StopKind
  label: string | null         // bold lead-in ("Ordered", "Menu feature", "Tasting", "Follow-up", "Passed")
  text: string                 // the rest of the line
  amount?: number
  firstOrder?: boolean
  status: string | null        // raw visit status (null for an order with no visit logged)
  rep: string | null
  visitedAt: string | null
}
export interface TimelineDay { date: string; weekday: string; label: string; stops: TimelineStop[]; orderTotal: number }

export interface MapAccount {
  id: string; name: string; type: string | null; lat: number; lng: number
  stocked: boolean; orderedInPeriod: boolean; visitedInPeriod: boolean
  lastVisit: string | null; productsStocked: number; periodValue: number
}

export interface AccountDetail {
  id: string; name: string; type: string | null; firstVisit: string | null; lastOrder: string | null
  ordersAllTime: number; valueAllTime: number
  products: { name: string; retail: boolean; cases: number; bottles: number; lastOrdered: string }[]
  orders: OrderRow[]
  visits: { id: string; date: string; notes: string; status: string; label: string; rep: string | null; win: boolean }[]
}

export interface PeriodReport {
  range: ResolvedRange
  nowMs: number
  staff: boolean
  trackingStart: string | null              // ISO day key of the earliest visit or order
  trackingStartLabel: string | null         // "April 2026"
  trackingStartMon: string | null           // "Apr"
  visits: PortalVisit[]                     // deduped, in period, newest first (all statuses)
  priorVisits: PortalVisit[]
  orders: PortalOrder[]                     // client-visible, in period, newest first
  priorOrders: PortalOrder[]
  allVisits: PortalVisit[]                  // deduped, all time
  allOrders: PortalOrder[]                  // client-visible, all time
  accountInfo: Record<string, { name: string; type: string | null }>
  repNames: Record<string, string>          // empty unless built for staff
  measures: {
    accountsVisited: Delta                  // visited OR ordered (an order implies a visit)
    visits: number                          // visit rows logged in period (deduped)
    orders: Delta
    orderValue: Delta
  }
  sparklines: SparkSeries
  allTime: { accounts: number; orders: number; value: number; orderingAccounts: number; reorderingAccounts: number; avgOrder: number }
  stocked: {
    windowStartKey: string                  // first day of the 90-day window ending at the period end
    windowEndKey: string
    accounts: number                        // accounts with a client-visible order in the window
    reorderingAccounts: number              // 2+ orders all time
    orderingAccounts: number                // ever ordered
    newAccounts: number                     // first ever order in the period
    tastings: number
    byProduct: { name: string; retail: boolean; accounts: number }[]   // top 8 by distinct accounts in the window
  }
  cumulative: { current: CumulativePoint[]; prior: { date: string; value: number }[]; axisDays: number }
  funnel: { visited: number; visits: number; ordered: number; firstTime: number; repeat: number; priorVisited: number; priorOrdered: number; conversionPct: number | null }
  accountsLedger: { period: AccountRow[]; all: AccountRow[] }
  ordersLedger: { period: OrderRow[]; all: OrderRow[] }
  productsLedger: { period: ProductRow[]; all: ProductRow[] }
  events: EventRow[]
  eventSummary: { tastings: number; consumers: number; other: number }
  timeline: TimelineDay[]
  timelineStops: number
  mapAccounts: MapAccount[]
}

export interface ReportInput {
  visits: PortalVisit[]
  orders: PortalOrder[]
  events: PortalEvent[]
  accounts?: PortalAccount[]
  tastingConsumers?: Record<string, number>   // event id → sign-ups
  range: ResolvedRange
  nowMs: number
  staff?: boolean
  repNames?: Record<string, string>
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function recentMonths(nowMs: number, count: number): { key: string; label: string; startMs: number; endMs: number }[] {
  const cur = mtDayKey(nowMs).slice(0, 7)
  const out: { key: string; label: string; startMs: number; endMs: number }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const key = addMonths(cur, -i)
    out.push({ key, label: fmtMon(key), startMs: mtStartOfDayMs(monthStartKey(key)), endMs: mtEndOfDayMs(monthEndKey(key)) })
  }
  return out
}

export function buildPeriodReport(input: ReportInput): PeriodReport {
  const { range, nowMs } = input
  const staff = !!input.staff
  const repNames = staff ? (input.repNames || {}) : {}

  // ── Account names/types from every source we have ──
  const accountInfo: Record<string, { name: string; type: string | null }> = {}
  const touchInfo = (id: string | null | undefined, name?: string | null, type?: string | null) => {
    if (!id) return
    const ex = accountInfo[id]
    if (!ex) accountInfo[id] = { name: name || 'Account', type: type ?? null }
    else { if (ex.name === 'Account' && name) ex.name = name; if (ex.type == null && type) ex.type = type }
  }
  for (const a of input.accounts || []) touchInfo(a.id, a.name, a.account_type)
  for (const v of input.visits) touchInfo(v.account_id, v.accounts?.name, v.accounts?.account_type)
  for (const o of input.orders) touchInfo(o.account_id, o.accounts?.name || o.deliver_to_name)
  const nameOf = (id: string) => accountInfo[id]?.name || (id.startsWith('name:') ? id.slice(5) : 'Account')
  const typeOf = (id: string) => accountInfo[id]?.type ?? null

  // ── Visits ──
  const allVisits = dedupeByAccountDay(input.visits)
  const visits = allVisits.filter(v => within(toMs(v.visited_at), range.startMs, range.endMs))
  const priorVisits = allVisits.filter(v => within(toMs(v.visited_at), range.priorStartMs, range.priorEndMs))
  const visitAccounts = (list: PortalVisit[]) => list.map(v => v.account_id).filter(Boolean) as string[]

  // ── Orders ──
  const allOrders = input.orders.filter(isClientVisibleOrder).sort((a, b) => orderDateMs(b) - orderDateMs(a))
  const orders = allOrders.filter(o => within(orderDateMs(o), range.startMs, range.endMs))
  const priorOrders = allOrders.filter(o => within(orderDateMs(o), range.priorStartMs, range.priorEndMs))
  const valueOf = (list: PortalOrder[]) => round2(sum(list.map(orderValue)))
  const orderAccounts = (list: PortalOrder[]) => list.map(orderAccountKey).filter(Boolean)

  // An order implies a visit: "accounts visited" is the union of both sources.
  const reached = (V: PortalVisit[], O: PortalOrder[]) => uniq([...visitAccounts(V), ...orderAccounts(O)])

  // Orders per account, all time, oldest first (for first-order and cadence logic)
  const ordersByAccount = new Map<string, PortalOrder[]>()
  for (const o of allOrders) { const k = orderAccountKey(o); if (!k) continue; const l = ordersByAccount.get(k) || []; l.push(o); ordersByAccount.set(k, l) }
  for (const l of ordersByAccount.values()) l.sort((a, b) => orderDateMs(a) - orderDateMs(b))
  const firstOrderMs = (acct: string) => { const l = ordersByAccount.get(acct); return l?.length ? orderDateMs(l[0]) : NaN }
  const lastOrderKey = (acct: string) => { const l = ordersByAccount.get(acct); return l?.length ? mtDayKey(orderDateMs(l[l.length - 1])) : null }

  // ── Tracking start ──
  const firstVisitMs = allVisits.length ? Math.min(...allVisits.map(v => toMs(v.visited_at))) : NaN
  const firstOrder = allOrders.length ? Math.min(...allOrders.map(orderDateMs)) : NaN
  const trackingMs = [firstVisitMs, firstOrder].filter(n => !Number.isNaN(n))
  const trackingStart = trackingMs.length ? mtDayKey(Math.min(...trackingMs)) : null

  // ── Stocked: ordered in the 90 days ending at the period end ──
  const windowEndKey = range.endKey
  const windowStartKey = addDays(windowEndKey, -(STOCKED_WINDOW_DAYS - 1))
  const windowStartMs = mtStartOfDayMs(windowStartKey), windowEndMs = range.endMs
  const windowOrders = allOrders.filter(o => within(orderDateMs(o), windowStartMs, windowEndMs))
  const stockedIds = new Set(orderAccounts(windowOrders))
  // Keyed by the stored product_name so a retail SKU ("… (Off-Premise)") stays its own row.
  const stockedByProduct = new Map<string, { retail: boolean; accts: Set<string> }>()
  const productsByStockedAccount = new Map<string, Set<string>>()
  for (const o of windowOrders) {
    const k = orderAccountKey(o); if (!k) continue
    for (const l of (o.po_line_items || [])) {
      const key = String(l.product_name || '').trim(); if (!key) continue
      let e = stockedByProduct.get(key); if (!e) { e = { retail: isRetailSku(key), accts: new Set() }; stockedByProduct.set(key, e) }
      e.accts.add(k)
      const ps = productsByStockedAccount.get(k) || new Set<string>(); ps.add(key); productsByStockedAccount.set(k, ps)
    }
  }
  const stockedAtByProduct = new Map<string, number>()
  for (const [key, e] of stockedByProduct) stockedAtByProduct.set(key, e.accts.size)

  // ── Events ──
  const consumers = input.tastingConsumers || {}
  const periodEvents = input.events
    .filter(e => e.status !== 'cancelled' && !!EVENT_TYPE_LABEL[e.event_type || ''] && within(toMs(e.start_time), range.startMs, range.endMs))
    .sort((a, b) => toMs(b.start_time) - toMs(a.start_time))
  const events: EventRow[] = periodEvents.map(e => ({
    id: e.id, date: mtDayKey(toMs(e.start_time)),
    account: e.accounts?.name || (e.account_id ? nameOf(e.account_id) : '') || e.title || 'Event',
    type: e.event_type || 'other', typeLabel: EVENT_TYPE_LABEL[e.event_type || ''],
    consumers: consumers[e.id] || 0,
  }))
  const tastings = events.filter(e => e.type === 'tasting')
  const eventSummary = { tastings: tastings.length, consumers: sum(tastings.map(t => t.consumers)), other: events.length - tastings.length }

  // ── Measures + sparklines ──
  const measures = {
    accountsVisited: delta(reached(visits, orders).length, reached(priorVisits, priorOrders).length),
    visits: visits.length,
    orders: delta(orders.length, priorOrders.length),
    orderValue: delta(valueOf(orders), valueOf(priorOrders)),
  }
  const months = recentMonths(nowMs, 6)
  const inMonth = (m: { startMs: number; endMs: number }) => ({
    v: allVisits.filter(v => within(toMs(v.visited_at), m.startMs, m.endMs)),
    o: allOrders.filter(o => within(orderDateMs(o), m.startMs, m.endMs)),
  })
  const sparklines: SparkSeries = {
    months: months.map(m => ({ key: m.key, label: m.label })),
    accountsVisited: months.map(m => { const x = inMonth(m); return reached(x.v, x.o).length }),
    orders: months.map(m => inMonth(m).o.length),
    orderValue: months.map(m => valueOf(inMonth(m).o)),
  }

  // ── All time ──
  const orderingAccounts = ordersByAccount.size
  const reorderingAccounts = [...ordersByAccount.values()].filter(l => l.length >= 2).length
  const allValue = valueOf(allOrders)
  const allTime = {
    accounts: reached(allVisits, allOrders).length, orders: allOrders.length, value: allValue,
    orderingAccounts, reorderingAccounts, avgOrder: allOrders.length ? round2(allValue / allOrders.length) : 0,
  }

  // ── Funnel ──
  const visitedIds = reached(visits, orders)
  const orderedIds = uniq(orderAccounts(orders))
  const firstTime = orderedIds.filter(id => within(firstOrderMs(id), range.startMs, range.endMs)).length
  const funnel = {
    visited: visitedIds.length, visits: visits.length, ordered: orderedIds.length,
    firstTime,
    repeat: orderedIds.filter(id => (ordersByAccount.get(id)?.length || 0) >= 2).length,
    priorVisited: reached(priorVisits, priorOrders).length,
    priorOrdered: uniq(orderAccounts(priorOrders)).length,
    conversionPct: visitedIds.length ? Math.round(orderedIds.length / visitedIds.length * 100) : null,
  }

  const stocked = {
    windowStartKey, windowEndKey,
    accounts: stockedIds.size, reorderingAccounts, orderingAccounts, newAccounts: firstTime, tastings: tastings.length,
    byProduct: [...stockedByProduct.entries()].map(([key, e]) => ({ name: stripProductName(key), retail: e.retail, accounts: e.accts.size }))
      .sort((a, b) => b.accounts - a.accounts || a.name.localeCompare(b.name)).slice(0, 8),
  }

  // ── Cumulative order value by day (current drawn to today, prior for its whole span) ──
  const todayKey = mtDayKey(nowMs)
  const cumulate = (list: PortalOrder[], startKey: string, endKey: string) => {
    const byDay = new Map<string, { value: number; orders: number }>()
    for (const o of list) { const k = mtDayKey(orderDateMs(o)); const c = byDay.get(k) || { value: 0, orders: 0 }; c.value += orderValue(o); c.orders += 1; byDay.set(k, c) }
    const out: CumulativePoint[] = []
    let acc = 0
    for (let k = startKey; k <= endKey; k = addDays(k, 1)) { const c = byDay.get(k); acc = round2(acc + (c?.value || 0)); out.push({ date: k, value: acc, orders: c?.orders || 0 }) }
    return out
  }
  const curEndKey = range.fullEndKey > todayKey ? todayKey : range.fullEndKey
  const cumulative = {
    current: curEndKey >= range.startKey ? cumulate(orders, range.startKey, curEndKey) : [],
    prior: cumulate(priorOrders, range.priorStartKey, range.priorEndKey).map(p => ({ date: p.date, value: p.value })),
    axisDays: range.days,
  }

  // ── Ledgers ──
  const lastVisitRowByAccount = new Map<string, string>()
  for (const v of allVisits) { if (!v.account_id) continue; const k = mtDayKey(toMs(v.visited_at)); if (!lastVisitRowByAccount.has(v.account_id) || k > (lastVisitRowByAccount.get(v.account_id) as string)) lastVisitRowByAccount.set(v.account_id, k) }
  // "Last visit" is the latest of a visit row or an order (an order implies a visit).
  const lastVisitOf = (id: string): string | null => {
    const v = lastVisitRowByAccount.get(id) || null, o = lastOrderKey(id)
    return !v ? o : !o ? v : (v > o ? v : o)
  }

  const accountRows = (V: PortalVisit[], O: PortalOrder[]): AccountRow[] => {
    const rows = new Map<string, AccountRow>()
    const touch = (id: string): AccountRow => {
      let r = rows.get(id)
      if (!r) {
        const all = ordersByAccount.get(id) || []
        r = {
          id, name: nameOf(id), type: typeOf(id), lastVisit: lastVisitOf(id), lastOrder: lastOrderKey(id),
          visits: 0, orders: 0, value: 0, allTimeValue: valueOf(all), allTimeOrders: all.length,
        }
        if (staff) r.cadence = cadenceFor(all.map(orderDateMs), nowMs)
        rows.set(id, r)
      }
      return r
    }
    for (const v of V) if (v.account_id) touch(v.account_id).visits++
    for (const o of O) { const k = orderAccountKey(o); if (!k) continue; const r = touch(k); r.orders++; r.value = round2(r.value + orderValue(o)) }
    return [...rows.values()].sort((a, b) => b.value - a.value || b.visits - a.visits || a.name.localeCompare(b.name))
  }
  const orderRows = (O: PortalOrder[]): OrderRow[] => O.map(o => {
    const k = orderAccountKey(o)
    return {
      id: o.id, accountId: k, accountName: nameOf(k), date: mtDayKey(orderDateMs(o)), po: o.po_number || '',
      products: describeOrder(o),
      lines: (o.po_line_items || []).map(l => { const q = lineQty(l); return { name: stripProductName(l.product_name), retail: isRetailSku(l.product_name), cases: q.cases, bottles: q.bottles, value: round2(lineValue(l)) } }),
      total: round2(orderValue(o)), status: o.status, statusLabel: o.status === 'fulfilled' ? 'Fulfilled' : 'Sent',
    }
  })
  const productRows = (O: PortalOrder[]): ProductRow[] => {
    const rows = new Map<string, ProductRow & { acctSet: Set<string> }>()
    for (const o of O) for (const l of (o.po_line_items || [])) {
      const key = String(l.product_name || '').trim()
      if (!key) continue
      let r = rows.get(key)
      if (!r) { r = { name: stripProductName(key), retail: isRetailSku(key), cases: 0, bottles: 0, value: 0, accounts: 0, stockedAt: stockedAtByProduct.get(key) || 0, acctSet: new Set() }; rows.set(key, r) }
      const q = lineQty(l)
      r.cases += q.cases; r.bottles += q.bottles; r.value = round2(r.value + lineValue(l))
      const k = orderAccountKey(o); if (k) r.acctSet.add(k)
    }
    return [...rows.values()].map(r => ({ name: r.name, retail: r.retail, cases: r.cases, bottles: r.bottles, value: r.value, accounts: r.acctSet.size, stockedAt: r.stockedAt }))
      .sort((a, b) => b.value - a.value || b.cases - a.cases || a.name.localeCompare(b.name))
  }

  // ── Timeline: union of visits and orders by account and MT day ──
  const ordersByAcctDay = new Map<string, PortalOrder[]>()
  for (const o of orders) { const k = `${orderAccountKey(o)}__${mtDayKey(orderDateMs(o))}`; const l = ordersByAcctDay.get(k) || []; l.push(o); ordersByAcctDay.set(k, l) }

  const stopFromOrders = (acct: string, day: string, list: PortalOrder[], visit: PortalVisit | null): TimelineStop => {
    const total = round2(sum(list.map(orderValue)))
    const first = !Number.isNaN(firstOrderMs(acct)) && mtDayKey(firstOrderMs(acct)) === day
    return {
      id: visit ? visit.id : `o:${list[0].id}`, accountId: acct, name: nameOf(acct), type: typeOf(acct), kind: 'order', label: 'Ordered',
      text: list.map(describeOrder).join('; ') + (first ? ' · first order here' : ''), amount: total, firstOrder: first,
      status: visit?.status ?? null, rep: visit?.user_id ? (repNames[visit.user_id] || null) : null, visitedAt: visit?.visited_at ?? null,
    }
  }
  const timelineVisits = visits.filter(v => v.account_id && (staff || v.status !== 'Not Interested'))
  const dayMap = new Map<string, TimelineStop[]>()
  const covered = new Set<string>()
  for (const v of timelineVisits) {
    const acct = v.account_id as string
    const day = mtDayKey(toMs(v.visited_at))
    const key = `${acct}__${day}`
    covered.add(key)
    const dayOrders = ordersByAcctDay.get(key)
    const notes = (v.notes || '').trim()
    const rep = v.user_id ? (repNames[v.user_id] || null) : null
    let stop: TimelineStop
    if (dayOrders?.length) stop = stopFromOrders(acct, day, dayOrders, v)
    else {
      const base = { id: v.id, accountId: acct, name: nameOf(acct), type: typeOf(acct), status: v.status, rep, visitedAt: v.visited_at }
      if (v.status === 'Menu Feature Won') stop = { ...base, kind: 'placement', label: 'Menu feature', text: notes }
      else if (v.status === 'New Placement') stop = { ...base, kind: 'placement', label: 'New placement', text: notes }
      else if (v.status === 'Tasted') stop = { ...base, kind: 'tasting', label: 'Tasting', text: notes }
      else if (v.status === 'Will Order Soon' || v.status === 'Needs Follow Up') stop = { ...base, kind: 'followup', label: 'Follow-up', text: notes }
      else if (v.status === 'Not Interested') stop = { ...base, kind: 'passed', label: 'Passed', text: notes }
      else stop = { ...base, kind: 'visit', label: null, text: notes }
    }
    const l = dayMap.get(day) || []; l.push(stop); dayMap.set(day, l)
  }
  // Orders placed on a day with no visit row for that account still produce a stop.
  for (const [key, list] of ordersByAcctDay) {
    if (covered.has(key)) continue
    const [acct, day] = key.split('__')
    if (!acct || !day) continue
    const l = dayMap.get(day) || []; l.push(stopFromOrders(acct, day, list, null)); dayMap.set(day, l)
  }
  const dayOrderTotal = new Map<string, number>()
  for (const o of orders) { const k = mtDayKey(orderDateMs(o)); dayOrderTotal.set(k, round2((dayOrderTotal.get(k) || 0) + orderValue(o))) }
  const timeline: TimelineDay[] = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, stops]) => ({
    date, weekday: fmtWeekday(date), label: fmtShort(date),
    stops: stops.sort((a, b) => (a.kind === 'order' || a.kind === 'placement' ? 0 : 1) - (b.kind === 'order' || b.kind === 'placement' ? 0 : 1) || a.name.localeCompare(b.name)),
    orderTotal: dayOrderTotal.get(date) || 0,
  }))

  // ── Map ──
  const tiedIds = new Set(reached(allVisits, allOrders))
  const visitedInPeriod = new Set(visitedIds)
  const orderedInPeriod = new Set(orderedIds)
  const periodValueByAccount = new Map<string, number>()
  for (const o of orders) { const k = orderAccountKey(o); periodValueByAccount.set(k, round2((periodValueByAccount.get(k) || 0) + orderValue(o))) }
  const mapAccounts: MapAccount[] = (input.accounts || [])
    .filter(a => typeof a.lat === 'number' && typeof a.lng === 'number' && a.lat !== 0 && a.lng !== 0 && tiedIds.has(a.id))
    .map(a => ({
      id: a.id, name: a.name, type: a.account_type ?? null, lat: a.lat as number, lng: a.lng as number,
      stocked: stockedIds.has(a.id), orderedInPeriod: orderedInPeriod.has(a.id), visitedInPeriod: visitedInPeriod.has(a.id),
      lastVisit: lastVisitOf(a.id), productsStocked: productsByStockedAccount.get(a.id)?.size || 0, periodValue: periodValueByAccount.get(a.id) || 0,
    }))

  return {
    range, nowMs, staff,
    trackingStart, trackingStartLabel: trackingStart ? fmtMonthLong(trackingStart) : null, trackingStartMon: trackingStart ? fmtMon(trackingStart) : null,
    visits, priorVisits, orders, priorOrders, allVisits, allOrders, accountInfo, repNames,
    measures, sparklines, allTime, stocked, cumulative, funnel,
    accountsLedger: { period: accountRows(visits, orders), all: accountRows(allVisits, allOrders) },
    ordersLedger: { period: orderRows(orders), all: orderRows(allOrders) },
    productsLedger: { period: productRows(orders), all: productRows(allOrders) },
    events, eventSummary,
    timeline, timelineStops: sum(timeline.map(d => d.stops.length)),
    mapAccounts,
  }
}

// ── Account drawer ────────────────────────────────────────────────────────────

export function getAccountDetail(report: PeriodReport, accountId: string): AccountDetail | null {
  const info = report.accountInfo[accountId]
  const isNameKey = accountId.startsWith('name:')
  if (!info && !isNameKey) return null
  const name = info?.name || accountId.slice(5)
  const visits = report.allVisits.filter(v => v.account_id === accountId && (report.staff || v.status !== 'Not Interested'))
  const orders = report.allOrders.filter(o => orderAccountKey(o) === accountId)   // newest first
  const firstMs = [...visits.map(v => toMs(v.visited_at)), ...orders.map(orderDateMs)].filter(n => !Number.isNaN(n))
  const firstVisit = firstMs.length ? mtDayKey(Math.min(...firstMs)) : null
  const products = new Map<string, { name: string; retail: boolean; cases: number; bottles: number; lastOrdered: string }>()
  for (const o of orders) {
    const day = mtDayKey(orderDateMs(o))
    for (const l of (o.po_line_items || [])) {
      const key = String(l.product_name || '').trim(); if (!key) continue
      const q = lineQty(l)
      const p = products.get(key) || { name: stripProductName(key), retail: isRetailSku(key), cases: 0, bottles: 0, lastOrdered: day }
      p.cases += q.cases; p.bottles += q.bottles; if (day > p.lastOrdered) p.lastOrdered = day
      products.set(key, p)
    }
  }
  return {
    id: accountId, name, type: info?.type ?? null, firstVisit,
    lastOrder: orders.length ? mtDayKey(orderDateMs(orders[0])) : null,
    ordersAllTime: orders.length, valueAllTime: round2(sum(orders.map(orderValue))),
    products: [...products.values()].sort((a, b) => b.cases - a.cases || b.bottles - a.bottles || a.name.localeCompare(b.name)),
    orders: report.ordersLedger.all.filter(r => r.accountId === accountId),
    visits: visits.slice(0, 10).map(v => ({
      id: v.id, date: mtDayKey(toMs(v.visited_at)), notes: (v.notes || '').trim(), status: v.status,
      label: CLIENT_OUTCOME_LABEL[v.status] || 'Visit', rep: v.user_id ? (report.repNames[v.user_id] || null) : null,
      win: ['Just Ordered', 'New Placement', 'Menu Feature Won'].includes(v.status),
    })),
  }
}

// ── Formatting shared by screen and PDF ───────────────────────────────────────

export function formatDelta(d: Delta, unit: 'count' | 'dollars' = 'count'): string {
  if (d.dir === 'flat') return '— no change'
  const abs = Math.abs(d.diff)
  const num = unit === 'dollars' ? '$' + Math.round(abs).toLocaleString('en-US') : String(abs)
  return d.dir === 'up' ? `▲ +${num}` : `▼ −${num}`
}

export function formatPdfDelta(d: Delta, unit: 'count' | 'dollars', compareLabel: string): string {
  const abs = Math.abs(d.diff)
  const num = unit === 'dollars' ? '$' + Math.round(abs).toLocaleString('en-US') : String(abs)
  const sign = d.dir === 'down' ? '−' : '+'
  return `${sign}${num} vs ${compareLabel}`
}

// ── PDF data (monthly and quarterly) ──────────────────────────────────────────

export interface MonthlyPdfData {
  monthKey: string
  label: string                       // "October 2026"
  compareLabel: string                // "previous month"
  accountsVisited: Delta
  visits: number
  orders: Delta
  value: Delta
  weeks: { label: string; value: number }[]
  topAccounts: { name: string; orders: number; value: number }[]
  products: { name: string; retail: boolean; cases: number; bottles: number }[]
  stocked: { accounts: number; reorderingAccounts: number; newThisMonth: number; tastings: number }
}

export interface QuarterlyPdfData {
  year: number
  q: number
  label: string                       // "Q3 2026"
  months: { key: string; label: string; accountsVisited: number; orders: number; value: number; newAccounts: number; tastings: number }[]
  totals: { accountsVisited: number; orders: number; value: number; newAccounts: number; tastings: number }
  topAccounts: { name: string; orders: number; value: number }[]
  products: { name: string; retail: boolean; cases: number; bottles: number }[]
}

export type PdfSource = Omit<ReportInput, 'range' | 'staff' | 'repNames'>

export function buildMonthlyPdfData(src: PdfSource, monthKey: string): MonthlyPdfData {
  const range = resolveRange({ mode: 'month', anchor: monthKey, customStart: '', customEnd: '' }, src.nowMs)
  const r = buildPeriodReport({ ...src, range, staff: false })
  const weeks: { label: string; value: number }[] = []
  for (let i = 0; i < 5; i++) {
    const ws = addDays(range.startKey, i * 7)
    if (ws > range.fullEndKey) break
    const we = addDays(ws, 6) > range.fullEndKey ? range.fullEndKey : addDays(ws, 6)
    const value = round2(sum(r.orders.filter(o => { const k = mtDayKey(orderDateMs(o)); return k >= ws && k <= we }).map(orderValue)))
    weeks.push({ label: fmtShort(ws), value })
  }
  const productTotals = r.productsLedger.period.slice().sort((a, b) => b.cases - a.cases || b.bottles - a.bottles || b.value - a.value)
  return {
    monthKey, label: range.label, compareLabel: range.compareLabel,
    accountsVisited: r.measures.accountsVisited, visits: r.measures.visits, orders: r.measures.orders, value: r.measures.orderValue,
    weeks,
    topAccounts: r.accountsLedger.period.filter(a => a.orders > 0).sort((a, b) => b.value - a.value).slice(0, 10).map(a => ({ name: a.name, orders: a.orders, value: a.value })),
    products: productTotals.slice(0, 6).map(p => ({ name: p.name, retail: p.retail, cases: p.cases, bottles: p.bottles })),
    stocked: { accounts: r.stocked.accounts, reorderingAccounts: r.stocked.reorderingAccounts, newThisMonth: r.stocked.newAccounts, tastings: r.stocked.tastings },
  }
}

export function buildQuarterlyPdfData(src: PdfSource, year: number, q: number): QuarterlyPdfData {
  const first = quarterFirstMonth(year, q)
  const qRange = resolveRange({ mode: 'quarter', anchor: first, customStart: '', customEnd: '' }, src.nowMs)
  const qr = buildPeriodReport({ ...src, range: qRange, staff: false })
  const months = [0, 1, 2].map(i => {
    const key = addMonths(first, i)
    const mr = buildPeriodReport({ ...src, range: resolveRange({ mode: 'month', anchor: key, customStart: '', customEnd: '' }, src.nowMs), staff: false })
    return { key, label: fmtMon(key), accountsVisited: mr.measures.accountsVisited.current, orders: mr.measures.orders.current, value: mr.measures.orderValue.current, newAccounts: mr.stocked.newAccounts, tastings: mr.stocked.tastings }
  })
  const productTotals = qr.productsLedger.period.slice().sort((a, b) => b.cases - a.cases || b.bottles - a.bottles || b.value - a.value)
  return {
    year, q, label: qRange.label, months,
    totals: {
      accountsVisited: qr.measures.accountsVisited.current, orders: qr.measures.orders.current, value: qr.measures.orderValue.current,
      newAccounts: qr.stocked.newAccounts, tastings: qr.stocked.tastings,
    },
    topAccounts: qr.accountsLedger.period.filter(a => a.orders > 0).sort((a, b) => b.value - a.value).slice(0, 8).map(a => ({ name: a.name, orders: a.orders, value: a.value })),
    products: productTotals.slice(0, 6).map(p => ({ name: p.name, retail: p.retail, cases: p.cases, bottles: p.bottles })),
  }
}
