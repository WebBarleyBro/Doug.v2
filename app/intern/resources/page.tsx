'use client'
import { useState, useEffect } from 'react'
import { BookOpen, ExternalLink, Instagram, Globe, FileText } from 'lucide-react'
import LayoutShell from '../../layout-shell'
import { getClients } from '../../lib/data'
import { getSupabase } from '../../lib/supabase'
import { t, card } from '../../lib/theme'
import { clientLogoUrl } from '../../lib/constants'
import type { Client } from '../../lib/types'

interface BrandAsset {
  id: string
  client_slug: string
  title: string
  asset_type?: string
  url?: string
  description?: string
}

export default function InternResourcesPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [assetMap, setAssetMap] = useState<Record<string, BrandAsset[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const sb = getSupabase()
      const cls = await getClients()
      setClients(cls)

      if (cls.length > 0) {
        const { data } = await sb
          .from('brand_assets')
          .select('*')
          .in('client_slug', cls.map(c => c.slug))
          .order('asset_type')
        const map: Record<string, BrandAsset[]> = {}
        for (const a of (data || [])) {
          if (!map[a.client_slug]) map[a.client_slug] = []
          map[a.client_slug].push(a)
        }
        setAssetMap(map)
      }

      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [])

  if (loading) return <LayoutShell><div className="page-wrap" style={{ padding: '32px 48px', color: t.text.muted, fontSize: '14px' }}>Loading...</div></LayoutShell>

  return (
    <LayoutShell>
      <div className="page-wrap" style={{ padding: '32px 48px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BookOpen size={20} /> Brand Resources
          </h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Everything you need to create content for each brand</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {clients.map(client => {
            const logo = clientLogoUrl(client)
            const assets = assetMap[client.slug] || []
            const linkAssets = assets.filter(a => a.url)
            const docAssets = assets.filter(a => !a.url)

            return (
              <div key={client.id} style={{ ...card, padding: '24px 28px', borderLeft: `3px solid ${client.color}` }}>

                {/* Brand header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
                  {logo
                    ? <img src={logo} alt={client.name} style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: '8px', backgroundColor: t.bg.elevated, padding: '4px' }} />
                    : <div style={{ width: 44, height: 44, borderRadius: '10px', backgroundColor: `${client.color}22`, border: `1px solid ${client.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '20px', fontWeight: '700', color: client.color }}>{client.name[0]}</span>
                      </div>
                  }
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '17px', fontWeight: '700', color: t.text.primary }}>{client.name}</div>
                    <div style={{ fontSize: '12px', color: t.text.muted }}>{client.category || 'Spirits Brand'}</div>
                  </div>

                  {/* Quick links */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {client.instagram && (
                      <a href={`https://instagram.com/${client.instagram.replace('@', '')}`} target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: t.text.muted, textDecoration: 'none', padding: '5px 10px', borderRadius: '6px', border: `1px solid ${t.border.default}` }}>
                        <Instagram size={13} /> {client.instagram.startsWith('@') ? client.instagram : `@${client.instagram}`}
                      </a>
                    )}
                    {client.website && (
                      <a href={client.website} target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: t.text.muted, textDecoration: 'none', padding: '5px 10px', borderRadius: '6px', border: `1px solid ${t.border.default}` }}>
                        <Globe size={13} /> Website
                      </a>
                    )}
                  </div>
                </div>

                {/* Brand brief */}
                {client.notes && (
                  <div style={{ marginBottom: '18px', padding: '14px 16px', backgroundColor: t.bg.elevated, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Brand Brief</div>
                    <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.6, margin: 0 }}>{client.notes}</p>
                  </div>
                )}

                {/* Contact info */}
                {(client.contact_name || client.contact_email) && (
                  <div style={{ marginBottom: '18px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Brand Contact</div>
                    <div style={{ fontSize: '13px', color: t.text.secondary }}>
                      {client.contact_name}
                      {client.contact_email && <> · <a href={`mailto:${client.contact_email}`} style={{ color: t.status.info, textDecoration: 'none' }}>{client.contact_email}</a></>}
                      {client.contact_phone && <> · {client.contact_phone}</>}
                    </div>
                  </div>
                )}

                {/* Assets & links */}
                {linkAssets.length > 0 && (
                  <div style={{ marginBottom: docAssets.length > 0 ? '14px' : 0 }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Assets & Links</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                      {linkAssets.map(asset => (
                        <a key={asset.id} href={asset.url!} target="_blank" rel="noreferrer" style={{
                          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
                          backgroundColor: t.bg.elevated, borderRadius: '8px', border: `1px solid ${t.border.default}`,
                          textDecoration: 'none', transition: 'border-color 150ms ease',
                        }}>
                          <ExternalLink size={13} color={client.color} style={{ flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: '500', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.title}</div>
                            {asset.asset_type && <div style={{ fontSize: '10px', color: t.text.muted }}>{asset.asset_type}</div>}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Non-link assets */}
                {docAssets.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>References</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {docAssets.map(asset => (
                        <div key={asset.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', backgroundColor: t.bg.elevated, borderRadius: '8px', border: `1px solid ${t.border.default}` }}>
                          <FileText size={13} color={t.text.muted} style={{ flexShrink: 0, marginTop: '1px' }} />
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: '500', color: t.text.primary }}>{asset.title}</div>
                            {asset.description && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{asset.description}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!client.notes && linkAssets.length === 0 && docAssets.length === 0 && (
                  <div style={{ fontSize: '13px', color: t.text.muted, fontStyle: 'italic' }}>No assets on file yet. Ask your manager to add brand guidelines and links.</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </LayoutShell>
  )
}
