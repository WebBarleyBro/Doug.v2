'use client'
import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { ChevronDown, ChevronRight, MapPin, CheckCircle2, MinusCircle } from 'lucide-react'
import LayoutShell from '../layout-shell'
import StatCard from '../components/StatCard'
import VisitLogModal from '../components/VisitLogModal'
import { StatsSkeleton } from '../components/LoadingSkeleton'
import {
  getVisitTrend, getPlacementFunnel, getCommissionTrend,
  getClients, getPlacements, getVisits, clearFollowUp, dismissFollowUp,
} from '../lib/data'
import { getSupabase } from '../lib/supabase'
import { t, card } from '../lib/theme'
import { formatCurrency, formatShortDateMT, nDaysAgoMT } from '../lib/formatters'
import { clientLogoUrl, PLACEMENT_STATUS_LABELS } from '../lib/constants'
import type { Client, PlacementStatus } from '../lib/types'

const DATE_RANGES = [
  { label: '7D',   days: 7 },
  { label: '30D',  days: 30 },
  { label: '90D',  days: 90 },
  { label: '1Y',   days: 365 },
]

const CHART_STYLE = {
  tooltip: {
    backgroundColor: t.bg.elevated,
    border: `1px solid ${t.border.hover}`,
    borderRadius: '8px',
    padding: '10px 14px',
  },
}

function ChartTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={CHART_STYLE.tooltip}>
      <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '6px' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="mono" style={{ fontSize: '13px', color: p.color || t.gold, fontWeight: '600' }}>
          {p.name}: {currency ? formatCurrency(Number(p.value)) : p.value}
        </div>
      ))}
    </div>
  )
}

const VISIT_STATUS_COLORS: Record<string, string> = {
  'Will Order Soon':   t.status.warning,
  'Just Ordered':      t.status.success,
  'Needs Follow Up':   t.status.info,
  'Not Interested':    t.status.danger,
  'Menu Feature Won':  t.status.success,
  'New Placement':     t.gold,
  'General Check-In':  t.text.secondary,
}


