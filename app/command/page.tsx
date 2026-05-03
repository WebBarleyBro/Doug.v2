'use client'
import { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Activity, Zap } from 'lucide-react'
import LayoutShell from '../layout-shell'
import { t } from '../lib/theme'
import { getClients } from '../lib/data'
import { getSupabase } from '../lib/supabase'
import { formatCurrency, resolveTotal } from '../lib/formatters'
import { clientLogoUrl } from '../lib/constants'
import type { Client } from '../lib/types'
import type { MapPin } from './MapView'

type MapBounds = { north: number; south: number; east: number; west: number } | null

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => (
  <div style={{ width: '100%', height: '100%', minHeight: '340px', borderRadius: '12px', background: '#0a0906', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <span style={{ fontSize: '11px', color: t.text.muted, opacity: 0.4 }}>Loading map…</span>
  </div>
) })

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderRow = {
  id: string; account_id: string; client_slug: string; status: string
  total_amount: number | null; sent_at: string | null; created_at: string
  commission_amount: number | null
  po_line_items: { total?: number; unit_price?: number; cases?: number; bottles?: number; quantity?: number }[]
}
type VisitRow   = { id: string; account_id: string; user_id: string; client_slug: string; visited_at: string; status: string }
type PlacRow    = { id: string; account_id: string; client_slug: string; status: string; created_at: string; lost_at: string | null }
type AcctRow    = { id: string; name: string; address: string | null; account_type: string; priority: string | null; lat: number | null; lng: number | null }
type ProfileRow = { id: string; name: string | null; full_name: string | null; role: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '7D',  days: 7   },
  { label: '30D', days: 30  },
  { label: '90D', days: 90  },
  { label: '1Y',  days: 365 },
] as const

const STATUS_COLORS: Record<string, string> = {
  'Will Order Soon': t.status.warning, 'Just Ordered': t.status.success,
  'Needs Follow Up': t.status.info,    'Not Interested': t.status.danger,
  'Menu Feature Won': t.status.success,'New Placement': t.gold,
  'General Check-In': t.text.secondary,
}

const PLAC_COLORS: Record<string, string> = {
  committed: t.status.info, ordered: t.status.warning,
  on_shelf: t.status.success, reordering: t.gold,
}

const RECENCY = [
  { key: 'd30',  label: '<30d',    color: t.status.success, desc: 'Ordered in last 30 days' },
  { key: 'd90',  label: '30–90d',  color: t.gold,           desc: 'Ordered 30–90 days ago' },
  { key: 'd180', label: '90–180d', color: t.status.warning, desc: 'Ordered 90–180 days ago' },
  { key: 'old',  label: '>180d',   color: t.status.danger,  desc: 'Last order over 180 days ago' },
  { key: 'none', label: 'No orders', color: 'rgba(255,255,255,0.18)', desc: 'No orders on record' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function msAgo(days: number) { return Date.now() - days * 86400000 }
function isoAgo(days: number) { return new Date(msAgo(days)).toISOString() }

function relAge(s: string | null | undefined): string {
  if (!s) return '—'
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d === 0) return 'Today'; if (d === 1) return 'Yesterday'
  if (d < 30) return `${d}d ago`; if (d < 365) return `${Math.floor(d/30)}mo ago`
  return `${Math.floor(d/365)}yr ago`
}

function trendColor(p: number | null) {
  if (p === null) return t.text.muted
  return p > 0 ? t.status.success : p < 0 ? t.status.danger : t.text.muted
}

function hashN(id: string, seed: number, range: number): number {
  let h = seed
  for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0
  return Math.abs(h) % range
}

function resolveComm(o: OrderRow, rates: Record<string, number>): number {
  const stored = Number(o.commission_amount) || 0
  if (stored > 0) return stored
  return resolveTotal(o) * (rates[o.client_slug] ?? 0)
}

// ─── HeroTile ─────────────────────────────────────────────────────────────────

function HeroTile({ label, value, sub, trend, color, loading }: {
  label: string; value: string; sub?: string
  trend?: number | null; color?: string; loading?: boolean
}) {
  const c = color ?? t.gold
  return (
    <div style={{
      flex: 1, minWidth: 0,
      padding: '16px 18px',
      background: `linear-gradient(135deg, ${c}08 0%, transparent 60%), rgba(255,255,255,0.018)`,
      border: `1px solid rgba(255,255,255,0.05)`,
      borderTop: `2px solid ${c}35`,
      borderRadius: '10px',
      backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', gap: '5px',
    }}>
      <div style={{ fontSize: '8px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', opacity: 0.55 }}>
        {label}
      </div>
      {loading
        ? <div style={{ height: '32px', width: '60%', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }} />
        : <div style={{
            fontSize: '26px', fontWeight: '900', lineHeight: 1,
            color: value === '—' ? '#282420' : c,
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
            letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
            textShadow: value !== '—' ? `0 0 24px ${c}45, 0 0 50px ${c}15` : 'none',
          }}>
            {value}
          </div>
      }
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minHeight: '14px' }}>
        {sub && <span style={{ fontSize: '10px', color: t.text.muted, opacity: 0.5 }}>{sub}</span>}
        {trend != null && (
          <span style={{ fontSize: '10px', fontWeight: '700', color: trendColor(trend) }}>
            {trend > 0 ? '↑' : '↓'}{Math.abs(trend).toFixed(0)}% vs prior
          </span>
        )}
      </div>
    </div>
  )
}

// ─── RecencyBar ───────────────────────────────────────────────────────────────

