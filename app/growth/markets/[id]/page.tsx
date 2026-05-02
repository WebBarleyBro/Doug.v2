'use client'
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Star, Pencil, Trash2, X, Search, RefreshCw, ChevronRight } from 'lucide-react'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import LayoutShell, { useToast } from '../../../layout-shell'
import ConfirmModal from '../../../components/ConfirmModal'
import { t, inputStyle, labelStyle, selectStyle, btnPrimary, btnSecondary } from '../../../lib/theme'
import { getClients, getAccounts } from '../../../lib/data'
import { clientLogoUrl } from '../../../lib/constants'
import { getSupabase } from '../../../lib/supabase'
import { matchesGeoTerms } from '../../../lib/concentric/geo'
import {
  getMarket, updateMarket, deleteMarket,
  createZone, deleteZone,
  getZoneTargetAccounts, addAccountToZone, removeAccountFromZone,
  getLatestSnapshotsByZone, getZoneSnapshots,
} from '../../../lib/concentric/data'
import { HealthRing, MetricTile, AccountStatusBadge, Sparkline, healthColor } from '../../_components'
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

// ─── Types ────────────────────────────────────────────────────────────────────

// CRM data for a brand in this territory — loaded without needing a zone
interface BrandData {
  activityAccounts: Account[]
  placementsByAccount: Record<string, { product_name: string; status: string }[]>
  lastVisitByAccount: Record<string, { visited_at: string; status: string }>
  ordersByAccount: Record<string, { status: string; total_amount: number | null }[]>
}

// Zone detail — target (pursuing) accounts only, loaded when zone exists
interface ZoneDetail {
  targets: { id: string; account_id: string; accounts: Account | null }[]
  placementsByAccount: Record<string, { product_name: string; status: string }[]>
  lastVisitByAccount: Record<string, { visited_at: string; status: string }>
  ordersByAccount: Record<string, { status: string; total_amount: number | null }[]>
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function MarketDetailContent() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()

