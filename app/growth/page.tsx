'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { TrendingUp, AlertTriangle, Star, Plus } from 'lucide-react'
import LayoutShell from '../layout-shell'
import { t, card } from '../lib/theme'
import { getClients } from '../lib/data'
import { getAllZones, getLatestSnapshotsByZone, getMarkets } from '../lib/concentric/data'
import { PostureBadge, HealthScoreDisplay, healthColor, TrendBadge, channelLabel } from './_components'
import type { Zone, Market, ZoneMetricSnapshot } from '../lib/concentric/types'
import type { Client } from '../lib/types'

type ZoneWithMarket = Zone & { markets: Market }

interface AttentionItem {
  id: string
  type: 'low_health' | 'declining' | 'empty_target' | 'priority_market_inactive' | 'supply'
  severity: 1 | 2 | 3
  title: string
  subtitle: string
  href: string
}

function buildAttentionItems(
  zones: ZoneWithMarket[],
  snapshots: Record<string, ZoneMetricSnapshot>,
  clients: Client[],
  dismissed: Record<string, number>,
): AttentionItem[] {
  const now = Date.now()
  const items: AttentionItem[] = []

  for (const z of zones) {
    const snap = snapshots[z.id]
    const hs = snap?.health_score ?? null

    // 1. Low health for active/maintaining zones
    if ((z.posture === 'active' || z.posture === 'maintaining') && hs !== null && hs < 50) {
      const key = `low_health:${z.id}`
      if (!dismissed[key] || dismissed[key] < now) {
        items.push({
          id: key, type: 'low_health', severity: 1,
          title: `${z.markets?.name} / ${z.name} — Health Score ${Math.round(hs)}`,
          subtitle: `${channelLabel(z.channel)} · Phase ${z.phase} · ${z.posture}`,
          href: `/growth/zones/${z.id}`,
        })
      }
    }

    // 2. Active/maintaining zones with empty target set
    if (z.posture === 'active' && (snap?.target_set_size ?? 0) === 0) {
      const key = `empty_target:${z.id}`
      if (!dismissed[key] || dismissed[key] < now) {
        items.push({
          id: key, type: 'empty_target', severity: 2,
          title: `${z.markets?.name} / ${z.name} — No Target Set`,
          subtitle: 'This zone is marked Active but has no accounts in the Target Set.',
          href: `/growth/zones/${z.id}`,
        })
      }
    }
  }

  return items.sort((a, b) => a.severity - b.severity)
}

