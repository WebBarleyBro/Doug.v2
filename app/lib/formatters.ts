const TZ = 'America/Denver'

// Given an MT date string "YYYY-MM-DD", return the UTC ISO string of MT midnight.
// MT is always UTC-6 (MDT) or UTC-7 (MST); this handles DST automatically.
function mtMidnightUTC(mtDateStr: string): string {
  for (const h of [6, 7]) {
    const candidate = new Date(`${mtDateStr}T${String(h).padStart(2, '0')}:00:00.000Z`)
    if (candidate.toLocaleDateString('en-CA', { timeZone: TZ }) === mtDateStr) {
      return candidate.toISOString()
    }
  }
  return `${mtDateStr}T07:00:00.000Z` // MST fallback
}

// Supabase returns timestamps without 'Z' but they ARE UTC. Without Z, JS parses
// them as local time — which breaks all date math. This fixes that.
function parseDB(dateStr: string): Date {
  if (dateStr.length > 10 && !dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
    return new Date(dateStr + 'Z')
  }
  return new Date(dateStr)
}

export function formatDateMT(dateStr: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!dateStr) return '—'
  return parseDB(dateStr).toLocaleDateString('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...opts,
  })
}

export function formatShortDateMT(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return parseDB(dateStr).toLocaleDateString('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
  })
}

export function formatMonthYear(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return parseDB(dateStr).toLocaleDateString('en-US', {
    timeZone: TZ,
    month: 'long',
    year: 'numeric',
  })
}

export function daysAgoMT(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const date = parseDB(dateStr)
  const now = new Date()
  // Compare calendar days in MT — prevents "today" from showing as -1
  const nowDay = now.toLocaleDateString('en-CA', { timeZone: TZ })
  const visitDay = date.toLocaleDateString('en-CA', { timeZone: TZ })
  const nowMidnight = new Date(nowDay + 'T00:00:00Z')
  const visitMidnight = new Date(visitDay + 'T00:00:00Z')
  return Math.round((nowMidnight.getTime() - visitMidnight.getTime()) / (1000 * 60 * 60 * 24))
}

export function todayMT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

export function saveDateMT(dateStr: string): string {
  if (!dateStr) return new Date().toISOString()
  return new Date(dateStr + 'T12:00:00').toISOString()
}

export function relativeTimeStr(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const days = daysAgoMT(dateStr)
  if (days === null) return null
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}wk ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}yr ago`
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0)
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

export function startOfMonthMT(): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const [y, m] = today.split('-')
  return mtMidnightUTC(`${y}-${m}-01`)
}

export function endOfMonthMT(): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const [y, m] = today.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const lastDayStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return new Date(new Date(mtMidnightUTC(lastDayStr)).getTime() + 86399000).toISOString()
}

export function startOfWeekMT(): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const noonUTC = new Date(`${today}T12:00:00Z`)
  const dowStr = noonUTC.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' })
  const dowMap: Record<string, number> = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 }
  noonUTC.setUTCDate(noonUTC.getUTCDate() - (dowMap[dowStr] ?? 0))
  const monDate = noonUTC.toLocaleDateString('en-CA', { timeZone: TZ })
  return mtMidnightUTC(monDate)
}

export function nDaysAgoMT(n: number): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return mtMidnightUTC(d.toLocaleDateString('en-CA', { timeZone: TZ }))
}

export function isFutureDate(dateStr: string): boolean {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return new Date(dateStr + 'T23:59:59') > today
}

export type HealthStatus = 'active' | 'warm' | 'cold' | 'dormant'

export interface AccountHealth {
  status: HealthStatus
  color: string
  label: string
  reason: string
}

const ACTIVE_PLACEMENT_STATUSES = new Set(['committed', 'ordered', 'on_shelf', 'reordering'])

export function accountHealth(
  account: { last_visited?: string | null; visit_frequency_days?: number | null },
  placements?: Array<{ status?: string; updated_at?: string; lost_at?: string | null }>
): AccountHealth {
  const days = daysAgoMT(account.last_visited)
  const freq = account.visit_frequency_days || 30
  const hasActivePlacement = placements?.some(p => !p.lost_at && ACTIVE_PLACEMENT_STATUSES.has(p.status || '')) ?? false
  const stalePlacement = placements?.some(p => {
    if (!ACTIVE_PLACEMENT_STATUSES.has(p.status || '') || p.lost_at) return false
    const d = daysAgoMT(p.updated_at)
    return d !== null && d > 60
  }) ?? false

  if (days === null) {
    return { status: 'dormant', color: '#666', label: 'Dormant', reason: 'Never visited' }
  }
  if (days <= freq && (hasActivePlacement || placements === undefined)) {
    return { status: 'active', color: '#22c55e', label: 'Active', reason: `Visited ${days === 0 ? 'today' : `${days}d ago`}${hasActivePlacement ? ', active placement' : ''}` }
  }
  if (days > freq * 1.5 || stalePlacement) {
    const reason = stalePlacement ? 'Placement stale 60+ days' : `${days - freq}d overdue`
    return { status: 'cold', color: '#ef4444', label: 'Cold', reason }
  }
  const reason = placements !== undefined && !hasActivePlacement ? 'No active placement' : `${days - freq}d past schedule`
  return { status: 'warm', color: '#f59e0b', label: 'Warm', reason }
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function generatePONumber(): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `PO-${ymd}-${rand}`
}

export function resolveTotal(o: { po_line_items?: any[]; total_amount?: any; total?: any }): number {
  const items: any[] = o.po_line_items || []
  if (items.length > 0) {
    const fromItems = items.reduce((sum: number, li: any) => {
      const lineTotal = Number(li.total || 0)
      if (lineTotal > 0) return sum + lineTotal
      const price = Number(li.unit_price || li.price || 0)
      const qty = Number(li.cases || 0) + Number(li.bottles || 0) + Number(li.quantity || 0) || 1
      return sum + price * qty
    }, 0)
    if (fromItems > 0) return fromItems
  }
  return Number(o.total_amount || (o as any).total || 0)
}
