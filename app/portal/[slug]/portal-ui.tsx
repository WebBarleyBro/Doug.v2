'use client'
// Presentation layer for the client portal. Tokens, primitives and every panel
// live here; page.tsx only orchestrates data and drawers. Nothing in this file
// computes a number — every value comes from a PeriodReport (portal-metrics.ts).

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { WESTERN_PEAK_LOGO_ON_LIGHT_URL } from '../../lib/constants'
import {
  type PeriodReport, type Delta, type AccountRow, type OrderRow, type ProductRow, type TimelineStop, type AccountDetail,
  type MonthlyPdfData, type QuarterlyPdfData,
  formatDelta, formatPdfDelta, money, moneyK, fmtShort, fmtShortYear, unitLabel,
} from './portal-metrics'

// ── Design tokens (portal only) ───────────────────────────────────────────────

export const C = {
  bg: '#0b0c0f', surface: '#111318', raised: '#171a20', hover: '#1c2028',
  line: 'rgba(242,243,245,.08)', line2: 'rgba(242,243,245,.045)',
  ink: '#f2f3f5', ink2: '#b4b9c2', mute: '#737a86', faint: '#474d58',
  bar: '#e6e8ec', bar2: '#9aa0aa', ghost: 'rgba(242,243,245,.18)',
  up: '#8fd3b4', dn: '#f0a391',
}
export const FS = 'var(--pf-sans), "Schibsted Grotesk", -apple-system, "Segoe UI", sans-serif'
export const FM = 'var(--pf-mono), "DM Mono", ui-monospace, Menlo, monospace'

export const FIRM = { name: 'Western Peak', contact: 'Chase Frakes', contactFirst: 'Chase', city: 'Fort Collins, Colorado' }

