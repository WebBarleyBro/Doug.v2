'use client'
import { useState, useMemo } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { v3, WIN_STATUSES } from '../lib/theme'
import { useV3Clients, useV3RecentVisits, useV3Placements, useV3Orders, useV3AllProfiles, useV3Accounts } from '../lib/query'
import { formatCurrency, resolveTotal, relativeTimeStr } from '../../lib/formatters'
import type { Client } from '../../lib/types'
import { buildGradeMap, GRADE_CONFIG } from '../lib/grading'
import type { Grade } from '../lib/grading'

// ── Constants ────────────────────────────────────────────────────────────────

const GRADES: Grade[] = ['S', 'A', 'B', 'C', 'D']

const PLAC_STATUS_LABEL: Record<string, string> = {
  committed: 'Committed', ordered: 'Ordered', on_shelf: 'On Shelf', reordering: 'Reordering',
}
const PLAC_STATUS_COLOR: Record<string, string> = {
  committed: v3.status.info,
  ordered:   v3.status.warning,
  on_shelf:  v3.status.success,
  reordering: v3.amber,
}
// Status sort priority (higher = show first)
const PLAC_STATUS_PRIORITY: Record<string, number> = {
  reordering: 4, on_shelf: 3, ordered: 2, committed: 1,
}
const VISIT_STATUS_COLOR: Record<string, string> = {
  'Will Order Soon':  v3.status.warning,
  'Just Ordered':     v3.status.success,
  'Needs Follow Up':  v3.status.danger,
  'Not Interested':   'rgba(255,255,255,0.25)',
  'Menu Feature Won': v3.amberLight,
  'New Placement':    v3.status.success,
  'General Check-In': 'rgba(255,255,255,0.40)',
  'Tasted':           v3.amber,
}
// ── Helpers ──────────────────────────────────────────────────────────────────

function computeTrend(current: number, prior: number) {
  if (prior === 0 || current === prior) return null
  const pct = Math.round(((current - prior) / prior) * 100)
  return { pct: Math.abs(pct), up: pct > 0 }
}

function CT({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: v3.bg.sheet, border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md, padding: '10px 14px', backdropFilter: 'blur(12px)' }}>
      <div style={{ fontSize: '12px', color: v3.text.muted, marginBottom: 6, lineHeight: 1.4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ fontSize: '13px', fontWeight: 700, color: p.color, fontFamily: 'monospace' }}>
          {p.name}: {currency ? formatCurrency(Number(p.value)) : p.value}
        </div>
      ))}
    </div>
  )
}

