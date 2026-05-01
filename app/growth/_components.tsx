'use client'
// Shared UI primitives for the Concentric Growth Model pages

import { t } from '../lib/theme'
import type { ZonePosture } from '../lib/concentric/types'

// ─── Health Score color helpers ───────────────────────────────────────────────

export function healthColor(score: number | null): string {
  if (score === null) return t.text.muted
  if (score >= 75) return t.status.success
  if (score >= 50) return t.gold
  return t.status.danger
}

export function healthBg(score: number | null): string {
  if (score === null) return t.bg.elevated
  if (score >= 75) return t.status.successBg
  if (score >= 50) return t.goldDim
  return t.status.dangerBg
}

// ─── Posture badge ────────────────────────────────────────────────────────────

const POSTURE_LABELS: Record<ZonePosture, string> = {
  active:        'Active',
  maintaining:   'Maintaining',
  monitoring:    'Monitoring',
  opportunistic: 'Opportunistic',
}

const POSTURE_COLOR: Record<ZonePosture, string> = {
  active:        t.gold,
  maintaining:   t.status.success,
  monitoring:    t.text.muted,
  opportunistic: t.text.secondary,
}

const POSTURE_BG: Record<ZonePosture, string> = {
  active:        t.goldDim,
  maintaining:   t.status.successBg,
  monitoring:    t.status.neutralBg,
  opportunistic: 'transparent',
}

const POSTURE_BORDER: Record<ZonePosture, string> = {
  active:        t.goldBorder,
  maintaining:   'rgba(61,188,118,0.25)',
  monitoring:    t.border.default,
  opportunistic: t.border.default,
}

export function PostureBadge({ posture, size = 'sm' }: { posture: ZonePosture; size?: 'xs' | 'sm' | 'md' }) {
  const fs = size === 'xs' ? '10px' : size === 'sm' ? '11px' : '12px'
  const px = size === 'xs' ? '6px' : '8px'
  const py = size === 'xs' ? '2px' : '3px'
  return (
    <span style={{
      fontSize: fs, fontWeight: '600', padding: `${py} ${px}`,
      borderRadius: '6px', letterSpacing: '0.03em',
      color: POSTURE_COLOR[posture],
      backgroundColor: POSTURE_BG[posture],
      border: `1px solid ${POSTURE_BORDER[posture]}`,
      whiteSpace: 'nowrap',
    }}>
      {POSTURE_LABELS[posture]}
    </span>
  )
}

// ─── Account zone status badge ────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  active:    t.status.success,
  lapsed:    t.status.warning,
  dormant:   t.status.danger,
  untouched: t.text.muted,
}
const STATUS_BG: Record<string, string> = {
  active:    t.status.successBg,
  lapsed:    t.status.warningBg,
  dormant:   t.status.dangerBg,
  untouched: t.bg.elevated,
}

export function AccountStatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      fontSize: '10px', fontWeight: '600', padding: '2px 7px',
      borderRadius: '6px', textTransform: 'capitalize',
      color: STATUS_COLOR[status] ?? t.text.muted,
      backgroundColor: STATUS_BG[status] ?? t.bg.elevated,
      border: `1px solid ${STATUS_COLOR[status] ? STATUS_COLOR[status] + '40' : t.border.default}`,
    }}>
      {status}
    </span>
  )
}

// ─── Trend indicator ──────────────────────────────────────────────────────────

export function TrendBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span style={{ fontSize: '11px', color: t.text.muted }}>—</span>
  const abs = Math.abs(delta)
  const flat = abs < 2
  if (flat) return (
    <span style={{ fontSize: '11px', color: t.text.muted }}>→ ±{abs.toFixed(1)}</span>
  )
  const up = delta > 0
  return (
    <span style={{
      fontSize: '11px', fontWeight: '600',
      color: up ? t.status.success : t.status.danger,
    }}>
      {up ? '↑' : '↓'} {abs.toFixed(1)}
    </span>
  )
}

// ─── Sparkline (SVG, no dependencies) ────────────────────────────────────────