export interface Accent { accent: string; accentInk: string; accentSoft: string; accentLine: string }
export function accentTokens(hex: string | null | undefined): Accent {
  const h = hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#8fb6d9'
  const n = parseInt(h.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const mix = (c: number) => Math.round(c + (255 - c) * 0.3)
  return { accent: h, accentInk: `rgb(${mix(r)},${mix(g)},${mix(b)})`, accentSoft: `rgba(${r},${g},${b},.14)`, accentLine: `rgba(${r},${g},${b},.6)` }
}

export const mono: React.CSSProperties = { fontFamily: FM, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }
export const upperLabel: React.CSSProperties = { ...mono, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.mute, fontWeight: 500 }

// ── Global portal styles (layout, media queries, motion) ──────────────────────

export function PortalStyles({ accent }: { accent: Accent }) {
  return (
    <style>{`
      .pt-root{background:${C.bg};color:${C.ink};font-family:${FS};font-size:14.5px;line-height:1.45;min-height:100vh;
        padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-bottom:64px;overflow-x:clip}
      .pt-root *{box-sizing:border-box;min-width:0}
      .pt-wrap{max-width:1180px;margin:0 auto}
      .pt-root button{font:inherit;color:inherit;cursor:pointer;background:none;border:0;padding:0}
      .pt-root button:disabled{cursor:default}
      .pt-root button:focus-visible,.pt-root a:focus-visible,.pt-root input:focus-visible,.pt-root select:focus-visible,.pt-root textarea:focus-visible{outline:2px solid ${accent.accent};outline-offset:2px}
      .pt-root a{color:inherit}
      .pt-root input,.pt-root select,.pt-root textarea{font-family:inherit;color-scheme:dark}
      .pt-root select option{background:${C.raised};color:${C.ink}}
      .pt-root ::-webkit-scrollbar{width:7px;height:7px}.pt-root ::-webkit-scrollbar-thumb{background:rgba(242,243,245,.13);border-radius:4px}

      .pt-staffbar{height:36px;display:flex;align-items:center;justify-content:flex-end;gap:10px;border-bottom:1px solid ${C.line2};font-size:12px;color:${C.mute}}
      .pt-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid ${C.line};position:sticky;top:0;background:${C.bg};z-index:5}
      .pt-brand{display:flex;align-items:center;gap:10px;flex-shrink:0}
      .pt-tools{display:flex;gap:8px;align-items:center;flex-wrap:nowrap;justify-content:flex-end}
      .pt-tools-row{display:flex;gap:8px;align-items:center;flex-wrap:nowrap;justify-content:flex-end}
      @media (max-width:1180px){.pt-brand-label{display:none}}
      @media (max-width:1023px){
        .pt-bar{align-items:flex-start}
        .pt-tools{flex-direction:column;align-items:flex-end;gap:8px}
        .pt-tools-row{flex-wrap:wrap}
      }
      .pt-id{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding:36px 0 20px;flex-wrap:wrap}
      .pt-id-right{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
      .pt-m3{display:grid;grid-template-columns:repeat(3,1fr)}
      .pt-mx{padding:20px 22px 18px;border-right:1px solid ${C.line};display:flex;flex-direction:column;gap:6px}
      .pt-mx-body{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:end}
      .pt-mx-num{display:flex;flex-direction:column;gap:6px}
      .pt-mx:last-child{border-right:0}
      .pt-m4{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid ${C.line}}
      .pt-ms{padding:13px 22px;border-right:1px solid ${C.line};display:flex;flex-direction:column;gap:2px}
      .pt-ms:last-child{border-right:0}
      .pt-row32{display:grid;grid-template-columns:3fr 2fr;gap:14px;align-items:stretch}
      .pt-row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .pt-acc-wide{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;align-items:start}
      .pt-acc-wide h3{margin-top:0!important}
      .pt-panel{background:${C.surface};border:1px solid ${C.line};border-radius:14px;padding:20px 22px;margin-top:14px}
      .pt-stages{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid ${C.line};border-radius:10px;overflow:hidden}
      .pt-stage{padding:12px 14px;border-right:1px solid ${C.line};background:${C.raised}}
      .pt-stage:last-child{border-right:0}
      .pt-hb{display:grid;grid-template-columns:150px 1fr 56px;gap:12px;align-items:center;font-size:13.5px}
      .pt-kv{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}

      .pt-table{width:100%;border-collapse:collapse;font-size:13.5px}
      .pt-table th{font-family:${FM};font-size:11px;color:${C.mute};font-weight:500;text-align:left;padding:8px 10px 8px 0;border-bottom:1px solid ${C.line};letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;cursor:pointer;user-select:none}
      .pt-table th:hover{color:${C.ink2}} .pt-table th[aria-sort]{color:${C.ink}}
      .pt-table th[aria-sort="descending"]::after{content:" ↓"} .pt-table th[aria-sort="ascending"]::after{content:" ↑"}
      .pt-table th.static{cursor:default}
      .pt-table td{padding:10px 10px 10px 0;border-bottom:1px solid ${C.line2};vertical-align:middle}
      .pt-table tbody tr.click{cursor:pointer} .pt-table tbody tr.click:hover td{background:rgba(242,243,245,.025)}
      .pt-table tr:last-child td{border-bottom:0}
      .pt-table tr.late td:first-child{box-shadow:inset 2px 0 0 ${accent.accentLine};padding-left:10px}
      .pt-table td.r,.pt-table th.r{text-align:right;padding-right:0}

      .pt-tl-day{display:grid;grid-template-columns:120px 1fr;gap:18px;padding:0 0 22px;position:relative}
      .pt-tl-date{position:sticky;top:70px;align-self:start;font-family:${FM};font-size:12.5px;color:${C.ink2};padding-top:2px}
      .pt-tl-stops{position:relative;padding-left:22px;border-left:1px solid ${C.line};display:flex;flex-direction:column;gap:9px}
      .pt-stop{position:relative;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start}
      .pt-stop::before{content:"";position:absolute;left:-27px;top:7px;width:9px;height:9px;border-radius:50%;background:${C.bg};border:1.5px solid ${C.mute}}
      .pt-stop.win::before{background:${C.bar};border-color:${C.bar};box-shadow:0 0 0 3px rgba(242,243,245,.12)}

      .pt-curve{fill:none;stroke:${C.bar};stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round;filter:drop-shadow(0 0 6px rgba(242,243,245,.35))}
      .pt-prior{fill:none;stroke:${C.ghost};stroke-width:1.5;stroke-dasharray:5 5}
      .pt-end{fill:${C.bar};filter:drop-shadow(0 0 8px rgba(242,243,245,.7))}
      .pt-chart text{font-family:${FM};fill:${C.mute};font-size:11px}
      .pt-hit{fill:transparent}

      .pt-scrim{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(3px);z-index:40;display:flex;justify-content:flex-end}
      .pt-drawer{width:min(620px,100%);height:100%;background:${C.surface};border-left:1px solid ${C.line};padding:22px 24px calc(22px + env(safe-area-inset-bottom,0px));overflow:auto;display:flex;flex-direction:column;gap:14px;font-family:${FS}}
      .pt-file{display:grid;grid-template-columns:1fr auto;gap:10px;padding:11px 0;border-bottom:1px solid ${C.line2};font-size:13.5px;align-items:center}
      .pt-field{display:flex;flex-direction:column;gap:5px;font-size:13px;color:${C.ink2}}
      .pt-field input,.pt-field select,.pt-field textarea{background:${C.raised};border:1px solid ${C.line};border-radius:8px;color:${C.ink};padding:10px 11px;font:inherit;font-size:14px;width:100%}
      .pt-menu button:hover{background:${C.hover}}

      .pt-pin{border-radius:50%;background:${C.bar};position:relative}
      .pt-pin.placed{width:6px;height:6px;opacity:.9}
      .pt-pin.visited{width:5px;height:5px;opacity:.45}
      .pt-pin.earlier{width:4px;height:4px;opacity:.25}
      .pt-pin.ordered::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:1.5px solid ${C.bar};opacity:.8}
      .mapboxgl-ctrl-group{background:${C.raised}!important;border:1px solid ${C.line}!important}
      .mapboxgl-ctrl-group button+button{border-top-color:rgba(255,255,255,.1)!important}
      .mapboxgl-ctrl-icon{filter:invert(.85)}
      .mapboxgl-ctrl-logo{opacity:.4}

      @media (prefers-reduced-motion:no-preference){
        .pt-curve.anim{stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:ptDraw 1.1s cubic-bezier(.4,0,.2,1) forwards}
        .pt-area.anim{opacity:0;animation:ptFade .8s .5s forwards}
        .pt-end.anim,.pt-endlab.anim{opacity:0;animation:ptFade .4s 1s forwards}
        .pt-fbar i{animation:ptGrow .9s cubic-bezier(.4,0,.2,1) backwards}
        .pt-rise{animation:ptRise .4s cubic-bezier(.16,1,.3,1) both}
        .pt-pin.ordered::after{animation:ptPulse 2s ease-out infinite}
        @keyframes ptDraw{to{stroke-dashoffset:0}} @keyframes ptFade{to{opacity:1}} @keyframes ptGrow{from{transform:scaleX(0)}}
        @keyframes ptRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ptPulse{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.4);opacity:0}}
      }
      @media (prefers-reduced-motion:reduce){.pt-root *{transition:none!important;animation:none!important}}

      @media (max-width:980px){
        .pt-m3{grid-template-columns:1fr}.pt-mx{border-right:0;border-bottom:1px solid ${C.line}}.pt-mx:last-child{border-bottom:0}
        .pt-m4{grid-template-columns:1fr 1fr}.pt-ms:nth-child(2){border-right:0}.pt-ms:nth-child(1),.pt-ms:nth-child(2){border-bottom:1px solid ${C.line}}
        .pt-row32,.pt-row2{grid-template-columns:1fr}.pt-id-right{align-items:flex-start}.pt-kv{grid-template-columns:1fr}
        .pt-tl-day{grid-template-columns:1fr;gap:6px}.pt-tl-date{position:static}
        .pt-mx-body{grid-template-columns:1fr;gap:6px}
        .pt-acc-wide{grid-template-columns:1fr;gap:0}.pt-acc-wide h3{margin-top:20px!important}
      }
      @media (max-width:560px){.pt-brand-label{display:none}}
      @media (max-width:560px){
        .pt-val{font-size:36px!important}.pt-stages{grid-template-columns:1fr}.pt-stage{border-right:0;border-bottom:1px solid ${C.line}}.pt-stage:last-child{border-bottom:0}
        .pt-panel{padding:16px}.pt-hb{grid-template-columns:110px 1fr 48px}.pt-search{min-width:0!important;width:100%}
        .pt-drawer{padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))}
      }
    `}</style>
  )
}

// ── Primitives ────────────────────────────────────────────────────────────────

export function Seg<T extends string>({ options, value, onChange, ariaLabel, style }: {
  options: { value: T; label: React.ReactNode; disabled?: boolean; ariaLabel?: string }[]
  value: T | null
  onChange: (v: T) => void
  ariaLabel: string
  style?: React.CSSProperties
}) {
  return (
    <span role="group" aria-label={ariaLabel} style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', background: C.surface, ...style }}>
      {options.map((o, i) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} disabled={o.disabled} aria-label={o.ariaLabel} onClick={() => onChange(o.value)}
          style={{ padding: '7px 12px', fontSize: 13, color: o.disabled ? C.faint : o.value === value ? C.ink : C.ink2, background: o.value === value ? C.raised : 'transparent', borderRight: i < options.length - 1 ? `1px solid ${C.line}` : 0, whiteSpace: 'nowrap', minHeight: 34 }}>
          {o.label}
        </button>
      ))}
    </span>
  )
}

export function Btn({ primary, children, onClick, disabled, style, ariaLabel, type = 'button', title }: {
  primary?: boolean; children: React.ReactNode; onClick?: () => void; disabled?: boolean; style?: React.CSSProperties; ariaLabel?: string; type?: 'button' | 'submit'; title?: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} title={title} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600, minHeight: 36,
        border: `1px solid ${primary ? C.ink : C.line}`, background: primary ? (hover ? '#fff' : C.ink) : (hover ? C.raised : C.surface), color: primary ? '#0b0c0f' : C.ink,
        opacity: disabled ? 0.6 : 1, whiteSpace: 'nowrap', ...style,
      }}>
      {children}
    </button>
  )
}

export function Tag({ kind = 'plain', children, accent }: { kind?: 'plain' | 'solid' | 'acc' | 'warn'; children: React.ReactNode; accent?: Accent }) {
  const s: React.CSSProperties = { display: 'inline-block', fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 5, letterSpacing: '.03em', fontFamily: FM, border: `1px solid ${C.line}`, color: C.ink2, whiteSpace: 'nowrap' }
  if (kind === 'solid') Object.assign(s, { background: C.ink, color: '#0b0c0f', borderColor: C.ink })
  if (kind === 'acc' && accent) Object.assign(s, { background: accent.accentSoft, color: accent.accentInk, borderColor: 'transparent' })
  if (kind === 'warn') Object.assign(s, { borderColor: 'rgba(240,163,145,.4)', color: C.dn })
  return <span style={s}>{children}</span>
}

