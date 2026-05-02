'use client'
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, Trash2, X, Search, RefreshCw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
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
import { HealthRing, ArcGauge, MetricTile, Sparkline, healthColor } from '../../_components'
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

type OrderData = { status: string; total_amount: number | null; sent_at: string | null; created_at: string }
type AccountStatus = 'active' | 'lapsed' | 'dormant' | 'untouched'

interface BrandData {
  activityAccounts: Account[]
  placementsByAccount: Record<string, { product_name: string; status: string }[]>
  lastVisitByAccount: Record<string, { visited_at: string; status: string }>
  ordersByAccount: Record<string, OrderData[]>
}

interface ZoneDetail {
  targets: { id: string; account_id: string; accounts: Account | null }[]
  lastVisitByAccount: Record<string, { visited_at: string; status: string }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW_MS = Date.now()
const D90_MS = 90 * 86400000
const D180_MS = 180 * 86400000

function classifyAccount(orders: OrderData[]): AccountStatus {
  if (!orders.length) return 'untouched'
  const latest = Math.max(...orders.map(o => new Date(o.sent_at || o.created_at).getTime()))
  if (latest >= NOW_MS - D90_MS) return 'active'
  if (latest >= NOW_MS - D180_MS) return 'lapsed'
  return 'dormant'
}

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

// ─── Account Card ─────────────────────────────────────────────────────────────

function AccountCard({
  account,
  status,
  orders,
  lastVisit,
  placements,
  clientColor,
  onRemove,
}: {
  account: Account
  status: AccountStatus
  orders: OrderData[]
  lastVisit?: { visited_at: string; status: string }
  placements?: { product_name: string; status: string }[]
  clientColor: string
  onRemove?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const lastOrderDate = latestOrderDate(orders)
  const daysSinceOrder = daysSince(lastOrderDate)
  const daysSinceVisit = lastVisit ? daysSince(lastVisit.visited_at) : null
  const recentOrders = orders.filter(o => {
    const d = new Date(o.sent_at || o.created_at).getTime()
    return d >= NOW_MS - D90_MS
  })

  const statusDot = {
    active: t.status.success,
    lapsed: t.status.warning,
    dormant: t.status.danger,
    untouched: t.text.muted,
  }[status]

  const borderAccent = status === 'lapsed' ? t.status.warning
    : status === 'active' ? clientColor
    : t.border.default

  return (
    <div style={{ position: 'relative' }}>
      <Link href={`/accounts/${account.id}`} style={{ textDecoration: 'none', display: 'block' }}>
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            padding: '12px 14px',
            borderRadius: '9px',
            backgroundColor: t.bg.elevated,
            border: `1px solid ${hovered ? borderAccent + '80' : t.border.default}`,
            borderLeft: `3px solid ${borderAccent}`,
            cursor: 'pointer',
            transition: 'border-color 150ms',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: statusDot, flexShrink: 0, marginTop: '5px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</span>
                <ChevronRight size={12} color={t.text.muted} style={{ flexShrink: 0 }} />
              </div>

              {/* Status line */}
              {status === 'lapsed' && daysSinceOrder !== null && (
                <div style={{ fontSize: '11px', color: t.status.warning, fontWeight: '600', marginBottom: '3px' }}>
                  No orders in {daysSinceOrder} days · {orders.length} lifetime order{orders.length !== 1 ? 's' : ''}
                </div>
              )}
              {status === 'active' && (
                <div style={{ fontSize: '11px', color: t.status.success, marginBottom: '3px' }}>
                  {recentOrders.length > 0
                    ? `${recentOrders.length} order${recentOrders.length !== 1 ? 's' : ''} this quarter`
                    : `Last ordered ${daysSinceOrder}d ago`}
                  {placements && placements.length > 0 && <span style={{ color: t.text.muted }}> · {placements.length} placement{placements.length !== 1 ? 's' : ''}</span>}
                </div>
              )}
              {status === 'dormant' && daysSinceOrder !== null && (
                <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '3px' }}>
                  Last ordered {Math.round(daysSinceOrder / 30)} months ago · {orders.length} lifetime order{orders.length !== 1 ? 's' : ''}
                </div>
              )}
              {status === 'untouched' && (
                <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '3px' }}>
                  {placements && placements.length > 0
                    ? `${placements.length} placement${placements.length !== 1 ? 's' : ''} · no orders yet`
                    : 'No orders yet'}
                </div>
              )}

              {/* Visit line */}
              <div style={{ fontSize: '10px', color: t.text.muted }}>
                {daysSinceVisit !== null
                  ? `Visited ${daysSinceVisit === 0 ? 'today' : `${daysSinceVisit}d ago`} · ${lastVisit!.status}`
                  : 'Not visited for this brand'}
              </div>
            </div>
          </div>
        </div>
      </Link>
      {onRemove && (
        <button
          onClick={e => { e.preventDefault(); onRemove() }}
          style={{ position: 'absolute', top: '10px', right: '28px', background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted, padding: '2px', opacity: 0.4, display: 'flex', alignItems: 'center' }}
          title="Remove from pursuing"
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  label, count, color, open, onToggle, action,
}: {
  label: string; count: number; color?: string; open: boolean
  onToggle: () => void; action?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: open ? '8px' : 0 }}>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', textAlign: 'left' }}>
        <ChevronDown size={13} color={t.text.muted} style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms', flexShrink: 0 }} />
        <span style={{ fontSize: '11px', fontWeight: '700', color: color ?? t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
        <span style={{ fontSize: '11px', color: t.text.muted, fontWeight: '400' }}>· {count}</span>
      </button>
      {action}
    </div>
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
  const [allAccounts, setAllAccounts] = useState<Account[]>([])
  const [territoryAccounts, setTerritoryAccounts] = useState<Account[]>([])
  const [brandActivity, setBrandActivity] = useState<Record<string, string[]>>({})
  const [targetMap, setTargetMap] = useState<Record<string, string[]>>({})
  const [snapshots, setSnapshots] = useState<Record<string, ZoneMetricSnapshot>>({})
  const [brandDataBySlug, setBrandDataBySlug] = useState<Record<string, BrandData>>({})
  const [loadingBrandSlugs, setLoadingBrandSlugs] = useState<Set<string>>(new Set())
  const [zoneDetails, setZoneDetails] = useState<Record<string, ZoneDetail>>({})
  const [zoneSparklines, setZoneSparklines] = useState<Record<string, ZoneMetricSnapshot[]>>({})
  const [loadingZoneIds, setLoadingZoneIds] = useState<Set<string>>(new Set())
  const [computingSlugs, setComputingSlugs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const [activeClientTab, setActiveClientTab] = useState<string>(searchParams.get('client') ?? '')
  const didAutoSelect = useRef(false)
  const autoRecomputedSlugs = useRef<Set<string>>(new Set())

  // Section expand/collapse state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    lapsed: true, active: true, pursuing: true, dormant: false,
  })

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

  // "Add to Pursuing" modal (from opportunity cards)
  const [targetModal, setTargetModal] = useState<{ accountId: string; name: string; preSlug?: string } | null>(null)
  const [targetingSlugs, setTargetingSlugs] = useState<string[]>([])
  const [savingTarget, setSavingTarget] = useState(false)

  // "Add to Pursuing" search modal
  const [addTargetOpen, setAddTargetOpen] = useState(false)
  const [addTargetSearch, setAddTargetSearch] = useState('')
  const [addTargetSelectedId, setAddTargetSelectedId] = useState<string | null>(null)
  const [addTargetSlugs, setAddTargetSlugs] = useState<string[]>([])
  const [savingAddTarget, setSavingAddTarget] = useState(false)
  const [addingAll, setAddingAll] = useState(false)

  // Remove from pursuing
  const [removeTargetModal, setRemoveTargetModal] = useState<{ accountId: string; clientSlug: string; name: string } | null>(null)
  const [removeBrandSlug, setRemoveBrandSlug] = useState<string | null>(null)

  // ── Initial load ─────────────────────────────────────────────────────────────

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

      const geoTerms = [
        ...(m.cities ?? []), ...(m.counties ?? []),
        ...(m.states ?? []), ...(m.zip_codes ?? []),
      ].map(g => g.toLowerCase().trim()).filter(Boolean)
      const geoAccs = geoTerms.length > 0
        ? accs.filter(a => matchesGeoTerms(a.address ?? '', geoTerms))
        : []

      const zones = m.zones ?? []
      const [targetResults, snaps] = await Promise.all([
        Promise.all(zones.map(z => getZoneTargetAccounts(z.id))),
        zones.length > 0 ? getLatestSnapshotsByZone(zones.map(z => z.id)) : Promise.resolve({} as Record<string, ZoneMetricSnapshot>),
      ])

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

      const extraAccs = accs.filter(a => extraIds.has(a.id))
      const allTerrAccs = [...geoAccs, ...extraAccs.filter(e => !geoAccs.some(g => g.id === e.id))]
      setTerritoryAccounts(allTerrAccs)

      if (allTerrAccs.length > 0) {
        const accIds = allTerrAccs.map(a => a.id)
        const sb = getSupabase()
        const [vRes, pRes, oRes] = await Promise.all([
          sb.from('visits').select('account_id, client_slug').in('account_id', accIds),
          sb.from('placements').select('account_id, client_slug').in('account_id', accIds).is('lost_at', null),
          sb.from('purchase_orders').select('account_id, client_slug')
            .in('account_id', accIds).in('status', ['sent', 'fulfilled']),
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

  // Auto-select first brand tab
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

  // ── Load CRM data for active brand ───────────────────────────────────────────

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
          sb.from('placements').select('account_id, product_name, status')
            .eq('client_slug', slug).in('account_id', activityIds).is('lost_at', null),
          sb.from('visits').select('account_id, visited_at, status')
            .eq('client_slug', slug).in('account_id', activityIds)
            .order('visited_at', { ascending: false }),
          sb.from('purchase_orders').select('account_id, status, total_amount, sent_at, created_at')
            .eq('client_slug', slug).in('account_id', activityIds)
            .in('status', ['sent', 'fulfilled']).order('created_at', { ascending: false }),
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
          ordersByAccount[o.account_id].push(o as OrderData)
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

  // ── Load zone detail (pursuing targets + sparklines) ─────────────────────────

  const loadZoneDetail = useCallback(async (zone: Zone) => {
    setLoadingZoneIds(prev => new Set([...prev, zone.id]))
    try {
      const [rawTargets, sparks] = await Promise.all([
        getZoneTargetAccounts(zone.id),
        getZoneSnapshots(zone.id, 30),
      ])
      setZoneSparklines(prev => ({ ...prev, [zone.id]: sparks }))

      const targets = rawTargets.map(ta => ({
        ...ta,
        accounts: allAccounts.find(a => a.id === ta.account_id) ?? null,
      }))

      // Only load visits for pursuing targets (orders already loaded via loadBrandData for activity accounts)
      const targetIds = rawTargets.map(ta => ta.account_id).filter(Boolean)
      const lastVisitByAccount: Record<string, { visited_at: string; status: string }> = {}
      if (zone.client_slug && targetIds.length > 0) {
        const sb = getSupabase()
        const { data: vRes } = await sb.from('visits').select('account_id, visited_at, status')
          .eq('client_slug', zone.client_slug).in('account_id', targetIds)
          .order('visited_at', { ascending: false })
        for (const v of vRes ?? []) {
          if (!lastVisitByAccount[v.account_id]) lastVisitByAccount[v.account_id] = v
        }
      }

      setZoneDetails(prev => ({ ...prev, [zone.id]: { targets, lastVisitByAccount } }))
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

  // Auto-recompute when brand tab opens with no snapshot
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

  // ── Google Maps autocomplete ──────────────────────────────────────────────────

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

  const hasGeoTags = useMemo(() => {
    if (!market) return false
    return (market.cities?.length ?? 0) + (market.counties?.length ?? 0) + (market.states?.length ?? 0) + (market.zip_codes?.length ?? 0) > 0
  }, [market])

  const activeZone = useMemo(() =>
    activeClientTab ? (market?.zones ?? []).find(z => z.client_slug === activeClientTab) ?? null : null,
  [market, activeClientTab])

  const activeSnap = activeZone ? snapshots[activeZone.id] ?? null : null
  const activeClient = activeClientTab ? clients.find(c => c.slug === activeClientTab) ?? null : null
  const activeDetail = activeZone ? zoneDetails[activeZone.id] ?? null : null
  const activeSparklines = activeZone ? zoneSparklines[activeZone.id] ?? [] : []
  const isLoadingBrandData = loadingBrandSlugs.has(activeClientTab)
  const isComputing = computingSlugs.has(activeClientTab)
  const activeBrandData = activeClientTab ? brandDataBySlug[activeClientTab] ?? null : null

  // Per-account status classification
  const accountStatuses = useMemo((): Record<string, AccountStatus> => {
    if (!activeBrandData) return {}
    const result: Record<string, AccountStatus> = {}
    for (const acct of activeBrandData.activityAccounts) {
      result[acct.id] = classifyAccount(activeBrandData.ordersByAccount[acct.id] ?? [])
    }
    return result
  }, [activeBrandData])

  // Account groups
  const lapsedAccounts = useMemo(() =>
    (activeBrandData?.activityAccounts ?? [])
      .filter(a => accountStatuses[a.id] === 'lapsed')
      .sort((a, b) => {
        const aOrders = activeBrandData!.ordersByAccount[a.id] ?? []
        const bOrders = activeBrandData!.ordersByAccount[b.id] ?? []
        if (bOrders.length !== aOrders.length) return bOrders.length - aOrders.length
        const aLast = latestOrderDate(aOrders)
        const bLast = latestOrderDate(bOrders)
        return (aLast ?? '') < (bLast ?? '') ? -1 : 1
      }),
  [activeBrandData, accountStatuses])

  const activeAccounts = useMemo(() =>
    (activeBrandData?.activityAccounts ?? [])
      .filter(a => accountStatuses[a.id] === 'active')
      .sort((a, b) => {
        const aLast = latestOrderDate(activeBrandData!.ordersByAccount[a.id] ?? [])
        const bLast = latestOrderDate(activeBrandData!.ordersByAccount[b.id] ?? [])
        return (bLast ?? '') > (aLast ?? '') ? 1 : -1
      }),
  [activeBrandData, accountStatuses])

  const dormantAccounts = useMemo(() =>
    (activeBrandData?.activityAccounts ?? [])
      .filter(a => accountStatuses[a.id] === 'dormant')
      .sort((a, b) => (activeBrandData!.ordersByAccount[b.id] ?? []).length - (activeBrandData!.ordersByAccount[a.id] ?? []).length),
  [activeBrandData, accountStatuses])

  // Pursuing: activity accounts with no orders + manual zone targets without CRM activity
  const pursuingFromActivity = useMemo(() =>
    (activeBrandData?.activityAccounts ?? []).filter(a => accountStatuses[a.id] === 'untouched'),
  [activeBrandData, accountStatuses])

  const pursuingManual = useMemo(() =>
    (activeDetail?.targets ?? []).filter(ta =>
      ta.accounts && !(brandActivity[ta.account_id] ?? []).includes(activeClientTab)
    ),
  [activeDetail, brandActivity, activeClientTab])

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

  async function handleSetTarget() {
    if (!targetModal || targetingSlugs.length === 0) return
    setSavingTarget(true)
    try {
      for (const slug of targetingSlugs) {
        const zone = await getOrCreateZone(slug)
        if (zone) await addAccountToZone(zone.id, targetModal.accountId)
      }
      toast('Added to pursuing')
      setTargetModal(null); setTargetingSlugs([])
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
      toast('Added to pursuing')
      setAddTargetOpen(false); setAddTargetSelectedId(null)
      setAddTargetSlugs([]); setAddTargetSearch('')
      setZoneDetails({})
      await load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
    finally { setSavingAddTarget(false) }
  }

  async function handleAddAll() {
    if (!activeClientTab || suggestedAccounts.length === 0) return
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
      const zone = await getOrCreateZone(slug)
      if (!zone) throw new Error('Could not create tracking record')

      const activityAccts = territoryAccounts.filter(a => (brandActivity[a.id] ?? []).includes(slug))
      if (activityAccts.length > 0) {
        const existingTargets = await getZoneTargetAccounts(zone.id)
        const existingIds = new Set(existingTargets.map(ta => ta.account_id))
        const toAdd = activityAccts.filter(a => !existingIds.has(a.id))
        if (toAdd.length > 0) await Promise.all(toAdd.map(a => addAccountToZone(zone.id, a.id)))
      }

      const res = await fetch(`/api/growth/recompute/${zone.id}`, { method: 'POST', signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error((await res.json()).error || 'Recompute failed')

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
      toast('Brand removed from territory')
      if (activeClientTab === removeBrandSlug) setActiveClientTab('')
      setRemoveBrandSlug(null)
      load()
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
  }

  function toggleSection(key: string) {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
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
  const geoParts = [
    ...(market.cities ?? []).slice(0, 2),
    ...(market.counties?.map(c => `${c} Co.`) ?? []).slice(0, 1),
    ...(market.states ?? []).slice(0, 1),
  ].slice(0, 3)

  // Volume trend display helpers
  const trendPct = activeSnap?.volume_trend_pct ?? null
  const trendLabel = trendPct === null ? null
    : Math.abs(trendPct) < 5 ? 'stable'
    : trendPct > 0 ? `↑${Math.round(trendPct)}%`
    : `↓${Math.round(Math.abs(trendPct))}%`
  const trendColor = trendPct === null ? t.text.muted
    : trendPct > 5 ? t.status.success
    : trendPct < -5 ? t.status.danger
    : t.text.muted

  const totalPursuing = pursuingFromActivity.length + pursuingManual.length

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <LayoutShell>
      <div style={{ minHeight: '100vh' }}>

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/growth" style={{ fontSize: '12px', color: t.text.muted, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            ← Growth
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '17px', fontWeight: '800', color: t.text.primary, margin: 0 }}>{market.name}</h1>
              {market.priority && <span style={{ fontSize: '11px', color: t.gold }}>★ Priority</span>}
              {geoParts.length > 0 && (
                <span style={{ fontSize: '11px', color: t.text.muted }}>{geoParts.join(' · ')}</span>
              )}
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
              <div style={{ padding: '12px 0', fontSize: '12px', color: t.text.muted }}>No brands in this territory yet — add CRM data or set accounts as pursuing.</div>
            ) : territoryClients.map(client => {
              const isActive = activeClientTab === client.slug
              const clientSnap = (market.zones ?? []).find(z => z.client_slug === client.slug)
              const snap = clientSnap ? snapshots[clientSnap.id] : undefined
              const logo = clientLogoUrl(client)
              return (
                <button key={client.slug} onClick={() => setActiveClientTab(client.slug)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: isActive ? `2px solid ${client.color || t.gold}` : '2px solid transparent', opacity: isActive ? 1 : 0.5, transition: 'opacity 150ms', flexShrink: 0 }}>
                  {logo ? (
                    <img src={logo} alt={client.name} style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: '4px' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '6px', backgroundColor: (client.color || t.gold) + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: client.color || t.gold }}>
                      {client.name[0]}
                    </div>
                  )}
                  <span style={{ fontSize: '10px', fontWeight: '700', color: isActive ? (client.color || t.gold) : t.text.muted, letterSpacing: '0.04em' }}>
                    {snap?.health_score != null ? Math.round(snap.health_score) : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── No brand selected ─────────────────────────────────────────────── */}
        {!activeClientTab && (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: t.text.muted }}>Select a brand above to view performance data</div>
          </div>
        )}

        {/* ── Brand content ────────────────────────────────────────────────────*/}
        {activeClientTab && (
          <div style={{ maxWidth: '860px', margin: '0 auto', padding: '20px 24px 60px' }}>

            {/* Status summary row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px' }}>
              {[
                { label: 'Active', count: activeAccounts.length, color: t.status.success, key: 'active' },
                { label: 'Lapsed', count: lapsedAccounts.length, color: t.status.warning, key: 'lapsed', warn: lapsedAccounts.length > 0 },
                { label: 'Pursuing', count: totalPursuing, color: t.gold, key: 'pursuing' },
                { label: 'Dormant', count: dormantAccounts.length, color: t.text.muted, key: 'dormant' },
              ].map(s => (
                <button key={s.key} onClick={() => {
                  setExpandedSections(prev => ({ ...prev, [s.key]: true }))
                  document.getElementById(`section-${s.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }} style={{
                  padding: '14px 12px 12px',
                  borderRadius: '12px',
                  backgroundColor: t.bg.elevated,
                  border: `1px solid ${t.border.default}`,
                  borderTop: `3px solid ${s.count > 0 ? s.color : t.border.default}`,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'border-color 150ms',
                }}>
                  <div style={{
                    fontSize: '28px', fontWeight: '900', color: s.count > 0 ? s.color : t.text.muted,
                    lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
                    textShadow: s.count > 0 ? `0 0 20px ${s.color}40` : 'none',
                  }}>
                    {isLoadingBrandData ? '—' : s.count}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '5px' }}>
                    {s.warn && s.count > 0 && <AlertTriangle size={10} color={s.color} />}
                    <span style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* ── Command panel ─────────────────────────────────────────────── */}
            <div style={{
              display: 'flex', gap: '10px', marginBottom: '14px',
              padding: '20px', borderRadius: '14px',
              backgroundColor: t.bg.elevated,
              border: `1px solid ${clientColor}1a`,
              boxShadow: `0 0 40px ${clientColor}08`,
              flexWrap: 'wrap',
            }}>
              {/* Health ring + sparkline column */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '10px', flexShrink: 0,
              }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  Territory Health
                </div>
                <HealthRing score={activeSnap?.health_score ?? null} size={100} strokeWidth={8} />
                {activeSparklines.length > 1 && (
                  <Sparkline
                    data={activeSparklines.map(s => s.health_score)}
                    width={96} height={28}
                    color={healthColor(activeSnap?.health_score ?? null)}
                  />
                )}
                {/* Last updated / computing state */}
                <button
                  onClick={handleRecompute}
                  disabled={isComputing || isLoadingBrandData}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    background: 'none', border: 'none', cursor: isComputing ? 'default' : 'pointer',
                    color: t.text.muted, fontSize: '10px', padding: '2px 6px',
                    borderRadius: '5px', opacity: isComputing ? 0.5 : 0.7,
                  }}
                  title="Refresh metrics"
                >
                  <RefreshCw size={10} style={{ opacity: 0.7 }} />
                  {isComputing ? 'Computing…'
                    : activeSnap?.computed_at
                      ? (() => {
                          const d = daysSince(activeSnap.computed_at)
                          return d === 0 ? 'Updated today' : d === 1 ? 'Updated yesterday' : `Updated ${d}d ago`
                        })()
                      : 'No data yet — click to compute'}
                </button>
              </div>

              {/* Vertical divider */}
              <div style={{ width: '1px', backgroundColor: t.border.subtle, alignSelf: 'stretch', flexShrink: 0 }} />

              {/* Cases + trend panel */}
              <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px', padding: '0 4px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  Cases · 90 Days
                </div>

                {/* Big cases number + trend */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '48px', fontWeight: '900', color: t.text.primary,
                    lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {isLoadingBrandData ? '—' : (activeSnap?.total_cases_90d ?? '—')}
                  </span>
                  {trendLabel && !isLoadingBrandData && (
                    <span style={{
                      fontSize: '20px', fontWeight: '800', color: trendColor,
                      textShadow: `0 0 16px ${trendColor}50`,
                    }}>
                      {trendLabel}
                    </span>
                  )}
                </div>

                {/* Progress bar vs prior quarter */}
                {activeSnap?.cases_prior_90d != null && activeSnap.cases_prior_90d > 0 && activeSnap.total_cases_90d != null && (
                  <div>
                    <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '6px' }}>
                      vs {activeSnap.cases_prior_90d} last quarter
                    </div>
                    <div style={{ position: 'relative', height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${Math.min(100, (activeSnap.total_cases_90d / Math.max(activeSnap.total_cases_90d, activeSnap.cases_prior_90d)) * 100)}%`,
                        backgroundColor: trendColor,
                        borderRadius: '2px',
                        boxShadow: `0 0 8px ${trendColor}`,
                      }} />
                    </div>
                  </div>
                )}

                {/* Attrition warning */}
                {activeSnap?.accounts_lost != null && activeSnap.accounts_lost > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: t.status.warning }}>
                    <AlertTriangle size={12} />
                    {activeSnap.accounts_lost} account{activeSnap.accounts_lost !== 1 ? 's' : ''} went quiet this quarter
                  </div>
                )}

                {/* New territory state */}
                {!isLoadingBrandData && (activeSnap?.total_cases_90d == null || activeSnap.total_cases_90d === 0) && totalPursuing > 0 && (
                  <div style={{ fontSize: '11px', color: t.text.muted }}>
                    {totalPursuing} account{totalPursuing !== 1 ? 's' : ''} in pursuit — no orders yet
                  </div>
                )}
              </div>
            </div>

            {/* ── Arc Gauge instruments ──────────────────────────────────────── */}
            <div style={{
              display: 'flex', gap: '0', marginBottom: '24px',
              padding: '20px 8px 8px',
              borderRadius: '14px',
              backgroundColor: t.bg.elevated,
              border: `1px solid ${t.border.default}`,
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
              <div style={{ width: '1px', backgroundColor: t.border.subtle, alignSelf: 'stretch', margin: '0 4px' }} />
              <ArcGauge
                label="Reorder Rate"
                value={activeSnap?.retention_pct ?? null}
                target={market.default_retention_threshold}
                unit="%"
              />
              <div style={{ width: '1px', backgroundColor: t.border.subtle, alignSelf: 'stretch', margin: '0 4px' }} />
              <ArcGauge
                label="Velocity Index"
                value={activeSnap?.velocity_index ?? null}
                target={100}
                unit=""
                note={activeSnap?.velocity != null ? `${activeSnap.velocity.toFixed(1)} cs/acct/mo` : undefined}
              />
            </div>

            {/* ── Lapsed section ─────────────────────────────────────────────── */}
            {(isLoadingBrandData || lapsedAccounts.length > 0) && (
              <div id="section-lapsed" style={{ marginBottom: '20px' }}>
                <SectionHeader
                  label="Lapsed"
                  count={lapsedAccounts.length}
                  color={t.status.warning}
                  open={expandedSections.lapsed}
                  onToggle={() => toggleSection('lapsed')}
                />
                {expandedSections.lapsed && (
                  isLoadingBrandData ? (
                    <div style={{ fontSize: '12px', color: t.text.muted, padding: '8px 0' }}>Loading…</div>
                  ) : lapsedAccounts.length === 0 ? null : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {lapsedAccounts.map(acct => (
                        <AccountCard
                          key={acct.id}
                          account={acct}
                          status="lapsed"
                          orders={activeBrandData!.ordersByAccount[acct.id] ?? []}
                          lastVisit={activeBrandData!.lastVisitByAccount[acct.id]}
                          placements={activeBrandData!.placementsByAccount[acct.id]}
                          clientColor={clientColor}
                        />
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {/* ── Active section ──────────────────────────────────────────────── */}
            {(isLoadingBrandData || activeAccounts.length > 0) && (
              <div id="section-active" style={{ marginBottom: '20px' }}>
                <SectionHeader
                  label="Active"
                  count={activeAccounts.length}
                  color={t.status.success}
                  open={expandedSections.active}
                  onToggle={() => toggleSection('active')}
                />
                {expandedSections.active && (
                  isLoadingBrandData ? (
                    <div style={{ fontSize: '12px', color: t.text.muted, padding: '8px 0' }}>Loading…</div>
                  ) : activeAccounts.length === 0 ? null : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {activeAccounts.map(acct => (
                        <AccountCard
                          key={acct.id}
                          account={acct}
                          status="active"
                          orders={activeBrandData!.ordersByAccount[acct.id] ?? []}
                          lastVisit={activeBrandData!.lastVisitByAccount[acct.id]}
                          placements={activeBrandData!.placementsByAccount[acct.id]}
                          clientColor={clientColor}
                        />
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {/* ── Pursuing section ────────────────────────────────────────────── */}
            <div id="section-pursuing" style={{ marginBottom: '20px' }}>
              <SectionHeader
                label="Pursuing"
                count={totalPursuing}
                color={t.gold}
                open={expandedSections.pursuing}
                onToggle={() => toggleSection('pursuing')}
                action={
                  <button onClick={() => { setAddTargetSlugs(activeClientTab ? [activeClientTab] : []); setAddTargetSelectedId(null); setAddTargetSearch(''); setAddTargetOpen(true) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold }}>
                    <Plus size={10} /> Add
                  </button>
                }
              />
              {expandedSections.pursuing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Activity accounts with no orders (auto-detected, no remove button) */}
                  {pursuingFromActivity.map(acct => (
                    <AccountCard
                      key={acct.id}
                      account={acct}
                      status="untouched"
                      orders={[]}
                      lastVisit={activeBrandData?.lastVisitByAccount[acct.id]}
                      placements={activeBrandData?.placementsByAccount[acct.id]}
                      clientColor={clientColor}
                    />
                  ))}
                  {/* Manual zone targets without CRM activity */}
                  {pursuingManual.map(ta => {
                    const acct = ta.accounts
                    if (!acct) return null
                    const lastVisit = activeDetail?.lastVisitByAccount[acct.id]
                    return (
                      <AccountCard
                        key={ta.id}
                        account={acct}
                        status="untouched"
                        orders={[]}
                        lastVisit={lastVisit}
                        clientColor={clientColor}
                        onRemove={() => setRemoveTargetModal({ accountId: acct.id, clientSlug: activeClientTab, name: acct.name })}
                      />
                    )
                  })}
                  {totalPursuing === 0 && !isLoadingBrandData && (
                    <div style={{ padding: '14px', borderRadius: '8px', border: `2px dashed ${t.border.default}`, textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', color: t.text.muted }}>No accounts being pursued yet</div>
                      <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '3px' }}>Add accounts from Opportunities below, or search manually</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Dormant section ─────────────────────────────────────────────── */}
            {dormantAccounts.length > 0 && (
              <div id="section-dormant" style={{ marginBottom: '20px' }}>
                <SectionHeader
                  label="Dormant"
                  count={dormantAccounts.length}
                  color={t.text.muted}
                  open={expandedSections.dormant}
                  onToggle={() => toggleSection('dormant')}
                />
                {expandedSections.dormant && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {dormantAccounts.map(acct => (
                      <AccountCard
                        key={acct.id}
                        account={acct}
                        status="dormant"
                        orders={activeBrandData!.ordersByAccount[acct.id] ?? []}
                        lastVisit={activeBrandData!.lastVisitByAccount[acct.id]}
                        clientColor={clientColor}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Opportunities ────────────────────────────────────────────────── */}
            {suggestedAccounts.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Opportunities · {suggestedAccounts.length}
                    </div>
                    <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '2px' }}>In territory, not yet approached for this brand</div>
                  </div>
                  {suggestedAccounts.length > 1 && (
                    <button onClick={handleAddAll} disabled={addingAll}
                      style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: addingAll ? 'default' : 'pointer', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold, opacity: addingAll ? 0.6 : 1 }}>
                      <Plus size={10} /> {addingAll ? 'Adding…' : 'Pursue All'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {suggestedAccounts.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: t.text.primary }}>{a.name}</div>
                        {a.address && <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '1px' }}>{a.address.split(',').slice(0, 2).join(',')}</div>}
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

            {!hasGeoTags && (
              <div style={{ padding: '12px 14px', borderRadius: '8px', border: `1px dashed ${t.border.default}`, backgroundColor: t.bg.input }}>
                <div style={{ fontSize: '11px', color: t.text.muted, lineHeight: 1.5 }}>
                  <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.gold, fontWeight: '600', padding: 0, fontSize: '11px' }}>
                    Add cities or zip codes to {market.name}
                  </button>{' '}to auto-populate accounts from your CRM.
                </div>
              </div>
            )}

            {/* Recompute bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', backgroundColor: t.bg.elevated, border: `1px solid ${t.border.subtle}`, marginTop: '24px' }}>
              <span style={{ fontSize: '11px', color: t.text.muted }}>
                {activeSnap
                  ? `Last computed: ${new Date(activeSnap.computed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : isComputing ? 'Computing metrics…'
                  : 'Metrics not yet computed'}
              </span>
              <button onClick={handleRecompute} disabled={isComputing}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', cursor: isComputing ? 'default' : 'pointer', border: `1px solid ${t.goldBorder}`, backgroundColor: t.goldDim, color: t.gold, fontWeight: '600', opacity: isComputing ? 0.6 : 1 }}>
                <RefreshCw size={11} /> {isComputing ? 'Computing…' : 'Refresh'}
              </button>
            </div>

            {/* Remove brand */}
            {activeZone && (
              <button onClick={() => setRemoveBrandSlug(activeClientTab)}
                style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '7px', border: `1px solid rgba(232,85,64,0.3)`, backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '12px', cursor: 'pointer' }}>
                <Trash2 size={12} /> Remove Brand from Territory
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Edit Territory Modal ──────────────────────────────────────────────── */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
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
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setEditing(false)} style={btnSecondary}>Cancel</button>
              <button onClick={handleSaveMarket} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add to Pursuing modal (from opportunity) ─────────────────────────── */}
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

      {/* ── Add to Pursuing search modal ─────────────────────────────────────── */}
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

      <ConfirmModal
        isOpen={!!removeTargetModal}
        title="Remove from pursuing?"
        message={removeTargetModal ? `Remove "${removeTargetModal.name}" from pursuing?` : ''}
        confirmLabel="Remove"
        onConfirm={handleRemoveTarget}
        onClose={() => setRemoveTargetModal(null)}
      />

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
