'use client'
// Shared presentation layer for the client portal. Kept separate from page.tsx so
// the layout can be rendered against fixture data during design review.

import React, { useState, useEffect, useRef } from 'react'
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ArrowUpRight, ArrowDownRight, Minus, Table2, BarChart3, ChevronRight, X, GitCompareArrows } from 'lucide-react'
import {
  type PeriodReport, type Delta, type OutcomeGroup,
  OUTCOME_GROUP_COLOR, OUTCOME_GROUP_LABEL, OUTCOME_DESCRIPTION,
  formatDelta,
} from './portal-metrics'

// ── Design tokens ─────────────────────────────────────────────────────────────
// The portal is a single deliberate dark look (brand-facing), so tokens live here
// rather than in the CRM's theme.ts. Gold is the Barley Bros chrome; the brand's
// own accent is reserved for that brand's data marks.
export const T = {
  page: '#0a0806',
  void: '#060504',
  card: 'rgba(22,18,13,0.78)',
  cardSolid: '#16120d',
  raised: '#1c1712',
  border: 'rgba(255,255,255,0.075)',
  borderSoft: 'rgba(255,255,255,0.045)',
  gold: '#c4a46e',
  goldDim: 'rgba(196,164,110,0.16)',
  text: '#f4eee2',
  text2: '#c2b8a6',
  muted: '#8b8376',
  faint: '#5d564c',
  grid: 'rgba(255,255,255,0.055)',
  prior: '#8a8782',
  good: '#3dba78',
  bad: '#e0664a',
}
export const F = '"Space Grotesk", -apple-system, "Segoe UI", sans-serif'
export const PIPELINE_RAMP = ['#8f7440', '#b3935a', '#c4a46e', '#dcc79a']