export function Panel({ title, sub, right, children, className, style, ariaLabel }: {
  title?: string; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; style?: React.CSSProperties; ariaLabel?: string
}) {
  return (
    <section className={`pt-panel ${className || ''}`} style={style} aria-label={ariaLabel || title}>
      {(title || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            {title && <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>}
            {sub && <div style={{ fontSize: 13, color: C.mute, marginTop: 3 }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <h3 style={{ ...upperLabel, fontSize: 11.5, letterSpacing: '.05em', margin: '20px 0 10px', ...style }}>{children}</h3>
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '26px 0', color: C.mute, fontSize: 13.5, textAlign: 'center' }}>{children}</div>
}

export function ShowMore({ total, shown, open, onToggle }: { total: number; shown: number; open: boolean; onToggle: () => void }) {
  if (total <= shown && !open) return null
  return (
    <div style={{ marginTop: 12, textAlign: 'center' }}>
      <button type="button" onClick={onToggle} style={{ fontSize: 13, color: C.ink2, padding: '8px 14px', border: `1px solid ${C.line}`, borderRadius: 8 }}>{open ? 'Show fewer' : `Show all ${total}`}</button>
    </div>
  )
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Count-up on first render only (800 ms, ease-out cubic); later changes snap.
export function CountUp({ value, prefix = '', style, className }: { value: number; prefix?: string; style?: React.CSSProperties; className?: string }) {
  const first = useRef(true)
  const [shown, setShown] = useState<number>(() => (prefersReducedMotion() ? value : 0))
  useEffect(() => {
    if (!first.current || prefersReducedMotion() || !value) { first.current = false; setShown(value); return }
    first.current = false
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 800)
      const e = 1 - Math.pow(1 - k, 3)
      setShown(Math.round(value * e))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className={className} style={{ ...mono, ...style }}>{prefix}{Math.round(shown).toLocaleString('en-US')}</span>
}

export function DeltaText({ d, unit = 'count', compareLabel }: { d: Delta; unit?: 'count' | 'dollars'; compareLabel: string }) {
  const color = d.dir === 'up' ? C.up : d.dir === 'down' ? C.dn : C.mute
  return (
    <span style={{ fontSize: 12.5, color: C.mute, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ ...mono, fontWeight: 500, fontSize: 12.5, color }}>{formatDelta(d, unit)}</span>
      <span>vs {compareLabel}</span>
    </span>
  )
}

export function Sparkline({ values, labels }: { values: number[]; labels: string[] }) {
  const w = 200, h = 64
  const mx = Math.max(1, ...values)
  const n = Math.max(2, values.length)
  const pts = values.map((v, i) => [i * (w / (n - 1)), h - 10 - (v / mx) * (h - 16)] as [number, number])
  const line = 'M' + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')
  const last = pts[pts.length - 1]
  const labelIdx = [0, Math.floor((labels.length - 1) / 2), labels.length - 1].filter((v, i, a) => a.indexOf(v) === i)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: 64, display: 'block', overflow: 'visible' }}>
      <path d={`${line}L${w},${h - 10}L0,${h - 10}Z`} fill={C.bar} opacity={0.08} />
      <path d={line} fill="none" stroke={C.bar} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {last && <circle cx={Math.min(197, last[0])} cy={last[1]} r={2.5} fill={C.bar} />}
      {labelIdx.map(i => (
        <text key={i} x={i * (w / (n - 1))} y={h - 1} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} style={{ fontFamily: FM, fontSize: 9, fill: C.mute }}>{labels[i]}</text>
      ))}
    </svg>
  )
}

// ── Measures ──────────────────────────────────────────────────────────────────

export function Measure({ label, value, prefix, d, unit, compareLabel, spark, sparkLabels, foot }: {
  label: string; value: number; prefix?: string; d: Delta; unit?: 'count' | 'dollars'; compareLabel: string; spark: number[]; sparkLabels: string[]; foot: string
}) {
  return (
    <div className="pt-mx">
      <div style={{ fontSize: 13.5, color: C.ink2, fontWeight: 500 }}>{label}</div>
      <div className="pt-mx-body">
        <div className="pt-mx-num">
          <CountUp value={value} prefix={prefix} className="pt-val" style={{ fontSize: 44, lineHeight: 1, fontWeight: 500, letterSpacing: '-0.03em' }} />
          <DeltaText d={d} unit={unit} compareLabel={compareLabel} />
        </div>
        <Sparkline values={spark} labels={sparkLabels} />
      </div>
      <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.4 }}>{foot}</div>
    </div>
  )
}

export function SecondaryCell({ k, v, small }: { k: string; v: number; small?: string }) {
  return (
    <div className="pt-ms">
      <span style={{ fontSize: 12.5, color: C.mute }}>{k}</span>
      <span style={{ ...mono, fontSize: 22, fontWeight: 500, lineHeight: 1.1 }}>
        {v.toLocaleString('en-US')}
        {small && <small style={{ fontSize: 12, color: C.mute, marginLeft: 6, fontWeight: 400, fontFamily: FS }}>{small}</small>}
      </span>
    </div>
  )
}

export function MeasuresBlock({ report }: { report: PeriodReport }) {
  const { range, measures, sparklines, allTime, active } = report
  const mon = report.trackingStartMon || '—'
  return (
    <section aria-label="Key measures" style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: C.surface, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: `1px solid ${C.line}`, gap: 12, flexWrap: 'wrap' }}>
        <span style={{ ...upperLabel, fontSize: 12, letterSpacing: '.05em' }}>{range.labelToDate}</span>
        {report.trackingStartLabel && <span style={{ ...upperLabel, fontSize: 12, letterSpacing: '.05em' }}>Tracking since {report.trackingStartLabel}</span>}
      </div>
      <div className="pt-m3">
        <Measure label="Accounts worked" value={measures.accountsWorked.current} d={measures.accountsWorked} compareLabel={range.compareLabel}
          spark={sparklines.accountsWorked} sparkLabels={sparklines.months.map(m => m.label)}
          foot={`${measures.orderedAccounts.toLocaleString('en-US')} ordered · ${measures.visitedInPerson.toLocaleString('en-US')} visited`} />
        <Measure label="Orders" value={measures.orders.current} d={measures.orders} compareLabel={range.compareLabel}
          spark={sparklines.orders} sparkLabels={sparklines.months.map(m => m.label)}
          foot={`${allTime.orders.toLocaleString('en-US')} orders since ${mon} · ${allTime.orderingAccounts.toLocaleString('en-US')} accounts have ordered`} />
        <Measure label="Order value" value={Math.round(measures.orderValue.current)} prefix="$" d={measures.orderValue} unit="dollars" compareLabel={range.compareLabel}
          spark={sparklines.orderValue} sparkLabels={sparklines.months.map(m => m.label)}
          foot={`${money(allTime.value)} since ${mon} · ${money(allTime.avgOrder)} average order`} />
      </div>
      <div className="pt-m4">
        <SecondaryCell k="Active accounts" v={active.accounts} small="ordered in the last 90 days" />
        <SecondaryCell k="Reordering accounts" v={active.reorderingAccounts} small={`of ${active.orderingAccounts} that ordered`} />
        <SecondaryCell k="New accounts" v={active.newAccounts} small={range.label} />
        <SecondaryCell k="Tastings held" v={active.tastings} small={range.label} />
      </div>
    </section>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

