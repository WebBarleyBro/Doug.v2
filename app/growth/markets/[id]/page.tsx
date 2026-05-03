'use client'
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Trash2, X, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react'
import LayoutShell, { useToast } from '../../../layout-shell'
import ConfirmModal from '../../../components/ConfirmModal'
import { t, inputStyle, labelStyle, btnPrimary, btnSecondary } from '../../../lib/theme'
import { getClients, getAccounts } from '../../../lib/data'
import { clientLogoUrl } from '../../../lib/constants'
import { getSupabase } from '../../../lib/supabase'
import { matchesGeoTerms } from '../../../lib/concentric/geo'
import {
  getMarket, updateMarket, deleteMarket,
  createZone,
  getLatestSnapshotsByZone, getZoneSnapshots,
} from '../../../lib/concentric/data'
import { HealthRing, Sparkline, healthColor, CompactGauge } from '../../_components'
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

function getAccountStatus(orders: OrderData[]): 'active' | 'lapsed' | 'dormant' | 'untouched' {
  if (!orders.length) return 'untouched'
  const latest = Math.max(...orders.map(o => new Date(o.sent_at || o.created_at).getTime()))
  if (latest >= NOW_MS - D90_MS) return 'active'
  if (latest >= NOW_MS - D180_MS) return 'lapsed'
  return 'dormant'
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
  const status = getAccountStatus(orders)
  const orders90d = orders.filter(o => new Date(o.sent_at || o.created_at).getTime() >= NOW_MS - D90_MS)
  const amount90d = orders90d.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
  const lastOrderDate = latestOrderDate(orders)
  const activePlacements = (placements ?? []).length
  const barPct = maxAmount > 0 ? Math.round((amount90d / maxAmount) * 100) : 0

  const signalColor = status === 'active' ? t.status.success
    : status === 'lapsed' ? t.status.warning
    : status === 'dormant' ? t.status.danger
    : 'rgba(255,255,255,0.12)'

  return (
    <Link href={`/accounts/${account.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          padding: '9px 12px 7px',
          borderRadius: '8px',
          backgroundColor: hovered ? 'rgba(255,255,255,0.025)' : 'transparent',
          borderLeft: `2px solid ${signalColor}`,
          cursor: 'pointer',
          transition: 'background 80ms',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px 80px', alignItems: 'center', gap: '12px' }}>
          {/* Name + meta */}
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, backgroundColor: signalColor, boxShadow: status === 'active' ? `0 0 6px ${signalColor}` : 'none' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: status === 'untouched' ? '500' : '700', color: status === 'untouched' ? t.text.muted : t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {account.name}
              </div>
              <div style={{ fontSize: '10px', color: t.text.muted, opacity: 0.35, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span>{account.account_type === 'on_premise' ? 'On-Prem' : account.account_type === 'off_premise' ? 'Off-Prem' : ''}</span>
                {activePlacements > 0 && <span style={{ color: clientColor, opacity: 0.9, fontWeight: '700' }}>{activePlacements} placed</span>}
              </div>
            </div>
          </div>

          {/* Primary metric */}
          <div style={{ textAlign: 'right' }}>
            {status === 'active' ? (
              <>
                <div style={{ fontSize: '13px', fontWeight: '800', color: t.status.success, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 12px ${t.status.success}30` }}>
                  {amount90d > 0 ? formatCurrency(amount90d) : `${orders90d.length} order${orders90d.length !== 1 ? 's' : ''}`}
                </div>
                <div style={{ fontSize: '9px', color: t.text.muted, opacity: 0.35 }}>90d revenue</div>
              </>
            ) : lastOrderDate ? (
              <>
                <div style={{ fontSize: '12px', fontWeight: '700', color: signalColor }}>{relativeDate(lastOrderDate)}</div>
                <div style={{ fontSize: '9px', color: t.text.muted, opacity: 0.35 }}>last order</div>
              </>
            ) : lastVisit ? (
              <>
                <div style={{ fontSize: '12px', color: t.text.muted }}>{relativeDate(lastVisit.visited_at)}</div>
                <div style={{ fontSize: '9px', color: t.text.muted, opacity: 0.35 }}>last visit</div>
              </>
            ) : (
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.1)' }}>—</div>
            )}
          </div>

          {/* Secondary metric */}
          <div style={{ textAlign: 'right' }}>
            {status === 'active' ? (
              <>
                <div style={{ fontSize: '11px', color: t.text.muted }}>{relativeDate(lastOrderDate)}</div>
                <div style={{ fontSize: '9px', color: t.text.muted, opacity: 0.35 }}>last order</div>
              </>
            ) : lastVisit ? (
              <>
                <div style={{ fontSize: '11px', color: t.text.muted }}>{relativeDate(lastVisit.visited_at)}</div>
                <div style={{ fontSize: '9px', color: t.text.muted, opacity: 0.35 }}>last visit</div>
              </>
            ) : (
              <div style={{ fontSize: '11px', color: '#2a2a2a' }}>—</div>
            )}
          </div>
        </div>

        {status === 'active' && barPct > 0 && (
          <div style={{ marginTop: '6px', marginLeft: '14px', height: '2px', borderRadius: '1px', backgroundColor: 'rgba(255,255,255,0.04)', position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barPct}%`, borderRadius: '1px', backgroundColor: t.status.success, opacity: 0.65, boxShadow: `0 0 6px ${t.status.success}` }} />
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
  const [activeSegment, setActiveSegment] = useState<'all' | 'active' | 'lapsed' | 'dormant' | 'untouched'>('all')

  const [activeClientTab, setActiveClientTab] = useState<string>('')
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

  const groupedAccounts = useMemo(() => {
    const empty = { active: [] as Account[], lapsed: [] as Account[], dormant: [] as Account[], untouched: [] as Account[] }
    if (!activeBrandData) return empty
    const groups = { active: [] as Account[], lapsed: [] as Account[], dormant: [] as Account[], untouched: [] as Account[] }
    for (const a of activeBrandData.activityAccounts) {
      groups[getAccountStatus(activeBrandData.ordersByAccount[a.id] ?? [])].push(a)
    }
    const rev90 = (a: Account) => (activeBrandData.ordersByAccount[a.id] ?? [])
      .filter(o => new Date(o.sent_at || o.created_at).getTime() >= NOW_MS - D90_MS)
      .reduce((s, o) => s + (Number(o.total_amount) || 0), 0)
    const lastOrderMs = (a: Account) => { const d = latestOrderDate(activeBrandData.ordersByAccount[a.id] ?? []); return d ? new Date(d).getTime() : 0 }
    const lastVisitMs = (a: Account) => { const v = activeBrandData.lastVisitByAccount[a.id]; return v ? new Date(v.visited_at).getTime() : 0 }
    groups.active.sort((a, b) => rev90(b) - rev90(a))
    groups.lapsed.sort((a, b) => lastOrderMs(a) - lastOrderMs(b))
    groups.dormant.sort((a, b) => lastOrderMs(a) - lastOrderMs(b))
    groups.untouched.sort((a, b) => lastVisitMs(b) - lastVisitMs(a))
    return groups
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
    if (!activeBrandData) return { tracked: 0, buyingNow: 0, placements: 0, revenue90d: 0 }
    const tracked = activeBrandData.activityAccounts.length
    const buyingNow = activeBrandData.activityAccounts.filter(a =>
      (activeBrandData.ordersByAccount[a.id] ?? []).some(o => new Date(o.sent_at || o.created_at).getTime() >= NOW_MS - D90_MS)
    ).length
    const placements = Object.values(activeBrandData.placementsByAccount).reduce((sum, pl) => sum + pl.length, 0)
    const revenue90d = activeBrandData.activityAccounts.reduce((sum, a) => {
      return sum + (activeBrandData.ordersByAccount[a.id] ?? [])
        .filter(o => new Date(o.sent_at || o.created_at).getTime() >= NOW_MS - D90_MS)
        .reduce((s, o) => s + (Number(o.total_amount) || 0), 0)
    }, 0)
    return { tracked, buyingNow, placements, revenue90d }
  }, [activeBrandData])

  const statusBreakdown = useMemo(() => {
    if (!activeBrandData) return { active: 0, lapsed: 0, dormant: 0, untouched: 0 }
    let active = 0, lapsed = 0, dormant = 0, untouched = 0
    for (const a of activeBrandData.activityAccounts) {
      const s = getAccountStatus(activeBrandData.ordersByAccount[a.id] ?? [])
      if (s === 'active') active++
      else if (s === 'lapsed') lapsed++
      else if (s === 'dormant') dormant++
      else untouched++
    }
    return { active, lapsed, dormant, untouched }
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
            <button onClick={() => setActiveClientTab('')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: activeClientTab === '' ? `2px solid ${t.gold}` : '2px solid transparent', opacity: activeClientTab === '' ? 1 : 0.45, transition: 'opacity 150ms', flexShrink: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: '6px', backgroundColor: activeClientTab === '' ? t.goldDim : 'rgba(255,255,255,0.04)', border: `1px solid ${activeClientTab === '' ? t.goldBorder : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: activeClientTab === '' ? t.gold : t.text.muted }}>⊞</div>
              <span style={{ fontSize: '10px', fontWeight: '700', color: activeClientTab === '' ? t.gold : t.text.muted, letterSpacing: '0.04em' }}>All</span>
            </button>
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
          <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 24px 60px' }}>

            {/* ── Territory stats strip ──────────────────────────────────── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0',
              marginBottom: '28px', borderRadius: '14px', overflow: 'hidden',
              border: `1px solid ${t.border.default}`,
              background: t.bg.elevated,
            }}>
              {[
                { value: territoryAccounts.length, label: 'Accounts in Territory' },
                { value: territoryClients.length, label: 'Brands Active' },
                { value: Object.keys(brandActivity).length, label: 'Accounts Touched (any brand, all time)' },
              ].map((s, i) => (
                <div key={i} style={{
                  flex: 1, padding: '20px 24px', textAlign: 'center',
                  borderRight: i < 2 ? `1px solid ${t.border.subtle}` : 'none',
                }}>
                  <div style={{ fontSize: '36px', fontWeight: '900', color: s.value > 0 ? t.text.primary : '#2a2a2a', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: '6px', opacity: 0.55 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* ── Brand cards ────────────────────────────────────────────── */}
            {territoryClients.length > 0 ? (
              <>
                <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: '12px', opacity: 0.45 }}>
                  Brands · Click to Drill In
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '10px', marginBottom: '36px' }}>
                  {territoryClients.map(client => {
                    const zone = (market.zones ?? []).find(z => z.client_slug === client.slug)
                    const snap = zone ? snapshots[zone.id] ?? null : null
                    const acctCount = Object.entries(brandActivity).filter(([, slugs]) => slugs.includes(client.slug)).length
                    const color = client.color || t.gold
                    const logo = clientLogoUrl(client)
                    const cases = snap?.total_cases_90d ?? null
                    const trend = snap?.volume_trend_pct ?? null
                    const tColor = trend !== null && trend > 5 ? t.status.success : trend !== null && trend < -5 ? t.status.danger : t.text.muted
                    return (
                      <button key={client.slug} onClick={() => setActiveClientTab(client.slug)}
                        style={{ textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', padding: 0, borderRadius: '14px', display: 'block', width: '100%' }}>
                        <div style={{
                          padding: '20px', borderRadius: '14px',
                          background: `radial-gradient(ellipse at top left, ${color}12 0%, transparent 60%), ${t.bg.elevated}`,
                          border: `1px solid ${color}30`,
                          borderTop: `3px solid ${color}`,
                          boxShadow: `0 0 40px ${color}06`,
                          display: 'flex', flexDirection: 'column', gap: '16px',
                          transition: 'box-shadow 150ms',
                        }}>
                          {/* Brand identity */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {logo ? (
                              <img src={logo} alt={client.name} style={{ width: 30, height: 30, objectFit: 'contain', borderRadius: '5px' }} />
                            ) : (
                              <div style={{ width: 30, height: 30, borderRadius: '7px', backgroundColor: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '900', color }}>{client.name[0]}</div>
                            )}
                            <span style={{ fontSize: '13px', fontWeight: '800', color: t.text.primary }}>{client.name}</span>
                          </div>

                          {/* Health + volume */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <HealthRing score={snap?.health_score ?? null} size={68} strokeWidth={6} />
                            <div>
                              <div style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6, marginBottom: '4px' }}>Cases 90d</div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                <span style={{ fontSize: '26px', fontWeight: '900', color: cases !== null ? t.text.primary : '#2a2a2a', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                                  {cases ?? '—'}
                                </span>
                                {trend !== null && Math.abs(trend) >= 5 && (
                                  <span style={{ fontSize: '12px', fontWeight: '700', color: tColor }}>
                                    {trend > 0 ? '↑' : '↓'}{Math.abs(Math.round(trend))}%
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '2px', opacity: 0.5 }}>
                                {acctCount} account{acctCount !== 1 ? 's' : ''}{!snap ? ' · tap Refresh after opening' : ''}
                              </div>
                            </div>
                          </div>

                          {/* Footer CTA */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color, opacity: 0.75 }}>View brand detail</span>
                            <ChevronRight size={14} color={color} style={{ opacity: 0.55 }} />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', borderRadius: '12px', border: `1px dashed ${t.border.default}`, marginBottom: '28px' }}>
                <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '6px' }}>No brand activity recorded in this territory yet.</div>
                <div style={{ fontSize: '11px', color: t.text.muted, opacity: 0.6 }}>
                  {hasGeoTags
                    ? 'Log visits or orders at accounts in this area to start tracking.'
                    : <><button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.gold, fontWeight: '600', padding: 0, fontSize: '11px' }}>Add cities or zip codes</button> to auto-populate accounts.</>
                  }
                </div>
              </div>
            )}

            {/* ── All territory accounts ─────────────────────────────────── */}
            {territoryAccounts.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.45 }}>All Territory Accounts</span>
                  <span style={{ fontSize: '10px', color: t.text.muted, opacity: 0.35 }}>{territoryAccounts.length} total</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {territoryAccounts.slice(0, 40).map(acct => {
                    const activeBrands = brandActivity[acct.id] ?? []
                    return (
                      <Link key={acct.id} href={`/accounts/${acct.id}`} style={{ textDecoration: 'none' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '9px 14px', borderRadius: '8px',
                          border: `1px solid ${activeBrands.length > 0 ? t.border.subtle : 'rgba(255,255,255,0.03)'}`,
                          backgroundColor: 'transparent',
                          transition: 'background 100ms',
                        }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: activeBrands.length > 0 ? t.status.success : '#2a2a2a', boxShadow: activeBrands.length > 0 ? `0 0 6px ${t.status.success}` : 'none', flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: '13px', fontWeight: activeBrands.length > 0 ? '700' : '500', color: activeBrands.length > 0 ? t.text.primary : t.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acct.name}</span>
                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                            {activeBrands.slice(0, 4).map(slug => {
                              const cl = clients.find(c => c.slug === slug)
                              const logo = cl ? clientLogoUrl(cl) : null
                              const color = cl?.color || t.gold
                              return logo ? (
                                <img key={slug} src={logo} alt={slug} title={cl?.name} style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: '3px', opacity: 0.75 }} />
                              ) : (
                                <span key={slug} title={cl?.name ?? slug} style={{ width: 18, height: 18, borderRadius: '4px', backgroundColor: color + '22', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '900', color }}>{(cl?.name ?? slug)[0].toUpperCase()}</span>
                              )
                            })}
                            {activeBrands.length > 4 && <span style={{ fontSize: '10px', color: t.text.muted, opacity: 0.5 }}>+{activeBrands.length - 4}</span>}
                          </div>
                          <span style={{ fontSize: '10px', color: t.text.muted, opacity: 0.4, flexShrink: 0, minWidth: '52px', textAlign: 'right' }}>{acct.account_type === 'on_premise' ? 'On-Prem' : acct.account_type === 'off_premise' ? 'Off-Prem' : ''}</span>
                        </div>
                      </Link>
                    )
                  })}
                  {territoryAccounts.length > 40 && (
                    <div style={{ padding: '10px', textAlign: 'center', fontSize: '11px', color: t.text.muted, opacity: 0.4 }}>
                      +{territoryAccounts.length - 40} more accounts in territory
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeClientTab && (
          <div style={{ display: 'flex', minHeight: 'calc(100vh - 116px)' }}>

            {/* ── Left Sidebar ── */}
            <div style={{
              width: '268px', flexShrink: 0,
              borderRight: `1px solid ${t.border.subtle}`,
              background: `radial-gradient(ellipse at top, ${clientColor}08 0%, transparent 55%), ${t.bg.elevated}`,
              position: 'sticky', top: 0, alignSelf: 'flex-start',
              maxHeight: 'calc(100vh - 116px)', overflowY: 'auto',
              padding: '18px 16px',
              display: 'flex', flexDirection: 'column', gap: '16px',
            }}>

              {/* Brand identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '14px', borderBottom: `1px solid ${clientColor}20` }}>
                {(() => {
                  const logo = activeClient ? clientLogoUrl(activeClient) : null
                  return logo
                    ? <img src={logo} alt={activeClient?.name} style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: '6px', flexShrink: 0 }} />
                    : <div style={{ width: 32, height: 32, borderRadius: '7px', backgroundColor: clientColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '900', color: clientColor, flexShrink: 0 }}>{activeClient?.name?.[0] ?? '?'}</div>
                })()}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: clientColor, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeClient?.name}</div>
                  <div style={{ fontSize: '10px', color: t.text.muted, opacity: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{geoParts.join(' · ') || market.name}</div>
                </div>
              </div>

              {/* Revenue hero */}
              {!isLoadingBrandData && (
                <div style={{ padding: '16px 14px', borderRadius: '12px', background: `linear-gradient(135deg, ${t.gold}0e 0%, transparent 55%), rgba(0,0,0,0.28)`, border: `1px solid ${t.goldBorder}` }}>
                  <div style={{ fontSize: '9px', fontWeight: '700', color: t.gold, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.65, marginBottom: '5px' }}>Revenue · 90 Days</div>
                  <div style={{ fontSize: summaryStats.revenue90d >= 10000 ? '28px' : '34px', fontWeight: '900', color: summaryStats.revenue90d > 0 ? t.gold : '#2a2a2a', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, textShadow: summaryStats.revenue90d > 0 ? `0 0 30px ${t.gold}40` : 'none' }}>
                    {summaryStats.revenue90d > 0 ? formatCurrency(summaryStats.revenue90d) : '—'}
                  </div>
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${t.gold}18`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '20px', fontWeight: '900', color: summaryStats.buyingNow > 0 ? t.status.success : '#333', fontVariantNumeric: 'tabular-nums', textShadow: summaryStats.buyingNow > 0 ? `0 0 10px ${t.status.success}40` : 'none' }}>{summaryStats.buyingNow}</span>
                    <span style={{ fontSize: '10px', color: t.text.muted, opacity: 0.5 }}>of {summaryStats.tracked} buying</span>
                    {summaryStats.buyingNow > 0 && summaryStats.tracked > 0 && (
                      <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: '800', color: t.status.success, textShadow: `0 0 10px ${t.status.success}30` }}>
                        {Math.round(summaryStats.buyingNow / summaryStats.tracked * 100)}%
                      </span>
                    )}
                  </div>
                  {summaryStats.placements > 0 && (
                    <div style={{ marginTop: '6px', fontSize: '10px', color: clientColor, opacity: 0.8, fontWeight: '600' }}>
                      {summaryStats.placements} active placement{summaryStats.placements !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )}

              {/* Account pipeline — clickable, filters the right panel */}
              {!isLoadingBrandData && summaryStats.tracked > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.4, marginBottom: '4px' }}>Account Pipeline</div>
                  {([
                    { count: statusBreakdown.active,   label: 'Active buyers',        color: t.status.success,           glow: true,  seg: 'active'    as const },
                    { count: statusBreakdown.lapsed,   label: 'Need re-engagement',   color: t.status.warning,            glow: false, seg: 'lapsed'    as const },
                    { count: statusBreakdown.dormant,  label: 'Dormant >180d',        color: t.status.danger,             glow: false, seg: 'dormant'   as const },
                    { count: statusBreakdown.untouched,label: 'Never ordered',        color: 'rgba(255,255,255,0.25)',    glow: false, seg: 'untouched' as const },
                  ]).map(row => (
                    <button key={row.seg} onClick={() => setActiveSegment(row.seg)} style={{
                      background: activeSegment === row.seg ? `${row.color}10` : 'none',
                      border: `1px solid ${activeSegment === row.seg ? row.color + '30' : 'transparent'}`,
                      borderRadius: '7px', cursor: 'pointer', width: '100%', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '7px 8px', transition: 'background 100ms',
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: row.color, boxShadow: row.glow && row.count > 0 ? `0 0 6px ${row.color}` : 'none', flexShrink: 0 }} />
                      <span style={{ fontSize: '20px', fontWeight: '900', color: row.count > 0 ? row.color : '#2a2a2a', fontVariantNumeric: 'tabular-nums', lineHeight: 1, minWidth: '24px', textShadow: row.glow && row.count > 0 ? `0 0 10px ${row.color}50` : 'none' }}>{row.count}</span>
                      <span style={{ fontSize: '10px', color: row.count > 0 ? t.text.secondary : t.text.muted, opacity: row.count > 0 ? 0.75 : 0.3 }}>{row.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Health + Cases (secondary — only shown when snapshot exists) */}
              {activeSnap && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: `1px solid ${clientColor}15` }}>
                  <HealthRing score={activeSnap.health_score ?? null} size={52} strokeWidth={5} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5, marginBottom: '2px' }}>Cases · 90d</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontSize: '26px', fontWeight: '900', color: activeSnap.total_cases_90d ? t.text.primary : '#2a2a2a', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                        {activeSnap.total_cases_90d ?? '—'}
                      </span>
                      {trendLabel && <span style={{ fontSize: '12px', fontWeight: '800', color: trendColor, textShadow: `0 0 8px ${trendColor}40` }}>{trendLabel}</span>}
                    </div>
                    {activeSparklines.length > 1 && (
                      <div style={{ marginTop: '4px' }}>
                        <Sparkline data={activeSparklines.map(s => s.health_score)} width={80} height={14} color={healthColor(activeSnap?.health_score ?? null)} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Computed performance gauges */}
              {activeSnap ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '14px', borderTop: `1px solid ${t.border.subtle}` }}>
                  <div style={{ fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.4 }}>Computed Metrics</div>
                  <CompactGauge label="Activity Rate" value={activeSnap.activity_rate_pct ?? null} target={market.default_reach_threshold}
                    note={activeSnap.active_accounts != null && activeSnap.total_accounts != null ? `${activeSnap.active_accounts} of ${activeSnap.total_accounts} ordered` : undefined} />
                  <CompactGauge label="Reorder Rate" value={activeSnap.retention_pct ?? null} target={market.default_retention_threshold} />
                  <CompactGauge label="Velocity Index" value={activeSnap.velocity_index ?? null} target={100} unit=""
                    note={activeSnap.velocity != null ? `${activeSnap.velocity.toFixed(1)} cs/acct/mo` : undefined} />
                </div>
              ) : !isComputing && activeBrandData && activeBrandData.activityAccounts.length > 0 ? (
                <div style={{ padding: '12px', borderRadius: '9px', border: `1px dashed ${clientColor}25`, background: `${clientColor}04` }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: t.text.secondary, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={11} color={t.text.muted} style={{ opacity: 0.5 }} /> No computed metrics
                  </div>
                  <div style={{ fontSize: '10px', color: t.text.muted, opacity: 0.55 }}>Tap Refresh to score this territory from CRM data.</div>
                </div>
              ) : null}

              {/* Refresh */}
              <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: `1px solid ${t.border.subtle}` }}>
                <button onClick={handleRecompute} disabled={isComputing || isLoadingBrandData}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '11px', cursor: isComputing ? 'default' : 'pointer', border: `1px solid ${t.goldBorder}`, backgroundColor: t.goldDim, color: t.gold, fontWeight: '700', opacity: isComputing || isLoadingBrandData ? 0.6 : 1 }}>
                  <RefreshCw size={11} /> {isComputing ? 'Computing…' : 'Refresh Analytics'}
                </button>
                <div style={{ fontSize: '10px', color: t.text.muted, opacity: 0.35, textAlign: 'center', marginTop: '7px' }}>
                  {activeSnap?.computed_at
                    ? (() => { const d = daysSince(activeSnap.computed_at); return d === 0 ? 'Updated today' : d === 1 ? 'Updated yesterday' : `Updated ${d}d ago` })()
                    : isComputing ? 'Computing…' : 'Not yet computed'}
                </div>
              </div>
            </div>

            {/* ── Right Panel ── */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

              {isLoadingBrandData && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
                  <span style={{ fontSize: '12px', color: t.text.muted }}>Loading account data…</span>
                </div>
              )}

              {!isLoadingBrandData && (activeBrandData?.activityAccounts.length ?? 0) === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                  <div style={{ textAlign: 'center', borderRadius: '12px', border: `1px dashed ${t.border.default}`, padding: '48px 40px', background: `radial-gradient(ellipse at center, ${clientColor}04 0%, transparent 70%)` }}>
                    <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '6px' }}>No CRM activity for {activeClient?.name} in this territory.</div>
                    <div style={{ fontSize: '11px', color: t.text.muted, opacity: 0.6 }}>
                      {hasGeoTags
                        ? 'Log visits or orders at accounts in this area to start monitoring.'
                        : <><button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.gold, fontWeight: '600', padding: 0, fontSize: '11px' }}>Add cities or zip codes</button> to geo-match accounts.</>}
                    </div>
                  </div>
                </div>
              )}

              {!isLoadingBrandData && (activeBrandData?.activityAccounts.length ?? 0) > 0 && (
                <>
                  {/* ── Segment navigation ── */}
                  <div style={{ display: 'flex', borderBottom: `1px solid ${t.border.subtle}`, overflowX: 'auto', flexShrink: 0 }}>
                    {([
                      { key: 'all'       as const, label: 'All',       count: summaryStats.tracked,       color: t.text.muted,                 sub: null },
                      { key: 'active'    as const, label: 'Buying',    count: statusBreakdown.active,     color: t.status.success,             sub: statusBreakdown.active > 0 ? formatCurrency(summaryStats.revenue90d) : null },
                      { key: 'lapsed'    as const, label: 'Lapsed',    count: statusBreakdown.lapsed,     color: t.status.warning,             sub: '90–180d silent' },
                      { key: 'dormant'   as const, label: 'Dormant',   count: statusBreakdown.dormant,    color: t.status.danger,              sub: '>180d silent' },
                      { key: 'untouched' as const, label: 'No Orders', count: statusBreakdown.untouched,  color: 'rgba(255,255,255,0.35)',      sub: 'convert' },
                    ]).map(seg => {
                      const isActive = activeSegment === seg.key
                      const hasData = seg.count > 0
                      return (
                        <button key={seg.key} onClick={() => setActiveSegment(seg.key)} style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                          padding: '12px 22px 10px', background: 'none', border: 'none', cursor: 'pointer',
                          borderBottom: isActive ? `2px solid ${seg.color}` : '2px solid transparent',
                          opacity: isActive ? 1 : hasData ? 0.5 : 0.2,
                          transition: 'opacity 150ms', minWidth: '76px', flexShrink: 0,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                            <span style={{ fontSize: '22px', fontWeight: '900', color: isActive ? seg.color : (hasData ? seg.color : '#2a2a2a'), fontVariantNumeric: 'tabular-nums', lineHeight: 1, textShadow: isActive && hasData ? `0 0 18px ${seg.color}55` : 'none' }}>
                              {seg.count}
                            </span>
                            <span style={{ fontSize: '9px', fontWeight: '700', color: isActive ? seg.color : t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: isActive ? 0.7 : 0.4 }}>
                              {seg.label}
                            </span>
                          </div>
                          {seg.sub != null && (
                            <div style={{ fontSize: '10px', color: isActive ? seg.color : t.text.muted, opacity: isActive ? 0.65 : 0.3, marginTop: '2px', whiteSpace: 'nowrap' }}>
                              {seg.sub}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* ── Account groups ── */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 60px' }}>
                    {(() => {
                      const SEG_CONFIG = {
                        active:    { label: 'ACTIVE BUYERS',       color: t.status.success,          sub: 'Ordered in the last 90 days' },
                        lapsed:    { label: 'NEEDS RE-ENGAGEMENT', color: t.status.warning,           sub: 'Last order 90–180 days ago' },
                        dormant:   { label: 'DORMANT',             color: t.status.danger,            sub: 'No orders in 180+ days' },
                        untouched: { label: 'CONVERSION PIPELINE', color: 'rgba(255,255,255,0.3)',   sub: 'Visited but never ordered' },
                      }
                      const visibleSegs: Array<'active' | 'lapsed' | 'dormant' | 'untouched'> =
                        activeSegment === 'all'
                          ? (['active', 'lapsed', 'dormant', 'untouched'] as const).filter(s => groupedAccounts[s].length > 0)
                          : groupedAccounts[activeSegment].length > 0 ? [activeSegment] : []

                      if (visibleSegs.length === 0) {
                        return (
                          <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', color: t.text.muted, opacity: 0.5 }}>
                            No accounts in this segment.
                          </div>
                        )
                      }

                      return visibleSegs.map(seg => {
                        const accounts = groupedAccounts[seg]
                        const cfg = SEG_CONFIG[seg]
                        const segRev = seg === 'active' ? summaryStats.revenue90d : 0
                        return (
                          <div key={seg} style={{ marginBottom: '24px' }}>
                            {/* Section header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', paddingBottom: '8px', borderBottom: `1px solid ${cfg.color}22` }}>
                              <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: cfg.color, boxShadow: seg === 'active' ? `0 0 7px ${cfg.color}` : 'none', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '10px', fontWeight: '800', color: cfg.color, letterSpacing: '0.1em' }}>{cfg.label}</span>
                                <span style={{ fontSize: '10px', color: t.text.muted, opacity: 0.4, marginLeft: '8px' }}>{cfg.sub}</span>
                              </div>
                              <span style={{ fontSize: '10px', color: t.text.muted, opacity: 0.45, flexShrink: 0 }}>{accounts.length} acct{accounts.length !== 1 ? 's' : ''}</span>
                              {segRev > 0 && <span style={{ fontSize: '13px', fontWeight: '800', color: t.status.success, textShadow: `0 0 10px ${t.status.success}30`, flexShrink: 0 }}>{formatCurrency(segRev)}</span>}
                            </div>

                            {/* Column headers */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px 80px', gap: '12px', padding: '0 12px 5px 22px', fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35 }}>
                              <span>Account</span>
                              <span style={{ textAlign: 'right' }}>{seg === 'active' ? '90d Revenue' : seg === 'untouched' ? 'Last Visit' : 'Last Order'}</span>
                              <span style={{ textAlign: 'right' }}>{seg === 'active' ? 'Last Order' : 'Last Visit'}</span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              {accounts.map(acct => (
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
                        )
                      })
                    })()}
                  </div>
                </>
              )}
            </div>
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
    </LayoutShell>
  )
}

export default function MarketDetailPage() {
  return <Suspense><MarketDetailContent /></Suspense>
}
