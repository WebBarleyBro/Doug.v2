// Unit tests for the pure portal calculations. Run with:
//   node "app/portal/[slug]/__tests__/run.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  type PortalVisit, type PortalOrder, type PortalPlacement, type ReportInput,
  resolveRange, parseHash, toHash, stepSelection, defaultSelection,
  dedupeByAccountDay, delta, formatDelta, cadenceFor, buildPeriodReport, buildMonthlyPdfData, buildQuarterlyPdfData,
  mtDayKey, mtStartOfDayMs, addDays, lineQty, describeOrder, getAccountDetail,
} from '../portal-metrics'

// Noon Mountain Time, Thursday October 30 2026.
const NOW = Date.parse('2026-10-30T18:00:00Z')

const visit = (id: string, account: string, at: string, status = 'General Check-In', extra: Partial<PortalVisit> = {}): PortalVisit =>
  ({ id, account_id: account, visited_at: at, status, notes: `note ${id}`, user_id: 'rep-1', accounts: { id: account, name: `Account ${account}`, account_type: 'on_premise' }, ...extra })

const order = (id: string, account: string, sentAt: string, total: number, status = 'sent', lines?: PortalOrder['po_line_items']): PortalOrder => ({
  id, account_id: account, sent_at: sentAt, created_at: sentAt, status, total_amount: total, po_number: `PO-${id}`,
  accounts: { id: account, name: `Account ${account}` },
  po_line_items: lines || [{ product_name: 'Ridge Mountain Gin', cases: 1, bottles: 0, unit_price: total, total }],
})

const placement = (id: string, account: string, createdAt: string, status = 'on_shelf', type = 'shelf', lost: string | null = null): PortalPlacement =>
  ({ id, account_id: account, product_name: 'Rye', placement_type: type, status, created_at: createdAt, lost_at: lost, accounts: { id: account, name: `Account ${account}` } })

const month = (anchor: string) => resolveRange({ mode: 'month', anchor, customStart: '', customEnd: '' }, NOW)
const base = (over: Partial<ReportInput> = {}): ReportInput => ({ visits: [], placements: [], orders: [], events: [], range: month('2026-10'), nowMs: NOW, ...over })

// ── Dates ─────────────────────────────────────────────────────────────────────

test('MT day keys handle the UTC/MT boundary and DST', () => {
  assert.equal(mtDayKey(Date.parse('2026-10-01T04:30:00Z')), '2026-09-30')   // 22:30 MDT on Sep 30
  assert.equal(mtDayKey(Date.parse('2026-10-01T06:30:00Z')), '2026-10-01')   // 00:30 MDT on Oct 1
  assert.equal(new Date(mtStartOfDayMs('2026-10-01')).toISOString(), '2026-10-01T06:00:00.000Z')  // MDT
  assert.equal(new Date(mtStartOfDayMs('2026-12-01')).toISOString(), '2026-12-01T07:00:00.000Z')  // MST
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
})

// ── Period model ──────────────────────────────────────────────────────────────

test('month that includes today is "to date", ends today for calculations, full axis, next disabled', () => {
  const r = month('2026-10')
  assert.equal(r.label, 'October 2026')
  assert.equal(r.labelToDate, 'October 2026 to date')
  assert.equal(r.compareLabel, 'previous month')
  assert.equal(r.startKey, '2026-10-01'); assert.equal(r.endKey, '2026-10-30'); assert.equal(r.fullEndKey, '2026-10-31')
  assert.equal(r.days, 31); assert.equal(r.partial, true); assert.equal(r.canNext, false)
  assert.equal(r.priorStartKey, '2026-09-01'); assert.equal(r.priorEndKey, '2026-09-30'); assert.equal(r.priorDays, 30)
  assert.equal(r.hash, '#2026-10'); assert.equal(r.navLabel, 'Oct 2026')
})

test('a finished month is not partial and can step forward', () => {
  const r = month('2026-09')
  assert.equal(r.labelToDate, 'September 2026'); assert.equal(r.partial, false); assert.equal(r.canNext, true)
  assert.equal(r.endKey, '2026-09-30')
})

