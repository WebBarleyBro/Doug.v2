'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Settings, AlertTriangle, ChevronRight } from 'lucide-react'
import LayoutShell from '../layout-shell'
import { t, card } from '../lib/theme'
import { getClients } from '../lib/data'
import { getAllZones, getLatestSnapshotsByZone } from '../lib/concentric/data'
import { PostureBadge, healthColor, healthBg, channelLabel } from './_components'
import type { Zone, Market, ZoneMetricSnapshot } from '../lib/concentric/types'
import type { Client } from '../lib/types'

type ZoneWithMarket = Zone & { markets: Market }

const POSTURE_ORDER: Zone['posture'][] = ['active', 'maintaining', 'monitoring', 'opportunistic']

function MarketCard({ zone, snapshot, client }: {
  zone: ZoneWithMarket
  snapshot: ZoneMetricSnapshot | null
  client: Client | undefined
}) {
  const hs = snapshot?.health_score ?? null
  const color = healthColor(hs)
  const bg = healthBg(hs)

  return (
    <Link href={`/growth/zones/${zone.id}`} style={{ textDecoration: 'none', display: 'block', width: '280px', flexShrink: 0 }}>
      <div style={{
        borderRadius: '14px', overflow: 'hidden',
        border: `1px solid ${t.border.default}`,
        backgroundColor: t.bg.elevated,
        transition: 'border-color 150ms, transform 150ms',
        cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = color
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = t.border.default
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
        }}
      >
        {/* Color bar */}
        <div style={{ height: '3px', backgroundColor: color, opacity: hs === null ? 0.15 : 0.8 }} />

        {/* Header */}
        <div style={{ padding: '16px 18px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {/* Territory + channel */}
            <div>
              <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '5px', fontWeight: '500' }}>
                {zone.markets?.name} · Ph.{zone.phase}
              </div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                {zone.name}
              </div>
            </div>
            <PostureBadge posture={zone.posture} size="xs" />
          </div>
        </div>

        {/* Health score */}
        <div style={{
          margin: '0 14px', borderRadius: '10px', padding: '18px 12px',
          backgroundColor: bg, border: `1px solid ${color}20`,
          textAlign: 'center', flexShrink: 0,
        }}>
          <div style={{ fontSize: '48px', fontWeight: '900', color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {hs !== null ? Math.round(hs) : '—'}
          </div>
          <div style={{ fontSize: '9px', fontWeight: '700', color, marginTop: '3px', letterSpacing: '0.12em', opacity: 0.7 }}>
            HEALTH
          </div>
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '12px 18px 8px' }}>
          {[
            { label: 'REACH', v: snapshot?.reach_pct },
            { label: 'VEL IDX', v: snapshot?.velocity_index },
            { label: 'RETENTION', v: snapshot?.retention_pct },
          ].map((m, i) => (
            <div key={m.label} style={{
              textAlign: 'center',
              borderLeft: i > 0 ? `1px solid ${t.border.subtle}` : 'none',
            }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>
                {m.v != null ? `${Math.round(m.v)}${m.label !== 'VEL IDX' ? '%' : ''}` : '—'}
              </div>
              <div style={{ fontSize: '8px', fontWeight: '600', color: t.text.muted, marginTop: '2px', letterSpacing: '0.07em' }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 'auto', padding: '8px 18px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: t.text.muted }}>
            {snapshot?.target_set_size ?? 0} accounts · {snapshot?.active_accounts ?? 0} active
          </span>
          <ChevronRight size={13} color={t.text.muted} />
        </div>
      </div>
    </Link>
  )
}

function AddMarketCard({ clientSlug }: { clientSlug: string }) {
  return (
    <Link href={`/growth/zones/new?client=${clientSlug}`} style={{ textDecoration: 'none', display: 'block', width: '200px', flexShrink: 0 }}>
      <div style={{
        borderRadius: '14px', height: '100%', minHeight: '200px',
        border: `2px dashed ${t.border.default}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '8px', cursor: 'pointer', transition: 'border-color 150ms, background 150ms',
        backgroundColor: 'transparent',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = t.gold
          ;(e.currentTarget as HTMLElement).style.backgroundColor = t.goldDim
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = t.border.default
          ;(e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
        }}
      >
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Plus size={16} color={t.gold} />
        </div>
        <div style={{ fontSize: '12px', fontWeight: '600', color: t.text.muted, textAlign: 'center' }}>
          Add focus area
        </div>
      </div>
    </Link>
  )
}

function GrowthDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [zones, setZones] = useState<ZoneWithMarket[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, ZoneMetricSnapshot>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Record<string, number>>({})

  const filterClient = searchParams.get('client') ?? ''

  useEffect(() => {
    try {
      const raw = localStorage.getItem('growth_dismissed')
      if (raw) setDismissed(JSON.parse(raw))
    } catch {}
  }, [])

  const load = useCallback(async () => {
    try {
      const [allZones, allClients] = await Promise.all([getAllZones(), getClients()])
      const snaps = await getLatestSnapshotsByZone(allZones.map(z => z.id))
      setZones(allZones)
      setClients(allClients)
      setSnapshots(snaps)
    } catch (e) { console.error('growth.overview', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function dismiss(id: string) {
    const exp = Date.now() + 7 * 24 * 60 * 60 * 1000
    const next = { ...dismissed, [id]: exp }
    setDismissed(next)
    try { localStorage.setItem('growth_dismissed', JSON.stringify(next)) } catch {}
  }

  // Group zones by client slug, sorted by posture then health
  const clientsWithZones = clients.filter(c => zones.some(z => z.markets?.client_slug === c.slug))
  const visibleClients = filterClient
    ? clientsWithZones.filter(c => c.slug === filterClient)
    : clientsWithZones
  // Also include any client slugs not in clients list
  const allClientSlugs = [...new Set(zones.map(z => z.markets?.client_slug).filter(Boolean))]

  function zonesForClient(slug: string) {
    return zones
      .filter(z => z.markets?.client_slug === slug)
      .sort((a, b) => {
        const pi = POSTURE_ORDER.indexOf(a.posture) - POSTURE_ORDER.indexOf(b.posture)
        if (pi !== 0) return pi
        return (snapshots[b.id]?.health_score ?? -1) - (snapshots[a.id]?.health_score ?? -1)
      })
  }

  // Needs attention
  const now = Date.now()
  const attentionItems = zones.flatMap(z => {
    const snap = snapshots[z.id]
    const items: { id: string; title: string; sub: string; href: string }[] = []
    const hs = snap?.health_score ?? null
    if ((z.posture === 'active' || z.posture === 'maintaining') && hs !== null && hs < 50) {
      const key = `low:${z.id}`
      if (!dismissed[key] || dismissed[key] < now) {
        items.push({ id: key, href: `/growth/zones/${z.id}`,
          title: `${z.name} (${z.markets?.name}) — Health Score ${Math.round(hs)}`,
          sub: z.posture,
        })
      }
    }
    if (z.posture === 'active' && (snap?.target_set_size ?? 0) === 0) {
      const key = `empty:${z.id}`
      if (!dismissed[key] || dismissed[key] < now) {
        items.push({ id: key, href: `/growth/zones/${z.id}`,
          title: `${z.name} (${z.markets?.name}) — No accounts in focus set`,
          sub: 'Active with no target accounts',
        })
      }
    }
    return items
  })

  if (loading) return (
    <LayoutShell>
      <div style={{ padding: '80px', textAlign: 'center', color: t.text.muted }}>Loading…</div>
    </LayoutShell>
  )

  const hasAnyZones = zones.length > 0

  return (
    <LayoutShell>
      <div style={{ padding: '32px 40px', maxWidth: '1300px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '900', color: t.text.primary, letterSpacing: '-0.03em', marginBottom: '4px' }}>
              Growth
            </h1>
            <p style={{ fontSize: '13px', color: t.text.muted }}>
              Track where each client is winning and where they need work
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Link href="/growth/markets" style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '7px 12px', borderRadius: '8px', fontSize: '12px',
              border: `1px solid ${t.border.default}`, backgroundColor: 'transparent',
              color: t.text.muted, textDecoration: 'none',
            }}>
              <Settings size={12} /> Territories
            </Link>
            <Link href="/growth/zones/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '9px 18px', borderRadius: '9px', fontSize: '13px', fontWeight: '700',
              backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none',
            }}>
              <Plus size={14} /> Add Focus Area
            </Link>
          </div>
        </div>

        {/* Client filter */}
        {clientsWithZones.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '28px' }}>
            <button onClick={() => router.push('/growth')} style={{
              padding: '6px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              border: `1px solid ${!filterClient ? t.gold : t.border.default}`,
              backgroundColor: !filterClient ? t.goldDim : 'transparent',
              color: !filterClient ? t.gold : t.text.muted,
            }}>All clients</button>
            {clientsWithZones.map(c => (
              <button key={c.slug} onClick={() => router.push(`/growth?client=${c.slug}`)} style={{
                padding: '6px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                border: `1px solid ${filterClient === c.slug ? (c.color || t.gold) : t.border.default}`,
                backgroundColor: filterClient === c.slug ? (c.color || t.gold) + '18' : 'transparent',
                color: filterClient === c.slug ? (c.color || t.gold) : t.text.muted,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.color || t.gold, display: 'inline-block' }} />
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!hasAnyZones && (
          <div style={{
            textAlign: 'center', padding: '100px 24px',
            border: `2px dashed ${t.border.default}`, borderRadius: '16px',
          }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: t.text.secondary, marginBottom: '10px' }}>
              No focus areas yet
            </div>
            <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '8px', maxWidth: '420px', margin: '0 auto 24px' }}>
              A focus area is where you're actively working a brand — like "NoCo On-Premise in Northern Colorado."
              Start by setting up a territory, then add your on-premise and off-premise focus areas.
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <Link href="/growth/markets/new" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '9px 18px', borderRadius: '8px', fontWeight: '600', fontSize: '13px',
                border: `1px solid ${t.border.default}`, backgroundColor: t.bg.elevated,
                color: t.text.secondary, textDecoration: 'none',
              }}>
                <Plus size={13} /> New Territory
              </Link>
              <Link href="/growth/zones/new" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '9px 18px', borderRadius: '8px', fontWeight: '600', fontSize: '13px',
                backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none',
              }}>
                <Plus size={13} /> Add Focus Area
              </Link>
            </div>
          </div>
        )}

        {/* Client sections */}
        {visibleClients.map((client, ci) => {
          const clientZones = zonesForClient(client.slug)
          const clientColor = client.color || t.gold
          const healthScores = clientZones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
          const avgHealth = healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : null

          return (
            <div key={client.slug} style={{ marginBottom: ci < visibleClients.length - 1 ? '44px' : '0' }}>
              {/* Client header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: clientColor, flexShrink: 0 }} />
                  <span style={{ fontSize: '16px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.01em' }}>
                    {client.name}
                  </span>
                  <div style={{ height: '1px', flex: 1, backgroundColor: t.border.subtle }} />
                  {avgHealth !== null && (
                    <span style={{ fontSize: '12px', color: healthColor(avgHealth), fontWeight: '700' }}>
                      avg {avgHealth}
                    </span>
                  )}
                </div>
              </div>

              {/* Horizontal scrollable zone row */}
              <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '6px' }}>
                {clientZones.map(z => (
                  <MarketCard
                    key={z.id}
                    zone={z}
                    snapshot={snapshots[z.id] ?? null}
                    client={client}
                  />
                ))}
                <AddMarketCard clientSlug={client.slug} />
              </div>
            </div>
          )
        })}

        {/* Show clients that have no zones (so reps know to add) */}
        {!filterClient && clients.filter(c => !clientsWithZones.find(cz => cz.slug === c.slug)).map(c => (
          <div key={c.slug} style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: c.color || t.gold }} />
              <span style={{ fontSize: '16px', fontWeight: '800', color: t.text.secondary }}>{c.name}</span>
              <div style={{ height: '1px', flex: 1, backgroundColor: t.border.subtle }} />
              <span style={{ fontSize: '11px', color: t.text.muted }}>no focus areas yet</span>
            </div>
            <AddMarketCard clientSlug={c.slug} />
          </div>
        ))}

        {/* Needs Attention */}
        {attentionItems.length > 0 && (
          <div style={{ marginTop: '44px', padding: '20px 24px', borderRadius: '12px', backgroundColor: t.status.warningBg, border: `1px solid rgba(233,153,40,0.2)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <AlertTriangle size={14} color={t.status.warning} />
              <span style={{ fontSize: '12px', fontWeight: '700', color: t.status.warning, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Needs Attention
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {attentionItems.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <Link href={item.href} style={{ textDecoration: 'none' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{item.title}</span>
                      <span style={{ fontSize: '11px', color: t.text.muted, marginLeft: '8px' }}>{item.sub}</span>
                    </Link>
                  </div>
                  <button onClick={() => dismiss(item.id)} style={{
                    flexShrink: 0, padding: '3px 10px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer',
                    border: `1px solid rgba(233,153,40,0.3)`, backgroundColor: 'transparent', color: t.status.warning,
                  }}>Snooze</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  )
}

export default function GrowthPage() {
  return <Suspense><GrowthDashboardContent /></Suspense>
}