export function Tip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  const left = typeof window !== 'undefined' ? Math.min(window.innerWidth - 280, x + 14) : x + 14
  return (
    <div role="tooltip" style={{ position: 'fixed', left, top: y + 14, pointerEvents: 'none', background: '#1e2229', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: C.ink, boxShadow: '0 8px 24px rgba(0,0,0,.45)', zIndex: 50, maxWidth: 260, lineHeight: 1.45 }}>
      {children}
    </div>
  )
}

// ── Cumulative order value chart ──────────────────────────────────────────────

export function CumulativeChart({ report }: { report: PeriodReport }) {
  const { range, cumulative } = report
  const W = 760, H = 320, L = 56, R = 22, T = 22, B = 34
  const n = Math.max(2, cumulative.axisDays)
  const cur = cumulative.current, pri = cumulative.prior
  const lastCur = cur.length ? cur[cur.length - 1].value : 0
  const lastPri = pri.length ? pri[pri.length - 1].value : 0
  const mx = Math.max(1, lastCur, lastPri) * 1.12
  const x = (i: number) => L + (W - L - R) * (i / (n - 1))
  const y = (v: number) => T + (H - T - B) * (1 - v / mx)
  const path = (arr: { value: number }[]) => arr.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const ticks = [mx / 3, (mx * 2) / 3, mx]
  const labelEvery = range.mode === 'month' ? 7 : range.mode === 'quarter' ? 14 : range.mode === '30d' ? 7 : Math.max(1, Math.ceil(n / 7))
  const xLabels: number[] = []
  for (let i = 0; i < n; i += labelEvery) xLabels.push(i)
  const curPath = path(cur)
  const curveRef = useRef<SVGPathElement>(null)
  const [len, setLen] = useState<number>(4000)
  useEffect(() => { if (curveRef.current) setLen(Math.ceil(curveRef.current.getTotalLength()) + 10) }, [curPath])
  const [hover, setHover] = useState<{ i: number; cx: number; cy: number } | null>(null)
  const hitRef = useRef<SVGRectElement>(null)
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = hitRef.current?.ownerSVGElement
    if (!svg || !cur.length) return
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const ctm = svg.getScreenCTM(); if (!ctm) return
    const p = pt.matrixTransform(ctm.inverse())
    const i = Math.max(0, Math.min(cur.length - 1, Math.round(((p.x - L) / (W - L - R)) * (n - 1))))
    setHover({ i, cx: e.clientX, cy: e.clientY })
  }
  const compareCap = range.compareLabel.charAt(0).toUpperCase() + range.compareLabel.slice(1)
  const sub = `${money(lastCur)} across ${report.orders.length} order${report.orders.length === 1 ? '' : 's'}${range.partial ? ' so far' : ''}`
  return (
    <Panel title="Order value" sub={sub} className="pt-chartpanel" style={{ display: 'flex', flexDirection: 'column' }}
      right={(
        <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: C.ink2, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><i style={{ width: 16, borderTop: `2px solid ${C.bar}`, display: 'inline-block' }} />{range.labelToDate}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><i style={{ width: 16, borderTop: `2px dashed ${C.ghost}`, display: 'inline-block' }} />{compareCap}</span>
        </div>
      )}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative' }}>
        <svg key={range.hash} className="pt-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative order value through the period" style={{ width: '100%', height: 'auto', minHeight: 220, display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="ptga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2f3f5" stopOpacity=".16" /><stop offset="1" stopColor="#f2f3f5" stopOpacity="0" /></linearGradient>
          </defs>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={C.line2} />
              <text x={L - 10} y={y(t) + 4} textAnchor="end">{moneyK(t)}</text>
            </g>
          ))}
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={C.line} />
          {xLabels.map(i => <text key={i} x={x(i)} y={H - 12} textAnchor="middle">{fmtShort(i < cumulative.axisDays ? addDaysKey(range.startKey, i) : range.fullEndKey)}</text>)}
          {pri.length > 1 && <path className="pt-prior" d={path(pri)} />}
          {pri.length > 0 && <text x={x(pri.length - 1) + 6} y={y(lastPri) + 4} style={{ fill: C.mute }}>{moneyK(lastPri)}</text>}
          {cur.length > 1 && <path className="pt-area anim" d={`${curPath}L${x(cur.length - 1).toFixed(1)},${y(0)}L${L},${y(0)}Z`} fill="url(#ptga)" />}
          {cur.length > 0 && <path ref={curveRef} className="pt-curve anim" style={{ ['--len' as string]: len }} d={cur.length > 1 ? curPath : `${curPath}L${x(0) + 0.1},${y(cur[0].value)}`} />}
          {cur.length > 0 && (
            <>
              <circle className="pt-end anim" cx={x(cur.length - 1)} cy={y(lastCur)} r={4.5} />
              <text className="pt-endlab anim" x={Math.min(W - R - 4, x(cur.length - 1))} y={y(lastCur) - 12} textAnchor="end" style={{ fill: C.ink, fontWeight: 500, fontSize: 12 }}>{money(lastCur)}</text>
            </>
          )}
          {hover && cur[hover.i] && (
            <g>
              <line x1={x(hover.i)} x2={x(hover.i)} y1={T} y2={y(0)} stroke="rgba(242,243,245,.35)" strokeDasharray="3 3" />
              <circle cx={x(hover.i)} cy={y(cur[hover.i].value)} r={4} fill={C.ink} />
            </g>
          )}
          <rect ref={hitRef} className="pt-hit" x={L} y={T} width={W - L - R} height={H - T - B} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
        {hover && cur[hover.i] && (
          <Tip x={hover.cx} y={hover.cy}>
            <b>{fmtShort(cur[hover.i].date)}</b> · {money(cur[hover.i].value)} to date
            {cur[hover.i].orders > 0 && <><br />{cur[hover.i].orders} order{cur[hover.i].orders > 1 ? 's' : ''} this day</>}
            {pri[hover.i] && <><br /><span style={{ color: C.ink2 }}>{compareCap} at this point: {money(pri[hover.i].value)}</span></>}
          </Tip>
        )}
      </div>
    </Panel>
  )
}
function addDaysKey(key: string, n: number): string { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// ── Funnel ────────────────────────────────────────────────────────────────────

export function Funnel({ report }: { report: PeriodReport }) {
  const { funnel, range } = report
  const denom = Math.max(1, funnel.worked, funnel.ordered)
  const rows = [
    { label: 'Accounts worked', n: funnel.worked, small: `${funnel.visitedInPerson} visited · ${funnel.priorWorked} in the ${range.compareLabel}` },
    { label: 'Placed an order', n: funnel.ordered, small: `${funnel.firstTime} ordering for the first time · ${funnel.priorOrdered} in the ${range.compareLabel}` },
    { label: 'Have ordered more than once', n: funnel.repeat, small: `of the ${funnel.ordered} that ordered` },
  ]
  return (
    <Panel title="From account to order" sub={funnel.conversionPct === null ? undefined : `${funnel.conversionPct}% of accounts worked placed an order`} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13.5, color: C.ink2 }}>
              <span>{r.label}</span><b style={{ ...mono, fontSize: 22, color: C.ink, fontWeight: 500 }}>{r.n}</b>
            </div>
            <div className="pt-fbar" style={{ height: 14, borderRadius: 4, background: C.line2, overflow: 'hidden' }}>
              <i style={{ display: 'block', height: '100%', background: C.bar, borderRadius: 4, transformOrigin: 'left', width: `${Math.min(100, (r.n / denom) * 100)}%`, animationDelay: `${i * 120}ms` }} />
            </div>
            <small style={{ fontSize: 12, color: C.mute }}>{r.small}</small>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// ── Ledger ────────────────────────────────────────────────────────────────────

type LedgerTab = 'accounts' | 'orders' | 'products'
type Scope = 'period' | 'all'

export function Ledger({ report, firm, onOpenAccount }: { report: PeriodReport; firm: boolean; onOpenAccount: (id: string) => void }) {
  const [tab, setTab] = useState<LedgerTab>('accounts')
  const [scope, setScope] = useState<Scope>('period')
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('value')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const [all, setAll] = useState(false)
  const { range } = report
  const scoped = scope === 'period'
  const accounts = scoped ? report.accountsLedger.period : report.accountsLedger.all
  const orders = scoped ? report.ordersLedger.period : report.ordersLedger.all
  const products = scoped ? report.productsLedger.period : report.productsLedger.all
  const dist = scoped ? report.distributorOrders.period : report.distributorOrders.all
  const sinceLabel = report.trackingStart ? `Since ${report.trackingStart.slice(0, 4) ? new Date(report.trackingStart + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }) : ''}` : 'All time'

  const pick = (t: LedgerTab) => { setTab(t); setSortKey(t === 'orders' ? 'date' : 'value'); setSortDir(-1); setAll(false) }
  const sortBy = (k: string, textual = false) => {
    if (sortKey === k) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(k); setSortDir(textual ? 1 : -1) }
  }
  const cmp = (a: string | number | null, b: string | number | null) => {
    if (typeof a === 'string' || typeof b === 'string') return String(a ?? '').localeCompare(String(b ?? '')) * sortDir
    return ((a ?? 0) as number - ((b ?? 0) as number)) * sortDir
  }
  const query = q.trim().toLowerCase()

  const th = (key: string, label: string, right?: boolean, textual?: boolean) => (
    <th key={key} className={right ? 'r' : ''} aria-sort={sortKey === key ? (sortDir < 0 ? 'descending' : 'ascending') : undefined} onClick={() => sortBy(key, textual)} scope="col">{label}</th>
  )

  let head: React.ReactNode = null, rows: React.ReactNode[] = [], sub = ''
  if (tab === 'accounts') {
    const keyOf: Record<string, (r: AccountRow) => string | number | null> = {
      name: r => r.name, last: r => r.lastVisit || '', visits: r => r.visits, orders: r => r.orders, value: r => r.value, all: r => r.allTimeValue, lastOrder: r => r.lastOrder || '',
      frequency: r => (r.frequency ? r.frequency.sinceDays - r.frequency.avgGapDays : -Infinity),
    }
    const list = accounts.filter(r => r.name.toLowerCase().includes(query)).sort((a, b) => cmp((keyOf[sortKey] || keyOf.value)(a), (keyOf[sortKey] || keyOf.value)(b)))
    const mxv = Math.max(1, ...list.map(r => (scoped ? r.value : r.allTimeValue)))
    sub = `${list.length} account${list.length === 1 ? '' : 's'} · ${list.filter(r => r.orders > 0).length} ordered`
    head = (
      <tr>
        {th('name', 'Account', false, true)}{th('last', 'Last visit', true)}{th('visits', 'Visits', true)}{th('orders', 'Orders', true)}{th('value', 'Value', true)}
        {scoped && th('all', 'All-time', true)}{th('lastOrder', 'Last order', true)}{firm && th('frequency', 'Order frequency', true)}
      </tr>
    )
    rows = list.map(r => (
      <tr key={r.id} className={`click${firm && r.frequency?.late ? ' late' : ''}`} onClick={() => onOpenAccount(r.id)}>
        <td>{r.name}<span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1 }}>{r.type === 'off_premise' ? 'Retail' : 'On-premise'}</span></td>
        <td className="r" style={{ ...mono, color: C.ink2, whiteSpace: 'nowrap' }}>{r.lastVisit ? (scoped ? fmtShort(r.lastVisit) : fmtShortYear(r.lastVisit)) : '—'}</td>
        <td className="r" style={mono}>{r.visits || '—'}</td>
        <td className="r" style={mono}>{r.orders || '—'}</td>
        <td className="r" style={{ ...mono, whiteSpace: 'nowrap' }}>{r.value ? money(r.value) : '—'}<span style={{ display: 'inline-block', height: 5, borderRadius: 3, background: C.bar2, verticalAlign: 'middle', marginLeft: 10, opacity: .7, width: Math.max(2, ((scoped ? r.value : r.allTimeValue) / mxv) * 60) }} /></td>
        {scoped && <td className="r" style={{ ...mono, color: C.ink2 }}>{r.allTimeValue ? money(r.allTimeValue) : '—'}</td>}
        <td className="r" style={{ ...mono, color: C.ink2, whiteSpace: 'nowrap' }}>{r.lastOrder ? (scoped ? fmtShort(r.lastOrder) : fmtShortYear(r.lastOrder)) : '—'}</td>
        {firm && (
          <td className="r" style={{ ...mono, whiteSpace: 'nowrap', fontSize: 12.5, color: r.frequency?.late ? C.ink : C.mute }}>
            {r.frequency ? `every ${r.frequency.avgGapDays} days · last ${r.frequency.sinceDays}d ago` : ''}
          </td>
        )}
      </tr>
    ))
  } else if (tab === 'orders') {
    const keyOf: Record<string, (r: OrderRow) => string | number> = { date: r => r.date, po: r => r.po, account: r => r.accountName, value: r => r.total }
    const list = orders.filter(r => r.accountName.toLowerCase().includes(query) || r.products.toLowerCase().includes(query) || r.po.toLowerCase().includes(query))
      .sort((a, b) => cmp((keyOf[sortKey] || keyOf.date)(a), (keyOf[sortKey] || keyOf.date)(b)))
    sub = `${list.length} order${list.length === 1 ? '' : 's'} · ${money(list.reduce((s, r) => s + r.total, 0))}`
    head = <tr>{th('date', 'Date')}{th('po', 'PO', false, true)}{th('account', 'Account', false, true)}<th className="static" scope="col">Products</th>{th('value', 'Total', true)}<th className="r static" scope="col">Status</th></tr>
    rows = list.map(r => (
      <tr key={r.id} className="click" onClick={() => onOpenAccount(r.accountId)}>
        <td style={{ ...mono, color: C.ink2, whiteSpace: 'nowrap' }}>{scoped ? fmtShort(r.date) : fmtShortYear(r.date)}</td>
        <td style={{ ...mono, color: C.mute, whiteSpace: 'nowrap' }}>{r.po || '—'}</td>
        <td>{r.accountName}</td>
        <td style={{ color: C.ink2, fontSize: 13 }}>{r.products}</td>
        <td className="r" style={{ ...mono, whiteSpace: 'nowrap' }}>{money(r.total)}</td>
        <td className="r"><Tag kind={r.statusLabel === 'Fulfilled' ? 'solid' : 'plain'}>{r.statusLabel}</Tag></td>
      </tr>
    ))
  } else {
    const keyOf: Record<string, (r: ProductRow) => string | number> = { name: r => r.name, cases: r => r.cases + r.bottles / 1000, value: r => r.value, accts: r => r.accounts, active: r => r.activeAt }
    const list = products.filter(r => r.name.toLowerCase().includes(query)).sort((a, b) => cmp((keyOf[sortKey] || keyOf.value)(a), (keyOf[sortKey] || keyOf.value)(b)))
    const mxc = Math.max(1, ...list.map(r => r.cases))
    const cases = list.reduce((s, r) => s + r.cases, 0), bottles = list.reduce((s, r) => s + r.bottles, 0)
    sub = `${cases} case${cases === 1 ? '' : 's'}${bottles ? `, ${bottles} bottle${bottles === 1 ? '' : 's'}` : ''} · ${list.length} product${list.length === 1 ? '' : 's'}`
    head = <tr>{th('name', 'Product', false, true)}{th('cases', 'Cases', true)}{th('value', 'Value', true)}{th('accts', 'Accounts ordering', true)}{th('active', 'Active at', true)}</tr>
    rows = list.map(r => (
      <tr key={r.name + (r.retail ? '-r' : '')}>
        <td>{r.name}{r.retail && <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1 }}>Retail size</span>}</td>
        <td className="r" style={{ ...mono, whiteSpace: 'nowrap' }}>
          {r.cases || (r.bottles ? '' : '—')}{r.bottles ? <span style={{ color: C.ink2 }}>{r.cases ? ' + ' : ''}{r.bottles} btl</span> : ''}
          <span style={{ display: 'inline-block', height: 5, borderRadius: 3, background: C.bar2, verticalAlign: 'middle', marginLeft: 10, opacity: .7, width: Math.max(2, (r.cases / mxc) * 60) }} />
        </td>
        <td className="r" style={{ ...mono, whiteSpace: 'nowrap' }}>{money(r.value)}</td>
        <td className="r" style={mono}>{r.accounts}</td>
        <td className="r" style={mono}>{r.activeAt || '—'}</td>
      </tr>
    ))
  }
  const shown = all ? rows : rows.slice(0, 12)
  const counts = { accounts: accounts.length, orders: orders.length, products: products.length }
  return (
    <Panel ariaLabel="Accounts, orders and products" style={{ paddingTop: 10 }}>
      <div role="tablist" style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.line}`, margin: '0 0 4px' }}>
        {(['accounts', 'orders', 'products'] as LedgerTab[]).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => pick(t)}
            style={{ padding: '10px 14px', fontSize: 13.5, color: tab === t ? C.ink : C.mute, borderBottom: `2px solid ${tab === t ? C.ink : 'transparent'}`, marginBottom: -1, fontWeight: 500 }}>
            {t === 'accounts' ? 'Accounts' : t === 'orders' ? 'Orders' : 'Products'}<small style={{ color: C.mute, fontFamily: FM, fontSize: 11.5, marginLeft: 6 }}>{counts[t]}</small>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '12px 0' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Seg ariaLabel="Range" value={scope} onChange={s => { setScope(s); setAll(false) }} options={[{ value: 'period', label: range.label }, { value: 'all', label: sinceLabel }]} />
          <input className="pt-search" value={q} onChange={e => { setQ(e.target.value); setAll(false) }} placeholder="Search accounts or products" aria-label="Search"
            style={{ background: C.raised, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, padding: '8px 11px', fontSize: 13.5, minWidth: 220 }} />
        </div>
        <span style={{ fontSize: 13, color: C.mute }}>{sub}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        {rows.length ? <table className="pt-table"><thead>{head}</thead><tbody>{shown}</tbody></table> : <Empty>Nothing matches.</Empty>}
      </div>
      <ShowMore total={rows.length} shown={12} open={all} onToggle={() => setAll(v => !v)} />
      {tab === 'accounts' && dist.count > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line2}`, fontSize: 13, color: C.mute }}>
          Distributor orders · <span style={{ ...mono, color: C.ink2 }}>{dist.count}</span> · <span style={{ ...mono, color: C.ink2 }}>{money(dist.value)}</span>
        </div>
      )}
    </Panel>
  )
}