test('quarter, 30-day and custom labels match the spec exactly', () => {
  const q = resolveRange({ mode: 'quarter', anchor: '2026-07', customStart: '', customEnd: '' }, NOW)
  assert.equal(q.label, 'Q3 2026'); assert.equal(q.compareLabel, 'previous quarter'); assert.equal(q.hash, '#q3-2026')
  assert.equal(q.startKey, '2026-07-01'); assert.equal(q.fullEndKey, '2026-09-30'); assert.equal(q.priorStartKey, '2026-04-01'); assert.equal(q.priorEndKey, '2026-06-30')
  assert.deepEqual(q.monthKeys, ['2026-07', '2026-08', '2026-09']); assert.equal(q.partial, false)

  const q4 = resolveRange({ mode: 'quarter', anchor: '2026-10', customStart: '', customEnd: '' }, NOW)
  assert.equal(q4.labelToDate, 'Q4 2026 to date'); assert.equal(q4.canNext, false); assert.equal(q4.endKey, '2026-10-30')

  const d = resolveRange({ mode: '30d', anchor: '2026-10', customStart: '', customEnd: '' }, NOW)
  assert.equal(d.label, 'Last 30 days'); assert.equal(d.compareLabel, 'previous 30 days')
  assert.equal(d.startKey, '2026-10-01'); assert.equal(d.endKey, '2026-10-30'); assert.equal(d.days, 30)
  assert.equal(d.priorStartKey, '2026-09-01'); assert.equal(d.priorEndKey, '2026-09-30'); assert.equal(d.hash, '#30d')

  const c = resolveRange({ mode: 'custom', anchor: '2026-10', customStart: '2026-09-15', customEnd: '2026-10-15' }, NOW)
  assert.equal(c.label, 'Sep 15 – Oct 15, 2026'); assert.equal(c.compareLabel, 'previous 31 days'); assert.equal(c.days, 31)
  assert.equal(c.priorStartKey, '2026-08-15'); assert.equal(c.priorEndKey, '2026-09-14'); assert.equal(c.hash, '#2026-09-15_2026-10-15')
})

test('hash round-trips and stepping', () => {
  for (const h of ['#2026-10', '#q3-2026', '#30d', '#2026-09-15_2026-10-15']) assert.equal(toHash(parseHash(h, NOW)), h)
  assert.deepEqual(parseHash('#garbage', NOW), defaultSelection(NOW))
  assert.equal(parseHash('', NOW).anchor, '2026-10')
  assert.equal(stepSelection(parseHash('#2026-01', NOW), -1).anchor, '2025-12')
  assert.equal(toHash(stepSelection(parseHash('#q4-2026', NOW), -1)), '#q3-2026')
  assert.equal(toHash(stepSelection(parseHash('#q1-2026', NOW), -1)), '#q4-2025')
})

// ── Dedupe ────────────────────────────────────────────────────────────────────

test('dedupeByAccountDay keeps one visit per account per MT day and prefers the stronger outcome', () => {
  const vs = [
    visit('a', 'acc1', '2026-09-30T18:00:00', 'General Check-In'),
    visit('b', 'acc1', '2026-10-01T04:30:00Z', 'Just Ordered'),     // still Sep 30 in MT
    visit('c', 'acc1', '2026-10-01T18:00:00', 'General Check-In'),  // Oct 1
    visit('d', 'acc2', '2026-09-30T18:00:00', 'Needs Follow Up'),
  ]
  const out = dedupeByAccountDay(vs)
  assert.equal(out.length, 3)
  assert.equal(out.find(v => v.account_id === 'acc1' && mtDayKey(Date.parse(v.visited_at.endsWith('Z') ? v.visited_at : v.visited_at + 'Z')) === '2026-09-30')?.status, 'Just Ordered')
  assert.equal(out[0].id, 'c')  // newest first
})

// ── Cumulative alignment across a month boundary ──────────────────────────────

test('cumulative series bucket by MT day; a late-night Sep 30 order lands in the prior period', () => {
  const r = buildPeriodReport(base({
    orders: [
      order('late', 'acc1', '2026-10-01T04:30:00Z', 100),   // Sep 30 22:30 MDT → prior (September)
      order('oct1', 'acc2', '2026-10-01T15:00:00Z', 50),
      order('oct9', 'acc2', '2026-10-09T15:00:00Z', 25),
      order('draft', 'acc3', '2026-10-10T15:00:00Z', 999, 'draft'),
    ],
  }))
  assert.equal(r.cumulative.axisDays, 31)
  assert.equal(r.cumulative.current.length, 30)            // Oct 1 .. Oct 30 (today)
  assert.equal(r.cumulative.prior.length, 30)              // the whole of September
  assert.equal(r.cumulative.current[0].date, '2026-10-01'); assert.equal(r.cumulative.current[0].value, 50); assert.equal(r.cumulative.current[0].orders, 1)
  assert.equal(r.cumulative.current[8].value, 75); assert.equal(r.cumulative.current[29].value, 75)
  assert.equal(r.cumulative.prior[28].value, 0); assert.equal(r.cumulative.prior[29].value, 100); assert.equal(r.cumulative.prior[29].date, '2026-09-30')
  assert.equal(r.measures.orderValue.current, 75); assert.equal(r.measures.orderValue.prior, 100); assert.equal(r.measures.orderValue.dir, 'down')
  assert.equal(r.measures.orders.current, 2)               // draft never counts
})

