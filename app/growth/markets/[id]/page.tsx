'use client'
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Trash2, X, RefreshCw, ChevronRight, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import LayoutShell, { useToast } from '../../../layout-shell'
import ConfirmModal from '../../../components/ConfirmModal'
import { t, inputStyle, labelStyle, btnPrimary, btnSecondary } from '../../../lib/theme'
import { getClients, getAccounts } from '../../../lib/data'
import { clientLogoUrl } from '../../../lib/constants'
import { getSupabase } from '../../../lib/supabase'
import { matchesGeoTerms } from '../../../lib/concentric/geo'
import {
  getMarket, updateMarket, deleteMarket,
  createZone, deleteZone,
  getLatestSnapshotsByZone, getZoneSnapshots,
} from '../../../lib/concentric/data'
import { HealthRing, ArcGauge, Sparkline, healthColor } from '../../_components'
import { formatCurrency } from '../../../lib/formatters'
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
            <button type="button" onClick={() => onChange(values.filter(x => x !== v))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: t.gold, display: 'flex', alignItems: 'center' }}><X size={10} /></button>
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

type OrderData = { status: string; total_amount: number | null; sent_at: string | null; created_at: string }

interface BrandData {
  activityAccounts: Account[]
  placementsByAccount: Record<string, { product_name: string; status: string }[]>
  lastVisitByAccount: Record<string, { visited_at: string; status: string }>
  ordersByAccount: Record<string, OrderData[]>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW_MS = Date.now()
const D90_MS = 90 * 86400000
const D180_MS = 180 * 86400000

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  return Math.floor((NOW_MS - new Date(dateStr).getTime()) / 86400000)
}

function latestOrderDate(orders: OrderData[]): string | null {
  if (!orders.length) return null
  return orders.reduce((best, o) => {
    const d = o.sent_at || o.created_at
    return !best || d > best ? d : best
  }, null as string | null)
}

