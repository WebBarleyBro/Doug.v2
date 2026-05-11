'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '../../lib/supabase'
import { getPortalData, submitClientSuggestion, getClientFiles, uploadClientFile } from '../../lib/data'
import { formatShortDateMT, startOfMonthMT } from '../../lib/formatters'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  MapPin, LogOut, ChevronRight, CheckCircle,
  Upload, FileDown, Download, X, PanelRightOpen,
} from 'lucide-react'
import type { ClientFile, ClientFileType } from '../../lib/types'
import { clientLogoUrl } from '../../lib/constants'

// ── Constants ─────────────────────────────────────────────────────────────────

const SUGGESTION_REASONS = [
  { value: 'inbound_request',  label: 'They reached out asking for us' },
  { value: 'competitor_gap',   label: 'Gap / opportunity I noticed on-premise' },
  { value: 'warm_referral',    label: 'Referred by someone in the industry' },
  { value: 'staff_fan',        label: 'Staff or bartender expressed interest' },
  { value: 'strategic_fit',    label: 'High-volume account, strong fit for the brand' },
  { value: 'other',            label: 'Other reason' },
]
const STATUS_COLOR: Record<string, string> = {
  'Will Order Soon':  '#a08440',
  'Just Ordered':     '#5a9ea0',
  'Needs Follow Up':  '#bf7850',
  'Not Interested':   'rgba(255,255,255,0.18)',
  'Menu Feature Won': '#c4a46e',
  'New Placement':    '#5a9ea0',
  'General Check-In': 'rgba(255,255,255,0.28)',
  'Tasted':           '#c4a46e',
}
const PLAC_COLORS: Record<string, string> = {
  committed: '#a08440', ordered: 'rgba(255,255,255,0.45)', on_shelf: '#5a9ea0', reordering: '#c4a46e',
}
const PLAC_LABELS: Record<string, string> = {
  committed: 'Committed', ordered: 'Ordered', on_shelf: 'On Shelf', reordering: 'Reordering',
}
const WIN   = new Set(['Just Ordered', 'Menu Feature Won', 'New Placement'])
const HOT   = new Set(['Will Order Soon', 'Needs Follow Up'])

// Lower number = more significant; used to pick best visit when deduping by account+day
const STATUS_RANK: Record<string, number> = {
  'New Placement': 0, 'Menu Feature Won': 0, 'Just Ordered': 0,
  'Will Order Soon': 1, 'Needs Follow Up': 1, 'Tasted': 2,
  'General Check-In': 3, 'Not Interested': 4,
}
function dedupeByAccountDay(vs: any[]): any[] {
  const seen = new Map<string, any>()
  for (const v of vs) {
    const key = `${v.account_id}__${String(v.visited_at).slice(0, 10)}`
    const ex = seen.get(key)
    if (!ex || (STATUS_RANK[v.status] ?? 5) < (STATUS_RANK[ex.status] ?? 5)) seen.set(key, v)
  }
  return [...seen.values()].sort((a, b) => String(b.visited_at).localeCompare(String(a.visited_at)))
}

// Client-facing order status — hides internal "sent" label
const CLIENT_ORDER_STATUS: Record<string, string | null> = {
  sent: null, fulfilled: 'Delivered', cancelled: 'Cancelled',
}

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ to, duration = 850 }: { to: number; duration?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (to === 0) { setN(0); return }
    const t0 = Date.now()
    const tick = () => {
      const p = Math.min((Date.now() - t0) / duration, 1)
      setN(Math.round((1 - Math.pow(1 - p, 3)) * to))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [to, duration])
  return <>{n}</>
}

// ── Glass panel ───────────────────────────────────────────────────────────────
function Glass({ style, children, className }: { style?: React.CSSProperties; children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      background: 'rgba(10,8,5,0.90)',
      backdropFilter: 'blur(22px)',
      WebkitBackdropFilter: 'blur(22px)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.05)',
      ...style,
    }}>{children}</div>
  )
}

