'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { DollarSign, MapPin, ChevronRight } from 'lucide-react'
import LayoutShell from '../layout-shell'
import { CardSkeleton } from '../components/LoadingSkeleton'
import { getClients } from '../lib/data'
import { t, card } from '../lib/theme'
import { formatPercent } from '../lib/formatters'
import { clientLogoUrl } from '../lib/constants'
import type { Client } from '../lib/types'

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    getClients().then(cls => { setClients(cls); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Clients</h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Your brand portfolio</p>
        </div>

        {loading ? <CardSkeleton count={4} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {clients.map(client => (
              <Link key={client.slug} href={`/clients/${client.slug}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  ...card,
                  padding: '20px 24px',
                  borderLeft: `4px solid ${client.color || t.gold}`,
                  cursor: 'pointer',
                  transition: 'background 150ms ease',
                }}>
                  <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '16px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                    {/* Logo */}
                    {(() => {
                      const logo = clientLogoUrl(client)
                      return logo ? (
                        <img src={logo} alt={client.name}
                          style={{ width: '52px', height: '52px', objectFit: 'contain', flexShrink: 0, borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.04)', padding: '4px' }} />
                      ) : (
                        <div style={{ width: '52px', height: '52px', borderRadius: '8px', backgroundColor: `${client.color}22`, border: `1px solid ${client.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '20px', fontWeight: '700', color: client.color }}>{client.name[0]}</span>
                        </div>
                      )
                    })()}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <h2 style={{ fontSize: '17px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.01em' }}>
                          {client.name}
                        </h2>
                        <span style={{
                          fontSize: '10px', padding: '2px 8px', borderRadius: '10px',
                          backgroundColor: client.order_type === 'direct' ? t.goldDim : t.status.infoBg,
                          color: client.order_type === 'direct' ? t.gold : t.status.info,
                          fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          {client.order_type}
                        </span>
                        {client.category && (
                          <span style={{ fontSize: '11px', color: t.text.muted }}>{client.category}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {client.territory && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={11} color={t.text.muted} />
                            <span style={{ fontSize: '12px', color: t.text.muted }}>{client.territory}</span>
                          </div>
                        )}
                        {client.commission_rate > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <DollarSign size={11} color={t.text.muted} />
                            <span style={{ fontSize: '12px', color: t.text.muted }}>{formatPercent(client.commission_rate)} commission</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} color={t.text.muted} />
                  </div>
                </div>
              </Link>
            ))}
            {clients.length === 0 && (
              <div style={{ color: t.text.muted, fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>
                No clients found — add them in Supabase under the clients table.
              </div>
            )}
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