// Brand accents are arbitrary hex from the clients table; lift dark ones so marks
// keep ≥3:1 against the page without throwing away the hue.
export function readableAccent(hex: string | undefined | null): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return T.gold
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  if (L >= 0.16) return hex
  const mix = (c: number) => Math.round(c + (255 - c) * 0.42)
  return `#${[mix(r), mix(g), mix(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// ── Primitives ────────────────────────────────────────────────────────────────

export function Counter({ to, duration = 700 }: { to: number; duration?: number }) {
  const [n, setN] = useState(to)
  const prev = useRef(to)
  useEffect(() => {
    if (prefersReducedMotion() || to === prev.current) { setN(to); prev.current = to; return }
    const from = 0, t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      setN(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    prev.current = to
    return () => cancelAnimationFrame(raf)
  }, [to, duration])
  return <>{n.toLocaleString()}</>
}

export function Glass({ children, style, className, onClick }: {
  children: React.ReactNode; style?: React.CSSProperties; className?: string; onClick?: () => void
}) {
  return (
    <div className={className} onClick={onClick} style={{
      background: T.card,
      backdropFilter: 'blur(22px) saturate(1.25)',
      WebkitBackdropFilter: 'blur(22px) saturate(1.25)',
      border: `1px solid ${T.border}`,
      boxShadow: '0 12px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.055)',
      borderRadius: 14,
      ...style,
    }}>{children}</div>
  )
}

export function Panel({ children, style, className, id }: {
  children: React.ReactNode; style?: React.CSSProperties; className?: string; id?: string
}) {
  return (
    <section id={id} className={`pr-panel ${className || ''}`} style={{
      background: `linear-gradient(180deg, rgba(255,255,255,0.022), rgba(255,255,255,0) 120px), ${T.cardSolid}`,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      padding: '18px 18px 16px',
      minWidth: 0,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.045)',
      ...style,
    }}>{children}</section>
  )
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9.5, fontWeight: 700, color: T.gold, textTransform: 'uppercase', letterSpacing: '0.18em' }}>{children}</div>
}

export function SectionTitle({ children, sub, right }: { children: React.ReactNode; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: '-0.015em' }}>{children}</div>
        {sub && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function DeltaChip({ d, unit, upIsGood = true, suffix, size = 'sm' }: {
  d: Delta; unit?: 'count' | 'pts' | 'dollars'; upIsGood?: boolean; suffix: string; size?: 'sm' | 'md'
}) {
  const good = d.dir === 'flat' ? null : (d.dir === 'up') === upIsGood
  const color = d.dir === 'flat' ? T.muted : good ? T.good : T.bad
  const Icon = d.dir === 'up' ? ArrowUpRight : d.dir === 'down' ? ArrowDownRight : Minus
  const fs = size === 'md' ? 12.5 : 11
  return (
    <span className="pr-delta" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: fs, color, fontWeight: 700, lineHeight: 1.25, flexWrap: 'wrap' }}>
      <Icon size={size === 'md' ? 14 : 12} strokeWidth={2.6} style={{ flexShrink: 0 }} />
      {formatDelta(d, unit)}
      {/* The full comparison reads well on wide screens; narrow ones get the short
          form, with the filter bar carrying the full phrase. */}
      <span className="pr-vs-long" style={{ color: T.muted, fontWeight: 500 }}>vs {suffix}</span>
      <span className="pr-vs-short" style={{ color: T.muted, fontWeight: 500 }}>vs prior</span>
    </span>
  )
}

// A tile whose metric is zero in both periods is real information, but it should
// not shout as loudly as one with movement.
export function StatTile({ label, value, d, unit, upIsGood, priorLabel, hint, accent }: {
  label: string; value: string; d: Delta; unit?: 'count' | 'pts' | 'dollars'; upIsGood?: boolean
  priorLabel: string; hint?: string; accent: string
}) {
  const dormant = d.current === 0 && d.prior === 0
  return (
    <div className="pr-tile" title={hint} style={{
      background: T.cardSolid, border: `1px solid ${T.border}`, borderRadius: 13,
      padding: '14px 16px 13px', minWidth: 0, position: 'relative', overflow: 'hidden',
      opacity: dormant ? 0.55 : 1,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: dormant ? 'transparent' : `linear-gradient(90deg, ${accent}, ${accent}00)` }} />
      <div style={{ fontSize: 10.5, color: T.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: T.text, letterSpacing: '-0.035em', lineHeight: 1.05, margin: '7px 0 6px' }}>{value}</div>
      <DeltaChip d={d} unit={unit} upIsGood={upIsGood} suffix={priorLabel} />
    </div>
  )
}

export function Meter({ label, pct, sub, color }: { label: string; pct: number | null; sub: string; color: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2, lineHeight: 1.45 }}>{sub}</div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: pct === null ? T.faint : T.text, letterSpacing: '-0.03em', flexShrink: 0 }}>{pct === null ? '—' : `${pct}%`}</div>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.055)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct ?? 0}%`, background: `linear-gradient(90deg, ${color}bb, ${color})`, borderRadius: 4, boxShadow: `0 0 12px ${color}55`, transition: 'width 700ms cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
    </div>
  )
}

export function Chip({ active, onClick, children, color, dot }: {
  active: boolean; onClick: () => void; children: React.ReactNode; color?: string; dot?: string
}) {
  const c = color || T.gold
  return (
    <button onClick={onClick} aria-pressed={active} className="pr-chip" style={{
      padding: '7px 13px', borderRadius: 9, fontSize: 12, fontWeight: 600, fontFamily: F, whiteSpace: 'nowrap',
      border: `1px solid ${active ? c + '77' : T.border}`,
      background: active ? c + '22' : 'rgba(255,255,255,0.02)',
      color: active ? T.text : T.text2, cursor: 'pointer', transition: 'all 130ms', minHeight: 34,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      boxShadow: active ? `0 0 0 1px ${c}22, 0 2px 12px ${c}22` : 'none',
    }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: 2, background: dot, flexShrink: 0 }} />}
      {children}
    </button>
  )
}

export function Drawer({ title, count, onClose, children }: {
  title: string; count?: number; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} role="dialog" aria-label={title}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="pr-drawer" style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(480px, 100vw)', background: T.page,
        borderLeft: `1px solid ${T.border}`, boxShadow: '-10px 0 60px rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column',
        animation: 'prSlideIn 0.24s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.borderSoft}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, padding: 6, display: 'flex', minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{title}</span>
          {count != null && <span style={{ fontSize: 11, fontWeight: 700, color: T.gold, background: T.goldDim, padding: '3px 9px', borderRadius: 20 }}>{count}</span>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 40px', WebkitOverflowScrolling: 'touch' as any }}>{children}</div>
      </div>
    </div>
  )
}

// ── Trend chart ───────────────────────────────────────────────────────────────
// Current period = accent bars (the figure). Prior period = a soft gray wash
// behind them (the ground) — a spiky bright line competed with the real data.

