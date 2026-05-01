'use client'
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Star, Pencil, Trash2, X, Search, RefreshCw, ChevronRight, Settings2 } from 'lucide-react'
import LayoutShell, { useToast } from '../../../layout-shell'
import ConfirmModal from '../../../components/ConfirmModal'
import { t, card, inputStyle, labelStyle, selectStyle, btnPrimary, btnSecondary } from '../../../lib/theme'
import { getClients, getAccounts } from '../../../lib/data'
import { getSupabase } from '../../../lib/supabase'
import {
  getMarket, updateMarket, deleteMarket,
  createZone, updateZone, deleteZone,
  getZoneTargetAccounts, addAccountToZone, removeAccountFromZone,
  getLatestSnapshotsByZone, getZoneSnapshots,
} from '../../../lib/concentric/data'
import {
  HealthRing, MetricTile, AccountStatusBadge, Sparkline, channelLabel, healthColor,
} from '../../_components'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip,
} from 'recharts'
import type { Market, Zone, ZoneMetricSnapshot, ZoneTargetAccount } from '../../../lib/concentric/types'
import type { Account, Client } from '../../../lib/types'

interface ZoneDetailData {
  targets: (ZoneTargetAccount & { accounts: Account | null })[]
  placementsByAccount: Record<string, { product_name: string; status: string }[]>
  lastVisitByAccount: Record<string, { visited_at: string; status: string }>
  ordersByAccount: Record<string, { status: string; total_amount: number | null }[]>
}

// ─── TagInput ─────────────────────────────────────────────────────────────────