let _sparkId = 0
export function Sparkline({
  data,
  width = 120,
  height = 32,
  color,
}: {
  data: (number | null)[]
  width?: number
  height?: number
  color?: string
}) {
  const id = `sp${_sparkId++}`
  const c = color ?? t.gold
  const valid = data.filter((v): v is number => v !== null)
  if (valid.length < 2) return <div style={{ width, height }} />

  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = max - min || 1

  // Build only from non-null consecutive segments
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: v === null ? null : height - ((v - min) / range) * (height - 4) - 2,
  }))

  const pathSegs: string[] = []
  let seg = ''
  for (const p of pts) {
    if (p.y === null) { if (seg) pathSegs.push(seg); seg = ''; continue }
    seg += seg ? ` L${p.x.toFixed(1)},${p.y.toFixed(1)}` : `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }
  if (seg) pathSegs.push(seg)
  const linePath = pathSegs.join(' ')

  // Area fill: close the last segment to bottom
  const lastPt = pts.filter(p => p.y !== null).at(-1)
  const firstPt = pts.filter(p => p.y !== null)[0]
  const areaPath = linePath
    ? `${linePath} L${lastPt!.x.toFixed(1)},${height} L${firstPt!.x.toFixed(1)},${height} Z`
    : ''

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.25" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill={`url(#${id})`} />}
      {linePath && <path d={linePath} fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

// ─── Health Score ring/number display ─────────────────────────────────────────

export function HealthScoreDisplay({
  score,
  size = 'md',
}: {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const numSize = size === 'lg' ? '40px' : size === 'md' ? '28px' : '20px'
  const labelSize = size === 'lg' ? '11px' : '10px'
  const color = healthColor(score)
  const bg = healthBg(score)
  const pad = size === 'lg' ? '20px 28px' : size === 'md' ? '12px 18px' : '8px 12px'

  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      padding: pad, borderRadius: '12px',
      backgroundColor: bg, border: `1px solid ${color}30`,
    }}>
      <span style={{ fontSize: numSize, fontWeight: '800', color, lineHeight: 1 }}>
        {score !== null ? Math.round(score) : '—'}
      </span>
      <span style={{ fontSize: labelSize, color, marginTop: '2px', opacity: 0.75, fontWeight: '600' }}>
        HEALTH
      </span>
    </div>
  )
}

// ─── Health Ring (SVG circular progress gauge) ───────────────────────────────

export function HealthRing({
  score,
  size = 64,
  strokeWidth = 6,
  showLabel = true,
}: {
  score: number | null
  size?: number
  strokeWidth?: number
  showLabel?: boolean
}) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const pct = score !== null ? Math.min(score, 100) / 100 : 0
  const dash = pct * circ
  const color = healthColor(score)

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size * 0.29, fontWeight: '900', color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {score !== null ? Math.round(score) : '—'}
        </span>
        {showLabel && score !== null && (
          <span style={{ fontSize: size * 0.12, color, opacity: 0.6, fontWeight: '700', letterSpacing: '0.05em', marginTop: '1px' }}>
            HEALTH
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Channel label ────────────────────────────────────────────────────────────

export function channelLabel(channel: string): string {
  if (channel === 'on_premise') return 'On-Premise'
  if (channel === 'off_premise') return 'Off-Premise'
  return 'Both'
}

// ─── Metric tile ─────────────────────────────────────────────────────────────

export function MetricTile({
  label,
  value,
  target,
  unit = '%',
  note,
}: {
  label: string
  value: number | null
  target?: number | null
  unit?: string
  note?: string
}) {
  const gap = target != null && value !== null ? value - target : null
  const gapColor = gap === null ? t.text.muted : gap >= 0 ? t.status.success : t.status.danger

  return (
    <div style={{
      backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`,
      borderRadius: '10px', padding: '14px 16px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: '800', color: t.text.primary, lineHeight: 1 }}>
        {value !== null ? `${Math.round(value * 10) / 10}${unit}` : '—'}
      </div>
      {target != null && (
        <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '5px' }}>
          Target: {target}{unit}
          {gap !== null && (
            <span style={{ color: gapColor, marginLeft: '6px', fontWeight: '600' }}>
              {gap >= 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1)} {unit}
            </span>
          )}
        </div>
      )}
      {note && <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '4px', fontStyle: 'italic' }}>{note}</div>}
    </div>
  )
}