export default function GrowthOverviewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [zones, setZones] = useState<ZoneWithMarket[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, ZoneMetricSnapshot>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Record<string, number>>({})

  // URL filter state
  const filterClient = searchParams.get('client') ?? ''
  const filterPosture = searchParams.get('posture') ?? ''
  const filterPhase = searchParams.get('phase') ?? ''

  // Load dismissed items from localStorage
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
    const exp = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7-day snooze
    const next = { ...dismissed, [id]: exp }
    setDismissed(next)
    try { localStorage.setItem('growth_dismissed', JSON.stringify(next)) } catch {}
  }

  // Apply filters
  const filteredZones = zones.filter(z => {
    if (filterClient && z.markets?.client_slug !== filterClient) return false
    if (filterPosture && z.posture !== filterPosture) return false
    if (filterPhase && String(z.phase) !== filterPhase) return false
    return true
  })

  // Posture distribution
  const postureCounts = { active: 0, maintaining: 0, monitoring: 0, opportunistic: 0 }
  for (const z of filteredZones) postureCounts[z.posture] = (postureCounts[z.posture] || 0) + 1
  const totalZones = filteredZones.length

  // Client × Phase matrix
  const clientSlugs = [...new Set(zones.map(z => z.markets?.client_slug).filter(Boolean))]
  const allPhases = [...new Set(zones.map(z => z.phase))].sort((a, b) => a - b)
  const maxPhase = Math.max(...allPhases, 3)
  const phaseColumns = Array.from({ length: maxPhase }, (_, i) => i + 1)

  function matrixCell(slug: string, phase: number) {
    const cell = filteredZones.filter(z => z.markets?.client_slug === slug && z.phase === phase)
    if (cell.length === 0) return null
    const avgHealth = cell.reduce((s, z) => s + (snapshots[z.id]?.health_score ?? 0), 0) / cell.length
    return { count: cell.length, avgHealth, zones: cell }
  }

  const attentionItems = buildAttentionItems(zones, snapshots, clients, dismissed)

  const POSTURE_COLORS = {
    active: t.gold, maintaining: t.status.success, monitoring: t.text.muted, opportunistic: t.border.hover,
  }

  function setFilter(key: string, val: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (val) { p.set(key, val) } else { p.delete(key) }
    router.push(`/growth?${p.toString()}`)
  }

  if (loading) return (
    <LayoutShell>
      <div style={{ padding: '48px', textAlign: 'center', color: t.text.muted }}>Loading growth data…</div>
    </LayoutShell>
  )

  return (
    <LayoutShell>
      <div style={{ padding: '28px 40px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <TrendingUp size={20} color={t.gold} />
              <h1 style={{ fontSize: '22px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.02em' }}>
                Concentric Growth
              </h1>
            </div>
            <p style={{ fontSize: '13px', color: t.text.muted }}>
              {totalZones} zone{totalZones !== 1 ? 's' : ''} across {clientSlugs.length} client{clientSlugs.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/growth/markets/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
              backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`,
              color: t.text.secondary, textDecoration: 'none', cursor: 'pointer',
            }}>
              <Plus size={14} /> Market
            </Link>
            <Link href="/growth/markets" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
              backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`,
              color: t.gold, textDecoration: 'none',
            }}>
              All Markets
            </Link>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {[
            { key: 'client', label: 'Client', options: clients.map(c => ({ val: c.slug, label: c.name })) },
            { key: 'posture', label: 'Posture', options: [
              { val: 'active', label: 'Active' }, { val: 'maintaining', label: 'Maintaining' },
              { val: 'monitoring', label: 'Monitoring' }, { val: 'opportunistic', label: 'Opportunistic' },
            ]},
            { key: 'phase', label: 'Phase', options: phaseColumns.map(p => ({ val: String(p), label: `Phase ${p}` })) },
          ].map(f => (
            <select key={f.key}
              value={f.key === 'client' ? filterClient : f.key === 'posture' ? filterPosture : filterPhase}
              onChange={e => setFilter(f.key, e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: '7px', fontSize: '12px',
                border: `1px solid ${t.border.default}`, backgroundColor: t.bg.input,
                color: t.text.secondary, outline: 'none', cursor: 'pointer',
              }}>
              <option value="">All {f.label}s</option>
              {f.options.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
            </select>
          ))}
          {(filterClient || filterPosture || filterPhase) && (
            <button onClick={() => router.push('/growth')} style={{
              padding: '6px 10px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer',
              border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.muted,
            }}>
              Clear filters
            </button>
          )}
        </div>

        {/* Posture distribution */}
        {totalZones > 0 && (
          <div style={{ ...card, marginBottom: '20px', padding: '20px 24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' }}>
              Posture Distribution
            </div>
            <div style={{ display: 'flex', height: '12px', borderRadius: '6px', overflow: 'hidden', gap: '2px', marginBottom: '12px' }}>
              {(['active', 'maintaining', 'monitoring', 'opportunistic'] as const).map(p => {
                const count = postureCounts[p]
                if (!count) return null
                const pct = (count / totalZones) * 100
                return (
                  <div key={p} title={`${p}: ${count}`} style={{
                    flex: pct, backgroundColor: POSTURE_COLORS[p], opacity: p === 'opportunistic' ? 0.3 : 1,
                    minWidth: '4px', transition: 'flex 0.3s ease',
                  }} />
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {(['active', 'maintaining', 'monitoring', 'opportunistic'] as const).map(p => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: POSTURE_COLORS[p], opacity: p === 'opportunistic' ? 0.4 : 1 }} />
                  <span style={{ fontSize: '12px', color: t.text.secondary }}>
                    {p.charAt(0).toUpperCase() + p.slice(1)} <strong style={{ color: t.text.primary }}>{postureCounts[p]}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Client × Phase matrix */}
        {clientSlugs.length > 0 && (
          <div style={{ ...card, marginBottom: '20px', padding: '20px 24px', overflowX: 'auto' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
              Client × Phase Matrix
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: '11px', color: t.text.muted, fontWeight: '600', padding: '0 12px 10px 0', whiteSpace: 'nowrap' }}>Client</th>
                  {phaseColumns.map(p => (
                    <th key={p} style={{ fontSize: '11px', color: t.text.muted, fontWeight: '600', padding: '0 8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      Phase {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientSlugs.map(slug => {
                  const client = clients.find(c => c.slug === slug)
                  return (
                    <tr key={slug}>
                      <td style={{ padding: '6px 12px 6px 0', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: client?.color || t.gold, flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{client?.name || slug}</span>
                        </div>
                      </td>
                      {phaseColumns.map(p => {
                        const cell = matrixCell(slug, p)
                        if (!cell) return (
                          <td key={p} style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <div style={{ width: '52px', height: '36px', borderRadius: '6px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}`, margin: '0 auto' }} />
                          </td>
                        )
                        const intensity = Math.round((cell.avgHealth / 100) * 0.5 * 255)
                        const bgColor = `rgba(212,168,67,${cell.avgHealth >= 75 ? 0.25 : cell.avgHealth >= 50 ? 0.15 : 0.08})`
                        return (
                          <td key={p} style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <button
                              onClick={() => {
                                const p2 = new URLSearchParams()
                                p2.set('client', slug)
                                p2.set('phase', String(p))
                                router.push(`/growth/markets?${p2.toString()}`)
                              }}
                              style={{
                                width: '52px', height: '36px', borderRadius: '6px', cursor: 'pointer',
                                backgroundColor: bgColor, border: `1px solid ${t.border.default}`,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                              }}>
                              <span style={{ fontSize: '14px', fontWeight: '800', color: t.text.primary, lineHeight: 1 }}>{cell.count}</span>
                              <span style={{ fontSize: '9px', color: t.text.muted }}>{Math.round(cell.avgHealth)}</span>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Needs Attention */}
        {attentionItems.length > 0 && (
          <div style={{ ...card, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <AlertTriangle size={14} color={t.status.warning} />
              <span style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Needs Attention ({attentionItems.length})
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {attentionItems.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px', borderRadius: '8px',
                  backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={item.href} style={{ textDecoration: 'none' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary, marginBottom: '2px' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '11px', color: t.text.muted }}>{item.subtitle}</div>
                    </Link>
                  </div>
                  <button
                    onClick={() => dismiss(item.id)}
                    title="Snooze 7 days"
                    style={{
                      flexShrink: 0, padding: '4px 8px', fontSize: '11px', borderRadius: '5px', cursor: 'pointer',
                      border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.muted,
                    }}>
                    Snooze
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {totalZones === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <TrendingUp size={40} color={t.border.hover} style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: '18px', fontWeight: '700', color: t.text.primary, marginBottom: '8px' }}>
              No markets yet
            </div>
            <div style={{ fontSize: '14px', color: t.text.muted, marginBottom: '24px' }}>
              Create your first Market to start tracking brand growth.
            </div>
            <Link href="/growth/markets/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px', borderRadius: '8px', fontWeight: '600', fontSize: '14px',
              backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none',
            }}>
              <Plus size={15} /> Create First Market
            </Link>
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
