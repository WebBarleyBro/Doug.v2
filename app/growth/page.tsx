'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Settings, AlertTriangle, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import LayoutShell from '../layout-shell'
import { t } from '../lib/theme'
import { getClients } from '../lib/data'
import { getAllZones, getLatestSnapshotsByZone } from '../lib/concentric/data'
import { PostureBadge, healthColor, healthBg, channelLabel } from './_components'
import type { Zone, Market, ZoneMetricSnapshot } from '../lib/concentric/types'
import type { Client } from '../lib/types'

type ZoneWithMarket = Zone & { markets: Market }

const POSTURE_ORDER: Zone['posture'][] = ['active', 'maintaining', 'monitoring', 'opportunistic']

function StatTile({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      flex: 1, padding: '20px 24px',
      borderRight: `1px solid ${t.border.subtle}`,
    }}>
      <div style={{ fontSize: '32px', fontWeight: '900', color: color || t.text.primary, letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, marginTop: '5px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

function MetricBar({ label, value, threshold }: { label: string; value: number | null | undefined; threshold?: number }) {
  const v = value ?? null
  const pct = v !== null ? Math.min(Math.round(v), 100) : null
  const color = v !== null ? healthColor(v) : t.border.subtle
  const isAbove = threshold != null && v !== null && v >= threshold

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, letterSpacing: '0.1em' }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: '800', color: pct !== null ? color : t.text.muted }}>
          {pct !== null ? `${pct}%` : '—'}
        </span>
      </div>
      <div style={{ height: '3px', borderRadius: '2px', backgroundColor: t.border.subtle, overflow: 'hidden' }}>
        {pct !== null && (
          <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: '2px', transition: 'width 400ms ease' }} />
        )}
      </div>
      {threshold != null && pct !== null && (
        <div style={{ fontSize: '9px', color: isAbove ? healthColor(80) : t.status.warning, marginTop: '2px' }}>
          {isAbove ? `↑ ${Math.round(v! - threshold)}% above target` : `↓ ${Math.round(threshold - v!)}% below target`}
        </div>
      )}
    </div>
  )
}

function ZoneCard({ zone, snapshot }: { zone: ZoneWithMarket; snapshot: ZoneMetricSnapshot | null }) {
  const [hovered, setHovered] = useState(false)
  const hs = snapshot?.health_score ?? null
  const color = healthColor(hs)
  const bg = healthBg(hs)
  const trend = snapshot ? null : null // trend_30d not in snapshot type here

  return (
    <Link href={`/growth/zones/${zone.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          borderRadius: '14px', overflow: 'hidden',
          border: `1px solid ${hovered ? color + '60' : t.border.default}`,
          backgroundColor: t.bg.elevated,
          transition: 'border-color 150ms, transform 150ms, box-shadow 150ms',
          cursor: 'pointer', display: 'flex', flexDirection: 'column',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          boxShadow: hovered ? `0 8px 24px rgba(0,0,0,0.3)` : 'none',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Top accent bar */}
        <div style={{ height: '3px', backgroundColor: color, opacity: hs === null ? 0.15 : 1 }} />

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{zone.markets?.name}</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>Phase {zone.phase}</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{channelLabel(zone.channel)}</span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {zone.name}
            </div>
          </div>
          <PostureBadge posture={zone.posture} size="xs" />
        </div>

        {/* Health score */}
        <div style={{
          margin: '0 16px', borderRadius: '10px', padding: '16px 20px',
          backgroundColor: bg, border: `1px solid ${color}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '52px', fontWeight: '900', color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {hs !== null ? Math.round(hs) : '—'}
            </div>
            <div style={{ fontSize: '9px', fontWeight: '700', color, marginTop: '3px', letterSpacing: '0.12em', opacity: 0.7 }}>
              HEALTH SCORE
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: '800', color: t.text.secondary }}>
              {snapshot?.active_accounts ?? 0}
              <span style={{ fontSize: '12px', color: t.text.muted, fontWeight: '500' }}> active</span>
            </div>
            <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>
              of {snapshot?.target_set_size ?? 0} targets
            </div>
          </div>
        </div>

        {/* Metric bars */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <MetricBar label="REACH" value={snapshot?.reach_pct} />
          <MetricBar label="VELOCITY INDEX" value={snapshot?.velocity_index} />
          <MetricBar label="RETENTION" value={snapshot?.retention_pct} />
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px 16px',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          marginTop: 'auto',
        }}>
          <span style={{ fontSize: '11px', color: color, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', opacity: hovered ? 1 : 0.6, transition: 'opacity 150ms' }}>
            Open focus area <ChevronRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  )
}

