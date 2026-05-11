// V3 — Carbon Professional
// Philosophy: restraint over spectacle. Data first. One warm accent.
// Fonts: Space Grotesk (UI) + JetBrains Mono (numbers)

export const v3 = {
  // ── Backgrounds ─────────────────────────────────────────────────────────────
  bg: {
    page:     '#000000',
    surface:  '#070707',
    card:     '#0e0e0e',
    elevated: '#141414',
    sheet:    '#1c1c1c',
    overlay:  'rgba(0,0,0,0.86)',
    scrim:    'rgba(0,0,0,0.97)',
  },

  // ── Text ─────────────────────────────────────────────────────────────────────
  text: {
    primary:   '#f0f0f0',
    secondary: 'rgba(255,255,255,0.70)',
    muted:     'rgba(255,255,255,0.55)',
    inverse:   '#000000',
    link:      '#c8a46e',
  },

  // ── Borders ──────────────────────────────────────────────────────────────────
  border: {
    subtle:  'rgba(255,255,255,0.04)',
    default: 'rgba(255,255,255,0.08)',
    strong:  'rgba(255,255,255,0.13)',
    focus:   'rgba(196,164,110,0.40)',
  },

  // ── ACCENT — warm amber gold. Aged spirit. One color, used precisely. ────────
  // Still named "amber" to avoid touching every page.
  amber:       '#c4a46e',   // Warm amber gold
  amberLight:  '#d4b47e',   // Lighter gold
  amberBright: '#e8cc9a',   // Pale champagne
  amberDim:    'rgba(196,164,110,0.08)',
  amberMid:    'rgba(196,164,110,0.14)',
  amberGlow:   '0 0 18px rgba(196,164,110,0.22), 0 0 48px rgba(196,164,110,0.08)',

  // ── Status — accessible, not color-blind-hostile ────────────────────────────
  status: {
    success:    '#5a9ea0',   // Slate teal — distinguishable for deuteranopia
    successDim: 'rgba(90,158,160,0.10)',
    warning:    '#a08440',   // Muted gold
    warningDim: 'rgba(160,132,64,0.10)',
    danger:     '#bf7850',   // Burnt sienna — distinguishable from teal
    dangerDim:  'rgba(191,120,80,0.10)',
    info:       '#6878b4',   // Muted slate blue
    infoDim:    'rgba(104,120,180,0.08)',
  },

  // ── Health ───────────────────────────────────────────────────────────────────
  health: {
    warm:    '#5a9ea0',   // matches success teal
    cooling: '#a08440',   // matches warning gold
    cold:    '#bf7850',   // matches danger sienna
    new:     '#2a2a2a',
  },

  // ── Typography ───────────────────────────────────────────────────────────────
  font: {
    ui:   '"Space Grotesk", -apple-system, system-ui, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
  },

  type: {
    xs:    '11px',
    sm:    '12px',
    md:    '13px',
    base:  '14px',
    lg:    '16px',
    xl:    '18px',
    '2xl': '22px',
    '3xl': '28px',
    '4xl': '36px',
  },

  space: {
    1: '4px', 2: '8px', 3: '12px', 4: '16px',
    5: '20px', 6: '24px', 7: '28px', 8: '32px',
  },

  radius: {
    sm:   '2px',
    md:   '4px',
    lg:   '6px',
    xl:   '8px',
    full: '9999px',
  },

  ease: {
    default: 'cubic-bezier(0.16, 1, 0.3, 1)',
    spring:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
    out:     'cubic-bezier(0, 0, 0.2, 1)',
  },
}

// ── Style primitives ─────────────────────────────────────────────────────────

export const v3card: React.CSSProperties = {
  background: v3.bg.card,
  border: `1px solid ${v3.border.subtle}`,
  borderRadius: v3.radius.md,
  padding: '16px 20px',
}

export function v3panel(accentColor?: string): React.CSSProperties {
  const c = accentColor ?? v3.amber
  return {
    background: v3.bg.card,
    borderLeft: `2px solid ${c}`,
    borderTop: 'none',
    borderRight: 'none',
    borderBottom: 'none',
    borderRadius: `0 ${v3.radius.md} ${v3.radius.md} 0`,
    padding: '14px 18px',
  }
}

export const v3input: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${v3.border.default}`,
  borderRadius: v3.radius.md,
  color: v3.text.primary,
  fontSize: v3.type.base,
  fontFamily: v3.font.ui,
  padding: '9px 12px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 120ms',
}

export const v3label: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 700,
  color: v3.text.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.20em',
  display: 'block',
  marginBottom: '6px',
  fontFamily: v3.font.ui,
}

export const v3btnPrimary: React.CSSProperties = {
  background: v3.amber,
  color: '#000000',
  border: 'none',
  borderRadius: v3.radius.md,
  padding: '10px 18px',
  fontSize: '12px',
  fontWeight: 700,
  fontFamily: v3.font.ui,
  cursor: 'pointer',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

export const v3btnSecondary: React.CSSProperties = {
  background: 'transparent',
  color: v3.text.secondary,
  border: `1px solid ${v3.border.default}`,
  borderRadius: v3.radius.md,
  padding: '9px 16px',
  fontSize: v3.type.md,
  fontWeight: 500,
  fontFamily: v3.font.ui,
  cursor: 'pointer',
}

export function v3chip(color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    fontSize: '10px',
    fontWeight: 700,
    fontFamily: v3.font.ui,
    color,
    background: color + '12',
    padding: '2px 7px',
    borderRadius: v3.radius.sm,
    border: `1px solid ${color}22`,
    letterSpacing: '0.04em',
    lineHeight: 1.4,
  }
}

export function healthColor(lastVisitedAt: string | null, visitFrequencyDays: number | null): string {
  if (!lastVisitedAt) return v3.health.new
  const days = Math.floor((Date.now() - new Date(lastVisitedAt).getTime()) / 86400000)
  const freq = visitFrequencyDays ?? 30
  if (days <= freq * 0.75) return v3.health.warm
  if (days <= freq * 1.25) return v3.health.cooling
  return v3.health.cold
}

export function healthLabel(lastVisitedAt: string | null, visitFrequencyDays: number | null): string {
  if (!lastVisitedAt) return 'New'
  const days = Math.floor((Date.now() - new Date(lastVisitedAt).getTime()) / 86400000)
  const freq = visitFrequencyDays ?? 30
  if (days <= freq * 0.75) return 'Warm'
  if (days <= freq * 1.25) return 'Cooling'
  return 'Cold'
}