function RecencyBar({ dist, active, onSelect }: {
  dist: Record<string, AcctRow[]>
  active: string | null
  onSelect: (k: string | null) => void
}) {
  const total = RECENCY.reduce((s, r) => s + (dist[r.key]?.length ?? 0), 0)
  if (total === 0) return null
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '8px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', opacity: 0.45 }}>
          Account Order Recency  ·  {total} accounts
        </span>
        {active && (
          <button onClick={() => onSelect(null)} style={{ background: 'none', border: 'none', fontSize: '9px', color: t.gold, cursor: 'pointer', padding: 0, fontWeight: '700' }}>
            Clear filter ×
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: '3px', height: '44px', borderRadius: '8px', overflow: 'hidden' }}>
        {RECENCY.map(r => {
          const count = dist[r.key]?.length ?? 0
          if (count === 0) return null
          const pct = (count / total) * 100
          const isActive = active === r.key
          return (
            <button key={r.key} title={r.desc}
              onClick={() => onSelect(active === r.key ? null : r.key)}
              style={{
                flex: `0 0 ${pct}%`, height: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                position: 'relative', overflow: 'hidden',
                transition: 'flex 200ms',
              }}>
              <div style={{
                height: '100%',
                backgroundColor: r.color + (isActive ? '35' : '18'),
                borderTop: `2px solid ${r.color}${isActive ? 'ff' : '80'}`,
                borderRadius: '4px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '2px',
                transition: 'background-color 150ms',
                boxShadow: isActive ? `0 0 12px ${r.color}40 inset` : 'none',
              }}>
                <span style={{ fontSize: '14px', fontWeight: '900', color: r.color, fontFamily: 'monospace', lineHeight: 1, textShadow: isActive ? `0 0 10px ${r.color}80` : 'none' }}>{count}</span>
                <span style={{ fontSize: '8px', color: r.color, opacity: 0.7, whiteSpace: 'nowrap', fontWeight: '700' }}>{r.label}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── MapPanel (coverage scatter) ─────────────────────────────────────────────

function MapPanel({ accounts, dist }: {
  accounts: AcctRow[]
  dist: Record<string, AcctRow[]>
}) {
  const recencyMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const r of RECENCY) for (const a of (dist[r.key] ?? [])) m[a.id] = r.color
    return m
  }, [dist])

  const W = 600, H = 360
  const dots = useMemo(() => accounts.slice(0, 300).map(a => ({
    id: a.id, name: a.name,
    x: hashN(a.id, 7, W - 24) + 12,
    y: hashN(a.id, 13, H - 24) + 12,
    color: recencyMap[a.id] ?? 'rgba(255,255,255,0.08)',
    hasOrders: !!recencyMap[a.id],
  })), [accounts, recencyMap])

  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: `
        radial-gradient(ellipse at 30% 40%, rgba(212,168,67,0.04) 0%, transparent 55%),
        radial-gradient(ellipse at 70% 60%, rgba(61,188,118,0.03) 0%, transparent 50%),
        linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px),
        #0a0906
      `,
      backgroundSize: 'auto, auto, 36px 36px, 36px 36px, auto',
      borderRadius: '12px',
      border: `1px solid rgba(255,255,255,0.06)`,
      position: 'relative', overflow: 'hidden',
      minHeight: '340px',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Corner labels */}
      <div style={{ position: 'absolute', top: '10px', left: '12px', fontSize: '8px', color: t.text.muted, opacity: 0.3, letterSpacing: '0.12em', fontFamily: 'monospace', fontWeight: '700' }}>
        COVERAGE MAP
      </div>
      <div style={{ position: 'absolute', top: '10px', right: '12px', fontSize: '8px', color: t.text.muted, opacity: 0.3, fontFamily: 'monospace' }}>
        {accounts.length} ACCT
      </div>

      {/* Crosshair center */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.03)' }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.03)' }} />
      </div>

      {/* Dot scatter */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          {RECENCY.map(r => (
            <radialGradient key={r.key} id={`glow-${r.key}`}>
              <stop offset="0%" stopColor={r.color} stopOpacity="0.9" />
              <stop offset="100%" stopColor={r.color} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        {dots.map(d => (
          <g key={d.id}>
            {d.hasOrders && <circle cx={d.x} cy={d.y} r={8} fill={d.color} opacity={0.08} />}
            <circle cx={d.x} cy={d.y} r={d.hasOrders ? 3.5 : 2} fill={d.color}
              style={{ filter: d.hasOrders ? `drop-shadow(0 0 4px ${d.color})` : 'none' }} />
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: '12px', left: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {RECENCY.map(r => {
          const c = dist[r.key]?.length ?? 0
          if (c === 0) return null
          return (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: r.color, boxShadow: `0 0 6px ${r.color}` }} />
              <span style={{ fontSize: '9px', color: r.color, opacity: 0.7, fontWeight: '700' }}>{r.label} · {c}</span>
            </div>
          )
        })}
      </div>

      {/* Map setup banner */}
      <div style={{
        position: 'absolute', bottom: '36px', right: '12px',
        padding: '6px 10px', borderRadius: '6px',
        background: 'rgba(212,168,67,0.08)', border: `1px solid ${t.goldBorder}`,
        maxWidth: '180px',
      }}>
        <div style={{ fontSize: '8px', color: t.gold, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>Geo Map</div>
        <div style={{ fontSize: '9px', color: t.text.muted, lineHeight: 1.4 }}>
          Add <code style={{ color: t.gold }}>NEXT_PUBLIC_MAPBOX_TOKEN</code> + run migration 033 to enable live map pins.
        </div>
      </div>
    </div>
  )
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function CT({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: t.bg.elevated, border: `1px solid rgba(255,255,255,0.08)`, borderRadius: '8px', padding: '10px 14px', backdropFilter: 'blur(12px)' }}>
      <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '6px', letterSpacing: '0.06em' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ fontSize: '12px', fontWeight: '700', color: p.color, fontFamily: 'monospace', letterSpacing: '-0.01em' }}>
          {p.name}: {currency ? formatCurrency(Number(p.value)) : p.value}
        </div>
      ))}
    </div>
  )
}

// ─── RevenuePanel ─────────────────────────────────────────────────────────────

