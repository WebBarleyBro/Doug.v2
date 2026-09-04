'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ChevronUp, ChevronDown, Plus, X, Check, Map, List, LocateFixed } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { v3, v3input, v3label, v3btnPrimary, v3btnSecondary } from '../lib/theme'
import { useV3Accounts, useV3Clients, useV3RecentVisits, useV3Orders, useV3Placements, useV3Profile } from '../lib/query'
import { useOpenLogVisit } from '../lib/context'
import { getSupabase } from '../../lib/supabase'
import { formatCurrency, relativeTimeStr } from '../../lib/formatters'
import type { Client } from '../../lib/types'
import {
  buildIntelMap, buildFunnelSummary, compareByUrgency,
  STAGE_COLOR, STAGE_LABEL, SIGNAL_COLOR,
  type AccountStage, type AccountIntel,
} from '../lib/stage'
import { buildDemandMap } from '../lib/demand'

// ── Add Account Modal ─────────────────────────────────────────────────────────
function AddAccountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName]       = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone]     = useState('')
  const [type, setType]       = useState<'on_premise' | 'off_premise'>('on_premise')
  const [priority, setPriority] = useState<'A' | 'B' | 'C'>('B')
  const [notes, setNotes]     = useState('')
  const [error, setError]     = useState('')

  const create = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { error } = await sb.from('accounts').insert({
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        account_type: type,
        priority,
        notes: notes.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'accounts'] })
      setTimeout(onClose, 400)
    },
    onError: (e: any) => setError(e?.message ?? 'Failed to create account'),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'absolute', inset: 0, background: v3.bg.overlay, backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 480,
        background: v3.bg.elevated, borderRadius: v3.radius.xl,
        border: `1px solid ${v3.border.strong}`, padding: '24px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Add Account</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={v3label}>Account Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="The Golden Pony" autoFocus
              style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
          <div>
            <label style={v3label}>Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, Fort Collins, CO"
              style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={v3label}>Type</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['on_premise', 'off_premise'] as const).map(t => (
                  <button key={t} onClick={() => setType(t)} style={{
                    flex: 1, padding: '8px 0', borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 700,
                    border: `1.5px solid ${type === t ? v3.amber + '70' : v3.border.default}`,
                    background: type === t ? v3.amberDim : 'transparent',
                    color: type === t ? v3.amberLight : v3.text.muted,
                    cursor: 'pointer', transition: 'all 120ms',
                  }}>{t === 'on_premise' ? 'On-prem' : 'Off-prem'}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={v3label}>Priority</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['A', 'B', 'C'] as const).map(p => {
                  const pc = p === 'A' ? v3.amber : p === 'B' ? v3.status.warning : v3.text.muted
                  return (
                    <button key={p} onClick={() => setPriority(p)} style={{
                      flex: 1, padding: '8px 0', borderRadius: v3.radius.md, fontSize: '13px', fontWeight: 800,
                      border: `1.5px solid ${priority === p ? pc + '70' : v3.border.default}`,
                      background: priority === p ? pc + '14' : 'transparent',
                      color: priority === p ? pc : v3.text.muted,
                      cursor: 'pointer', transition: 'all 120ms',
                    }}>{p}</button>
                  )
                })}
              </div>
            </div>
          </div>
          <div>
            <label style={v3label}>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(303) 555-0100"
              style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
          <div>
            <label style={v3label}>Notes <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Best time to visit, parking, anything useful…"
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 } as any} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '9px 12px', background: v3.status.dangerDim, border: `1px solid ${v3.status.danger}33`, borderRadius: v3.radius.md, fontSize: '13px', color: v3.status.danger }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ ...v3btnSecondary, flex: 1 }}>Cancel</button>
          <button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}
            style={{
              ...v3btnPrimary, flex: 2,
              opacity: !name.trim() || create.isPending ? 0.45 : 1,
              cursor: !name.trim() || create.isPending ? 'not-allowed' : 'pointer',
              background: create.isSuccess ? v3.status.success : v3.amber,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            {create.isSuccess ? <><Check size={14} strokeWidth={3} /> Added</> : create.isPending ? 'Adding…' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

type SortKey = 'name' | 'urgency' | 'lastVisit' | 'lastOrder' | 'revenue'

const RECENCY_OPTIONS: { id: string; label: string; color: string; desc: string }[] = [
  { id: 'd30',  label: '< 30d',   color: v3.status.success,  desc: 'Ordered in last 30 days' },
  { id: 'd90',  label: '30–90d',  color: v3.amber,            desc: 'Last order 30–90 days ago' },
  { id: 'd180', label: '90–180d', color: v3.status.warning,   desc: 'Last order 90–180 days ago' },
  { id: 'old',  label: '> 180d',  color: v3.status.danger,    desc: 'Last order over 180 days ago' },
  { id: 'none', label: 'No orders', color: 'rgba(255,255,255,0.50)', desc: 'No orders on record' },
]

// ── Territory Map ─────────────────────────────────────────────────────────────

function TerritoryMap({ accounts, intelMap }: {
  accounts: any[]
  intelMap: Record<string, AccountIntel>
}) {
  const router       = useRouter()
  const mapRef       = useRef<HTMLDivElement>(null)
  const mapboxRef    = useRef<any>(null)
  const mapInstance  = useRef<any>(null)
  const markersRef   = useRef<any[]>([])
  const [mapReady, setMapReady] = useState(false)

  const geocoded = useMemo(() => accounts.filter(a => a.lat != null && a.lng != null), [accounts])

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

    import('mapbox-gl').then(({ default: mb }) => {
      mb.accessToken = token
      mapboxRef.current = mb

      const map = new mb.Map({
        container: mapRef.current!,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-104.9, 39.73],
        zoom: 7,
        attributionControl: false,
      })

      map.addControl(new mb.NavigationControl({ showCompass: false }), 'top-right')
      mapInstance.current = map
      map.on('load', () => setMapReady(true))
    })

    return () => {
      mapInstance.current?.remove()
      mapInstance.current = null
      setMapReady(false)
    }
  }, [])

  useEffect(() => {
    if (!mapReady || !mapInstance.current || !mapboxRef.current) return
    const mb  = mapboxRef.current
    const map = mapInstance.current

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (!geocoded.length) return

    const bounds = new mb.LngLatBounds()

    for (const a of geocoded) {
      const intel    = intelMap[a.id]
      const dotColor = intel ? SIGNAL_COLOR[intel.signal] : 'rgba(255,255,255,0.35)'
      const stageLbl = intel ? STAGE_LABEL[intel.stage] : '—'
      const signalLbl = intel ? intel.signal.replace('_', ' ') : '—'

      const el = document.createElement('div')
      el.style.cssText = `width:22px;height:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;`

      const dot = document.createElement('div')
      dot.style.cssText = `
        width:14px;height:14px;border-radius:50%;
        background:${dotColor};
        border:2.5px solid rgba(10,10,10,0.7);
        box-shadow:0 0 0 2px ${dotColor}50, 0 2px 10px rgba(0,0,0,0.5);
        transition:transform 200ms cubic-bezier(0.34,1.56,0.64,1),box-shadow 200ms;
        transform-origin:50% 50%;
      `
      el.appendChild(dot)
      el.addEventListener('mouseenter', () => {
        dot.style.transform = 'scale(1.75)'
        dot.style.boxShadow = `0 0 0 3px ${dotColor}60, 0 0 20px ${dotColor}, 0 4px 14px rgba(0,0,0,0.6)`
      })
      el.addEventListener('mouseleave', () => {
        dot.style.transform = 'scale(1)'
        dot.style.boxShadow = `0 0 0 2px ${dotColor}50, 0 2px 10px rgba(0,0,0,0.5)`
      })
      el.addEventListener('click', e => {
        e.stopPropagation()
        router.push(`/v3/accounts/${a.id}`)
      })

      const popup = new mb.Popup({
        offset: [0, -14], anchor: 'bottom', closeButton: false, closeOnClick: false,
        className: 'v3-map-popup',
      }).setHTML(`
        <div style="background:#111113;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:11px 14px;min-width:170px;box-shadow:0 12px 40px rgba(0,0,0,0.7)">
          <div style="font-size:13px;font-weight:700;color:#f2f2f2;margin-bottom:3px;line-height:1.3">${a.name}</div>
          ${a.address ? `<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:7px;line-height:1.4">${a.address}</div>` : '<div style="margin-bottom:7px"></div>'}
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:7px;height:7px;border-radius:50%;background:${dotColor};box-shadow:0 0 6px ${dotColor};flex-shrink:0"></div>
            <span style="font-size:10px;font-weight:700;color:${dotColor};text-transform:uppercase;letter-spacing:0.07em">${stageLbl} · ${signalLbl}</span>
          </div>
        </div>
      `)

      const marker = new mb.Marker({ element: el, anchor: 'center' })
        .setLngLat([a.lng, a.lat])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
      bounds.extend([a.lng, a.lat])
    }

    if (geocoded.length > 0) {
      map.fitBounds(bounds, { padding: 80, maxZoom: 13, animate: true })
    }
  }, [mapReady, geocoded, intelMap, router])

  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${v3.border.subtle}`, borderRadius: v3.radius.lg }}>
        <div style={{ textAlign: 'center', color: v3.text.muted, fontSize: '14px' }}>Map token not configured</div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div ref={mapRef} style={{ height: '100%', borderRadius: v3.radius.lg, overflow: 'hidden', border: `1px solid ${v3.border.subtle}` }} />
      {!mapReady && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', borderRadius: v3.radius.lg }}>
          <div style={{ color: v3.text.muted, fontSize: '13px' }}>Loading map…</div>
        </div>
      )}
      {mapReady && geocoded.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(0,0,0,0.75)', borderRadius: v3.radius.lg, padding: '20px 28px', textAlign: 'center', border: `1px solid ${v3.border.subtle}` }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: v3.text.secondary, marginBottom: 6 }}>No geocoded accounts</div>
            <div style={{ fontSize: '12px', color: v3.text.muted, lineHeight: 1.5 }}>
              Run migration 055, then add lat/lng to accounts to pin them on the map.
            </div>
          </div>
        </div>
      )}
      {mapReady && geocoded.length > 0 && (
        <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.75)', borderRadius: v3.radius.md, padding: '8px 12px', fontSize: '10px', color: v3.text.muted, border: `1px solid ${v3.border.subtle}`, backdropFilter: 'blur(6px)' }}>
          {geocoded.length} of {accounts.length} accounts geocoded
        </div>
      )}
      <style>{`.mapboxgl-popup-content { background: #0d0d0d !important; border: 1px solid rgba(255,255,255,0.1) !important; padding: 0 !important; border-radius: 8px !important; box-shadow: 0 8px 24px rgba(0,0,0,0.6) !important; } .mapboxgl-popup-tip { border-top-color: #0d0d0d !important; border-bottom-color: #0d0d0d !important; }`}</style>
    </div>
  )
}

