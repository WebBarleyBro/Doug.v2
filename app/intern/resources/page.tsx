'use client'
import { useState, useEffect } from 'react'
import { BookOpen, ExternalLink } from 'lucide-react'
import LayoutShell from '../../layout-shell'
import { getClients, getProducts } from '../../lib/data'
import { getSupabase } from '../../lib/supabase'
import { t, card } from '../../lib/theme'
import type { Client, Product } from '../../lib/types'

interface BrandAsset {
  id: string
  client_slug: string
  title: string
  asset_type?: string
  url?: string
  description?: string
  created_at: string
}

interface ClientWithData {
  client: Client
  products: Product[]
  brandAssets: BrandAsset[]
}

export default function InternResourcesPage() {
  const [data, setData] = useState<ClientWithData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const sb = getSupabase()
      const clients = await getClients()

      const allData = await Promise.all(
        clients.map(async (client) => {
          const [products, brandAssetsRes] = await Promise.all([
            getProducts(client.slug),
            sb.from('brand_assets').select('*').eq('client_slug', client.slug).order('asset_type'),
          ])
          return {
            client,
            products,
            brandAssets: (brandAssetsRes.data || []) as BrandAsset[],
          }
        })
      )

      setData(allData)
      setLoading(false)
    }

    load().catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <LayoutShell>
        <div style={{ padding: '32px 48px', color: t.text.muted, fontSize: '14px' }}>Loading resources...</div>
      </LayoutShell>
    )
  }

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BookOpen size={20} /> Brand Resources
          </h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Brand info, products, and assets for each client</p>
        </div>

        {data.length === 0 ? (
          <div style={{ ...card, padding: '48px', textAlign: 'center', color: t.text.muted, fontSize: '14px' }}>
            No clients found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {data.map(({ client, products, brandAssets }) => (
              <div key={client.id} style={{ ...card, padding: '24px 28px' }}>
                {/* Client header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px', paddingBottom: '16px', borderBottom: `1px solid ${t.border.default}` }}>
                  <div style={{ width: 40, height: 40, borderRadius: '10px', backgroundColor: `${client.color}22`, border: `1px solid ${client.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: client.color }}>{client.name[0]}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary }}>{client.name}</div>
                    <div style={{ fontSize: '12px', color: t.text.muted }}>
                      {client.category || 'Spirits Brand'}
                      {client.territory ? ` · ${client.territory}` : ''}
                    </div>
                  </div>
                </div>

                {/* Notes / description */}
                {client.notes && (
                  <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.6, marginBottom: '16px' }}>
                    {client.notes}
                  </p>
                )}

                {/* Products */}
                {products.length > 0 && (
                  <div style={{ marginBottom: '18px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                      Products ({products.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {products.map(p => (
                        <div key={p.id} style={{
                          padding: '7px 14px', borderRadius: '8px',
                          backgroundColor: t.bg.elevated,
                          border: `1px solid ${t.border.default}`,
                        }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: t.text.primary }}>{p.name}</div>
                          {p.category && <div style={{ fontSize: '11px', color: t.text.muted }}>{p.category}</div>}
                          {p.price && <div style={{ fontSize: '11px', color: t.gold }}>${p.price}/case</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Brand assets */}
                {brandAssets.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                      Brand Assets ({brandAssets.length})
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                      {brandAssets.map(asset => (
                        <a
                          key={asset.id}
                          href={asset.url || '#'}
                          target={asset.url ? '_blank' : undefined}
                          rel="noreferrer"
                          style={{
                            ...card,
                            padding: '14px 16px',
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            cursor: asset.url ? 'pointer' : 'default',
                            transition: 'border-color 150ms ease',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: '500', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {asset.title}
                            </div>
                            {asset.asset_type && (
                              <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{asset.asset_type}</div>
                            )}
                            {asset.description && (
                              <div style={{ fontSize: '11px', color: t.text.secondary, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {asset.description}
                              </div>
                            )}
                          </div>
                          {asset.url && <ExternalLink size={13} color={t.text.muted} style={{ flexShrink: 0 }} />}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {products.length === 0 && brandAssets.length === 0 && (
                  <div style={{ fontSize: '13px', color: t.text.muted, fontStyle: 'italic' }}>No products or assets on file yet.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
