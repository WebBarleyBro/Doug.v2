'use client'
import { t, modalOverlay, btnDanger, btnSecondary } from '../lib/theme'

interface Props {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
}

export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false, loading }: Props) {
  if (!isOpen) return null
  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fade-in" style={{
        backgroundColor: t.bg.elevated,
        border: `1px solid ${t.border.hover}`,
        borderRadius: '14px',
        padding: '28px',
        width: '100%',
        maxWidth: '380px',
      }}>
        <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary, marginBottom: '10px' }}>{title}</h3>
        <p style={{ fontSize: '14px', color: t.text.secondary, lineHeight: 1.6, marginBottom: '24px' }}>{message}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary} disabled={loading}>Cancel</button>
          <button onClick={onConfirm} style={danger ? btnDanger : { ...btnSecondary, backgroundColor: t.gold, color: '#0f0f0d', border: 'none' }} disabled={loading}>
            {loading ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