// ── Funnel first-time logic ───────────────────────────────────────────────────

test('funnel: first-time means the earliest order ever falls in the period; repeat means 2+ orders all time', () => {
  const r = buildPeriodReport(base({
    visits: [visit('v1', 'accA', '2026-10-05T18:00:00'), visit('v2', 'accB', '2026-10-06T18:00:00'), visit('v3', 'accC', '2026-10-07T18:00:00'), visit('v4', 'accA', '2026-10-08T18:00:00')],
    orders: [
      order('o1', 'accA', '2026-09-10T15:00:00Z', 100),     // A ordered before
      order('o2', 'accA', '2026-10-12T15:00:00Z', 100),     // A again (repeat, not first-time)
      order('o3', 'accB', '2026-10-13T15:00:00Z', 80),      // B first ever order this period
      order('o4', 'accD', '2026-10-14T15:00:00Z', 60),      // D ordered without a visit
    ],
  }))
  assert.equal(r.funnel.visited, 3); assert.equal(r.funnel.visits, 4)
  assert.equal(r.funnel.ordered, 3); assert.equal(r.funnel.firstTime, 2); assert.equal(r.funnel.repeat, 1)
  assert.equal(r.funnel.priorVisited, 0); assert.equal(r.funnel.priorOrdered, 1)
  assert.equal(r.funnel.conversionPct, 100)
  assert.equal(buildPeriodReport(base()).funnel.conversionPct, null)
})

// ── Cadence ───────────────────────────────────────────────────────────────────

test('cadence flags: on pace ≤ avg gap, slipping ≤ 1.5×, otherwise overdue; nothing below 2 orders', () => {
  const d = (daysAgo: number) => NOW - daysAgo * 86400000
  assert.equal(cadenceFor([d(10)], NOW), null)
  assert.equal(cadenceFor([d(80), d(50), d(20)], NOW)?.flag, 'on pace')     // avg 30, since 20
  assert.equal(cadenceFor([d(100), d(70), d(40)], NOW)?.flag, 'slipping')   // avg 30, since 40
  assert.equal(cadenceFor([d(120), d(90), d(60)], NOW)?.flag, 'overdue')    // avg 30, since 60
  assert.equal(cadenceFor([d(90), d(60), d(30)], NOW)?.flag, 'on pace')     // since == avg counts as on pace
})

test('cadence and rep names only exist on staff reports', () => {
  const input = base({
    visits: [visit('v1', 'accA', '2026-10-05T18:00:00')],
    orders: [order('o1', 'accA', '2026-09-10T15:00:00Z', 100), order('o2', 'accA', '2026-10-12T15:00:00Z', 100)],
    repNames: { 'rep-1': 'Chase' },
  })
  const client = buildPeriodReport({ ...input, staff: false })
  const firm = buildPeriodReport({ ...input, staff: true })
  assert.equal(client.accountsLedger.period[0].cadence, undefined)
  assert.equal(client.timeline[0].stops[0].rep, null)
  assert.ok(firm.accountsLedger.period[0].cadence)
  assert.equal(firm.accountsLedger.all[0].cadence?.flag, 'on pace')
  assert.equal(firm.timeline.flatMap(d => d.stops).find(s => s.id === 'v1')?.rep, 'Chase')
})

// ── Not Interested ────────────────────────────────────────────────────────────

test('Not Interested counts as a visit but never appears in the client timeline or drawer', () => {
  const input = base({ visits: [visit('v1', 'accA', '2026-10-05T18:00:00', 'Not Interested'), visit('v2', 'accB', '2026-10-06T18:00:00')] })
  const client = buildPeriodReport({ ...input, staff: false })
  const firm = buildPeriodReport({ ...input, staff: true })
  assert.equal(client.measures.accountsVisited.current, 2)
  assert.equal(client.timelineStops, 1)
  assert.equal(getAccountDetail(client, 'accA')?.visits.length, 0)
  assert.equal(firm.timelineStops, 2)
  assert.equal(firm.timeline.flatMap(d => d.stops).find(s => s.accountId === 'accA')?.kind, 'passed')
})

