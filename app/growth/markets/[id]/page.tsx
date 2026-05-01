'use client'
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Star, Pencil, Trash2, X, Search, RefreshCw, Settings2, ChevronRight } from 'lucide-react'
import LayoutShell, { useToast } from '../../../layout-shell'
import ConfirmModal from '../../../components/ConfirmModal'
import { t, inputStyle, labelStyle, btnPrimary, btnSecondary } from '../../../lib/theme'
import { getClients, getAccounts } from '../../../lib/data'
import { getSupabase } from '../../../lib/supabase'
import {
  getMarket, updateMarket, deleteMarket,
  createZone, updateZone, deleteZone,
  getZoneTargetAccounts, addAccountToZone, removeAccountFromZone,
  getLatestSnapshotsByZone,
} from '../../../lib/concentric/data'
import { HealthRing, MetricTile } from '../../_components'
import type { Market, Zone, ZoneMetricSnapshot } from '../../../lib/concentric/types'
import type { Account, Client } from '../../../lib/types'

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
  // Accounts in this territory (matched by geo tags)
  const [territoryAccounts, setTerritoryAccounts] = useState<Account[]>([])
  // Which brands have CRM activity at each account: accountId → clientSlug[]
  const [brandActivity, setBrandActivity] = useState<Record<string, string[]>>({})
  // Which brands this account is a target for: accountId → clientSlug[]
  const [targetMap, setTargetMap] = useState<Record<string, string[]>>({})
  const [snapshots, setSnapshots] = useState<Record<string, ZoneMetricSnapshot>>({})
  const [loading, setLoading] = useState(true)

  // Brand filter tab ('' = all brands)
  const [activeClientTab, setActiveClientTab] = useState<string>(searchParams.get('client') ?? '')

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

  // "Set as Target" modal
  const [targetModal, setTargetModal] = useState<{ accountId: string; name: string } | null>(null)
  const [targetingSlugs, setTargetingSlugs] = useState<string[]>([])
  const [savingTarget, setSavingTarget] = useState(false)

  // "Add Target Account" modal (search for any CRM account)
  const [addTargetOpen, setAddTargetOpen] = useState(false)
  const [addTargetSearch, setAddTargetSearch] = useState('')
  const [addTargetSelectedId, setAddTargetSelectedId] = useState<string | null>(null)
  const [addTargetSlugs, setAddTargetSlugs] = useState<string[]>([])
  const [allAccounts, setAllAccounts] = useState<Account[]>([])
  const [loadingAllAccounts, setLoadingAllAccounts] = useState(false)
  const [savingAddTarget, setSavingAddTarget] = useState(false)

  // Remove target confirm
  const [removeTargetModal, setRemoveTargetModal] = useState<{ accountId: string; clientSlug: string; accountName: string } | null>(null)

  // Brand metrics settings
  const [settingsSlug, setSettingsSlug] = useState<string | null>(null)
  const [settingsForm, setSettingsForm] = useState({
    velocity_target: 1,
    reach_threshold: '' as string | number,
    retention_threshold: '' as string | number,
    notes: '',
  })
  const [savingSettings, setSavingSettings] = useState(false)

  // Remove brand tracking
  const [removeBrandSlug, setRemoveBrandSlug] = useState<string | null>(null)

  // Recompute
  const [computingSlugs, setComputingSlugs] = useState<Set<string>>(new Set())

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const [m, cls] = await Promise.all([getMarket(id), getClients()])
      if (!m) { router.push('/growth'); return }

      setMarket(m)
      setClients(cls)
      setEditForm({
        name: m.name, priority: m.priority,
        cities: m.cities ?? [], counties: m.counties ?? [],
        states: m.states ?? [], zip_codes: m.zip_codes ?? [],
        default_reach_threshold: m.default_reach_threshold,
        default_retention_threshold: m.default_retention_threshold,
        notes: m.notes ?? '',
      })

      const allAccs = await getAccounts({ limit: 500 })
      setAllAccounts(allAccs)

      const geoTerms = [
        ...(m.cities ?? []), ...(m.counties ?? []),
        ...(m.states ?? []), ...(m.zip_codes ?? []),
      ].map(g => g.toLowerCase())

      const terrAccs = geoTerms.length > 0
        ? allAccs.filter(a => geoTerms.some(g => (a.address ?? '').toLowerCase().includes(g)))
        : []

      // Also include any accounts that are already targets (even if outside geo)
      const zones = m.zones ?? []
      const targetResults = zones.length > 0
        ? await Promise.all(zones.map(z => getZoneTargetAccounts(z.id)))
        : []

      const targets: Record<string, string[]> = {}
      const extraAccountIds = new Set<string>()
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i]
        for (const ta of targetResults[i] ?? []) {
          if (!targets[ta.account_id]) targets[ta.account_id] = []
          if (zone.client_slug && !targets[ta.account_id].includes(zone.client_slug))
            targets[ta.account_id].push(zone.client_slug)
          const inGeo = terrAccs.some(a => a.id === ta.account_id)
          if (!inGeo) extraAccountIds.add(ta.account_id)
        }
      }
      setTargetMap(targets)

      // Merge extra target accounts that aren't in geo
      const extraAccs = allAccs.filter(a => extraAccountIds.has(a.id))
      const allTerrAccs = [...terrAccs, ...extraAccs.filter(e => !terrAccs.some(t => t.id === e.id))]
      setTerritoryAccounts(allTerrAccs)

      // Load brand activity (visits, placements, orders) for territory accounts
      if (allTerrAccs.length > 0) {
        const accIds = allTerrAccs.map(a => a.id)
        const sb = getSupabase()
        const [vRes, pRes, oRes] = await Promise.all([
          sb.from('visits').select('account_id, client_slug').in('account_id', accIds),
          sb.from('placements').select('account_id, client_slug').in('account_id', accIds).is('lost_at', null),
          sb.from('purchase_orders').select('account_id, client_slug')
            .in('account_id', accIds).in('status', ['sent', 'fulfilled', 'draft']),
        ])
        const activity: Record<string, string[]> = {}
        for (const r of [...(vRes.data ?? []), ...(pRes.data ?? []), ...(oRes.data ?? [])]) {
          if (!r.account_id || !r.client_slug) continue
          if (!activity[r.account_id]) activity[r.account_id] = []
          if (!activity[r.account_id].includes(r.client_slug)) activity[r.account_id].push(r.client_slug)
        }
        setBrandActivity(activity)
      }

      // Load snapshots
      if (zones.length > 0) {
        const snaps = await getLatestSnapshotsByZone(zones.map(z => z.id))
        setSnapshots(snaps)
      }
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

  // ── Derived ────────────────────────────────────────────────────────────────

  const territoryClients = useMemo(() => {
    const slugs = new Set((market?.zones ?? []).map(z => z.client_slug).filter(Boolean) as string[])
    // Also include clients with brand activity in territory accounts
    for (const slugList of Object.values(brandActivity)) {
      for (const s of slugList) slugs.add(s)
    }
    return clients.filter(c => slugs.has(c.slug))
  }, [market, clients, brandActivity])

  const displayedAccounts = useMemo(() => {
    const accs = [...territoryAccounts]
    if (!activeClientTab) {
      return accs.sort((a, b) => {
        const aT = (targetMap[a.id] ?? []).length
        const bT = (targetMap[b.id] ?? []).length
        if (aT !== bT) return bT - aT
        const aA = (brandActivity[a.id] ?? []).length
        const bA = (brandActivity[b.id] ?? []).length
        return bA - aA
      })
    }
    return accs.sort((a, b) => {
      const aT = (targetMap[a.id] ?? []).includes(activeClientTab)
      const bT = (targetMap[b.id] ?? []).includes(activeClientTab)
      if (aT !== bT) return aT ? -1 : 1
      const aA = (brandActivity[a.id] ?? []).includes(activeClientTab)
      const bA = (brandActivity[b.id] ?? []).includes(activeClientTab)
      if (aA !== bA) return aA ? -1 : 1
      return 0
    })
  }, [territoryAccounts, activeClientTab, targetMap, brandActivity])

  const hasGeoTags = (market?.cities?.length ?? 0) + (market?.counties?.length ?? 0) + (market?.states?.length ?? 0) + (market?.zip_codes?.length ?? 0) > 0

  const activeZone = activeClientTab ? (market?.zones ?? []).find(z => z.client_slug === activeClientTab) ?? null : null
  const activeSnap = activeZone ? snapshots[activeZone.id] ?? null : null
  const activeClient = activeClientTab ? clients.find(c => c.slug === activeClientTab) ?? null : null

  const searchedAddAccounts = useMemo(() => {
    if (addTargetSearch.length < 2) return []
    const q = addTargetSearch.toLowerCase()
    return allAccounts
      .filter(a => a.name.toLowerCase().includes(q) || (a.address ?? '').toLowerCase().includes(q))
      .slice(0, 20)
  }, [allAccounts, addTargetSearch])

  // ── Handlers ──────────────────────────────────────────────────────────────

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

  async function handleSetTarget() {
    if (!targetModal || targetingSlugs.length === 0) return
    setSavingTarget(true)
    try {
      let currentMarket = await getMarket(id)
      for (const slug of targetingSlugs) {
        let zone = (currentMarket?.zones ?? []).find(z => z.client_slug === slug)
        if (!zone) {
          await createZone({ market_id: id, client_slug: slug, channel: 'on_premise', name: 'On-Premise', velocity_target: 1 })
          currentMarket = await getMarket(id) as typeof currentMarket
          zone = (currentMarket?.zones ?? []).find(z => z.client_slug === slug)
        }
        if (zone) await addAccountToZone(zone.id, targetModal.accountId)
      }
      toast('Added to targets')
      setTargetModal(null)
      setTargetingSlugs([])
      await load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
    finally { setSavingTarget(false) }
  }

  async function handleAddTarget() {
    if (!addTargetSelectedId || addTargetSlugs.length === 0) return
    setSavingAddTarget(true)
    try {
      let currentMarket = await getMarket(id)
      for (const slug of addTargetSlugs) {
        let zone = (currentMarket?.zones ?? []).find(z => z.client_slug === slug)
        if (!zone) {
          await createZone({ market_id: id, client_slug: slug, channel: 'on_premise', name: 'On-Premise', velocity_target: 1 })
          currentMarket = await getMarket(id) as typeof currentMarket
          zone = (currentMarket?.zones ?? []).find(z => z.client_slug === slug)
        }
        if (zone) await addAccountToZone(zone.id, addTargetSelectedId)
      }
      toast('Added to targets')
      setAddTargetOpen(false)
      setAddTargetSelectedId(null)
      setAddTargetSlugs([])
      setAddTargetSearch('')
      await load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
    finally { setSavingAddTarget(false) }
  }

  async function handleRemoveTarget() {
    if (!removeTargetModal) return
    try {
      const zone = market?.zones.find(z => z.client_slug === removeTargetModal.clientSlug)
      if (zone) await removeAccountFromZone(zone.id, removeTargetModal.accountId)
      toast('Removed from targets')
      await load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
    finally { setRemoveTargetModal(null) }
  }

  async function handleRecompute(clientSlug: string) {
    const zone = market?.zones.find(z => z.client_slug === clientSlug)
    if (!zone) { toast('No tracking data yet — add target accounts first', 'error'); return }
    setComputingSlugs(prev => new Set([...prev, clientSlug]))
    try {
      const res = await fetch(`/api/growth/recompute/${zone.id}`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error || 'Recompute failed')
      const newSnaps = await getLatestSnapshotsByZone([zone.id])
      setSnapshots(prev => ({ ...prev, ...newSnaps }))
      toast('Metrics updated')
    } catch (err: any) { toast(err.message || 'Recompute failed', 'error') }
    finally { setComputingSlugs(prev => { const s = new Set(prev); s.delete(clientSlug); return s }) }
  }

  async function handleSaveSettings() {
    if (!settingsSlug) return
    const zone = market?.zones.find(z => z.client_slug === settingsSlug)
    if (!zone) return
    setSavingSettings(true)
    try {
      await updateZone(zone.id, {
        velocity_target: Number(settingsForm.velocity_target),
        reach_threshold: settingsForm.reach_threshold !== '' ? Number(settingsForm.reach_threshold) : null,
        retention_threshold: settingsForm.retention_threshold !== '' ? Number(settingsForm.retention_threshold) : null,
        notes: settingsForm.notes || undefined,
      })
      toast('Settings saved')
      setSettingsSlug(null)
      load()
    } catch (err: any) { toast(err.message || 'Failed to save', 'error') }
    finally { setSavingSettings(false) }
  }

  async function handleRemoveBrandTracking() {
    if (!removeBrandSlug) return
    const zone = market?.zones.find(z => z.client_slug === removeBrandSlug)
    if (!zone) return
    try {
      await deleteZone(zone.id)
      toast('Brand tracking removed')
      if (activeClientTab === removeBrandSlug) setActiveClientTab('')
      setRemoveBrandSlug(null)
      load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
  }

  function openAddTarget() {
    setAddTargetSelectedId(null)
    setAddTargetSlugs(activeClientTab ? [activeClientTab] : [])
    setAddTargetSearch('')
    setAddTargetOpen(true)
    if (allAccounts.length === 0 && !loadingAllAccounts) {
      setLoadingAllAccounts(true)
      getAccounts({ limit: 500 }).then(accs => { setAllAccounts(accs) }).catch(console.error).finally(() => setLoadingAllAccounts(false))
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <LayoutShell><div style={{ padding: '48px', color: t.text.muted, textAlign: 'center' }}>Loading…</div></LayoutShell>
  )
  if (!market) return null

  const geoParts = [...(market.cities ?? []), ...(market.counties?.map(c => `${c} County`) ?? []), ...(market.states ?? [])].filter(Boolean)
  const geoSummary = geoParts.slice(0, 4).join(' · ') + (geoParts.length > 4 ? ` +${geoParts.length - 4} more` : '')

  return (
    <LayoutShell>
      <div style={{ minHeight: '100vh' }}>

        {/* Breadcrumb */}
        <div style={{ padding: '10px 40px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: t.text.muted }}>
          <Link href="/growth" style={{ color: t.text.muted, textDecoration: 'none' }}>Growth</Link>
          <span>›</span>
          <span style={{ color: t.text.secondary }}>{market.name}</span>
        </div>

        {/* Territory header */}
        {!editing ? (
          <div style={{ padding: '18px 40px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                {market.priority && <Star size={15} color={t.gold} fill={t.gold} />}
                <h1 style={{ fontSize: '20px', fontWeight: '900', color: t.text.primary, letterSpacing: '-0.02em', margin: 0 }}>{market.name}</h1>
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
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderRadius: '12px', padding: '20px 24px', maxWidth: '700px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary, marginBottom: '18px' }}>Edit Territory</h2>
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
                  <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditing(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={handleSaveMarket} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Brand filter bar */}
        {!editing && (
          <div style={{ padding: '0 40px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'stretch', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex' }}>
              <button onClick={() => setActiveClientTab('')}
                style={{ padding: '11px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none', borderBottom: `2px solid ${activeClientTab === '' ? t.gold : 'transparent'}`, backgroundColor: 'transparent', color: activeClientTab === '' ? t.text.primary : t.text.muted, transition: 'all 150ms', marginBottom: '-1px' }}>
                All Brands
              </button>
              {territoryClients.map(c => {
                const color = c.color || t.gold
                const active = activeClientTab === c.slug
                return (
                  <button key={c.slug} onClick={() => setActiveClientTab(c.slug)}
                    style={{ padding: '11px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none', borderBottom: `2px solid ${active ? color : 'transparent'}`, backgroundColor: 'transparent', color: active ? color : t.text.muted, transition: 'all 150ms', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '-1px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, display: 'inline-block', flexShrink: 0 }} />
                    {c.name}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '16px' }}>
              <button onClick={openAddTarget}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: '600', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold, cursor: 'pointer' }}>
                <Plus size={12} /> Add Target Account
              </button>
            </div>
          </div>
        )}

        {/* Main content */}
        {!editing && (
          <div style={{ display: 'grid', gridTemplateColumns: activeClientTab ? '1fr 320px' : '1fr', minHeight: 0 }}>

            {/* Account list */}
            <div style={{ padding: '20px 40px', borderRight: activeClientTab ? `1px solid ${t.border.subtle}` : 'none' }}>

              {!hasGeoTags ? (
                <div style={{ textAlign: 'center', padding: '60px 24px', border: `2px dashed ${t.border.default}`, borderRadius: '12px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.secondary, marginBottom: '6px' }}>No location defined</div>
                  <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '18px' }}>Add cities, counties, or zip codes to see which accounts are in this territory.</div>
                  <button onClick={() => setEditing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', backgroundColor: t.gold, color: '#0f0e0c', cursor: 'pointer', border: 'none' }}>
                    Edit Territory
                  </button>
                </div>
              ) : displayedAccounts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 24px', border: `2px dashed ${t.border.default}`, borderRadius: '12px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.secondary, marginBottom: '6px' }}>No accounts in {market.name} yet</div>
                  <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '18px' }}>Accounts from your CRM that match this territory's location will appear here automatically.</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '12px', fontWeight: '600' }}>
                    {displayedAccounts.length} account{displayedAccounts.length !== 1 ? 's' : ''} in this territory
                    {activeClientTab && activeClient ? ` · filtered to ${activeClient.name}` : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {displayedAccounts.map(acct => {
                      const activity = brandActivity[acct.id] ?? []
                      const targets = targetMap[acct.id] ?? []
                      const isTarget = activeClientTab ? targets.includes(activeClientTab) : targets.length > 0
                      const clientColor = activeClient?.color || t.gold

                      return (
                        <div key={acct.id} style={{ borderRadius: '10px', border: `1px solid ${isTarget && activeClientTab ? clientColor + '40' : t.border.default}`, backgroundColor: isTarget && activeClientTab ? clientColor + '06' : t.bg.elevated, padding: '12px 14px', transition: 'border-color 150ms' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>

                            {/* Account info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                {isTarget && activeClientTab && (
                                  <span style={{ fontSize: '9px', fontWeight: '800', color: clientColor, textTransform: 'uppercase', letterSpacing: '0.08em', backgroundColor: clientColor + '18', border: `1px solid ${clientColor}40`, padding: '1px 6px', borderRadius: '3px', flexShrink: 0 }}>
                                    TARGET
                                  </span>
                                )}
                                <Link href={`/accounts/${acct.id}`} style={{ textDecoration: 'none' }}>
                                  <span style={{ fontSize: '14px', fontWeight: '700', color: t.text.primary }}>{acct.name}</span>
                                </Link>
                              </div>
                              <div style={{ fontSize: '11px', color: t.text.muted }}>
                                {[acct.address?.split(',')[0], acct.account_type?.replace('_', '-')].filter(Boolean).join(' · ')}
                                {acct.last_visited && (
                                  <span style={{ marginLeft: '6px' }}>
                                    · visited {Math.floor((Date.now() - new Date(acct.last_visited).getTime()) / 86400000)}d ago
                                  </span>
                                )}
                              </div>

                              {/* Target badges (when All Brands view) */}
                              {!activeClientTab && targets.length > 0 && (
                                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                                  {targets.map(slug => {
                                    const c = clients.find(cl => cl.slug === slug)
                                    if (!c) return null
                                    const col = c.color || t.gold
                                    return (
                                      <span key={slug} style={{ fontSize: '10px', fontWeight: '700', color: col, backgroundColor: col + '15', border: `1px solid ${col}30`, padding: '1px 7px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: col, flexShrink: 0 }} />
                                        {c.name}
                                        <button onClick={() => setRemoveTargetModal({ accountId: acct.id, clientSlug: slug, accountName: acct.name })}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: col, display: 'flex', alignItems: 'center', opacity: 0.6 }}>
                                          <X size={9} />
                                        </button>
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Brand activity dots */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                              {activity.length > 0 && (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                  {activity.map(slug => {
                                    const c = clients.find(cl => cl.slug === slug)
                                    if (!c) return null
                                    const col = c.color || t.gold
                                    return (
                                      <span key={slug} title={c.name}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: '600', color: col, backgroundColor: col + '15', border: `1px solid ${col}30`, padding: '2px 6px', borderRadius: '4px' }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: col, flexShrink: 0 }} />
                                        {c.name}
                                      </span>
                                    )
                                  })}
                                </div>
                              )}

                              {/* Set as Target / Remove Target actions */}
                              {activeClientTab && (
                                isTarget ? (
                                  <button onClick={() => setRemoveTargetModal({ accountId: acct.id, clientSlug: activeClientTab, accountName: acct.name })}
                                    style={{ fontSize: '10px', color: t.text.muted, background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '5px', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <X size={9} /> Remove target
                                  </button>
                                ) : (
                                  <button onClick={() => { setTargetModal({ accountId: acct.id, name: acct.name }); setTargetingSlugs([activeClientTab]) }}
                                    style={{ fontSize: '10px', color: clientColor, background: 'none', border: `1px solid ${clientColor}50`, borderRadius: '5px', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '600' }}>
                                    <Plus size={9} /> Set as target
                                  </button>
                                )
                              )}
                              {!activeClientTab && targets.length === 0 && (
                                <button onClick={() => { setTargetModal({ accountId: acct.id, name: acct.name }); setTargetingSlugs([]) }}
                                  style={{ fontSize: '10px', color: t.text.muted, background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '5px', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <Plus size={9} /> Set as target
                                </button>
                              )}
                            </div>

                            <Link href={`/accounts/${acct.id}`} style={{ display: 'flex', alignItems: 'center', color: t.text.muted, textDecoration: 'none', flexShrink: 0 }}>
                              <ChevronRight size={14} />
                            </Link>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Metrics sidebar — only when brand filter active */}
            {activeClientTab && (
              <div style={{ padding: '20px', position: 'sticky', top: 0, maxHeight: '100vh', overflowY: 'auto' }}>
                {activeClient && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: activeClient.color || t.gold, flexShrink: 0 }} />
                    <span style={{ fontSize: '14px', fontWeight: '800', color: t.text.primary }}>{activeClient.name}</span>
                    <span style={{ fontSize: '10px', color: t.text.muted, marginLeft: 'auto' }}>in {market.name}</span>
                  </div>
                )}

                {/* Target count */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`, borderRadius: '9px', padding: '12px' }}>
                    <div style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Targets</div>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: t.text.primary }}>
                      {displayedAccounts.filter(a => (targetMap[a.id] ?? []).includes(activeClientTab)).length}
                    </div>
                    <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '2px' }}>of {displayedAccounts.length} in territory</div>
                  </div>
                  <div style={{ backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`, borderRadius: '9px', padding: '12px' }}>
                    <div style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Active</div>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: t.text.primary }}>
                      {activeSnap?.active_accounts ?? '—'}
                    </div>
                    <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '2px' }}>with recent orders</div>
                  </div>
                </div>

                {/* Health score */}
                {activeSnap && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                    <HealthRing score={activeSnap.health_score ?? null} size={80} strokeWidth={7} />
                  </div>
                )}

                {/* Metric tiles */}
                {activeSnap ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                    <MetricTile label="Reach" value={activeSnap.reach_pct ?? null} target={activeZone?.reach_threshold ?? market.default_reach_threshold} unit="%" note={!activeZone?.reach_threshold ? `Default ${market.default_reach_threshold}%` : undefined} />
                    <MetricTile label="Velocity" value={activeSnap.velocity_index ?? null} target={100} unit="" note={activeSnap.velocity != null ? `${activeSnap.velocity.toFixed(1)} cs/acct/mo · target ${activeZone?.velocity_target ?? 1}` : undefined} />
                    <MetricTile label="Retention" value={activeSnap.retention_pct ?? null} target={activeZone?.retention_threshold ?? market.default_retention_threshold} unit="%" note={!activeZone?.retention_threshold ? `Default ${market.default_retention_threshold}%` : undefined} />
                  </div>
                ) : (
                  <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}`, fontSize: '12px', color: t.text.muted, textAlign: 'center', marginBottom: '14px' }}>
                    No metrics yet — add target accounts and recompute
                  </div>
                )}

                {/* Recompute */}
                <button onClick={() => handleRecompute(activeClientTab)} disabled={computingSlugs.has(activeClientTab)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', padding: '8px', borderRadius: '8px', fontSize: '12px', cursor: computingSlugs.has(activeClientTab) ? 'default' : 'pointer', border: `1px solid ${t.goldBorder}`, backgroundColor: t.goldDim, color: t.gold, fontWeight: '600', opacity: computingSlugs.has(activeClientTab) ? 0.6 : 1, marginBottom: '10px' }}>
                  <RefreshCw size={12} /> {computingSlugs.has(activeClientTab) ? 'Computing…' : 'Recompute Metrics'}
                </button>
                {activeSnap && (
                  <div style={{ fontSize: '10px', color: t.text.muted, textAlign: 'center', marginBottom: '14px' }}>
                    Last computed: {new Date(activeSnap.computed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}

                {/* Settings + Remove */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => { setSettingsSlug(activeClientTab); setSettingsForm({ velocity_target: activeZone?.velocity_target ?? 1, reach_threshold: activeZone?.reach_threshold ?? '', retention_threshold: activeZone?.retention_threshold ?? '', notes: activeZone?.notes ?? '' }) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center', padding: '6px', borderRadius: '7px', border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.secondary, fontSize: '11px', cursor: 'pointer' }}>
                    <Settings2 size={11} /> Settings
                  </button>
                  <button onClick={() => setRemoveBrandSlug(activeClientTab)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center', padding: '6px', borderRadius: '7px', border: `1px solid rgba(232,85,64,0.3)`, backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '11px', cursor: 'pointer' }}>
                    <Trash2 size={11} /> Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Set as Target Modal ──────────────────────────────────────────────── */}
      {targetModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.page, borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '380px', border: `1px solid ${t.border.default}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>Set as Target</h2>
              <button onClick={() => { setTargetModal(null); setTargetingSlugs([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={16} /></button>
            </div>
            <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '16px' }}>{targetModal.name}</div>
            <label style={{ ...labelStyle, marginBottom: '8px', display: 'block' }}>Which brand is this a target for?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              {clients.map(c => {
                const checked = targetingSlugs.includes(c.slug)
                const col = c.color || t.gold
                return (
                  <button key={c.slug} onClick={() => setTargetingSlugs(prev => checked ? prev.filter(s => s !== c.slug) : [...prev, c.slug])}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${checked ? col + '60' : t.border.default}`, backgroundColor: checked ? col + '0d' : t.bg.input, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <div style={{ width: 15, height: 15, borderRadius: '3px', border: `2px solid ${checked ? col : t.border.default}`, backgroundColor: checked ? col : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {checked && <span style={{ color: '#0f0e0c', fontSize: '9px', fontWeight: '800' }}>✓</span>}
                    </div>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: col, flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{c.name}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setTargetModal(null); setTargetingSlugs([]) }} style={btnSecondary}>Cancel</button>
              <button onClick={handleSetTarget} disabled={targetingSlugs.length === 0 || savingTarget} style={{ ...btnPrimary, opacity: (targetingSlugs.length === 0 || savingTarget) ? 0.6 : 1 }}>
                {savingTarget ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Target Account Modal ─────────────────────────────────────────── */}
      {addTargetOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.page, borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto', border: `1px solid ${t.border.default}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>Add Target Account</h2>
              <button onClick={() => { setAddTargetOpen(false); setAddTargetSelectedId(null); setAddTargetSlugs([]); setAddTargetSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={16} /></button>
            </div>

            {!addTargetSelectedId ? (
              <>
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                  <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: t.text.muted, pointerEvents: 'none' }} />
                  <input type="text" placeholder="Search accounts…" value={addTargetSearch} onChange={e => setAddTargetSearch(e.target.value)} autoFocus style={{ ...inputStyle, paddingLeft: '30px' }} />
                </div>
                {addTargetSearch.length < 2 ? (
                  <div style={{ fontSize: '12px', color: t.text.muted, textAlign: 'center', padding: '20px' }}>Type to search</div>
                ) : searchedAddAccounts.length === 0 ? (
                  <div style={{ fontSize: '12px', color: t.text.muted, textAlign: 'center', padding: '20px' }}>No accounts found</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {searchedAddAccounts.map(a => (
                      <button key={a.id} onClick={() => setAddTargetSelectedId(a.id)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}`, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{a.name}</span>
                        {a.address && <span style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{a.address}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`, marginBottom: '16px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary, flex: 1 }}>
                    {allAccounts.find(a => a.id === addTargetSelectedId)?.name}
                  </span>
                  <button onClick={() => setAddTargetSelectedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={13} /></button>
                </div>
                <label style={{ ...labelStyle, marginBottom: '8px', display: 'block' }}>Target for which brand(s)?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                  {clients.map(c => {
                    const checked = addTargetSlugs.includes(c.slug)
                    const col = c.color || t.gold
                    return (
                      <button key={c.slug} onClick={() => setAddTargetSlugs(prev => checked ? prev.filter(s => s !== c.slug) : [...prev, c.slug])}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${checked ? col + '60' : t.border.default}`, backgroundColor: checked ? col + '0d' : t.bg.input, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                        <div style={{ width: 15, height: 15, borderRadius: '3px', border: `2px solid ${checked ? col : t.border.default}`, backgroundColor: checked ? col : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {checked && <span style={{ color: '#0f0e0c', fontSize: '9px', fontWeight: '800' }}>✓</span>}
                        </div>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: col, flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{c.name}</span>
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setAddTargetOpen(false); setAddTargetSelectedId(null); setAddTargetSlugs([]) }} style={btnSecondary}>Cancel</button>
                  <button onClick={handleAddTarget} disabled={addTargetSlugs.length === 0 || savingAddTarget} style={{ ...btnPrimary, opacity: (addTargetSlugs.length === 0 || savingAddTarget) ? 0.6 : 1 }}>
                    {savingAddTarget ? 'Adding…' : 'Add Target'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Performance Settings Modal ───────────────────────────────────────── */}
      {settingsSlug && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.page, borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '400px', border: `1px solid ${t.border.default}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>Performance Settings</h2>
              <button onClick={() => setSettingsSlug(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Velocity Target (cases / active account / month)</label>
                <input type="number" min="0.1" step="0.1" value={settingsForm.velocity_target} onChange={e => setSettingsForm(f => ({ ...f, velocity_target: Number(e.target.value) }))} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Reach Target (%)</label>
                  <input type="number" min="0" max="100" value={settingsForm.reach_threshold} onChange={e => setSettingsForm(f => ({ ...f, reach_threshold: e.target.value }))} placeholder={String(market?.default_reach_threshold ?? 55)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Retention Target (%)</label>
                  <input type="number" min="0" max="100" value={settingsForm.retention_threshold} onChange={e => setSettingsForm(f => ({ ...f, retention_threshold: e.target.value }))} placeholder={String(market?.default_retention_threshold ?? 65)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea value={settingsForm.notes} onChange={e => setSettingsForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setSettingsSlug(null)} style={btnSecondary}>Cancel</button>
                <button onClick={handleSaveSettings} disabled={savingSettings} style={{ ...btnPrimary, opacity: savingSettings ? 0.6 : 1 }}>{savingSettings ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm modals ───────────────────────────────────────────────────── */}
      <ConfirmModal isOpen={deleteMarketModal} title="Delete Territory"
        message={`Delete "${market.name}"? This cannot be undone.`}
        confirmLabel="Delete" onConfirm={handleDeleteMarket} onClose={() => setDeleteMarketModal(false)} />
      <ConfirmModal isOpen={!!removeTargetModal} title="Remove from Targets"
        message={removeTargetModal ? `Remove "${removeTargetModal.accountName}" from targets?` : ''}
        confirmLabel="Remove" onConfirm={handleRemoveTarget} onClose={() => setRemoveTargetModal(null)} />
      <ConfirmModal isOpen={!!removeBrandSlug} title="Remove Brand Tracking"
        message={`Stop tracking ${clients.find(c => c.slug === removeBrandSlug)?.name ?? 'this brand'} in ${market.name}? Target account history will be removed.`}
        confirmLabel="Remove" onConfirm={handleRemoveBrandTracking} onClose={() => setRemoveBrandSlug(null)} />
    </LayoutShell>
  )
}

export default function MarketDetailPage() {
  return <Suspense><MarketDetailContent /></Suspense>
}
