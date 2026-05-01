'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Star, MapPin } from 'lucide-react'
import LayoutShell from '../../layout-shell'
import { t, card } from '../../lib/theme'
import { getClients } from '../../lib/data'
import { getMarkets, getAllZones, getLatestSnapshotsByZone } from '../../lib/concentric/data'
import { healthColor, channelLabel } from '../_components'
import type { Market, Zone, ZoneMetricSnapshot } from '../../lib/concentric/types'
import type { Client } from '../../lib/types'

function MarketsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [markets, setMarkets] = useState<Market[]>([])
  const [zones, setZones] = useState<(Zone & { markets: Market })[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, ZoneMetricSnapshot>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  const filterClient = searchParams.get('client') ?? ''
  const filterSearch = searchParams.get('q') ?? ''
  const filterPriority = searchParams.get('priority') === 'true'

  const load = useCallback(async () => {
    try {
      const [allMarkets, allZones, allClients] = await Promise.all([
        getMarkets(), getAllZones(), getClients(),
      ])
      const snaps = await getLatestSnapshotsByZone(allZones.map(z => z.id))
      setMarkets(allMarkets)
      setZones(allZones)
      setClients(allClients)
      setSnapshots(snaps)
    } catch (e) { console.error('markets.load', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function setFilter(key: string, val: string | boolean) {
    const p = new URLSearchParams(searchParams.toString())
    if (val) { p.set(key, String(val)) } else { p.delete(key) }
    router.push(`/growth/markets?${p.toString()}`)
  }

  const filtered = markets.filter(m => {
    if (filterPriority && !m.priority) return false
    if (filterSearch && !m.name.toLowerCase().includes(filterSearch.toLowerCase())) return false
    if (filterClient) {
      // Filter to territories that have zones for this client
      const mz = zones.filter(z => z.market_id === m.id && z.client_slug === filterClient)
      if (mz.length === 0) return false
    }
    return true
  })

  function marketZones(marketId: string) {
    return zones.filter(z => z.market_id === marketId)
  }

  function avgHealth(marketId: string): number | null {
    const mz = zones.filter(z => z.market_id === marketId)
    const scores = mz.map(z => snapshots[z.id]?.health_score ?? null).filter((s): s is number => s !== null)
    if (scores.length === 0) return null
    return scores.reduce((a, b) => a + b, 0) / scores.length
  }

  return (
    <LayoutShell>
      <div style={{ padding: '28px 40px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Link href="/growth" style={{ color: t.text.muted, textDecoration: 'none', fontSize: '13px' }}>← Growth</Link>
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.02em', marginTop: '6px' }}>Territories</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>
              Geographic areas that group focus areas · {filtered.length} territor{filtered.length !== 1 ? 'ies' : 'y'}
            </p>
          </div>
          <Link href="/growth/markets/new" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '9px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px',
            backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none',
          }}>
            <Plus size={14} /> New Territory
          </Link>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text" placeholder="Search territories…"
            value={filterSearch}
            onChange={e => setFilter('q', e.target.value)}
            style={{
              padding: '6px 12px', borderRadius: '7px', fontSize: '13px',
              border: `1px solid ${t.border.default}`, backgroundColor: t.bg.input,
              color: t.text.primary, outline: 'none',
            }}
          />
          <select value={filterClient} onChange={e => setFilter('client', e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '7px', fontSize: '12px', border: `1px solid ${t.border.default}`, backgroundColor: t.bg.input, color: t.text.secondary, outline: 'none' }}>
            <option value="">All Brands</option>
            {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <button onClick={() => setFilter('priority', !filterPriority)} style={{
            padding: '6px 10px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer',
            border: `1px solid ${filterPriority ? t.gold : t.border.default}`,
            backgroundColor: filterPriority ? t.goldDim : 'transparent',
            color: filterPriority ? t.gold : t.text.secondary,
          }}>
            ★ Priority only
          </button>
        </div>

        {loading ? (
          <div style={{ color: t.text.muted, padding: '48px', textAlign: 'center' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <MapPin size={36} color={t.border.hover} style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary, marginBottom: '8px' }}>No territories found</div>
            <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '20px' }}>
              {markets.length === 0
                ? 'Create your first territory to define a geographic area.'
                : 'Try adjusting your filters.'}
            </div>
            {markets.length === 0 && (
              <Link href="/growth/markets/new" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '9px 18px', borderRadius: '8px', fontWeight: '600', fontSize: '13px',
                backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none',
              }}>
                <Plus size={14} /> Create First Territory
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
            {filtered.map(m => {
              const mzones = marketZones(m.id)
              const health = avgHealth(m.id)
              const geo = [
                ...(m.cities?.slice(0, 2) ?? []),
                m.counties?.length ? `${m.counties.length} count${m.counties.length !== 1 ? 'ies' : 'y'}` : '',
                ...(m.states ?? []),
              ].filter(Boolean).join(', ')
              // Distinct clients in this territory
              const zoneClients = [...new Set(mzones.map(z => z.client_slug).filter(Boolean))] as string[]

              return (
                <Link key={m.id} href={`/growth/markets/${m.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    ...card, padding: '16px 18px', cursor: 'pointer',
                    borderLeft: `3px solid ${t.gold}`,
                    transition: 'border-color 150ms ease',
                  }}>
                    {/* Client dots */}
                    {zoneClients.length > 0 && (
                      <div style={{ display: 'flex', gap: '5px', marginBottom: '6px' }}>
                        {zoneClients.map(slug => {
                          const cl = clients.find(c => c.slug === slug)
                          return cl ? (
                            <span key={slug} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: cl.color || t.gold, fontWeight: '700' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: cl.color || t.gold, display: 'inline-block' }} />
                              {cl.name}
                            </span>
                          ) : null
                        })}
                      </div>
                    )}
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                          {m.priority && <Star size={12} color={t.gold} fill={t.gold} />}
                          <span style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>{m.name}</span>
                        </div>
                        {geo ? (
                          <span style={{ fontSize: '11px', color: t.text.muted }}>{geo}</span>
                        ) : (
                          <span style={{ fontSize: '11px', color: t.border.hover, fontStyle: 'italic' }}>No location set</span>
                        )}
                      </div>
                      {health !== null && (
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                          <div style={{ fontSize: '22px', fontWeight: '800', color: healthColor(health), lineHeight: 1 }}>
                            {Math.round(health)}
                          </div>
                          <div style={{ fontSize: '9px', color: t.text.muted, fontWeight: '600' }}>AVG HEALTH</div>
                        </div>
                      )}
                    </div>

                    {/* Focus area chips */}
                    {mzones.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
                        {mzones.map(z => {
                          const zSnap = snapshots[z.id]
                          const hs = zSnap?.health_score ?? null
                          const zClient = clients.find(c => c.slug === z.client_slug)
                          return (
                            <div key={z.id} style={{
                              display: 'flex', alignItems: 'center', gap: '5px',
                              padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
                              backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`,
                            }}>
                              {zClient && <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: zClient.color || t.gold, display: 'inline-block' }} />}
                              <span style={{ color: t.text.secondary }}>{channelLabel(z.channel)}</span>
                              {hs !== null && (
                                <span style={{ color: healthColor(hs), fontWeight: '700' }}>{Math.round(hs)}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: t.text.muted, fontStyle: 'italic', marginTop: '8px' }}>No focus areas yet</div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </LayoutShell>
  )
}

export default function MarketsPage() {
  return <Suspense><MarketsContent /></Suspense>
}