// ── Timeline ──────────────────────────────────────────────────────────────────

test('timeline merges a visit with that day\'s orders, marks first orders, and keeps visit-less orders', () => {
  const r = buildPeriodReport(base({
    visits: [visit('v1', 'accA', '2026-10-05T18:00:00', 'Just Ordered'), visit('v2', 'accB', '2026-10-05T19:00:00', 'Will Order Soon', { notes: 'Wants a price sheet' })],
    orders: [
      order('o1', 'accA', '2026-10-05T20:00:00Z', 120, 'sent', [{ product_name: 'Ridge Mountain Gin (Off-Premise)', cases: 2, bottles: 0, unit_price: 60, total: 120 }]),
      order('o2', 'accC', '2026-10-07T20:00:00Z', 45, 'sent', [{ product_name: 'Rye', cases: 0, bottles: 3, unit_price: 180, total: 45 }]),
    ],
  }))
  const oct5 = r.timeline.find(d => d.date === '2026-10-05')!
  assert.equal(oct5.weekday, 'Monday'); assert.equal(oct5.label, 'Oct 5'); assert.equal(oct5.orderTotal, 120)
  const a = oct5.stops.find(s => s.accountId === 'accA')!
  assert.equal(a.kind, 'order'); assert.equal(a.label, 'Ordered'); assert.equal(a.text, '2 cs Ridge Mountain Gin · first order here'); assert.equal(a.amount, 120)
  const b = oct5.stops.find(s => s.accountId === 'accB')!
  assert.equal(b.kind, 'followup'); assert.equal(b.label, 'Follow-up'); assert.equal(b.text, 'Wants a price sheet')
  const oct7 = r.timeline.find(d => d.date === '2026-10-07')!
  assert.equal(oct7.stops[0].kind, 'order'); assert.equal(oct7.stops[0].text, '3 btl Rye · first order here'); assert.equal(oct7.stops[0].status, null)
  assert.equal(r.timelineStops, 3)
  assert.equal(r.timeline[0].date, '2026-10-07')   // newest day first
})

// ── Ledgers and products ──────────────────────────────────────────────────────

test('ledgers: units as stored, retail suffix stripped, value from line totals, scopes differ', () => {
  const r = buildPeriodReport(base({
    visits: [visit('v1', 'accA', '2026-09-05T18:00:00'), visit('v2', 'accA', '2026-10-05T18:00:00')],
    orders: [
      order('o1', 'accA', '2026-09-10T15:00:00Z', 100),
      order('o2', 'accA', '2026-10-12T15:00:00Z', 200, 'fulfilled', [
        { product_name: 'Ridge Mountain Gin (Off-Premise)', cases: 2, bottles: 0, unit_price: 60, total: 120 },
        { product_name: 'Rye', cases: 0, bottles: 2, unit_price: 257.7, total: 85.9 },
      ]),
    ],
    placements: [placement('p1', 'accA', '2026-05-01T18:00:00', 'on_shelf', 'shelf'), placement('p2', 'accA', '2026-05-01T18:00:00', 'reordering', 'menu'), placement('p3', 'accB', '2026-06-01T18:00:00', 'on_shelf', 'well', '2026-07-01T00:00:00Z')],
  }))
  const row = r.accountsLedger.period[0]
  assert.equal(row.visits, 1); assert.equal(row.orders, 1); assert.equal(row.value, 205.9); assert.equal(row.allTimeValue, 305.9); assert.equal(row.onShelf, 2); assert.equal(row.lastVisit, '2026-10-05')
  assert.equal(r.accountsLedger.all[0].visits, 2); assert.equal(r.accountsLedger.all[0].orders, 2)
  const o = r.ordersLedger.period[0]
  assert.equal(o.products, '2 cs Ridge Mountain Gin, 2 btl Rye'); assert.equal(o.statusLabel, 'Fulfilled'); assert.equal(o.total, 205.9); assert.equal(o.date, '2026-10-12')
  const gin = r.productsLedger.period.find(p => p.name === 'Ridge Mountain Gin')!
  assert.equal(gin.retail, true); assert.equal(gin.cases, 2); assert.equal(gin.value, 120); assert.equal(gin.accounts, 1); assert.equal(gin.onShelf, 0)
  const rye = r.productsLedger.period.find(p => p.name === 'Rye')!
  assert.equal(rye.cases, 0); assert.equal(rye.bottles, 2); assert.equal(rye.value, 85.9); assert.equal(rye.onShelf, 2)
  assert.equal(r.productsLedger.all.length, 2)
  assert.equal(r.secondary.onShelf, 2); assert.equal(r.placements.active, 2); assert.equal(r.placements.accounts, 1)
  assert.deepEqual(r.placementLocations.map(l => l.label), ['Back bar / shelf', 'Menu'])
  assert.equal(r.measures.orderValue.current, 205.9)
})

