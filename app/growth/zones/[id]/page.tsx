'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Trash2, RefreshCw, Plus, X, Search } from 'lucide-react'
import LayoutShell, { useToast } from '../../../layout-shell'
import ConfirmModal from '../../../components/ConfirmModal'
import { t, inputStyle, labelStyle, selectStyle, btnPrimary, btnSecondary } from '../../../lib/theme'
import { getAccounts, getClients } from '../../../lib/data'
import { getSupabase } from '../../../lib/supabase'
import {
  getZone, updateZone, deleteZone,
  getZoneTargetAccounts, addAccountToZone, removeAccountFromZone,
  getLatestSnapshot, getZoneSnapshots,
} from '../../../lib/concentric/data'
import {
  HealthRing, TrendBadge, MetricTile, Sparkline,
  channelLabel, healthColor, healthBg, AccountStatusBadge,
} from '../../_components'
import { ChevronRight } from 'lucide-react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip,
} from 'recharts'
import type { Zone, Market, ZoneMetricSnapshot, ZoneTargetAccount, ZonePosture } from '../../../lib/concentric/types'
import type { Account, Client } from '../../../lib/types'


export default function ZoneDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const toast = useToast()

  const [zone, setZone] = useState<(Zone & { markets: Market }) | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [snapshot, setSnapshot] = useState<ZoneMetricSnapshot | null>(null)
  const [sparkData, setSparkData] = useState<ZoneMetricSnapshot[]>([])
  const [targetAccounts, setTargetAccounts] = useState<(ZoneTargetAccount & { accounts: any })[]>([])
  const [allAccounts, setAllAccounts] = useState<Account[]>([])

  const [placementsByAccount, setPlacementsByAccount] = useState<Record<string, { product_name: string; status: string }[]>>({})
  const [lastVisitByAccount, setLastVisitByAccount] = useState<Record<string, { visited_at: string; status: string }>>({})
  const [ordersByAccount, setOrdersByAccount] = useState<Record<string, { status: string; total_amount: number | null }[]>>({})

  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '', channel: 'on_premise',
    velocity_target: 1,
    reach_threshold: '' as string | number,
    retention_threshold: '' as string | number,
    projected_monthly_cases: '' as string | number,
    notes: '',
  })

  const [addAccountModal, setAddAccountModal] = useState(false)
  const [accountSearch, setAccountSearch] = useState('')
  const [addingAccountId, setAddingAccountId] = useState<string | null>(null)
  const [addingAll, setAddingAll] = useState(false)
  const [deleteZoneModal, setDeleteZoneModal] = useState(false)
  const [removeAccountId, setRemoveAccountId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [z, snap, snaps, targets, accounts, clients] = await Promise.all([
        getZone(id), getLatestSnapshot(id), getZoneSnapshots(id, 30),
        getZoneTargetAccounts(id), getAccounts({ limit: 500 }), getClients(),
      ])
      if (!z) { router.push('/growth'); return }
      setZone(z)
      setSnapshot(snap)
      setSparkData(snaps)
      setTargetAccounts(targets)
      setAllAccounts(accounts)
      setClient(clients.find(c => c.slug === z.markets?.client_slug) ?? null)
      setEditForm({
        name: z.name, channel: z.channel,
        velocity_target: z.velocity_target,
        reach_threshold: z.reach_threshold ?? '',
        retention_threshold: z.retention_threshold ?? '',
        projected_monthly_cases: z.projected_monthly_cases ?? '',
        notes: z.notes ?? '',
      })

      // Enrich target accounts with client-specific placements, visits, orders
      const clientSlug = z.markets?.client_slug
      const targetIds = targets.map(t => t.account_id).filter(Boolean)
      if (clientSlug && targetIds.length > 0) {
        const sb = getSupabase()
        const [plRes, vRes, orRes] = await Promise.all([
          sb.from('placements').select('account_id, product_name, status')
            .eq('client_slug', clientSlug).in('account_id', targetIds).is('lost_at', null),
          sb.from('visits').select('account_id, visited_at, status')
            .eq('client_slug', clientSlug).in('account_id', targetIds)
            .order('visited_at', { ascending: false }),
          sb.from('purchase_orders').select('account_id, status, total_amount')
            .eq('client_slug', clientSlug).in('account_id', targetIds)
            .in('status', ['sent', 'fulfilled', 'draft'])
            .order('created_at', { ascending: false }),
        ])
        const pByAcct: Record<string, { product_name: string; status: string }[]> = {}
        for (const p of plRes.data ?? []) {
          if (!pByAcct[p.account_id]) pByAcct[p.account_id] = []
          pByAcct[p.account_id].push(p)
        }
        const vByAcct: Record<string, { visited_at: string; status: string }> = {}
        for (const v of vRes.data ?? []) {
          if (!vByAcct[v.account_id]) vByAcct[v.account_id] = v
        }
        const oByAcct: Record<string, { status: string; total_amount: number | null }[]> = {}
        for (const o of orRes.data ?? []) {
          if (!oByAcct[o.account_id]) oByAcct[o.account_id] = []
          oByAcct[o.account_id].push(o)
        }
        setPlacementsByAccount(pByAcct)
        setLastVisitByAccount(vByAcct)
        setOrdersByAccount(oByAcct)
      }
    } catch (e) { console.error('zone.detail', e) }
    finally { setLoading(false) }
  }, [id, router])

  useEffect(() => { load() }, [load])

  async function handleRecompute() {
    setComputing(true)
    try {
      const res = await fetch(`/api/growth/recompute/${id}`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error || 'Recompute failed')
      const [snap, snaps] = await Promise.all([getLatestSnapshot(id), getZoneSnapshots(id, 30)])
      setSnapshot(snap)
      setSparkData(snaps)
      toast('Metrics recomputed')
    } catch (err: any) { toast(err.message || 'Recompute failed', 'error') }
    finally { setComputing(false) }
  }

  async function handleSaveEdit() {
    setSaving(true)
    try {
      await updateZone(id, {
        name: editForm.name.trim(), channel: editForm.channel as any,
        velocity_target: Number(editForm.velocity_target),
        reach_threshold: editForm.reach_threshold !== '' ? Number(editForm.reach_threshold) : null,
        retention_threshold: editForm.retention_threshold !== '' ? Number(editForm.retention_threshold) : null,
        projected_monthly_cases: editForm.projected_monthly_cases !== '' ? Number(editForm.projected_monthly_cases) : null,
        notes: editForm.notes || undefined,
      })
      toast('Focus area saved')
      setEditing(false)
      load()
    } catch (err: any) { toast(err.message || 'Failed to save', 'error') }
    finally { setSaving(false) }
  }

  async function handleDeleteZone() {
    try {
      await deleteZone(id)
      toast('Focus area deleted')
      router.push(zone?.markets?.id ? `/growth/markets/${zone.markets.id}` : '/growth')
    } catch (err: any) { toast(err.message || 'Failed to delete', 'error') }
  }

  async function handleAddAccount(accountId: string) {
    setAddingAccountId(accountId)
    try {
      await addAccountToZone(id, accountId)
      setTargetAccounts(await getZoneTargetAccounts(id))
      toast('Account added to target set')
    } catch (err: any) { toast(err.message || 'Failed to add', 'error') }
    finally { setAddingAccountId(null) }
  }

  async function handleAddAll(accounts: Account[]) {
    setAddingAll(true)
    try {
      await Promise.all(accounts.map(a => addAccountToZone(id, a.id)))
      setTargetAccounts(await getZoneTargetAccounts(id))
      toast(`Added ${accounts.length} account${accounts.length !== 1 ? 's' : ''} to target set`)
    } catch (err: any) { toast(err.message || 'Failed to add accounts', 'error') }
    finally { setAddingAll(false) }
  }

  async function handleRemoveAccount() {
    if (!removeAccountId) return
    try {
      await removeAccountFromZone(id, removeAccountId)
      setTargetAccounts(await getZoneTargetAccounts(id))
      toast('Account removed from target set')
    } catch (err: any) { toast(err.message || 'Failed to remove', 'error') }
    finally { setRemoveAccountId(null) }
  }

  const targetAccountIds = useMemo(() => new Set(targetAccounts.map(ta => ta.account_id)), [targetAccounts])

  const suggested = useMemo(() => {
    if (!zone?.markets) return []
    const m = zone.markets
    const geoTerms = [...(m.cities ?? []), ...(m.counties ?? []), ...(m.states ?? []), ...(m.zip_codes ?? [])].map(g => g.toLowerCase())
    if (geoTerms.length === 0) return []
    return allAccounts.filter(a => !targetAccountIds.has(a.id) && geoTerms.some(g => (a.address ?? '').toLowerCase().includes(g)))
  }, [allAccounts, targetAccountIds, zone])

  const searchedAccounts = useMemo(() => {
    if (accountSearch.length < 2) return []
    const q = accountSearch.toLowerCase()
    return allAccounts.filter(a => !targetAccountIds.has(a.id) && (a.name.toLowerCase().includes(q) || (a.address ?? '').toLowerCase().includes(q))).slice(0, 20)
  }, [allAccounts, targetAccountIds, accountSearch])

  const hasGeoTags = useMemo(() => {
    if (!zone?.markets) return false
    const m = zone.markets
    return (m.cities?.length ?? 0) + (m.counties?.length ?? 0) + (m.states?.length ?? 0) + (m.zip_codes?.length ?? 0) > 0
  }, [zone])

  const trend30d = useMemo(() => {
    if (sparkData.length < 2) return null
    const oldest = sparkData[0].health_score
    const newest = sparkData[sparkData.length - 1].health_score
    if (oldest === null || newest === null) return null
    return newest - oldest
  }, [sparkData])

  if (loading) return (
    <LayoutShell>
      <div style={{ padding: '48px', color: t.text.muted, textAlign: 'center' }}>Loading…</div>
    </LayoutShell>
  )
  if (!zone) return null

  const market = zone.markets!
  const clientColor = client?.color || t.gold
  const effectiveReach = zone.reach_threshold ?? market.default_reach_threshold
  const effectiveRetention = zone.retention_threshold ?? market.default_retention_threshold

  return (
    <LayoutShell>
      <div style={{ padding: '0', minHeight: '100vh' }}>

        {/* Breadcrumb */}
        <div style={{
          padding: '10px 40px', borderBottom: `1px solid ${t.border.subtle}`,
          display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: t.text.muted,
        }}>
          <Link href="/growth" style={{ color: t.text.muted, textDecoration: 'none' }}>Growth</Link>
          {client && <>
            <span>›</span>
            <Link href={`/growth?client=${client.slug}`} style={{ color: clientColor, textDecoration: 'none', fontWeight: '600' }}>{client.name}</Link>
          </>}
          <span>›</span>
          <Link href="/growth/markets" style={{ color: t.text.muted, textDecoration: 'none' }}>Territories</Link>
          <span>›</span>
          <Link href={`/growth/markets/${market.id}`} style={{ color: t.text.muted, textDecoration: 'none' }}>{market.name}</Link>
          <span>›</span>
          <span style={{ color: t.text.secondary }}>{zone.name}</span>
        </div>

        {/* Header */}
        <div style={{
          padding: '20px 40px 18px',
          borderBottom: `1px solid ${t.border.subtle}`,
          borderLeft: `4px solid ${clientColor}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          backgroundColor: clientColor + '06',
        }}>
          <div>
            {client && (
              <Link href={`/growth?client=${client.slug}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: clientColor, flexShrink: 0 }} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: clientColor, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{client.name}</span>
              </Link>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: '900', color: t.text.primary, letterSpacing: '-0.02em', margin: 0 }}>
                {zone.name}
              </h1>
              <TrendBadge delta={trend30d} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: t.text.muted }}>
                {market.name} · {channelLabel(zone.channel)}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <HealthRing score={snapshot?.health_score ?? null} size={72} strokeWidth={6} />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setEditing(true)} style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px',
                borderRadius: '7px', border: `1px solid ${t.border.default}`,
                backgroundColor: 'transparent', color: t.text.secondary, fontSize: '12px', cursor: 'pointer',
              }}>
                <Pencil size={12} /> Edit
              </button>
              <button onClick={() => setDeleteZoneModal(true)} style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px',
                borderRadius: '7px', border: `1px solid rgba(232,85,64,0.3)`,
                backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '12px', cursor: 'pointer',
              }}>
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        </div>

        {/* Two-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '0', alignItems: 'start' }}>

          {/* Left: Metrics */}
          <div style={{ padding: '24px 40px', borderRight: `1px solid ${t.border.subtle}` }}>

            {/* Metric tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <div>
                <MetricTile label="Reach" value={snapshot?.reach_pct ?? null} target={effectiveReach} unit="%"
                  note={zone.reach_threshold == null ? `Inherits ${market.default_reach_threshold}% from territory` : undefined} />
                {sparkData.length >= 2 && <div style={{ padding: '6px 16px 0' }}><Sparkline data={sparkData.map(s => s.reach_pct)} width={160} height={24} /></div>}
              </div>
              <div>
                <MetricTile label="Velocity" value={snapshot?.velocity_index ?? null} target={100} unit=""
                  note={snapshot?.velocity != null
                    ? `${snapshot.velocity.toFixed(1)} cs/acct/mo · target ${zone.velocity_target}`
                    : `Target: ${zone.velocity_target} cs/acct/mo`} />
                {sparkData.length >= 2 && <div style={{ padding: '6px 16px 0' }}><Sparkline data={sparkData.map(s => s.velocity_index)} width={160} height={24} /></div>}
              </div>
              <div>
                <MetricTile label="Retention" value={snapshot?.retention_pct ?? null} target={effectiveRetention} unit="%"
                  note={zone.retention_threshold == null ? `Inherits ${market.default_retention_threshold}% from territory` : undefined} />
                {sparkData.length >= 2 && <div style={{ padding: '6px 16px 0' }}><Sparkline data={sparkData.map(s => s.retention_pct)} width={160} height={24} /></div>}
              </div>
              <div style={{
                backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`,
                borderRadius: '10px', padding: '14px 16px',
              }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Target Set</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: t.text.primary, lineHeight: 1 }}>
                  {snapshot?.target_set_size ?? targetAccounts.length}
                </div>
                <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '6px' }}>
                  {snapshot?.active_accounts != null ? `${snapshot.active_accounts} active` : `${targetAccounts.length} total`}
                </div>
                {snapshot?.total_cases_90d != null && (
                  <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{snapshot.total_cases_90d} cases (90d)</div>
                )}
              </div>
            </div>

            {/* Radar chart */}
            {snapshot && (
              <div style={{ marginBottom: '12px', padding: '16px', borderRadius: '10px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                  Performance vs Targets
                </div>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={[
                      { metric: 'Reach', value: Math.round(snapshot.reach_pct ?? 0), target: effectiveReach },
                      { metric: 'Vel. Index', value: Math.round(snapshot.velocity_index ?? 0), target: 100 },
                      { metric: 'Retention', value: Math.round(snapshot.retention_pct ?? 0), target: effectiveRetention },
                    ]}>
                      <PolarGrid stroke={t.border.subtle} />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: t.text.muted, fontSize: 11, fontWeight: 600 }} />
                      <Radar name="Actual" dataKey="value" stroke={healthColor(snapshot.health_score)} fill={healthColor(snapshot.health_score)} fillOpacity={0.18} strokeWidth={2} />
                      <Radar name="Target" dataKey="target" stroke={t.border.default} fill="none" strokeDasharray="4 2" strokeWidth={1} />
                      <Tooltip
                        contentStyle={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderRadius: '8px', fontSize: '12px' }}
                        labelStyle={{ color: t.text.primary, fontWeight: 700 }}
                        itemStyle={{ color: t.text.secondary }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: t.text.muted }}>
                    <div style={{ width: 16, height: 2, backgroundColor: healthColor(snapshot.health_score), borderRadius: 1 }} />
                    Actual
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: t.text.muted }}>
                    <div style={{ width: 16, height: 2, backgroundColor: t.border.default, borderRadius: 1 }} />
                    Target
                  </div>
                </div>
              </div>
            )}

            {/* Recompute bar */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 16px', borderRadius: '8px',
              backgroundColor: t.bg.elevated, border: `1px solid ${t.border.subtle}`,
              marginBottom: '20px',
            }}>
              <span style={{ fontSize: '12px', color: t.text.muted }}>
                {snapshot
                  ? `Last computed: ${new Date(snapshot.computed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : 'No snapshot yet — click Recompute to populate metrics.'}
              </span>
              <button onClick={handleRecompute} disabled={computing} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', borderRadius: '7px', fontSize: '12px', cursor: computing ? 'default' : 'pointer',
                border: `1px solid ${t.goldBorder}`, backgroundColor: t.goldDim, color: t.gold, fontWeight: '600',
                opacity: computing ? 0.6 : 1,
              }}>
                <RefreshCw size={12} /> {computing ? 'Computing…' : 'Recompute Now'}
              </button>
            </div>

            {/* Notes */}
            {zone.notes && (
              <div style={{
                padding: '14px 16px', borderRadius: '8px',
                backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}`,
                fontSize: '13px', color: t.text.secondary,
              }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Notes</div>
                {zone.notes}
              </div>
            )}
          </div>

          {/* Right: Target Set (sticky) */}
          <div style={{ padding: '24px 24px 24px 24px', position: 'sticky', top: 0, maxHeight: '100vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary, margin: 0 }}>Target Set</h2>
                <p style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>
                  {targetAccounts.length} account{targetAccounts.length !== 1 ? 's' : ''} being actively worked
                </p>
              </div>
              <button onClick={() => setAddAccountModal(true)} style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px',
                borderRadius: '7px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold,
              }}>
                <Plus size={12} /> Add
              </button>
            </div>

            {targetAccounts.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '40px 16px', marginTop: '12px',
                border: `2px dashed ${t.border.default}`, borderRadius: '10px',
              }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: t.text.secondary, marginBottom: '6px' }}>No accounts yet</div>
                <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '16px' }}>Add the accounts this focus area should be actively working.</div>
                <button onClick={() => setAddAccountModal(true)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '12px',
                  backgroundColor: t.gold, color: '#0f0e0c', cursor: 'pointer', border: 'none',
                }}>
                  <Plus size={13} /> Add First Account
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                {targetAccounts.map(ta => {
                  const acct = ta.accounts
                  if (!acct) return null
                  const daysSince = acct.last_visited
                    ? Math.floor((Date.now() - new Date(acct.last_visited).getTime()) / 86400000)
                    : null
                  const statusKey = daysSince === null ? 'untouched' : daysSince <= 90 ? 'active' : daysSince <= 180 ? 'lapsed' : 'dormant'
                  const placements = placementsByAccount[acct.id] ?? []
                  const lastVisit = lastVisitByAccount[acct.id]
                  const orders = ordersByAccount[acct.id] ?? []
                  const lastVisitDays = lastVisit
                    ? Math.floor((Date.now() - new Date(lastVisit.visited_at).getTime()) / 86400000)
                    : null
                  return (
                    <div key={ta.id} style={{ position: 'relative' }}>
                      <Link href={`/accounts/${acct.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                        <div style={{
                          padding: '11px 12px', borderRadius: '8px',
                          backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`,
                          cursor: 'pointer', transition: 'border-color 150ms',
                        }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = clientColor + '60')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = t.border.default)}
                        >
                          {/* Name + status + chevron */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary, flex: 1 }}>{acct.name}</span>
                            <AccountStatusBadge status={statusKey} />
                            <ChevronRight size={12} color={t.text.muted} style={{ flexShrink: 0 }} />
                          </div>

                          {/* Placements row */}
                          {placements.length > 0 ? (
                            <div style={{ fontSize: '11px', color: t.status.success, marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontWeight: '700' }}>{placements.length}</span>
                              <span>placement{placements.length !== 1 ? 's' : ''}</span>
                              <span style={{ color: t.text.muted }}>·</span>
                              <span style={{ color: t.text.muted }}>{placements.map(p => p.product_name || p.status).slice(0, 2).join(', ')}</span>
                            </div>
                          ) : (
                            <div style={{ fontSize: '11px', color: t.text.muted, fontStyle: 'italic', marginBottom: '3px' }}>No placements for this client</div>
                          )}

                          {/* Orders row */}
                          {orders.length > 0 && (
                            <div style={{ fontSize: '11px', color: t.gold, marginBottom: '3px' }}>
                              {orders.length} order{orders.length !== 1 ? 's' : ''}
                              <span style={{ color: t.text.muted }}> · {orders[0].status}</span>
                            </div>
                          )}

                          {/* Visit row */}
                          <div style={{ fontSize: '10px', color: t.text.muted }}>
                            {lastVisit
                              ? `${lastVisitDays === 0 ? 'Today' : `${lastVisitDays}d ago`} · ${lastVisit.status}`
                              : 'No visits for this client yet'
                            }
                          </div>
                        </div>
                      </Link>
                      <button
                        onClick={e => { e.preventDefault(); setRemoveAccountId(acct.id) }}
                        style={{
                          position: 'absolute', top: '8px', right: '30px',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: t.text.muted, padding: '2px', display: 'flex', alignItems: 'center',
                          opacity: 0.4,
                        }}
                        title="Remove from target set"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* No geo tags — explain how to get suggestions */}
            {suggested.length === 0 && !hasGeoTags && (
              <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px', border: `1px dashed ${t.border.default}`, backgroundColor: t.bg.input }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: t.text.muted, marginBottom: '4px' }}>No account suggestions</div>
                <div style={{ fontSize: '11px', color: t.text.muted, lineHeight: 1.5 }}>
                  <Link href={`/growth/markets/${market.id}`} style={{ color: t.gold, textDecoration: 'none', fontWeight: '600' }}>
                    Add a location to {market.name}
                  </Link>{' '}
                  (cities, counties, or zip codes) and matching accounts from your database will appear here automatically.
                </div>
              </div>
            )}

            {/* Suggested Additions */}
            {suggested.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    In {market.name} · {suggested.length} match{suggested.length !== 1 ? 'es' : ''}
                  </div>
                  {suggested.length > 1 && (
                    <button onClick={() => handleAddAll(suggested)} disabled={addingAll} style={{
                      display: 'flex', alignItems: 'center', gap: '3px',
                      padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                      cursor: addingAll ? 'default' : 'pointer',
                      backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`,
                      color: t.gold, opacity: addingAll ? 0.6 : 1,
                    }}>
                      <Plus size={10} /> {addingAll ? 'Adding…' : 'Add All'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {suggested.map(a => (
                    <div key={a.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', borderRadius: '8px',
                      backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: t.text.primary }}>{a.name}</div>
                        {a.address && <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '1px' }}>{a.address.split(',')[0]}</div>}
                      </div>
                      <button onClick={() => handleAddAccount(a.id)} disabled={addingAccountId === a.id} style={{
                        display: 'flex', alignItems: 'center', gap: '3px',
                        padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                        cursor: 'pointer', flexShrink: 0, marginLeft: '8px',
                        backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`,
                        color: t.gold, opacity: addingAccountId === a.id ? 0.6 : 1,
                      }}>
                        <Plus size={10} /> Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.page, borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${t.border.default}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: '700', color: t.text.primary }}>Edit Focus Area</h2>
              <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Name *</label>
                  <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Channel</label>
                  <select value={editForm.channel} onChange={e => setEditForm(f => ({ ...f, channel: e.target.value }))} style={selectStyle}>
                    <option value="on_premise">On-Premise</option>
                    <option value="off_premise">Off-Premise</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Velocity Target (cases/active account/month)</label>
                <input type="number" min="0.1" step="0.1" value={editForm.velocity_target} onChange={e => setEditForm(f => ({ ...f, velocity_target: Number(e.target.value) }))} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Reach Target (%) <span style={{ color: t.text.muted, fontWeight: '400', fontSize: '10px' }}>— {zone.reach_threshold == null ? `inherits ${market.default_reach_threshold}%` : 'override active'}</span></label>
                  <input type="number" min="0" max="100" value={editForm.reach_threshold} onChange={e => setEditForm(f => ({ ...f, reach_threshold: e.target.value }))} placeholder={String(market.default_reach_threshold)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Retention Target (%) <span style={{ color: t.text.muted, fontWeight: '400', fontSize: '10px' }}>— {zone.retention_threshold == null ? `inherits ${market.default_retention_threshold}%` : 'override active'}</span></label>
                  <input type="number" min="0" max="100" value={editForm.retention_threshold} onChange={e => setEditForm(f => ({ ...f, retention_threshold: e.target.value }))} placeholder={String(market.default_retention_threshold)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Projected Monthly Cases</label>
                <input type="number" min="0" value={editForm.projected_monthly_cases} onChange={e => setEditForm(f => ({ ...f, projected_monthly_cases: e.target.value }))} placeholder="Used for Supply Headroom" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Strategy, context…" />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button onClick={() => setEditing(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleSaveEdit} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {addAccountModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.page, borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflowY: 'auto', border: `1px solid ${t.border.default}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary }}>Add to Target Set</h2>
              <button onClick={() => { setAddAccountModal(false); setAccountSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={18} /></button>
            </div>
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: t.text.muted, pointerEvents: 'none' }} />
              <input type="text" placeholder="Search by name or address…" value={accountSearch} onChange={e => setAccountSearch(e.target.value)} autoFocus style={{ ...inputStyle, paddingLeft: '32px' }} />
            </div>
            {accountSearch.length < 2 ? (
              <div style={{ fontSize: '13px', color: t.text.muted, padding: '20px', textAlign: 'center' }}>Type at least 2 characters to search</div>
            ) : searchedAccounts.length === 0 ? (
              <div style={{ fontSize: '13px', color: t.text.muted, padding: '20px', textAlign: 'center' }}>No accounts found</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {searchedAccounts.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{a.name}</div>
                      {a.address && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '1px' }}>{a.address}</div>}
                    </div>
                    <button onClick={() => handleAddAccount(a.id)} disabled={addingAccountId === a.id} style={{
                      display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px', borderRadius: '6px',
                      fontSize: '12px', fontWeight: '600', cursor: 'pointer', flexShrink: 0, marginLeft: '10px',
                      backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold,
                      opacity: addingAccountId === a.id ? 0.6 : 1,
                    }}>
                      <Plus size={11} /> Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal isOpen={deleteZoneModal} title="Delete Focus Area"
        message={`Delete "${zone.name}" and its target set? This cannot be undone.`}
        confirmLabel="Delete" onConfirm={handleDeleteZone} onClose={() => setDeleteZoneModal(false)} />
      <ConfirmModal isOpen={!!removeAccountId} title="Remove from Target Set"
        message="Remove this account from the target set? The account itself is not deleted."
        confirmLabel="Remove" onConfirm={handleRemoveAccount} onClose={() => setRemoveAccountId(null)} />
    </LayoutShell>
  )
}
