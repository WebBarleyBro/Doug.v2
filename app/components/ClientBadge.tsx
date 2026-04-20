'use client'
import { t } from '../lib/theme'
import type { Client } from '../lib/types'

interface Props {
  client: Client
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
}

export default function ClientBadge({ client, size = 'md', showName = true }: Props) {
  const sizes = { sm: { dot: 8, font: 11 }, md: { dot: 10, font: 12 }, lg: { dot: 12, font: 13 } }
  const s = sizes[size]

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: s.dot, height: s.dot,
        borderRadius: '50%',
        backgroundColor: client.color || t.gold,
        flexShrink: 0,
      }} />
      {showName && (
        <span style={{ fontSize: s.font, color: t.text.secondary, fontWeight: '500' }}>
          {client.name}
        </span>
      )}
    </div>
  )
}
