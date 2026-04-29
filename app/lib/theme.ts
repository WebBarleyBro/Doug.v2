// Single source of truth for all design tokens and shared styles

export const t = {
  bg: {
    page:         '#0f0e0c',
    card:         '#171513',
    cardHover:    '#1d1b18',
    cardSelected: '#1e1b17',
    elevated:     '#1d1a16',
    input:        '#111110',
    sidebar:      '#0c0b09',
  },
  border: {
    default: '#2a2620',
    subtle:  '#1f1c17',
    hover:   'rgba(255,255,255,0.14)',
    focus:   'rgba(212,168,67,0.6)',
    gold:    'rgba(212,168,67,0.35)',
  },
  text: {
    primary:     '#f2ebdd',
    secondary:   '#bfb5a1',
    muted:       '#7a7060',
    placeholder: '#5a5248',
  },
  gold:       '#d4a843',
  goldHover:  '#e0b84e',
  goldDim:    'rgba(212,168,67,0.14)',  // --accent-muted
  goldBorder: 'rgba(212,168,67,0.22)',
  goldGlow:   'rgba(212,168,67,0.35)',  // --accent-glow
  status: {
    success:   '#3dbc76',
    successBg: 'rgba(61,188,118,0.10)',
    warning:   '#e99928',
    warningBg: 'rgba(233,153,40,0.10)',
    danger:    '#e85540',
    dangerBg:  'rgba(232,85,64,0.10)',
    info:      '#6aaee0',
    infoBg:    'rgba(106,174,224,0.10)',
    neutral:   '#7a7060',
    neutralBg: 'rgba(122,112,96,0.15)',
  },
} as const

export const card: React.CSSProperties = {
  backgroundColor: t.bg.card,
  border: `1px solid ${t.border.default}`,
  borderRadius: '10px',
  padding: '20px 24px',
}

export const cardHoverable: React.CSSProperties = {
  ...card,
  cursor: 'pointer',
  transition: 'all 150ms ease',
}

export const inputStyle: React.CSSProperties = {
  backgroundColor: t.bg.input,
  border: `1px solid ${t.border.default}`,
  borderRadius: '8px',
  padding: '10px 14px',
  color: t.text.primary,
  fontSize: '16px',
  width: '100%',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 150ms ease',
}

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239e9b95' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: '36px',
}

export const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: t.text.muted,
  fontWeight: '600',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: '6px',
  display: 'block',
}

export const sectionHeader: React.CSSProperties = {
  fontSize: '11px',
  color: t.text.muted,
  fontWeight: '600',
  letterSpacing: '0.04em',
}

export const panelTitle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: '600',
  color: t.text.primary,
  letterSpacing: '-0.01em',
}

export const statValue: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  fontSize: '30px',
  fontWeight: '700',
  color: t.text.primary,
  letterSpacing: '-0.02em',
  lineHeight: '1',
}

export const statLabel: React.CSSProperties = {
  fontSize: '12px',
  color: t.text.muted,
  fontWeight: '500',
}

export const pageTitle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: '700',
  color: t.text.primary,
  letterSpacing: '-0.02em',
}

export const btnPrimary: React.CSSProperties = {
  backgroundColor: t.gold,
  color: '#0c0c0a',
  border: 'none',
  borderRadius: '8px',
  padding: '11px 18px',
  minHeight: '44px',
  fontSize: '14px',
  fontWeight: '700',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  transition: 'all 150ms ease',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  boxShadow: '0 0 16px rgba(212,168,67,0.20)',
  letterSpacing: '0.01em',
}

export const btnSecondary: React.CSSProperties = {
  backgroundColor: 'transparent',
  border: `1px solid ${t.border.hover}`,
  borderRadius: '8px',
  padding: '11px 18px',
  minHeight: '44px',
  color: t.text.secondary,
  fontSize: '14px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  transition: 'all 150ms ease',
  textDecoration: 'none',
}

export const btnDanger: React.CSSProperties = {
  backgroundColor: t.status.dangerBg,
  border: `1px solid rgba(232,85,64,0.3)`,
  borderRadius: '8px',
  padding: '10px 18px',
  color: t.status.danger,
  fontSize: '14px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  transition: 'all 150ms ease',
}

export const btnIcon: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: t.text.muted,
  cursor: 'pointer',
  padding: '10px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '44px',
  minHeight: '44px',
  transition: 'color 120ms ease',
}

const badgeBase: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: '600',
  padding: '3px 9px',
  borderRadius: '20px',
  letterSpacing: '0.03em',
  display: 'inline-flex',
  alignItems: 'center',
  whiteSpace: 'nowrap',
}