function TrendTooltip({ active, payload, label, accent, compare }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  return (
    <div style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 13px', boxShadow: '0 10px 40px rgba(0,0,0,0.7)', fontFamily: F }}>
      <div style={{ fontSize: 11.5, color: T.text, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
        <span style={{ width: 10, height: 10, background: accent, borderRadius: 2, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, color: T.text, minWidth: 16 }}>{row?.current ?? 0}</span>
        <span style={{ color: T.text2 }}>visit{(row?.current ?? 0) === 1 ? '' : 's'}</span>
      </div>
      {compare && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, marginTop: 5, paddingTop: 5, borderTop: `1px solid ${T.borderSoft}` }}>
          <span style={{ width: 10, height: 10, background: T.prior, borderRadius: 2, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, color: T.text2, minWidth: 16 }}>{row?.prior ?? 0}</span>
          <span style={{ color: T.muted }}>{row?.priorLabel || 'prior period'}</span>
        </div>
      )}
    </div>
  )
}

export function TrendChart({ report, accent, dimmed }: { report: PeriodReport; accent: string; dimmed: boolean }) {
  const [table, setTable] = useState(false)
  const [compare, setCompare] = useState(false)
  const { trend, range, trendGranularity } = report
  const unit = trendGranularity === 'day' ? 'per day' : trendGranularity === 'week' ? 'per week' : 'per month'
  const peak = Math.max(...trend.map(b => b.current))

  // Paired bars need room to read, so comparison mode merges buckets down to a
  // count that can carry two bars each.
  const data = compare && trend.length > 14
    ? (() => {
        const group = Math.ceil(trend.length / 10)
        const out: typeof trend = []
        for (let i = 0; i < trend.length; i += group) {
          const slice = trend.slice(i, i + group)
          const firstPrior = slice[0].priorLabel.split(' – ')[0]
          const lastPrior = slice[slice.length - 1].priorLabel.split(' – ').slice(-1)[0]
          out.push({
            label: slice[0].label,
            current: slice.reduce((s, b) => s + b.current, 0),
            prior: slice.reduce((s, b) => s + b.prior, 0),
            priorLabel: firstPrior === lastPrior ? firstPrior : `${firstPrior} – ${lastPrior}`,
          })
        }
        return out
      })()
    : trend
  const tickEvery = Math.max(1, Math.ceil(data.length / 9))

  const btn = (activeState: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '7px 11px', cursor: 'pointer',
    fontSize: 11.5, fontFamily: F, minHeight: 34, whiteSpace: 'nowrap', fontWeight: 600,
    background: activeState ? accent + '22' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${activeState ? accent + '77' : T.border}`,
    color: activeState ? T.text : T.text2,
  })

  return (
    <Panel style={{ padding: '18px 18px 10px' }}>
      <SectionTitle
        sub={compare ? `Visits ${unit === 'per day' ? 'grouped' : unit} · ${range.label} beside ${range.priorLabel}` : `Visits ${unit} · ${range.label}`}
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setCompare(c => !c)} aria-pressed={compare} className="pr-ghost" style={btn(compare)}>
              <GitCompareArrows size={13} /> Compare
            </button>
            <button onClick={() => setTable(t => !t)} aria-pressed={table} className="pr-ghost" style={btn(false)}>
              {table ? <BarChart3 size={13} /> : <Table2 size={13} />}{table ? 'Chart' : 'Table'}
            </button>
          </div>
        }>Visit activity</SectionTitle>

      <div style={{ display: 'flex', gap: 18, marginBottom: 10, fontSize: 11.5, color: T.text2, flexWrap: 'wrap', alignItems: 'center' }}>
        {compare ? (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 11, height: 11, background: accent, borderRadius: 3, boxShadow: `0 0 10px ${accent}66` }} />{range.label}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 11, height: 11, background: T.prior, borderRadius: 3 }} />{range.priorLabel}
            </span>
          </>
        ) : (
          <span style={{ color: T.muted }}>Each bar is one {trendGranularity}. Turn on Compare to set it beside {range.priorLabel}.</span>
        )}
        {peak > 0 && <span style={{ color: T.faint, marginLeft: 'auto' }}>Peak {peak} visit{peak === 1 ? '' : 's'}</span>}
      </div>

      {table ? (
        <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr>{['Period', 'Visits', 'Prior period', 'Prior visits'].map(h => (
              <th key={h} style={{ textAlign: 'left', fontSize: 10.5, color: T.muted, fontWeight: 600, padding: '7px 8px', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr></thead>
            <tbody>{trend.map((b, i) => (
              <tr key={i}>
                <td style={{ padding: '7px 8px', color: T.text, borderBottom: `1px solid ${T.borderSoft}`, whiteSpace: 'nowrap' }}>{b.label}</td>
                <td style={{ padding: '7px 8px', color: T.text, fontWeight: 700, borderBottom: `1px solid ${T.borderSoft}` }}>{b.current}</td>
                <td style={{ padding: '7px 8px', color: T.muted, borderBottom: `1px solid ${T.borderSoft}`, whiteSpace: 'nowrap' }}>{b.priorLabel}</td>
                <td style={{ padding: '7px 8px', color: T.text2, borderBottom: `1px solid ${T.borderSoft}` }}>{b.prior}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ opacity: dimmed ? 0.45 : 1, transition: 'opacity 220ms' }}>
          <ResponsiveContainer width="100%" height={252}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 4 }} barCategoryGap="26%" barGap={2}>
              <defs>
                <linearGradient id="prBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={1} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={T.grid} />
              <XAxis dataKey="label" tick={{ fill: T.muted, fontSize: 10.5, fontFamily: F }} axisLine={{ stroke: T.border }} tickLine={false} interval={tickEvery - 1} minTickGap={10} dy={4} />
              <YAxis tick={{ fill: T.muted, fontSize: 10.5, fontFamily: F }} axisLine={false} tickLine={false} allowDecimals={false} width={38} />
              <Tooltip content={<TrendTooltip accent={accent} compare={compare} />} cursor={{ fill: 'rgba(255,255,255,0.045)' }} />
              {/* Side-by-side bars, not an overlaid line: the prior period is a
                  different set of dates, so it gets its own mark rather than being
                  drawn on top of this period's axis labels. */}
              <Bar dataKey="current" fill="url(#prBar)" radius={[4, 4, 0, 0]} maxBarSize={compare ? 18 : 26} name={range.label} animationDuration={prefersReducedMotion() ? 0 : 650} />
              {compare && <Bar dataKey="prior" fill={T.prior} fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={18} name={range.priorLabel} animationDuration={prefersReducedMotion() ? 0 : 650} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}

// ── Outcome breakdown ─────────────────────────────────────────────────────────

export function OutcomeBreakdown({ report, onPick, activeGroup }: {
  report: PeriodReport; onPick: (g: OutcomeGroup | 'all') => void; activeGroup: OutcomeGroup | 'all'
}) {
  const max = Math.max(1, ...report.outcomes.map(o => o.current))
  const groups: OutcomeGroup[] = ['win', 'progress', 'neutral', 'passed']
  const totals = groups.map(g => ({ g, n: report.outcomes.filter(o => o.group === g).reduce((s, o) => s + o.current, 0) }))
  const grand = totals.reduce((s, t) => s + t.n, 0)

  return (
    <Panel>
      <SectionTitle sub="What happened at each visit. Tap a band or row to filter the activity log.">Visit outcomes</SectionTitle>

      {grand > 0 && (
        <>
          <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2, marginBottom: 10 }}>
            {totals.filter(t => t.n > 0).map(t => (
              <button key={t.g} onClick={() => onPick(activeGroup === t.g ? 'all' : t.g)} aria-label={`${OUTCOME_GROUP_LABEL[t.g]}: ${t.n}`}
                title={`${OUTCOME_GROUP_LABEL[t.g]} · ${t.n} (${Math.round((t.n / grand) * 100)}%)`}
                style={{
                  width: `${(t.n / grand) * 100}%`, background: OUTCOME_GROUP_COLOR[t.g], border: 'none', cursor: 'pointer', padding: 0,
                  opacity: activeGroup === 'all' || activeGroup === t.g ? 1 : 0.32, transition: 'opacity 150ms', minWidth: 4,
                }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px 16px', flexWrap: 'wrap', marginBottom: 16, fontSize: 11.5, color: T.text2 }}>
            {totals.filter(t => t.n > 0).map(t => (
              <span key={t.g} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: OUTCOME_GROUP_COLOR[t.g] }} />
                {OUTCOME_GROUP_LABEL[t.g]}<span style={{ color: T.text, fontWeight: 700 }}>{t.n}</span>
              </span>
            ))}
          </div>
        </>
      )}

      {report.outcomes.length === 0 && <div style={{ fontSize: 12.5, color: T.muted, padding: '14px 0' }}>No visits in this period.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {report.outcomes.map(o => {
          const c = OUTCOME_GROUP_COLOR[o.group]
          const d = o.current - o.prior
          const dim = activeGroup !== 'all' && activeGroup !== o.group
          return (
            <button key={o.status} onClick={() => onPick(activeGroup === o.group ? 'all' : o.group)} className="pr-outcome" style={{
              background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: F,
              opacity: dim ? 0.4 : 1, transition: 'opacity 150ms',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: c, flexShrink: 0 }} />{o.status}
                  </div>
                  <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{OUTCOME_DESCRIPTION[o.status] || ''}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{o.current}</span>
                  <span style={{ fontSize: 10.5, color: T.muted, marginLeft: 6 }}>{o.pct}%</span>
                  <div style={{ fontSize: 10.5, color: d > 0 ? T.good : d < 0 ? T.bad : T.muted, marginTop: 1 }}>
                    {d === 0 ? `same as prior (${o.prior})` : `${d > 0 ? '+' : '−'}${Math.abs(d)} vs prior (${o.prior})`}
                  </div>
                </div>
              </div>
              <div style={{ height: 7, background: 'rgba(255,255,255,0.05)', borderRadius: 4, position: 'relative' }}>
                <div style={{ height: '100%', width: `${Math.round((o.current / max) * 100)}%`, background: `linear-gradient(90deg, ${c}cc, ${c})`, borderRadius: 4, boxShadow: `0 0 10px ${c}44`, transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)' }} />
                {o.prior > 0 && <span title={`Prior period: ${o.prior}`} style={{ position: 'absolute', top: -3, bottom: -3, left: `min(100%, ${Math.round((o.prior / max) * 100)}%)`, width: 2, background: T.prior, borderRadius: 1 }} />}
              </div>
            </button>
          )
        })}
      </div>
      {report.outcomes.length > 0 && <div style={{ fontSize: 10.5, color: T.faint, marginTop: 13 }}>The gray tick on each bar marks the prior period&apos;s count.</div>}
    </Panel>
  )
}

// ── Top accounts ──────────────────────────────────────────────────────────────

export function TopAccounts({ report, accent }: { report: PeriodReport; accent: string }) {
  // Dollars ordered is the ranking metric when the brand has any; otherwise the
  // list falls back to visit count so it still says something useful.
  const byDollars = report.topAccounts.some(a => a.orderValue > 0)
  const metric = (a: typeof report.topAccounts[number]) => byDollars ? a.orderValue : a.visits
  const max = Math.max(1, ...report.topAccounts.map(metric))
  return (
    <Panel>
      <SectionTitle sub={byDollars ? 'Ranked by dollars ordered in this period' : 'Ranked by visits — no orders recorded in this period'}>
        Top accounts
      </SectionTitle>
      {report.topAccounts.length === 0 && <div style={{ fontSize: 12.5, color: T.muted, padding: '14px 0' }}>No account activity in this period.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {report.topAccounts.map((a, i) => {
          const hasMoney = a.orderValue > 0
          const c = hasMoney ? accent : 'rgba(255,255,255,0.26)'
          const detail = [
            a.orders > 0 ? `${a.orders} order${a.orders === 1 ? '' : 's'}` : null,
            a.visits > 0 ? `${a.visits} visit${a.visits === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join(' · ')
          return (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 11, alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: i < 3 ? T.gold : T.faint, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  {a.wins > 0 && <span style={{ fontSize: 8.5, fontWeight: 800, color: OUTCOME_GROUP_COLOR.win, background: OUTCOME_GROUP_COLOR.win + '26', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.07em', flexShrink: 0 }}>{a.wins} WIN{a.wins > 1 ? 'S' : ''}</span>}
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${Math.max(2, Math.round((metric(a) / max) * 100))}%`, background: hasMoney ? `linear-gradient(90deg, ${c}bb, ${c})` : c, borderRadius: 3, transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)' }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: hasMoney ? T.text : T.text2 }}>
                  {hasMoney ? `$${a.orderValue.toLocaleString()}` : `${a.visits}`}
                  {!hasMoney && <span style={{ fontSize: 10.5, color: T.muted, fontWeight: 500 }}> visit{a.visits === 1 ? '' : 's'}</span>}
                </div>
                {detail && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{detail}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

// ── Placements + health ───────────────────────────────────────────────────────

export function PlacementsPanel({ report, accent, onOpen }: { report: PeriodReport; accent: string; onOpen: () => void }) {
  const { snapshot } = report
  return (
    <Panel>
      <SectionTitle sub="Where your product stands today — not limited to the selected period" right={
        <button onClick={onOpen} className="pr-ghost" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px', color: T.text2, cursor: 'pointer', fontSize: 11.5, fontFamily: F, minHeight: 34, whiteSpace: 'nowrap' }}>
          See all <ChevronRight size={12} />
        </button>
      }>Placements today</SectionTitle>

      <div style={{ display: 'flex', gap: 26, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 700, color: T.text, letterSpacing: '-0.035em', lineHeight: 1 }}><Counter to={snapshot.activePlacements} /></div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>Active placements</div>
        </div>
        <div>
          <div style={{ fontSize: 32, fontWeight: 700, color: T.gold, letterSpacing: '-0.035em', lineHeight: 1 }}><Counter to={snapshot.onShelf} /></div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>On shelf or reordering</div>
        </div>
      </div>

      {snapshot.pipeline.length > 0 ? (
        <>
          <div style={{ display: 'flex', height: 13, borderRadius: 7, overflow: 'hidden', gap: 2, background: 'rgba(255,255,255,0.04)' }}>
            {snapshot.pipeline.map(p => {
              const i = ['committed', 'ordered', 'on_shelf', 'reordering'].indexOf(p.status)
              return <div key={p.status} title={`${p.label}: ${p.count}`} style={{ width: `${(p.count / Math.max(1, snapshot.activePlacements)) * 100}%`, background: PIPELINE_RAMP[i] || accent, minWidth: 4 }} />
            })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 11 }}>
            {snapshot.pipeline.map(p => {
              const i = ['committed', 'ordered', 'on_shelf', 'reordering'].indexOf(p.status)
              return (
                <span key={p.status} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: T.text2 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: PIPELINE_RAMP[i] || accent }} />{p.label}
                  <span style={{ color: T.text, fontWeight: 700 }}>{p.count}</span>
                </span>
              )
            })}
          </div>
          <div style={{ fontSize: 10.5, color: T.faint, marginTop: 11, lineHeight: 1.5 }}>Committed → Ordered → On shelf → Reordering. Darker is earlier in the journey.</div>
        </>
      ) : <div style={{ fontSize: 12.5, color: T.muted }}>No active placements yet.</div>}
    </Panel>
  )
}

export function HealthPanel({ report, accent }: { report: PeriodReport; accent: string }) {
  const { snapshot, range, kpis } = report
  return (
    <Panel>
      <SectionTitle sub="How field visits are converting into buying accounts">Account health</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Meter label="Visited accounts that are buying" pct={snapshot.reach.pct} color={OUTCOME_GROUP_COLOR.win}
          sub={snapshot.reach.visited ? `${snapshot.reach.buying} of ${snapshot.reach.visited} accounts visited in ${range.label.toLowerCase()} have an active placement or order` : 'No accounts visited in this period'} />
        <Meter label="Accounts that reordered" pct={snapshot.repeat.pct} color={accent}
          sub={snapshot.repeat.ordering ? `${snapshot.repeat.repeatAccounts} of ${snapshot.repeat.ordering} accounts that ordered have placed more than one order` : 'No orders recorded yet'} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 14, borderTop: `1px solid ${T.borderSoft}` }}>
          <div>
            <div style={{ fontSize: 23, fontWeight: 700, color: T.text, letterSpacing: '-0.03em' }}>{(kpis.visits.current / Math.max(1, range.days / 7)).toFixed(1)}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>Visits per week</div>
          </div>
          <div>
            <div style={{ fontSize: 23, fontWeight: 700, color: T.text, letterSpacing: '-0.03em' }}>{kpis.inProgress.current}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>Accounts warming up</div>
          </div>
        </div>
      </div>
    </Panel>
  )
}
