'use client'
import type { Grade, GradeResult } from '../lib/grading'
import { GRADE_CONFIG } from '../lib/grading'

// ── Compact badge (S / A / B / C / D) ────────────────────────────────────────
// size: 'sm' = 20px for table rows, 'md' = 28px for detail headers

interface GradeBadgeProps {
  grade:    Grade
  size?:    'sm' | 'md' | 'lg'
  showMomentum?: boolean
  momentum?: 'up' | 'down' | 'flat'
  tooltip?: boolean
}

export function GradeBadge({ grade, size = 'sm', showMomentum, momentum, tooltip }: GradeBadgeProps) {
  const cfg = GRADE_CONFIG[grade]

  const dim = size === 'lg' ? 36 : size === 'md' ? 28 : 22
  const fontSize = size === 'lg' ? '15px' : size === 'md' ? '13px' : '11px'

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
      title={tooltip ? `${grade}-tier · ${cfg.label}` : undefined}>
      <div style={{
        width: dim, height: dim,
        borderRadius: size === 'lg' ? '6px' : size === 'md' ? '4px' : '3px',
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        boxShadow: cfg.glow !== 'none' ? cfg.glow : undefined,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize,
          fontWeight: 900,
          color: cfg.color,
          fontFamily: '"Space Grotesk", system-ui, sans-serif',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          {grade}
        </span>
      </div>
      {showMomentum && momentum && momentum !== 'flat' && (
        <span style={{
          fontSize: '9px',
          color: momentum === 'up' ? '#5a9ea0' : 'rgba(255,255,255,0.35)',
          lineHeight: 1,
          fontWeight: 700,
        }}>
          {momentum === 'up' ? '↑' : '↓'}
        </span>
      )}
    </div>
  )
}

// ── Score breakdown tooltip / detail card ────────────────────────────────────
// Shows the 5 sub-scores in a clean grid — for account detail pages

export function GradeDetail({ result }: { result: GradeResult }) {
  const cfg = GRADE_CONFIG[result.grade]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Big grade + score */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '8px',
          background: cfg.bg, border: `1.5px solid ${cfg.border}`,
          boxShadow: cfg.glow !== 'none' ? cfg.glow : undefined,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: '24px', fontWeight: 900, color: cfg.color, letterSpacing: '-0.03em', lineHeight: 1, userSelect: 'none' }}>
            {result.grade}
          </span>
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: cfg.color, lineHeight: 1.3 }}>{cfg.label}</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)', marginTop: 2, fontFamily: 'monospace' }}>
            Score {result.score}/100
          </div>
          {result.momentum !== 'flat' && (
            <div style={{
              fontSize: '10px', fontWeight: 700, marginTop: 4,
              color: result.momentum === 'up' ? '#5a9ea0' : 'rgba(191,120,80,0.85)',
            }}>
              {result.momentum === 'up' ? '↑ Trending up' : '↓ Activity declining'}
            </div>
          )}
        </div>
      </div>

      {/* Sub-score bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {([
          { key: 'revenue',   label: 'Revenue',     weight: '35%' },
          { key: 'velocity',  label: 'Order Freq',  weight: '20%' },
          { key: 'placement', label: 'Placements',  weight: '20%' },
          { key: 'winRate',   label: 'Win Rate',    weight: '15%' },
          { key: 'recency',   label: 'Recency',     weight: '10%' },
        ] as const).map(({ key, label, weight }) => {
          const val = result.scores[key]
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', width: 70, flexShrink: 0 }}>{label}</span>
              <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${val}%`,
                  background: val >= 70 ? cfg.color : val >= 40 ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.12)',
                  borderRadius: 2,
                  transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)',
                }} />
              </div>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.40)', width: 26, textAlign: 'right', fontFamily: 'monospace' }}>{val}</span>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.22)', width: 24, flexShrink: 0 }}>{weight}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