export default function AnalyticsPage() {
  const [rangeDays, setRangeDays] = useState(30)
  const [clients, setClients] = useState<Client[]>([])
  const [visitData, setVisitData] = useState<any[]>([])
  const [commissionData, setCommissionData] = useState<any[]>([])
  const [funnel, setFunnel] = useState<any>(null)
  const [placementsByStatus, setPlacementsByStatus] = useState<any[]>([])
  const [placementsByBrand, setPlacementsByBrand] = useState<Record<string, number>>({})
  const [visitsByStatus, setVisitsByStatus] = useState<{ status: string; count: number }[]>([])
  const [visitsByStatusGrouped, setVisitsByStatusGrouped] = useState<Record<string, any[]>>({})
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [visitModal, setVisitModal] = useState<{ open: boolean; accountId?: string; accountName?: string }>({ open: false })
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [showAllByStatus, setShowAllByStatus] = useState<Record<string, boolean>>({})
  const [visitCounts, setVisitCounts] = useState<{ total: number; unique: number } | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: p } = await sb.from('user_profiles').select('*').eq('id', user.id).single()
        if (p) setProfile(p)
      }
    })
  }, [])

  useEffect(() => {
    setDismissedIds(new Set())
    setShowAllByStatus({})
    setVisitCounts(null)
    setLoading(true)
    setExpandedStatus(null)
    const end = new Date()
    const start = new Date(nDaysAgoMT(rangeDays))

    Promise.all([
      getClients(),
      getVisitTrend({ start, end }),
      getPlacementFunnel({ start, end }),
      getCommissionTrend(start, end),
      getPlacements(),
      getVisits({ since: start.toISOString(), limit: 500 }),
    ]).then(([cls, visitTrend, funnelData, commTrend, placements, recentVisits]) => {
      setClients(cls)
      setFunnel(funnelData)

      // Deduplicate visitTrend by (account_id, user_id, date) — one physical visit per account per day
      const visitSeen = new Set<string>()
      const dedupedVisits = visitTrend.filter((v: any) => {
        const key = `${v.account_id}|${v.user_id}|${String(v.visited_at).slice(0, 10)}`
        if (visitSeen.has(key)) return false
        visitSeen.add(key)
        return true
      })

      // Visit activity buckets — daily for ≤30D, weekly for ≤90D, monthly for 1Y
      const buckets = rangeDays <= 30 ? rangeDays : rangeDays <= 90 ? Math.ceil(rangeDays / 7) : Math.ceil(rangeDays / 30)
      const bucketMs = (rangeDays * 24 * 60 * 60 * 1000) / buckets
      const bucketData: { label: string; visits: number }[] = []
      for (let i = 0; i < buckets; i++) {
        const d = new Date(start.getTime() + i * bucketMs)
        bucketData.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), visits: 0 })
      }
      dedupedVisits.forEach((v: any) => {
        const vt = new Date(v.visited_at).getTime()
        const idx = Math.min(buckets - 1, Math.floor((vt - start.getTime()) / bucketMs))
        if (idx >= 0) bucketData[idx].visits++
      })
      setVisitData(bucketData)
      setVisitCounts({
        total: dedupedVisits.length,
        unique: new Set(dedupedVisits.map((v: any) => v.account_id).filter(Boolean)).size,
      })

      // Commission — bucket by day/week/month depending on range
      const commBuckets: { label: string; commission: number; keyStart: number; keyEnd: number; orders: any[] }[] = []
      const useDaily = rangeDays <= 14
      const useWeekly = rangeDays <= 90 && !useDaily
      if (useDaily) {
        for (let i = 0; i < rangeDays; i++) {
          const d = new Date(start.getTime() + i * 86400_000)
          commBuckets.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), commission: 0, keyStart: d.getTime(), keyEnd: d.getTime() + 86400_000, orders: [] })
        }
      } else if (useWeekly) {
        const weeks = Math.ceil(rangeDays / 7)
        for (let i = 0; i < weeks; i++) {
          const d = new Date(start.getTime() + i * 7 * 86400_000)
          commBuckets.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), commission: 0, keyStart: d.getTime(), keyEnd: d.getTime() + 7 * 86400_000, orders: [] })
        }
      } else {
        const months = Math.ceil(rangeDays / 30)
        for (let i = months - 1; i >= 0; i--) {
          const d = new Date()
          d.setDate(1)
          d.setMonth(d.getMonth() - i)
          const monthStart = d.getTime()
          const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
          commBuckets.push({ label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), commission: 0, keyStart: monthStart, keyEnd: monthEnd, orders: [] })
        }
      }
      commTrend.forEach((o: any) => {
        const t2 = new Date(o.created_at).getTime()
        const bucket = commBuckets.find(b => t2 >= b.keyStart && t2 < b.keyEnd)
        if (bucket) { bucket.commission += Number(o.commission_amount || 0); bucket.orders.push(o) }
      })
      setCommissionData(commBuckets.map(b => ({ month: b.label, commission: b.commission })))

      // Placements by status (all active, not date-ranged — current state)
      const statusMap2: Record<string, number> = {}
      const brandMap: Record<string, number> = {}
      placements.forEach((p: any) => {
        statusMap2[p.status] = (statusMap2[p.status] || 0) + 1
        if (p.client_slug) brandMap[p.client_slug] = (brandMap[p.client_slug] || 0) + 1
      })
      const STATUS_ORDER: PlacementStatus[] = ['committed', 'ordered', 'on_shelf', 'reordering']
      setPlacementsByStatus(STATUS_ORDER.filter(s => statusMap2[s]).map(s => ({ name: s, value: statusMap2[s] })))
      setPlacementsByBrand(brandMap)

      // Visits by status — grouped for drill-down, deduplicated by account
      const statusCount: Record<string, number> = {}
      const grouped: Record<string, any[]> = {}
      recentVisits.forEach((v: any) => {
        if (!v.status) return
        if (!grouped[v.status]) grouped[v.status] = []
        // One entry per account per status — keep most-recent visit row
        const existing = grouped[v.status].findIndex((x: any) => x.account_id === v.account_id)
        if (existing === -1) {
          grouped[v.status].push(v)
          statusCount[v.status] = (statusCount[v.status] || 0) + 1
        } else if (new Date(v.visited_at) > new Date(grouped[v.status][existing].visited_at)) {
          grouped[v.status][existing] = v
        }
      })
      // Sort each group by most recent first
      Object.values(grouped).forEach(arr => arr.sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime()))
      setVisitsByStatus(Object.entries(statusCount).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count))
      setVisitsByStatusGrouped(grouped)

      setLoading(false)
    }).catch((e) => { console.error('analytics load error:', e); setLoading(false) })
  }, [rangeDays])

  const statusColors: Record<string, string> = {
    committed: t.status.warning,
    ordered: t.status.info,
    on_shelf: t.status.success,
    reordering: t.gold,
  }

  // Derive follow-up groups — deduplicated by account per status group
  const followUpGroups = (['Will Order Soon', 'Needs Follow Up'] as const).map(status => {
    const visits = (visitsByStatusGrouped[status] || [])
      .filter((v: any) => !dismissedIds.has(v.id))
      .map((v: any) => ({ ...v, _status: status }))
    const seen = new Set<string>()
    const deduped = visits.filter((v: any) => {
      if (seen.has(v.account_id)) return false
      seen.add(v.account_id)
      return true
    })
    return { status, color: VISIT_STATUS_COLORS[status], visits: deduped }
  }).filter(g => g.visits.length > 0)

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-h1" style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Analytics</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Field activity and performance data</p>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {DATE_RANGES.map(r => (
              <button key={r.days} onClick={() => setRangeDays(r.days)} style={{
                padding: '7px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                border: `1px solid ${rangeDays === r.days ? t.gold : t.border.default}`,
                backgroundColor: rangeDays === r.days ? t.goldDim : t.bg.card,
                color: rangeDays === r.days ? t.gold : t.text.secondary,
                fontWeight: rangeDays === r.days ? '700' : '400',
                fontFamily: 'inherit',
                transition: 'all 150ms ease',
              }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Funnel stats */}
        {loading ? <StatsSkeleton /> : funnel && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
            <StatCard label="Total Visits" value={visitCounts?.total ?? '—'} color={t.gold} />
            <StatCard label="Placements Created" value={funnel.placementsCreated} color={t.status.success} />
            <StatCard label="Active On Shelf" value={funnel.activeOnShelf} color={t.status.info} subtext="all active placements" />
            <StatCard label="Unique Accounts Visited" value={visitCounts?.unique ?? '—'} color={t.text.secondary} />
          </div>
        )}

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

          {/* Visit trend */}
          <div style={{ ...card, padding: '22px 24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '18px' }}>
              Visit Activity
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={visitData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={t.border.subtle} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: t.text.muted, fontSize: 10 }} axisLine={false} tickLine={false} interval={visitData.length <= 14 ? 0 : Math.floor(visitData.length / 7)} />
                <YAxis tick={{ fill: t.text.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="visits" name="Visits" fill={t.gold} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Commission trend */}
          <div style={{ ...card, padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Commission
              </div>
              <div style={{ fontSize: '10px', color: t.text.muted }}>by order date</div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={commissionData}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.border.subtle} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: t.text.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: t.text.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<ChartTooltip currency />} cursor={{ stroke: 'rgba(212,168,67,0.2)', strokeWidth: 1 }} />
                <Line dataKey="commission" name="Commission" stroke={t.gold} strokeWidth={2}
                  dot={false} activeDot={{ r: 4, fill: t.gold, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

          {/* Visit outcomes — with drill-down */}
          {visitsByStatus.length > 0 && (
            <div style={{ ...card, padding: '22px 24px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
                Visit Outcomes
                <span style={{ fontWeight: '400', textTransform: 'none', marginLeft: '6px', color: t.text.muted, fontSize: '10px' }}>click to see accounts</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {visitsByStatus.map(({ status, count }) => {
                  const color = VISIT_STATUS_COLORS[status] || t.text.muted
                  const max = visitsByStatus[0].count
                  const isOpen = expandedStatus === status
                  const visits = visitsByStatusGrouped[status] || []
                  return (
                    <div key={status}>
                      {/* Status row */}
                      <div
                        onClick={() => setExpandedStatus(isOpen ? null : status)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px', borderRadius: '7px', cursor: 'pointer', backgroundColor: isOpen ? t.bg.elevated : 'transparent', transition: 'background 150ms ease' }}
                      >
                        <div style={{ color: t.text.muted, flexShrink: 0 }}>
                          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </div>
                        <div style={{ width: '130px', fontSize: '12px', color: t.text.secondary, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {status}
                        </div>
                        <div style={{ flex: 1, height: '6px', backgroundColor: t.border.default, borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${(count / max) * 100}%`, height: '100%', backgroundColor: color, borderRadius: '3px', transition: 'width 600ms ease' }} />
                        </div>
                        <div className="mono" style={{ fontSize: '12px', color, fontWeight: '700', minWidth: '28px', textAlign: 'right' }}>{count}</div>
                      </div>

                      {/* Drill-down panel */}
                      {isOpen && (
                        <div style={{ marginLeft: '20px', marginBottom: '6px', borderLeft: `2px solid ${color}33`, paddingLeft: '12px' }}>
                          {visits.map((v: any) => (
                            <div key={v.id} style={{ padding: '8px 0', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>
                                  {v.accounts?.name || 'Unknown Account'}
                                </div>
                                <div style={{ fontSize: '11px', color: t.text.muted, flexShrink: 0 }}>
                                  {formatShortDateMT(v.visited_at)}
                                </div>
                              </div>
                              {v.user_profiles?.name && (
                                <div style={{ fontSize: '11px', color: t.text.muted }}>Rep: {v.user_profiles.name}</div>
                              )}
                              {v.notes && (
                                <div style={{ fontSize: '12px', color: t.text.secondary, lineHeight: 1.4, marginTop: '2px' }}>
                                  {v.notes.length > 120 ? v.notes.slice(0, 120) + '…' : v.notes}
                                </div>
                              )}
                              {v.feedback && (
                                <div style={{ fontSize: '11px', color: t.text.muted, fontStyle: 'italic' }}>
                                  Feedback: {v.feedback.length > 100 ? v.feedback.slice(0, 100) + '…' : v.feedback}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Active placements */}
          {placementsByStatus.length > 0 && (
            <div style={{ ...card, padding: '22px 24px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
                Active Placements
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {placementsByStatus.map(p => (
                  <div key={p.name} style={{
                    backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`,
                    borderRadius: '8px', padding: '16px 20px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '80px',
                  }}>
                    <div className="mono" style={{ fontSize: '24px', fontWeight: '700', color: statusColors[p.name] || t.gold }}>{p.value}</div>
                    <div style={{ fontSize: '10px', color: t.text.muted, textAlign: 'center' }}>{PLACEMENT_STATUS_LABELS[p.name as PlacementStatus] || p.name}</div>
                  </div>
                ))}
              </div>

              {clients.length > 0 && (
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${t.border.subtle}` }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>By Brand</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {clients.filter(c => placementsByBrand[c.slug]).map(c => {
                      const logo = clientLogoUrl(c)
                      return (
                        <div key={c.slug} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {logo
                            ? <img src={logo} alt={c.name} style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: '2px', flexShrink: 0 }} />
                            : <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.color, flexShrink: 0, margin: '0 4px' }} />
                          }
                          <span style={{ fontSize: '12px', color: t.text.secondary, flex: 1 }}>{c.name}</span>
                          <span className="mono" style={{ fontSize: '12px', color: t.text.muted, fontWeight: '600' }}>{placementsByBrand[c.slug] || 0}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Follow-up action list — grouped by status */}
        {followUpGroups.length > 0 && (
          <div style={{ ...card, padding: '22px 24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.status.warning, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '20px' }}>
              Needs Action
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {followUpGroups.map(({ status, color, visits }) => {
                const showAll = showAllByStatus[status] ?? false
                const visible = showAll ? visits : visits.slice(0, 4)
                return (
                  <div key={status}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: '700', color }}>{status}</span>
                      <span style={{ fontSize: '11px', color: t.text.muted }}>{visits.length} account{visits.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                      {visible.map((v: any) => (
                        <div key={v.id} style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderLeft: `3px solid ${color}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{v.accounts?.name || '—'}</div>
                            <div style={{ fontSize: '10px', color: t.text.muted, flexShrink: 0 }}>{formatShortDateMT(v.visited_at)}</div>
                          </div>
                          {v.notes && (
                            <div style={{ fontSize: '11px', color: t.text.secondary, lineHeight: 1.4, marginBottom: '4px' }}>
                              {v.notes.length > 80 ? v.notes.slice(0, 80) + '…' : v.notes}
                            </div>
                          )}
                          {v.user_profiles?.name && (
                            <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '8px' }}>{v.user_profiles.name}</div>
                          )}
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => setVisitModal({ open: true, accountId: v.account_id, accountName: v.accounts?.name })} style={{
                              flex: 1, padding: '5px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                              border: `1px solid ${t.border.hover}`, backgroundColor: 'transparent', color: t.text.secondary,
                            }}>
                              <MapPin size={11} /> Log Visit
                            </button>
                            <button onClick={() => { setDismissedIds(prev => new Set([...prev, v.id])); clearFollowUp(v.id) }} style={{
                              flex: 1, padding: '5px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                              border: `1px solid rgba(61,186,120,0.3)`, backgroundColor: 'rgba(61,186,120,0.08)', color: '#3dba78',
                            }}>
                              <CheckCircle2 size={11} /> Cleared
                            </button>
                            <button onClick={() => { setDismissedIds(prev => new Set([...prev, v.id])); dismissFollowUp(v.id) }} style={{
                              flex: 1, padding: '5px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                              border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.muted,
                            }}>
                              <MinusCircle size={11} /> Disregard
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {visits.length > 4 && (
                      <button
                        onClick={() => setShowAllByStatus(prev => ({ ...prev, [status]: !showAll }))}
                        style={{ marginTop: '10px', width: '100%', padding: '8px', borderRadius: '8px', fontSize: '12px', border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.muted, cursor: 'pointer' }}
                      >
                        {showAll ? 'Show less' : `+ ${visits.length - 4} more`}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
      {profile && (
        <VisitLogModal
          isOpen={visitModal.open}
          onClose={() => setVisitModal({ open: false })}
          onSuccess={() => setVisitModal({ open: false })}
          userId={profile.id}
          defaultAccountId={visitModal.accountId}
          defaultAccountName={visitModal.accountName}
          isMobile={false}
        />
      )}
    </LayoutShell>
  )
}
