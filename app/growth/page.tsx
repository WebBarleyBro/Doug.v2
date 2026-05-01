'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Settings, AlertTriangle, ChevronRight } from 'lucide-react'
import {
  RadialBarChart, RadialBar, ResponsiveContainer, Tooltip,
} from 'recharts'
import LayoutShell from '../layout-shell'
import { t } from '../lib/theme'
import { getClients } from '../lib/data'
import { getAllZones, getLatestSnapshotsByZone } from '../lib/concentric/data'
import { HealthRing, healthColor, healthBg, channelLabel } from './_components'
import type { Zone, Market, ZoneMetricSnapshot } from '../lib/concentric/types'
import type { Client } from '../lib/types'

type ZoneWithMarket = Zone & { markets: Market }

function ZoneCard({ zone, snapshot }: { zone: ZoneWithMarket; snapshot: ZoneMetricSnapshot | null }) {
  const [hovered, setHovered] = useState(false)
  const hs = snapshot?.health_score ?? null
  const color = healthColor(hs)

  return (
    <Link href={`/growth/zones/${zone.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: '12px',
          border: `1px solid ${hovered ? color + '55' : t.border.default}`,
          backgroundColor: t.bg.elevated,
          padding: '16px',
          cursor: 'pointer',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'border-color 150ms, transform 150ms, box-shadow 150ms',
          boxShadow: hovered ? `0 8px 28px rgba(0,0,0,0.35), 0 0 0 1px ${color}20` : 'none',
        }}
      >
        {/* Name row + health ring */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.01em' }}>
                {zone.name}
              </span>
            </div>
            <div style={{ fontSize: '10px', color: t.text.muted }}>
              {zone.markets?.name} · {channelLabel(zone.channel)}
            </div>
          </div>
          <HealthRing score={hs} size={58} strokeWidth={5} showLabel={false} />
        </div>

        {/* Metric bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '12px' }}>
          {[
            { label: 'REACH', v: snapshot?.reach_pct },
            { label: 'VEL', v: snapshot?.velocity_index },
            { label: 'RET', v: snapshot?.retention_pct },
          ].map(m => (
            <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '8px', color: t.text.muted, fontWeight: '700', width: '22px', letterSpacing: '0.07em', flexShrink: 0 }}>
                {m.label}
              </span>
              <div style={{ flex: 1, height: '3px', borderRadius: '2px', backgroundColor: t.border.subtle, overflow: 'hidden' }}>
                {m.v != null && (
                  <div style={{ height: '100%', width: `${Math.min(m.v, 100)}%`, backgroundColor: healthColor(m.v), borderRadius: '2px' }} />
                )}
              </div>
              <span style={{ fontSize: '11px', fontWeight: '800', color: m.v != null ? healthColor(m.v) : t.text.muted, width: '30px', textAlign: 'right', flexShrink: 0 }}>
                {m.v != null ? `${Math.round(m.v)}%` : '—'}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${t.border.subtle}`, paddingTop: '9px' }}>
          <span style={{ fontSize: '10px', color: t.text.muted }}>
            {snapshot?.target_set_size ?? 0} targets · {snapshot?.active_accounts ?? 0} active
          </span>
          <ChevronRight size={11} color={t.text.muted} style={{ opacity: hovered ? 1 : 0.4, transition: 'opacity 150ms' }} />
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
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: '12px', minHeight: '100px',
          border: `2px dashed ${hovered ? t.gold : t.border.default}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          cursor: 'pointer', transition: 'border-color 150ms, background 150ms',
          backgroundColor: hovered ? t.goldDim : 'transparent',
          padding: '16px',
        }}
      >
        <Plus size={14} color={hovered ? t.gold : t.text.muted} />
        <span style={{ fontSize: '12px', fontWeight: '600', color: hovered ? t.gold : t.text.muted }}>
          Add focus area
        </span>
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

  const clientsWithZones = clients.filter(c => zones.some(z => z.markets?.client_slug === c.slug))
  const visibleClients = filterClient ? clients.filter(c => c.slug === filterClient) : clients

  function zonesForClient(slug: string) {
    return zones
      .filter(z => z.markets?.client_slug === slug)
      .sort((a, b) => (snapshots[b.id]?.health_score ?? -1) - (snapshots[a.id]?.health_score ?? -1))
  }

  const allScores = zones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
  const avgHealth = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null
  const totalAccounts = Object.values(snapshots).reduce((s, sn) => s + (sn.target_set_size ?? 0), 0)
  const totalActive = Object.values(snapshots).reduce((s, sn) => s + (sn.active_accounts ?? 0), 0)

  // Radial bar data: one bar per client showing their avg health
  const clientRadialData = clientsWithZones.map(c => {
    const cZones = zones.filter(z => z.markets?.client_slug === c.slug)
    const scores = cZones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    return { name: c.name, value: avg, fill: c.color || t.gold }
  })

  const attentionItems = zones.flatMap(z => {
    const snap = snapshots[z.id]
    const hs = snap?.health_score ?? null
    // Only flag zones that have actual data — skip brand-new zones
    if (!snap || (snap.target_set_size ?? 0) === 0) return []
    const issues: string[] = []
    if (hs !== null && hs < 50) issues.push(`Health ${Math.round(hs)}`)
    if (issues.length === 0) return []
    return [{ id: z.id, href: `/growth/zones/${z.id}`, title: `${z.name} — ${z.markets?.name}`, sub: issues.join(' · ') }]
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
              <div style={{ fontSize: '12px', color: t.text.muted }}>{zones.length} focus area{zones.length !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* Client radial bars (only when 2+ clients with zones) */}
          {clientRadialData.length >= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '28px', borderRight: `1px solid ${t.border.subtle}`, marginRight: '28px' }}>
              <div style={{ width: 100, height: 72 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius={14} outerRadius={48}
                    data={clientRadialData}
                    startAngle={90} endAngle={-270}
                    barSize={7}
                  >
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
              { label: 'Focus Areas', val: zones.length },
              { label: 'Accounts', val: totalAccounts },
              { label: 'Active Accts', val: totalActive },
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

        {/* Client filter tabs */}
        {clientsWithZones.length > 1 && (
          <div style={{ display: 'flex', borderBottom: `1px solid ${t.border.subtle}`, padding: '0 40px' }}>
            {[{ slug: '', name: 'All Clients', color: undefined as string | undefined },
              ...clientsWithZones.map(c => ({ slug: c.slug, name: c.name, color: c.color || t.gold }))
            ].map(c => {
              const active = c.slug === '' ? !filterClient : filterClient === c.slug
              return (
                <button key={c.slug}
                  onClick={() => c.slug ? router.push(`/growth?client=${c.slug}`) : router.push('/growth')}
                  style={{
                    padding: '10px 18px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                    border: 'none', borderBottom: `2px solid ${active ? (c.color || t.gold) : 'transparent'}`,
                    backgroundColor: 'transparent',
                    color: active ? (c.color || t.text.primary) : t.text.muted,
                    transition: 'color 150ms, border-color 150ms',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    marginBottom: '-1px',
                  }}>
                  {c.color && c.slug && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: c.color, display: 'inline-block' }} />}
                  {c.name}
                </button>
              )
            })}
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '24px 40px' }}>
          {zones.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 24px', border: `2px dashed ${t.border.default}`, borderRadius: '14px' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: t.text.secondary, marginBottom: '8px' }}>No focus areas yet</div>
              <div style={{ fontSize: '13px', color: t.text.muted, maxWidth: '400px', margin: '0 auto 24px' }}>
                Start by creating a territory (geographic area), then add on-premise and off-premise focus areas within it.
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <Link href="/growth/markets/new" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', border: `1px solid ${t.border.default}`, backgroundColor: t.bg.elevated, color: t.text.secondary, textDecoration: 'none' }}>
                  <Plus size={13} /> New Territory
                </Link>
                <Link href="/growth/zones/new" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none' }}>
                  <Plus size={13} /> New Focus Area
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              {visibleClients.map(client => {
                const clientZones = zonesForClient(client.slug)
                const clientColor = client.color || t.gold
                const scores = clientZones.map(z => snapshots[z.id]?.health_score).filter((h): h is number => h != null)
                const clientAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

                return (
                  <div key={client.slug}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: clientColor, flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.01em' }}>{client.name}</span>
                      {clientAvg !== null && (
                        <span style={{ padding: '1px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', backgroundColor: healthBg(clientAvg), color: healthColor(clientAvg), border: `1px solid ${healthColor(clientAvg)}30` }}>
                          avg {clientAvg}
                        </span>
                      )}
                      <div style={{ flex: 1, height: '1px', backgroundColor: t.border.subtle }} />
                      {clientZones.length === 0 && <span style={{ fontSize: '11px', color: t.text.muted }}>no focus areas yet</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
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