// ── Accounts (derived from order history, never the placements table) ──────────

export function AccountsPanel({ report, wide }: { report: PeriodReport; wide?: boolean }) {
  const { active, range } = report
  const mx = Math.max(1, ...active.byProduct.map(p => p.accounts))
  const cells = [
    { k: 'Active', v: active.accounts, hint: 'Ordered in the last 90 days' },
    { k: 'Reordering', v: active.reorderingAccounts, hint: 'Two or more orders, all time' },
    { k: 'New', v: active.newAccounts, hint: `First order in ${range.label}` },
  ]
  return (
    <Panel title="Accounts" sub={`${active.accounts} account${active.accounts === 1 ? '' : 's'} ordered in the last 90 days`}>
      <div className={wide ? 'pt-acc-wide' : undefined}>
      <div className="pt-stages">
        {cells.map(s => (
          <div key={s.k} className="pt-stage">
            <div style={{ fontSize: 12.5, color: C.ink2 }}>{s.k}</div>
            <div style={{ ...mono, fontSize: 26, fontWeight: 500, margin: '3px 0 1px' }}>{s.v}</div>
            <small style={{ fontSize: 11.5, color: C.mute }}>{s.hint}</small>
          </div>
        ))}
      </div>
      <div>
      <SectionLabel>By product</SectionLabel>
      {active.byProduct.length === 0 ? <div style={{ fontSize: 13, color: C.mute }}>No orders in the last 90 days.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {active.byProduct.map(p => (
            <div key={p.name + (p.retail ? '-r' : '')} className="pt-hb">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}{p.retail && <span style={{ color: C.mute }}> · retail</span>}</span>
              <div style={{ height: 8, background: C.line2, borderRadius: 3, overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', background: C.bar2, borderRadius: '0 3px 3px 0', width: `${(p.accounts / mx) * 100}%` }} /></div>
              <span style={{ ...mono, textAlign: 'right', fontWeight: 500 }}>{p.accounts}</span>
            </div>
          ))}
        </div>
      )}
      </div>
      </div>
    </Panel>
  )
}