export const badge = {
  visitStatus(status: string): React.CSSProperties {
    const map: Record<string, { color: string; bg: string; border: string }> = {
      'Will Order Soon': { color: t.status.warning, bg: t.status.warningBg, border: 'rgba(233,153,40,0.2)' },
      'Just Ordered':    { color: t.status.success, bg: t.status.successBg, border: 'transparent' },
      'Needs Follow Up': { color: t.status.info,    bg: t.status.infoBg,    border: 'transparent' },
      'Not Interested':  { color: t.status.danger,  bg: t.status.dangerBg,  border: 'transparent' },
      'Menu Feature Won':{ color: t.status.success, bg: t.status.successBg, border: 'transparent' },
      'New Placement':   { color: t.gold,           bg: t.goldDim,          border: 'transparent' },
      'General Check-In':{ color: t.text.secondary, bg: t.status.neutralBg, border: 'transparent' },
    }
    const s = map[status] || { color: t.text.secondary, bg: t.status.neutralBg, border: 'transparent' }
    return { ...badgeBase, backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }
  },

  placementStatus(status: string): React.CSSProperties {
    const map: Record<string, { color: string; bg: string }> = {
      committed: { color: t.status.info,    bg: t.status.infoBg    },
      ordered:   { color: t.status.warning, bg: t.status.warningBg },
      on_shelf:  { color: t.status.success, bg: t.status.successBg },
      reordering:{ color: t.gold,           bg: t.goldDim          },
    }
    const s = map[status] || { color: t.text.secondary, bg: t.status.neutralBg }
    return { ...badgeBase, backgroundColor: s.bg, color: s.color }
  },

  orderStatus(status: string): React.CSSProperties {
    const map: Record<string, { color: string; bg: string }> = {
      sent:      { color: t.status.warning, bg: t.status.warningBg },
      fulfilled: { color: t.status.success, bg: t.status.successBg },
      draft:     { color: t.text.secondary, bg: t.status.neutralBg },
      cancelled: { color: t.status.danger,  bg: t.status.dangerBg  },
    }
    const s = map[status?.toLowerCase()] || { color: t.text.secondary, bg: t.status.neutralBg }
    return { ...badgeBase, backgroundColor: s.bg, color: s.color }
  },

  pipelineStage(stage: string): React.CSSProperties {
    const map: Record<string, { color: string; bg: string }> = {
      prospect:          { color: t.text.secondary, bg: t.status.neutralBg },
      contacted:         { color: t.status.info,    bg: t.status.infoBg    },
      meeting_scheduled: { color: t.status.warning, bg: t.status.warningBg },
      proposal_sent:     { color: t.gold,           bg: t.goldDim          },
      negotiating:       { color: t.status.warning, bg: t.status.warningBg },
      won:               { color: t.status.success, bg: t.status.successBg },
      lost:              { color: t.status.danger,  bg: t.status.dangerBg  },
    }
    const s = map[stage] || { color: t.text.secondary, bg: t.status.neutralBg }
    return { ...badgeBase, backgroundColor: s.bg, color: s.color }
  },

  custom(color: string, bg?: string): React.CSSProperties {
    return { ...badgeBase, backgroundColor: bg || color + '18', color }
  },
}

export const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.80)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '20px',
}

export const modalCard: React.CSSProperties = {
  backgroundColor: t.bg.elevated,
  border: `1px solid ${t.border.hover}`,
  borderRadius: '16px',
  padding: '28px',
  width: '100%',
  maxWidth: '540px',
  maxHeight: '90vh',
  overflowY: 'auto',
}

export const mobileModalSheet: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
}

export const mobileSheetContent: React.CSSProperties = {
  backgroundColor: t.bg.elevated,
  borderRadius: '20px 20px 0 0',
  maxHeight: '95vh',
  overflowY: 'auto',
  padding: '0 0 env(safe-area-inset-bottom, 0px)',
}

export const emptyState: React.CSSProperties = {
  textAlign: 'center',
  padding: '48px 24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
}

export const divider: React.CSSProperties = {
  borderTop: `1px solid ${t.border.default}`,
  margin: '16px 0',
}

export function skeletonBlock(width = '100%', height = '16px', borderRadius = '6px'): React.CSSProperties {
  return {
    width,
    height,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius,
    animation: 'skeleton-pulse 1.2s ease-in-out infinite',
    display: 'block',
  }
}

export function overdueColor(daysAgo: number | null, frequency?: number | null): string {
  if (daysAgo === null) return t.text.muted
  if (!frequency) {
    // No frequency: fall back to absolute thresholds
    if (daysAgo <= 14) return t.status.success
    if (daysAgo <= 30) return t.status.warning
    return t.status.danger
  }
  const daysOverdue = daysAgo - frequency
  if (daysOverdue < -1) return t.status.success   // green: more than 1 day until due
  if (daysOverdue < 7) return t.status.warning    // yellow: due tomorrow through 6 days late
  return t.status.danger                           // red: 7+ days overdue
}

export function overdueColorBg(daysAgo: number | null, frequency?: number | null): string {
  if (daysAgo === null) return 'rgba(255,255,255,0.06)'
  if (!frequency) {
    if (daysAgo <= 14) return t.status.successBg
    if (daysAgo <= 30) return t.status.warningBg
    return t.status.dangerBg
  }
  const daysOverdue = daysAgo - frequency
  if (daysOverdue < -1) return t.status.successBg
  if (daysOverdue < 7) return t.status.warningBg
  return t.status.dangerBg
}

import type React from 'react'
