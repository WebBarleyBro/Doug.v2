'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Settings, AlertTriangle, ChevronRight, MapPin } from 'lucide-react'
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
} from 'recharts'
import LayoutShell from '../layout-shell'
import { t } from '../lib/theme'
import { getClients } from '../lib/data'
import { getMarkets, getAllZones, getLatestSnapshotsByZone } from '../lib/concentric/data'
import { HealthRing, healthColor, healthBg, channelLabel } from './_components'
import type { Zone, Market, ZoneMetricSnapshot } from '../lib/concentric/types'
import type { Client } from '../lib/types'

type ZoneWithMarket = Zone & { markets: Market }

// ─── Territory Card ───────────────────────────────────────────────────────────

function TerritoryCard({
  market,
  zones,
  snapshots,
  clientChips,
}: {
  market: Market
  zones: ZoneWithMarket[]
  snapshots: Record<string, ZoneMetricSnapshot>
  clientColor: string
  clientChips?: { name: string; color: string }[]
}) {
  const [hovered, setHovered] = useState(false)

  const validSnaps = zones.map(z => snapshots[z.id]).filter(Boolean) as ZoneMetricSnapshot[]
  const scores = validSnaps.map(s => s.health_score).filter((h): h is number => h != null)
  const avgHealth = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  const totalAccounts = validSnaps.reduce((s, sn) => s + (sn.total_accounts ?? sn.target_set_size ?? 0), 0)
  const activeAccounts = validSnaps.reduce((s, sn) => s + (sn.active_accounts ?? 0), 0)
  const totalCases = validSnaps.reduce((s, sn) => s + (sn.total_cases_90d ?? 0), 0)
  const avgActivity = validSnaps.length > 0 ? validSnaps.reduce((s, sn) => s + (sn.activity_rate_pct ?? sn.reach_pct ?? 0), 0) / validSnaps.length : null
  const avgVelIdx   = validSnaps.length > 0 ? validSnaps.reduce((s, sn) => s + (sn.velocity_index ?? 0), 0) / validSnaps.length : null
  const avgRet      = validSnaps.length > 0 ? validSnaps.reduce((s, sn) => s + (sn.retention_pct ?? 0), 0) / validSnaps.length : null
  const trendSnaps = validSnaps.filter(s => s.volume_trend_pct !== null)
  const avgTrend = trendSnaps.length > 0 ? trendSnaps.reduce((s, sn) => s + (sn.volume_trend_pct ?? 0), 0) / trendSnaps.length : null

  const color = healthColor(avgHealth)
  const accentColor = clientChips?.[0]?.color || color
  const href = `/growth/markets/${market.id}`
  const geoParts = [...(market.cities ?? []).slice(0, 2), ...(market.states ?? []).slice(0, 1)].slice(0, 2)
  const hasData = validSnaps.length > 0 && avgHealth !== null

  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: '14px',
          border: `1px solid ${hovered ? accentColor + '40' : t.border.default}`,
          background: hovered
            ? `radial-gradient(ellipse at top left, ${accentColor}08 0%, transparent 55%), ${t.bg.elevated}`
            : t.bg.elevated,
          padding: '16px',
          cursor: 'pointer',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'border-color 150ms, transform 150ms, box-shadow 150ms, background 150ms',
          boxShadow: hovered ? `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${accentColor}18` : `0 1px 3px rgba(0,0,0,0.15)`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top accent line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: hasData ? `linear-gradient(90deg, ${color}, ${color}50)` : t.border.subtle, borderRadius: '14px 14px 0 0' }} />

        {/* Client brand chips */}
        {clientChips && clientChips.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', marginTop: '4px' }}>
            {clientChips.map(c => (
              <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontWeight: '800', color: c.color, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', backgroundColor: c.color + '14', border: `1px solid ${c.color}25` }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: c.color, boxShadow: `0 0 4px ${c.color}` }} />
                {c.name}
              </span>
            ))}
          </div>
        )}

        {/* Name + health score */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', marginTop: clientChips?.length ? 0 : '4px' }}>
          <div style={{ flex: 1, paddingRight: '12px', minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.02em', marginBottom: '4px', lineHeight: 1.2 }}>
              {market.name}
              {market.priority && <span style={{ fontSize: '11px', color: t.gold, marginLeft: '6px' }}>★</span>}
            </div>
            {geoParts.length > 0 && (
              <div style={{ fontSize: '10px', color: t.text.muted, display: 'flex', alignItems: 'center', gap: '3px', opacity: 0.7 }}>
                <MapPin size={8} />
                {geoParts.join(' · ')}
              </div>
            )}
          </div>
          {/* Health score — big number style */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{
              fontSize: '26px', fontWeight: '900', lineHeight: 1,
              color: hasData ? color : t.text.muted,
              letterSpacing: '-0.04em',
              textShadow: hasData ? `0 0 20px ${color}60` : 'none',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {hasData ? avgHealth : '—'}
            </div>
            <div style={{ fontSize: '8px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px', opacity: 0.5 }}>health</div>
          </div>
        </div>

        {/* Metric bars */}
        {validSnaps.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '13px' }}>
            {[
              { label: 'Activity', v: avgActivity },
              { label: 'Velocity', v: avgVelIdx },
              { label: 'Reorder',  v: avgRet },
            ].map(m => {
              const c = m.v != null ? healthColor(m.v) : t.border.subtle
              return (
                <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '9px', color: t.text.muted, fontWeight: '700', width: '42px', letterSpacing: '0.04em', flexShrink: 0, opacity: 0.6 }}>{m.label}</span>
                  <div style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                    {m.v != null && <div style={{ height: '100%', width: `${Math.min(m.v, 100)}%`, background: `linear-gradient(90deg, ${c}, ${c}90)`, borderRadius: '2px', boxShadow: `0 0 6px ${c}` }} />}
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: m.v != null ? c : '#333', width: '30px', textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {m.v != null ? `${Math.round(m.v)}` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid rgba(255,255,255,0.05)`, paddingTop: '10px' }}>
          <span style={{ fontSize: '11px', color: t.text.muted, opacity: 0.7 }}>
            {totalCases > 0 ? (
              <>
                <span style={{ color: t.status.success, fontWeight: '700' }}>{activeAccounts}</span> buying · {totalCases} cs
                {avgTrend !== null && Math.abs(avgTrend) >= 5 && (
                  <span style={{ color: avgTrend > 0 ? t.status.success : t.status.danger, fontWeight: '700', marginLeft: '4px' }}>
                    {avgTrend > 0 ? '↑' : '↓'}{Math.abs(Math.round(avgTrend))}%
                  </span>
                )}
              </>
            ) : totalAccounts > 0 ? `${activeAccounts} of ${totalAccounts} active`
              : zones.length === 0 ? 'No brands yet' : 'No data yet'}
          </span>
          <ChevronRight size={11} color={color} style={{ opacity: hovered ? 0.8 : 0.3, transition: 'opacity 150ms' }} />
        </div>
      </div>
    </Link>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function GrowthDashboardContent() {
  const router = useRouter()

  const [zones, setZones] = useState<ZoneWithMarket[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, ZoneMetricSnapshot>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [allZones, allMarkets, allClients] = await Promise.all([
        getAllZones(), getMarkets(), getClients(),
      ])
      const snaps = await getLatestSnapshotsByZone(allZones.map(z => z.id))
      setZones(allZones)
      setMarkets(allMarkets)
      setClients(allClients)
      setSnapshots(snaps)
    } catch (e) { console.error('growth.overview', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Build a map: marketId → { market, zones[] }
  const marketEntries = (() => {
    const zonesByMarket = new Map<string, ZoneWithMarket[]>()
    for (const z of zones) {
      if (!z.markets?.id) continue
      if (!zonesByMarket.has(z.markets.id)) zonesByMarket.set(z.markets.id, [])
      zonesByMarket.get(z.markets.id)!.push(z)
    }
    // Merge with all markets so markets with no zones still appear
    return markets.map(m => ({
      market: m,
      zones: zonesByMarket.get(m.id) ?? [],
    }))
  })()

  // Clients that have at least one zone (use zone.client_slug)
  const clientsWithZones = clients.filter(c =>
    zones.some(z => z.client_slug === c.slug)
  )

  // Client filter tabs filter territories that contain zones for the selected client
  const filteredEntries = marketEntries
    .sort((a, b) => {
      const scoreA = a.zones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
      const scoreB = b.zones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
      const avgA = scoreA.length > 0 ? scoreA.reduce((x, y) => x + y, 0) / scoreA.length : -1
      const avgB = scoreB.length > 0 ? scoreB.reduce((x, y) => x + y, 0) / scoreB.length : -1
      return avgB - avgA
    })

  // Portfolio stats
  const allScores = zones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
  const avgHealth = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null
  const totalAccounts = Object.values(snapshots).reduce((s, sn) => s + (sn.target_set_size ?? 0), 0)
  const totalActive = Object.values(snapshots).reduce((s, sn) => s + (sn.active_accounts ?? 0), 0)

  const clientRadialData = clientsWithZones.map(c => {
    const cZones = zones.filter(z => z.client_slug === c.slug)
    const scores = cZones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    return { name: c.name, value: avg, fill: c.color || t.gold }
  })

  const attentionItems = zones.flatMap(z => {
    const snap = snapshots[z.id]
    if (!snap || (snap.target_set_size ?? 0) === 0) return []
    const hs = snap.health_score ?? null
    if (hs === null || hs >= 50) return []
    const c = clients.find(cl => cl.slug === z.client_slug)
    const marketId = z.markets?.id
    if (!marketId) return []
    const href = `/growth/markets/${marketId}?client=${z.client_slug ?? ''}`
    return [{ id: z.id, href, title: `${c?.name ?? z.name} — ${z.markets?.name}`, sub: `Health ${Math.round(hs)}` }]
  })

  if (loading) return (
    <LayoutShell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <span style={{ color: t.text.muted, fontSize: '13px' }}>Loading growth data…</span>
      </div>
    </LayoutShell>
  )

  return (
    <LayoutShell>
      <div style={{ padding: '0' }}>

        {/* Top bar */}
        <div style={{
          padding: '0 40px',
          borderBottom: `1px solid ${t.border.subtle}`,
          display: 'flex', alignItems: 'stretch', gap: '0',
        }}>
          {/* Portfolio health ring */}
          <div style={{ padding: '20px 28px 20px 0', borderRight: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', gap: '20px', marginRight: '28px' }}>
            <HealthRing score={avgHealth} size={72} strokeWidth={6} />
            <div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>Portfolio Health</div>
              <div style={{ fontSize: '12px', color: t.text.muted }}>{marketEntries.length} territor{marketEntries.length !== 1 ? 'ies' : 'y'}</div>
            </div>
          </div>

          {/* Client radial bars */}
          {clientRadialData.length >= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '28px', borderRight: `1px solid ${t.border.subtle}`, marginRight: '28px' }}>
              <div style={{ width: 100, height: 72 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart innerRadius={14} outerRadius={48} data={clientRadialData} startAngle={90} endAngle={-270} barSize={7}>
                    <RadialBar dataKey="value" background={{ fill: 'rgba(255,255,255,0.04)' }} cornerRadius={4} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {clientRadialData.map(c => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '2px', backgroundColor: c.fill, flexShrink: 0 }} />
                    <span style={{ color: t.text.muted }}>{c.name}</span>
                    <span style={{ color: c.fill, fontWeight: '700', marginLeft: 'auto' }}>{c.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '28px', flex: 1 }}>
            {[
              { label: 'Territories', val: marketEntries.length },
              { label: 'Customers',   val: totalActive },
              { label: 'Brands',      val: clientsWithZones.length },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: '20px', fontWeight: '800', color: t.text.primary, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', marginTop: '2px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingLeft: '16px' }}>
            <Link href="/growth/markets" style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
              border: `1px solid ${t.border.default}`, backgroundColor: 'transparent',
              color: t.text.muted, textDecoration: 'none',
            }}>
              <Settings size={12} /> Manage
            </Link>
            <Link href="/growth/markets/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 18px', borderRadius: '9px', fontSize: '13px', fontWeight: '700',
              backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none',
            }}>
              <Plus size={14} /> New Territory
            </Link>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 40px' }}>
          {marketEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 24px', border: `2px dashed ${t.border.default}`, borderRadius: '14px' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: t.text.secondary, marginBottom: '8px' }}>No territories yet</div>
              <div style={{ fontSize: '13px', color: t.text.muted, maxWidth: '440px', margin: '0 auto 24px' }}>
                Create a territory to start tracking performance by geography. Add brands and accounts to each territory.
              </div>
              <Link href="/growth/markets/new" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none' }}>
                <Plus size={13} /> Create First Territory
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
              {filteredEntries.map(({ market, zones: mZones }) => {
                const chips = mZones
                  .map(z => clients.find(c => c.slug === z.client_slug))
                  .filter((c): c is Client => !!c)
                  .map(c => ({ name: c.name, color: c.color || t.gold }))
                return (
                  <TerritoryCard
                    key={market.id}
                    market={market}
                    zones={mZones}
                    snapshots={snapshots}
                    clientColor={t.gold}
                    clientChips={chips}
                  />
                )
              })}
            </div>
          )}

          {attentionItems.length > 0 && (
            <div style={{ marginTop: '28px', padding: '14px 18px', borderRadius: '10px', backgroundColor: t.status.warningBg, border: `1px solid rgba(233,153,40,0.2)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <AlertTriangle size={13} color={t.status.warning} />
                <span style={{ fontSize: '11px', fontWeight: '800', color: t.status.warning, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Needs Attention</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {attentionItems.map(item => (
                  <Link key={item.id} href={item.href} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{item.title}</span>
                    <span style={{ fontSize: '11px', color: t.text.muted }}>{item.sub}</span>
                    <ChevronRight size={12} color={t.text.muted} style={{ marginLeft: 'auto', flexShrink: 0 }} />
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
