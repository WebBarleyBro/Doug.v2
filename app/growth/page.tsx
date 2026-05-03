'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { Plus, Settings, AlertTriangle, ChevronRight, MapPin } from 'lucide-react'
import LayoutShell from '../layout-shell'
import { t } from '../lib/theme'
import { getClients } from '../lib/data'
import { getMarkets, getAllZones, getLatestSnapshotsByZone } from '../lib/concentric/data'
import { HealthRing, healthColor } from './_components'
import { clientLogoUrl } from '../lib/constants'
import type { Zone, Market, ZoneMetricSnapshot } from '../lib/concentric/types'
import type { Client } from '../lib/types'

type ZoneWithMarket = Zone & { markets: Market }
type SortMode = 'health' | 'cases' | 'trend' | 'name'

// ─── Territory Card ───────────────────────────────────────────────────────────

function TerritoryCard({
  market, zones, snapshots, clients,
}: {
  market: Market
  zones: ZoneWithMarket[]
  snapshots: Record<string, ZoneMetricSnapshot>
  clients: Client[]
}) {
  const [hovered, setHovered] = useState(false)

  const validSnaps = zones.map(z => snapshots[z.id]).filter(Boolean) as ZoneMetricSnapshot[]
  const scores = validSnaps.map(s => s.health_score).filter((h): h is number => h != null)
  const avgHealth = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  const activeAccounts = validSnaps.reduce((s, sn) => s + (sn.active_accounts ?? 0), 0)
  const totalAccounts  = validSnaps.reduce((s, sn) => s + (sn.total_accounts  ?? 0), 0)
  const accountsLost   = validSnaps.reduce((s, sn) => s + (sn.accounts_lost   ?? 0), 0)
  const targetSetSize  = validSnaps.reduce((s, sn) => s + (sn.target_set_size ?? 0), 0)
  const totalCases     = validSnaps.reduce((s, sn) => s + (sn.total_cases_90d ?? 0), 0)
  const avgActivity = validSnaps.length > 0 ? validSnaps.reduce((s, sn) => s + (sn.activity_rate_pct ?? 0), 0) / validSnaps.length : null
  const avgVelIdx   = validSnaps.length > 0 ? validSnaps.reduce((s, sn) => s + (sn.velocity_index   ?? 0), 0) / validSnaps.length : null
  const avgRet      = validSnaps.length > 0 ? validSnaps.reduce((s, sn) => s + (sn.retention_pct    ?? 0), 0) / validSnaps.length : null
  const trendSnaps  = validSnaps.filter(s => s.volume_trend_pct !== null)
  const avgTrend    = trendSnaps.length > 0 ? trendSnaps.reduce((s, sn) => s + (sn.volume_trend_pct ?? 0), 0) / trendSnaps.length : null

  const clientsInTerritory = zones
    .map(z => clients.find(c => c.slug === z.client_slug))
    .filter((c): c is Client => c !== undefined)

  const color = healthColor(avgHealth)
  const geoParts = [...(market.cities ?? []).slice(0, 2), ...(market.states ?? []).slice(0, 1)].slice(0, 2)
  const hasData = validSnaps.length > 0 && avgHealth !== null
  const hasMetrics = hasData && totalCases > 0

  // Account lifecycle bar segments
  const otherHistorical = Math.max(0, totalAccounts - activeAccounts - accountsLost)
  const untouched = Math.max(0, targetSetSize - totalAccounts)
  const barTotal = activeAccounts + accountsLost + otherHistorical + untouched

  return (
    <Link href={`/growth/markets/${market.id}`} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          height: '100%',
          borderRadius: '14px',
          border: `1px solid ${hovered ? color + '45' : t.border.default}`,
          background: hovered
            ? `radial-gradient(ellipse at top left, ${color}0a 0%, transparent 55%), ${t.bg.elevated}`
            : t.bg.elevated,
          padding: '16px',
          cursor: 'pointer',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 150ms',
          boxShadow: hovered ? `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${color}18, 0 0 60px ${color}05` : `0 1px 3px rgba(0,0,0,0.15)`,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {/* Top accent line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: hasData ? `linear-gradient(90deg, ${color}, ${color}35, transparent)` : 'rgba(255,255,255,0.05)', borderRadius: '14px 14px 0 0' }} />

        {/* Name + health score */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', marginTop: '4px' }}>
          <div style={{ flex: 1, paddingRight: '10px', minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.02em', lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              {market.name}
              {market.priority && <span style={{ fontSize: '10px', color: t.gold, flexShrink: 0 }}>★</span>}
            </div>
            {geoParts.length > 0 && (
              <div style={{ fontSize: '9px', color: t.text.muted, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px', opacity: 0.5 }}>
                <MapPin size={7} />{geoParts.join(' · ')}
              </div>
            )}
            {clientsInTerritory.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', marginTop: '8px', alignItems: 'center' }}>
                {clientsInTerritory.slice(0, 5).map(c => {
                  const logo = clientLogoUrl(c)
                  return logo
                    ? <img key={c.slug} src={logo} alt={c.name} title={c.name} style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: '3px', opacity: 0.7 }} />
                    : <div key={c.slug} title={c.name} style={{ width: 16, height: 16, borderRadius: '3px', backgroundColor: (c.color || t.gold) + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: '900', color: c.color || t.gold }}>{c.name[0]}</div>
                })}
              </div>
            )}
          </div>
          {/* Health score */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: '28px', fontWeight: '900', lineHeight: 1, color: hasData ? color : '#2a2a2a', letterSpacing: '-0.04em', textShadow: hasData ? `0 0 18px ${color}80, 0 0 40px ${color}30` : 'none', fontVariantNumeric: 'tabular-nums' }}>
              {hasData ? avgHealth : '—'}
            </div>
            <div style={{ fontSize: '7px', fontWeight: '700', color: hasData ? color : '#2a2a2a', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px', opacity: hasData ? 0.55 : 0.2 }}>HEALTH</div>
          </div>
        </div>

        {/* Metric bars */}
        {hasMetrics ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
            {([
              { label: 'Activity', v: avgActivity },
              { label: 'Velocity', v: avgVelIdx  },
              { label: 'Reorder',  v: avgRet     },
            ] as { label: string; v: number | null }[]).map(m => {
              const c = m.v != null && m.v > 5 ? healthColor(m.v) : '#1e1e1e'
              return (
                <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <span style={{ fontSize: '8px', color: t.text.muted, fontWeight: '700', width: '40px', letterSpacing: '0.04em', flexShrink: 0, opacity: 0.5 }}>{m.label}</span>
                  <div style={{ flex: 1, height: '3px', borderRadius: '2px', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                    {m.v != null && m.v > 0 && (
                      <div style={{ height: '100%', width: `${Math.min(m.v, 100)}%`, background: `linear-gradient(90deg, ${c}45 0%, ${c} 100%)`, borderRadius: '2px', boxShadow: `0 0 6px ${c}55` }} />
                    )}
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: m.v != null && m.v > 0 ? c : '#1e1e1e', width: '26px', textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {m.v != null && m.v > 0 ? Math.round(m.v) : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ fontSize: '10px', color: t.text.muted, opacity: 0.28, marginBottom: '10px' }}>
            {validSnaps.length > 0 ? 'Open territory · click Refresh' : 'No brand tracking data yet'}
          </div>
        )}

        {/* Account lifecycle bar */}
        {barTotal > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', height: '3px', borderRadius: '2px', overflow: 'hidden', gap: '1px' }}>
              {activeAccounts  > 0 && <div style={{ flex: activeAccounts,    backgroundColor: t.status.success, boxShadow: `0 0 6px ${t.status.success}70` }} />}
              {accountsLost   > 0 && <div style={{ flex: accountsLost,      backgroundColor: t.status.warning }} />}
              {otherHistorical > 0 && <div style={{ flex: otherHistorical,   backgroundColor: 'rgba(255,255,255,0.14)' }} />}
              {untouched       > 0 && <div style={{ flex: untouched,         backgroundColor: 'rgba(255,255,255,0.05)' }} />}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid rgba(255,255,255,0.05)`, paddingTop: '9px', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
            {totalCases > 0 ? (
              <>
                <span style={{ fontSize: '13px', fontWeight: '900', color: t.text.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1, flexShrink: 0 }}>{totalCases}</span>
                <span style={{ fontSize: '9px', color: t.text.muted, opacity: 0.4, flexShrink: 0 }}>cs · 90d</span>
                {avgTrend !== null && Math.abs(avgTrend) >= 5 && (
                  <span style={{ fontSize: '10px', fontWeight: '800', color: avgTrend > 0 ? t.status.success : t.status.danger, textShadow: `0 0 8px ${avgTrend > 0 ? t.status.success : t.status.danger}60`, flexShrink: 0 }}>
                    {avgTrend > 0 ? '↑' : '↓'}{Math.abs(Math.round(avgTrend))}%
                  </span>
                )}
                {activeAccounts > 0 && (
                  <>
                    <span style={{ color: 'rgba(255,255,255,0.1)', flexShrink: 0 }}>·</span>
                    <span style={{ fontSize: '10px', color: t.status.success, fontWeight: '700', flexShrink: 0 }}>{activeAccounts} active</span>
                  </>
                )}
              </>
            ) : (
              <span style={{ fontSize: '10px', color: t.text.muted, opacity: 0.3 }}>
                {zones.length === 0 ? 'No brands tracked' : 'Run Refresh in territory'}
              </span>
            )}
          </div>
          <ChevronRight size={11} color={color} style={{ opacity: hovered ? 0.8 : 0.22, transition: 'opacity 150ms', flexShrink: 0 }} />
        </div>
      </div>
    </Link>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function GrowthDashboardContent() {
  const [zones, setZones]         = useState<ZoneWithMarket[]>([])
  const [markets, setMarkets]     = useState<Market[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, ZoneMetricSnapshot>>({})
  const [clients, setClients]     = useState<Client[]>([])
  const [loading, setLoading]     = useState(true)
  const [brandFilter, setBrandFilter] = useState<string>('all')
  const [sortMode, setSortMode]   = useState<SortMode>('health')

  const load = useCallback(async () => {
    try {
      const [allZones, allMarkets, allClients] = await Promise.all([
        getAllZones(), getMarkets(), getClients(),
      ])
      const snaps = await getLatestSnapshotsByZone(allZones.map(z => z.id))
      setZones(allZones); setMarkets(allMarkets); setClients(allClients); setSnapshots(snaps)
    } catch (e) { console.error('growth.overview', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Build market → zones map; include markets with no zones
  const marketEntries = (() => {
    const byMarket = new Map<string, ZoneWithMarket[]>()
    for (const z of zones) {
      if (!z.markets?.id) continue
      if (!byMarket.has(z.markets.id)) byMarket.set(z.markets.id, [])
      byMarket.get(z.markets.id)!.push(z)
    }
    return markets.map(m => ({ market: m, zones: byMarket.get(m.id) ?? [] }))
  })()

  const clientsWithZones = clients.filter(c => zones.some(z => z.client_slug === c.slug))

  // Portfolio aggregates
  const allScores    = zones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
  const avgHealth    = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null
  const totalCases90d = Object.values(snapshots).reduce((s, sn) => s + (sn.total_cases_90d ?? 0), 0)
  const totalActive   = Object.values(snapshots).reduce((s, sn) => s + (sn.active_accounts  ?? 0), 0)

  // Per-brand health list (for header)
  const brandHealthData = clientsWithZones.map(c => {
    const cZones = zones.filter(z => z.client_slug === c.slug)
    const snps   = cZones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
    const avg    = snps.length > 0 ? Math.round(snps.reduce((a, b) => a + b, 0) / snps.length) : null
    const tVals  = cZones.map(z => snapshots[z.id]?.volume_trend_pct).filter((v): v is number => v != null)
    const trend  = tVals.length > 0 ? tVals.reduce((a, b) => a + b, 0) / tVals.length : null
    return { client: c, avg, trend }
  })

  // Attention: health < 50 with any computed snapshot
  const attentionItems = zones.flatMap(z => {
    const snap = snapshots[z.id]
    if (!snap) return []
    const hs = snap.health_score ?? null
    if (hs === null || hs >= 50) return []
    const c = clients.find(cl => cl.slug === z.client_slug)
    const marketId = z.markets?.id
    if (!marketId) return []
    return [{ id: z.id, href: `/growth/markets/${marketId}`, title: `${c?.name ?? z.name} — ${z.markets?.name}`, score: Math.round(hs) }]
  })

  const getAvgHealth = (entry: { zones: ZoneWithMarket[] }) => {
    const sc = entry.zones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
    return sc.length > 0 ? sc.reduce((x, y) => x + y, 0) / sc.length : -1
  }

  const filteredEntries = marketEntries
    .filter(({ zones: mZones }) =>
      brandFilter === 'all' ? true : mZones.some(z => z.client_slug === brandFilter)
    )
    .sort((a, b) => {
      if (sortMode === 'name') return a.market.name.localeCompare(b.market.name)
      if (sortMode === 'cases') {
        const cA = a.zones.reduce((s, z) => s + (snapshots[z.id]?.total_cases_90d ?? 0), 0)
        const cB = b.zones.reduce((s, z) => s + (snapshots[z.id]?.total_cases_90d ?? 0), 0)
        return cB - cA
      }
      if (sortMode === 'trend') {
        const getTrend = (entry: typeof a) => {
          const vals = entry.zones.map(z => snapshots[z.id]?.volume_trend_pct).filter((v): v is number => v != null)
          return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : -999
        }
        return getTrend(b) - getTrend(a)
      }
      return getAvgHealth(b) - getAvgHealth(a)
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
      <div>

        {/* ── Command Header ─────────────────────────────────────────────────── */}
        <div style={{ borderBottom: `1px solid ${t.border.subtle}`, background: `linear-gradient(180deg, rgba(255,255,255,0.012) 0%, transparent 100%)` }}>
          <div style={{ padding: '14px 32px', display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap' }}>

            {/* Portfolio health ring */}
            <div style={{ paddingRight: '24px', borderRight: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', gap: '14px', marginRight: '24px', flexShrink: 0 }}>
              <HealthRing score={avgHealth} size={68} strokeWidth={6} />
              <div>
                <div style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.5, marginBottom: '2px' }}>Portfolio</div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: t.text.primary }}>{markets.length} territor{markets.length !== 1 ? 'ies' : 'y'}</div>
              </div>
            </div>

            {/* Per-brand health summary */}
            {brandHealthData.length > 0 && (
              <div style={{ paddingRight: '24px', borderRight: `1px solid ${t.border.subtle}`, marginRight: '24px', display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '190px', flexShrink: 0 }}>
                {brandHealthData.map(({ client: c, avg, trend }) => {
                  const logo  = clientLogoUrl(c)
                  const color = avg !== null ? healthColor(avg) : '#2a2a2a'
                  return (
                    <div key={c.slug} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      {logo
                        ? <img src={logo} alt={c.name} style={{ width: 13, height: 13, objectFit: 'contain', borderRadius: '2px', flexShrink: 0, opacity: 0.8 }} />
                        : <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.color || t.gold, flexShrink: 0 }} />
                      }
                      <span style={{ fontSize: '10px', color: t.text.muted, opacity: 0.65, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      <div style={{ width: '48px', height: '3px', borderRadius: '2px', backgroundColor: 'rgba(255,255,255,0.06)', flexShrink: 0, overflow: 'hidden' }}>
                        {avg !== null && avg > 0 && <div style={{ height: '100%', width: `${avg}%`, background: `linear-gradient(90deg, ${color}45, ${color})`, boxShadow: `0 0 6px ${color}70` }} />}
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '900', color: avg !== null ? color : '#2a2a2a', textShadow: avg !== null && avg >= 75 ? `0 0 10px ${color}70` : 'none', fontVariantNumeric: 'tabular-nums', minWidth: '22px', textAlign: 'right', flexShrink: 0 }}>{avg ?? '—'}</span>
                      {trend !== null && Math.abs(trend) >= 5 && (
                        <span style={{ fontSize: '9px', color: trend > 0 ? t.status.success : t.status.danger, fontWeight: '700', flexShrink: 0, minWidth: '28px', textAlign: 'right' }}>
                          {trend > 0 ? '↑' : '↓'}{Math.abs(Math.round(trend))}%
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Portfolio stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '28px', flex: 1, flexWrap: 'wrap' }}>
              {([
                { label: 'Cases · 90d',      val: totalCases90d > 0 ? String(totalCases90d) : '—' },
                { label: 'Active Accounts',  val: String(totalActive)              },
                { label: 'Brands Tracked',   val: String(clientsWithZones.length)  },
              ]).map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: t.text.primary, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{s.val}</div>
                  <div style={{ fontSize: '9px', color: t.text.muted, fontWeight: '700', marginTop: '3px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.42 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
              <Link href="/growth/markets" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', fontSize: '11px', fontWeight: '600', border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.muted, textDecoration: 'none' }}>
                <Settings size={11} /> Manage
              </Link>
              <Link href="/growth/markets/new" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none' }}>
                <Plus size={13} /> New Territory
              </Link>
            </div>
          </div>

          {/* ── Brand filter + Sort strip ───────────────────────────────────── */}
          <div style={{ borderTop: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', padding: '0 32px', overflowX: 'auto' }}>
            {([{ slug: 'all', name: 'All Territories', logo: null as string | null, color: t.gold as string }]
              .concat(clientsWithZones.map(c => ({ slug: c.slug, name: c.name, logo: clientLogoUrl(c), color: c.color || t.gold }))))
              .map(tab => {
                const isActive = brandFilter === tab.slug
                return (
                  <button key={tab.slug} onClick={() => setBrandFilter(tab.slug)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: isActive ? `2px solid ${tab.color}` : '2px solid transparent', opacity: isActive ? 1 : 0.38, transition: 'all 150ms', fontSize: '11px', fontWeight: isActive ? '700' : '500', color: isActive ? tab.color : t.text.muted, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {tab.logo
                      ? <img src={tab.logo} alt={tab.name} style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '2px' }} />
                      : tab.slug !== 'all' && <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: tab.color }} />
                    }
                    {tab.name}
                  </button>
                )
              })}

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '16px', flexShrink: 0 }}>
              <span style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.3, marginRight: '6px' }}>Sort</span>
              {([
                { key: 'health', label: 'Health' },
                { key: 'cases',  label: 'Cases'  },
                { key: 'trend',  label: 'Trend'  },
                { key: 'name',   label: 'Name'   },
              ] as { key: SortMode; label: string }[]).map(s => (
                <button key={s.key} onClick={() => setSortMode(s.key)} style={{
                  padding: '3px 9px', borderRadius: '5px', fontSize: '10px',
                  fontWeight: sortMode === s.key ? '700' : '500', cursor: 'pointer',
                  border: `1px solid ${sortMode === s.key ? t.goldBorder : t.border.subtle}`,
                  backgroundColor: sortMode === s.key ? t.goldDim : 'transparent',
                  color: sortMode === s.key ? t.gold : t.text.muted,
                  transition: 'all 100ms',
                }}>{s.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────────── */}
        <div style={{ padding: '18px 32px 60px' }}>

          {/* Attention banner */}
          {attentionItems.length > 0 && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '9px', backgroundColor: t.status.dangerBg, border: `1px solid rgba(239,68,68,0.18)`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <AlertTriangle size={12} color={t.status.danger} />
                <span style={{ fontSize: '10px', fontWeight: '800', color: t.status.danger, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{attentionItems.length} Low Health</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                {attentionItems.map(item => (
                  <Link key={item.id} href={item.href} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: t.text.primary }}>{item.title}</span>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: t.status.danger }}>{item.score}</span>
                    <ChevronRight size={10} color={t.status.danger} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {filteredEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 24px', border: `2px dashed ${t.border.default}`, borderRadius: '14px' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: t.text.secondary, marginBottom: '8px' }}>
                {marketEntries.length === 0 ? 'No territories yet' : 'No territories match this filter'}
              </div>
              {marketEntries.length === 0 && (
                <>
                  <div style={{ fontSize: '13px', color: t.text.muted, maxWidth: '440px', margin: '0 auto 24px' }}>
                    Create a territory to start tracking performance by geography.
                  </div>
                  <Link href="/growth/markets/new" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none' }}>
                    <Plus size={13} /> Create First Territory
                  </Link>
                </>
              )}
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '10px', color: t.text.muted, opacity: 0.3, fontWeight: '600' }}>
                  {filteredEntries.length} {filteredEntries.length === 1 ? 'territory' : 'territories'}
                  {brandFilter !== 'all' ? ` · ${clients.find(c => c.slug === brandFilter)?.name ?? brandFilter}` : ''}
                  {' · by '}
                  {sortMode}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(256px, 1fr))', gap: '10px', alignItems: 'stretch' }}>
                {filteredEntries.map(({ market, zones: mZones }) => (
                  <TerritoryCard
                    key={market.id}
                    market={market}
                    zones={mZones}
                    snapshots={snapshots}
                    clients={clients}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </LayoutShell>
  )
}

export default function GrowthPage() {
  return <Suspense><GrowthDashboardContent /></Suspense>
}