function TagInput({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  function add() {
    const val = draft.trim()
    if (val && !values.includes(val)) onChange([...values, val])
    setDraft('')
  }
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', padding: '6px 8px', borderRadius: '7px', border: `1px solid ${t.border.default}`, backgroundColor: t.bg.input, minHeight: '38px' }}>
        {values.map(v => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '4px', fontSize: '11px', backgroundColor: t.goldDim, color: t.gold, border: `1px solid ${t.goldBorder}` }}>
            {v}
            <button type="button" onClick={() => onChange(values.filter(x => x !== v))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: t.gold, display: 'flex', alignItems: 'center' }}>
              <X size={10} />
            </button>
          </span>
        ))}
        <input type="text" value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          onBlur={add} placeholder={values.length === 0 ? 'Add…' : '+'}
          style={{ flex: 1, minWidth: '60px', background: 'none', border: 'none', outline: 'none', fontSize: '12px', color: t.text.primary }} />
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function MarketDetailContent() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()

  const [market, setMarket] = useState<(Market & { zones: Zone[] }) | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, ZoneMetricSnapshot>>({})
  const [loading, setLoading] = useState(true)

  // Territory edit
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteMarketModal, setDeleteMarketModal] = useState(false)
  const editGeoInputRef = useRef<HTMLInputElement>(null)
  const editAcRef = useRef<any>(null)
  const [editForm, setEditForm] = useState({
    name: '', priority: false, cities: [] as string[], counties: [] as string[],
    states: [] as string[], zip_codes: [] as string[],
    default_reach_threshold: 55, default_retention_threshold: 65, notes: '',
  })

  // Active brand tab — '' means all brands; pre-set via ?client= param
  const [activeClientTab, setActiveClientTab] = useState<string>(searchParams.get('client') ?? '')

  // Per-zone detail data (lazy loaded when tab selected)
  const [zoneDetails, setZoneDetails] = useState<Record<string, ZoneDetailData>>({})
  const [zoneSparklines, setZoneSparklines] = useState<Record<string, ZoneMetricSnapshot[]>>({})
  const [loadingZoneIds, setLoadingZoneIds] = useState<Set<string>>(new Set())
  const [computingZoneIds, setComputingZoneIds] = useState<Set<string>>(new Set())

  // Zone settings modal
  const [settingsZoneId, setSettingsZoneId] = useState<string | null>(null)
  const [settingsForm, setSettingsForm] = useState({
    name: '', channel: 'on_premise', velocity_target: 1,
    reach_threshold: '' as string | number,
    retention_threshold: '' as string | number,
    projected_monthly_cases: '' as string | number,
    notes: '',
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [deleteZoneId, setDeleteZoneId] = useState<string | null>(null)

  // Add Brand modal
  const [addBrandModal, setAddBrandModal] = useState(false)
  const [addBrandForm, setAddBrandForm] = useState({ client_slug: '', channel: 'on_premise' })
  const [savingBrand, setSavingBrand] = useState(false)

  // Add / remove account
  const [addAccountZoneId, setAddAccountZoneId] = useState<string | null>(null)
  const [accountSearch, setAccountSearch] = useState('')
  const [allAccounts, setAllAccounts] = useState<Account[]>([])
  const [loadingAllAccounts, setLoadingAllAccounts] = useState(false)
  const [addingAccountId, setAddingAccountId] = useState<string | null>(null)
  const [addingAll, setAddingAll] = useState(false)
  const [removeAccountTarget, setRemoveAccountTarget] = useState<{ zoneId: string; accountId: string } | null>(null)

  // ── Initial load ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const [m, cls] = await Promise.all([getMarket(id), getClients()])
      if (!m) { router.push('/growth'); return }
      const snaps = await getLatestSnapshotsByZone((m.zones || []).map(z => z.id))
      setMarket(m)
      setClients(cls)
      setSnapshots(snaps)
      setEditForm({
        name: m.name, priority: m.priority,
        cities: m.cities ?? [], counties: m.counties ?? [],
        states: m.states ?? [], zip_codes: m.zip_codes ?? [],
        default_reach_threshold: m.default_reach_threshold,
        default_retention_threshold: m.default_retention_threshold,
        notes: m.notes ?? '',
      })
    } catch (e) { console.error('market.detail', e) }
    finally { setLoading(false) }
  }, [id, router])

  useEffect(() => { load() }, [load])

  // ── Google Maps autocomplete ───────────────────────────────────────────────

  useEffect(() => {
    if (!editing || typeof window === 'undefined') return
    function initAc() {
      if (!editGeoInputRef.current || editAcRef.current) return
      editAcRef.current = new (window as any).google.maps.places.Autocomplete(editGeoInputRef.current, {
        types: ['(regions)'], componentRestrictions: { country: 'us' }, fields: ['address_components'],
      })
      editAcRef.current.addListener('place_changed', () => {
        const place = editAcRef.current.getPlace()
        const components: any[] = place.address_components ?? []
        const get = (type: string) => components.find((c: any) => c.types.includes(type))
        const city = get('locality')?.long_name ?? get('sublocality_level_1')?.long_name ?? ''
        const countyRaw = get('administrative_area_level_2')?.long_name ?? ''
        const county = countyRaw.replace(/ County$/, '').replace(/ Parish$/, '')
        const state = get('administrative_area_level_1')?.short_name ?? ''
        const zip = get('postal_code')?.long_name ?? ''
        setEditForm(f => ({
          ...f,
          cities: city && !f.cities.includes(city) ? [...f.cities, city] : f.cities,
          counties: county && !f.counties.includes(county) ? [...f.counties, county] : f.counties,
          states: state && !f.states.includes(state) ? [...f.states, state] : f.states,
          zip_codes: zip && !f.zip_codes.includes(zip) ? [...f.zip_codes, zip] : f.zip_codes,
        }))
      })
    }
    if ((window as any).google?.maps?.places) { initAc(); return }
    if (!document.getElementById('google-maps-script')) {
      const script = document.createElement('script')
      script.id = 'google-maps-script'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`
      script.async = true
      document.head.appendChild(script)
    }
    const poll = setInterval(() => { if ((window as any).google?.maps?.places) { clearInterval(poll); initAc() } }, 150)
    return () => { clearInterval(poll); editAcRef.current = null }
  }, [editing])

  // ── Zone detail lazy loading ───────────────────────────────────────────────

  const loadZoneDetail = useCallback(async (zoneId: string, clientSlug: string) => {
    setLoadingZoneIds(prev => new Set([...prev, zoneId]))
    try {
      const [targets, sparkSnaps] = await Promise.all([
        getZoneTargetAccounts(zoneId),
        getZoneSnapshots(zoneId, 30),
      ])
      setZoneSparklines(prev => ({ ...prev, [zoneId]: sparkSnaps }))
      const targetIds = targets.map(ta => ta.account_id).filter(Boolean)
      const placementsByAccount: Record<string, { product_name: string; status: string }[]> = {}
      const lastVisitByAccount: Record<string, { visited_at: string; status: string }> = {}
      const ordersByAccount: Record<string, { status: string; total_amount: number | null }[]> = {}
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
        for (const p of plRes.data ?? []) {
          if (!placementsByAccount[p.account_id]) placementsByAccount[p.account_id] = []
          placementsByAccount[p.account_id].push(p)
        }
        for (const v of vRes.data ?? []) {
          if (!lastVisitByAccount[v.account_id]) lastVisitByAccount[v.account_id] = v
        }
        for (const o of orRes.data ?? []) {
          if (!ordersByAccount[o.account_id]) ordersByAccount[o.account_id] = []
          ordersByAccount[o.account_id].push(o)
        }
      }
      setZoneDetails(prev => ({
        ...prev,
        [zoneId]: { targets, placementsByAccount, lastVisitByAccount, ordersByAccount },
      }))
    } catch (e) { console.error('zone.detail.load', e) }
    finally { setLoadingZoneIds(prev => { const s = new Set(prev); s.delete(zoneId); return s }) }
  }, [])

  useEffect(() => {
    if (!activeClientTab || !market) return
    for (const z of (market.zones || []).filter(z => z.client_slug === activeClientTab)) {
      if (!zoneDetails[z.id] && !loadingZoneIds.has(z.id)) {
        loadZoneDetail(z.id, activeClientTab)
      }
    }
    // Pre-load all accounts so suggested matches show immediately
    if (allAccounts.length === 0 && !loadingAllAccounts) {
      setLoadingAllAccounts(true)
      getAccounts({ limit: 500 }).then(setAllAccounts).catch(() => {}).finally(() => setLoadingAllAccounts(false))
    }
  }, [activeClientTab, market, zoneDetails, loadingZoneIds, loadZoneDetail, allAccounts.length, loadingAllAccounts])

  // ── Reload a zone's targets after add/remove ───────────────────────────────

  async function reloadZoneTargets(zoneId: string, clientSlug: string) {
    const targets = await getZoneTargetAccounts(zoneId)
    const targetIds = targets.map(ta => ta.account_id).filter(Boolean)
    const placementsByAccount: Record<string, { product_name: string; status: string }[]> = {}
    const lastVisitByAccount: Record<string, { visited_at: string; status: string }> = {}
    const ordersByAccount: Record<string, { status: string; total_amount: number | null }[]> = {}
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
      for (const p of plRes.data ?? []) {
        if (!placementsByAccount[p.account_id]) placementsByAccount[p.account_id] = []
        placementsByAccount[p.account_id].push(p)
      }
      for (const v of vRes.data ?? []) {
        if (!lastVisitByAccount[v.account_id]) lastVisitByAccount[v.account_id] = v
      }
      for (const o of orRes.data ?? []) {
        if (!ordersByAccount[o.account_id]) ordersByAccount[o.account_id] = []
        ordersByAccount[o.account_id].push(o)
      }
    }
    setZoneDetails(prev => ({ ...prev, [zoneId]: { targets, placementsByAccount, lastVisitByAccount, ordersByAccount } }))
  }

  // ── Territory handlers ─────────────────────────────────────────────────────

  async function handleAddBrand() {
    if (!addBrandForm.client_slug) return
    setSavingBrand(true)
    try {
      const cLabel = addBrandForm.channel === 'on_premise' ? 'On-Premise'
        : addBrandForm.channel === 'off_premise' ? 'Off-Premise' : 'On & Off-Premise'
      await createZone({
        market_id: id,
        client_slug: addBrandForm.client_slug,
        channel: addBrandForm.channel as any,
        name: cLabel,
        velocity_target: 1,
      })
      toast('Brand added')
      setAddBrandModal(false)
      setAddBrandForm({ client_slug: '', channel: 'on_premise' })
      await load()
      setActiveClientTab(addBrandForm.client_slug)
    } catch (err: any) { toast(err.message || 'Failed to add brand', 'error') }
    finally { setSavingBrand(false) }
  }

  async function handleSaveMarket() {
    if (!editForm.name.trim()) return
    setSaving(true)
    try {
      await updateMarket(id, editForm)
      toast('Territory updated')
      setEditing(false)
      load()
    } catch (err: any) { toast(err.message || 'Failed to save', 'error') }
    finally { setSaving(false) }
  }

  async function handleDeleteMarket() {
    try {
      await deleteMarket(id)
      toast('Territory deleted')
      router.push('/growth')
    } catch (err: any) { toast(err.message || 'Failed to delete', 'error') }
  }

  // ── Settings modal ─────────────────────────────────────────────────────────

  function openSettings(zone: Zone) {
    setSettingsForm({
      name: zone.name, channel: zone.channel,
      velocity_target: zone.velocity_target,
      reach_threshold: zone.reach_threshold ?? '',
      retention_threshold: zone.retention_threshold ?? '',
      projected_monthly_cases: zone.projected_monthly_cases ?? '',
      notes: zone.notes ?? '',
    })
    setSettingsZoneId(zone.id)
  }

  async function handleSaveSettings() {
    if (!settingsZoneId) return
    setSavingSettings(true)
    try {
      await updateZone(settingsZoneId, {
        name: settingsForm.name.trim(),
        channel: settingsForm.channel as any,
        velocity_target: Number(settingsForm.velocity_target),
        reach_threshold: settingsForm.reach_threshold !== '' ? Number(settingsForm.reach_threshold) : null,
        retention_threshold: settingsForm.retention_threshold !== '' ? Number(settingsForm.retention_threshold) : null,
        projected_monthly_cases: settingsForm.projected_monthly_cases !== '' ? Number(settingsForm.projected_monthly_cases) : null,
        notes: settingsForm.notes || undefined,
      })
      toast('Settings saved')
      setSettingsZoneId(null)
      load()
    } catch (err: any) { toast(err.message || 'Failed to save', 'error') }
    finally { setSavingSettings(false) }
  }

  async function handleDeleteZone(zoneId: string) {
    try {
      await deleteZone(zoneId)
      toast('Removed')
      setDeleteZoneId(null)
      load()
    } catch (err: any) { toast(err.message || 'Failed to delete', 'error') }
  }

  // ── Recompute ──────────────────────────────────────────────────────────────

  async function handleRecompute(zoneId: string) {
    setComputingZoneIds(prev => new Set([...prev, zoneId]))
    try {
      const res = await fetch(`/api/growth/recompute/${zoneId}`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error || 'Recompute failed')
      const newSnaps = await getLatestSnapshotsByZone([zoneId])
      setSnapshots(prev => ({ ...prev, ...newSnaps }))
      toast('Metrics updated')
    } catch (err: any) { toast(err.message || 'Recompute failed', 'error') }
    finally { setComputingZoneIds(prev => { const s = new Set(prev); s.delete(zoneId); return s }) }
  }

  // ── Account add / remove ───────────────────────────────────────────────────

  async function openAddAccount(zoneId: string) {
    setAddAccountZoneId(zoneId)
    if (allAccounts.length === 0) {
      setLoadingAllAccounts(true)
      try { setAllAccounts(await getAccounts({ limit: 500 })) }
      catch (e) { console.error('accounts.load', e) }
      finally { setLoadingAllAccounts(false) }
    }
  }

  async function handleAddAccount(accountId: string) {
    if (!addAccountZoneId) return
    const zoneId = addAccountZoneId
    const zone = market?.zones.find(z => z.id === zoneId)
    setAddingAccountId(accountId)
    try {
      await addAccountToZone(zoneId, accountId)
      toast('Account added')
      if (zone?.client_slug) await reloadZoneTargets(zoneId, zone.client_slug)
      const newSnaps = await getLatestSnapshotsByZone([zoneId])
      setSnapshots(prev => ({ ...prev, ...newSnaps }))
    } catch (err: any) { toast(err.message || 'Failed to add', 'error') }
    finally { setAddingAccountId(null) }
  }

  async function handleAddAll(zoneId: string, accounts: Account[]) {
    const zone = market?.zones.find(z => z.id === zoneId)
    setAddingAll(true)
    try {
      await Promise.all(accounts.map(a => addAccountToZone(zoneId, a.id)))
      toast(`Added ${accounts.length} account${accounts.length !== 1 ? 's' : ''}`)
      if (zone?.client_slug) await reloadZoneTargets(zoneId, zone.client_slug)
      const newSnaps = await getLatestSnapshotsByZone([zoneId])
      setSnapshots(prev => ({ ...prev, ...newSnaps }))
    } catch (err: any) { toast(err.message || 'Failed to add', 'error') }
    finally { setAddingAll(false) }
  }

  async function handleRemoveAccount() {
    if (!removeAccountTarget) return
    const { zoneId, accountId } = removeAccountTarget
    const zone = market?.zones.find(z => z.id === zoneId)
    try {
      await removeAccountFromZone(zoneId, accountId)
      toast('Account removed')
      if (zone?.client_slug) await reloadZoneTargets(zoneId, zone.client_slug)
    } catch (err: any) { toast(err.message || 'Failed to remove', 'error') }
    finally { setRemoveAccountTarget(null) }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const territoryClients = useMemo(() => {
    const slugs = new Set((market?.zones || []).map(z => z.client_slug).filter(Boolean) as string[])
    return clients.filter(c => slugs.has(c.slug))
  }, [market, clients])

  const activeClientZones = useMemo(() =>
    activeClientTab
      ? (market?.zones || []).filter(z => z.client_slug === activeClientTab)
      : [],
  [market, activeClientTab])

  const searchedAccounts = useMemo(() => {
    if (!addAccountZoneId || accountSearch.length < 2) return []
    const targetIds = new Set((zoneDetails[addAccountZoneId]?.targets ?? []).map(ta => ta.account_id))
    const q = accountSearch.toLowerCase()
    return allAccounts
      .filter(a => !targetIds.has(a.id) && (a.name.toLowerCase().includes(q) || (a.address ?? '').toLowerCase().includes(q)))
      .slice(0, 20)
  }, [allAccounts, addAccountZoneId, zoneDetails, accountSearch])

  const hasGeoTags = useMemo(() => {
    if (!market) return false
    return (market.cities?.length ?? 0) + (market.counties?.length ?? 0) + (market.states?.length ?? 0) + (market.zip_codes?.length ?? 0) > 0
  }, [market])

  // Accounts in the territory's geo area not yet in the active zone's target set
  const suggestedForZone = useCallback((zoneId: string): Account[] => {
    if (!market || !hasGeoTags) return []
    const targetIds = new Set((zoneDetails[zoneId]?.targets ?? []).map(ta => ta.account_id))
    const geoTerms = [
      ...(market.cities ?? []),
      ...(market.counties ?? []),
      ...(market.states ?? []),
      ...(market.zip_codes ?? []),
    ].map(g => g.toLowerCase())
    return allAccounts.filter(a =>
      !targetIds.has(a.id) &&
      geoTerms.some(g => (a.address ?? '').toLowerCase().includes(g))
    )
  }, [market, hasGeoTags, zoneDetails, allAccounts])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <LayoutShell><div style={{ padding: '48px', color: t.text.muted, textAlign: 'center' }}>Loading…</div></LayoutShell>
  )
  if (!market) return null

  const geoParts = [
    ...(market.cities ?? []),
    ...(market.counties?.map(c => `${c} County`) ?? []),
    ...(market.states ?? []),
  ].filter(Boolean)
  const geoSummary = geoParts.slice(0, 4).join(' · ') + (geoParts.length > 4 ? ` +${geoParts.length - 4} more` : '')

  return (
    <LayoutShell>
      <div style={{ padding: '0', minHeight: '100vh' }}>

        {/* Breadcrumb */}
        <div style={{ padding: '10px 40px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: t.text.muted }}>
          <Link href="/growth" style={{ color: t.text.muted, textDecoration: 'none' }}>Growth</Link>
          <span>›</span>
          <span style={{ color: t.text.secondary }}>{market.name}</span>
        </div>

        {/* Territory header */}
        {!editing ? (
          <div style={{
            padding: '20px 40px 18px',
            borderBottom: `1px solid ${t.border.subtle}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                {market.priority && <Star size={16} color={t.gold} fill={t.gold} />}
                <h1 style={{ fontSize: '22px', fontWeight: '900', color: t.text.primary, letterSpacing: '-0.02em', margin: 0 }}>
                  {market.name}
                </h1>
              </div>
              {geoSummary ? (
                <div style={{ fontSize: '12px', color: t.text.muted }}>{geoSummary}</div>
              ) : (
                <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '12px', color: t.border.hover, fontStyle: 'italic' }}>
                  No location defined — click Edit to add
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '7px', border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.secondary, fontSize: '12px', cursor: 'pointer' }}>
                <Pencil size={12} /> Edit
              </button>
              <button onClick={() => setDeleteMarketModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '7px', border: `1px solid rgba(232,85,64,0.3)`, backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '12px', cursor: 'pointer' }}>
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '20px 40px', borderBottom: `1px solid ${t.border.subtle}` }}>
            <div style={{ ...card, padding: '20px 24px', maxWidth: '700px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary, marginBottom: '18px' }}>Edit Territory</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: '2px' }}>
                    <button type="button" onClick={() => setEditForm(f => ({ ...f, priority: !f.priority }))} style={{ width: 18, height: 18, borderRadius: '3px', cursor: 'pointer', border: `2px solid ${editForm.priority ? t.gold : t.border.default}`, backgroundColor: editForm.priority ? t.gold : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {editForm.priority && <span style={{ color: '#0f0e0c', fontSize: '11px', fontWeight: '800' }}>✓</span>}
                    </button>
                    <span style={{ fontSize: '12px', color: t.text.secondary, cursor: 'pointer' }} onClick={() => setEditForm(f => ({ ...f, priority: !f.priority }))}>Priority ★</span>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Add Location</label>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: t.text.muted, pointerEvents: 'none' }} />
                    <input ref={editGeoInputRef} type="text" placeholder="Search city, county, or region…" style={{ ...inputStyle, paddingLeft: '30px', fontSize: '12px' }} />
                  </div>
                  <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '3px' }}>Selecting appends to the geo tags below</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <TagInput label="Cities" values={editForm.cities} onChange={v => setEditForm(f => ({ ...f, cities: v }))} />
                  <TagInput label="Counties" values={editForm.counties} onChange={v => setEditForm(f => ({ ...f, counties: v }))} />
                  <TagInput label="States" values={editForm.states} onChange={v => setEditForm(f => ({ ...f, states: v }))} />
                  <TagInput label="Zip Codes" values={editForm.zip_codes} onChange={v => setEditForm(f => ({ ...f, zip_codes: v }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Default Reach Target (%)</label>
                    <input type="number" min="0" max="100" value={editForm.default_reach_threshold} onChange={e => setEditForm(f => ({ ...f, default_reach_threshold: Number(e.target.value) }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Default Retention Target (%)</label>
                    <input type="number" min="0" max="100" value={editForm.default_retention_threshold} onChange={e => setEditForm(f => ({ ...f, default_retention_threshold: Number(e.target.value) }))} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditing(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={handleSaveMarket} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Brand selector bar */}
        {!editing && (
          <div style={{
            padding: '0 40px',
            borderBottom: `1px solid ${t.border.subtle}`,
            display: 'flex', alignItems: 'stretch', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', gap: '0' }}>
              {/* All Brands tab */}
              <button
                onClick={() => setActiveClientTab('')}
                style={{
                  padding: '12px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                  border: 'none', borderBottom: `2px solid ${activeClientTab === '' ? t.gold : 'transparent'}`,
                  backgroundColor: 'transparent',
                  color: activeClientTab === '' ? t.text.primary : t.text.muted,
                  transition: 'color 150ms, border-color 150ms',
                  marginBottom: '-1px',
                }}>
                All Brands
              </button>

              {/* Per-client tabs */}
              {territoryClients.map(c => {
                const color = c.color || t.gold
                const active = activeClientTab === c.slug
                return (
                  <button key={c.slug}
                    onClick={() => setActiveClientTab(active ? '' : c.slug)}
                    style={{
                      padding: '12px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                      border: 'none', borderBottom: `2px solid ${active ? color : 'transparent'}`,
                      backgroundColor: 'transparent',
                      color: active ? color : t.text.muted,
                      transition: 'color 150ms, border-color 150ms',
                      display: 'flex', alignItems: 'center', gap: '6px',
                      marginBottom: '-1px',
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, display: 'inline-block', flexShrink: 0 }} />
                    {c.name}
                  </button>
                )
              })}
            </div>

            {/* Add Brand button */}
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '16px' }}>
              <button
                onClick={() => setAddBrandModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: '600', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold, cursor: 'pointer' }}>
                <Plus size={12} /> Add Brand
              </button>
            </div>
          </div>
        )}

        {/* ── Content ───────────────────────────────────────────────────────── */}
        {!editing && (

          /* ── All Brands view ──────────────────────────────────────────────── */
          activeClientTab === '' ? (
            <div style={{ padding: '24px 40px' }}>
              {territoryClients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 24px', border: `2px dashed ${t.border.default}`, borderRadius: '12px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.secondary, marginBottom: '8px' }}>No brands tracked here yet</div>
                  <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '20px' }}>
                    Start tracking a brand's performance in this territory.
                  </div>
                  <button onClick={() => setAddBrandModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', backgroundColor: t.gold, color: '#0f0e0c', cursor: 'pointer', border: 'none' }}>
                    <Plus size={14} /> Add First Brand
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                  {territoryClients.map(c => {
                    const clientZones = (market.zones || []).filter(z => z.client_slug === c.slug)
                    const validSnaps = clientZones.map(z => snapshots[z.id]).filter(Boolean) as ZoneMetricSnapshot[]
                    const scores = validSnaps.map(s => s.health_score).filter((h): h is number => h != null)
                    const avgHealth = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
                    const totalTargets = validSnaps.reduce((s, sn) => s + (sn.target_set_size ?? 0), 0)
                    const totalActive = validSnaps.reduce((s, sn) => s + (sn.active_accounts ?? 0), 0)
                    const avgReach = validSnaps.length > 0 ? validSnaps.reduce((s, sn) => s + (sn.reach_pct ?? 0), 0) / validSnaps.length : null
                    const avgVel = validSnaps.length > 0 ? validSnaps.reduce((s, sn) => s + (sn.velocity_index ?? 0), 0) / validSnaps.length : null
                    const avgRet = validSnaps.length > 0 ? validSnaps.reduce((s, sn) => s + (sn.retention_pct ?? 0), 0) / validSnaps.length : null
                    const color = c.color || t.gold
                    const channels = clientZones.map(z => channelLabel(z.channel)).join(' · ')
                    return (
                      <div
                        key={c.slug}
                        onClick={() => setActiveClientTab(c.slug)}
                        style={{ ...card, padding: '18px', cursor: 'pointer', borderTop: `3px solid ${color}` }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 6px 20px rgba(0,0,0,0.3), 0 0 0 1px ${color}30`)}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
                              <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                              <span style={{ fontSize: '15px', fontWeight: '800', color: t.text.primary }}>{c.name}</span>
                            </div>
                            <div style={{ fontSize: '11px', color: t.text.muted }}>{channels}</div>
                          </div>
                          <HealthRing score={avgHealth} size={56} strokeWidth={5} showLabel={false} />
                        </div>
                        {validSnaps.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                            {[{ label: 'REACH', v: avgReach }, { label: 'VEL', v: avgVel }, { label: 'RET', v: avgRet }].map(m => (
                              <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '8px', color: t.text.muted, fontWeight: '700', width: '24px', letterSpacing: '0.07em', flexShrink: 0 }}>{m.label}</span>
                                <div style={{ flex: 1, height: '3px', borderRadius: '2px', backgroundColor: t.border.subtle, overflow: 'hidden' }}>
                                  {m.v != null && <div style={{ height: '100%', width: `${Math.min(m.v, 100)}%`, backgroundColor: healthColor(m.v), borderRadius: '2px' }} />}
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: m.v != null ? healthColor(m.v) : t.text.muted, width: '32px', textAlign: 'right', flexShrink: 0 }}>
                                  {m.v != null ? `${Math.round(m.v)}%` : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${t.border.subtle}`, paddingTop: '9px' }}>
                          <span style={{ fontSize: '10px', color: t.text.muted }}>
                            {totalTargets > 0 ? `${totalTargets} targets · ${totalActive} active` : 'No target accounts yet'}
                          </span>
                          <span style={{ fontSize: '11px', color: color, fontWeight: '700' }}>View →</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          ) : (

            /* ── Per-brand view: full zone detail layout ──────────────────── */
            activeClientZones.length === 0 ? (
              <div style={{ padding: '60px 40px', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.secondary, marginBottom: '8px' }}>
                  {territoryClients.find(c => c.slug === activeClientTab)?.name ?? 'This brand'} isn't tracked in this territory yet
                </div>
                <button onClick={() => setAddBrandModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 16px', borderRadius: '7px', fontWeight: '600', fontSize: '12px', backgroundColor: t.gold, color: '#0f0e0c', cursor: 'pointer', border: 'none' }}>
                  <Plus size={12} /> Start Tracking
                </button>
              </div>
            ) : (
              /* One section per zone (usually one, occasionally both channels) */
              activeClientZones.map(z => {
                const zClient = clients.find(c => c.slug === z.client_slug) ?? null
                const snap = snapshots[z.id] ?? null
                const detail = zoneDetails[z.id] ?? null
                const loadingDetail = loadingZoneIds.has(z.id)
                const computing = computingZoneIds.has(z.id)
                const clientColor = zClient?.color || t.gold
                const effectiveReach = z.reach_threshold ?? market.default_reach_threshold
                const effectiveRetention = z.retention_threshold ?? market.default_retention_threshold

                return (
                  <div key={z.id}>
                    {/* Channel label when client has multiple zones */}
                    {activeClientZones.length > 1 && (
                      <div style={{ padding: '10px 40px', backgroundColor: clientColor + '0a', borderBottom: `1px solid ${t.border.subtle}`, borderLeft: `3px solid ${clientColor}` }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: clientColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {channelLabel(z.channel)}
                        </span>
                      </div>
                    )}

                    {/* Two-column body: metrics left, accounts right */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', alignItems: 'start' }}>

                      {/* Left: Metrics */}
                      <div style={{ padding: '24px 40px', borderRight: `1px solid ${t.border.subtle}` }}>

                        {/* Health ring + metric tiles */}
                        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 1fr 1fr 1fr', gap: '12px', alignItems: 'stretch', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <HealthRing score={snap?.health_score ?? null} size={68} strokeWidth={6} />
                          </div>
                          <MetricTile
                            label="Reach"
                            value={snap?.reach_pct ?? null}
                            target={effectiveReach}
                            unit="%"
                            note={z.reach_threshold == null ? `Inherits ${market.default_reach_threshold}% from territory` : undefined}
                          />
                          <MetricTile
                            label="Velocity"
                            value={snap?.velocity_index ?? null}
                            target={100}
                            unit=""
                            note={snap?.velocity != null
                              ? `${snap.velocity.toFixed(1)} cs/acct/mo · target ${z.velocity_target}`
                              : `Target: ${z.velocity_target} cs/acct/mo`}
                          />
                          <MetricTile
                            label="Retention"
                            value={snap?.retention_pct ?? null}
                            target={effectiveRetention}
                            unit="%"
                            note={z.retention_threshold == null ? `Inherits ${market.default_retention_threshold}% from territory` : undefined}
                          />
                          <div style={{ backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`, borderRadius: '10px', padding: '14px 16px' }}>
                            <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Target Set</div>
                            <div style={{ fontSize: '24px', fontWeight: '800', color: t.text.primary, lineHeight: 1 }}>
                              {snap?.target_set_size ?? (detail?.targets.length ?? '—')}
                            </div>
                            {snap?.active_accounts != null && (
                              <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '6px' }}>{snap.active_accounts} active</div>
                            )}
                            {snap?.total_cases_90d != null && (
                              <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{snap.total_cases_90d} cases (90d)</div>
                            )}
                          </div>
                        </div>

                        {/* Sparklines */}
                        {(() => {
                          const sparks = zoneSparklines[z.id] ?? []
                          if (sparks.length < 3) return null
                          return (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                              {[
                                { label: 'Reach', data: sparks.map(s => s.reach_pct) },
                                { label: 'Velocity', data: sparks.map(s => s.velocity_index) },
                                { label: 'Retention', data: sparks.map(s => s.retention_pct) },
                              ].map(({ label, data }) => (
                                <div key={label} style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                                  <div style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{label} (30d)</div>
                                  <Sparkline data={data} width={160} height={28} />
                                </div>
                              ))}
                            </div>
                          )
                        })()}

                        {/* Radar chart */}
                        {snap && (
                          <div style={{ marginBottom: '16px', padding: '16px', borderRadius: '10px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                            <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                              Performance vs Targets
                            </div>
                            <div style={{ height: 200 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <RadarChart data={[
                                  { metric: 'Reach', value: Math.round(snap.reach_pct ?? 0), target: effectiveReach },
                                  { metric: 'Vel. Index', value: Math.round(snap.velocity_index ?? 0), target: 100 },
                                  { metric: 'Retention', value: Math.round(snap.retention_pct ?? 0), target: effectiveRetention },
                                ]}>
                                  <PolarGrid stroke={t.border.subtle} />
                                  <PolarAngleAxis dataKey="metric" tick={{ fill: t.text.muted, fontSize: 11, fontWeight: 600 }} />
                                  <Radar name="Actual" dataKey="value" stroke={healthColor(snap.health_score)} fill={healthColor(snap.health_score)} fillOpacity={0.18} strokeWidth={2} />
                                  <Radar name="Target" dataKey="target" stroke={t.border.default} fill="none" strokeDasharray="4 2" strokeWidth={1} />
                                  <Tooltip contentStyle={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: t.text.primary, fontWeight: 700 }} itemStyle={{ color: t.text.secondary }} />
                                </RadarChart>
                              </ResponsiveContainer>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: t.text.muted }}>
                                <div style={{ width: 16, height: 2, backgroundColor: healthColor(snap.health_score), borderRadius: 1 }} />
                                Actual
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: t.text.muted }}>
                                <div style={{ width: 16, height: 2, backgroundColor: t.border.default, borderRadius: 1 }} />
                                Target
                              </div>
                              <div style={{ fontSize: '10px', color: t.text.muted, marginLeft: 'auto' }}>
                                Health = Reach×35% + Vel×30% + Ret×35%
                                {snap.health_score != null && <span style={{ color: healthColor(snap.health_score), fontWeight: '700', marginLeft: '6px' }}>= {Math.round(snap.health_score)}</span>}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Recompute bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderRadius: '8px', backgroundColor: t.bg.elevated, border: `1px solid ${t.border.subtle}`, marginBottom: '16px' }}>
                          <span style={{ fontSize: '12px', color: t.text.muted }}>
                            {snap
                              ? `Last computed: ${new Date(snap.computed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                              : 'No snapshot yet — click Recompute to populate metrics.'}
                          </span>
                          <button onClick={() => handleRecompute(z.id)} disabled={computing} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '7px', fontSize: '12px', cursor: computing ? 'default' : 'pointer', border: `1px solid ${t.goldBorder}`, backgroundColor: t.goldDim, color: t.gold, fontWeight: '600', opacity: computing ? 0.6 : 1 }}>
                            <RefreshCw size={12} /> {computing ? 'Computing…' : 'Recompute Now'}
                          </button>
                        </div>

                        {/* Settings + delete */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => openSettings(z)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '7px', border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.secondary, fontSize: '12px', cursor: 'pointer' }}>
                            <Settings2 size={12} /> Performance Settings
                          </button>
                          <button onClick={() => setDeleteZoneId(z.id)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '7px', border: `1px solid rgba(232,85,64,0.3)`, backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '12px', cursor: 'pointer' }}>
                            <Trash2 size={12} /> Remove Tracking
                          </button>
                        </div>
                      </div>

                      {/* Right: Target accounts (sticky) */}
                      {(() => { const suggested = suggestedForZone(z.id); return (
                      <div style={{ padding: '24px', position: 'sticky', top: 0, maxHeight: '100vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <div>
                            <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary, margin: 0 }}>Target Accounts</h2>
                            {detail && (
                              <p style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>
                                {detail.targets.length} account{detail.targets.length !== 1 ? 's' : ''} being worked
                              </p>
                            )}
                          </div>
                          <button onClick={() => openAddAccount(z.id)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold }}>
                            <Plus size={12} /> Add
                          </button>
                        </div>

                        {loadingDetail ? (
                          <div style={{ padding: '32px', textAlign: 'center', color: t.text.muted, fontSize: '12px' }}>Loading accounts…</div>
                        ) : !detail || detail.targets.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '40px 16px', marginTop: '12px', border: `2px dashed ${t.border.default}`, borderRadius: '10px' }}>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: t.text.secondary, marginBottom: '6px' }}>No accounts yet</div>
                            <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '16px' }}>Add the accounts you're actively working for this brand.</div>
                            <button onClick={() => openAddAccount(z.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '12px', backgroundColor: t.gold, color: '#0f0e0c', cursor: 'pointer', border: 'none' }}>
                              <Plus size={13} /> Add First Account
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                            {detail.targets.map(ta => {
                              const acct = ta.accounts
                              if (!acct) return null
                              const daysSince = acct.last_visited
                                ? Math.floor((Date.now() - new Date(acct.last_visited).getTime()) / 86400000)
                                : null
                              const statusKey = daysSince === null ? 'untouched' : daysSince <= 90 ? 'active' : daysSince <= 180 ? 'lapsed' : 'dormant'
                              const placements = detail.placementsByAccount[acct.id] ?? []
                              const lastVisit = detail.lastVisitByAccount[acct.id]
                              const orders = detail.ordersByAccount[acct.id] ?? []
                              const lastVisitDays = lastVisit
                                ? Math.floor((Date.now() - new Date(lastVisit.visited_at).getTime()) / 86400000)
                                : null
                              return (
                                <div key={ta.id} style={{ position: 'relative' }}>
                                  <Link href={`/accounts/${acct.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                                    <div
                                      style={{ padding: '11px 12px', borderRadius: '8px', backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, cursor: 'pointer', transition: 'border-color 150ms' }}
                                      onMouseEnter={e => (e.currentTarget.style.borderColor = clientColor + '60')}
                                      onMouseLeave={e => (e.currentTarget.style.borderColor = t.border.default)}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary, flex: 1 }}>{acct.name}</span>
                                        <AccountStatusBadge status={statusKey} />
                                        <ChevronRight size={12} color={t.text.muted} style={{ flexShrink: 0 }} />
                                      </div>
                                      {placements.length > 0 ? (
                                        <div style={{ fontSize: '11px', color: t.status.success, marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <span style={{ fontWeight: '700' }}>{placements.length}</span>
                                          <span>placement{placements.length !== 1 ? 's' : ''}</span>
                                          <span style={{ color: t.text.muted }}>·</span>
                                          <span style={{ color: t.text.muted }}>{placements.map(p => p.product_name || p.status).slice(0, 2).join(', ')}</span>
                                        </div>
                                      ) : (
                                        <div style={{ fontSize: '11px', color: t.text.muted, fontStyle: 'italic', marginBottom: '3px' }}>No placements for this brand</div>
                                      )}
                                      {orders.length > 0 && (
                                        <div style={{ fontSize: '11px', color: t.gold, marginBottom: '3px' }}>
                                          {orders.length} order{orders.length !== 1 ? 's' : ''}
                                          <span style={{ color: t.text.muted }}> · {orders[0].status}</span>
                                        </div>
                                      )}
                                      <div style={{ fontSize: '10px', color: t.text.muted }}>
                                        {lastVisit
                                          ? `${lastVisitDays === 0 ? 'Today' : `${lastVisitDays}d ago`} · ${lastVisit.status}`
                                          : 'No visits for this brand yet'}
                                      </div>
                                    </div>
                                  </Link>
                                  <button
                                    onClick={e => { e.preventDefault(); setRemoveAccountTarget({ zoneId: z.id, accountId: acct.id }) }}
                                    style={{ position: 'absolute', top: '8px', right: '30px', background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted, padding: '2px', display: 'flex', alignItems: 'center', opacity: 0.4 }}
                                    title="Remove from target set">
                                    <X size={11} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Suggested accounts from territory geo */}
                        {suggested.length > 0 && (
                          <div style={{ marginTop: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                In {market.name} · {suggested.length} match{suggested.length !== 1 ? 'es' : ''}
                              </div>
                              {suggested.length > 1 && (
                                <button onClick={() => handleAddAll(z.id, suggested)} disabled={addingAll} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: addingAll ? 'default' : 'pointer', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold, opacity: addingAll ? 0.6 : 1 }}>
                                  <Plus size={10} /> {addingAll ? 'Adding…' : 'Add All'}
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              {suggested.map(a => (
                                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12px', fontWeight: '600', color: t.text.primary }}>{a.name}</div>
                                    {a.address && <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '1px' }}>{a.address.split(',')[0]}</div>}
                                  </div>
                                  <button onClick={() => { setAddAccountZoneId(z.id); handleAddAccount(a.id) }} disabled={addingAccountId === a.id} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', flexShrink: 0, marginLeft: '8px', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold, opacity: addingAccountId === a.id ? 0.6 : 1 }}>
                                    <Plus size={10} /> Add
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {!hasGeoTags && suggested.length === 0 && (
                          <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px', border: `1px dashed ${t.border.default}`, backgroundColor: t.bg.input }}>
                            <div style={{ fontSize: '11px', color: t.text.muted, lineHeight: 1.5 }}>
                              <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.gold, fontWeight: '600', padding: 0, fontSize: '11px' }}>
                                Add cities or counties to {market.name}
                              </button>{' '}
                              to get account suggestions automatically.
                            </div>
                          </div>
                        )}
                      </div>
                      )})()} {/* end suggested IIFE */}
                    </div>
                  </div>
                )
              })
            )
          )
        )}
      </div>

      {/* ── Settings Modal ─────────────────────────────────────────────────── */}
      {settingsZoneId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.page, borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${t.border.default}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary }}>Performance Settings</h2>
              <button onClick={() => setSettingsZoneId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Channel</label>
                <select value={settingsForm.channel} onChange={e => setSettingsForm(f => ({ ...f, channel: e.target.value }))} style={selectStyle}>
                  <option value="on_premise">On-Premise</option>
                  <option value="off_premise">Off-Premise</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Velocity Target (cases / active account / month)</label>
                <input type="number" min="0.1" step="0.1" value={settingsForm.velocity_target} onChange={e => setSettingsForm(f => ({ ...f, velocity_target: Number(e.target.value) }))} style={inputStyle} />
                <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '3px' }}>Use top-quartile performers as your benchmark</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Reach Target (%) <span style={{ color: t.text.muted, fontWeight: '400', fontSize: '10px' }}>— default {market?.default_reach_threshold}%</span></label>
                  <input type="number" min="0" max="100" value={settingsForm.reach_threshold} onChange={e => setSettingsForm(f => ({ ...f, reach_threshold: e.target.value }))} placeholder={String(market?.default_reach_threshold ?? 55)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Retention Target (%) <span style={{ color: t.text.muted, fontWeight: '400', fontSize: '10px' }}>— default {market?.default_retention_threshold}%</span></label>
                  <input type="number" min="0" max="100" value={settingsForm.retention_threshold} onChange={e => setSettingsForm(f => ({ ...f, retention_threshold: e.target.value }))} placeholder={String(market?.default_retention_threshold ?? 65)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Projected Monthly Cases <span style={{ color: t.text.muted, fontWeight: '400', fontSize: '10px' }}>— for supply planning</span></label>
                <input type="number" min="0" value={settingsForm.projected_monthly_cases} onChange={e => setSettingsForm(f => ({ ...f, projected_monthly_cases: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea value={settingsForm.notes} onChange={e => setSettingsForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setSettingsZoneId(null)} style={btnSecondary}>Cancel</button>
                <button onClick={handleSaveSettings} disabled={savingSettings} style={{ ...btnPrimary, opacity: savingSettings ? 0.6 : 1 }}>{savingSettings ? 'Saving…' : 'Save Settings'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Account Modal ─────────────────────────────────────────────── */}
      {addAccountZoneId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.page, borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflowY: 'auto', border: `1px solid ${t.border.default}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary }}>Add to Target Accounts</h2>
              <button onClick={() => { setAddAccountZoneId(null); setAccountSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={18} /></button>
            </div>
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: t.text.muted, pointerEvents: 'none' }} />
              <input type="text" placeholder="Search by name or address…" value={accountSearch} onChange={e => setAccountSearch(e.target.value)} autoFocus style={{ ...inputStyle, paddingLeft: '32px' }} />
            </div>
            {loadingAllAccounts ? (
              <div style={{ fontSize: '13px', color: t.text.muted, padding: '20px', textAlign: 'center' }}>Loading accounts…</div>
            ) : accountSearch.length < 2 ? (
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
                    <button onClick={() => handleAddAccount(a.id)} disabled={addingAccountId === a.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', flexShrink: 0, marginLeft: '10px', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold, opacity: addingAccountId === a.id ? 0.6 : 1 }}>
                      <Plus size={11} /> {addingAccountId === a.id ? '…' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Brand Modal ──────────────────────────────────────────────── */}
      {addBrandModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.page, borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '400px', border: `1px solid ${t.border.default}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary }}>Track a Brand in {market.name}</h2>
              <button onClick={() => setAddBrandModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Brand</label>
                <select value={addBrandForm.client_slug} onChange={e => setAddBrandForm(f => ({ ...f, client_slug: e.target.value }))} style={selectStyle}>
                  <option value="">Select a brand…</option>
                  {clients
                    .filter(c => !(market.zones || []).some(z => z.client_slug === c.slug))
                    .map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                  {clients.filter(c => (market.zones || []).some(z => z.client_slug === c.slug)).length > 0 && (
                    <optgroup label="Already tracked">
                      {clients
                        .filter(c => (market.zones || []).some(z => z.client_slug === c.slug))
                        .map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Channel</label>
                <select value={addBrandForm.channel} onChange={e => setAddBrandForm(f => ({ ...f, channel: e.target.value }))} style={selectStyle}>
                  <option value="on_premise">On-Premise</option>
                  <option value="off_premise">Off-Premise</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button onClick={() => { setAddBrandModal(false); setAddBrandForm({ client_slug: '', channel: 'on_premise' }) }} style={btnSecondary}>Cancel</button>
                <button
                  onClick={handleAddBrand}
                  disabled={!addBrandForm.client_slug || savingBrand}
                  style={{ ...btnPrimary, opacity: (!addBrandForm.client_slug || savingBrand) ? 0.6 : 1 }}>
                  {savingBrand ? 'Adding…' : 'Start Tracking'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm modals ─────────────────────────────────────────────────── */}
      <ConfirmModal isOpen={deleteMarketModal} title="Delete Territory"
        message={`Delete "${market.name}" and all brand tracking here? This cannot be undone.`}
        confirmLabel="Delete Territory" onConfirm={handleDeleteMarket} onClose={() => setDeleteMarketModal(false)} />
      <ConfirmModal isOpen={!!deleteZoneId} title="Remove Brand Tracking"
        message="Stop tracking this brand's performance in this territory? Target accounts and historical data will be removed."
        confirmLabel="Remove" onConfirm={() => deleteZoneId && handleDeleteZone(deleteZoneId)} onClose={() => setDeleteZoneId(null)} />
      <ConfirmModal isOpen={!!removeAccountTarget} title="Remove Account"
        message="Remove this account from the target set? The account itself is not deleted."
        confirmLabel="Remove" onConfirm={handleRemoveAccount} onClose={() => setRemoveAccountTarget(null)} />
    </LayoutShell>
  )
}

export default function MarketDetailPage() {
  return <Suspense><MarketDetailContent /></Suspense>
}