function relativeDate(dateStr: string | null | undefined): string {
  const d = daysSince(dateStr)
  if (d === null) return '—'
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}yr ago`
}

// ─── Account Row ──────────────────────────────────────────────────────────────

function AccountRow({
  account, orders, lastVisit, placements, clientColor, maxAmount,
}: {
  account: Account
  orders: OrderData[]
  lastVisit?: { visited_at: string; status: string }
  placements?: { product_name: string; status: string }[]
  clientColor: string
  maxAmount: number
}) {
  const [hovered, setHovered] = useState(false)
  const lastOrderDate = latestOrderDate(orders)
  const lastOrderMs = lastOrderDate ? new Date(lastOrderDate).getTime() : 0
  const orders90d = orders.filter(o => new Date(o.sent_at || o.created_at).getTime() >= NOW_MS - D90_MS)
  const amount90d = orders90d.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
  const activePlacements = (placements ?? []).length
  const barPct = maxAmount > 0 ? Math.round((amount90d / maxAmount) * 100) : 0
  const daysSinceVisit = lastVisit ? daysSince(lastVisit.visited_at) : null

  const signalColor = lastOrderMs >= NOW_MS - D90_MS ? t.status.success
    : lastOrderMs >= NOW_MS - D180_MS ? t.status.warning
    : lastOrderMs > 0 ? t.status.danger
    : '#444'

  const lastActivityStr = lastOrderDate
    ? relativeDate(lastOrderDate)
    : daysSinceVisit !== null
      ? `visited ${relativeDate(lastVisit!.visited_at)}`
      : '—'

  return (
    <Link href={`/accounts/${account.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          padding: '10px 14px 8px',
          borderRadius: '9px',
          backgroundColor: hovered ? t.bg.elevated : 'transparent',
          border: `1px solid ${hovered ? signalColor + '30' : t.border.subtle}`,
          borderLeft: `3px solid ${signalColor}`,
          cursor: 'pointer',
          transition: 'background 100ms, border-color 100ms',
          boxShadow: hovered ? `0 0 20px ${signalColor}08` : 'none',
        }}
      >
        {/* Main row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', alignItems: 'center', gap: '16px' }}>
          {/* Name + signal */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              backgroundColor: signalColor,
              boxShadow: lastOrderMs >= NOW_MS - D90_MS ? `0 0 7px ${signalColor}` : 'none',
            }} />
            <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {account.name}
            </span>
          </div>

          {/* Placements */}
          <span style={{
            fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'right',
            color: activePlacements > 0 ? clientColor : '#333',
            fontWeight: activePlacements > 0 ? '700' : '400',
            opacity: activePlacements > 0 ? 1 : 0.5,
          }}>
            {activePlacements > 0 ? `${activePlacements} placed` : '—'}
          </span>

          {/* 90d revenue */}
          <span style={{
            fontSize: '12px', whiteSpace: 'nowrap', textAlign: 'right', minWidth: '72px',
            fontWeight: orders90d.length > 0 ? '800' : '400',
            fontVariantNumeric: 'tabular-nums',
            color: orders90d.length > 0 ? t.text.primary : '#333',
            opacity: orders90d.length > 0 ? 1 : 0.4,
            textShadow: orders90d.length > 0 && amount90d > 0 ? `0 0 14px ${signalColor}30` : 'none',
          }}>
            {orders90d.length > 0 && amount90d > 0 ? formatCurrency(amount90d) : orders90d.length > 0 ? `${orders90d.length} order${orders90d.length !== 1 ? 's' : ''}` : 'no orders 90d'}
          </span>

          {/* Last activity */}
          <span style={{
            fontSize: '11px', color: t.text.muted, whiteSpace: 'nowrap', textAlign: 'right', minWidth: '72px',
            opacity: lastOrderDate ? 0.9 : 0.4,
          }}>
            {lastActivityStr}
          </span>
        </div>

        {/* Activity bar */}
        {barPct > 0 && (
          <div style={{ marginTop: '7px', position: 'relative', height: '2px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '1px' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${barPct}%`, borderRadius: '1px',
              backgroundColor: signalColor, opacity: 0.6,
              boxShadow: `0 0 6px ${signalColor}`,
            }} />
          </div>
        )}
      </div>
    </Link>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function MarketDetailContent() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()

  const [market, setMarket] = useState<(Market & { zones: Zone[] }) | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [territoryAccounts, setTerritoryAccounts] = useState<Account[]>([])
  const [brandActivity, setBrandActivity] = useState<Record<string, string[]>>({})
  const [snapshots, setSnapshots] = useState<Record<string, ZoneMetricSnapshot>>({})
  const [brandDataBySlug, setBrandDataBySlug] = useState<Record<string, BrandData>>({})
  const [loadingBrandSlugs, setLoadingBrandSlugs] = useState<Set<string>>(new Set())
  const [zoneSparklines, setZoneSparklines] = useState<Record<string, ZoneMetricSnapshot[]>>({})
  const [loadingSparklineIds, setLoadingSparklineIds] = useState<Set<string>>(new Set())
  const [computingSlugs, setComputingSlugs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const [activeClientTab, setActiveClientTab] = useState<string>(searchParams.get('client') ?? '')
  const didAutoSelect = useRef(false)
  const autoRecomputedSlugs = useRef<Set<string>>(new Set())

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
  const [removeBrandSlug, setRemoveBrandSlug] = useState<string | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const [m, cls] = await Promise.all([getMarket(id), getClients()])
      if (!m) { router.push('/growth'); return }
      setMarket(m); setClients(cls)
      setEditForm({
        name: m.name, priority: m.priority,
        cities: m.cities ?? [], counties: m.counties ?? [],
        states: m.states ?? [], zip_codes: m.zip_codes ?? [],
        default_reach_threshold: m.default_reach_threshold,
        default_retention_threshold: m.default_retention_threshold,
        notes: m.notes ?? '',
      })
      const accs = await getAccounts({ limit: 500 })
      const geoTerms = [...(m.cities ?? []), ...(m.counties ?? []), ...(m.states ?? []), ...(m.zip_codes ?? [])]
        .map(g => g.toLowerCase().trim()).filter(Boolean)
      const geoAccs = geoTerms.length > 0 ? accs.filter(a => matchesGeoTerms(a.address ?? '', geoTerms)) : []
      setTerritoryAccounts(geoAccs)
      const zones = m.zones ?? []
      const snaps = zones.length > 0 ? await getLatestSnapshotsByZone(zones.map(z => z.id)) : {}
      setSnapshots(snaps)
      if (geoAccs.length > 0) {
        const accIds = geoAccs.map(a => a.id)
        const sb = getSupabase()
        const [vRes, pRes, oRes] = await Promise.all([
          sb.from('visits').select('account_id, client_slug').in('account_id', accIds),
          sb.from('placements').select('account_id, client_slug').in('account_id', accIds).is('lost_at', null),
          sb.from('purchase_orders').select('account_id, client_slug').in('account_id', accIds).in('status', ['sent', 'fulfilled']),
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

  useEffect(() => {
    if (!market || didAutoSelect.current || activeClientTab !== '') return
    const slugs = new Set<string>()
    for (const z of market.zones ?? []) if (z.client_slug) slugs.add(z.client_slug)
    for (const sl of Object.values(brandActivity)) for (const s of sl) slugs.add(s)
    const first = [...slugs][0]
    if (first && clients.some(c => c.slug === first)) { setActiveClientTab(first); didAutoSelect.current = true }
  }, [market, brandActivity, clients, activeClientTab])

  const loadBrandData = useCallback(async (slug: string) => {
    setLoadingBrandSlugs(prev => new Set([...prev, slug]))
    try {
      const activityAccts = territoryAccounts.filter(a => (brandActivity[a.id] ?? []).includes(slug))
      const activityIds = activityAccts.map(a => a.id)
      const placementsByAccount: Record<string, { product_name: string; status: string }[]> = {}
      const lastVisitByAccount: Record<string, { visited_at: string; status: string }> = {}
      const ordersByAccount: Record<string, OrderData[]> = {}
      if (activityIds.length > 0) {
        const sb = getSupabase()
        const [plRes, vRes, orRes] = await Promise.all([
          sb.from('placements').select('account_id, product_name, status').eq('client_slug', slug).in('account_id', activityIds).is('lost_at', null),
          sb.from('visits').select('account_id, visited_at, status').eq('client_slug', slug).in('account_id', activityIds).order('visited_at', { ascending: false }),
          sb.from('purchase_orders').select('account_id, status, total_amount, sent_at, created_at').eq('client_slug', slug).in('account_id', activityIds).in('status', ['sent', 'fulfilled']).order('created_at', { ascending: false }),
        ])
        for (const p of plRes.data ?? []) {
          if (!placementsByAccount[p.account_id]) placementsByAccount[p.account_id] = []
          placementsByAccount[p.account_id].push(p)
        }
        for (const v of vRes.data ?? []) { if (!lastVisitByAccount[v.account_id]) lastVisitByAccount[v.account_id] = v }
        for (const o of orRes.data ?? []) {
          if (!ordersByAccount[o.account_id]) ordersByAccount[o.account_id] = []
          ordersByAccount[o.account_id].push(o as OrderData)
        }
      }
      setBrandDataBySlug(prev => ({ ...prev, [slug]: { activityAccounts: activityAccts, placementsByAccount, lastVisitByAccount, ordersByAccount } }))
    } catch (e) { console.error('brand.data', e) }
    finally { setLoadingBrandSlugs(prev => { const s = new Set(prev); s.delete(slug); return s }) }
  }, [territoryAccounts, brandActivity])

  useEffect(() => {
    if (!activeClientTab || territoryAccounts.length === 0) return
    if (!brandDataBySlug[activeClientTab] && !loadingBrandSlugs.has(activeClientTab)) loadBrandData(activeClientTab)
  }, [activeClientTab, territoryAccounts, brandDataBySlug, loadingBrandSlugs, loadBrandData])

  const loadZoneSparklines = useCallback(async (zone: Zone) => {
    setLoadingSparklineIds(prev => new Set([...prev, zone.id]))
    try {
      const sparks = await getZoneSnapshots(zone.id, 30)
      setZoneSparklines(prev => ({ ...prev, [zone.id]: sparks }))
    } catch (e) { console.error('zone.sparklines', e) }
    finally { setLoadingSparklineIds(prev => { const s = new Set(prev); s.delete(zone.id); return s }) }
  }, [])

  useEffect(() => {
    if (!activeClientTab || !market) return
    const zone = (market.zones ?? []).find(z => z.client_slug === activeClientTab)
    if (zone && !zoneSparklines[zone.id] && !loadingSparklineIds.has(zone.id)) loadZoneSparklines(zone)
  }, [activeClientTab, market, zoneSparklines, loadingSparklineIds, loadZoneSparklines])

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientTab, loadingBrandSlugs, brandDataBySlug, market, snapshots])

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

  // ── Derived ───────────────────────────────────────────────────────────────────

  const territoryClients = useMemo(() => {
    const slugs = new Set<string>()
    for (const z of market?.zones ?? []) if (z.client_slug) slugs.add(z.client_slug)
    for (const sl of Object.values(brandActivity)) for (const s of sl) slugs.add(s)
    return clients.filter(c => slugs.has(c.slug))
  }, [market, clients, brandActivity])

  const hasGeoTags = useMemo(() =>
    !market ? false : (market.cities?.length ?? 0) + (market.counties?.length ?? 0) + (market.states?.length ?? 0) + (market.zip_codes?.length ?? 0) > 0,
  [market])

  const activeZone = useMemo(() =>
    activeClientTab ? (market?.zones ?? []).find(z => z.client_slug === activeClientTab) ?? null : null,
  [market, activeClientTab])

  const activeSnap = activeZone ? snapshots[activeZone.id] ?? null : null
  const activeClient = activeClientTab ? clients.find(c => c.slug === activeClientTab) ?? null : null
  const activeSparklines = activeZone ? zoneSparklines[activeZone.id] ?? [] : []
  const isLoadingBrandData = loadingBrandSlugs.has(activeClientTab)
  const isComputing = computingSlugs.has(activeClientTab)
  const activeBrandData = activeClientTab ? brandDataBySlug[activeClientTab] ?? null : null

  // Sorted: most recent order first, then by placement count
  const sortedAccounts = useMemo(() => {
    if (!activeBrandData) return []
    return [...activeBrandData.activityAccounts].sort((a, b) => {
      const aLast = latestOrderDate(activeBrandData.ordersByAccount[a.id] ?? [])
      const bLast = latestOrderDate(activeBrandData.ordersByAccount[b.id] ?? [])
      if (aLast && bLast) return bLast > aLast ? 1 : -1
      if (aLast) return -1
      if (bLast) return 1
      return (activeBrandData.placementsByAccount[b.id] ?? []).length - (activeBrandData.placementsByAccount[a.id] ?? []).length
    })
  }, [activeBrandData])

  // Per-account 90d amounts for activity bar scaling
  const maxAmount90d = useMemo(() => {
    if (!activeBrandData) return 0
    return Math.max(0, ...activeBrandData.activityAccounts.map(a => {
      const orders = activeBrandData.ordersByAccount[a.id] ?? []
      return orders.filter(o => new Date(o.sent_at || o.created_at).getTime() >= NOW_MS - D90_MS)
        .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
    }))
  }, [activeBrandData])

  const summaryStats = useMemo(() => {
    if (!activeBrandData) return { tracked: 0, buyingNow: 0, placements: 0 }
    const tracked = activeBrandData.activityAccounts.length
    const buyingNow = activeBrandData.activityAccounts.filter(a =>
      (activeBrandData.ordersByAccount[a.id] ?? []).some(o => new Date(o.sent_at || o.created_at).getTime() >= NOW_MS - D90_MS)
    ).length
    const placements = Object.values(activeBrandData.placementsByAccount).reduce((sum, pl) => sum + pl.length, 0)
    return { tracked, buyingNow, placements }
  }, [activeBrandData])

  // ── Handlers ─────────────────────────────────────────────────────────────────

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

  async function handleRecompute() {
    if (!activeClientTab) return
    const slug = activeClientTab
    setComputingSlugs(prev => new Set([...prev, slug]))
    try {
      const zone = await getOrCreateZone(slug)
      if (!zone) throw new Error('Could not create tracking record')
      const res = await fetch(`/api/growth/recompute/${zone.id}`, { method: 'POST', signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error((await res.json()).error || 'Recompute failed')
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
      toast('Brand removed from territory')
      if (activeClientTab === removeBrandSlug) setActiveClientTab('')
      setRemoveBrandSlug(null)
      load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <LayoutShell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <span style={{ color: t.text.muted, fontSize: '13px' }}>Loading…</span>
      </div>
    </LayoutShell>
  )

  if (!market) return null

  const clientColor = activeClient?.color || t.gold
  const geoParts = [...(market.cities ?? []).slice(0, 2), ...(market.counties?.map(c => `${c} Co.`) ?? []).slice(0, 1), ...(market.states ?? []).slice(0, 1)].slice(0, 3)
  const trendPct = activeSnap?.volume_trend_pct ?? null
  const trendLabel = trendPct === null ? null : Math.abs(trendPct) < 5 ? null : trendPct > 0 ? `↑${Math.round(trendPct)}%` : `↓${Math.round(Math.abs(trendPct))}%`
  const trendColor = trendPct === null ? t.text.muted : trendPct > 5 ? t.status.success : trendPct < -5 ? t.status.danger : t.text.muted

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <LayoutShell>
      <div style={{ minHeight: '100vh' }}>

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/growth" style={{ fontSize: '12px', color: t.text.muted, textDecoration: 'none', flexShrink: 0 }}>← Growth</Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '17px', fontWeight: '800', color: t.text.primary, margin: 0 }}>{market.name}</h1>
              {market.priority && <span style={{ fontSize: '11px', color: t.gold }}>★ Priority</span>}
              {geoParts.length > 0 && <span style={{ fontSize: '11px', color: t.text.muted }}>{geoParts.join(' · ')}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <button onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: '600', border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.secondary, cursor: 'pointer' }}>
              <Pencil size={12} /> Edit
            </button>
            <button onClick={() => setDeleteMarketModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', borderRadius: '7px', fontSize: '12px', border: `1px solid rgba(232,85,64,0.25)`, backgroundColor: t.status.dangerBg, color: t.status.danger, cursor: 'pointer' }}>
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* ── Brand Tabs ──────────────────────────────────────────────────────── */}
        <div style={{ borderBottom: `1px solid ${t.border.subtle}`, overflowX: 'auto' }}>
          <div style={{ display: 'flex', padding: '0 24px', gap: '2px', minWidth: 'max-content' }}>
            {territoryClients.length === 0 ? (
              <div style={{ padding: '12px 0', fontSize: '12px', color: t.text.muted }}>No brand activity in this territory yet.</div>
            ) : territoryClients.map(client => {
              const isActive = activeClientTab === client.slug
              const snap = (market.zones ?? []).find(z => z.client_slug === client.slug)
              const snpData = snap ? snapshots[snap.id] : undefined
              const logo = clientLogoUrl(client)
              return (
                <button key={client.slug} onClick={() => setActiveClientTab(client.slug)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: isActive ? `2px solid ${client.color || t.gold}` : '2px solid transparent', opacity: isActive ? 1 : 0.5, transition: 'opacity 150ms', flexShrink: 0 }}>
                  {logo ? (
                    <img src={logo} alt={client.name} style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: '4px' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '6px', backgroundColor: (client.color || t.gold) + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: client.color || t.gold }}>{client.name[0]}</div>
                  )}
                  <span style={{ fontSize: '10px', fontWeight: '700', color: isActive ? (client.color || t.gold) : t.text.muted, letterSpacing: '0.04em' }}>
                    {snpData?.health_score != null ? Math.round(snpData.health_score) : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {!activeClientTab && (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: t.text.muted }}>Select a brand above to view performance data</div>
          </div>
        )}

        {activeClientTab && (
          <div style={{ maxWidth: '860px', margin: '0 auto', padding: '20px 24px 60px' }}>

            {/* ── Stat tiles ────────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
              {[
                { label: 'Tracked', value: summaryStats.tracked, sub: 'accounts in territory', color: t.text.secondary, icon: null },
                { label: 'Buying Now', value: summaryStats.buyingNow, sub: 'ordered last 90 days', color: t.status.success, icon: TrendingUp },
                { label: 'On Shelf', value: summaryStats.placements, sub: 'active placements', color: clientColor, icon: null },
              ].map(s => {
                const Icon = s.icon
                return (
                  <div key={s.label} style={{
                    padding: '16px 14px 14px',
                    borderRadius: '12px',
                    background: s.value > 0
                      ? `linear-gradient(135deg, ${s.color}08 0%, transparent 60%), ${t.bg.elevated}`
                      : t.bg.elevated,
                    border: `1px solid ${t.border.default}`,
                    borderTop: `3px solid ${s.value > 0 ? s.color : t.border.default}`,
                    boxShadow: s.value > 0 ? `0 4px 24px ${s.color}10` : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                      <div style={{
                        fontSize: '32px', fontWeight: '900', color: s.value > 0 ? s.color : t.text.muted,
                        lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums',
                        textShadow: s.value > 0 ? `0 0 28px ${s.color}50` : 'none',
                      }}>
                        {isLoadingBrandData ? '—' : s.value}
                      </div>
                      {Icon && s.value > 0 && <Icon size={16} color={s.color} style={{ opacity: 0.6, flexShrink: 0, marginTop: '4px' }} />}
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: s.value > 0 ? s.color : t.text.muted, textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: '6px', opacity: s.value > 0 ? 0.9 : 0.5 }}>{s.label}</div>
                    <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '2px', opacity: 0.5 }}>{s.sub}</div>
                  </div>
                )
              })}
            </div>

            {/* ── Command panel ─────────────────────────────────────────────── */}
            <div style={{
              display: 'flex', gap: '10px', marginBottom: '14px',
              padding: '20px', borderRadius: '14px',
              background: `radial-gradient(ellipse at top left, ${clientColor}07 0%, transparent 55%), ${t.bg.elevated}`,
              border: `1px solid ${clientColor}20`,
              boxShadow: `0 0 40px ${clientColor}08, inset 0 1px 0 ${clientColor}10`,
              flexWrap: 'wrap',
            }}>
              {/* Health */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.7 }}>Territory Health</div>
                <HealthRing score={activeSnap?.health_score ?? null} size={100} strokeWidth={8} />
                {activeSparklines.length > 1 && (
                  <Sparkline data={activeSparklines.map(s => s.health_score)} width={96} height={28} color={healthColor(activeSnap?.health_score ?? null)} />
                )}
                <button
                  onClick={handleRecompute} disabled={isComputing || isLoadingBrandData}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: isComputing ? 'default' : 'pointer', color: t.text.muted, fontSize: '10px', padding: '2px 6px', borderRadius: '5px', opacity: isComputing ? 0.5 : 0.6 }}
                >
                  <RefreshCw size={10} />
                  {isComputing ? 'Computing…' : activeSnap?.computed_at ? (() => { const d = daysSince(activeSnap.computed_at); return d === 0 ? 'Updated today' : d === 1 ? 'Updated yesterday' : `Updated ${d}d ago` })() : 'No data — click to compute'}
                </button>
              </div>

              <div style={{ width: '1px', background: `linear-gradient(to bottom, transparent, ${t.border.subtle}, transparent)`, alignSelf: 'stretch', flexShrink: 0 }} />

              {/* Cases */}
              <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px', padding: '0 6px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.7 }}>Cases · 90 Days</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '52px', fontWeight: '900', color: t.text.primary, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 40px rgba(255,255,255,0.06)' }}>
                    {isLoadingBrandData ? '—' : (activeSnap?.total_cases_90d ?? '—')}
                  </span>
                  {trendLabel && !isLoadingBrandData && (
                    <span style={{ fontSize: '20px', fontWeight: '800', color: trendColor, textShadow: `0 0 20px ${trendColor}60`, display: 'flex', alignItems: 'center', gap: '2px' }}>
                      {trendPct && trendPct > 5 ? <TrendingUp size={16} /> : trendPct && trendPct < -5 ? <TrendingDown size={16} /> : null}
                      {trendLabel}
                    </span>
                  )}
                </div>
                {activeSnap?.cases_prior_90d != null && activeSnap.cases_prior_90d > 0 && activeSnap.total_cases_90d != null && (
                  <div>
                    <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '6px', opacity: 0.6 }}>vs {activeSnap.cases_prior_90d} prior quarter</div>
                    <div style={{ position: 'relative', height: '3px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (activeSnap.total_cases_90d / Math.max(activeSnap.total_cases_90d, activeSnap.cases_prior_90d)) * 100)}%`, backgroundColor: trendColor, borderRadius: '2px', boxShadow: `0 0 10px ${trendColor}` }} />
                    </div>
                  </div>
                )}
                {activeSnap?.accounts_lost != null && activeSnap.accounts_lost > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: t.status.warning }}>
                    <AlertTriangle size={12} />
                    {activeSnap.accounts_lost} account{activeSnap.accounts_lost !== 1 ? 's' : ''} went quiet this quarter
                  </div>
                )}
              </div>
            </div>

            {/* ── Arc Gauges ─────────────────────────────────────────────────── */}
            <div style={{
              display: 'flex', gap: '0', marginBottom: '24px',
              padding: '20px 8px 8px', borderRadius: '14px',
              background: `radial-gradient(ellipse at center top, ${clientColor}05 0%, transparent 60%), ${t.bg.elevated}`,
              border: `1px solid ${t.border.default}`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}>
              <ArcGauge
                label="Activity Rate"
                value={activeSnap?.activity_rate_pct ?? null}
                target={market.default_reach_threshold}
                unit="%"
                note={activeSnap?.active_accounts != null && activeSnap?.total_accounts != null
                  ? `${activeSnap.active_accounts} of ${activeSnap.total_accounts} ordered`
                  : undefined}
              />
              <div style={{ width: '1px', background: `linear-gradient(to bottom, transparent, ${t.border.subtle}, transparent)`, alignSelf: 'stretch', margin: '0 4px' }} />
              <ArcGauge label="Reorder Rate" value={activeSnap?.retention_pct ?? null} target={market.default_retention_threshold} unit="%" />
              <div style={{ width: '1px', background: `linear-gradient(to bottom, transparent, ${t.border.subtle}, transparent)`, alignSelf: 'stretch', margin: '0 4px' }} />
              <ArcGauge
                label="Velocity Index"
                value={activeSnap?.velocity_index ?? null}
                target={100}
                unit=""
                note={activeSnap?.velocity != null ? `${activeSnap.velocity.toFixed(1)} cs/acct/mo` : undefined}
              />
            </div>

            {/* ── Account Monitor ────────────────────────────────────────────── */}
            {!isLoadingBrandData && sortedAccounts.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                {/* Header bar */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '10px', padding: '8px 14px',
                  borderRadius: '8px',
                  background: `linear-gradient(90deg, ${clientColor}08 0%, transparent 80%)`,
                  border: `1px solid ${clientColor}15`,
                }}>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: clientColor, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.9 }}>
                    Account Monitor
                  </span>
                  <span style={{ fontSize: '10px', color: t.text.muted, opacity: 0.6 }}>
                    {sortedAccounts.length} account{sortedAccounts.length !== 1 ? 's' : ''} · by latest order
                  </span>
                </div>

                {/* Column labels */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: '16px', padding: '0 14px 5px 27px', fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>
                  <span>Account</span>
                  <span style={{ textAlign: 'right' }}>Placements</span>
                  <span style={{ textAlign: 'right', minWidth: '72px' }}>90-Day Revenue</span>
                  <span style={{ textAlign: 'right', minWidth: '72px' }}>Last Activity</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {sortedAccounts.map(acct => (
                    <AccountRow
                      key={acct.id}
                      account={acct}
                      orders={activeBrandData!.ordersByAccount[acct.id] ?? []}
                      lastVisit={activeBrandData!.lastVisitByAccount[acct.id]}
                      placements={activeBrandData!.placementsByAccount[acct.id]}
                      clientColor={clientColor}
                      maxAmount={maxAmount90d}
                    />
                  ))}
                </div>
              </div>
            )}

            {isLoadingBrandData && (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <span style={{ fontSize: '12px', color: t.text.muted }}>Loading account data…</span>
              </div>
            )}

            {!isLoadingBrandData && sortedAccounts.length === 0 && (
              <div style={{ padding: '32px 24px', textAlign: 'center', borderRadius: '12px', border: `1px dashed ${t.border.default}`, background: `radial-gradient(ellipse at center, ${clientColor}04 0%, transparent 70%)` }}>
                <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '6px' }}>No activity for this brand in this territory yet.</div>
                <div style={{ fontSize: '11px', color: t.text.muted, opacity: 0.6 }}>
                  {hasGeoTags
                    ? 'Log visits or orders at accounts in this area to start monitoring.'
                    : <><button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.gold, fontWeight: '600', padding: 0, fontSize: '11px' }}>Add cities or zip codes</button> to auto-populate accounts from your CRM.</>
                  }
                </div>
              </div>
            )}

            {/* ── Refresh bar ───────────────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', backgroundColor: t.bg.elevated, border: `1px solid ${t.border.subtle}`, marginTop: '24px' }}>
              <span style={{ fontSize: '11px', color: t.text.muted, opacity: 0.6 }}>
                {activeSnap
                  ? `Last computed: ${new Date(activeSnap.computed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : isComputing ? 'Computing metrics…' : 'Metrics not yet computed'}
              </span>
              <button onClick={handleRecompute} disabled={isComputing}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', cursor: isComputing ? 'default' : 'pointer', border: `1px solid ${t.goldBorder}`, backgroundColor: t.goldDim, color: t.gold, fontWeight: '600', opacity: isComputing ? 0.6 : 1 }}>
                <RefreshCw size={11} /> {isComputing ? 'Computing…' : 'Refresh Metrics'}
              </button>
            </div>

            {activeZone && (
              <button onClick={() => setRemoveBrandSlug(activeClientTab)}
                style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '7px', border: `1px solid rgba(232,85,64,0.3)`, backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '12px', cursor: 'pointer' }}>
                <Trash2 size={12} /> Remove Brand from Territory
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Edit Territory Modal ──────────────────────────────────────────────── */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.page, borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${t.border.default}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary }}>Edit Territory</h2>
              <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button type="button" onClick={() => setEditForm(f => ({ ...f, priority: !f.priority }))}
                  style={{ width: 18, height: 18, borderRadius: '4px', cursor: 'pointer', border: `2px solid ${editForm.priority ? t.gold : t.border.default}`, backgroundColor: editForm.priority ? t.gold : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {editForm.priority && <span style={{ color: '#0f0e0c', fontSize: '11px', fontWeight: '800' }}>✓</span>}
                </button>
                <span style={{ fontSize: '13px', color: t.text.secondary, cursor: 'pointer' }} onClick={() => setEditForm(f => ({ ...f, priority: !f.priority }))}>Priority territory</span>
              </div>
              <div>
                <label style={{ ...labelStyle, marginBottom: '4px', display: 'block' }}>Location search</label>
                <input ref={editGeoInputRef} type="text" placeholder="Search to update geo…" style={inputStyle} />
              </div>
              <TagInput label="Cities" values={editForm.cities} onChange={v => setEditForm(f => ({ ...f, cities: v }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <TagInput label="Counties" values={editForm.counties} onChange={v => setEditForm(f => ({ ...f, counties: v }))} />
                <TagInput label="States" values={editForm.states} onChange={v => setEditForm(f => ({ ...f, states: v }))} />
              </div>
              <TagInput label="Zip Codes" values={editForm.zip_codes} onChange={v => setEditForm(f => ({ ...f, zip_codes: v }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Activity Target (%)</label>
                  <input type="number" min="0" max="100" value={editForm.default_reach_threshold}
                    onChange={e => setEditForm(f => ({ ...f, default_reach_threshold: Number(e.target.value) }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Retention Target (%)</label>
                  <input type="number" min="0" max="100" value={editForm.default_retention_threshold}
                    onChange={e => setEditForm(f => ({ ...f, default_retention_threshold: Number(e.target.value) }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setEditing(false)} style={btnSecondary}>Cancel</button>
              <button onClick={handleSaveMarket} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteMarketModal}
        title="Delete territory?"
        message={`Delete "${market.name}"? This will also remove all brand tracking data for this territory.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDeleteMarket}
        onClose={() => setDeleteMarketModal(false)}
      />

      <ConfirmModal
        isOpen={!!removeBrandSlug}
        title="Remove brand from territory?"
        message={`Remove ${clients.find(c => c.slug === removeBrandSlug)?.name ?? 'this brand'} from ${market.name}? Metric history will be deleted.`}
        confirmLabel="Remove"
        danger
        onConfirm={handleRemoveBrand}
        onClose={() => setRemoveBrandSlug(null)}
      />
    </LayoutShell>
  )
}

export default function MarketDetailPage() {
  return <Suspense><MarketDetailContent /></Suspense>
}
