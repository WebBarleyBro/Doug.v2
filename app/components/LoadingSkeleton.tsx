'use client'
import { t } from '../lib/theme'

function Block({ w = '100%', h = '16px', r = '6px' }: { w?: string; h?: string; r?: string }) {
  return <div style={{ width: w, height: h, borderRadius: r, backgroundColor: 'rgba(255,255,255,0.06)', animation: 'skeleton-pulse 1.2s ease-in-out infinite' }} />
}

export function StatsSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '12px', padding: '18px 20px' }}>
          <Block w="50%" h="11px" />
          <div style={{ marginTop: '10px' }}><Block w="40%" h="28px" r="4px" /></div>
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {[...Array(count)].map((_, i) => (
        <div key={i} style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '12px', padding: '16px 20px' }}>
          <Block w="60%" h="15px" />
          <div style={{ marginTop: '8px' }}><Block w="40%" h="12px" /></div>
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '12px', overflow: 'hidden' }}>
      {[...Array(rows)].map((_, i) => (
        <div key={i} style={{ padding: '14px 20px', borderBottom: i < rows - 1 ? `1px solid ${t.border.subtle}` : 'none', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Block w="30%" h="14px" />
          <Block w="20%" h="14px" />
          <Block w="15%" h="14px" />
        </div>
      ))}
    </div>
  )
}

export default function LoadingSkeleton() {
  return (
    <div style={{ padding: '28px' }}>
      <Block w="200px" h="24px" r="6px" />
      <div style={{ marginTop: '24px' }}><StatsSkeleton /></div>
      <div style={{ marginTop: '24px' }}><CardSkeleton /></div>
    </div>
  )
}