// ── Right-side drawer ─────────────────────────────────────────────────────────
function Drawer({ title, count, onClose, accent, children }: {
  title: string; count?: number; onClose: () => void; accent: string; children: React.ReactNode
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 480,
        background: 'rgba(10,8,5,0.98)', backdropFilter: 'blur(24px)',
        borderLeft: `1px solid rgba(255,255,255,0.08)`,
        boxShadow: '-8px 0 48px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.22s cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Drawer header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4, display: 'flex', alignItems: 'center' }}>
            <X size={14} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f0', letterSpacing: '-0.01em' }}>{title}</span>
          {count != null && (
            <span style={{ fontSize: 11, fontWeight: 700, color: accent, background: accent + '18', padding: '2px 8px', borderRadius: 20, border: `1px solid ${accent}28`, marginLeft: 2 }}>{count}</span>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

// ── Main portal ───────────────────────────────────────────────────────────────
export default function ClientPortalPage() {
  const { slug } = useParams() as { slug: string }

  const [data,      setData]      = useState<any>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [isPreview, setIsPreview] = useState(false)
  const [dateRange, setDateRange] = useState<'7d'|'30d'|'90d'|'all'>('90d')
  const [visitFilter, setVisitFilter] = useState<'all'|'wins'|'action'>('all')
  const [feedLimit,   setFeedLimit]   = useState(20)
  const [drawer, setDrawer] = useState<string|null>(null)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [winsExpanded,  setWinsExpanded]  = useState(false)
  const [ordersExpanded, setOrdersExpanded] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawer(null); setAnalyticsOpen(false) } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([])

  // Map
  const mapRef        = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const [mapReady,    setMapReady]    = useState(false)
  const [mapAccounts, setMapAccounts] = useState<any[]>([])

  // Files
  const [clientFiles,    setClientFiles]    = useState<ClientFile[]>([])
  const [filesLoading,   setFilesLoading]   = useState(false)
  const [fileUploading,  setFileUploading]  = useState(false)
  const [showFileUpload, setShowFileUpload] = useState(false)
  const [fileUploadType, setFileUploadType] = useState<ClientFileType>('other')
  const [fileUploadDesc, setFileUploadDesc] = useState('')
  const [fileUploadExpiry, setFileUploadExpiry] = useState('')
  const [fileUploadErr,  setFileUploadErr]  = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Suggest
  const [suggestType,  setSuggestType]  = useState<'account'|'contact'>('account')
  const [suggestForm,  setSuggestForm]  = useState({ name:'', address:'', contact_email:'', reason:'', notes:'', submitted_by_name:'', submitted_by_email:'' })
  const suggestNameRef = useRef<HTMLInputElement>(null)
  const suggestAcRef   = useRef<any>(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [submitted,    setSubmitted]    = useState(false)
  const [suggestErr,   setSuggestErr]   = useState('')

  // ── Auth + load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null
      if (!user) { window.location.replace(`/login?redirect=/portal/${slug}`); return }
      const { data: profile } = await sb.from('user_profiles').select('role, client_slug').eq('id', user.id).single()
      const isStaff  = ['owner','admin','rep','intern'].includes(profile?.role)
      const isPortal = profile?.role === 'portal'
      if (!isStaff && !isPortal) { setError('Access denied'); setLoading(false); return }
      if (isPortal && profile?.client_slug && profile.client_slug !== slug) {
        setError(`Access denied — this portal is for ${profile.client_slug}.`); setLoading(false); return
      }
      if (isStaff) setIsPreview(true)
      try {
        const d = await getPortalData(slug)
        if (!d) { setError('Brand not found'); setLoading(false); return }
        setData(d)
        sb.from('events').select('id,title,event_type,start_time,accounts(name)')
          .eq('client_slug', slug).gt('start_time', new Date().toISOString())
          .order('start_time').limit(5)
          .then(({ data: ev }) => setUpcomingEvents(ev || []))
        setFilesLoading(true)
        getClientFiles(slug).then(f => { setClientFiles(f); setFilesLoading(false) }).catch(() => setFilesLoading(false))
        const clientAccountIds = new Set([
          ...(d.visits    || []).map((v: any) => v.account_id),
          ...(d.placements || []).map((p: any) => p.account_id),
        ])
        sb.from('accounts').select('id,name,account_type,lat,lng').not('lat','is',null)
          .then(({ data: accs }) => {
            setMapAccounts((accs || []).filter((a: any) => clientAccountIds.has(a.id)))
          })
      } catch { setError('Failed to load data') }
      finally { setLoading(false) }
    })
  }, [slug])

  // ── Mapbox ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || !mapRef.current || mapInstanceRef.current) return
    import('mapbox-gl').then(({ default: mb }) => {
      mb.accessToken = token
      const map = new mb.Map({
        container: mapRef.current!,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-104.9903, 39.7392],
        zoom: 8,
        attributionControl: false,
      })
      map.addControl(new mb.NavigationControl({ showCompass: false }), 'top-left')
      mapInstanceRef.current = map
      map.on('load', () => setMapReady(true))
    }).catch(() => {})
    return () => { mapInstanceRef.current?.remove(); mapInstanceRef.current = null }
  }, [data])

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !mapAccounts.length || !data) return
    const accent  = data.client?.color || '#c4a46e'
    const placed  = new Set((data.placements || []).map((p: any) => p.account_id))
    const coords: [number, number][] = []
    document.querySelectorAll('.portal-pin').forEach(el => el.remove())
    mapAccounts.forEach((acc: any) => {
      if (!acc.lat || !acc.lng) return
      coords.push([acc.lng, acc.lat])
      const isPlaced = placed.has(acc.id)
      const el = document.createElement('div')
      el.className = 'portal-pin'
      el.style.cssText = `
        width:${isPlaced?'14px':'9px'};height:${isPlaced?'14px':'9px'};
        border-radius:50%;cursor:pointer;
        background:${isPlaced ? accent : 'rgba(255,255,255,0.5)'};
        box-shadow:${isPlaced ? `0 0 18px ${accent}90,0 0 6px ${accent}` : 'none'};
        border:2px solid ${isPlaced ? accent+'cc' : 'rgba(255,255,255,0.3)'};
        transition:transform 150ms;
      `
      el.onmouseenter = () => { el.style.transform = 'scale(1.5)' }
      el.onmouseleave = () => { el.style.transform = 'scale(1)' }
      import('mapbox-gl').then(({ default: mb }) => {
        new mb.Marker({ element: el }).setLngLat([acc.lng, acc.lat])
          .setPopup(new mb.Popup({ offset: 14, closeButton: false })
            .setHTML(`<div style="font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;color:#fff">${acc.name}</div><div style="font-size:10px;color:#888;margin-top:3px">${isPlaced ? '● Active placement' : acc.account_type === 'on_premise' ? 'On-premise' : 'Off-premise'}</div>`))
          .addTo(mapInstanceRef.current)
      })
    })
    if (coords.length > 1) {
      import('mapbox-gl').then(({ default: mb }) => {
        const bounds = coords.reduce((b, c) => b.extend(c), new mb.LngLatBounds(coords[0], coords[0]))
        mapInstanceRef.current.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 1000 })
      })
    }
  }, [mapReady, mapAccounts, data])

  // ── Google Places ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (drawer !== 'suggest' || suggestType !== 'account') {
      if (suggestAcRef.current && (window as any).google?.maps?.event)
        (window as any).google.maps.event.clearInstanceListeners(suggestAcRef.current)
      suggestAcRef.current = null; return
    }
    let alive = true
    const init = () => {
      if (!alive || !suggestNameRef.current || suggestAcRef.current) return
      suggestAcRef.current = new (window as any).google.maps.places.Autocomplete(suggestNameRef.current, {
        types: ['establishment'], componentRestrictions: { country: 'us' }, fields: ['name','formatted_address'],
      })
      suggestAcRef.current.addListener('place_changed', () => {
        const p = suggestAcRef.current.getPlace()
        setSuggestForm(f => ({ ...f, name: p.name||f.name, address: p.formatted_address||f.address }))
      })
    }
    if (!document.getElementById('gm-script')) {
      const s = document.createElement('script'); s.id = 'gm-script'
      s.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`
      s.async = true; document.head.appendChild(s)
    }
    const iv = setInterval(() => { if ((window as any).google?.maps?.places) { clearInterval(iv); init() } }, 100)
    return () => {
      alive = false; clearInterval(iv)
      if (suggestAcRef.current && (window as any).google?.maps?.event)
        (window as any).google.maps.event.clearInstanceListeners(suggestAcRef.current)
      suggestAcRef.current = null
    }
  }, [drawer, suggestType])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleSuggest() {
    if (!suggestForm.name.trim() || !suggestForm.reason) { setSuggestErr('Name and reason required'); return }
    setSubmitting(true); setSuggestErr('')
    try {
      await submitClientSuggestion({
        client_slug: slug, suggestion_type: suggestType, name: suggestForm.name,
        address: (suggestForm as any).address || undefined,
        contact_email: suggestForm.contact_email || undefined,
        reason: suggestForm.reason, notes: suggestForm.notes || undefined,
        submitted_by_name: suggestForm.submitted_by_name || undefined,
        submitted_by_email: suggestForm.submitted_by_email || undefined,
        contact_category: 'general',
      })
      setSubmitted(true)
    } catch (e: any) { setSuggestErr(e.message || 'Failed to submit') }
    finally { setSubmitting(false) }
  }

  async function handleFileUpload(file: File) {
    setFileUploading(true); setFileUploadErr('')
    try {
      const uploaded = await uploadClientFile(slug, file, {
        file_type: fileUploadType, description: fileUploadDesc||undefined,
        expiry_date: fileUploadExpiry||undefined, uploaded_by_portal: true,
      })
      setClientFiles(prev => [uploaded, ...prev])
      setShowFileUpload(false); setFileUploadDesc(''); setFileUploadExpiry('')
    } catch (e: any) { setFileUploadErr(e.message || 'Upload failed') }
    finally { setFileUploading(false) }
  }

  function handlePrint() {
    if (!data) return
    const { client: cl, visits: vs, placements: pls, orders: ords } = data
    const mStart   = startOfMonthMT()
    const mVisits  = vs.filter((v: any) => v.visited_at >= mStart).length
    const actPlac  = pls.filter((p: any) => !p.lost_at)
    const nonDraft = ords.filter((o: any) => o.status !== 'draft')
    const dateStr  = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const name     = (cl?.name || slug).replace(/</g, '&lt;')
    const html = `<!DOCTYPE html><html><head><title>${name} — Field Report</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
body{font-family:'Space Grotesk',sans-serif;color:#111;max-width:860px;margin:0 auto;padding:40px;background:#fff}
.brand{font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:800;letter-spacing:-0.04em;margin:0 0 4px}
.meta{color:#888;font-size:13px;margin-bottom:28px}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}
.kpi{border:1px solid #eee;border-radius:8px;padding:14px 16px}
.kpi-n{font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:800;color:#111;letter-spacing:-0.04em;line-height:1}
.kpi-l{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px}
h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;border-bottom:1px solid #eee;padding-bottom:8px;margin:28px 0 12px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:12px}
th{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#aaa}
.chip{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;text-transform:uppercase;letter-spacing:.04em}
</style>
</head><body>
<div class="brand">${name}</div>
<div class="meta">Field Report — Barley Bros · ${dateStr}</div>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-l">Visits This Month</div><div class="kpi-n">${mVisits}</div></div>
  <div class="kpi"><div class="kpi-l">Active Placements</div><div class="kpi-n">${actPlac.length}</div></div>
  <div class="kpi"><div class="kpi-l">${cl?.order_type === 'distributor' ? 'Inquiries' : 'Orders'}</div><div class="kpi-n">${nonDraft.length}</div></div>
  <div class="kpi"><div class="kpi-l">Wins (90d)</div><div class="kpi-n">${vs.filter((v: any) => WIN.has(v.status)).length}</div></div>
</div>
${vs.length > 0 ? `<h2>Field Activity</h2><table><thead><tr><th>Account</th><th>Outcome</th><th>Date</th><th>Notes</th></tr></thead><tbody>${vs.slice(0,30).map((v: any) => `<tr><td>${v.accounts?.name||''}</td><td>${v.status}</td><td>${formatShortDateMT(v.visited_at)}</td><td>${v.notes||''}</td></tr>`).join('')}</tbody></table>` : ''}
${actPlac.length > 0 ? `<h2>Active Placements</h2><table><thead><tr><th>Account</th><th>Product</th><th>Status</th></tr></thead><tbody>${actPlac.map((p: any) => `<tr><td>${p.accounts?.name||''}</td><td>${p.product_name}</td><td>${p.status}</td></tr>`).join('')}</tbody></table>` : ''}
</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500) }
  }

  // ── Loading / error ───────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#070502', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Space Grotesk, sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.06)', borderTopColor: '#c4a46e', animation: 'spin .7s linear infinite', margin: '0 auto 14px' }} />
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading brand data…</div>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#070502', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Space Grotesk, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#e85540', marginBottom: 12 }}>{error}</div>
        <button onClick={() => { getSupabase().auth.signOut(); window.location.href = '/login' }} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Sign in again</button>
      </div>
    </div>
  )

  // ── Derived ───────────────────────────────────────────────────────────────────
  const { client, visits: rawVisits, placements, orders, campaigns, registrations } = data
  const accent    = client?.color || '#c4a46e'
  const logoUrl   = client ? clientLogoUrl(client) : null
  const isDistClient = client?.order_type === 'distributor'

  // Deduplicate visits by account+day, keeping the most significant status
  const visits = dedupeByAccountDay(rawVisits)

  const drDays   = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : null
  const drStart  = drDays ? new Date(Date.now() - drDays * 86400000).toISOString().slice(0, 10) : null
  const drVisits = drStart ? visits.filter((v: any) => String(v.visited_at).slice(0,10) >= drStart) : visits
  const drOrders = (drStart ? orders.filter((o: any) => String(o.created_at||'').slice(0,10) >= drStart) : orders).filter((o: any) => o.status !== 'draft')

  const activePlac     = placements.filter((p: any) => !p.lost_at)
  const onShelf        = activePlac.filter((p: any) => p.status === 'on_shelf' || p.status === 'reordering')
  const drWins         = drVisits.filter((v: any) => WIN.has(v.status))
  const drHot          = drVisits.filter((v: any) => HOT.has(v.status))
  const drInProgress   = new Set(drHot.map((v: any) => v.account_id).filter(Boolean)).size

  const filteredVisits = visitFilter === 'wins' ? drWins : visitFilter === 'action' ? drHot : drVisits
  const feedVisits     = filteredVisits.slice(0, feedLimit)

  const placBreakdown  = ['on_shelf','reordering','ordered','committed']
    .map(s => ({ s, l: PLAC_LABELS[s], c: PLAC_COLORS[s], n: activePlac.filter((p: any) => p.status === s).length }))
    .filter(g => g.n > 0)

  // 12-week chart
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const wEnd = new Date(); wEnd.setDate(wEnd.getDate() - (11 - i) * 7)
    const wStart = new Date(wEnd); wStart.setDate(wStart.getDate() - 6)
    const s = wStart.toISOString().slice(0,10), e = wEnd.toISOString().slice(0,10)
    return {
      label: wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: visits.filter((v: any) => { const d = String(v.visited_at).slice(0,10); return d >= s && d <= e }).length,
    }
  })

  const expiringRegs = registrations.filter((r: any) => {
    if (!r.expiry_date || r.status === 'expired') return false
    return (new Date(r.expiry_date).getTime() - Date.now()) < 60 * 86400000
  })

  const hasMap = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  // ── Data hub derivations ──────────────────────────────────────────────────────
  const outcomeCounts = Object.entries(
    drVisits.reduce((acc: Record<string, number>, v: any) => {
      if (v.status) acc[v.status] = (acc[v.status] || 0) + 1
      return acc
    }, {})
  )
    .map(([s, n]) => ({ s, n: n as number, c: STATUS_COLOR[s] || 'rgba(255,255,255,0.25)' }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 7)

  const maxOutcome = Math.max(1, ...outcomeCounts.map(o => o.n))

  const recentWins = drVisits.filter((v: any) => WIN.has(v.status)).slice(0, 12)

  // 12-week wins trend (for expanded chart)
  const winChartData = Array.from({ length: 12 }, (_, i) => {
    const wEnd = new Date(); wEnd.setDate(wEnd.getDate() - (11 - i) * 7)
    const wStart = new Date(wEnd); wStart.setDate(wStart.getDate() - 6)
    const s = wStart.toISOString().slice(0, 10), e = wEnd.toISOString().slice(0, 10)
    return {
      label: wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      visits: visits.filter((v: any) => { const d = String(v.visited_at).slice(0, 10); return d >= s && d <= e }).length,
      wins:   visits.filter((v: any) => { const d = String(v.visited_at).slice(0, 10); return d >= s && d <= e && WIN.has(v.status) }).length,
    }
  })

  // ── KPI data ─────────────────────────────────────────────────────────────────
  const kpis = [
    { label: 'Visits',                              value: drVisits.length,   color: accent },
    { label: 'Active Placements',                   value: activePlac.length, color: '#5a9ea0' },
    { label: 'On Shelf',                            value: onShelf.length,    color: '#c4a46e' },
    { label: 'In Progress',                         value: drInProgress,      color: '#a08440' },
    { label: isDistClient ? 'Inquiries' : 'Orders', value: drOrders.length,   color: 'rgba(255,255,255,0.70)' },
    { label: 'Wins',                                value: drWins.length,     color: '#5a9ea0' },
  ]

  const F    = '"Space Grotesk",-apple-system,sans-serif'
  const MONO = '"JetBrains Mono",ui-monospace,monospace'

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: '#070502', color: '#f0f0f0', fontFamily: F, position: 'relative' }}>

      {/* Global styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&display=swap');
        @keyframes spin       { to { transform: rotate(360deg) } }
        @keyframes slideInRight { from { transform: translateX(48px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes fadeInLeft { from { opacity: 0; transform: translateX(-12px) } to { opacity: 1; transform: translateX(0) } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.96) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        .hub-fade { animation: popIn 0.22s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes countUp    { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        .kpi-hover { transition: transform 180ms, box-shadow 180ms !important; }
        .kpi-hover:hover { transform: translateY(-2px) !important; }
        .vrow:hover { background: rgba(255,255,255,0.03) !important; }
        .quick-link:hover { background: rgba(255,255,255,0.05) !important; border-color: rgba(255,255,255,0.12) !important; }
        .mapboxgl-popup-content { background: rgba(10,8,5,0.97) !important; backdrop-filter: blur(12px) !important; border: 1px solid rgba(255,255,255,0.1) !important; border-radius: 8px !important; padding: 10px 14px !important; color: #fff !important; box-shadow: 0 4px 24px rgba(0,0,0,0.7) !important; }
        .mapboxgl-popup-tip { border-top-color: rgba(10,8,5,0.97) !important; }
        .portal-pin { transition: transform 150ms; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      {/* MAP — full screen background */}
      {hasMap && <div ref={mapRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />}

      {/* Dark overlay when no map */}
      {!hasMap && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #070502, #060c18)', zIndex: 0 }} />}

      {/* Gradient overlay over map for readability */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: `radial-gradient(ellipse 60% 80% at 30% 50%, transparent 20%, rgba(4,8,18,0.55) 100%), linear-gradient(180deg, rgba(4,8,18,0.7) 0%, rgba(4,8,18,0.2) 15%, rgba(4,8,18,0.2) 80%, rgba(4,8,18,0.7) 100%)` }} />

      {/* ── STAFF PREVIEW BANNER ─────────────────────────────────────────── */}
      {isPreview && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(4,8,18,0.96)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${accent}30`, color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 500, padding: '5px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', letterSpacing: '0.02em' }}>
          <span>Staff preview — this is exactly what {client?.name} sees</span>
          <a href={`/v3/brands/${slug}`} style={{ color: accent, textDecoration: 'none', fontSize: 11, fontWeight: 600 }}>← Back to CRM</a>
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <Glass style={{
        position: 'absolute', top: isPreview ? 26 : 0, left: 0, right: 0, zIndex: 10,
        height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
        borderRadius: 0, borderBottom: `1px solid rgba(255,255,255,0.06)`,
      }}>
        {/* Brand identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={client?.name} style={{ height: 28, width: 'auto', maxWidth: 72, objectFit: 'contain' }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 6, background: accent+'22', border: `1px solid ${accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: accent }}>
              {client?.name?.[0]||'B'}
            </div>
          )}
          <div>
            <div style={{ fontFamily: F, fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-0.03em' }}>{client?.name}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.14em', marginTop: 1, textTransform: 'uppercase' }}>Barley Bros · Brand Report</div>
          </div>
        </div>

        {/* Period + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Period selector */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 7, padding: '2px', border: `1px solid rgba(255,255,255,0.06)` }}>
            {([['7d','7D'],['30d','30D'],['90d','90D'],['all','All']] as const).map(([k,lbl]) => (
              <button key={k} onClick={() => { setDateRange(k); setFeedLimit(20) }} style={{
                padding: '5px 11px', borderRadius: 5, fontSize: 11, fontWeight: dateRange===k?700:400,
                border: 'none', cursor: 'pointer', transition: 'all 130ms', fontFamily: F,
                background: dateRange===k ? accent : 'transparent',
                color: dateRange===k ? '#000' : 'rgba(255,255,255,0.4)',
              }}>{lbl}</button>
            ))}
          </div>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 6, padding: '5px 10px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 11, fontFamily: F }}>
            <FileDown size={11} /> Report
          </button>
          <button onClick={() => getSupabase().auth.signOut().then(() => { window.location.href = '/login' })} style={{ background: 'none', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 6, padding: '5px 8px', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <LogOut size={11} />
          </button>
        </div>
      </Glass>

      {/* ── LEFT PANEL: KPIs ────────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: (isPreview ? 26 : 0) + 64, left: 16, zIndex: 10, width: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* KPI cards */}
        {kpis.map(({ label, value, color }) => (
          <Glass key={label} className="kpi-hover" style={{ padding: '12px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: F }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color, letterSpacing: '-0.04em', fontFamily: MONO }}>
              <Counter to={value} />
            </div>
          </Glass>
        ))}

        {/* Pipeline mini */}
        {placBreakdown.length > 0 && (
          <Glass style={{ padding: '12px 16px', borderRadius: 10, marginTop: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 10 }}>Pipeline</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {placBreakdown.map(({ s, l, c, n }) => {
                const pct = Math.round(n / activePlac.length * 100)
                return (
                  <div key={s}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>{l}</span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: c, fontFamily: MONO }}>{n}</span>
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 2, boxShadow: `0 0 6px ${c}66`, transition: 'width 700ms cubic-bezier(0,0,0.2,1)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <button onClick={() => setDrawer('placements')} className="quick-link" style={{ marginTop: 12, width: '100%', background: 'none', border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 6, padding: '6px 0', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 10, fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, transition: 'all 120ms' }}>
              See all placements <ChevronRight size={10} />
            </button>
          </Glass>
        )}
      </div>

      {/* ── RIGHT PANEL: Activity feed (floating) ────────────────────────────── */}
      <Glass style={{
        position: 'absolute',
        top: (isPreview ? 26 : 0) + 68,
        right: 14,
        bottom: 14,
        zIndex: 10,
        width: 340,
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>


        {/* Chart + analytics button header */}
        <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Visit Trend · 12 Weeks</div>
            <button
              onClick={() => { setAnalyticsOpen(true); setWinsExpanded(false); setOrdersExpanded(false) }}
              style={{ background: accent + '16', border: `1px solid ${accent}35`, borderRadius: 5, padding: '4px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: accent, transition: 'all 130ms', fontSize: 10, fontFamily: F, fontWeight: 700 }}
            >
              <PanelRightOpen size={11} /> Analytics
            </button>
          </div>
          <ResponsiveContainer width="100%" height={52}>
            <BarChart data={chartData} barSize={10} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 8, fontFamily: F }} axisLine={false} tickLine={false} interval={2} />
              <Tooltip contentStyle={{ background: 'rgba(10,8,5,0.97)', border: `1px solid ${accent}30`, borderRadius: 7, padding: '6px 10px', fontFamily: F }} labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }} itemStyle={{ color: accent, fontFamily: MONO, fontWeight: 700 }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="count" fill={accent} opacity={0.65} radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Activity header + filters */}
        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Field Activity</div>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: MONO }}>{filteredVisits.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {([['all','All'],['wins','Wins'],['action','In Progress']] as const).map(([k,lbl]) => (
              <button key={k} onClick={() => { setVisitFilter(k); setFeedLimit(20) }} style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                border: `1px solid ${visitFilter===k ? accent+'45' : 'rgba(255,255,255,0.07)'}`,
                background: visitFilter===k ? accent+'14' : 'transparent',
                color: visitFilter===k ? accent : 'rgba(255,255,255,0.38)',
                cursor: 'pointer', transition: 'all 110ms', fontFamily: F,
              }}>{lbl}</button>
            ))}
          </div>
        </div>

        {/* Visit rows — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {filteredVisits.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.22)', fontSize: 12 }}>No visits in this period.</div>
          ) : (
            feedVisits.map((v: any) => {
              const c = STATUS_COLOR[v.status] || 'rgba(255,255,255,0.25)'
              const isWin = WIN.has(v.status)
              return (
                <div key={v.id} className="vrow" style={{ display: 'grid', gridTemplateColumns: '3px 1fr', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 110ms' }}>
                  <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: c, opacity: isWin ? 1 : 0.55 }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f0' }}>{v.accounts?.name || 'Unknown'}</span>
                      {isWin && <span style={{ fontSize: 7, fontWeight: 800, color: '#5a9ea0', background: 'rgba(90,158,160,0.12)', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Win</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: c }}>{v.status}</span>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.26)' }}>
                        {new Date(v.visited_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Denver' })}
                      </span>
                    </div>
                    {v.notes && <div style={{ marginTop: 3, fontSize: 11, color: 'rgba(255,255,255,0.38)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{v.notes}</div>}
                  </div>
                </div>
              )
            })
          )}
          {feedLimit < filteredVisits.length && (
            <button
              onClick={() => setFeedLimit(n => n + 20)}
              className="quick-link"
              style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderTop: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F, textAlign: 'center', display: 'block', transition: 'color 110ms' }}
            >
              Show {Math.min(20, filteredVisits.length - feedLimit)} more · {filteredVisits.length - feedLimit} remaining
            </button>
          )}
        </div>

        {/* Quick links for drawers */}
        <div style={{ padding: '8px 12px 10px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[
            drOrders.length > 0 && { key: 'orders',     label: isDistClient ? 'Order Inquiries' : 'Orders',  count: drOrders.length },
            campaigns?.length > 0 && { key: 'campaigns', label: 'Campaigns',        count: campaigns.length },
            registrations?.length > 0 && { key: 'compliance', label: 'State Compliance', count: registrations.length, alert: expiringRegs.length },
            { key: 'files',   label: 'Files & Assets',  count: clientFiles.length || undefined },
            { key: 'suggest', label: 'Suggest an Account', count: undefined },
          ].filter(Boolean).map((item: any) => (
            <button key={item.key} onClick={() => setDrawer(item.key)} className="quick-link" style={{ background: 'none', border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: F, transition: 'all 120ms' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', fontWeight: 500 }}>{item.label}</span>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {item.alert > 0 && <span style={{ fontSize: 8, fontWeight: 700, color: '#e85540', background: 'rgba(232,85,64,0.12)', padding: '1px 5px', borderRadius: 4 }}>⚠ {item.alert}</span>}
                {item.count != null && item.count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: accent }}>{item.count}</span>}
                <ChevronRight size={10} color="rgba(255,255,255,0.22)" />
              </div>
            </button>
          ))}
        </div>
      </Glass>

      {/* ── ANALYTICS OVERLAY (centered modal, no-scroll) ───────────────────── */}
      {analyticsOpen && (() => {
        const winRate = drVisits.length > 0 ? Math.round((drWins.length / drVisits.length) * 100) : 0
        const CARD: React.CSSProperties = { background: 'rgba(255,255,255,0.028)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }
        const SEC_LABEL: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase' as const, letterSpacing: '0.18em', marginBottom: 10, display: 'block' }
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 40px', background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
            <div onClick={() => setAnalyticsOpen(false)} style={{ position: 'absolute', inset: 0 }} />
            <div className="hub-fade" style={{
              position: 'relative', zIndex: 1,
              width: 'min(1080px, calc(100vw - 64px))',
              height: 'min(680px, calc(100vh - 64px))',
              background: 'rgba(9,7,4,0.98)',
              backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: `0 0 0 1px rgba(0,0,0,0.5), 0 32px 80px rgba(0,0,0,0.85), 0 0 60px ${accent}12`,
              borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>

              {/* ── Header ── */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 24, background: 'rgba(255,255,255,0.015)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#f8f6f2', letterSpacing: '-0.03em', fontFamily: F, lineHeight: 1 }}>Analytics</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{client?.name} · {dateRange === 'all' ? 'All time' : `Last ${dateRange}`}</div>
                </div>
                {/* KPI strip */}
                <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                  {[
                    { label: 'Visits',   value: drVisits.length, color: accent },
                    { label: 'Wins',     value: drWins.length,   color: '#5a9ea0' },
                    { label: 'Shelf',    value: onShelf.length,  color: '#c4a46e' },
                    { label: 'Progress', value: drInProgress,    color: '#a08440' },
                    { label: 'Win Rate', value: `${winRate}%`,   color: drWins.length > 0 ? '#5a9ea0' : 'rgba(255,255,255,0.25)' },
                  ].map((k, ki) => (
                    <div key={k.label} style={{ textAlign: 'center', padding: '6px 16px', borderRight: ki < 4 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 3 }}>{k.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: k.color as string, letterSpacing: '-0.04em', fontFamily: MONO, lineHeight: 1 }}>{k.value}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setAnalyticsOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 9px', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>

              {/* ── Body: chart row + 3-col data ── */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '16px 20px', gap: 14 }}>

                {/* Chart (full width) */}
                <div style={{ ...CARD, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={SEC_LABEL}>Visit &amp; Win Trend · 12 Weeks</span>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: accent, opacity: 0.5, flexShrink: 0 }} />Visits</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#5a9ea0', flexShrink: 0 }} />Wins</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={72}>
                    <BarChart data={winChartData} barSize={12} barGap={2} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.22)', fontSize: 8, fontFamily: F }} axisLine={false} tickLine={false} interval={1} />
                      <Tooltip contentStyle={{ background: 'rgba(9,7,4,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontFamily: F }} labelStyle={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Bar dataKey="visits" fill={accent} opacity={0.35} radius={[2,2,0,0]} name="Visits" />
                      <Bar dataKey="wins"   fill="#5a9ea0" opacity={0.90} radius={[2,2,0,0]} name="Wins" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 3-column data row */}
                <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

                  {/* ── Col 1: Visit outcomes ── */}
                  <div style={{ ...CARD, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <span style={SEC_LABEL}>Visit Outcomes</span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                      {outcomeCounts.slice(0, 6).map(({ s, n, c }) => (
                        <div key={s}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.62)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{s}</span>
                            <span style={{ fontSize: 13, fontWeight: 900, color: c, fontFamily: MONO, flexShrink: 0 }}>{n}</span>
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${Math.round((n / maxOutcome) * 100)}%`, background: c, borderRadius: 2, opacity: 0.8, boxShadow: `0 0 6px ${c}44`, transition: 'width 500ms cubic-bezier(0,0,0.2,1)' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Col 2: Placement pipeline ── */}
                  <div style={{ ...CARD, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <span style={SEC_LABEL}>Placement Pipeline · {activePlac.length} active</span>
                    {placBreakdown.length > 0 ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
                        {placBreakdown.map(({ s, l, c, n }) => {
                          const pct = Math.round(n / activePlac.length * 100)
                          return (
                            <div key={s}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.62)', fontWeight: 500 }}>{l}</span>
                                <span style={{ fontSize: 14, fontWeight: 900, color: c, fontFamily: MONO }}>{n}<span style={{ fontSize: 9, fontWeight: 400, color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}>{pct}%</span></span>
                              </div>
                              <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${c}aa, ${c})`, borderRadius: 3, boxShadow: `0 0 8px ${c}55`, transition: 'width 600ms cubic-bezier(0,0,0.2,1)' }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)' }}>No active placements</span>
                      </div>
                    )}
                  </div>

                  {/* ── Col 3: Recent wins + orders (expandable) ── */}
                  <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {/* Recent wins */}
                    <div style={{ ...CARD, flex: recentWins.length > 0 ? 1 : 'none', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
                        <span style={SEC_LABEL}>Recent Wins</span>
                        {recentWins.length > 3 && (
                          <button onClick={() => setWinsExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: accent, fontWeight: 600, fontFamily: F, padding: 0 }}>
                            {winsExpanded ? 'Show less' : `+${recentWins.length - 3} more`}
                          </button>
                        )}
                      </div>
                      {recentWins.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', textAlign: 'center', paddingTop: 8 }}>No wins yet in this period</div>
                      ) : (
                        <div style={{ overflowY: winsExpanded ? 'auto' : 'hidden', flex: 1, minHeight: 0 }}>
                          {(winsExpanded ? recentWins : recentWins.slice(0, 3)).map((v: any, i: number, arr: any[]) => {
                            const c = STATUS_COLOR[v.status] || '#5a9ea0'
                            return (
                              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                <div style={{ width: 3, alignSelf: 'stretch', minHeight: 28, borderRadius: 2, flexShrink: 0, background: `linear-gradient(180deg, ${c}, ${c}77)` }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.accounts?.name || '—'}</div>
                                  <div style={{ fontSize: 10, color: c, fontWeight: 600, marginTop: 1 }}>{v.status}</div>
                                </div>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', flexShrink: 0 }}>{new Date(v.visited_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Denver' })}</div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Orders / inquiries */}
                    {drOrders.length > 0 && (
                      <div style={{ ...CARD, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
                          <span style={SEC_LABEL}>{isDistClient ? 'Order Inquiries' : 'Orders'}</span>
                          {drOrders.length > 3 && (
                            <button onClick={() => setOrdersExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: accent, fontWeight: 600, fontFamily: F, padding: 0 }}>
                              {ordersExpanded ? 'Show less' : `+${drOrders.length - 3} more`}
                            </button>
                          )}
                        </div>
                        <div style={{ overflowY: ordersExpanded ? 'auto' : 'hidden', flex: 1, minHeight: 0 }}>
                          {(ordersExpanded ? drOrders : drOrders.slice(0, 3)).map((o: any, i: number, arr: any[]) => {
                            const statusLabel = CLIENT_ORDER_STATUS[o.status]
                            return (
                              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.80)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.deliver_to_name || 'Order'}</div>
                                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' })}</div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  {o.total_amount > 0 && <div style={{ fontSize: 13, fontWeight: 900, color: accent, fontFamily: MONO, lineHeight: 1 }}>${Number(o.total_amount).toLocaleString()}</div>}
                                  {statusLabel && <div style={{ fontSize: 8, fontWeight: 700, color: statusLabel === 'Delivered' ? '#5a9ea0' : 'rgba(255,255,255,0.28)', textTransform: 'uppercase', marginTop: 2 }}>{statusLabel}</div>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── MAP LEGEND (bottom center) ───────────────────────────────────────── */}
      {hasMap && mapAccounts.length > 0 && (
        <Glass style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10, padding: '7px 14px', borderRadius: 20, display: 'flex', gap: 16, alignItems: 'center', fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${accent}99`, display: 'inline-block' }} />Active placement</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', display: 'inline-block' }} />Visited account</span>
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>{mapAccounts.length} accounts</span>
        </Glass>
      )}

      {/* ── DRAWERS ──────────────────────────────────────────────────────────── */}

      {/* Placements */}
      {drawer === 'placements' && (
        <Drawer title="Active Placements" count={activePlac.length} onClose={() => setDrawer(null)} accent={accent}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activePlac.map((p: any, i: number) => {
              const c = PLAC_COLORS[p.status] || accent
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 12, padding: '11px 0', borderBottom: i < activePlac.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none', alignItems: 'center' }}>
                  <div style={{ width: 3, height: '100%', borderRadius: 2, background: c }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f0' }}>{p.product_name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{p.accounts?.name||'—'}{p.placement_type ? ` · ${p.placement_type}` : ''}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: c, background: c+'14', padding: '3px 7px', borderRadius: 4, border: `1px solid ${c}28`, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{PLAC_LABELS[p.status]}</span>
                </div>
              )
            })}
          </div>
        </Drawer>
      )}

      {/* Orders */}
      {drawer === 'orders' && (
        <Drawer title={isDistClient ? 'Order Inquiries' : 'Orders'} count={drOrders.length} onClose={() => setDrawer(null)} accent={accent}>
          {drOrders.map((o: any, i: number) => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '11px 0', borderBottom: i < drOrders.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f0' }}>{o.deliver_to_name || 'Order'}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  {o.po_number && `PO #${o.po_number} · `}
                  {new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' })}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {o.total_amount > 0 && <div style={{ fontSize: 14, fontWeight: 900, color: accent, fontFamily: MONO }}>${Number(o.total_amount).toLocaleString()}</div>}
                {CLIENT_ORDER_STATUS[o.status] && <div style={{ fontSize: 9, fontWeight: 700, color: CLIENT_ORDER_STATUS[o.status] === 'Delivered' ? '#5a9ea0' : 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginTop: 2 }}>{CLIENT_ORDER_STATUS[o.status]}</div>}
              </div>
            </div>
          ))}
        </Drawer>
      )}

      {/* Campaigns */}
      {drawer === 'campaigns' && (
        <Drawer title="Campaigns" count={campaigns?.length} onClose={() => setDrawer(null)} accent={accent}>
          {(campaigns||[]).map((c: any, i: number) => {
            const sc = c.status === 'active' ? '#5a9ea0' : c.status === 'paused' ? '#a08440' : 'rgba(255,255,255,0.3)'
            return (
              <div key={c.id} style={{ padding: '11px 0', borderBottom: i < (campaigns||[]).length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f0' }}>{c.title}</div>
                  {c.start_date && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{formatShortDateMT(c.start_date)}{c.end_date ? ` – ${formatShortDateMT(c.end_date)}` : ''}</div>}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: sc, background: sc+'14', padding: '3px 7px', borderRadius: 4, textTransform: 'capitalize', border: `1px solid ${sc}28` }}>{c.status}</span>
              </div>
            )
          })}
        </Drawer>
      )}

      {/* Compliance */}
      {drawer === 'compliance' && (
        <Drawer title="State Compliance" count={registrations?.length} onClose={() => setDrawer(null)} accent={accent}>
          {expiringRegs.length > 0 && (
            <div style={{ background: 'rgba(232,85,64,0.08)', border: '1px solid rgba(232,85,64,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#e85540' }}>
              ⚠ {expiringRegs.length} registration{expiringRegs.length>1?'s':''} expiring within 60 days
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(registrations||[]).map((r: any) => {
              const sc: Record<string,string> = { active:'#5a9ea0', pending:'#a08440', expired:'#bf7850', not_registered:'rgba(255,255,255,0.2)' }
              const sl: Record<string,string> = { active:'Active', pending:'Pending', expired:'Expired', not_registered:'N/A' }
              const col = sc[r.status] || accent
              return (
                <div key={r.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${col}18`, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#f0f0f0' }}>{r.state}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, color: col, background: col+'14', padding: '2px 5px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sl[r.status]||r.status}</span>
                  </div>
                  {r.expiry_date && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Exp: {formatShortDateMT(r.expiry_date)}</div>}
                </div>
              )
            })}
          </div>
        </Drawer>
      )}

      {/* Files */}
      {drawer === 'files' && (
        <Drawer title="Files & Assets" count={clientFiles.length||undefined} onClose={() => setDrawer(null)} accent={accent}>
          {!showFileUpload ? (
            <button onClick={() => setShowFileUpload(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: accent+'12', border: `1px solid ${accent}28`, borderRadius: 7, padding: '7px 14px', color: accent, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: F, marginBottom: 14 }}>
              <Upload size={11} /> Upload File
            </button>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <select value={fileUploadType} onChange={e => setFileUploadType(e.target.value as ClientFileType)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#f0f0f0', fontSize: 12, padding: '7px 10px', fontFamily: F }}>
                  {(['logo','compliance','photo','brand_asset','other'] as const).map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
                </select>
                <input type="date" value={fileUploadExpiry} onChange={e => setFileUploadExpiry(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#f0f0f0', fontSize: 12, padding: '7px 10px', fontFamily: F }} />
              </div>
              <input type="text" value={fileUploadDesc} onChange={e => setFileUploadDesc(e.target.value)} placeholder="Description (optional)" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#f0f0f0', fontSize: 12, padding: '7px 10px', fontFamily: F, boxSizing: 'border-box', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 7 }}>
                <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFileUpload(f) }} />
                <button onClick={() => fileInputRef.current?.click()} disabled={fileUploading} style={{ background: accent, color: '#000', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>
                  {fileUploading ? 'Uploading…' : 'Choose File'}
                </button>
                <button onClick={() => { setShowFileUpload(false); setFileUploadErr('') }} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontFamily: F }}>Cancel</button>
              </div>
              {fileUploadErr && <div style={{ color: '#e85540', fontSize: 11, marginTop: 6 }}>{fileUploadErr}</div>}
            </div>
          )}
          {filesLoading ? (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading…</div>
          ) : clientFiles.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No files yet.</div>
          ) : clientFiles.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f0f0f0' }}>{f.description || f.name}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{f.file_type}{f.expiry_date ? ` · exp ${formatShortDateMT(f.expiry_date)}` : ''}</div>
              </div>
              <a href={f.file_url} target="_blank" rel="noopener noreferrer" style={{ color: accent, display: 'flex', alignItems: 'center' }}>
                <Download size={13} />
              </a>
            </div>
          ))}
        </Drawer>
      )}

      {/* Suggest */}
      {drawer === 'suggest' && (
        <Drawer title="Suggest an Account" onClose={() => setDrawer(null)} accent={accent}>
          {submitted ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#5a9ea0', fontSize: 13, padding: '20px 0' }}>
              <CheckCircle size={16} /> Submitted — our team will review this.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
                {(['account','contact'] as const).map(t => (
                  <button key={t} onClick={() => setSuggestType(t)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${suggestType===t ? accent+'45' : 'rgba(255,255,255,0.1)'}`, background: suggestType===t ? accent+'14' : 'transparent', color: suggestType===t ? accent : 'rgba(255,255,255,0.45)', cursor: 'pointer', fontFamily: F }}>
                    {t === 'account' ? 'Account / Venue' : 'Contact / Person'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input ref={suggestNameRef} type="text" value={suggestForm.name} onChange={e => setSuggestForm(f => ({ ...f, name: e.target.value }))} placeholder={`${suggestType === 'account' ? 'Account' : 'Contact'} name *`} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#f0f0f0', fontSize: 13, padding: '9px 12px', fontFamily: F, outline: 'none' }} />
                <input type="text" value={(suggestForm as any).address||''} onChange={e => setSuggestForm(f => ({ ...f, address: e.target.value }))} placeholder={suggestType === 'account' ? 'Address (optional)' : 'Email (optional)'} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#f0f0f0', fontSize: 13, padding: '9px 12px', fontFamily: F, outline: 'none' }} />
                <select value={suggestForm.reason} onChange={e => setSuggestForm(f => ({ ...f, reason: e.target.value }))} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: suggestForm.reason ? '#f0f0f0' : 'rgba(255,255,255,0.3)', fontSize: 13, padding: '9px 12px', fontFamily: F, outline: 'none' }}>
                  <option value="">Why are you suggesting this? *</option>
                  {SUGGESTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <textarea value={suggestForm.notes} onChange={e => setSuggestForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)…" rows={2} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#f0f0f0', fontSize: 13, padding: '9px 12px', fontFamily: F, resize: 'vertical', outline: 'none' }} />
                <input type="text" value={suggestForm.submitted_by_name} onChange={e => setSuggestForm(f => ({ ...f, submitted_by_name: e.target.value }))} placeholder="Your name (optional)" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#f0f0f0', fontSize: 13, padding: '9px 12px', fontFamily: F, outline: 'none' }} />
                <input type="email" value={suggestForm.submitted_by_email} onChange={e => setSuggestForm(f => ({ ...f, submitted_by_email: e.target.value }))} placeholder="Your email (optional)" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#f0f0f0', fontSize: 13, padding: '9px 12px', fontFamily: F, outline: 'none' }} />
                {suggestErr && <div style={{ color: '#e85540', fontSize: 12 }}>{suggestErr}</div>}
                <button onClick={handleSuggest} disabled={submitting} style={{ background: accent, color: '#000', border: 'none', borderRadius: 8, padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F, letterSpacing: '0.02em' }}>
                  {submitting ? 'Submitting…' : 'Submit Suggestion'}
                </button>
              </div>
            </>
          )}
        </Drawer>
      )}
    </div>
  )
}
