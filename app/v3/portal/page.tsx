'use client'
import Link from 'next/link'
import { ExternalLink, TrendingUp, Package, Calendar } from 'lucide-react'
import { v3 } from '../lib/theme'
import { useV3Clients, useV3RecentVisits, useV3Placements, useV3Orders } from '../lib/query'
import { clientLogoUrl } from '../../lib/constants'

export default function PortalPage() {
  const { data: clients = [], isLoading } = useV3Clients()
  const { data: visits = [] }     = useV3RecentVisits(30)
  const { data: placements = [] } = useV3Placements()
  const { data: orders = [] }     = useV3Orders()

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 28px 48px' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: 0 }}>Client Portal</h1>
        <div style={{ fontSize: '12px', color: v3.text.muted, marginTop: 3 }}>Read-only view your clients see. Click any brand to open their portal.</div>
      </div>

      {isLoading
        ? <div style={{ color: v3.text.muted, fontSize: '13px' }}>Loading…</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 120px', gap: 16, padding: '8px 20px', background: v3.bg.surface, borderBottom: `1px solid ${v3.border.subtle}` }}>
              {['Brand', 'Visits 30d', 'On Shelf', 'Orders', 'Portal Link'].map(h => (
                <span key={h} style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{h}</span>
              ))}
            </div>

            {clients.map((c, i) => {
              const logo = clientLogoUrl(c)
              const ac = c.color || v3.amber
              const clientVisits    = visits.filter(v => v.client_slug === c.slug).length
              const clientOnShelf   = placements.filter(p => p.client_slug === c.slug && !p.lost_at && p.status === 'on_shelf').length
              const clientOrders    = (orders as any[]).filter(o => o.client_slug === c.slug).length

              return (
                <div key={c.slug} style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 120px',
                  gap: 16, padding: '12px 20px', alignItems: 'center',
                  borderBottom: i < clients.length - 1 ? `1px solid ${v3.border.subtle}` : 'none',
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = v3.bg.elevated}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  {/* Brand name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '4px', background: ac + '14', border: `1px solid ${ac}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {logo
                        ? <img src={logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                        : <span style={{ fontSize: '11px', fontWeight: 900, color: ac }}>{c.name[0]}</span>
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: v3.text.primary }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: v3.text.muted }}>{c.category ?? 'Spirits'} · {c.order_type === 'direct' ? 'Direct' : 'Distributor'}</div>
                    </div>
                  </div>

                  {/* Stats */}
                  <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: clientVisits > 0 ? v3.text.primary : v3.text.muted }}>{clientVisits}</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: clientOnShelf > 0 ? v3.status.success : v3.text.muted }}>{clientOnShelf}</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: clientOrders > 0 ? v3.amberLight : v3.text.muted }}>{clientOrders}</span>

                  {/* Portal link */}
                  <Link
                    href={`/portal/${c.slug}`}
                    target="_blank"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: v3.amberDim, border: `1px solid ${v3.amber}35`, borderRadius: '4px', fontSize: '11px', fontWeight: 700, color: v3.amberLight, textDecoration: 'none' }}
                  >
                    <ExternalLink size={11} />
                    Open Portal
                  </Link>
                </div>
              )
            })}

            {clients.length === 0 && (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: v3.text.muted, fontSize: '12px' }}>No brands in portfolio.</div>
            )}
          </div>
        )
      }
    </div>
  )
}