test('line quantities fall back to a generic quantity column but never convert bottles', () => {
  assert.deepEqual(lineQty({ quantity: 3 }), { cases: 3, bottles: 0 })
  assert.deepEqual(lineQty({ cases: 1, bottles: 2 }), { cases: 1, bottles: 2 })
  assert.equal(describeOrder(order('x', 'a', '2026-10-01T15:00:00Z', 10, 'sent', [{ product_name: 'A', cases: 1, bottles: 2, total: 10 }, { product_name: 'B (Off-Premise)', cases: 0, bottles: 1, total: 5 }])), '1 cs + 2 btl A, 1 btl B')
})

// ── All-time, tracking start, sparklines ──────────────────────────────────────

test('tracking start, all-time rollups, reordering accounts and six-month sparklines', () => {
  const r = buildPeriodReport(base({
    visits: [visit('v1', 'accA', '2026-04-16T18:00:00'), visit('v2', 'accB', '2026-06-01T18:00:00')],
    orders: [order('o1', 'accA', '2026-04-17T00:33:00Z', 100), order('o2', 'accA', '2026-08-01T15:00:00Z', 50), order('o3', 'accB', '2026-10-01T15:00:00Z', 30)],
  }))
  assert.equal(r.trackingStart, '2026-04-16'); assert.equal(r.trackingStartLabel, 'April 2026'); assert.equal(r.trackingStartMon, 'Apr')
  assert.deepEqual(r.allTime, { accounts: 2, orders: 3, value: 180, orderingAccounts: 2, reorderingAccounts: 1, avgOrder: 60 })
  assert.deepEqual(r.sparklines.months.map(m => m.label), ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'])
  assert.deepEqual(r.sparklines.accountsVisited, [0, 1, 0, 0, 0, 0])
  assert.deepEqual(r.sparklines.orderValue, [0, 0, 0, 50, 0, 30])
  assert.equal(buildPeriodReport(base()).trackingStart, null)
})

// ── Deltas ────────────────────────────────────────────────────────────────────

test('delta formatting matches the spec', () => {
  assert.equal(formatDelta(delta(12, 8)), '▲ +4')
  assert.equal(formatDelta(delta(6, 8)), '▼ −2')
  assert.equal(formatDelta(delta(8, 8)), '— no change')
  assert.equal(formatDelta(delta(8940, 7620), 'dollars'), '▲ +$1,320')
})

// ── PDF data ──────────────────────────────────────────────────────────────────

test('monthly PDF weeks start on the 1st and quarterly totals equal the sum of months', () => {
  const src = {
    visits: [visit('v1', 'accA', '2026-07-05T18:00:00'), visit('v2', 'accA', '2026-08-05T18:00:00'), visit('v3', 'accB', '2026-10-05T18:00:00')],
    orders: [order('o1', 'accA', '2026-07-10T15:00:00Z', 100), order('o2', 'accB', '2026-09-29T15:00:00Z', 40), order('o3', 'accB', '2026-10-09T15:00:00Z', 60), order('o4', 'accA', '2026-10-30T15:00:00Z', 10)],
    placements: [], events: [], nowMs: NOW,
  }
  const m = buildMonthlyPdfData(src, '2026-10')
  assert.equal(m.label, 'October 2026')
  assert.deepEqual(m.weeks.map(w => w.label), ['Oct 1', 'Oct 8', 'Oct 15', 'Oct 22', 'Oct 29'])
  assert.deepEqual(m.weeks.map(w => w.value), [0, 60, 0, 0, 10])
  assert.equal(m.orders.current, 2); assert.equal(m.orders.prior, 1); assert.equal(m.visits, 1)
  assert.deepEqual(m.topAccounts.map(a => a.name), ['Account accB', 'Account accA'])
  const q = buildQuarterlyPdfData(src, 2026, 3)
  assert.equal(q.label, 'Q3 2026')
  assert.deepEqual(q.months.map(x => x.label), ['Jul', 'Aug', 'Sep'])
  assert.equal(q.totals.orders, 2); assert.equal(q.totals.value, 140); assert.equal(q.totals.accountsVisited, 1)
  assert.equal(q.months.reduce((s, x) => s + x.orders, 0), q.totals.orders)
})
