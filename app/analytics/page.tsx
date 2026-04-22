'use client'
import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import LayoutShell from '../layout-shell'
import StatCard from '../components/StatCard'
import { StatsSkeleton } from '../components/LoadingSkeleton'
import {
  getVisitTrend, getPlacementFunnel, getCommissionTrend,
  getClients, getPlacements, getVisits,
} from '../lib/data'
import { t, card } from '../lib/theme'
import { formatCurrency, nDaysAgoMT } from '../lib/formatters'
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
  const [visitsByStatus, setVisitsByStatus] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - rangeDays)

    Promise.all([
      getClients(),
      getVisitTrend({ start, end }),
      getPlacementFunnel({ start, end }),
      getCommissionTrend(start),
      getPlacements(),
      getVisits({ since: start.toISOString(), limit: 2000 }),
    ]).then(([cls, visitTrend, funnelData, commTrend, placements, recentVisits]) => {
      setClients(cls)
      setFunnel(funnelData)

      // Weekly visit trend buckets
      const buckets = Math.max(1, Math.ceil(rangeDays / (rangeDays <= 14 ? 1 : 7)))
      const bucketMs = (rangeDays * 24 * 60 * 60 * 1000) / buckets
      const bucketData: { label: string; visits: number }[] = []
      for (let i = 0; i < buckets; i++) {
        const d = new Date(start.getTime() + i * bucketMs)
        bucketData.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), visits: 0 })
      }
      visitTrend.forEach((v: any) => {
        const vt = new Date(v.visited_at).getTime()
        const idx = Math.min(buckets - 1, Math.floor((vt - start.getTime()) / bucketMs))
        if (idx >= 0) bucketData[idx].visits++
      })
      setVisitData(bucketData)

      // Commission trend — bucket by day/week/month depending on range
      const commBuckets: { label: string; commission: number; keyStart: number; keyEnd: number }[] = []
      const useDaily = rangeDays <= 14
      const useWeekly = rangeDays <= 90 && !useDaily
      if (useDaily) {
        for (let i = 0; i < rangeDays; i++) {
          const d = new Date(start.getTime() + i * 86400_000)
          commBuckets.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), commission: 0, keyStart: d.getTime(), keyEnd: d.getTime() + 86400_000 })
        }
      } else if (useWeekly) {
        const weeks = Math.ceil(rangeDays / 7)
        for (let i = 0; i < weeks; i++) {
          const d = new Date(start.getTime() + i * 7 * 86400_000)
          commBuckets.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), commission: 0, keyStart: d.getTime(), keyEnd: d.getTime() + 7 * 86400_000 })
        }
      } else {
        const months = Math.ceil(rangeDays / 30)
        for (let i = months - 1; i >= 0; i--) {
          const d = new Date()
          d.setDate(1)
          d.setMonth(d.getMonth() - i)
          const monthStart = d.getTime()
          const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
          commBuckets.push({ label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), commission: 0, keyStart: monthStart, keyEnd: monthEnd })
        }
      }
      commTrend.forEach((o: any) => {
        const t2 = new Date(o.created_at).getTime()
        const bucket = commBuckets.find(b => t2 >= b.keyStart && t2 < b.keyEnd)
        if (bucket) bucket.commission += Number(o.commission_amount || 0)
      })
      setCommissionData(commBuckets.map(b => ({ month: b.label, commission: b.commission })))

      // Placements by status
      const statusMap2: Record<string, number> = {}
      const brandMap: Record<string, number> = {}
      placements.forEach((p: any) => {
        statusMap2[p.status] = (statusMap2[p.status] || 0) + 1
        if (p.client_slug) brandMap[p.client_slug] = (brandMap[p.client_slug] || 0) + 1
      })
      const STATUS_ORDER: PlacementStatus[] = ['committed', 'ordered', 'on_shelf', 'reordering']
      setPlacementsByStatus(STATUS_ORDER.filter(s => statusMap2[s]).map(s => ({ name: s, value: statusMap2[s] })))
      setPlacementsByBrand(brandMap)

      // Visits by status
      const statusMap: Record<string, number> = {}
      recentVisits.forEach((v: any) => {
        if (v.status) statusMap[v.status] = (statusMap[v.status] || 0) + 1
      })
      setVisitsByStatus(
        Object.entries(statusMap)
          .map(([status, count]) => ({ status, count }))
          .sort((a, b) => b.count - a.count)
      )

      setLoading(false)
    }).catch(() => setLoading(false))
  }, [rangeDays])

  const statusColors: Record<string, string> = {
    committed: t.status.warning,
    ordered: t.status.info,
    on_shelf: t.status.success,
    reordering: t.gold,
  }

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Analytics</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Field activity and performance data</p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
            <StatCard label="Total Visits" value={funnel.totalVisits} color={t.gold} />
            <StatCard label="Placements Created" value={funnel.placementsCreated} color={t.status.success} />
            <StatCard label="Active On Shelf" value={funnel.activeOnShelf} color={t.status.info} />
            <StatCard label="Unique Accounts Visited" value={funnel.uniqueAccounts ?? '—'} color={t.text.secondary} />
          </div>
        )}

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

          {/* Visit trend */}
          <div style={{ ...card, padding: '22px 24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '18px' }}>
              Visit Activity
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={visitData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={t.border.subtle} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: t.text.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: t.text.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="visits" name="Visits" fill={t.gold} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Commission trend */}
          <div style={{ ...card, padding: '22px 24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '18px' }}>
              Commission
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          {/* Visits by outcome */}
          {visitsByStatus.length > 0 && (
            <div style={{ ...card, padding: '22px 24px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
                Visit Outcomes
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {visitsByStatus.map(({ status, count }) => {
                  const color = VISIT_STATUS_COLORS[status] || t.text.muted
                  const max = visitsByStatus[0].count
                  return (
                    <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '140px', fontSize: '12px', color: t.text.secondary, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {status}
                      </div>
                      <div style={{ flex: 1, height: '6px', backgroundColor: t.border.default, borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${(count / max) * 100}%`, height: '100%', backgroundColor: color, borderRadius: '3px', transition: 'width 600ms ease' }} />
                      </div>
                      <div className="mono" style={{ fontSize: '12px', color, fontWeight: '700', minWidth: '28px', textAlign: 'right' }}>{count}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Placements by status */}
          {placementsByStatus.length > 0 && (
            <div style={{ ...card, padding: '22px 24px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
                Active Placements
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {placementsByStatus.map(p => (
                  <div key={p.name} style={{
                    backgroundColor: t.bg.elevated,
                    border: `1px solid ${t.border.default}`,
                    borderRadius: '8px',
                    padding: '16px 20px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    minWidth: '80px',
                  }}>
                    <div className="mono" style={{ fontSize: '24px', fontWeight: '700', color: statusColors[p.name] || t.gold }}>{p.value}</div>
                    <div style={{ fontSize: '10px', color: t.text.muted, textAlign: 'center' }}>{PLACEMENT_STATUS_LABELS[p.name as PlacementStatus] || p.name}</div>
                  </div>
                ))}
              </div>

              {/* Per-brand placement count */}
              {clients.length > 0 && (
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${t.border.subtle}` }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                    By Brand
                  </div>
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
                          <span className="mono" style={{ fontSize: '12px', color: t.text.muted, fontWeight: '600' }}>
                            {placementsByBrand[c.slug] || 0}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </LayoutShell>
  )
}
