import type { Metadata } from 'next'
import { Schibsted_Grotesk, DM_Mono } from 'next/font/google'

// Portal-only typefaces, scoped to this layout so the CRM keeps its own fonts.
const sans = Schibsted_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--pf-sans', display: 'swap' })
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--pf-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Brand report · Western Peak',
  description: 'Field activity, orders and placements reported by Western Peak.',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} ${mono.variable}`}>{children}</div>
}
