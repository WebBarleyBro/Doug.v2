'use client'
import LayoutShell, { useToast } from '../layout-shell'
import BrandReports, { type BrandReportsPalette } from '../components/BrandReports'
import { t } from '../lib/theme'

const palette: BrandReportsPalette = {
  bg: { card: t.bg.card, elevated: t.bg.elevated, overlay: 'rgba(0,0,0,0.78)' },
  border: { default: t.border.default, subtle: t.border.subtle, strong: t.border.hover },
  text: { primary: t.text.primary, secondary: t.text.secondary, muted: t.text.muted },
  amber: t.gold,
  amberDim: t.goldDim,
  status: { success: t.status.success, warning: t.status.warning, danger: t.status.danger, info: t.status.info },
  font: { ui: 'var(--font-sans)', mono: 'var(--font-mono)' },
  radius: { md: '12px', sm: '8px' },
}

function Inner() {
  const toast = useToast()
  return <BrandReports palette={palette} toast={toast} />
}

export default function BrandReportsPage() {
  return <LayoutShell><Inner /></LayoutShell>
}
