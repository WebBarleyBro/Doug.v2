'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Settings, AlertTriangle, X, ChevronRight } from 'lucide-react'
import LayoutShell, { useToast } from '../layout-shell'
import { t, card } from '../lib/theme'
import { getClients } from '../lib/data'
import { getAllZones, getLatestSnapshotsByZone } from '../lib/concentric/data'
import { PostureBadge, healthColor, healthBg, channelLabel } from './_components'
import type { Zone, Market, ZoneMetricSnapshot } from '../lib/concentric/types'
import type { Client } from '../lib/types'

type ZoneWithMarket = Zone & { markets: Market }

const POSTURE_ORDER: Zone['posture'][] = ['active', 'maintaining', 'monitoring', 'opportunistic']

function ZoneCard({ zone, snapshot, client }: {
  zone: ZoneWithMarket
  snapshot: ZoneMetricSnapshot | null
  client: Client | undefined
}) {
  const hs = snapshot?.health_score ?? null
  const color = healthColor(hs)
  const bg = healthBg(hs)
  const clientColor = client?.color || t.gold

  const reach = snapshot?.reach_pct
  const vel = snapshot?.velocity_index
  const ret = snapshot?.retention_pct
  const accounts = snapshot?.target_set_size ?? 0
  const active = snapshot?.active_accounts ?? 0

  return (
    <Link href={`/growth/zones/${zone.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        borderRadius: '14px',
        overflow: 'hidden',
        border: `1px solid ${t.border.default}`,
        backgroundColor: t.bg.elevated,
        transition: 'border-color 150ms ease, transform 150ms ease',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = t.border.hover
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = t.border.default
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
        }}
      >
        {/* Top color bar */}
        <div style={{ height: '3px', backgroundColor: color, opacity: hs === null ? 0.2 : 1 }} />

        {/* Zone header */}
        <div style={{ padding: '18px 20px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Client + market label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{
                  fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '4px',
                  backgroundColor: clientColor + '20', color: clientColor,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {client?.name || zone.markets?.client_slug}
                </span>
                <span style={{ fontSize: '11px', color: t.text.muted }}>{zone.markets?.name}</span>
              </div>
              {/* Zone name */}
              <div style={{ fontSize: '19px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                {zone.name}
              </div>
            </div>
            <PostureBadge posture={zone.posture} size="xs" />
          </div>

          {/* Phase + channel */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{
              fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '4px',
              backgroundColor: t.bg.input, color: t.text.muted, border: `1px solid ${t.border.subtle}`,
            }}>
              Phase {zone.phase}
            </span>
            <span style={{
              fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '4px',
              backgroundColor: t.bg.input, color: t.text.muted, border: `1px solid ${t.border.subtle}`,
            }}>
              {channelLabel(zone.channel)}
            </span>
          </div>
        </div>

        {/* Health score — the hero */}
        <div style={{
          margin: '0 16px',
          borderRadius: '10px',
          backgroundColor: bg,
          border: `1px solid ${color}25`,
          padding: '20px 16px',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: '52px', fontWeight: '900', color, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {hs !== null ? Math.round(hs) : '—'}
          </div>
          <div style={{ fontSize: '9px', fontWeight: '700', color, marginTop: '4px', letterSpacing: '0.12em', opacity: 0.8 }}>
            HEALTH SCORE
          </div>
        </div>

        {/* Metrics row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '14px 20px 10px', gap: '1px' }}>
          {[
            { label: 'REACH', value: reach != null ? `${Math.round(reach)}%` : '—' },
            { label: 'VELOCITY', value: vel != null ? `${Math.round(vel)}` : '—' },
            { label: 'RETENTION', value: ret != null ? `${Math.round(ret)}%` : '—' },
          ].map((m, i) => (
            <div key={m.label} style={{
              textAlign: 'center',
              borderLeft: i > 0 ? `1px solid ${t.border.subtle}` : 'none',
              paddingLeft: i > 0 ? '8px' : '0',
            }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary, lineHeight: 1 }}>
                {m.value}
              </div>
              <div style={{ fontSize: '9px', fontWeight: '600', color: t.text.muted, marginTop: '3px', letterSpacing: '0.08em' }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 'auto',
          padding: '10px 20px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '12px', color: t.text.muted }}>
            {accounts} accounts · {active} active
          </span>
          <ChevronRight size={14} color={t.text.muted} />
        </div>
      </div>
    </Link>
  )
}

function NewZoneCard() {
  return (
    <Link href="/growth/zones/new" style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
      <div style={{
        borderRadius: '14px', height: '100%', minHeight: '240px',
        border: `2px dashed ${t.border.default}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '10px', cursor: 'pointer', transition: 'border-color 150ms ease',
        backgroundColor: 'transparent',
      }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = t.gold}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = t.border.default}
      >
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Plus size={18} color={t.gold} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: t.text.secondary }}>New Zone</div>
          <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>Add a focus area</div>
        </div>
      </div>
    </Link>
  )
}

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '14px 20px', borderRadius: '10px',
      backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`,
      flex: 1, minWidth: '100px',
    }}>
      <div style={{ fontSize: '22px', fontWeight: '800', color: color || t.text.primary, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: '10px', fontWeight: '600', color: t.text.muted, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>
        {label}
      </div>
    </div>
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

  const clientsWithZones = clients.filter(c => zones.some(z => z.markets?.client_slug === c.slug))

  const visibleZones = filterClient
    ? zones.filter(z => z.markets?.client_slug === filterClient)
    : zones

  // Sort: active first, then maintaining, monitoring, opportunistic; within posture by health desc
  const sortedZones = [...visibleZones].sort((a, b) => {
    const pi = POSTURE_ORDER.indexOf(a.posture) - POSTURE_ORDER.indexOf(b.posture)
    if (pi !== 0) return pi
    const hs_a = snapshots[a.id]?.health_score ?? -1
    const hs_b = snapshots[b.id]?.health_score ?? -1
    return hs_b - hs_a
  })

  // Stats
  const activeCount = zones.filter(z => z.posture === 'active' || z.posture === 'maintaining').length
  const healthScores = zones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
  const avgHealth = healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : null
  const totalAccounts = Object.values(snapshots).reduce((s, snap) => s + (snap.target_set_size ?? 0), 0)

  // Needs attention items (active/maintaining zones with health < 50 or empty target set)
  const now = Date.now()
  const attentionItems = zones.flatMap(z => {
    const snap = snapshots[z.id]
    const items: { id: string; title: string; sub: string; href: string }[] = []
    const hs = snap?.health_score ?? null
    if ((z.posture === 'active' || z.posture === 'maintaining') && hs !== null && hs < 50) {
      const key = `low:${z.id}`
      if (!dismissed[key] || dismissed[key] < now) {
        items.push({ id: key, href: `/growth/zones/${z.id}`,
          title: `${z.name} — Health ${Math.round(hs)}`,
          sub: `${z.markets?.name} · ${z.posture}`,
        })
      }
    }
    if (z.posture === 'active' && (snap?.target_set_size ?? 0) === 0) {
      const key = `empty:${z.id}`
      if (!dismissed[key] || dismissed[key] < now) {
        items.push({ id: key, href: `/growth/zones/${z.id}`,
          title: `${z.name} — No accounts in Target Set`,
          sub: `${z.markets?.name} · active zone with no targets`,
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

  return (
    <LayoutShell>
      <div style={{ padding: '32px 40px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '900', color: t.text.primary, letterSpacing: '-0.03em', marginBottom: '4px' }}>
              Growth
            </h1>
            <p style={{ fontSize: '13px', color: t.text.muted }}>
              {zones.length} zone{zones.length !== 1 ? 's' : ''} across {clientsWithZones.length} client{clientsWithZones.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Link href="/growth/markets" style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '7px 12px', borderRadius: '8px', fontSize: '12px',
              backgroundColor: 'transparent', border: `1px solid ${t.border.default}`,
              color: t.text.muted, textDecoration: 'none',
            }}>
              <Settings size={12} /> Manage Markets
            </Link>
            <Link href="/growth/zones/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '9px 18px', borderRadius: '9px', fontSize: '13px', fontWeight: '700',
              backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none',
            }}>
              <Plus size={14} /> New Zone
            </Link>
          </div>
        </div>

        {/* Stats row */}
        {zones.length > 0 && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <StatPill label="Total Zones" value={zones.length} />
            <StatPill label="Active / Maintaining" value={activeCount} color={t.gold} />
            <StatPill
              label="Avg Health"
              value={avgHealth !== null ? avgHealth : '—'}
              color={avgHealth !== null ? healthColor(avgHealth) : t.text.muted}
            />
            <StatPill label="Total Accounts" value={totalAccounts} />
          </div>
        )}

        {/* Client filter tabs */}
        {clientsWithZones.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <button
              onClick={() => router.push('/growth')}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                cursor: 'pointer',
                border: `1px solid ${!filterClient ? t.gold : t.border.default}`,
                backgroundColor: !filterClient ? t.goldDim : 'transparent',
                color: !filterClient ? t.gold : t.text.muted,
              }}>
              All
            </button>
            {clientsWithZones.map(c => (
              <button
                key={c.slug}
                onClick={() => router.push(`/growth?client=${c.slug}`)}
                style={{
                  padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  border: `1px solid ${filterClient === c.slug ? (c.color || t.gold) : t.border.default}`,
                  backgroundColor: filterClient === c.slug ? (c.color || t.gold) + '20' : 'transparent',
                  color: filterClient === c.slug ? (c.color || t.gold) : t.text.muted,
                }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: c.color || t.gold, display: 'inline-block', flexShrink: 0 }} />
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Zone cards */}
        {sortedZones.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '100px 24px',
            border: `2px dashed ${t.border.default}`, borderRadius: '16px',
          }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: t.text.secondary, marginBottom: '10px' }}>
              No zones yet
            </div>
            <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '28px' }}>
              A zone is a focus area — like On-Premise in Northern Colorado.
              <br />Start by creating a market, then add zones to it.
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <Link href="/growth/markets/new" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '9px 18px', borderRadius: '8px', fontWeight: '600', fontSize: '13px',
                border: `1px solid ${t.border.default}`, backgroundColor: t.bg.elevated,
                color: t.text.secondary, textDecoration: 'none',
              }}>
                <Plus size={13} /> New Market
              </Link>
              <Link href="/growth/zones/new" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '9px 18px', borderRadius: '8px', fontWeight: '600', fontSize: '13px',
                backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none',
              }}>
                <Plus size={13} /> New Zone
              </Link>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
            alignItems: 'stretch',
          }}>
            {sortedZones.map(z => (
              <ZoneCard
                key={z.id}
                zone={z}
                snapshot={snapshots[z.id] ?? null}
                client={clients.find(c => c.slug === z.markets?.client_slug)}
              />
            ))}
            <NewZoneCard />
          </div>
        )}

        {/* Needs Attention */}
        {attentionItems.length > 0 && (
          <div style={{ marginTop: '36px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <AlertTriangle size={14} color={t.status.warning} />
              <span style={{ fontSize: '12px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Needs Attention
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {attentionItems.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', borderRadius: '10px',
                  backgroundColor: t.status.warningBg,
                  border: `1px solid rgba(233,153,40,0.2)`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={item.href} style={{ textDecoration: 'none' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{item.title}</div>
                      <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{item.sub}</div>
                    </Link>
                  </div>
                  <button onClick={() => dismiss(item.id)} style={{
                    flexShrink: 0, padding: '4px 10px', fontSize: '11px', borderRadius: '6px',
                    cursor: 'pointer', border: `1px solid rgba(233,153,40,0.3)`,
                    backgroundColor: 'transparent', color: t.status.warning,
                  }}>
                    Snooze 7d
                  </button>
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
