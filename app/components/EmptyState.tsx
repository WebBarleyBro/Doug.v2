'use client'
import { t } from '../lib/theme'

interface Props {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export default function EmptyState({ icon, title, subtitle, action }: Props) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '48px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
    }}>
      {icon && (
        <div style={{ color: t.text.muted, marginBottom: '8px', opacity: 0.5 }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: '15px', fontWeight: '600', color: t.text.secondary }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: '13px', color: t.text.muted, maxWidth: '280px' }}>
          {subtitle}
        </div>
      )}
      {action && <div style={{ marginTop: '16px' }}>{action}</div>}
    </div>
  )
}