// Panel wrapper with internal scroll
function Panel({ title, badge, children, action }: {
  title: string; badge?: string | number; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: '6px', overflow: 'hidden', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: `1px solid ${v3.border.subtle}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: v3.font.ui }}>
            {title}
          </span>
          {badge !== undefined && (
            <span style={{ fontSize: '11px', fontWeight: 800, color: v3.amberLight, fontFamily: 'monospace' }}>{badge}</span>
          )}
        </div>
        {action}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}

// ── Placements Panel ──────────────────────────────────────────────────────────

function PlacementsPanel({ placements, clients, brandSlug }: { placements: any[]; clients: any[]; brandSlug: string }) {
  const [statusF, setStatusF] = useState('active')

  const active = useMemo(() => placements.filter(p => !p.lost_at), [placements])
  const lost   = useMemo(() => placements.filter(p => p.lost_at),  [placements])

  const filtered = useMemo(() => {
    const base = statusF === 'lost' ? lost : statusF === 'active' ? active : active.filter(p => p.status === statusF)
    return [...base].sort((a, b) => {
      if (statusF !== 'active') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      const pa = PLAC_STATUS_PRIORITY[a.status] ?? 0
      const pb = PLAC_STATUS_PRIORITY[b.status] ?? 0
      return pb - pa || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [active, lost, statusF])

  const statusOptions: { key: string; label: string; count: number }[] = [
    { key: 'active',     label: 'Active',     count: active.length },
    { key: 'reordering', label: 'Reordering', count: active.filter(p => p.status === 'reordering').length },
    { key: 'on_shelf',   label: 'On Shelf',   count: active.filter(p => p.status === 'on_shelf').length },
    { key: 'ordered',    label: 'Ordered',    count: active.filter(p => p.status === 'ordered').length },
    { key: 'committed',  label: 'Committed',  count: active.filter(p => p.status === 'committed').length },
    { key: 'lost',       label: 'Lost',       count: lost.length },
  ]

  return (
    <Panel title="Placements" badge={active.length}>
      {/* Filter chips */}
      <div style={{ padding: '10px 16px 8px', display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${v3.border.subtle}`, flexShrink: 0 }}>
        {statusOptions.map(s => {
          const col = s.key === 'lost' ? v3.status.danger : s.key === 'active' ? v3.amber : PLAC_STATUS_COLOR[s.key] ?? v3.text.muted
          const sel = statusF === s.key
          return (
            <button key={s.key} onClick={() => setStatusF(s.key)} style={{
              padding: '4px 10px', borderRadius: v3.radius.full, fontSize: '11px', fontWeight: 700,
              border: `1px solid ${sel ? col + '55' : v3.border.default}`,
              background: sel ? col + '14' : 'transparent',
              color: sel ? col : v3.text.muted,
              cursor: 'pointer', transition: 'all 120ms', fontFamily: v3.font.ui,
            }}>
              {s.label}{' '}<span style={{ opacity: 0.7 }}>{s.count}</span>
            </button>
          )
        })}
      </div>

      {/* List */}
      {filtered.length === 0
        ? <div style={{ padding: '32px 16px', color: v3.text.muted, fontSize: '13px', textAlign: 'center' }}>No placements in this filter</div>
        : filtered.map(p => {
          const cl = clients.find((c: any) => c.slug === p.client_slug)
          const sc = p.lost_at ? v3.status.danger : PLAC_STATUS_COLOR[p.status] ?? v3.text.muted
          const ageDays = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000)
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${v3.border.subtle}`, borderLeft: `3px solid ${sc}40` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: p.lost_at ? v3.text.muted : v3.text.primary, lineHeight: 1.3 }}>{p.product_name}</div>
                <div style={{ fontSize: '11px', color: v3.text.muted, marginTop: 2, lineHeight: 1.4 }}>
                  {p.accounts?.name ?? '—'}
                  {brandSlug === 'all' && cl && <span style={{ color: cl.color || v3.amber }}> · {cl.name}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: sc, background: sc + '14', padding: '2px 7px', borderRadius: v3.radius.sm, letterSpacing: '0.04em' }}>
                  {p.lost_at ? 'Lost' : (PLAC_STATUS_LABEL[p.status] ?? p.status)}
                </span>
                <span style={{ fontSize: '10px', color: v3.text.muted }}>{ageDays}d</span>
              </div>
            </div>
          )
        })
      }
    </Panel>
  )
}

// ── Field Activity Panel ──────────────────────────────────────────────────────

function FieldPanel({ visits, profileMap, visitChart }: {
  visits: any[]; profileMap: Record<string, string>; visitChart: any[]
}) {
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of visits) m[v.status] = (m[v.status] ?? 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 7)
  }, [visits])

  const repCounts = useMemo(() => {
    const m: Record<string, { name: string; count: number; wins: number }> = {}
    for (const v of visits) {
      const id = v.user_id || 'unknown'
      if (!m[id]) m[id] = { name: profileMap[id] || 'Rep', count: 0, wins: 0 }
      m[id].count++
      if (WIN_STATUSES.has(v.status)) m[id].wins++
    }
    return Object.values(m).sort((a, b) => b.count - a.count)
  }, [visits, profileMap])

  const maxRep = Math.max(...repCounts.map(r => r.count), 1)

  return (
    <Panel title="Field Activity" badge={visits.length}>
      {/* Mini chart */}
      <div style={{ padding: '12px 16px 8px', borderBottom: `1px solid ${v3.border.subtle}` }}>
        <ResponsiveContainer width="100%" height={80}>
          <LineChart data={visitChart} margin={{ top: 2, right: 4, bottom: 0, left: -28 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: v3.text.muted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: v3.text.muted }} axisLine={false} tickLine={false} />
            <Tooltip content={<CT />} />
            <Line type="monotone" dataKey="count" name="Visits" stroke={v3.status.info} strokeWidth={2} dot={false} style={{ filter: `drop-shadow(0 0 3px ${v3.status.info}60)` }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Outcomes */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${v3.border.subtle}` }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 8, fontFamily: v3.font.ui }}>Outcomes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {statusCounts.map(([status, count]) => {
            const color = VISIT_STATUS_COLOR[status] ?? v3.text.muted
            const pct = visits.length > 0 ? Math.round((count / visits.length) * 100) : 0
            return (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: v3.text.secondary, flex: 1, lineHeight: 1.4 }}>{status}</span>
                <div style={{ width: 60, height: 3, borderRadius: 2, background: v3.border.subtle, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: 20, textAlign: 'right', fontFamily: 'monospace' }}>{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Rep leaderboard */}
      {repCounts.length > 0 && (
        <div style={{ padding: '10px 16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 8, fontFamily: v3.font.ui }}>By Rep</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {repCounts.map(r => (
              <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: v3.amberDim, border: `1px solid ${v3.amber}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: v3.amberLight, flexShrink: 0 }}>
                  {r.name[0]?.toUpperCase()}
                </div>
                <span style={{ fontSize: '13px', color: v3.text.secondary, flex: 1, lineHeight: 1.4 }}>{r.name}</span>
                {r.wins > 0 && <span style={{ fontSize: '10px', fontWeight: 700, color: v3.status.success }}>+{r.wins}W</span>}
                <div style={{ width: 60, height: 3, borderRadius: 2, background: v3.border.subtle, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ height: '100%', width: `${(r.count / maxRep) * 100}%`, background: `linear-gradient(90deg, ${v3.amber}50, ${v3.amberLight})`, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: v3.amberLight, fontFamily: 'monospace', minWidth: 20, textAlign: 'right' }}>{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

// ── Revenue Panel ─────────────────────────────────────────────────────────────

function RevenuePanel({ orders, clients, revenueChart, brandBreakdown, totalRev, totalComm }: {
  orders: any[]; clients: any[]; revenueChart: any[]; brandBreakdown: any[]; totalRev: number; totalComm: number
}) {
  const recent = useMemo(() =>
    [...orders].sort((a, b) => new Date(b.sent_at || b.created_at).getTime() - new Date(a.sent_at || a.created_at).getTime()).slice(0, 8),
    [orders]
  )

  return (
    <Panel title="Revenue & Orders" badge={orders.length > 0 ? formatCurrency(totalRev) : undefined}>
      {/* Mini chart */}
      <div style={{ padding: '12px 16px 8px', borderBottom: `1px solid ${v3.border.subtle}` }}>
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={revenueChart} margin={{ top: 2, right: 4, bottom: 0, left: -28 }} barCategoryGap="30%">
            <XAxis dataKey="month" tick={{ fontSize: 9, fill: v3.text.muted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: v3.text.muted }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`} />
            <Tooltip content={<CT currency />} />
            {clients.map((c: any) => (
              <Bar key={c.slug} dataKey={c.slug} name={c.name} stackId="r" fill={c.color || v3.amber} opacity={0.85} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Commission callout */}
      {totalComm > 0 && (
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${v3.border.subtle}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: v3.font.ui, fontWeight: 700 }}>Commission</span>
          <span className="v3-mono" style={{ fontSize: '18px', fontWeight: 900, color: v3.status.success }}>{formatCurrency(totalComm)}</span>
        </div>
      )}

      {/* Brand rows */}
      {brandBreakdown.filter(b => b.rev > 0).length > 0 && (
        <div style={{ borderBottom: `1px solid ${v3.border.subtle}` }}>
          {brandBreakdown.filter(b => b.rev > 0).map(b => (
            <div key={b.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: `1px solid ${v3.border.subtle}` }}>
              {b.logo
                ? <img src={b.logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 2, flexShrink: 0 }} />
                : <div style={{ width: 18, height: 18, borderRadius: '50%', background: (b.color || v3.amber) + '28', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 900, color: b.color || v3.amber, flexShrink: 0 }}>{b.name[0]}</div>
              }
              <span style={{ fontSize: '13px', fontWeight: 600, color: v3.text.primary, flex: 1, lineHeight: 1.4 }}>{b.name}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: v3.amberLight, fontFamily: 'monospace' }}>{formatCurrency(b.rev)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent orders */}
      <div>
        <div style={{ padding: '10px 16px 6px', fontSize: '10px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: v3.font.ui }}>Recent Orders</div>
        {recent.length === 0
          ? <div style={{ padding: '16px', color: v3.text.muted, fontSize: '13px' }}>No orders in period</div>
          : recent.map(o => {
            const total = resolveTotal(o)
            const cl = clients.find((c: any) => c.slug === o.client_slug)
            const sc = o.status === 'fulfilled' ? v3.status.success : o.status === 'sent' ? v3.status.warning : v3.text.muted
            return (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderTop: `1px solid ${v3.border.subtle}` }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: v3.text.primary, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.accounts?.name ?? '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: v3.text.muted, marginTop: 1, lineHeight: 1.4 }}>
                    {cl?.name ?? o.client_slug} · {relativeTimeStr(o.sent_at || o.created_at) ?? '—'}
                  </div>
                </div>
                <span className="v3-mono" style={{ fontSize: '13px', fontWeight: 700, color: total > 0 ? v3.amberLight : v3.text.muted, flexShrink: 0 }}>
                  {total > 0 ? formatCurrency(total) : o.status.toUpperCase()}
                </span>
              </div>
            )
          })
        }
      </div>
    </Panel>
  )
}

// ── Team Deep Dive ────────────────────────────────────────────────────────────

type Profile = { id: string; name: string | null; full_name: string | null; role: string }

function TeamView({ visits, priorVisits, profiles }: { visits: any[]; priorVisits: any[]; profiles: Profile[] }) {
  const repStats = useMemo(() => {
    return profiles.map(p => {
      const curr = visits.filter(v => v.user_id === p.id)
      const prev = priorVisits.filter(v => v.user_id === p.id)
      const trend = computeTrend(curr.length, prev.length)
      const uniqueAccounts = new Set(curr.map(v => v.account_id)).size
      const wins = curr.filter(v => WIN_STATUSES.has(v.status)).length
      const displayName = (p.name || p.full_name || 'Rep').split(' ')[0]
      return { id: p.id, name: displayName, current: curr.length, prior: prev.length, trend, uniqueAccounts, wins }
    }).sort((a, b) => b.current - a.current)
  }, [visits, priorVisits, profiles])

  const maxCount = Math.max(...repStats.map(r => r.current), 1)

  if (repStats.length === 0) {
    return <div style={{ padding: '48px 0', textAlign: 'center', color: v3.text.muted, fontSize: '14px' }}>No team activity in this period.</div>
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 160px 80px 80px 72px', padding: '0 0 10px', fontSize: '10px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        <div style={{ width: 48 }} />
        <div>Rep</div>
        <div>Activity</div>
        <div style={{ textAlign: 'right' }}>Accounts</div>
        <div style={{ textAlign: 'right' }}>Wins</div>
        <div style={{ textAlign: 'right' }}>Visits</div>
      </div>
      {repStats.map(r => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 160px 80px 80px 72px', padding: '14px 0', borderTop: `1px solid ${v3.border.subtle}`, alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: v3.amberDim, border: `1px solid ${v3.amber}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 900, color: v3.amberLight, flexShrink: 0, marginRight: 12 }}>
            {r.name[0]?.toUpperCase()}
          </div>
          <div>
            <span style={{ fontSize: '15px', fontWeight: 700, color: v3.text.primary, lineHeight: 1.3 }}>{r.name}</span>
            {r.trend && (
              <span style={{ marginLeft: 8, fontSize: '11px', fontWeight: 700, color: r.trend.up ? v3.status.success : v3.status.danger }}>
                {r.trend.up ? '↑' : '↓'}{r.trend.pct}% vs prior
              </span>
            )}
          </div>
          <div style={{ paddingRight: 16 }}>
            <div style={{ height: 5, borderRadius: 3, background: v3.border.subtle, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(r.current / maxCount) * 100}%`, background: `linear-gradient(90deg, ${v3.amber}50, ${v3.amberLight})`, borderRadius: 3 }} />
            </div>
          </div>
          <div style={{ fontSize: '13px', color: v3.text.secondary, textAlign: 'right' }}>{r.uniqueAccounts}</div>
          <div style={{ fontSize: '13px', color: r.wins > 0 ? v3.status.success : v3.text.muted, textAlign: 'right', fontWeight: r.wins > 0 ? 700 : 400 }}>
            {r.wins > 0 ? r.wins : '—'}
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: v3.amberLight, fontFamily: 'monospace', textAlign: 'right' }}>{r.current}</div>
        </div>
      ))}
    </div>
  )
}

// ── Revenue Deep Dive ─────────────────────────────────────────────────────────

function RevenueDeep({ orders, clients, revenueChart, brandBreakdown }: {
  orders: any[]; clients: any[]; revenueChart: any[]; brandBreakdown: any[]
}) {
  const sorted = useMemo(() =>
    [...orders].sort((a, b) => new Date(b.sent_at || b.created_at).getTime() - new Date(a.sent_at || a.created_at).getTime()),
    [orders]
  )

  const topAccounts = useMemo(() => {
    const m: Record<string, { name: string; rev: number }> = {}
    for (const o of orders) {
      if (!o.account_id) continue
      if (!m[o.account_id]) m[o.account_id] = { name: o.accounts?.name ?? 'Unknown', rev: 0 }
      m[o.account_id].rev += resolveTotal(o)
    }
    return Object.values(m).filter(a => a.rev > 0).sort((a, b) => b.rev - a.rev).slice(0, 8)
  }, [orders])

  const topProducts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const o of orders) {
      for (const li of (o.po_line_items ?? [])) {
        const name = li.product_name || li.name || 'Unknown'
        const val = (li.quantity ?? 0) * (li.unit_price ?? 0) || (li.total ?? 0)
        if (val > 0) m[name] = (m[name] ?? 0) + val
      }
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, rev]) => ({ name, rev }))
  }, [orders])

  const maxAccRev  = Math.max(...topAccounts.map(a => a.rev), 1)
  const maxProdRev = Math.max(...topProducts.map(p => p.rev), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ padding: '20px', borderRadius: v3.radius.lg, border: `1px solid ${v3.border.subtle}` }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 14, fontFamily: v3.font.ui }}>Revenue by Month — 12 Months</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={revenueChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={v3.border.subtle} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: v3.text.muted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: v3.text.muted }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
            <Tooltip content={<CT currency />} />
            {clients.map((c: any) => (
              <Bar key={c.slug} dataKey={c.slug} name={c.name} stackId="r" fill={c.color || v3.amber} opacity={0.85} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.18em', padding: '0 0 12px', fontFamily: v3.font.ui }}>Per-Brand</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px 80px', padding: '0 16px 8px', fontSize: '10px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <div>Brand</div><div style={{ textAlign: 'right' }}>Revenue</div><div style={{ textAlign: 'right' }}>Commission</div><div style={{ textAlign: 'right' }}>Orders</div><div style={{ textAlign: 'right' }}>Visits</div>
        </div>
        {brandBreakdown.map(b => (
          <div key={b.slug} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px 80px', padding: '11px 16px', borderTop: `1px solid ${v3.border.subtle}`, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {b.logo
                ? <img src={b.logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                : <div style={{ width: 16, height: 16, borderRadius: '50%', background: (b.color || v3.amber) + '28', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: b.color || v3.amber }}>{b.name[0]}</div>
              }
              <span style={{ fontSize: '14px', fontWeight: 600, color: v3.text.primary, lineHeight: 1.4 }}>{b.name}</span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: b.rev > 0 ? v3.amberLight : v3.text.muted, fontFamily: 'monospace', textAlign: 'right' }}>{b.rev > 0 ? formatCurrency(b.rev) : '—'}</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: b.comm > 0 ? v3.status.success : v3.text.muted, fontFamily: 'monospace', textAlign: 'right' }}>{b.comm > 0 ? formatCurrency(b.comm) : '—'}</div>
            <div style={{ fontSize: '13px', color: v3.text.secondary, textAlign: 'right' }}>{orders.filter((o: any) => o.client_slug === b.slug).length}</div>
            <div style={{ fontSize: '13px', color: v3.text.secondary, textAlign: 'right' }}>{b.visits}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 14, fontFamily: v3.font.ui }}>Top Accounts by Revenue</div>
          {topAccounts.length === 0
            ? <div style={{ color: v3.text.muted, fontSize: '13px' }}>No order data</div>
            : topAccounts.map(a => (
              <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: '13px', color: v3.text.secondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>{a.name}</span>
                <div style={{ width: 80, height: 4, borderRadius: 2, background: v3.border.subtle, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ height: '100%', width: `${(a.rev / maxAccRev) * 100}%`, background: `linear-gradient(90deg, ${v3.amber}60, ${v3.amber})`, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: v3.amberLight, fontFamily: 'monospace', minWidth: 60, textAlign: 'right' }}>{formatCurrency(a.rev)}</span>
              </div>
            ))
          }
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 14, fontFamily: v3.font.ui }}>Top Products</div>
          {topProducts.length === 0
            ? <div style={{ color: v3.text.muted, fontSize: '13px' }}>No line item data</div>
            : topProducts.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: '13px', color: v3.text.secondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>{p.name}</span>
                <div style={{ width: 80, height: 4, borderRadius: 2, background: v3.border.subtle, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ height: '100%', width: `${(p.rev / maxProdRev) * 100}%`, background: `linear-gradient(90deg, ${v3.status.success}60, ${v3.status.success})`, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: v3.status.success, fontFamily: 'monospace', minWidth: 60, textAlign: 'right' }}>{formatCurrency(p.rev)}</span>
              </div>
            ))
          }
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.18em', padding: '0 0 12px', fontFamily: v3.font.ui }}>All Orders in Period</div>
        {sorted.length === 0
          ? <div style={{ padding: '24px 16px', color: v3.text.muted, fontSize: '13px' }}>No eligible orders in this period</div>
          : sorted.map((o: any) => {
            const total = resolveTotal(o)
            const cl = clients.find((c: any) => c.slug === o.client_slug)
            const comm = total * (cl?.commission_rate ?? 0)
            return (
              <div key={o.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 12, padding: '11px 16px', borderTop: `1px solid ${v3.border.subtle}`, alignItems: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: o.status === 'fulfilled' ? v3.status.success : v3.status.warning, boxShadow: `0 0 4px ${o.status === 'fulfilled' ? v3.status.success : v3.status.warning}` }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: v3.text.primary, lineHeight: 1.3 }}>{o.accounts?.name ?? 'N/A'}{o.po_number ? ` · ${o.po_number}` : ''}</div>
                  <div style={{ fontSize: '11px', color: v3.text.muted, marginTop: 2, lineHeight: 1.4 }}>{cl?.name ?? o.client_slug} · {new Date(o.sent_at || o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })} · {o.order_type === 'distributor' ? 'Distributor' : 'Direct'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {comm > 0 && <div style={{ fontSize: '11px', color: v3.status.success, fontFamily: 'monospace' }}>+{formatCurrency(comm)}</div>}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: v3.amberLight, fontFamily: 'monospace', textAlign: 'right', minWidth: 80 }}>
                  {total > 0 ? formatCurrency(total) : '—'}
                </div>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '30D', days: 30  },
  { label: '90D', days: 90  },
  { label: '1Y',  days: 365 },
] as const

type DeepTab = 'revenue' | 'team'

export default function ReportsPage() {
  const { data: clients = [] }    = useV3Clients()
  const { data: placements = [] } = useV3Placements()
  const { data: orders = [] }     = useV3Orders()
  const { data: profiles = [] }   = useV3AllProfiles()
  const { data: accounts = [] }   = useV3Accounts()
  const [period, setPeriod]       = useState(30)
  const [brandSlug, setBrandSlug] = useState('all')
  const [deepTab, setDeepTab]     = useState<DeepTab | null>(null)

  // Cap prior-period fetch at 365 days total to avoid massive queries on 1Y view
  const { data: allVisits = [] } = useV3RecentVisits(Math.min(period * 2, 365))

  const periodStartMs = Date.now() - period * 86400000
  const priorStartMs  = periodStartMs - period * 86400000

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of profiles) m[p.id] = (p.name || p.full_name || 'Rep').split(' ')[0]
    return m
  }, [profiles])

  const pVisits = useMemo(() =>
    allVisits.filter(v => {
      const ms = new Date(v.visited_at).getTime()
      if (ms < periodStartMs) return false
      if (brandSlug !== 'all' && v.client_slug !== brandSlug) return false
      return true
    }), [allVisits, periodStartMs, brandSlug])

  const priorVisits = useMemo(() =>
    allVisits.filter(v => {
      const ms = new Date(v.visited_at).getTime()
      if (ms < priorStartMs || ms >= periodStartMs) return false
      if (brandSlug !== 'all' && v.client_slug !== brandSlug) return false
      return true
    }), [allVisits, priorStartMs, periodStartMs, brandSlug])

  const pOrders = useMemo(() =>
    (orders as any[]).filter(o => {
      const ms = new Date(o.sent_at || o.created_at).getTime()
      if (ms < periodStartMs) return false
      if (brandSlug !== 'all' && o.client_slug !== brandSlug) return false
      return ['sent', 'fulfilled'].includes(o.status)
    }), [orders, periodStartMs, brandSlug])

  const priorOrders = useMemo(() =>
    (orders as any[]).filter(o => {
      const ms = new Date(o.sent_at || o.created_at).getTime()
      if (ms < priorStartMs || ms >= periodStartMs) return false
      if (brandSlug !== 'all' && o.client_slug !== brandSlug) return false
      return ['sent', 'fulfilled'].includes(o.status)
    }), [orders, priorStartMs, periodStartMs, brandSlug])

  const pPlacements = useMemo(() =>
    placements.filter(p => brandSlug === 'all' || p.client_slug === brandSlug),
    [placements, brandSlug])

  const totalRev  = pOrders.reduce((s, o) => s + resolveTotal(o as any), 0)
  const totalComm = pOrders.reduce((s, o) => {
    const rate = clients.find((c: Client) => c.slug === (o as any).client_slug)?.commission_rate ?? 0
    return s + resolveTotal(o as any) * rate
  }, 0)
  const priorRev  = priorOrders.reduce((s, o) => s + resolveTotal(o as any), 0)
  const priorComm = priorOrders.reduce((s, o) => {
    const rate = clients.find((c: Client) => c.slug === (o as any).client_slug)?.commission_rate ?? 0
    return s + resolveTotal(o as any) * rate
  }, 0)

  const onShelf = pPlacements.filter(p => !p.lost_at && p.status === 'on_shelf').length

  const revTrend   = computeTrend(totalRev,       priorRev)
  const commTrend  = computeTrend(totalComm,      priorComm)
  const visitTrend = computeTrend(pVisits.length, priorVisits.length)

  const revenueChart = useMemo(() => {
    const months: Record<string, any> = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      months[key] = { month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) }
    }
    for (const o of orders as any[]) {
      if (brandSlug !== 'all' && o.client_slug !== brandSlug) continue
      if (!['sent','fulfilled'].includes(o.status)) continue
      const key = (o.sent_at || o.created_at).slice(0, 7)
      if (months[key]) months[key][o.client_slug] = (months[key][o.client_slug] || 0) + resolveTotal(o)
    }
    return Object.values(months)
  }, [orders, brandSlug])

  const visitChart = useMemo(() => {
    const numW = period <= 30 ? 5 : period <= 90 ? 6 : 12
    const bucketDays = period <= 30 ? 6 : period <= 90 ? 15 : 30
    const buckets: Record<string, number> = {}
    for (let i = numW - 1; i >= 0; i--) buckets[`W${numW - i}`] = 0
    for (const v of pVisits) {
      const daysBack = Math.floor((Date.now() - new Date(v.visited_at).getTime()) / (bucketDays * 86400000))
      const label = `W${numW - daysBack}`
      if (label in buckets) buckets[label]++
    }
    return Object.entries(buckets).map(([label, count]) => ({ label, count }))
  }, [pVisits, period])

  const brandBreakdown = useMemo(() => {
    return clients.map((c: Client) => {
      const bOrders = (orders as any[]).filter(o =>
        o.client_slug === c.slug && ['sent','fulfilled'].includes(o.status) &&
        new Date(o.sent_at || o.created_at).getTime() >= periodStartMs
      )
      const rev  = bOrders.reduce((s, o) => s + resolveTotal(o), 0)
      const comm = rev * (c.commission_rate ?? 0)
      const bVisits = pVisits.filter(v => v.client_slug === c.slug)
      const bPlac   = placements.filter(p => p.client_slug === c.slug && !p.lost_at && p.status === 'on_shelf')
      return { slug: c.slug, name: c.name, color: c.color, logo: c.logo_url, rev, comm, visits: bVisits.length, onShelf: bPlac.length }
    }).sort((a, b) => b.rev - a.rev)
  }, [clients, orders, pVisits, placements, periodStartMs])

  const gradeMap = useMemo(
    () => buildGradeMap(accounts as any[], orders as any[], allVisits as any[], placements as any[]),
    [accounts, orders, allVisits, placements],
  )

  const gradeCounts = useMemo(() => {
    const counts: Record<Grade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 }
    const relevant = brandSlug === 'all'
      ? accounts
      : accounts.filter((a: any) => allVisits.some(v => v.account_id === a.id && v.client_slug === brandSlug))
    for (const a of relevant as any[]) {
      const g = gradeMap[a.id]?.grade ?? 'D'
      counts[g]++
    }
    return counts
  }, [accounts, gradeMap, brandSlug, allVisits])

  const gradeTotal = useMemo(
    () => GRADES.reduce((s, g) => s + gradeCounts[g], 0),
    [gradeCounts],
  )

  const periodLabel = period === 30 ? '30 days' : period === 90 ? '90 days' : '12 months'

  const periodRange = useMemo(() => {
    const fmt = (ms: number) => {
      const d = new Date(ms)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Denver' })
    }
    return `${fmt(periodStartMs)} – ${fmt(Date.now())}`
  }, [periodStartMs])

  const KPIs = [
    { label: 'Revenue',    value: formatCurrency(totalRev),  trend: revTrend,   color: v3.amberLight,      mono: true },
    { label: 'Commission', value: formatCurrency(totalComm), trend: commTrend,  color: v3.status.success,  mono: true },
    { label: 'Visits',     value: String(pVisits.length),    trend: visitTrend, color: v3.status.info,     mono: true },
    { label: 'On Shelf',   value: String(onShelf),           trend: null,       color: v3.text.secondary,  mono: true },
  ]

  return (
    <div style={{ padding: '24px 28px 40px', maxWidth: 1500, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1 }}>Reports</h1>
          <div style={{ fontSize: '13px', color: v3.text.muted, marginTop: 3, lineHeight: 1.4 }}>
            {brandSlug === 'all' ? 'All brands' : (clients.find((c: Client) => c.slug === brandSlug) as Client | undefined)?.name ?? brandSlug} · {periodRange}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, border: `1px solid ${v3.border.subtle}`, borderRadius: v3.radius.md, padding: 3 }}>
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setPeriod(p.days)} style={{
              padding: '6px 14px', borderRadius: v3.radius.sm, border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700, fontFamily: v3.font.ui,
              background: period === p.days ? v3.amberDim : 'transparent',
              color: period === p.days ? v3.amberLight : v3.text.muted,
              transition: 'all 120ms',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: '6px', overflow: 'hidden' }}>
        {KPIs.map((s, i) => (
          <div key={s.label} style={{ padding: '18px 24px', borderRight: i < KPIs.length - 1 ? `1px solid ${v3.border.subtle}` : 'none' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.20em', marginBottom: 8, fontFamily: v3.font.ui }}>
              {s.label}
            </div>
            <div className={s.mono ? 'v3-mono' : ''} style={{ fontSize: '32px', fontWeight: 900, color: s.color, lineHeight: 1, letterSpacing: '-0.03em' }}>{s.value}</div>
            {s.trend && (
              <div style={{ marginTop: 6, fontSize: '11px', fontWeight: 700, color: s.trend.up ? v3.status.success : v3.status.danger, fontFamily: v3.font.ui, lineHeight: 1.4 }}>
                {s.trend.up ? '↑' : '↓'} {s.trend.pct}% vs prior {periodLabel}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Brand pills ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ slug: 'all', name: 'All Brands', color: v3.amber, logo_url: null as string | null }, ...clients].map((c: any) => {
          const sel = brandSlug === c.slug
          const col = c.color || v3.amber
          return (
            <button key={c.slug} onClick={() => { setBrandSlug(c.slug); setDeepTab(null) }} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px',
              borderRadius: v3.radius.full, cursor: 'pointer', fontFamily: v3.font.ui,
              border: `1.5px solid ${sel ? col + '60' : v3.border.default}`,
              background: sel ? col + '12' : 'transparent',
              color: sel ? col : v3.text.muted,
              fontSize: '13px', fontWeight: sel ? 700 : 500,
              transition: `all 140ms ${v3.ease.default}`,
            }}>
              {c.logo_url && c.slug !== 'all' && (
                <img src={c.logo_url} alt="" style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: 2 }} />
              )}
              {c.name}
              {sel && c.slug !== 'all' && <span style={{ fontSize: '11px', opacity: 0.7 }}>· {pVisits.length}v {onShelf}s</span>}
            </button>
          )
        })}
      </div>

      {/* ── Main HUD — 3-column grid ─────────────────────────────── */}
      {!deepTab && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, height: 560 }}>
          <PlacementsPanel placements={pPlacements} clients={clients} brandSlug={brandSlug} />
          <FieldPanel visits={pVisits} profileMap={profileMap} visitChart={visitChart} />
          <RevenuePanel orders={pOrders} clients={clients} revenueChart={revenueChart} brandBreakdown={brandBreakdown} totalRev={totalRev} totalComm={totalComm} />
        </div>
      )}

      {/* ── Account Grade Distribution ──────────────────────────── */}
      {gradeTotal > 0 && (
        <div style={{ background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: '6px', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: v3.font.ui }}>
              Account Grades
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: v3.text.muted, fontFamily: 'monospace' }}>
              {gradeTotal} accounts
            </span>
          </div>
          {/* Segmented bar */}
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2, marginBottom: 16 }}>
            {GRADES.map(g => {
              const pct = gradeTotal > 0 ? (gradeCounts[g] / gradeTotal) * 100 : 0
              if (pct === 0) return null
              const cfg = GRADE_CONFIG[g]
              return (
                <div key={g} title={`${g}: ${gradeCounts[g]}`} style={{
                  flex: pct, height: '100%',
                  background: cfg.color,
                  opacity: g === 'D' ? 0.4 : 0.85,
                  minWidth: gradeCounts[g] > 0 ? 4 : 0,
                  boxShadow: cfg.glow !== 'none' ? cfg.glow : undefined,
                  borderRadius: 2,
                  transition: 'flex 400ms ease',
                }} />
              )
            })}
          </div>
          {/* Grade legend */}
          <div style={{ display: 'flex', gap: 0 }}>
            {GRADES.map((g, i) => {
              const cfg = GRADE_CONFIG[g]
              const count = gradeCounts[g]
              const pct = gradeTotal > 0 ? Math.round((count / gradeTotal) * 100) : 0
              return (
                <div key={g} style={{
                  flex: 1, paddingRight: i < 4 ? 12 : 0,
                  borderRight: i < 4 ? `1px solid ${v3.border.subtle}` : 'none',
                  paddingLeft: i > 0 ? 12 : 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '3px',
                      background: cfg.bg, border: `1px solid ${cfg.border}`,
                      boxShadow: cfg.glow !== 'none' ? cfg.glow : undefined,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ fontSize: '10px', fontWeight: 900, color: cfg.color, lineHeight: 1, userSelect: 'none' }}>{g}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: v3.text.muted, fontFamily: v3.font.ui }}>{cfg.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: count > 0 ? cfg.color : 'rgba(255,255,255,0.15)', fontFamily: 'monospace', lineHeight: 1, letterSpacing: '-0.04em' }}>{count}</span>
                    {count > 0 && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>{pct}%</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Deep dive tabs ───────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${v3.border.subtle}`, paddingTop: 14 }}>
        <div style={{ display: 'flex', gap: 0, marginBottom: deepTab ? 20 : 0 }}>
          {([
            { id: 'revenue' as const, label: 'Revenue Deep Dive' },
            { id: 'team'    as const, label: 'Team Breakdown' },
          ]).map(t => (
            <button key={t.id} onClick={() => setDeepTab(d => d === t.id ? null : t.id)} style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 700, fontFamily: v3.font.ui,
              color: deepTab === t.id ? v3.amberLight : v3.text.muted,
              borderBottom: `2px solid ${deepTab === t.id ? v3.amber : 'transparent'}`,
              marginBottom: -1, transition: 'color 120ms',
            }}>{t.label}</button>
          ))}
        </div>

        {deepTab === 'revenue' && (
          <RevenueDeep orders={pOrders} clients={clients} revenueChart={revenueChart} brandBreakdown={brandBreakdown} />
        )}
        {deepTab === 'team' && (
          <TeamView visits={pVisits} priorVisits={priorVisits} profiles={profiles} />
        )}
      </div>
    </div>
  )
}