// ── Account row ───────────────────────────────────────────────────────────────
const COL = '8px 1fr 70px 100px 84px 84px 88px 80px 44px'

function AccountRow({ account, orderData, lastVisit, brandSlugs, clients, maxRev, intel }: {
  account:   any
  orderData: { lastDate: string; revenue: number } | undefined
  lastVisit: string | null
  brandSlugs: string[]
  clients:   Client[]
  maxRev:    number
  intel?:    AccountIntel
}) {
  const router = useRouter()
  const { open } = useOpenLogVisit()
  const rev = orderData?.revenue ?? 0

  const signalColor = intel ? SIGNAL_COLOR[intel.signal] : 'rgba(255,255,255,0.18)'
  const stageColor  = intel ? STAGE_COLOR[intel.stage]   : 'rgba(255,255,255,0.18)'
  const stageLabel  = intel ? STAGE_LABEL[intel.stage]   : '—'

  const now        = Date.now()
  const orderAgeMs = orderData?.lastDate ? now - new Date(orderData.lastDate).getTime() : null
  const orderDotColor = orderAgeMs === null ? 'transparent'
    : orderAgeMs < 30  * 86400000 ? v3.status.success
    : orderAgeMs < 90  * 86400000 ? v3.amber
    : orderAgeMs < 180 * 86400000 ? v3.status.warning
    : v3.status.danger

  return (
    <div
      onClick={() => router.push(`/v3/accounts/${account.id}`)}
      style={{
        display: 'grid', gridTemplateColumns: COL,
        gap: '0 12px', alignItems: 'center',
        padding: '11px 16px', borderBottom: `1px solid ${v3.border.subtle}`,
        transition: 'background 80ms', cursor: 'pointer',
      }}
      onMouseEnter={e => e.currentTarget.style.background = v3.bg.elevated}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Signal dot */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: signalColor, boxShadow: intel && ['urgent', 'cooling'].includes(intel.signal) ? `0 0 8px ${signalColor}` : 'none', flexShrink: 0 }} />

      {/* Name + address */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: v3.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {account.name}
        </div>
        {account.address && (
          <div style={{ fontSize: '12px', color: v3.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
            {account.address}
          </div>
        )}
      </div>

      {/* Type */}
      <div style={{ fontSize: '12px', color: v3.text.muted }}>
        {account.account_type === 'on_premise' ? 'On-prem' : account.account_type === 'off_premise' ? 'Off-prem' : '—'}
      </div>

      {/* Stage chip */}
      <div style={{ padding: '2px 8px', borderRadius: v3.radius.full, fontSize: '10px', fontWeight: 700, color: stageColor, background: stageColor + '18', border: `1px solid ${stageColor}35`, display: 'inline-flex', alignItems: 'center', maxWidth: 96, overflow: 'hidden' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stageLabel}</span>
      </div>

      {/* Last visit */}
      <div style={{ fontSize: '12px', color: lastVisit ? v3.text.secondary : v3.text.muted }}>
        {lastVisit ? relativeTimeStr(lastVisit) ?? '—' : 'Never'}
      </div>

      {/* Last order */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {orderData && <div style={{ width: 5, height: 5, borderRadius: '50%', background: orderDotColor, flexShrink: 0 }} />}
        <span style={{ fontSize: '12px', color: orderData ? orderDotColor : v3.text.muted, fontWeight: orderData ? 600 : 400 }}>
          {orderData ? (relativeTimeStr(orderData.lastDate) ?? '—') : 'Never'}
        </span>
      </div>

      {/* Revenue */}
      <div>
        {rev > 0 ? (
          <>
            <div style={{ height: 3, borderRadius: 2, background: v3.border.subtle, marginBottom: 3 }}>
              <div style={{ height: '100%', width: `${(rev / maxRev) * 100}%`, background: `linear-gradient(90deg, ${v3.amber}60, ${v3.amber})`, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: v3.amberLight, fontFamily: 'monospace' }}>{formatCurrency(rev)}</div>
          </>
        ) : (
          <div style={{ fontSize: '12px', color: v3.text.muted }}>—</div>
        )}
      </div>

      {/* Brand logos */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {brandSlugs.slice(0, 3).map(slug => {
          const cl = clients.find(c => c.slug === slug)
          return cl?.logo_url
            ? <img key={slug} src={cl.logo_url} alt={cl.name} style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: 2, opacity: 0.75 }} />
            : <div key={slug} style={{ width: 14, height: 14, borderRadius: 3, background: (cl?.color || v3.amber) + '28', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 900, color: cl?.color || v3.amber }}>{(cl?.name ?? slug)[0]}</div>
        })}
      </div>

      {/* Log button */}
      <button
        onClick={e => { e.stopPropagation(); open({ id: account.id, name: account.name }) }}
        style={{
          padding: '5px 8px', background: 'transparent',
          border: `1px solid rgba(255,255,255,0.08)`, borderRadius: '3px',
          fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.50)',
          cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 120ms',
          fontFamily: v3.font.ui,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(196,164,110,0.40)'; e.currentTarget.style.color = v3.amberLight }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)' }}
      >Log</button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TerritoryPage() {
  const { data: accounts = [], isLoading: acctLoading } = useV3Accounts()
  const { data: clients = [] }     = useV3Clients()
  const { data: visits = [] }      = useV3RecentVisits(90)
  const { data: orders = [] }      = useV3Orders()
  const { data: placements = [] }  = useV3Placements()
  const { data: profile }          = useV3Profile()

  const [showAddAccount, setShowAddAccount] = useState(false)
  const [viewMode, setViewMode]       = useState<'list' | 'map'>('list')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const [brandFilter, setBrandFilter] = useState('all')
  const [typeFilter, setTypeFilter]   = useState<'all' | 'on_premise' | 'off_premise'>('all')
  const [stageFilter, setStageFilter] = useState<AccountStage | 'all'>('all')
  const [recencyFilter, setRecencyFilter] = useState<string>('all')
  const [sortKey, setSortKey]         = useState<SortKey>('urgency')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('asc')
  const [geocoding, setGeocoding]     = useState(false)
  const [geocodeMsg, setGeocodeMsg]   = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 200)
    return () => clearTimeout(t)
  }, [searchInput])

  async function handleGeocodeAll() {
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const googleKey   = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!mapboxToken && !googleKey) { setGeocodeMsg('Error: no geocoding key set'); return }

    setGeocoding(true); setGeocodeMsg(null)

    async function tryGeocode(address: string): Promise<{ lat: number; lng: number } | { error: string }> {
      if (mapboxToken) {
        for (const types of ['address,place,poi', '']) {
          try {
            const typeParam = types ? `&types=${types}` : ''
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxToken}&country=US&limit=1${typeParam}`
            const res  = await fetch(url)
            const json = await res.json()
            if (json.message) return { error: `Mapbox: ${json.message}` }
            const feature = json.features?.[0]
            if (feature?.center) { const [lng, lat] = feature.center; return { lat, lng } }
          } catch {}
        }
      }
      if (googleKey) {
        try {
          const url  = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`
          const res  = await fetch(url)
          const json = await res.json()
          if (json.status === 'OK' && json.results?.[0]?.geometry?.location) {
            const { lat, lng } = json.results[0].geometry.location
            return { lat, lng }
          }
          return { error: `Google: ${json.status}${json.error_message ? ` — ${json.error_message}` : ''}` }
        } catch (e: any) { return { error: e.message } }
      }
      return { error: 'no results' }
    }

    try {
      const sb = getSupabase()
      const { data: ungeocoded, error } = await sb
        .from('accounts')
        .select('id, name, address')
        .not('address', 'is', null)
        .neq('address', '')
        .or('lat.is.null,lng.is.null,lat.eq.0,lng.eq.0')

      if (error) { setGeocodeMsg(`Error: ${error.message}`); return }
      if (!ungeocoded?.length) { setGeocodeMsg('All accounts already geocoded'); return }

      let updated = 0; let failed = 0
      const firstError: string[] = []
      for (const acct of ungeocoded) {
        const result = await tryGeocode(acct.address)
        if ('error' in result) {
          failed++
          if (firstError.length < 2) firstError.push(`${acct.name}: ${result.error}`)
          console.warn('[geocode] FAIL', acct.name, '|', acct.address, '→', result.error)
        } else {
          const { error: updateErr } = await sb.from('accounts').update({ lat: result.lat, lng: result.lng }).eq('id', acct.id)
          if (updateErr) {
            failed++
            if (firstError.length < 2) firstError.push(`${acct.name}: save failed — ${updateErr.message}`)
            console.error('[geocode] SAVE FAIL', acct.name, updateErr.message)
          } else {
            updated++
            setGeocodeMsg(`Geocoding… ${updated} done`)
          }
        }
        await new Promise(r => setTimeout(r, 150))
      }
      const detail = firstError.length ? ` — ${firstError[0]}` : ''
      setGeocodeMsg(failed === 0
        ? `Geocoded all ${updated} accounts`
        : `${updated}/${ungeocoded.length} geocoded${detail}`)
    } catch (e: any) {
      setGeocodeMsg(`Error: ${e.message}`)
    } finally {
      setGeocoding(false)
    }
  }

  const orderMap = useMemo(() => {
    const m: Record<string, { lastDate: string; revenue: number }> = {}
    for (const o of orders as any[]) {
      const total = (o.po_line_items?.reduce((s: number, li: any) => s + (Number(li.total) || 0), 0)) || Number(o.total_amount) || 0
      const d = o.sent_at || o.created_at
      if (!m[o.account_id]) m[o.account_id] = { lastDate: d, revenue: total }
      else { m[o.account_id].revenue += total; if (d > m[o.account_id].lastDate) m[o.account_id].lastDate = d }
    }
    return m
  }, [orders])

  const brandMap = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const v of visits)        { if (!m[v.account_id]) m[v.account_id] = new Set(); m[v.account_id].add(v.client_slug) }
    for (const o of orders as any[]) { if (!m[o.account_id]) m[o.account_id] = new Set(); m[o.account_id].add(o.client_slug) }
    return m
  }, [visits, orders])

  const maxRev = useMemo(() => Math.max(...Object.values(orderMap).map(x => x.revenue), 1), [orderMap])

  const clientSlugs = useMemo(() => clients.map((c: Client) => c.slug), [clients])

  const demandMap = useMemo(() =>
    buildDemandMap(orders as any[], accounts.map((a: any) => a.id), clientSlugs),
    [orders, accounts, clientSlugs]
  )

  const intelMap = useMemo(() =>
    buildIntelMap({
      accountIds:    accounts.map((a: any) => a.id),
      allVisits:     visits as any[],
      allPlacements: placements as any[],
      allOrders:     orders as any[],
      clientSlugs,
      demandMap,
    }),
    [accounts, visits, placements, orders, clientSlugs, demandMap]
  )

  const stageCounts = useMemo(() => buildFunnelSummary(intelMap), [intelMap])

  const recencyCounts = useMemo(() => {
    const now = Date.now()
    const c: Record<string, number> = { d30: 0, d90: 0, d180: 0, old: 0, none: 0 }
    for (const a of accounts) {
      const o = orderMap[a.id]
      if (!o) { c.none++; continue }
      const age = now - new Date(o.lastDate).getTime()
      if (age < 30  * 86400000) c.d30++
      else if (age < 90  * 86400000) c.d90++
      else if (age < 180 * 86400000) c.d180++
      else c.old++
    }
    return c
  }, [accounts, orderMap])

  const coverage30 = useMemo(() => {
    if (!accounts.length) return 0
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
    const ids = new Set(visits.filter(v => v.visited_at >= cutoff).map(v => v.account_id))
    return Math.round((ids.size / accounts.length) * 100)
  }, [accounts, visits])

  const activeBuyers = useMemo(() => {
    const cutoff = Date.now() - 90 * 86400000
    return Object.values(orderMap).filter(o => new Date(o.lastDate).getTime() > cutoff).length
  }, [orderMap])

  const urgentCount = useMemo(() =>
    Object.values(intelMap).filter(i => ['urgent', 'cooling'].includes(i.signal)).length,
    [intelMap]
  )

  const filtered = useMemo(() => {
    const now = Date.now()
    const arr = accounts.filter((a: any) => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false
      if (typeFilter !== 'all' && a.account_type !== typeFilter) return false
      if (brandFilter !== 'all' && !brandMap[a.id]?.has(brandFilter)) return false
      if (stageFilter !== 'all' && intelMap[a.id]?.stage !== stageFilter) return false
      if (recencyFilter !== 'all') {
        const o = orderMap[a.id]
        if (recencyFilter === 'none') { if (o) return false }
        else {
          if (!o) return false
          const age = now - new Date(o.lastDate).getTime()
          if (recencyFilter === 'd30'  && age >= 30  * 86400000) return false
          if (recencyFilter === 'd90'  && (age < 30 * 86400000 || age >= 90 * 86400000)) return false
          if (recencyFilter === 'd180' && (age < 90 * 86400000 || age >= 180 * 86400000)) return false
          if (recencyFilter === 'old'  && age < 180 * 86400000) return false
        }
      }
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a: any, b: any) => {
      if (sortKey === 'urgency') {
        const ia = intelMap[a.id]; const ib = intelMap[b.id]
        if (!ia || !ib) return 0
        return compareByUrgency(ia, ib)
      }
      if (sortKey === 'name') return dir * a.name.localeCompare(b.name)
      if (sortKey === 'lastVisit') return dir * ((a.last_visited ?? '').localeCompare(b.last_visited ?? ''))
      if (sortKey === 'lastOrder') return dir * ((orderMap[a.id]?.lastDate ?? '').localeCompare(orderMap[b.id]?.lastDate ?? ''))
      if (sortKey === 'revenue')   return dir * ((orderMap[a.id]?.revenue ?? 0) - (orderMap[b.id]?.revenue ?? 0))
      return 0
    })
    return arr
  }, [accounts, search, typeFilter, brandFilter, stageFilter, recencyFilter, sortKey, sortDir, orderMap, brandMap, intelMap])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
    ? (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
    : null

  const colHdr = (k: SortKey): React.CSSProperties => ({
    fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em',
    color: sortKey === k ? v3.amberLight : v3.text.muted,
    cursor: 'pointer', background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 3,
    transition: 'color 120ms', fontFamily: v3.font.ui,
  })

  const isAdminOrOwner = ['owner', 'admin'].includes(profile?.role || '')

  return (
    <div style={{ padding: '16px 28px 0', maxWidth: 1400, margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: 0, lineHeight: 1 }}>Territory</h1>
        </div>

        <div style={{ display: 'flex', gap: 0, flex: 1, minWidth: 0 }}>
          {[
            { label: 'Total',         value: accounts.length,  color: v3.text.secondary, sub: 'accounts' },
            { label: 'Urgent',        value: urgentCount,      color: urgentCount > 0 ? v3.status.danger : v3.text.muted, sub: 'need attention' },
            { label: 'Active Buyers', value: activeBuyers,     color: v3.amber,           sub: 'ordered <90d' },
            { label: 'Coverage',      value: `${coverage30}%`, color: v3.status.info,     sub: 'visited 30d' },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ paddingRight: i < arr.length - 1 ? 20 : 0, borderRight: i < arr.length - 1 ? `1px solid ${v3.border.subtle}` : 'none', marginRight: i < arr.length - 1 ? 20 : 0, flexShrink: 0 }}>
              <div style={{ fontSize: '8px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 3, fontFamily: v3.font.ui }}>{s.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span className="v3-mono" style={{ fontSize: '22px', fontWeight: 900, color: s.color, lineHeight: 1, letterSpacing: '-0.03em' }}>{s.value}</span>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.40)' }}>{s.sub}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', background: v3.bg.sheet, borderRadius: v3.radius.md, padding: 3, border: `1px solid ${v3.border.default}` }}>
            {([
              { id: 'list', icon: List, label: 'List' },
              { id: 'map',  icon: Map,  label: 'Map'  },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setViewMode(id)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: v3.radius.sm, border: 'none',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: v3.font.ui,
                background: viewMode === id ? v3.bg.elevated : 'transparent',
                color: viewMode === id ? v3.amberLight : v3.text.muted,
                transition: 'all 120ms',
              }}><Icon size={12} />{label}</button>
            ))}
          </div>
          {isAdminOrOwner && (
            <button onClick={handleGeocodeAll} disabled={geocoding} title="Geocode accounts for map view"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'transparent', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, cursor: geocoding ? 'default' : 'pointer', fontSize: '12px', fontWeight: 600, color: v3.text.muted, opacity: geocoding ? 0.5 : 1, fontFamily: v3.font.ui }}>
              <LocateFixed size={12} />{geocoding ? 'Geocoding…' : 'Geocode'}
            </button>
          )}
          <button onClick={() => setShowAddAccount(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: v3.amberDim, border: `1px solid ${v3.amber}40`, borderRadius: v3.radius.md, cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: v3.amberLight }}>
            <Plus size={13} /> Add Account
          </button>
        </div>
      </div>

      {geocodeMsg && (
        <div style={{ fontSize: '11px', color: geocodeMsg.startsWith('Error') ? v3.status.danger : v3.status.success, marginBottom: 8, padding: '6px 12px', background: geocodeMsg.startsWith('Error') ? `${v3.status.danger}10` : `${v3.status.success}10`, borderRadius: v3.radius.sm, border: `1px solid ${geocodeMsg.startsWith('Error') ? v3.status.danger : v3.status.success}22`, flexShrink: 0 }}>
          {geocodeMsg}
        </div>
      )}

      {/* ── Filter row ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={13} color={v3.text.muted} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search accounts…"
            style={{ background: 'transparent', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.primary, fontSize: '13px', padding: '8px 10px 8px 30px', outline: 'none', width: '100%', boxSizing: 'border-box' as any, fontFamily: v3.font.ui }} />
        </div>
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
          style={{ background: v3.bg.sheet, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.secondary, fontSize: '12px', padding: '8px 10px', cursor: 'pointer', outline: 'none', colorScheme: 'dark' as any }}>
          <option value="all">All Brands</option>
          {clients.map((c: Client) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}
          style={{ background: v3.bg.sheet, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.secondary, fontSize: '12px', padding: '8px 10px', cursor: 'pointer', outline: 'none', colorScheme: 'dark' as any }}>
          <option value="all">All Types</option>
          <option value="on_premise">On-Premise</option>
          <option value="off_premise">Off-Premise</option>
        </select>
      </div>

      {/* ── Stage filter pills ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: v3.font.ui, flexShrink: 0 }}>Stage</span>
        <button onClick={() => setStageFilter('all')} style={{
          padding: '4px 10px', borderRadius: v3.radius.full, fontSize: '11px', fontWeight: 700, cursor: 'pointer',
          border: `1px solid ${stageFilter === 'all' ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.09)'}`,
          background: stageFilter === 'all' ? 'rgba(255,255,255,0.07)' : 'transparent',
          color: stageFilter === 'all' ? v3.text.secondary : v3.text.muted, transition: 'all 120ms',
        }}>All <span style={{ opacity: 0.6, fontSize: '10px' }}>{accounts.length}</span></button>
        {(['prospect', 'warming', 'placed', 'velocity', 'champion', 'stalled'] as AccountStage[]).map(s => {
          const c = STAGE_COLOR[s]
          const count = stageCounts[s] ?? 0
          const sel = stageFilter === s
          return (
            <button key={s} onClick={() => setStageFilter(sel ? 'all' : s)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: v3.radius.full, fontSize: '11px', fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${sel ? c + '60' : 'rgba(255,255,255,0.09)'}`,
              background: sel ? c + '14' : 'transparent',
              color: sel ? c : v3.text.muted,
              transition: 'all 120ms', opacity: count === 0 ? 0.35 : 1,
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: c, flexShrink: 0 }} />
              {STAGE_LABEL[s]}
              <span style={{ opacity: 0.65, fontSize: '10px' }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* ── Order recency pills ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: v3.font.ui, flexShrink: 0 }}>Last Order</span>
        {RECENCY_OPTIONS.map(r => {
          const count = recencyCounts[r.id] ?? 0
          const isActive = recencyFilter === r.id
          return (
            <button key={r.id} onClick={() => setRecencyFilter(isActive ? 'all' : r.id)} title={r.desc}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: v3.radius.full, cursor: 'pointer',
                border: `1px solid ${r.color}${isActive ? '60' : '28'}`,
                background: isActive ? r.color + '18' : 'transparent',
                fontSize: '11px', fontWeight: 700, color: isActive ? r.color : 'rgba(255,255,255,0.50)',
                transition: 'all 120ms', opacity: count === 0 ? 0.4 : 1,
              }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 900 }}>{count}</span>
              <span style={{ fontWeight: 600, opacity: 0.85 }}>{r.label}</span>
            </button>
          )
        })}
        {recencyFilter !== 'all' && (
          <button onClick={() => setRecencyFilter('all')} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '11px', fontWeight: 700, padding: '2px 6px' }}>Clear ×</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: v3.text.muted, fontFamily: 'monospace' }}>{filtered.length} of {accounts.length}</span>
      </div>

      {/* ── Map view ─────────────────────────────────────────────────────── */}
      {viewMode === 'map' && (
        <div style={{ flex: 1, minHeight: 0, paddingBottom: 16 }}>
          <TerritoryMap accounts={filtered} intelMap={intelMap} />
        </div>
      )}

      {/* ── List view ────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '0 12px', padding: '7px 16px', borderBottom: `1px solid ${v3.border.subtle}`, flexShrink: 0 }}>
            <div />
            <button onClick={() => toggleSort('name')}      style={colHdr('name')}>Account <SortIcon k="name" /></button>
            <div style={{ fontSize: '10px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: v3.font.ui }}>Type</div>
            <button onClick={() => toggleSort('urgency')}   style={colHdr('urgency')}>Stage <SortIcon k="urgency" /></button>
            <button onClick={() => toggleSort('lastVisit')} style={colHdr('lastVisit')}>Last Visit <SortIcon k="lastVisit" /></button>
            <button onClick={() => toggleSort('lastOrder')} style={colHdr('lastOrder')}>Last Order <SortIcon k="lastOrder" /></button>
            <button onClick={() => toggleSort('revenue')}   style={colHdr('revenue')}>Revenue <SortIcon k="revenue" /></button>
            <div style={{ fontSize: '10px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: v3.font.ui }}>Brands</div>
            <div />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {acctLoading
              ? <div style={{ padding: '32px', textAlign: 'center', color: v3.text.muted, fontSize: '14px' }}>Loading accounts…</div>
              : filtered.length === 0
              ? <div style={{ padding: '32px', textAlign: 'center', color: v3.text.muted, fontSize: '14px' }}>No accounts match these filters.</div>
              : filtered.map((a: any) => (
                <AccountRow key={a.id}
                  account={a}
                  orderData={orderMap[a.id]}
                  lastVisit={a.last_visited ?? null}
                  brandSlugs={[...(brandMap[a.id] ?? [])].filter(Boolean)}
                  clients={clients}
                  maxRev={maxRev}
                  intel={intelMap[a.id]}
                />
              ))
            }
          </div>
        </div>
      )}

      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} />}
    </div>
  )
}
