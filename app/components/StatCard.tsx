'use client'
import Link from 'next/link'
import { t } from '../lib/theme'

interface Props {
  label: string
  value: string | number
  icon?: React.ReactNode
  color?: string
  subtext?: string
  trend?: number
  href?: string
  loading?: boolean
}

export default function StatCard({ label, value, icon, color, subtext, trend, href, loading }: Props) {
  const accentColor = color || t.gold

  const inner = (
    <div className="hud" style={{
      backgroundColor: t.bg.card,
      border: `1px solid ${t.border.default}`,
      borderRadius: '8px',
      padding: '18px 20px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'all 150ms ease',
      cursor: href ? 'pointer' : 'default',
    }}>
      {/* Accent bar top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
        background: `linear-gradient(90deg, ${accentColor}, transparent)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '10px', color: t.text.muted, fontWeight: '600',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px',
          }}>
            {label}
          </div>
          {loading ? (
            <div style={{ width: '60%', height: '28px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '4px', animation: 'skeleton-pulse 1.2s ease-in-out infinite' }} />
          ) : (
            <div className="mono" style={{ fontSize: '26px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.03em', lineHeight: 1 }}>
              {value}
            </div>
          )}
          {subtext && !loading && (
            <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '6px' }}>
              {subtext}
            </div>
          )}
          {trend !== undefined && !loading && (
            <div style={{
              fontSize: '11px',
              color: trend >= 0 ? t.status.success : t.status.danger,
              marginTop: '5px',
              display: 'flex', alignItems: 'center', gap: '3px',
              fontFamily: 'var(--font-mono)',
            }}>
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
            </div>
          )}
        </div>
        {icon && (
          <div style={{
            color: accentColor,
            opacity: 0.7,
            flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>
  }
  return inner
}