  const [market, setMarket] = useState<(Market & { zones: Zone[] }) | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [allAccounts, setAllAccounts] = useState<Account[]>([])
  // Accounts in territory geo + accounts that are targets (even if outside geo)
  const [territoryAccounts, setTerritoryAccounts] = useState<Account[]>([])
  // accountId → clientSlugs with any CRM activity (visits/placements/orders)
  const [brandActivity, setBrandActivity] = useState<Record<string, string[]>>({})
  // accountId → clientSlugs this account is a target for
  const [targetMap, setTargetMap] = useState<Record<string, string[]>>({})
  const [snapshots, setSnapshots] = useState<Record<string, ZoneMetricSnapshot>>({})
  // CRM data per brand slug — loaded without needing a zone
  const [brandDataBySlug, setBrandDataBySlug] = useState<Record<string, BrandData>>({})
  const [loadingBrandSlugs, setLoadingBrandSlugs] = useState<Set<string>>(new Set())
  // Zone detail (pursuing targets + snapshots) — loaded when zone exists
  const [zoneDetails, setZoneDetails] = useState<Record<string, ZoneDetail>>({})
  const [zoneSparklines, setZoneSparklines] = useState<Record<string, ZoneMetricSnapshot[]>>({})
  const [loadingZoneIds, setLoadingZoneIds] = useState<Set<string>>(new Set())
  const [computingSlugs, setComputingSlugs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // Active brand tab
  const [activeClientTab, setActiveClientTab] = useState<string>(searchParams.get('client') ?? '')
  const didAutoSelect = useRef(false)
  const autoRecomputedSlugs = useRef<Set<string>>(new Set())

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

  // "Set as Target" modal (from suggested accounts)
  const [targetModal, setTargetModal] = useState<{ accountId: string; name: string; preSlug?: string } | null>(null)
  const [targetingSlugs, setTargetingSlugs] = useState<string[]>([])
  const [savingTarget, setSavingTarget] = useState(false)

  // "Add Target Account" search modal
  const [addTargetOpen, setAddTargetOpen] = useState(false)
  const [addTargetSearch, setAddTargetSearch] = useState('')
  const [addTargetSelectedId, setAddTargetSelectedId] = useState<string | null>(null)
  const [addTargetSlugs, setAddTargetSlugs] = useState<string[]>([])
  const [savingAddTarget, setSavingAddTarget] = useState(false)
  const [addingAll, setAddingAll] = useState(false)

  // Remove target
  const [removeTargetModal, setRemoveTargetModal] = useState<{ accountId: string; clientSlug: string; name: string } | null>(null)
  const [removeBrandSlug, setRemoveBrandSlug] = useState<string | null>(null)

  // ── Initial load ──────────────────────────────────────────────────────────

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

      const accs = await getAccounts({ limit: 500 })
      setAllAccounts(accs)

      // Geo-match accounts to territory using comma-part matching
      const geoTerms = [
        ...(m.cities ?? []), ...(m.counties ?? []),
        ...(m.states ?? []), ...(m.zip_codes ?? []),
      ].map(g => g.toLowerCase().trim()).filter(Boolean)
      const geoAccs = geoTerms.length > 0
        ? accs.filter(a => matchesGeoTerms(a.address ?? '', geoTerms))
        : []

      // Load zone targets + snapshots in parallel
      const zones = m.zones ?? []
      const [targetResults, snaps] = await Promise.all([
        Promise.all(zones.map(z => getZoneTargetAccounts(z.id))),
        zones.length > 0 ? getLatestSnapshotsByZone(zones.map(z => z.id)) : Promise.resolve({} as Record<string, ZoneMetricSnapshot>),
      ])

      // Build target map and find any target accounts outside geo
      const tMap: Record<string, string[]> = {}
      const extraIds = new Set<string>()
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i]
        for (const ta of targetResults[i] ?? []) {
          if (!tMap[ta.account_id]) tMap[ta.account_id] = []
          if (z.client_slug && !tMap[ta.account_id].includes(z.client_slug))
            tMap[ta.account_id].push(z.client_slug)
          if (!geoAccs.some(a => a.id === ta.account_id)) extraIds.add(ta.account_id)
        }
      }
      setTargetMap(tMap)
      setSnapshots(snaps)

      // Merge geo + extra target accounts
      const extraAccs = accs.filter(a => extraIds.has(a.id))
      const allTerrAccs = [...geoAccs, ...extraAccs.filter(e => !geoAccs.some(g => g.id === e.id))]
      setTerritoryAccounts(allTerrAccs)

      // Load brand activity for territory accounts
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
    } catch (e) { console.error('market.detail', e) }
    finally { setLoading(false) }
  }, [id, router])

  useEffect(() => { load() }, [load])

  // Auto-select first brand tab if only one brand
  useEffect(() => {
    if (!market || didAutoSelect.current || activeClientTab !== '') return
    const slugs = new Set<string>()
    for (const z of market.zones ?? []) if (z.client_slug) slugs.add(z.client_slug)
    for (const sl of Object.values(brandActivity)) for (const s of sl) slugs.add(s)
    const first = [...slugs][0]
    if (first && clients.some(c => c.slug === first)) {
      setActiveClientTab(first)
      didAutoSelect.current = true
    }
  }, [market, brandActivity, clients, activeClientTab])

  // ── Load CRM data for a brand in this territory (no zone needed) ─────────

  const loadBrandData = useCallback(async (slug: string) => {
    setLoadingBrandSlugs(prev => new Set([...prev, slug]))
    try {
      const activityAccts = territoryAccounts.filter(a => (brandActivity[a.id] ?? []).includes(slug))
      const activityIds = activityAccts.map(a => a.id)
      const placementsByAccount: Record<string, { product_name: string; status: string }[]> = {}
      const lastVisitByAccount: Record<string, { visited_at: string; status: string }> = {}
      const ordersByAccount: Record<string, { status: string; total_amount: number | null }[]> = {}

      if (activityIds.length > 0) {
        const sb = getSupabase()
        const [plRes, vRes, orRes] = await Promise.all([
          sb.from('placements').select('account_id, product_name, status')
            .eq('client_slug', slug).in('account_id', activityIds).is('lost_at', null),
          sb.from('visits').select('account_id, visited_at, status')
            .eq('client_slug', slug).in('account_id', activityIds)
            .order('visited_at', { ascending: false }),
          sb.from('purchase_orders').select('account_id, status, total_amount')
            .eq('client_slug', slug).in('account_id', activityIds)
            .in('status', ['sent', 'fulfilled', 'draft']).order('created_at', { ascending: false }),
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

      setBrandDataBySlug(prev => ({ ...prev, [slug]: { activityAccounts: activityAccts, placementsByAccount, lastVisitByAccount, ordersByAccount } }))
    } catch (e) { console.error('brand.data', e) }
    finally { setLoadingBrandSlugs(prev => { const s = new Set(prev); s.delete(slug); return s }) }
  }, [territoryAccounts, brandActivity])

  useEffect(() => {
    if (!activeClientTab || territoryAccounts.length === 0) return
    if (!brandDataBySlug[activeClientTab] && !loadingBrandSlugs.has(activeClientTab)) {
      loadBrandData(activeClientTab)
    }
  }, [activeClientTab, territoryAccounts, brandDataBySlug, loadingBrandSlugs, loadBrandData])

  // ── Lazy load zone pursuing targets + snapshots when zone exists ──────────

  const loadZoneDetail = useCallback(async (zone: Zone) => {
    setLoadingZoneIds(prev => new Set([...prev, zone.id]))
    try {
      const [rawTargets, sparks] = await Promise.all([
        getZoneTargetAccounts(zone.id),
        getZoneSnapshots(zone.id, 30),
      ])
      setZoneSparklines(prev => ({ ...prev, [zone.id]: sparks }))

      // Only load data for pursuing targets (activity account data comes from loadBrandData)
      const targetIds = rawTargets.map(ta => ta.account_id).filter(Boolean)
      const placementsByAccount: Record<string, { product_name: string; status: string }[]> = {}
      const lastVisitByAccount: Record<string, { visited_at: string; status: string }> = {}
      const ordersByAccount: Record<string, { status: string; total_amount: number | null }[]> = {}

      if (zone.client_slug && targetIds.length > 0) {
        const sb = getSupabase()
        const [plRes, vRes, orRes] = await Promise.all([
          sb.from('placements').select('account_id, product_name, status')
            .eq('client_slug', zone.client_slug).in('account_id', targetIds).is('lost_at', null),
          sb.from('visits').select('account_id, visited_at, status')
            .eq('client_slug', zone.client_slug).in('account_id', targetIds)
            .order('visited_at', { ascending: false }),
          sb.from('purchase_orders').select('account_id, status, total_amount')
            .eq('client_slug', zone.client_slug).in('account_id', targetIds)
            .in('status', ['sent', 'fulfilled', 'draft']).order('created_at', { ascending: false }),
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

      const targets = rawTargets.map(ta => ({
        ...ta,
        accounts: allAccounts.find(a => a.id === ta.account_id) ?? null,
      }))

      setZoneDetails(prev => ({ ...prev, [zone.id]: { targets, placementsByAccount, lastVisitByAccount, ordersByAccount } }))
    } catch (e) { console.error('zone.detail', e) }
    finally { setLoadingZoneIds(prev => { const s = new Set(prev); s.delete(zone.id); return s }) }
  }, [allAccounts])

  useEffect(() => {
    if (!activeClientTab || !market || allAccounts.length === 0) return
    const zone = (market.zones ?? []).find(z => z.client_slug === activeClientTab)
    if (zone && !zoneDetails[zone.id] && !loadingZoneIds.has(zone.id)) {
      loadZoneDetail(zone)
    }
  }, [activeClientTab, market, allAccounts, zoneDetails, loadingZoneIds, loadZoneDetail])

  // Auto-recompute when a brand tab first opens and has activity but no snapshot
  useEffect(() => {
    if (!activeClientTab) return
    if (loadingBrandSlugs.has(activeClientTab)) return
    const brandData = brandDataBySlug[activeClientTab]
    if (!brandData || brandData.activityAccounts.length === 0) return
    const zone = (market?.zones ?? []).find(z => z.client_slug === activeClientTab)
    const snap = zone ? snapshots[zone.id] ?? null : null
    if (snap !== null) return
    if (autoRecomputedSlugs.current.has(activeClientTab)) return
    autoRecomputedSlugs.current.add(activeClientTab)
    handleRecompute()
  // handleRecompute reads fresh state via closure; safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientTab, loadingBrandSlugs, brandDataBySlug, market, snapshots])

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

  // Brands with any presence in this territory (zone OR CRM activity)
  const territoryClients = useMemo(() => {
    const slugs = new Set<string>()
    for (const z of market?.zones ?? []) if (z.client_slug) slugs.add(z.client_slug)
    for (const sl of Object.values(brandActivity)) for (const s of sl) slugs.add(s)
    return clients.filter(c => slugs.has(c.slug))
  }, [market, clients, brandActivity])

  const hasGeoTags = useMemo(() => {
    if (!market) return false
    return (market.cities?.length ?? 0) + (market.counties?.length ?? 0) + (market.states?.length ?? 0) + (market.zip_codes?.length ?? 0) > 0
  }, [market])

  // Accounts in geo NOT yet targets for active brand
  const suggestedAccounts = useMemo(() => {
    if (!activeClientTab || !hasGeoTags) return []
    return territoryAccounts.filter(a =>
      !(targetMap[a.id] ?? []).includes(activeClientTab) &&
      !(brandActivity[a.id] ?? []).includes(activeClientTab)
    )
  }, [territoryAccounts, activeClientTab, targetMap, brandActivity, hasGeoTags])

  const searchedAddAccounts = useMemo(() => {
    if (addTargetSearch.length < 2) return []
    const q = addTargetSearch.toLowerCase()
    return allAccounts.filter(a => a.name.toLowerCase().includes(q) || (a.address ?? '').toLowerCase().includes(q)).slice(0, 20)
  }, [allAccounts, addTargetSearch])

  const activeZone = useMemo(() =>
    activeClientTab ? (market?.zones ?? []).find(z => z.client_slug === activeClientTab) ?? null : null,
  [market, activeClientTab])

  const activeSnap = activeZone ? snapshots[activeZone.id] ?? null : null
  const activeClient = activeClientTab ? clients.find(c => c.slug === activeClientTab) ?? null : null
  const activeDetail = activeZone ? zoneDetails[activeZone.id] ?? null : null
  const activeSparklines = activeZone ? zoneSparklines[activeZone.id] ?? [] : []
  const effectiveReach = market?.default_reach_threshold ?? 55
  const effectiveRetention = market?.default_retention_threshold ?? 65

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSaveMarket() {
    if (!editForm.name.trim()) return
    setSaving(true)
    try {
      await updateMarket(id, editForm)
      toast('Territory updated')
      setEditing(false)
      load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
    finally { setSaving(false) }
  }

  async function handleDeleteMarket() {
    try { await deleteMarket(id); toast('Deleted'); router.push('/growth') }
    catch (err: any) { toast(err.message || 'Failed', 'error') }
  }

  async function getOrCreateZone(slug: string): Promise<Zone | null> {
    let currentMarket = await getMarket(id)
    let zone = (currentMarket?.zones ?? []).find(z => z.client_slug === slug)
    if (!zone) {
      await createZone({ market_id: id, client_slug: slug, channel: 'on_premise', name: 'On-Premise', velocity_target: 1 })
      currentMarket = await getMarket(id) as typeof currentMarket
      zone = (currentMarket?.zones ?? []).find(z => z.client_slug === slug)
    }
    return zone ?? null
  }

  async function handleSetTarget() {
    if (!targetModal || targetingSlugs.length === 0) return
    setSavingTarget(true)
    try {
      for (const slug of targetingSlugs) {
        const zone = await getOrCreateZone(slug)
        if (zone) await addAccountToZone(zone.id, targetModal.accountId)
      }
      toast('Added to targets')
      setTargetModal(null)
      setTargetingSlugs([])
      setZoneDetails({})
      await load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
    finally { setSavingTarget(false) }
  }

  async function handleAddTarget() {
    if (!addTargetSelectedId || addTargetSlugs.length === 0) return
    setSavingAddTarget(true)
    try {
      for (const slug of addTargetSlugs) {
        const zone = await getOrCreateZone(slug)
        if (zone) await addAccountToZone(zone.id, addTargetSelectedId)
      }
      toast('Added to targets')
      setAddTargetOpen(false)
      setAddTargetSelectedId(null)
      setAddTargetSlugs([])
      setAddTargetSearch('')
      setZoneDetails({})
      await load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
    finally { setSavingAddTarget(false) }
  }

  async function handleAddAll() {
    if (!activeZone || !activeClientTab || suggestedAccounts.length === 0) return
    setAddingAll(true)
    try {
      const zone = await getOrCreateZone(activeClientTab)
      if (zone) await Promise.all(suggestedAccounts.map(a => addAccountToZone(zone.id, a.id)))
      toast(`Added ${suggestedAccounts.length} accounts`)
      setZoneDetails({})
      await load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
    finally { setAddingAll(false) }
  }

  async function handleRemoveTarget() {
    if (!removeTargetModal) return
    try {
      const zone = market?.zones.find(z => z.client_slug === removeTargetModal.clientSlug)
      if (zone) await removeAccountFromZone(zone.id, removeTargetModal.accountId)
      toast('Removed from pursuing')
      setZoneDetails({})
      await load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
    finally { setRemoveTargetModal(null) }
  }

  async function handleRecompute() {
    if (!activeClientTab) return
    const slug = activeClientTab
    setComputingSlugs(prev => new Set([...prev, slug]))
    try {
      // Create zone if needed (invisible infrastructure for snapshot storage)
      const zone = await getOrCreateZone(slug)
      if (!zone) throw new Error('Could not create tracking record')

      // Sync all activity accounts into zone target list so the universe is complete:
      // universe = accounts we're active in + accounts we're pursuing
      const activityAccts = territoryAccounts.filter(a => (brandActivity[a.id] ?? []).includes(slug))
      if (activityAccts.length > 0) {
        const existingTargets = await getZoneTargetAccounts(zone.id)
        const existingIds = new Set(existingTargets.map(ta => ta.account_id))
        const toAdd = activityAccts.filter(a => !existingIds.has(a.id))
        if (toAdd.length > 0) {
          await Promise.all(toAdd.map(a => addAccountToZone(zone.id, a.id)))
        }
      }

      const res = await fetch(`/api/growth/recompute/${zone.id}`, { method: 'POST', signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error((await res.json()).error || 'Recompute failed')

      // Refresh market state (zone may have just been created) + snapshots + zone detail
      setZoneDetails({})
      await load()
      toast('Metrics updated')
    } catch (err: any) { toast(err.message || 'Recompute failed', 'error') }
    finally { setComputingSlugs(prev => { const s = new Set(prev); s.delete(slug); return s }) }
  }


  async function handleRemoveBrand() {
    if (!removeBrandSlug) return
    const zone = market?.zones.find(z => z.client_slug === removeBrandSlug)
    if (!zone) { setRemoveBrandSlug(null); return }
    try {
      await deleteZone(zone.id)
      toast('Brand tracking removed')
      if (activeClientTab === removeBrandSlug) setActiveClientTab('')
      setRemoveBrandSlug(null)
      setZoneDetails({})
      load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <LayoutShell><div style={{ padding: '48px', color: t.text.muted, textAlign: 'center' }}>Loading…</div></LayoutShell>
  )
  if (!market) return null

  const geoParts = [...(market.cities ?? []), ...(market.counties?.map(c => `${c} County`) ?? []), ...(market.states ?? [])].filter(Boolean)
  const geoSummary = geoParts.slice(0, 4).join(' · ') + (geoParts.length > 4 ? ` +${geoParts.length - 4} more` : '')
  const isComputing = computingSlugs.has(activeClientTab)
  const isLoadingBrandData = loadingBrandSlugs.has(activeClientTab)
  const activeBrandData = activeClientTab ? brandDataBySlug[activeClientTab] ?? null : null

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
                    <input ref={editGeoInputRef} type="text" placeholder="Search city, county, or region…" style={{ ...inputStyle, paddingLeft: '30px' }} />
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
                style={{ padding: '11px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none', borderBottom: `2px solid ${activeClientTab === '' ? t.gold : 'transparent'}`, backgroundColor: 'transparent', color: activeClientTab === '' ? t.text.primary : t.text.muted, marginBottom: '-1px' }}>
                Overview
              </button>
              {territoryClients.map(c => {
                const color = c.color || t.gold
                const active = activeClientTab === c.slug
                const logo = clientLogoUrl(c)
                return (
                  <button key={c.slug} onClick={() => setActiveClientTab(c.slug)} title={c.name}
                    style={{ padding: '8px 14px', cursor: 'pointer', border: 'none', borderBottom: `2px solid ${active ? color : 'transparent'}`, backgroundColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '-1px', opacity: active ? 1 : 0.45, transition: 'opacity 150ms' }}>
                    {logo ? (
                      <img src={logo} alt={c.name} style={{ height: '28px', width: 'auto', maxWidth: '80px', objectFit: 'contain', display: 'block' }} />
                    ) : (
                      <span style={{ width: 28, height: 28, borderRadius: '6px', backgroundColor: color + '22', border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', color }}>
                        {c.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '16px' }}>
              <button onClick={() => { setAddTargetSlugs(activeClientTab ? [activeClientTab] : []); setAddTargetSelectedId(null); setAddTargetSearch(''); setAddTargetOpen(true) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: '600', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold, cursor: 'pointer' }}>
                <Plus size={12} /> Add to Pursuing
              </button>
            </div>
          </div>
        )}

        {/* ── Content ───────────────────────────────────────────────────────── */}
        {!editing && (
          activeClientTab === '' ? (

            /* ── Overview: brand health cards ──────────────────────────────── */
            <div style={{ padding: '24px 40px' }}>
              {territoryClients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 24px', border: `2px dashed ${t.border.default}`, borderRadius: '12px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.secondary, marginBottom: '8px' }}>No brand data for this territory yet</div>
                  <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '20px' }}>
                    {hasGeoTags
                      ? 'Log visits, create placements, or add target accounts to start seeing brand performance here.'
                      : 'Add cities, counties, or zip codes to this territory to start tracking.'}
                  </div>
                  {!hasGeoTags && (
                    <button onClick={() => setEditing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', backgroundColor: t.gold, color: '#0f0e0c', cursor: 'pointer', border: 'none' }}>
                      Edit Territory
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                  {territoryClients.map(c => {
                    const zone = (market.zones ?? []).find(z => z.client_slug === c.slug)
                    const snap = zone ? snapshots[zone.id] : null
                    const color = c.color || t.gold
                    const targetCount = territoryAccounts.filter(a => (targetMap[a.id] ?? []).includes(c.slug)).length
                    const activityCount = territoryAccounts.filter(a => (brandActivity[a.id] ?? []).includes(c.slug)).length
                    return (
                      <div key={c.slug} onClick={() => setActiveClientTab(c.slug)}
                        style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderTop: `3px solid ${color}`, borderRadius: '12px', padding: '18px', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = color + '60')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = t.border.default)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          {(() => {
                            const logo = clientLogoUrl(c)
                            return logo ? (
                              <img src={logo} alt={c.name} style={{ height: '32px', width: 'auto', maxWidth: '110px', objectFit: 'contain', display: 'block' }} />
                            ) : (
                              <span style={{ fontSize: '15px', fontWeight: '800', color: t.text.primary }}>{c.name}</span>
                            )
                          })()}
                          <HealthRing score={snap?.health_score ?? null} size={52} strokeWidth={5} showLabel={false} />
                        </div>
                        {snap ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
                            {[{ label: 'REACH', v: snap.reach_pct }, { label: 'VEL', v: snap.velocity_index }, { label: 'RET', v: snap.retention_pct }].map(m => (
                              <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '8px', color: t.text.muted, fontWeight: '700', width: '24px', letterSpacing: '0.07em' }}>{m.label}</span>
                                <div style={{ flex: 1, height: '3px', borderRadius: '2px', backgroundColor: t.border.subtle, overflow: 'hidden' }}>
                                  {m.v != null && <div style={{ height: '100%', width: `${Math.min(m.v, 100)}%`, backgroundColor: healthColor(m.v), borderRadius: '2px' }} />}
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: m.v != null ? healthColor(m.v) : t.text.muted, width: '32px', textAlign: 'right' }}>
                                  {m.v != null ? `${Math.round(m.v)}%` : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: t.text.muted, fontStyle: 'italic', marginBottom: '10px' }}>No metrics yet — select to recompute</div>
                        )}
                        <div style={{ borderTop: `1px solid ${t.border.subtle}`, paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: t.text.muted }}>
                            {targetCount > 0 ? `${targetCount} targets` : 'No targets'} · {activityCount} with activity
                          </span>
                          <span style={{ fontSize: '11px', color, fontWeight: '700' }}>View →</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          ) : (

            /* ── Brand detail: metrics LEFT, accounts RIGHT ─────────────────── */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', alignItems: 'start' }}>

              {/* LEFT: Metrics panel */}
              <div style={{ padding: '24px 40px', borderRight: `1px solid ${t.border.subtle}` }}>

                {/* Health ring + metric tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 1fr 1fr 1fr', gap: '12px', alignItems: 'stretch', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <HealthRing score={activeSnap?.health_score ?? null} size={68} strokeWidth={6} />
                  </div>
                  <MetricTile
                    label="Reach"
                    value={activeSnap?.reach_pct ?? null}
                    target={market.default_reach_threshold}
                    unit="%"
                  />
                  <MetricTile
                    label="Velocity"
                    value={activeSnap?.velocity_index ?? null}
                    target={100}
                    unit=""
                    note={activeSnap?.velocity != null ? `${activeSnap.velocity.toFixed(1)} cs/acct/mo` : undefined}
                  />
                  <MetricTile
                    label="Retention"
                    value={activeSnap?.retention_pct ?? null}
                    target={market.default_retention_threshold}
                    unit="%"
                  />
                  {(() => {
                    const inMarket = activeBrandData?.activityAccounts.length ?? 0
                    const pursuing = activeDetail
                      ? activeDetail.targets.filter(ta => !(brandActivity[ta.account_id] ?? []).includes(activeClientTab)).length
                      : territoryAccounts.filter(a => (targetMap[a.id] ?? []).includes(activeClientTab) && !(brandActivity[a.id] ?? []).includes(activeClientTab)).length
                    const total = inMarket + pursuing
                    return (
                      <div style={{ backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`, borderRadius: '10px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Universe</div>
                        <div style={{ fontSize: '24px', fontWeight: '800', color: t.text.primary, lineHeight: 1 }}>{total}</div>
                        <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '6px', lineHeight: 1.4 }}>
                          <span style={{ color: t.status.success, fontWeight: '700' }}>{inMarket}</span> active
                          {pursuing > 0 && <><span style={{ margin: '0 3px' }}>·</span><span style={{ color: t.gold, fontWeight: '700' }}>{pursuing}</span> pursuing</>}
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Formula reference */}
                <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '16px', lineHeight: 1.6, padding: '8px 12px', borderRadius: '7px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                  <span style={{ fontWeight: '700', color: t.text.secondary }}>Reach</span> = accounts active in territory ÷ universe (active + pursuing)
                  <span style={{ margin: '0 8px', color: t.border.default }}>·</span>
                  <span style={{ fontWeight: '700', color: t.text.secondary }}>Velocity</span> = cases/acct/mo vs territory target
                  <span style={{ margin: '0 8px', color: t.border.default }}>·</span>
                  <span style={{ fontWeight: '700', color: t.text.secondary }}>Retention</span> = reorder + menu placement rate
                </div>

                {/* Sparklines */}
                {activeSparklines.length >= 3 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                    {[
                      { label: 'Reach (30d)', data: activeSparklines.map(s => s.reach_pct) },
                      { label: 'Velocity (30d)', data: activeSparklines.map(s => s.velocity_index) },
                      { label: 'Retention (30d)', data: activeSparklines.map(s => s.retention_pct) },
                    ].map(({ label, data }) => (
                      <div key={label} style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                        <div style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{label}</div>
                        <Sparkline data={data} width={160} height={28} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Radar chart */}
                {activeSnap && (
                  <div style={{ marginBottom: '16px', padding: '16px', borderRadius: '10px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                      Performance vs Targets
                    </div>
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={[
                          { metric: 'Reach', value: Math.round(activeSnap.reach_pct ?? 0), target: effectiveReach },
                          { metric: 'Vel. Index', value: Math.round(activeSnap.velocity_index ?? 0), target: 100 },
                          { metric: 'Retention', value: Math.round(activeSnap.retention_pct ?? 0), target: effectiveRetention },
                        ]}>
                          <PolarGrid stroke={t.border.subtle} />
                          <PolarAngleAxis dataKey="metric" tick={{ fill: t.text.muted, fontSize: 11, fontWeight: 600 }} />
                          <Radar name="Actual" dataKey="value" stroke={healthColor(activeSnap.health_score)} fill={healthColor(activeSnap.health_score)} fillOpacity={0.18} strokeWidth={2} />
                          <Radar name="Target" dataKey="target" stroke={t.border.default} fill="none" strokeDasharray="4 2" strokeWidth={1} />
                          <Tooltip contentStyle={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: t.text.primary, fontWeight: 700 }} itemStyle={{ color: t.text.secondary }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: t.text.muted }}>
                        <div style={{ width: 16, height: 2, backgroundColor: healthColor(activeSnap.health_score), borderRadius: 1 }} /> Actual
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: t.text.muted }}>
                        <div style={{ width: 16, height: 2, backgroundColor: t.border.default, borderRadius: 1 }} /> Target
                      </div>
                      <div style={{ fontSize: '10px', color: t.text.muted, marginLeft: 'auto' }}>
                        Health = Reach×35% + Vel×30% + Ret×35%
                        {activeSnap.health_score != null && (
                          <span style={{ color: healthColor(activeSnap.health_score), fontWeight: '700', marginLeft: '6px' }}>
                            = {Math.round(activeSnap.health_score)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Recompute bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderRadius: '8px', backgroundColor: t.bg.elevated, border: `1px solid ${t.border.subtle}`, marginBottom: '16px' }}>
                  <span style={{ fontSize: '12px', color: t.text.muted }}>
                    {activeSnap
                      ? `Last computed: ${new Date(activeSnap.computed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                      : 'No snapshot yet — click Recompute to populate metrics.'}
                  </span>
                  <button onClick={handleRecompute} disabled={isComputing}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '7px', fontSize: '12px', cursor: isComputing ? 'default' : 'pointer', border: `1px solid ${t.goldBorder}`, backgroundColor: t.goldDim, color: t.gold, fontWeight: '600', opacity: isComputing ? 0.6 : 1 }}>
                    <RefreshCw size={12} /> {isComputing ? 'Computing…' : 'Recompute Now'}
                  </button>
                </div>

                {activeZone && (
                  <button onClick={() => setRemoveBrandSlug(activeClientTab)}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '7px', border: `1px solid rgba(232,85,64,0.3)`, backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '12px', cursor: 'pointer' }}>
                    <Trash2 size={12} /> Remove Brand from Territory
                  </button>
                )}
              </div>

              {/* RIGHT: Accounts panel */}
              <div style={{ padding: '24px', position: 'sticky', top: 0, maxHeight: '100vh', overflowY: 'auto' }}>

                {isLoadingBrandData ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: t.text.muted, fontSize: '12px' }}>Loading accounts…</div>
                ) : (
                  <>
                    {/* ── Active (auto-detected from CRM activity) ─────────────── */}
                    {(() => {
                      const inMarket = activeBrandData?.activityAccounts ?? []
                      if (inMarket.length === 0 && !activeBrandData) return null
                      return (
                        <div style={{ marginBottom: '20px' }}>
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              Active · {inMarket.length}
                            </div>
                            <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '2px' }}>Accounts you're already working with this brand</div>
                          </div>
                          {inMarket.length === 0 ? (
                            <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                              <div style={{ fontSize: '12px', color: t.text.muted }}>No active accounts yet in this territory</div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {inMarket.map(acct => {
                                const placements = activeBrandData!.placementsByAccount[acct.id] ?? []
                                const lastVisit = activeBrandData!.lastVisitByAccount[acct.id]
                                const orders = activeBrandData!.ordersByAccount[acct.id] ?? []
                                const lastVisitDays = lastVisit
                                  ? Math.floor((Date.now() - new Date(lastVisit.visited_at).getTime()) / 86400000)
                                  : null
                                return (
                                  <Link key={acct.id} href={`/accounts/${acct.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                                    <div style={{ padding: '11px 12px', borderRadius: '8px', backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, cursor: 'pointer', transition: 'border-color 150ms', borderLeft: `3px solid ${activeClient?.color || t.gold}` }}
                                      onMouseEnter={e => (e.currentTarget.style.borderColor = (activeClient?.color || t.gold) + '60')}
                                      onMouseLeave={e => (e.currentTarget.style.borderColor = t.border.default)}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary, flex: 1 }}>{acct.name}</span>
                                        <ChevronRight size={12} color={t.text.muted} />
                                      </div>
                                      {placements.length > 0 ? (
                                        <div style={{ fontSize: '11px', color: t.status.success, marginBottom: '2px' }}>
                                          <span style={{ fontWeight: '700' }}>{placements.length}</span> placement{placements.length !== 1 ? 's' : ''}
                                          <span style={{ color: t.text.muted }}> · {placements.map(p => p.product_name || p.status).slice(0, 2).join(', ')}</span>
                                        </div>
                                      ) : (
                                        <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '2px' }}>No placements</div>
                                      )}
                                      {orders.length > 0 && (
                                        <div style={{ fontSize: '11px', color: t.gold, marginBottom: '2px' }}>
                                          {orders.length} order{orders.length !== 1 ? 's' : ''}
                                          <span style={{ color: t.text.muted }}> · {orders[0].status}</span>
                                        </div>
                                      )}
                                      <div style={{ fontSize: '10px', color: t.text.muted }}>
                                        {lastVisit
                                          ? `${lastVisitDays === 0 ? 'Today' : `${lastVisitDays}d ago`} · ${lastVisit.status}`
                                          : 'Not yet visited for this brand'}
                                      </div>
                                    </div>
                                  </Link>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* ── Pursuing (manual targets without active CRM data) ──────── */}
                    {(() => {
                      const pursuing = activeDetail
                        ? activeDetail.targets.filter(ta => !(brandActivity[ta.account_id] ?? []).includes(activeClientTab))
                        : []
                      const isLoadingPursuing = activeZone ? loadingZoneIds.has(activeZone.id) : false
                      return (
                        <div style={{ marginBottom: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Pursuing · {isLoadingPursuing ? '…' : pursuing.length}
                              </div>
                              <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '2px' }}>Accounts you're actively working to get into</div>
                            </div>
                            <button onClick={() => { setAddTargetSlugs([activeClientTab]); setAddTargetSelectedId(null); setAddTargetSearch(''); setAddTargetOpen(true) }}
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold, flexShrink: 0 }}>
                              <Plus size={10} /> Add
                            </button>
                          </div>
                          {isLoadingPursuing ? (
                            <div style={{ fontSize: '11px', color: t.text.muted, padding: '8px 0' }}>Loading…</div>
                          ) : pursuing.length === 0 ? (
                            <div style={{ padding: '12px 14px', borderRadius: '8px', border: `2px dashed ${t.border.default}`, textAlign: 'center' }}>
                              <div style={{ fontSize: '12px', color: t.text.muted }}>No accounts being pursued yet</div>
                              <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '3px' }}>Pick from Opportunities below, or add manually</div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {pursuing.map(ta => {
                                const acct = ta.accounts
                                if (!acct) return null
                                const lastVisit = activeDetail!.lastVisitByAccount[acct.id]
                                const lastVisitDays = lastVisit
                                  ? Math.floor((Date.now() - new Date(lastVisit.visited_at).getTime()) / 86400000)
                                  : null
                                return (
                                  <div key={ta.id} style={{ position: 'relative' }}>
                                    <Link href={`/accounts/${acct.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                                      <div style={{ padding: '11px 12px', borderRadius: '8px', backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, cursor: 'pointer', transition: 'border-color 150ms' }}
                                        onMouseEnter={e => (e.currentTarget.style.borderColor = (activeClient?.color || t.gold) + '60')}
                                        onMouseLeave={e => (e.currentTarget.style.borderColor = t.border.default)}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                          <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary, flex: 1 }}>{acct.name}</span>
                                          <ChevronRight size={12} color={t.text.muted} />
                                        </div>
                                        <div style={{ fontSize: '10px', color: t.text.muted }}>
                                          {lastVisit
                                            ? `Last visited ${lastVisitDays === 0 ? 'today' : `${lastVisitDays}d ago`} · ${lastVisit.status}`
                                            : 'Not yet visited'}
                                        </div>
                                      </div>
                                    </Link>
                                    <button
                                      onClick={e => { e.preventDefault(); setRemoveTargetModal({ accountId: acct.id, clientSlug: activeClientTab, name: acct.name }) }}
                                      style={{ position: 'absolute', top: '8px', right: '30px', background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted, padding: '2px', opacity: 0.4, display: 'flex', alignItems: 'center' }}
                                      title="Remove from pursuing">
                                      <X size={11} />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* ── Opportunities (in territory, not yet active or targeted) ── */}
                    {suggestedAccounts.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              Opportunities · {suggestedAccounts.length}
                            </div>
                            <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '2px' }}>In territory, not yet approached for this brand</div>
                          </div>
                          {suggestedAccounts.length > 1 && (
                            <button onClick={handleAddAll} disabled={addingAll}
                              style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: addingAll ? 'default' : 'pointer', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold, opacity: addingAll ? 0.6 : 1, flexShrink: 0 }}>
                              <Plus size={10} /> {addingAll ? 'Adding…' : 'Pursue All'}
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {suggestedAccounts.map(a => (
                            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: t.text.primary }}>{a.name}</div>
                                {a.address && <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '1px' }}>{a.address.split(',')[0]}</div>}
                              </div>
                              <button
                                onClick={() => { setTargetModal({ accountId: a.id, name: a.name, preSlug: activeClientTab }); setTargetingSlugs([activeClientTab]) }}
                                style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', flexShrink: 0, marginLeft: '8px', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold }}>
                                <Plus size={10} /> Pursue
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!hasGeoTags && (
                  <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px', border: `1px dashed ${t.border.default}`, backgroundColor: t.bg.input }}>
                    <div style={{ fontSize: '11px', color: t.text.muted, lineHeight: 1.5 }}>
                      <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.gold, fontWeight: '600', padding: 0, fontSize: '11px' }}>
                        Add cities or zip codes to {market.name}
                      </button>{' '}to auto-populate accounts from your CRM.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* ── Set as Target Modal ──────────────────────────────────────────────── */}
      {targetModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.page, borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '380px', border: `1px solid ${t.border.default}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>Add to Pursuing</h2>
              <button onClick={() => { setTargetModal(null); setTargetingSlugs([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={16} /></button>
            </div>
            <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '16px' }}>{targetModal.name}</div>
            <label style={{ ...labelStyle, display: 'block', marginBottom: '8px' }}>Pursue for which brand?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              {clients.map(c => {
                const checked = targetingSlugs.includes(c.slug)
                const col = c.color || t.gold
                return (
                  <button key={c.slug} onClick={() => setTargetingSlugs(prev => checked ? prev.filter(s => s !== c.slug) : [...prev, c.slug])}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${checked ? col + '60' : t.border.default}`, backgroundColor: checked ? col + '0d' : t.bg.input, cursor: 'pointer', width: '100%' }}>
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
              <button onClick={handleSetTarget} disabled={targetingSlugs.length === 0 || savingTarget}
                style={{ ...btnPrimary, opacity: (targetingSlugs.length === 0 || savingTarget) ? 0.6 : 1 }}>
                {savingTarget ? 'Adding…' : 'Start Pursuing'}
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
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>Add to Pursuing</h2>
              <button onClick={() => { setAddTargetOpen(false); setAddTargetSelectedId(null); setAddTargetSlugs([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={16} /></button>
            </div>
            {!addTargetSelectedId ? (
              <>
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                  <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: t.text.muted, pointerEvents: 'none' }} />
                  <input type="text" placeholder="Search accounts…" value={addTargetSearch} onChange={e => setAddTargetSearch(e.target.value)} autoFocus style={{ ...inputStyle, paddingLeft: '30px' }} />
                </div>
                {addTargetSearch.length < 2 ? (
                  <div style={{ fontSize: '12px', color: t.text.muted, textAlign: 'center', padding: '20px' }}>Type to search all CRM accounts</div>
                ) : searchedAddAccounts.length === 0 ? (
                  <div style={{ fontSize: '12px', color: t.text.muted, textAlign: 'center', padding: '20px' }}>No accounts found</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {searchedAddAccounts.map(a => (
                      <button key={a.id} onClick={() => setAddTargetSelectedId(a.id)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}`, cursor: 'pointer', width: '100%' }}>
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
                  <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary, flex: 1 }}>{allAccounts.find(a => a.id === addTargetSelectedId)?.name}</span>
                  <button onClick={() => setAddTargetSelectedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={13} /></button>
                </div>
                <label style={{ ...labelStyle, display: 'block', marginBottom: '8px' }}>Pursue for which brand(s)?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                  {clients.map(c => {
                    const checked = addTargetSlugs.includes(c.slug)
                    const col = c.color || t.gold
                    return (
                      <button key={c.slug} onClick={() => setAddTargetSlugs(prev => checked ? prev.filter(s => s !== c.slug) : [...prev, c.slug])}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${checked ? col + '60' : t.border.default}`, backgroundColor: checked ? col + '0d' : t.bg.input, cursor: 'pointer', width: '100%' }}>
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
                  <button onClick={handleAddTarget} disabled={addTargetSlugs.length === 0 || savingAddTarget}
                    style={{ ...btnPrimary, opacity: (addTargetSlugs.length === 0 || savingAddTarget) ? 0.6 : 1 }}>
                    {savingAddTarget ? 'Adding…' : 'Start Pursuing'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Confirm modals ───────────────────────────────────────────────────── */}
      <ConfirmModal isOpen={deleteMarketModal} title="Delete Territory"
        message={`Delete "${market.name}"? This cannot be undone.`}
        confirmLabel="Delete" onConfirm={handleDeleteMarket} onClose={() => setDeleteMarketModal(false)} />
      <ConfirmModal isOpen={!!removeTargetModal} title="Remove from Targets"
        message={removeTargetModal ? `Remove "${removeTargetModal.name}" from pursuing?` : ''}
        confirmLabel="Remove" onConfirm={handleRemoveTarget} onClose={() => setRemoveTargetModal(null)} />
      <ConfirmModal isOpen={!!removeBrandSlug} title="Remove Brand Tracking"
        message={`Stop tracking ${clients.find(c => c.slug === removeBrandSlug)?.name ?? 'this brand'} in ${market.name}? Target accounts and metric history will be removed.`}
        confirmLabel="Remove" onConfirm={handleRemoveBrand} onClose={() => setRemoveBrandSlug(null)} />
    </LayoutShell>
  )
}

export default function MarketDetailPage() {
  return <Suspense><MarketDetailContent /></Suspense>
}