function RevenuePanel({ orders, clients, brandFilter }: { orders: OrderRow[]; clients: Client[]; brandFilter: string }) {
  const rates = useMemo(() => Object.fromEntries(clients.map(c => [c.slug, c.commission_rate ?? 0])), [clients])

  const chartData = useMemo(() => {
    const months: Record<string, any> = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      months[key] = { month: label }
    }
    for (const o of orders) {
      if (brandFilter !== 'all' && o.client_slug !== brandFilter) continue
      const key = (o.sent_at || o.created_at).slice(0, 7)
      if (months[key]) months[key][o.client_slug] = (months[key][o.client_slug] || 0) + resolveTotal(o)
    }
    return Object.values(months)
  }, [orders, brandFilter])

  const activeBrands = useMemo(() => {
    const slugs = new Set(orders.map(o => o.client_slug))
    return clients.filter(c => slugs.has(c.slug))
  }, [orders, clients])

  const topAccounts = useMemo(() => {
    const byAcct: Record<string, number> = {}
    for (const o of orders) byAcct[o.account_id] = (byAcct[o.account_id] || 0) + resolveTotal(o)
    return Object.entries(byAcct).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [orders])

  const totalRev = orders.reduce((s, o) => s + resolveTotal(o), 0)
  const totalComm = orders.reduce((s, o) => s + resolveComm(o, rates), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', height: '100%' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1, padding: '12px 14px', background: 'rgba(212,168,67,0.06)', borderRadius: '8px', border: `1px solid ${t.goldBorder}` }}>
          <div style={{ fontSize: '8px', color: t.gold, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.7, marginBottom: '4px' }}>Revenue</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: t.gold, fontFamily: 'monospace', letterSpacing: '-0.02em', textShadow: `0 0 20px ${t.gold}40` }}>{formatCurrency(totalRev)}</div>
        </div>
        <div style={{ flex: 1, padding: '12px 14px', background: 'rgba(61,188,118,0.06)', borderRadius: '8px', border: '1px solid rgba(61,188,118,0.18)' }}>
          <div style={{ fontSize: '8px', color: t.status.success, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.7, marginBottom: '4px' }}>Commission</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: t.status.success, fontFamily: 'monospace', letterSpacing: '-0.02em', textShadow: `0 0 20px ${t.status.success}40` }}>{formatCurrency(totalComm)}</div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: '140px' }}>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="month" tick={{ fontSize: 8, fill: t.text.muted, opacity: 0.5 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 8, fill: t.text.muted, opacity: 0.4 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
            <Tooltip content={<CT currency />} />
            {activeBrands.map(c => (
              <Bar key={c.slug} dataKey={c.slug} name={c.name} stackId="rev"
                fill={c.color || t.gold} opacity={0.85}
                radius={activeBrands[activeBrands.length - 1]?.slug === c.slug ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {topAccounts.length > 0 && (
        <div>
          <div style={{ fontSize: '8px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.4, marginBottom: '8px' }}>Top Accounts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {topAccounts.map(([id, rev], i) => (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '9px', color: t.text.muted, opacity: 0.35, width: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{i + 1}</span>
                <div style={{ flex: 1, height: '2px', borderRadius: '1px', background: 'rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${(rev / (topAccounts[0][1] || 1)) * 100}%`, background: `linear-gradient(90deg, ${t.gold}60, ${t.gold})`, borderRadius: '1px', boxShadow: `0 0 6px ${t.gold}80` }} />
                </div>
                <span style={{ fontSize: '10px', fontWeight: '700', color: t.gold, fontFamily: 'monospace', width: '56px', textAlign: 'right' }}>{formatCurrency(rev)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── VisitsPanel ──────────────────────────────────────────────────────────────

function VisitsPanel({ visits, period, coverage }: { visits: VisitRow[]; period: number; coverage: number }) {
  const trendData = useMemo(() => {
    const buckets: Record<string, number> = {}
    const numBuckets = period <= 7 ? 7 : period <= 30 ? 5 : period <= 90 ? 6 : 12
    const bucketDays = period <= 7 ? 1 : period <= 30 ? 6 : period <= 90 ? 15 : 30
    for (let i = numBuckets - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * bucketDays * 86400000)
      const label = period <= 7
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : period <= 90
          ? `Wk${numBuckets - i}`
          : d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      buckets[label] = 0
    }
    for (const v of visits) {
      const d = new Date(v.visited_at)
      let label: string
      if (period <= 7) label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      else if (period <= 90) {
        const daysBack = Math.floor((Date.now() - d.getTime()) / (bucketDays * 86400000))
        const wk = numBuckets - daysBack - 1
        label = `Wk${wk + 1}`
      } else {
        label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      }
      if (label in buckets) buckets[label]++
    }
    return Object.entries(buckets).map(([label, count]) => ({ label, count }))
  }, [visits, period])

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const v of visits) counts[v.status] = (counts[v.status] || 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7)
  }, [visits])

  const maxStatus = statusData[0]?.[1] ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1, padding: '10px 12px', background: 'rgba(106,174,224,0.06)', borderRadius: '8px', border: '1px solid rgba(106,174,224,0.18)' }}>
          <div style={{ fontSize: '8px', color: t.status.info, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.7, marginBottom: '3px' }}>Visits</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: t.status.info, fontFamily: 'monospace', textShadow: `0 0 16px ${t.status.info}40` }}>{visits.length}</div>
        </div>
        <div style={{ flex: 1, padding: '10px 12px', background: 'rgba(61,188,118,0.06)', borderRadius: '8px', border: '1px solid rgba(61,188,118,0.18)' }}>
          <div style={{ fontSize: '8px', color: t.status.success, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.7, marginBottom: '3px' }}>Coverage</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: coverage > 0 ? t.status.success : '#282420', fontFamily: 'monospace', textShadow: coverage > 0 ? `0 0 16px ${t.status.success}40` : 'none' }}>
            {coverage > 0 ? `${Math.round(coverage)}%` : '—'}
          </div>
        </div>
      </div>

      <div style={{ minHeight: '110px' }}>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="label" tick={{ fontSize: 8, fill: t.text.muted, opacity: 0.45 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 8, fill: t.text.muted, opacity: 0.4 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CT />} />
            <Line type="monotone" dataKey="count" name="Visits" stroke={t.status.info} strokeWidth={2} dot={false}
              style={{ filter: `drop-shadow(0 0 6px ${t.status.info}60)` }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div style={{ fontSize: '8px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.4, marginBottom: '8px' }}>Outcomes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {statusData.map(([status, count]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '9px', color: t.text.muted, opacity: 0.5, width: '100px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>
              <div style={{ flex: 1, height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${(count / maxStatus) * 100}%`, borderRadius: '2px', backgroundColor: STATUS_COLORS[status] ?? t.text.secondary, boxShadow: `0 0 6px ${STATUS_COLORS[status] ?? t.text.secondary}60`, transition: 'width 400ms ease' }} />
              </div>
              <span style={{ fontSize: '10px', fontWeight: '700', color: STATUS_COLORS[status] ?? t.text.secondary, fontFamily: 'monospace', width: '22px', textAlign: 'right' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── PlacementsPanel ─────────────────────────────────────────────────────────

function PlacementsPanel({ placements }: { placements: PlacRow[] }) {
  const funnel = useMemo(() => {
    const c = { committed: 0, ordered: 0, on_shelf: 0, reordering: 0, lost: 0 }
    for (const p of placements) {
      if (p.lost_at) { c.lost++; continue }
      if (p.status in c) c[p.status as keyof typeof c]++
    }
    return [
      { label: 'On Reorder',  count: c.reordering, color: t.gold },
      { label: 'On Shelf',    count: c.on_shelf,   color: t.status.success },
      { label: 'Ordered',     count: c.ordered,    color: t.status.warning },
      { label: 'Committed',   count: c.committed,  color: t.status.info },
      { label: 'Lost',        count: c.lost,       color: t.status.danger },
    ]
  }, [placements])

  const active = placements.filter(p => !p.lost_at).length
  const maxCount = Math.max(...funnel.map(f => f.count), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ padding: '10px 12px', background: `${t.gold}0a`, borderRadius: '8px', border: `1px solid ${t.goldBorder}` }}>
        <div style={{ fontSize: '8px', color: t.gold, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.7, marginBottom: '3px' }}>Active Placements</div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: active > 0 ? t.gold : '#282420', fontFamily: 'monospace', textShadow: active > 0 ? `0 0 20px ${t.gold}40` : 'none' }}>{active}</div>
      </div>
      <div>
        <div style={{ fontSize: '8px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.4, marginBottom: '10px' }}>Placement Pipeline</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {funnel.map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: f.color, boxShadow: f.count > 0 ? `0 0 6px ${f.color}` : 'none', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', color: t.text.secondary, width: '76px', flexShrink: 0 }}>{f.label}</span>
              <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${(f.count / maxCount) * 100}%`, background: `linear-gradient(90deg, ${f.color}50, ${f.color})`, borderRadius: '2px', boxShadow: f.count > 0 ? `0 0 8px ${f.color}60` : 'none', transition: 'width 400ms ease' }} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: '900', color: f.count > 0 ? f.color : '#282420', fontFamily: 'monospace', width: '22px', textAlign: 'right' }}>{f.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── RepsPanel ────────────────────────────────────────────────────────────────

function RepsPanel({ visits, profiles }: { visits: VisitRow[]; profiles: ProfileRow[] }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const v of visits) counts[v.user_id] = (counts[v.user_id] || 0) + 1
    return Object.entries(counts)
      .map(([uid, count]) => {
        const p = profiles.find(pr => pr.id === uid)
        return { name: p?.name || p?.full_name || 'Rep', count }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [visits, profiles])

  const max = data[0]?.count ?? 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '8px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.4, marginBottom: '4px' }}>Visit Activity by Rep</div>
      {data.length === 0
        ? <div style={{ fontSize: '12px', color: t.text.muted, opacity: 0.4 }}>No visit data for this period.</div>
        : data.map((r, i) => {
          const c = i === 0 ? t.gold : t.status.info
          return (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '9px', color: t.text.muted, opacity: 0.4, width: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{i + 1}</span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: t.text.secondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <div style={{ width: '80px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${(r.count / max) * 100}%`, background: `linear-gradient(90deg, ${c}50, ${c})`, borderRadius: '2px', boxShadow: `0 0 6px ${c}50`, transition: 'width 400ms ease' }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: '900', color: c, fontFamily: 'monospace', width: '28px', textAlign: 'right' }}>{r.count}</span>
            </div>
          )
        })
      }
    </div>
  )
}

// ─── AccountsTable ────────────────────────────────────────────────────────────

type SortCol = 'name' | 'lastOrder' | 'lastVisit' | 'revenue'

function AccountsTable({ accounts, orders, visits, clients }: {
  accounts: AcctRow[]; orders: OrderRow[]; visits: VisitRow[]; clients: Client[]
}) {
  const nowMs = useMemo(() => Date.now(), [])
  const [sortCol, setSortCol] = useState<SortCol>('lastOrder')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const orderMap = useMemo(() => {
    const m: Record<string, { date: string; rev: number }> = {}
    for (const o of orders) {
      const d = o.sent_at || o.created_at
      const prev = m[o.account_id]
      if (!prev || d > prev.date) m[o.account_id] = { date: d, rev: (prev?.rev ?? 0) + resolveTotal(o) }
      else m[o.account_id].rev += resolveTotal(o)
    }
    return m
  }, [orders])
  const visitMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const v of visits) if (!m[v.account_id] || v.visited_at > m[v.account_id]) m[v.account_id] = v.visited_at
    return m
  }, [visits])
  const brandMap = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const o of orders) { if (!m[o.account_id]) m[o.account_id] = new Set(); m[o.account_id].add(o.client_slug) }
    return m
  }, [orders])

  const sorted = useMemo(() => {
    const arr = [...accounts]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      if (sortCol === 'name') return dir * a.name.localeCompare(b.name)
      if (sortCol === 'lastOrder') {
        const da = orderMap[a.id]?.date ?? ''
        const db = orderMap[b.id]?.date ?? ''
        return dir * (da < db ? -1 : da > db ? 1 : 0)
      }
      if (sortCol === 'lastVisit') {
        const da = visitMap[a.id] ?? ''
        const db = visitMap[b.id] ?? ''
        return dir * (da < db ? -1 : da > db ? 1 : 0)
      }
      if (sortCol === 'revenue') {
        return dir * ((orderMap[a.id]?.rev ?? 0) - (orderMap[b.id]?.rev ?? 0))
      }
      return 0
    })
    return arr
  }, [accounts, sortCol, sortDir, orderMap, visitMap])

  if (accounts.length === 0) return (
    <div style={{ textAlign: 'center', padding: '32px', color: t.text.muted, fontSize: '12px', opacity: 0.4 }}>No accounts match the current filters.</div>
  )

  const colStyle = (col: SortCol): React.CSSProperties => ({
    fontSize: '8px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.12em',
    color: sortCol === col ? t.gold : t.text.muted,
    opacity: sortCol === col ? 1 : 0.4,
    cursor: 'pointer', background: 'none', border: 'none', padding: 0, textAlign: 'left',
    display: 'flex', alignItems: 'center', gap: '3px',
  })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 80px 90px 90px 80px 80px', gap: '12px', padding: '8px 14px', marginBottom: '2px' }}>
        <button onClick={() => handleSort('name')} style={colStyle('name')}>Account {sortCol === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
        <div style={{ fontSize: '8px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.4 }}>Type</div>
        <button onClick={() => handleSort('lastOrder')} style={colStyle('lastOrder')}>Last Order {sortCol === 'lastOrder' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
        <button onClick={() => handleSort('lastVisit')} style={colStyle('lastVisit')}>Last Visit {sortCol === 'lastVisit' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
        <button onClick={() => handleSort('revenue')} style={colStyle('revenue')}>Revenue {sortCol === 'revenue' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
        <div style={{ fontSize: '8px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.4 }}>Brands</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {sorted.slice(0, 60).map(a => {
          const ord = orderMap[a.id]
          const lastVisit = visitMap[a.id]
          const brands = [...(brandMap[a.id] ?? [])]
          const ageMs = ord ? nowMs - new Date(ord.date).getTime() : null
          const recColor = ageMs === null ? 'rgba(255,255,255,0.12)'
            : ageMs < 30 * 86400000 ? t.status.success
            : ageMs < 90 * 86400000 ? t.gold
            : ageMs < 180 * 86400000 ? t.status.warning
            : t.status.danger
          return (
            <Link key={a.id} href={`/accounts/${a.id}`} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 80px 90px 90px 80px 80px',
                gap: '12px', padding: '8px 14px', borderRadius: '7px',
                borderLeft: `2px solid ${recColor}`,
                backgroundColor: 'rgba(255,255,255,0)',
                transition: 'background 80ms',
              }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0)')}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: '700', color: t.text.primary }}>{a.name}</div>
                <div style={{ fontSize: '9px', color: t.text.muted, opacity: 0.55, alignSelf: 'center' }}>
                  {a.account_type === 'on_premise' ? 'On-prem' : a.account_type === 'off_premise' ? 'Off-prem' : '—'}
                </div>
                <div style={{ fontSize: '11px', color: recColor, fontWeight: ord ? '700' : '400', fontFamily: ord ? 'monospace' : 'inherit', alignSelf: 'center', letterSpacing: ord ? '-0.01em' : 'normal' }}>
                  {relAge(ord?.date)}
                </div>
                <div style={{ fontSize: '11px', color: t.text.muted, opacity: 0.6, alignSelf: 'center' }}>{relAge(lastVisit)}</div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: (ord?.rev ?? 0) > 0 ? t.gold : '#282420', fontFamily: 'monospace', alignSelf: 'center' }}>
                  {(ord?.rev ?? 0) > 0 ? formatCurrency(ord!.rev) : '—'}
                </div>
                <div style={{ display: 'flex', gap: '3px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {brands.slice(0, 3).map(slug => {
                    const cl = clients.find(c => c.slug === slug)
                    const logo = cl ? clientLogoUrl(cl) : null
                    return logo
                      ? <img key={slug} src={logo} alt={cl?.name} style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '2px', opacity: 0.7 }} />
                      : <div key={slug} style={{ width: 14, height: 14, borderRadius: '3px', background: (cl?.color || t.gold) + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: '900', color: cl?.color || t.gold }}>{(cl?.name ?? slug)[0]}</div>
                  })}
                </div>
              </div>
            </Link>
          )
        })}
        {sorted.length > 60 && (
          <div style={{ padding: '10px', textAlign: 'center', fontSize: '10px', color: t.text.muted, opacity: 0.35 }}>
            +{sorted.length - 60} more accounts — use filters to narrow results
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CommandContent ───────────────────────────────────────────────────────────

function CommandContent() {
  const [period, setPeriod]       = useState(30)
  const [brandSlug, setBrandSlug] = useState('all')
  const [repId, setRepId]         = useState('all')
  const [panel, setPanel]         = useState<'revenue' | 'visits' | 'placements' | 'reps'>('revenue')
  const [bucket, setBucket]       = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [geocoding, setGeocoding] = useState(false)
  const [mapBounds, setMapBounds] = useState<MapBounds>(null)

  const [clients,    setClients]    = useState<Client[]>([])
  const [accounts,   setAccounts]   = useState<AcctRow[]>([])
  const [orders,     setOrders]     = useState<OrderRow[]>([])
  const [visits,     setVisits]     = useState<VisitRow[]>([])
  const [placements, setPlacements] = useState<PlacRow[]>([])
  const [profiles,   setProfiles]   = useState<ProfileRow[]>([])
  const [profile,    setProfile]    = useState<any>(null)

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const sb = getSupabase()
      const twoYearsAgo = isoAgo(730)
      const oneYearAgo  = isoAgo(365)
      const [cls, acRes, orRes, plRes, prRes, vRes] = await Promise.all([
        getClients(),
        sb.from('accounts').select('id, name, address, account_type, priority, lat, lng').order('name').limit(2000),
        sb.from('purchase_orders')
          .select('id, account_id, client_slug, status, total_amount, sent_at, created_at, commission_amount, po_line_items(total, unit_price, cases, bottles, quantity)')
          .in('status', ['sent', 'fulfilled'])
          .gte('created_at', twoYearsAgo),
        sb.from('placements').select('id, account_id, client_slug, status, created_at, lost_at'),
        sb.from('user_profiles').select('id, name, full_name, role').in('role', ['owner', 'admin', 'rep']),
        sb.from('visits').select('id, account_id, user_id, client_slug, visited_at, status').gte('visited_at', oneYearAgo).order('visited_at', { ascending: false }),
      ])
      setClients(cls)
      // If lat/lng columns don't exist yet (migration 033 not run), fall back gracefully
      if (acRes.error) {
        const { data: acBasic } = await sb.from('accounts').select('id, name, address, account_type, priority').order('name').limit(2000)
        setAccounts(((acBasic ?? []) as any[]).map(a => ({ ...a, lat: null, lng: null })) as AcctRow[])
      } else {
        setAccounts((acRes.data ?? []) as AcctRow[])
      }
      setOrders((orRes.data ?? []) as OrderRow[])
      setPlacements((plRes.data ?? []) as PlacRow[])
      setProfiles((prRes.data ?? []) as ProfileRow[])
      setVisits((vRes.data ?? []) as VisitRow[])

      const { data: { user } } = await sb.auth.getUser()
      if (user) {
        const { data: p } = await sb.from('user_profiles').select('*').eq('id', user.id).single()
        setProfile(p)
      }
      setLoading(false)
    }
    load().catch(e => { console.error('command.load', e); setLoading(false) })
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────────

  const nowMs = useMemo(() => Date.now(), [])
  const accountMap  = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts])
  const clientRates = useMemo(() => Object.fromEntries(clients.map(c => [c.slug, c.commission_rate ?? 0])), [clients])

  const hasGeoAccounts = useMemo(() => accounts.some(a => a.lat != null && a.lng != null), [accounts])

  const inBounds = useCallback((acct: AcctRow) => {
    if (!mapBounds || !hasGeoAccounts) return true
    if (!acct.lat || !acct.lng) return true // ungeocoded always included
    return acct.lat >= mapBounds.south && acct.lat <= mapBounds.north &&
           acct.lng >= mapBounds.west  && acct.lng <= mapBounds.east
  }, [mapBounds, hasGeoAccounts])

  const territoryAccts = useMemo(() => accounts.filter(inBounds), [accounts, inBounds])

  const periodStartMs = nowMs - period * 86400000
  const priorStartMs  = nowMs - period * 2 * 86400000

  const filterOrder = useCallback((o: OrderRow) => {
    const dateMs = new Date(o.sent_at || o.created_at).getTime()
    if (dateMs < periodStartMs) return false
    if (brandSlug !== 'all' && o.client_slug !== brandSlug) return false
    const acct = accountMap[o.account_id]
    return acct ? inBounds(acct) : true
  }, [periodStartMs, brandSlug, accountMap, inBounds])

  const filterPrior = useCallback((o: OrderRow) => {
    const dateMs = new Date(o.sent_at || o.created_at).getTime()
    if (dateMs < priorStartMs || dateMs >= periodStartMs) return false
    if (brandSlug !== 'all' && o.client_slug !== brandSlug) return false
    const acct = accountMap[o.account_id]
    return acct ? inBounds(acct) : true
  }, [priorStartMs, periodStartMs, brandSlug, accountMap, inBounds])

  const filterVisit = useCallback((v: VisitRow) => {
    const dateMs = new Date(v.visited_at).getTime()
    if (dateMs < periodStartMs) return false
    if (brandSlug !== 'all' && v.client_slug !== brandSlug) return false
    if (repId !== 'all' && v.user_id !== repId) return false
    const acct = accountMap[v.account_id]
    return acct ? inBounds(acct) : true
  }, [periodStartMs, brandSlug, repId, accountMap, inBounds])

  const filterPlac = useCallback((p: PlacRow) => {
    if (brandSlug !== 'all' && p.client_slug !== brandSlug) return false
    const acct = accountMap[p.account_id]
    return acct ? inBounds(acct) : true
  }, [brandSlug, accountMap, inBounds])

  const pOrders     = useMemo(() => orders.filter(filterOrder),  [orders, filterOrder])
  const prOrders    = useMemo(() => orders.filter(filterPrior),  [orders, filterPrior])
  const pVisits     = useMemo(() => visits.filter(filterVisit),  [visits, filterVisit])
  const fPlacements = useMemo(() => placements.filter(filterPlac),[placements, filterPlac])

  const metrics = useMemo(() => {
    const revenue      = pOrders.reduce((s, o) => s + resolveTotal(o), 0)
    const priorRevenue = prOrders.reduce((s, o) => s + resolveTotal(o), 0)
    const commission   = pOrders.reduce((s, o) => s + resolveComm(o, clientRates), 0)
    const revenueTrend = priorRevenue > 0 ? ((revenue - priorRevenue) / priorRevenue) * 100 : null

    const buyingIds  = new Set(pOrders.map(o => o.account_id))
    const visitedIds = new Set(pVisits.map(v => v.account_id))
    const total      = territoryAccts.length

    const coverage        = total > 0 ? (visitedIds.size / total) * 100 : 0
    const activePlac      = fPlacements.filter(p => !p.lost_at).length
    const periodStartIso  = new Date(periodStartMs).toISOString()
    const placementsWon   = fPlacements.filter(p => !p.lost_at && p.created_at >= periodStartIso).length
    const visitToOrder    = visitedIds.size > 0
      ? ([...visitedIds].filter(id => buyingIds.has(id)).length / visitedIds.size) * 100 : null
    const revPerVisit     = pVisits.length > 0 ? revenue / pVisits.length : null

    return { revenue, priorRevenue, revenueTrend, commission, buyingAccounts: buyingIds.size,
      visitCount: pVisits.length, coverage, activePlac, placementsWon, visitToOrder, revPerVisit,
      totalAccounts: total, visitedAccounts: visitedIds.size }
  }, [pOrders, prOrders, pVisits, fPlacements, clientRates, territoryAccts, periodStartMs])

  // Account recency distribution (all time orders, territory + brand filtered)
  const recencyDist = useMemo(() => {
    const latest: Record<string, number> = {}
    for (const o of orders) {
      if (brandSlug !== 'all' && o.client_slug !== brandSlug) continue
      const acct = accountMap[o.account_id]
      if (!acct || !inBounds(acct)) continue
      const ms = new Date(o.sent_at || o.created_at).getTime()
      if (!latest[o.account_id] || ms > latest[o.account_id]) latest[o.account_id] = ms
    }
    const d30: AcctRow[] = [], d90: AcctRow[] = [], d180: AcctRow[] = [], old: AcctRow[] = [], none: AcctRow[] = []
    for (const a of territoryAccts) {
      const l = latest[a.id]
      if (!l) { none.push(a); continue }
      const age = nowMs - l
      if (age < 30  * 86400000) d30.push(a)
      else if (age < 90  * 86400000) d90.push(a)
      else if (age < 180 * 86400000) d180.push(a)
      else old.push(a)
    }
    return { d30, d90, d180, old, none }
  }, [orders, brandSlug, accountMap, inBounds, territoryAccts, nowMs])

  // Accounts table list (filtered by recency bucket)
  const tableAccounts = useMemo(() => {
    if (!bucket) return territoryAccts
    const map: Record<string, AcctRow[]> = recencyDist
    return map[bucket] ?? territoryAccts
  }, [bucket, territoryAccts, recencyDist])

  // Table orders: only current period for revenue column
  const tableOrders = useMemo(() => pOrders, [pOrders])

  // ── Geocoding ─────────────────────────────────────────────────────────────

  const handleGeocode = useCallback(async () => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || geocoding) return
    setGeocoding(true)
    const sb = getSupabase()
    const toGeocode = accounts.filter(a => !a.lat && a.address)
    for (const acct of toGeocode.slice(0, 100)) {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(acct.address!)}.json?access_token=${token}&limit=1&country=us`
        const res = await fetch(url)
        const data = await res.json()
        const feature = data.features?.[0]
        if (!feature) continue
        const [lng, lat] = feature.center as [number, number]
        await sb.from('accounts').update({ lat, lng }).eq('id', acct.id)
        setAccounts(prev => prev.map(a => a.id === acct.id ? { ...a, lat, lng } : a))
      } catch { continue }
    }
    setGeocoding(false)
  }, [accounts, geocoding])

  // ── Map pins ──────────────────────────────────────────────────────────────

  const mapPins = useMemo((): MapPin[] => {
    const latestOrder: Record<string, { date: string; rev: number }> = {}
    for (const o of orders) {
      const d = o.sent_at || o.created_at
      const prev = latestOrder[o.account_id]
      if (!prev || d > prev.date) latestOrder[o.account_id] = { date: d, rev: (prev?.rev ?? 0) + resolveTotal(o) }
      else latestOrder[o.account_id].rev += resolveTotal(o)
    }
    return territoryAccts
      .filter(a => a.lat != null && a.lng != null)
      .map(a => {
        const ord = latestOrder[a.id]
        const ageMs = ord ? Date.now() - new Date(ord.date).getTime() : null
        const color = ageMs === null ? 'rgba(255,255,255,0.25)'
          : ageMs < 30 * 86400000  ? t.status.success
          : ageMs < 90 * 86400000  ? t.gold
          : ageMs < 180 * 86400000 ? t.status.warning
          : t.status.danger
        return {
          id: a.id, name: a.name, accountType: a.account_type,
          lat: a.lat!, lng: a.lng!, color,
          lastOrderDate: ord?.date ?? null, revenue: ord?.rev ?? 0,
        }
      })
  }, [territoryAccts, orders])

  const ungeocodedCount = useMemo(
    () => territoryAccts.filter(a => !a.lat && a.address).length,
    [territoryAccts]
  )

  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin'

  const selectStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid rgba(255,255,255,0.07)`,
    borderRadius: '7px', color: t.text.secondary, fontSize: '11px', fontWeight: '600',
    padding: '6px 28px 6px 10px', cursor: 'pointer', outline: 'none',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%237a7060' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
  }

  const panelTabs: { id: typeof panel; label: string }[] = [
    { id: 'revenue',    label: 'Revenue' },
    { id: 'visits',     label: 'Field Activity' },
    { id: 'placements', label: 'Placements' },
    ...(isAdmin ? [{ id: 'reps' as typeof panel, label: 'Team' }] : []),
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <LayoutShell>
      <div style={{
        minHeight: '100vh',
        backgroundImage: `linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)`,
        backgroundSize: '44px 44px',
      }}>

        {/* ── Command Header ──────────────────────────────────────────────── */}
        <div style={{
          padding: '12px 24px', borderBottom: `1px solid rgba(255,255,255,0.05)`,
          background: 'rgba(15,14,12,0.85)', backdropFilter: 'blur(12px)',
          position: 'sticky', top: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '8px' }}>
            <Zap size={14} color={t.gold} style={{ filter: `drop-shadow(0 0 6px ${t.gold})` }} />
            <span style={{ fontSize: '11px', fontWeight: '900', color: t.text.primary, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              Field Intelligence
            </span>
          </div>

          {/* Period tabs */}
          <div style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '3px' }}>
            {PERIODS.map(p => (
              <button key={p.days} onClick={() => setPeriod(p.days)} style={{
                padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em',
                background: period === p.days ? t.goldDim : 'transparent',
                color: period === p.days ? t.gold : t.text.muted,
                boxShadow: period === p.days ? `0 0 12px ${t.gold}20` : 'none',
                transition: 'all 120ms',
              }}>{p.label}</button>
            ))}
          </div>

          {/* Brand */}
          <select value={brandSlug} onChange={e => setBrandSlug(e.target.value)} style={selectStyle}>
            <option value="all">All Brands</option>
            {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>

          {/* Rep (admin only) */}
          {isAdmin && (
            <select value={repId} onChange={e => setRepId(e.target.value)} style={selectStyle}>
              <option value="all">All Reps</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name || p.full_name || p.id.slice(0, 8)}</option>)}
            </select>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.status.success, boxShadow: `0 0 8px ${t.status.success}, 0 0 16px ${t.status.success}40` }} />
            <span style={{ fontSize: '9px', fontWeight: '700', color: t.status.success, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>Live</span>
          </div>
        </div>

        <div style={{ padding: '20px 24px 48px' }}>

          {/* ── Hero metrics ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <HeroTile label="Revenue" value={metrics.revenue > 0 ? formatCurrency(metrics.revenue) : '—'} trend={metrics.revenueTrend} color={t.gold} loading={loading} />
            <HeroTile label="Commission" value={metrics.commission > 0 ? formatCurrency(metrics.commission) : '—'} color={t.status.success} loading={loading} />
            <HeroTile label="Active Buyers" value={loading ? '—' : String(metrics.buyingAccounts)} sub={`of ${metrics.totalAccounts} accounts`} color={t.status.success} loading={loading} />
            <HeroTile label="Field Visits" value={loading ? '—' : String(metrics.visitCount)} sub={metrics.coverage > 0 ? `${Math.round(metrics.coverage)}% coverage` : undefined} color={t.status.info} loading={loading} />
            <HeroTile label="Active Placements" value={loading ? '—' : String(metrics.activePlac)} sub={metrics.placementsWon > 0 ? `+${metrics.placementsWon} this period` : undefined} color={t.gold} loading={loading} />
            <HeroTile label="Visit→Order Rate" value={metrics.visitToOrder != null ? `${Math.round(metrics.visitToOrder)}%` : '—'} sub={metrics.revPerVisit != null ? `${formatCurrency(metrics.revPerVisit)}/visit` : undefined} color={t.status.warning} loading={loading} />
          </div>

          {/* ── Scan line ────────────────────────────────────────────────── */}
          <div style={{ height: '1px', background: `linear-gradient(90deg, transparent, ${t.gold}30, transparent)`, marginBottom: '16px' }} />

          {/* ── Recency bar ──────────────────────────────────────────────── */}
          <RecencyBar dist={recencyDist} active={bucket} onSelect={setBucket} />

          {/* ── Main panel: map + data ───────────────────────────────────── */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'stretch', minHeight: '360px' }}>

            {/* Map */}
            <div style={{ flex: '0 0 55%', minWidth: 0 }}>
              <MapView
                pins={mapPins}
                totalAccounts={territoryAccts.length}
                ungeocodedCount={geocoding ? 0 : ungeocodedCount}
                onGeocodeRequest={handleGeocode}
                onBoundsChange={setMapBounds}
              />
              {geocoding && (
                <div style={{ marginTop: '6px', fontSize: '10px', color: t.gold, textAlign: 'center', opacity: 0.7 }}>
                  Mapping accounts… this runs once and saves permanently.
                </div>
              )}
            </div>

            {/* Data panel */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.015)', border: `1px solid rgba(255,255,255,0.05)`, borderRadius: '12px', overflow: 'hidden' }}>
              {/* Panel tabs */}
              <div style={{ display: 'flex', borderBottom: `1px solid rgba(255,255,255,0.05)`, padding: '0 16px' }}>
                {panelTabs.map(tab => (
                  <button key={tab.id} onClick={() => setPanel(tab.id)} style={{
                    padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em',
                    color: panel === tab.id ? t.gold : t.text.muted,
                    borderBottom: `2px solid ${panel === tab.id ? t.gold : 'transparent'}`,
                    textTransform: 'uppercase', transition: 'color 150ms',
                    opacity: panel === tab.id ? 1 : 0.5,
                  }}>{tab.label}</button>
                ))}
              </div>

              {/* Panel content */}
              <div style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
                {loading
                  ? <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[1,2,3].map(i => <div key={i} style={{ height: '20px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }} />)}
                    </div>
                  : panel === 'revenue'
                    ? <RevenuePanel orders={pOrders} clients={clients} brandFilter={brandSlug} />
                    : panel === 'visits'
                      ? <VisitsPanel visits={pVisits} period={period} coverage={metrics.coverage} />
                      : panel === 'placements'
                        ? <PlacementsPanel placements={fPlacements} />
                        : <RepsPanel visits={pVisits} profiles={profiles} />
                }
              </div>
            </div>
          </div>

          {/* ── Scan line ────────────────────────────────────────────────── */}
          <div style={{ height: '1px', background: `linear-gradient(90deg, transparent, ${t.gold}20, transparent)`, marginBottom: '20px' }} />

          {/* ── Accounts table ───────────────────────────────────────────── */}
          <div style={{ background: 'rgba(255,255,255,0.012)', border: `1px solid rgba(255,255,255,0.05)`, borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid rgba(255,255,255,0.04)`, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={12} color={t.text.muted} style={{ opacity: 0.5 }} />
              <span style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.5 }}>
                Accounts
              </span>
              <span style={{ fontSize: '9px', color: t.text.muted, opacity: 0.35, marginLeft: '4px' }}>
                {bucket ? `${tableAccounts.length} in segment` : mapBounds && hasGeoAccounts ? `${tableAccounts.length} in view` : `${tableAccounts.length} accounts`}
              </span>
            </div>
            <div style={{ padding: '8px' }}>
              <AccountsTable
                accounts={tableAccounts}
                orders={tableOrders}
                visits={pVisits}
                clients={clients}
              />
            </div>
          </div>

        </div>
      </div>
    </LayoutShell>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function CommandPage() {
  return (
    <Suspense>
      <CommandContent />
    </Suspense>
  )
}