function AddZoneCard({ clientSlug }: { clientSlug: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <Link href={`/growth/zones/new?client=${clientSlug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          borderRadius: '14px', minHeight: '260px',
          border: `2px dashed ${hovered ? t.gold : t.border.default}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '10px', cursor: 'pointer',
          transition: 'border-color 150ms, background 150ms',
          backgroundColor: hovered ? t.goldDim : 'transparent',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          backgroundColor: hovered ? t.gold + '30' : t.border.subtle,
          border: `1px solid ${hovered ? t.gold + '60' : t.border.default}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 150ms',
        }}>
          <Plus size={18} color={hovered ? t.gold : t.text.muted} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: hovered ? t.gold : t.text.muted }}>Add focus area</div>
          <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>on-premise, off-premise, or both</div>
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

  const filterClient = searchParams.get('client') ?? ''

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

  function setFilter(slug: string) {
    if (slug) router.push(`/growth?client=${slug}`)
    else router.push('/growth')
  }

  const clientsWithZones = clients.filter(c => zones.some(z => z.markets?.client_slug === c.slug))
  const visibleClients = filterClient ? clients.filter(c => c.slug === filterClient) : clients

  function zonesForClient(slug: string) {
    return zones
      .filter(z => z.markets?.client_slug === slug)
      .sort((a, b) => {
        const pi = POSTURE_ORDER.indexOf(a.posture) - POSTURE_ORDER.indexOf(b.posture)
        if (pi !== 0) return pi
        return (snapshots[b.id]?.health_score ?? -1) - (snapshots[a.id]?.health_score ?? -1)
      })
  }

  // Global stats
  const allHealthScores = zones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
  const avgHealth = allHealthScores.length > 0
    ? Math.round(allHealthScores.reduce((a, b) => a + b, 0) / allHealthScores.length)
    : null
  const activeCount = zones.filter(z => z.posture === 'active' || z.posture === 'maintaining').length
  const totalAccounts = Object.values(snapshots).reduce((s, sn) => s + (sn.target_set_size ?? 0), 0)
  const totalActive = Object.values(snapshots).reduce((s, sn) => s + (sn.active_accounts ?? 0), 0)

  // Needs attention
  const attentionItems = zones.flatMap(z => {
    const snap = snapshots[z.id]
    const items: { id: string; title: string; sub: string; href: string }[] = []
    const hs = snap?.health_score ?? null
    if ((z.posture === 'active' || z.posture === 'maintaining') && hs !== null && hs < 50) {
      items.push({
        id: `low:${z.id}`, href: `/growth/zones/${z.id}`,
        title: `${z.name} — ${z.markets?.name}`,
        sub: `Health ${Math.round(hs)} · ${z.posture}`,
      })
    }
    if (z.posture === 'active' && (snap?.target_set_size ?? 0) === 0) {
      items.push({
        id: `empty:${z.id}`, href: `/growth/zones/${z.id}`,
        title: `${z.name} — ${z.markets?.name}`,
        sub: 'Active with no target accounts',
      })
    }
    return items
  })

  if (loading) return (
    <LayoutShell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ color: t.text.muted, fontSize: '13px' }}>Loading growth data…</div>
      </div>
    </LayoutShell>
  )

  return (
    <LayoutShell>
      <div style={{ padding: '0', minHeight: '100vh' }}>

        {/* Command bar */}
        <div style={{
          padding: '28px 40px 0',
          borderBottom: `1px solid ${t.border.subtle}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: '900', color: t.text.primary, letterSpacing: '-0.03em', marginBottom: '4px' }}>
                Growth
              </h1>
              <p style={{ fontSize: '12px', color: t.text.muted }}>
                {zones.length} focus area{zones.length !== 1 ? 's' : ''} across {clientsWithZones.length} client{clientsWithZones.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Link href="/growth/markets" style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
                border: `1px solid ${t.border.default}`, backgroundColor: 'transparent',
                color: t.text.muted, textDecoration: 'none',
              }}>
                <Settings size={12} /> Territories
              </Link>
              <Link href="/growth/zones/new" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 18px', borderRadius: '9px', fontSize: '13px', fontWeight: '700',
                backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none',
              }}>
                <Plus size={14} /> New Focus Area
              </Link>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', marginBottom: '0' }}>
            <StatTile label="Focus Areas" value={zones.length} />
            <StatTile label="Active / Maintaining" value={activeCount} />
            <StatTile
              label="Avg Health Score"
              value={avgHealth !== null ? avgHealth : '—'}
              color={avgHealth !== null ? healthColor(avgHealth) : t.text.muted}
            />
            <StatTile label="Total Accounts" value={totalAccounts} sub={`${totalActive} active`} />
            <div style={{ flex: 1, padding: '20px 24px' }} />
          </div>

          {/* Client filter tabs */}
          {clientsWithZones.length > 1 && (
            <div style={{ display: 'flex', gap: '0', marginTop: '16px' }}>
              {[{ slug: '', name: 'All' }, ...clientsWithZones].map(c => {
                const active = c.slug === '' ? !filterClient : filterClient === c.slug
                const color = 'color' in c && c.color ? c.color : t.gold
                return (
                  <button key={c.slug} onClick={() => setFilter(c.slug)} style={{
                    padding: '8px 20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                    border: 'none', borderBottom: `2px solid ${active ? (c.slug ? color : t.gold) : 'transparent'}`,
                    backgroundColor: 'transparent',
                    color: active ? (c.slug ? color : t.text.primary) : t.text.muted,
                    transition: 'color 150ms, border-color 150ms',
                  }}>
                    {'color' in c && c.color && c.slug && (
                      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: color, marginRight: '6px' }} />
                    )}
                    {c.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '32px 40px' }}>

          {zones.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '80px 24px',
              border: `2px dashed ${t.border.default}`, borderRadius: '16px',
            }}>
              <div style={{ fontSize: '17px', fontWeight: '800', color: t.text.secondary, marginBottom: '10px' }}>
                No focus areas yet
              </div>
              <div style={{ fontSize: '13px', color: t.text.muted, maxWidth: '400px', margin: '0 auto 24px' }}>
                A focus area is where you're actively working a brand — like "NoCo On-Premise."
                Start by creating a territory, then add on-premise and off-premise focus areas.
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
                  <Plus size={13} /> New Focus Area
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '44px' }}>
              {visibleClients.map(client => {
                const clientZones = zonesForClient(client.slug)
                const clientColor = client.color || t.gold
                const scores = clientZones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
                const clientAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

                return (
                  <div key={client.slug}>
                    {/* Client header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: clientColor, flexShrink: 0 }} />
                      <span style={{ fontSize: '15px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.01em' }}>
                        {client.name}
                      </span>
                      {clientAvg !== null && (
                        <span style={{
                          padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                          backgroundColor: healthBg(clientAvg), color: healthColor(clientAvg),
                          border: `1px solid ${healthColor(clientAvg)}30`,
                        }}>
                          avg {clientAvg}
                        </span>
                      )}
                      <div style={{ flex: 1, height: '1px', backgroundColor: t.border.subtle }} />
                      {clientZones.length === 0 && (
                        <span style={{ fontSize: '11px', color: t.text.muted }}>no focus areas yet</span>
                      )}
                    </div>

                    {/* Zone grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                      gap: '16px',
                    }}>
                      {clientZones.map(z => (
                        <ZoneCard key={z.id} zone={z} snapshot={snapshots[z.id] ?? null} />
                      ))}
                      <AddZoneCard clientSlug={client.slug} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Needs Attention */}
          {attentionItems.length > 0 && (
            <div style={{
              marginTop: '44px', padding: '20px 24px', borderRadius: '12px',
              backgroundColor: t.status.warningBg, border: `1px solid rgba(233,153,40,0.2)`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <AlertTriangle size={14} color={t.status.warning} />
                <span style={{ fontSize: '11px', fontWeight: '800', color: t.status.warning, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Needs Attention
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {attentionItems.map(item => (
                  <Link key={item.id} href={item.href} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{item.title}</span>
                    <span style={{ fontSize: '11px', color: t.text.muted }}>{item.sub}</span>
                    <ChevronRight size={12} color={t.text.muted} style={{ marginLeft: 'auto' }} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </LayoutShell>
  )
}

export default function GrowthPage() {
  return <Suspense><GrowthDashboardContent /></Suspense>
}