// ── Tastings and events ───────────────────────────────────────────────────────

export function EventsPanel({ report }: { report: PeriodReport }) {
  const [all, setAll] = useState(false)
  const { events, eventSummary } = report
  // Hidden entirely when the period has no events: nothing is faked.
  if (events.length === 0) return null
  const sub = `${eventSummary.tastings} tasting${eventSummary.tastings === 1 ? '' : 's'}, ${eventSummary.consumers} consumer${eventSummary.consumers === 1 ? '' : 's'} signed up · ${eventSummary.other} other event${eventSummary.other === 1 ? '' : 's'}`
  const shown = all ? events : events.slice(0, 7)
  return (
    <Panel title="Tastings and events" sub={sub}>
      {(
        <table className="pt-table"><tbody>
          {shown.map(e => (
            <tr key={e.id}>
              <td style={{ ...mono, width: 70, color: C.mute, fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtShort(e.date)}</td>
              <td>{e.account}<span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1 }}>{e.typeLabel}</span></td>
              <td className="r" style={mono}>{e.type === 'tasting' ? <>{e.consumers} <span style={{ color: C.mute, fontFamily: FS, fontSize: 12 }}>signed up</span></> : ''}</td>
            </tr>
          ))}
        </tbody></table>
      )}
      <ShowMore total={events.length} shown={7} open={all} onToggle={() => setAll(v => !v)} />
    </Panel>
  )
}

// ── Field activity timeline ───────────────────────────────────────────────────

type FeedFilter = 'all' | 'orders' | 'visits'

export function Timeline({ report, firm }: { report: PeriodReport; firm: boolean }) {
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [all, setAll] = useState(false)
  const { range } = report
  const isWin = (s: TimelineStop) => s.kind === 'order'
  const days = useMemo(() => report.timeline.map(d => ({ ...d, stops: d.stops.filter(s => filter === 'all' || (filter === 'orders' ? isWin(s) : !isWin(s))) })).filter(d => d.stops.length), [report.timeline, filter])
  const total = days.reduce((s, d) => s + d.stops.length, 0)
  let budget = all ? Infinity : 16
  const visible = days.map(d => { const take = d.stops.slice(0, Math.max(0, budget)); budget -= take.length; return { ...d, stops: take } }).filter(d => d.stops.length)
  return (
    <Panel title="Field activity" sub={`${report.measures.visits} visit${report.measures.visits === 1 ? '' : 's'} · ${report.orders.length} order${report.orders.length === 1 ? '' : 's'} in ${range.label}`}
      right={<Seg ariaLabel="Show" value={filter} onChange={f => { setFilter(f); setAll(false) }} options={[{ value: 'all', label: 'Everything' }, { value: 'orders', label: 'Orders' }, { value: 'visits', label: 'Visits only' }]} />}>
      {visible.length === 0 ? <Empty>Nothing in this range.</Empty> : (
        <div style={{ paddingLeft: 4 }}>
          {visible.map(d => (
            <div key={d.date} className="pt-tl-day">
              <div className="pt-tl-date">
                {d.weekday}
                <small style={{ display: 'block', color: C.mute, fontSize: 11.5, marginTop: 2 }}>{d.label} · {d.stops.length} stop{d.stops.length === 1 ? '' : 's'}{d.orderTotal ? ` · ${money(d.orderTotal)}` : ''}</small>
              </div>
              <div className="pt-tl-stops">
                {d.stops.map(s => (
                  <div key={s.id} className={`pt-stop ${isWin(s) ? 'win' : ''}`}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {s.name}
                        <small style={{ fontWeight: 400, color: C.mute, fontSize: 12, marginLeft: 6 }}>
                          {s.type === 'off_premise' ? 'retail' : 'on-premise'}{firm && (s.rep || s.status) ? ` · ${[s.rep, s.status].filter(Boolean).join(' · ')}` : ''}
                        </small>
                      </div>
                      <div style={{ fontSize: 13.5, color: C.ink2, marginTop: 2, lineHeight: 1.45 }}>
                        {s.label && <b style={{ color: C.ink, fontWeight: 500 }}>{s.label}</b>}{s.label && s.text ? (s.kind === 'order' ? ' ' : ' · ') : ''}{s.text}
                      </div>
                    </div>
                    <span style={{ ...mono, fontSize: 13, color: C.ink, whiteSpace: 'nowrap', paddingTop: 1 }}>{s.amount ? money(s.amount) : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <ShowMore total={total} shown={16} open={all} onToggle={() => setAll(v => !v)} />
    </Panel>
  )
}

// ── Drawer (scrim, escape, focus trap) ────────────────────────────────────────

export function Drawer({ title, sub, onClose, children }: { title: string; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const root = ref.current
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') || [])
    focusables()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab') return
      const f = focusables(); if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; prev?.focus?.() }
  }, [onClose])
  return (
    <div className="pt-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside ref={ref} className="pt-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{title}</h2>
            {sub && <div style={{ color: C.mute, fontSize: 13, marginTop: 2 }}>{sub}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, border: `1px solid ${C.line}`, borderRadius: 8, display: 'grid', placeItems: 'center', color: C.ink2, flexShrink: 0 }}>✕</button>
        </header>
        {children}
      </aside>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="pt-field"><span>{label}</span>{children}</label>
}

// ── Account drawer ────────────────────────────────────────────────────────────

export function AccountDrawer({ detail, firm, onClose }: { detail: AccountDetail; firm: boolean; onClose: () => void }) {
  return (
    <Drawer title={detail.name} sub={`${detail.type === 'off_premise' ? 'Retail' : 'On-premise'} · first visited ${detail.firstVisit ? fmtShortYear(detail.firstVisit) : '—'}`} onClose={onClose}>
      <div className="pt-kv">
        {[['Orders, all time', String(detail.ordersAllTime)], ['Value, all time', money(detail.valueAllTime)], ['Last order', detail.lastOrder ? fmtShortYear(detail.lastOrder) : '—']].map(([k, v]) => (
          <div key={k} style={{ background: C.raised, border: `1px solid ${C.line}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, color: C.mute }}>{k}</div><div style={{ ...mono, fontSize: k === 'Last order' ? 17 : 22, fontWeight: 500, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      {detail.products.length > 0 && (
        <div>
          <SectionLabel style={{ marginTop: 6 }}>Products ordered</SectionLabel>
          {detail.products.map(p => (
            <div key={p.name + (p.retail ? '-r' : '')} className="pt-file"><div>{p.name}{p.retail ? ' · retail' : ''}<small style={{ display: 'block', color: C.mute, fontSize: 12, marginTop: 2 }}>last ordered {fmtShortYear(p.lastOrdered)}</small></div><span style={mono}>{unitLabel(p)}</span></div>
          ))}
        </div>
      )}
      <div>
        <SectionLabel style={{ marginTop: 6 }}>Orders</SectionLabel>
        {detail.orders.length === 0 ? <Empty>No orders yet.</Empty> : detail.orders.map(o => (
          <div key={o.id} className="pt-file"><div>{o.products}<small style={{ display: 'block', color: C.mute, fontSize: 12, marginTop: 2 }}>{fmtShortYear(o.date)}{o.po ? ` · ${o.po}` : ''} · {o.statusLabel}</small></div><span style={mono}>{money(o.total)}</span></div>
        ))}
      </div>
      <div>
        <SectionLabel style={{ marginTop: 6 }}>Visits</SectionLabel>
        {detail.visits.length === 0 ? <Empty>No visits yet.</Empty> : detail.visits.map(v => (
          <div key={v.id} className="pt-file">
            <div>{v.notes || <span style={{ color: C.mute }}>No note</span>}<small style={{ display: 'block', color: C.mute, fontSize: 12, marginTop: 2 }}>{fmtShortYear(v.date)}{firm && v.rep ? ` · ${v.rep}` : ''}</small></div>
            <Tag kind={v.win ? 'solid' : 'plain'}>{firm ? v.status : v.label}</Tag>
          </div>
        ))}
      </div>
    </Drawer>
  )
}

// ── Report preview (HTML twin of the PDF) ─────────────────────────────────────

const pg = {
  page: { background: '#fff', color: '#111', borderRadius: 4, padding: '28px 30px', fontFamily: FS, boxShadow: '0 10px 30px rgba(0,0,0,.4)', aspectRatio: '8.5 / 11', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 9.5, lineHeight: 1.35, overflow: 'hidden' } as React.CSSProperties,
  h5: { margin: '0 0 5px', fontSize: 8.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#666', fontFamily: FM, fontWeight: 500 } as React.CSSProperties,
  th: { fontSize: 7.5, color: '#666', borderBottom: '1px solid #ccc', padding: '3px 6px 3px 0', textAlign: 'left', fontWeight: 500, fontFamily: FM, textTransform: 'uppercase', letterSpacing: '.05em' } as React.CSSProperties,
  td: { padding: '3.5px 6px 3.5px 0', borderBottom: '1px solid #eee', fontSize: 8.5 } as React.CSSProperties,
  m: { fontFamily: FM } as React.CSSProperties,
}

function PreviewBars({ bars, max }: { bars: { label: string; value: number }[]; max: number }) {
  const bw = 520 / Math.max(1, bars.length)
  return (
    <svg viewBox="0 0 520 70" style={{ width: '100%', height: 'auto', display: 'block' }} aria-hidden="true">
      {bars.map((b, i) => { const h = (b.value / Math.max(1, max)) * 44, x = i * bw + bw * 0.25; return (
        <g key={b.label}>
          <rect x={x} y={52 - h} width={bw * 0.5} height={h} fill="#111" rx={1} />
          <text x={x + bw * 0.25} y={48 - h} textAnchor="middle" fill="#111" fontWeight={500} style={{ fontFamily: FM, fontSize: 7 }}>{moneyK(b.value)}</text>
          <text x={x + bw * 0.25} y={64} textAnchor="middle" fill="#666" style={{ fontFamily: FM, fontSize: 7 }}>{b.label}</text>
        </g>
      ) })}
      <line x1={0} x2={520} y1={52.5} y2={52.5} stroke="#999" strokeWidth={0.5} />
    </svg>
  )
}

export function MonthlyPreview({ data, clientName, preparedOn }: { data: MonthlyPdfData; clientName: string; preparedOn: string }) {
  const max = Math.max(1, ...data.weeks.map(w => w.value))
  return (
    <div style={pg.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1.5px solid #111', paddingBottom: 8 }}>
        <div><div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>{clientName}</div><div style={{ fontSize: 9, color: '#666' }}>Brand report · {data.label}</div></div>
        <div style={{ fontSize: 9, color: '#666', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={WESTERN_PEAK_LOGO_ON_LIGHT_URL} alt={FIRM.name} style={{ height: 22, width: 'auto', display: 'block' }} />
          <span>Prepared {preparedOn}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {[
          ['Accounts worked', String(data.accountsWorked.current), `${formatPdfDelta(data.accountsWorked, 'count', data.compareLabel)} · ${data.orderedAccounts} ordered · ${data.visitedInPerson} visited`],
          ['Orders', String(data.orders.current), formatPdfDelta(data.orders, 'count', data.compareLabel)],
          ['Order value', money(data.value.current), formatPdfDelta(data.value, 'dollars', data.compareLabel)],
        ].map(([k, v, c]) => (
          <div key={k} style={{ border: '1px solid #ddd', borderRadius: 4, padding: '8px 10px' }}>
            <div style={{ fontSize: 8.5, color: '#666' }}>{k}</div><div style={{ ...pg.m, fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', margin: '2px 0' }}>{v}</div><div style={{ fontSize: 8.5, color: '#444' }}>{c}</div>
          </div>
        ))}
      </div>
      <div><h5 style={pg.h5}>Order value by week</h5><PreviewBars bars={data.weeks} max={max} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, flex: 1, minHeight: 0 }}>
        <div><h5 style={pg.h5}>Top accounts</h5>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={pg.th}>Account</th><th style={{ ...pg.th, textAlign: 'right' }}>Orders</th><th style={{ ...pg.th, textAlign: 'right' }}>Value</th></tr></thead>
            <tbody>{data.topAccounts.map(a => <tr key={a.name}><td style={pg.td}>{a.name}</td><td style={{ ...pg.td, ...pg.m, textAlign: 'right' }}>{a.orders}</td><td style={{ ...pg.td, ...pg.m, textAlign: 'right' }}>{money(a.value)}</td></tr>)}</tbody></table>
        </div>
        <div><h5 style={pg.h5}>Products ordered</h5>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{data.products.map(p => <tr key={p.name + (p.retail ? '-r' : '')}><td style={pg.td}>{p.name}{p.retail ? ' · retail' : ''}</td><td style={{ ...pg.td, ...pg.m, textAlign: 'right' }}>{unitLabel(p)}</td></tr>)}</tbody></table>
          <h5 style={{ ...pg.h5, marginTop: 10 }}>Accounts</h5>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {[['Active (ordered in the last 90 days)', data.active.accounts], ['Reordering', data.active.reorderingAccounts], ['New this month', data.active.newThisMonth], ['Tastings', data.active.tastings]].map(([k, v]) => <tr key={String(k)}><td style={pg.td}>{k}</td><td style={{ ...pg.td, ...pg.m, textAlign: 'right' }}>{v}</td></tr>)}
          </tbody></table>
        </div>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#777', borderTop: '1px solid #ddd', paddingTop: 6 }}><span>{FIRM.name} · {FIRM.city}</span><span>Questions: {FIRM.contact}</span></div>
    </div>
  )
}

export function QuarterlyPreview({ data, clientName, preparedOn }: { data: QuarterlyPdfData; clientName: string; preparedOn: string }) {
  const cell: React.CSSProperties = { padding: '5px 6px', borderBottom: '1px solid #eee', fontSize: 9 }
  const row = (label: string, k: 'accountsWorked' | 'orders' | 'value' | 'newAccounts' | 'tastings', fmt: (n: number) => string) => (
    <React.Fragment key={k}>
      <div style={cell}>{label}</div>
      {data.months.map(m => <div key={m.key} style={{ ...cell, ...pg.m }}>{fmt(m[k])}</div>)}
      <div style={{ ...cell, ...pg.m, fontWeight: 600, background: '#f4f4f5' }}>{fmt(data.totals[k])}</div>
    </React.Fragment>
  )
  return (
    <div style={pg.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1.5px solid #111', paddingBottom: 8 }}>
        <div><div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>{clientName}</div><div style={{ fontSize: 9, color: '#666' }}>Quarterly report · {data.label}</div></div>
        <div style={{ fontSize: 9, color: '#666', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={WESTERN_PEAK_LOGO_ON_LIGHT_URL} alt={FIRM.name} style={{ height: 22, width: 'auto', display: 'block' }} />
          <span>Prepared {preparedOn}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1.1fr' }}>
        <div style={{ ...cell, ...pg.h5, borderBottom: '1px solid #eee', margin: 0 }} />
        {data.months.map(m => <div key={m.key} style={{ ...cell, ...pg.h5, margin: 0 }}>{m.label}</div>)}
        <div style={{ ...cell, ...pg.h5, margin: 0, fontWeight: 600, background: '#f4f4f5' }}>Q{data.q}</div>
        {row('Accounts worked', 'accountsWorked', String)}{row('Orders', 'orders', String)}{row('Order value', 'value', money)}{row('New accounts', 'newAccounts', String)}{row('Tastings', 'tastings', String)}
      </div>
      <div><h5 style={pg.h5}>Order value by month</h5><PreviewBars bars={data.months.map(m => ({ label: m.label, value: m.value }))} max={Math.max(1, ...data.months.map(m => m.value))} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, flex: 1, minHeight: 0 }}>
        <div><h5 style={pg.h5}>Top accounts, quarter</h5>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={pg.th}>Account</th><th style={{ ...pg.th, textAlign: 'right' }}>Orders</th><th style={{ ...pg.th, textAlign: 'right' }}>Value</th></tr></thead>
            <tbody>{data.topAccounts.map(a => <tr key={a.name}><td style={pg.td}>{a.name}</td><td style={{ ...pg.td, ...pg.m, textAlign: 'right' }}>{a.orders}</td><td style={{ ...pg.td, ...pg.m, textAlign: 'right' }}>{money(a.value)}</td></tr>)}</tbody></table>
        </div>
        <div><h5 style={pg.h5}>Products ordered, quarter</h5>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{data.products.map(p => <tr key={p.name + (p.retail ? '-r' : '')}><td style={pg.td}>{p.name}{p.retail ? ' · retail' : ''}</td><td style={{ ...pg.td, ...pg.m, textAlign: 'right' }}>{unitLabel(p)}</td></tr>)}</tbody></table>
        </div>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#777', borderTop: '1px solid #ddd', paddingTop: 6 }}><span>{FIRM.name} · {FIRM.city}</span><span>Questions: {FIRM.contact}</span></div>
    </div>
  )
}
