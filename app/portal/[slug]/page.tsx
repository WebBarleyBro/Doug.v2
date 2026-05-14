'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '../../lib/supabase'
import { getPortalData, submitClientSuggestion, getClientFiles, uploadClientFile } from '../../lib/data'
import { formatShortDateMT, startOfMonthMT } from '../../lib/formatters'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ComposedChart, Area } from 'recharts'
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
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(480px, 100vw)',
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
  const [suggestForm,  setSuggestForm]  = useState({ name: '', address: '', contact_email: '', contact_phone: '', contact_name: '', contact_role: '', reason: '', notes: '' })
  const [showContactSection, setShowContactSection] = useState(false)
  const [userProfile,  setUserProfile]  = useState<{ name: string; email: string } | null>(null)
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
      const { data: profile } = await sb.from('user_profiles').select('role, client_slug, name').eq('id', user.id).single()
      const isStaff  = ['owner','admin','rep','intern'].includes(profile?.role)
      const isPortal = profile?.role === 'portal'
      if (!isStaff && !isPortal) { setError('Access denied'); setLoading(false); return }
      if (isPortal && profile?.client_slug && profile.client_slug !== slug) {
        setError(`Access denied — this portal is for ${profile.client_slug}.`); setLoading(false); return
      }
      if (isStaff) setIsPreview(true)
      setUserProfile({ name: profile?.name || '', email: user.email || '' })
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
        sb.from('accounts').select('id,name,account_type,lat,lng')
          .not('lat','is',null).not('lng','is',null)
          .neq('lat',0).neq('lng',0)
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
      if (mapInstanceRef.current || !mapRef.current) return
      mb.accessToken = token
      const map = new mb.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-104.9903, 39.7392],
        zoom: 8,
        attributionControl: false,
      })
      map.addControl(new mb.NavigationControl({ showCompass: false }), 'top-left')
      mapInstanceRef.current = map
      map.on('load', () => setMapReady(true))
    }).catch(() => {})
    return () => {
      setMapReady(false)
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
    }
  }, [data])

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !mapAccounts.length || !data) return
    const map    = mapInstanceRef.current
    const accent = data.client?.color || '#c4a46e'
    const placed = new Set((data.placements || []).map((p: any) => p.account_id))
    const coords: [number, number][] = []

    document.querySelectorAll('.portal-pin').forEach(el => el.remove())

    import('mapbox-gl').then(({ default: mb }) => {
      if (mapInstanceRef.current !== map) return  // map was replaced, bail
      mapAccounts.forEach((acc: any) => {
        if (acc.lat == null || acc.lng == null || acc.lat === 0 || acc.lng === 0) return
        coords.push([acc.lng, acc.lat])
        const isPlaced = placed.has(acc.id)

        // Wrapper: Mapbox positions this element via transform — don't animate it
        const el = document.createElement('div')
        el.className = 'portal-pin'
        el.style.cssText = `width:${isPlaced ? 26 : 18}px;height:${isPlaced ? 26 : 18}px;cursor:pointer;display:flex;align-items:center;justify-content:center;`

        // Inner dot: we animate this — Mapbox never touches it
        const dot = document.createElement('div')

        if (isPlaced) {
          dot.style.cssText = `
            width:18px;height:18px;border-radius:50%;
            background:${accent};
            border:2.5px solid rgba(10,10,10,0.6);
            box-shadow:0 0 0 3px ${accent}45, 0 0 18px ${accent}80, 0 2px 10px rgba(0,0,0,0.5);
            transition:transform 200ms cubic-bezier(0.34,1.56,0.64,1),box-shadow 200ms;
            transform-origin:50% 50%;
            will-change:transform;
          `
          el.onmouseenter = () => {
            dot.style.transform = 'scale(1.6)'
            dot.style.boxShadow = `0 0 0 4px ${accent}60, 0 0 28px ${accent}, 0 4px 16px rgba(0,0,0,0.6)`
          }
          el.onmouseleave = () => {
            dot.style.transform = 'scale(1)'
            dot.style.boxShadow = `0 0 0 3px ${accent}45, 0 0 18px ${accent}80, 0 2px 10px rgba(0,0,0,0.5)`
          }
        } else {
          dot.style.cssText = `
            width:11px;height:11px;border-radius:50%;
            background:rgba(255,255,255,0.55);
            border:2px solid rgba(255,255,255,0.25);
            box-shadow:0 0 0 1px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4);
            transition:transform 200ms cubic-bezier(0.34,1.56,0.64,1),background 150ms,box-shadow 150ms;
            transform-origin:50% 50%;
            will-change:transform;
          `
          el.onmouseenter = () => {
            dot.style.transform = 'scale(1.8)'
            dot.style.background = 'rgba(255,255,255,0.9)'
            dot.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.3), 0 0 14px rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.5)'
          }
          el.onmouseleave = () => {
            dot.style.transform = 'scale(1)'
            dot.style.background = 'rgba(255,255,255,0.55)'
            dot.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4)'
          }
        }
        el.appendChild(dot)

        const typeLabel = acc.account_type === 'on_premise' ? 'On-premise' : 'Off-premise'
        new mb.Marker({ element: el, anchor: 'center' })
          .setLngLat([acc.lng, acc.lat])
          .setPopup(new mb.Popup({ offset: 14, closeButton: false })
            .setHTML(`
              <div style="background:#111113;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:11px 14px;min-width:155px;box-shadow:0 12px 40px rgba(0,0,0,0.7)">
                <div style="font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:700;color:#f2f2f2;margin-bottom:5px;line-height:1.3">${acc.name}</div>
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="width:7px;height:7px;border-radius:50%;background:${isPlaced ? accent : 'rgba(255,255,255,0.6)'};${isPlaced ? `box-shadow:0 0 6px ${accent};` : ''}flex-shrink:0"></div>
                  <span style="font-size:10px;font-weight:${isPlaced ? '700' : '500'};color:${isPlaced ? accent : 'rgba(255,255,255,0.45)'}">${isPlaced ? 'Active placement' : typeLabel}</span>
                </div>
              </div>
            `))
          .addTo(map)
      })
      if (coords.length > 0) {
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new mb.LngLatBounds(coords[0], coords[0]),
        )
        map.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 1000 })
      }
    })
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
        client_slug: slug,
        suggestion_type: suggestType,
        name: suggestForm.name,
        address: suggestForm.address || undefined,
        contact_email: suggestType === 'contact'
          ? suggestForm.contact_email || undefined
          : (showContactSection ? suggestForm.contact_email || undefined : undefined),
        contact_phone: (showContactSection || suggestType === 'contact') ? suggestForm.contact_phone || undefined : undefined,
        contact_person: suggestType === 'account' && showContactSection ? suggestForm.contact_name || undefined : undefined,
        contact_category: suggestForm.contact_role || undefined,
        reason: suggestForm.reason,
        notes: suggestForm.notes || undefined,
        submitted_by_name: userProfile?.name || undefined,
        submitted_by_email: userProfile?.email || undefined,
      })
      // Non-blocking staff notification
      fetch('/api/client-suggestion-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: client?.name || slug,
          suggestion_type: suggestType,
          name: suggestForm.name,
          address: suggestForm.address,
          reason: SUGGESTION_REASONS.find(r => r.value === suggestForm.reason)?.label,
          notes: suggestForm.notes,
          submitted_by: userProfile?.name || userProfile?.email,
          contact_name: suggestType === 'account' && showContactSection ? suggestForm.contact_name : undefined,
          contact_role: suggestForm.contact_role,
          contact_email: suggestForm.contact_email,
          contact_phone: suggestForm.contact_phone,
        }),
      }).catch(() => {})
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
    <div className="portal-root" style={{ height: '100vh', overflow: 'hidden', background: '#070502', color: '#f0f0f0', fontFamily: F, position: 'relative' }}>

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
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        select { color-scheme: dark; } select option { background: #0d0b08 !important; color: #f0f0f0 !important; }
        @media (max-width: 768px) {
          .portal-root { height: auto !important; overflow: auto !important; padding-top: 54px; }
          .portal-header { position: fixed !important; top: 0 !important; height: 54px !important; padding: 0 14px !important; z-index: 50 !important; }
          .portal-preview-banner { display: none !important; }
          .portal-map { position: relative !important; height: 240px !important; z-index: 1 !important; }
          .portal-overlay { display: none !important; }
          .portal-left { position: static !important; width: 100% !important; left: auto !important; top: auto !important; padding: 10px !important; display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 6px !important; z-index: auto !important; }
          .portal-pipeline { margin-top: 0 !important; grid-column: 1 / -1; }
          .portal-right { position: static !important; width: 100% !important; right: auto !important; top: auto !important; bottom: auto !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; height: auto !important; overflow: visible !important; }
          .portal-right-scroll { flex: none !important; height: auto !important; overflow: visible !important; max-height: none !important; }
          .portal-drawer { width: 100vw !important; max-width: 100vw !important; }
          .portal-period-btns { display: none !important; }
          .portal-report-btn { display: none !important; }
          .kpi-hover:hover { transform: none !important; }
        }
      `}</style>

      {/* MAP — full screen background */}
      {hasMap && <div ref={mapRef} className="portal-map" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />}

      {/* Dark overlay when no map */}
      {!hasMap && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #070502, #060c18)', zIndex: 0 }} />}

      {/* Gradient overlay over map for readability */}
      <div className="portal-overlay" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: `radial-gradient(ellipse 60% 80% at 30% 50%, transparent 20%, rgba(4,8,18,0.55) 100%), linear-gradient(180deg, rgba(4,8,18,0.7) 0%, rgba(4,8,18,0.2) 15%, rgba(4,8,18,0.2) 80%, rgba(4,8,18,0.7) 100%)` }} />

      {/* ── STAFF PREVIEW BANNER ─────────────────────────────────────────── */}
      {isPreview && (
        <div className="portal-preview-banner" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(4,8,18,0.96)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${accent}30`, color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 500, padding: '5px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', letterSpacing: '0.02em' }}>
          <span>Staff preview — this is exactly what {client?.name} sees</span>
          <a href={`/v3/brands/${slug}`} style={{ color: accent, textDecoration: 'none', fontSize: 11, fontWeight: 600 }}>← Back to CRM</a>
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <Glass className="portal-header" style={{
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
          <div className="portal-period-btns" style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 7, padding: '2px', border: `1px solid rgba(255,255,255,0.06)` }}>
            {([['7d','7D'],['30d','30D'],['90d','90D'],['all','All']] as const).map(([k,lbl]) => (
              <button key={k} onClick={() => { setDateRange(k); setFeedLimit(20) }} style={{
                padding: '5px 11px', borderRadius: 5, fontSize: 11, fontWeight: dateRange===k?700:400,
                border: 'none', cursor: 'pointer', transition: 'all 130ms', fontFamily: F,
                background: dateRange===k ? accent : 'transparent',
                color: dateRange===k ? '#000' : 'rgba(255,255,255,0.4)',
              }}>{lbl}</button>
            ))}
          </div>
          <button className="portal-report-btn" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 6, padding: '5px 10px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 11, fontFamily: F }}>
            <FileDown size={11} /> Report
          </button>
          <button onClick={() => getSupabase().auth.signOut().then(() => { window.location.href = '/login' })} style={{ background: 'none', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 6, padding: '5px 8px', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <LogOut size={11} />
          </button>
        </div>
      </Glass>

      {/* ── LEFT PANEL: KPIs ────────────────────────────────────────────────── */}
      <div className="portal-left" style={{ position: 'absolute', top: (isPreview ? 26 : 0) + 64, left: 16, zIndex: 10, width: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>

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
          <Glass className="portal-pipeline" style={{ padding: '12px 16px', borderRadius: 10, marginTop: 4 }}>
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
      <Glass className="portal-right" style={{
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
              onClick={() => { setAnalyticsOpen(true); setWinsExpanded(false) }}
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
        <div className="portal-right-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
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

      {/* ── ANALYTICS OVERLAY ────────────────────────────────────────────────── */}
      {analyticsOpen && (() => {
        const winRate      = drVisits.length > 0 ? Math.round((drWins.length / drVisits.length) * 100) : 0
        const uniqueAccts  = new Set(drVisits.map((v: any) => v.account_id).filter(Boolean)).size
        const totalAccts   = new Set(visits.map((v: any) => v.account_id).filter(Boolean)).size
        const visitsPerWk  = drDays ? (drVisits.length / (drDays / 7)).toFixed(1) : drVisits.length > 0 ? (drVisits.length / 12).toFixed(1) : '0'
        const allNonDraftOrders = orders.filter((o: any) => o.status !== 'draft')
        const acctOrderTotals = allNonDraftOrders.reduce((acc: Record<string, { name: string; total: number }>, o: any) => {
          if (!o.account_id) return acc
          if (!acc[o.account_id]) acc[o.account_id] = { name: o.accounts?.name || o.deliver_to_name || '—', total: 0 }
          acc[o.account_id].total += (o.total_amount || 0)
          return acc
        }, {} as Record<string, { name: string; total: number }>)
        const hasDollarData = Object.keys(acctOrderTotals).length > 0
        const topAccts = (hasDollarData
          ? Object.entries(acctOrderTotals)
              .map(([id, d]: [string, any]) => ({
                id, name: d.name, metric: d.total,
                display: `$${Math.round(d.total).toLocaleString()}`,
                hasWin: drVisits.some((v: any) => v.account_id === id && WIN.has(v.status)),
              }))
              .sort((a, b) => b.metric - a.metric)
          : Object.values(
              drVisits.reduce((acc: Record<string, { id: string; name: string; metric: number; hasWin: boolean }>, v: any) => {
                if (!v.account_id) return acc
                if (!acc[v.account_id]) acc[v.account_id] = { id: v.account_id, name: v.accounts?.name || '—', metric: 0, hasWin: false }
                acc[v.account_id].metric++
                if (WIN.has(v.status)) acc[v.account_id].hasWin = true
                return acc
              }, {})
            ).sort((a: any, b: any) => b.metric - a.metric)
              .map((a: any) => ({ ...a, display: `${a.metric} visits` }))
        ).slice(0, 6) as { id: string; name: string; metric: number; display: string; hasWin: boolean }[]
        const maxAcctMetric = topAccts[0]?.metric || 1

        const CARD: React.CSSProperties = { background: 'rgba(255,255,255,0.032)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 18px' }
        const SEC: React.CSSProperties  = { fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase' as const, letterSpacing: '0.14em', marginBottom: 12, display: 'block' }

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 20px', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
            <div onClick={() => setAnalyticsOpen(false)} style={{ position: 'absolute', inset: 0 }} />
            <div className="hub-fade" style={{
              position: 'relative', zIndex: 1,
              width: 'min(1360px, calc(100vw - 40px))',
              height: 'min(840px, calc(100vh - 40px))',
              background: '#0d0b08',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: `0 0 0 1px rgba(0,0,0,0.8), 0 40px 100px rgba(0,0,0,0.95), 0 0 80px ${accent}18`,
              borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>

              {/* Header */}
              <div style={{ padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 20, background: 'rgba(255,255,255,0.012)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#f5f3ef', letterSpacing: '-0.03em', fontFamily: F }}>Analytics</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 3, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{client?.name} · {dateRange === 'all' ? 'All time' : `Last ${dateRange}`}</div>
                </div>

                {/* KPI strip */}
                <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  {[
                    { label: 'Total Visits',    value: drVisits.length,   color: accent },
                    { label: 'Unique Accounts', value: uniqueAccts,       color: '#a08440' },
                    { label: 'Field Wins',      value: drWins.length,     color: '#5a9ea0' },
                    { label: 'On Shelf',        value: onShelf.length,    color: '#c4a46e' },
                    { label: 'Win Rate',        value: `${winRate}%`,     color: winRate >= 20 ? '#5a9ea0' : winRate >= 10 ? '#a08440' : 'rgba(255,255,255,0.40)' },
                  ].map((k, ki, arr) => (
                    <div key={k.label} style={{ textAlign: 'center', padding: '10px 22px', borderRight: ki < arr.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.36)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5, whiteSpace: 'nowrap' }}>{k.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: k.color as string, letterSpacing: '-0.04em', fontFamily: MONO, lineHeight: 1 }}>{k.value}</div>
                    </div>
                  ))}
                </div>

                <button onClick={() => setAnalyticsOpen(false)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '7px 9px', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '14px 18px', gap: 12 }}>

                {/* Full-width chart: Area (visits) + Bar (wins) */}
                <div style={{ ...CARD, flexShrink: 0, padding: '12px 14px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ ...SEC, marginBottom: 0 }}>Visit &amp; Win Trend · 12 Weeks</span>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
                        <span style={{ width: 22, height: 2, background: accent, borderRadius: 2, display: 'inline-block', opacity: 0.7 }} />Visits
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
                        <span style={{ width: 8, height: 8, background: '#5a9ea0', borderRadius: 2, display: 'inline-block' }} />Wins
                      </span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={108}>
                    <ComposedChart data={winChartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="visitAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={accent} stopOpacity={0.40} />
                          <stop offset="100%" stopColor={accent} stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: F }} axisLine={false} tickLine={false} interval={1} />
                      <YAxis tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: '#0d0b08', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', fontFamily: F, boxShadow: '0 8px 32px rgba(0,0,0,0.9)' }}
                        labelStyle={{ color: 'rgba(255,255,255,0.50)', fontSize: 10, marginBottom: 4 }}
                        cursor={{ fill: 'rgba(255,255,255,0.025)' }}
                      />
                      <Area type="monotone" dataKey="visits" fill="url(#visitAreaGrad)" stroke={accent} strokeWidth={1.5} strokeOpacity={0.8} dot={false} name="Visits" />
                      <Bar dataKey="wins" fill="#5a9ea0" opacity={0.90} radius={[2,2,0,0]} barSize={9} name="Wins" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* 3-col data grid */}
                <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

                  {/* ── Col 1: Outcome Breakdown ── */}
                  <div style={{ ...CARD, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <span style={SEC}>Outcome Breakdown</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {outcomeCounts.slice(0, 6).map(({ s, n, c }) => {
                        const pct = drVisits.length > 0 ? Math.round((n / drVisits.length) * 100) : 0
                        return (
                          <div key={s}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{s}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: MONO }}>{pct}%</span>
                                <span style={{ fontSize: 17, fontWeight: 900, color: c, fontFamily: MONO, minWidth: 18, textAlign: 'right' }}>{n}</span>
                              </div>
                            </div>
                            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                              <div style={{ height: '100%', width: `${Math.round((n / maxOutcome) * 100)}%`, background: c, borderRadius: 2, boxShadow: `0 0 6px ${c}55`, transition: 'width 500ms cubic-bezier(0,0,0.2,1)' }} />
                            </div>
                          </div>
                        )
                      })}
                      {outcomeCounts.length === 0 && (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', textAlign: 'center', paddingTop: 14 }}>No visits in this period</div>
                      )}
                    </div>
                  </div>

                  {/* ── Col 2: Field Intelligence ── */}
                  <div style={{ ...CARD, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <span style={SEC}>Field Intelligence</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {[
                        { label: 'Accounts Reached',  value: uniqueAccts,    sub: `of ${totalAccts} total`,                              bar: totalAccts > 0 ? uniqueAccts / totalAccts : 0,     color: accent },
                        { label: 'Avg Visits / Week', value: visitsPerWk,    sub: `over ${drDays ? Math.round(drDays/7) : 12} weeks`,    bar: null,                                              color: '#a08440' },
                        { label: 'Showing Interest',  value: drInProgress,   sub: 'accounts with warm outcomes',                          bar: uniqueAccts > 0 ? drInProgress / uniqueAccts : 0,  color: '#bf7850' },
                        { label: 'Win Rate',          value: `${winRate}%`,  sub: `${drWins.length} wins from ${drVisits.length} visits`, bar: winRate / 100,                                     color: '#5a9ea0' },
                      ].map(({ label, value, sub, bar, color }) => (
                        <div key={label} style={{ background: 'rgba(255,255,255,0.025)', borderRadius: 8, padding: '11px 13px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: bar !== null ? 6 : 0 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.10em', lineHeight: 1, marginBottom: 3 }}>{label}</div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', lineHeight: 1 }}>{sub}</div>
                            </div>
                            <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: MONO, letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</div>
                          </div>
                          {bar !== null && (
                            <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                              <div style={{ height: '100%', width: `${Math.round(Math.min(bar, 1) * 100)}%`, background: color, borderRadius: 2, boxShadow: `0 0 6px ${color}55`, transition: 'width 650ms cubic-bezier(0,0,0.2,1)' }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Col 3: Top Accounts + Recent Wins ── */}
                  <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {/* Top accounts */}
                    <div style={{ ...CARD, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
                        <span style={SEC}>Top Accounts</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', fontFamily: MONO }}>{hasDollarData ? 'by $ ordered · all time' : `${uniqueAccts} visited`}</span>
                      </div>
                      {topAccts.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', textAlign: 'center', paddingTop: 12 }}>No data in this period</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, overflowY: 'auto', flex: 1, minHeight: 0 }}>
                          {topAccts.map((acct, i) => (
                            <div key={acct.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 16, fontSize: 10, fontWeight: 700, color: i < 3 ? accent : 'rgba(255,255,255,0.22)', fontFamily: MONO, textAlign: 'center', flexShrink: 0 }}>#{i+1}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acct.name}</span>
                                  {acct.hasWin && <span style={{ fontSize: 8, fontWeight: 800, color: '#5a9ea0', background: 'rgba(90,158,160,0.14)', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.06em', flexShrink: 0 }}>WIN</span>}
                                </div>
                                <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                                  <div style={{ height: '100%', width: `${Math.round((acct.metric / maxAcctMetric) * 100)}%`, background: i < 3 ? accent : 'rgba(255,255,255,0.22)', borderRadius: 2, boxShadow: i < 3 ? `0 0 6px ${accent}44` : 'none', transition: 'width 500ms cubic-bezier(0,0,0.2,1)' }} />
                                </div>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 900, color: i < 3 ? accent : 'rgba(255,255,255,0.38)', fontFamily: MONO, flexShrink: 0 }}>{acct.display}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Recent wins (expandable) */}
                    {recentWins.length > 0 && (
                      <div style={{ ...CARD, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
                          <span style={SEC}>Recent Wins</span>
                          {recentWins.length > 3 && (
                            <button onClick={() => setWinsExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: accent, fontWeight: 600, fontFamily: F, padding: 0 }}>
                              {winsExpanded ? 'Collapse' : `+${recentWins.length - 3} more`}
                            </button>
                          )}
                        </div>
                        <div style={{ overflowY: winsExpanded ? 'auto' : 'hidden', maxHeight: winsExpanded ? 140 : 'none' }}>
                          {(winsExpanded ? recentWins : recentWins.slice(0, 3)).map((v: any, i: number, arr: any[]) => {
                            const c = STATUS_COLOR[v.status] || '#5a9ea0'
                            return (
                              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                <div style={{ width: 3, alignSelf: 'stretch', minHeight: 22, borderRadius: 2, flexShrink: 0, background: c }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.accounts?.name || '—'}</div>
                                  <div style={{ fontSize: 10, color: c, fontWeight: 600, marginTop: 1 }}>{v.status}</div>
                                </div>
                                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.30)', flexShrink: 0 }}>{new Date(v.visited_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Denver' })}</div>
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
      {drawer === 'suggest' && (() => {
        const SG_INPUT: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 7, color: '#f0f0f0', fontSize: 13, padding: '10px 13px', fontFamily: F, outline: 'none', width: '100%', boxSizing: 'border-box' }
        const SG_LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', marginBottom: 6 }
        const resetForm = () => {
          setSuggestForm({ name: '', address: '', contact_email: '', contact_phone: '', contact_name: '', contact_role: '', reason: '', notes: '' })
          setShowContactSection(false)
          setSubmitted(false)
          setSuggestErr('')
        }
        return (
          <Drawer title="Suggest to Barley Bros" onClose={() => setDrawer(null)} accent={accent}>
            {submitted ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 0', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(90,158,160,0.12)', border: '1px solid rgba(90,158,160,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle size={24} color="#5a9ea0" />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f0f0f0', marginBottom: 8 }}>Submitted</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>Our team will review your suggestion and follow up.</div>
                </div>
                <button onClick={resetForm} style={{ fontSize: 12, color: accent, background: 'none', border: `1px solid ${accent}30`, borderRadius: 7, padding: '8px 20px', cursor: 'pointer', fontFamily: F, fontWeight: 600 }}>
                  Submit another
                </button>
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 3, marginBottom: 18, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3, border: '1px solid rgba(255,255,255,0.06)' }}>
                  {([['account', 'Account / Venue'], ['contact', 'Industry Contact']] as const).map(([t, lbl]) => (
                    <button key={t} onClick={() => { setSuggestType(t); setSuggestForm({ name: '', address: '', contact_email: '', contact_phone: '', contact_name: '', contact_role: '', reason: '', notes: '' }); setShowContactSection(false); setSuggestErr('') }}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', background: suggestType === t ? accent : 'transparent', color: suggestType === t ? '#000' : 'rgba(255,255,255,0.45)', cursor: 'pointer', fontFamily: F, transition: 'all 130ms' }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6, margin: '0 0 20px' }}>
                  {suggestType === 'account'
                    ? 'Know a bar, restaurant, or retailer we should approach? Tell us about it.'
                    : 'Know a buyer, manager, or distributor rep we should connect with?'}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <span style={SG_LABEL}>{suggestType === 'account' ? 'Venue / Account Name *' : 'Their name *'}</span>
                    <input ref={suggestNameRef} type="text" value={suggestForm.name}
                      onChange={e => setSuggestForm(f => ({ ...f, name: e.target.value }))}
                      placeholder={suggestType === 'account' ? 'e.g. The Crafty Fox' : 'e.g. Jamie Rivera'}
                      style={SG_INPUT} />
                  </div>

                  {suggestType === 'account' && (
                    <div>
                      <span style={SG_LABEL}>Address</span>
                      <input type="text" value={suggestForm.address}
                        onChange={e => setSuggestForm(f => ({ ...f, address: e.target.value }))}
                        placeholder="Start typing to search…"
                        style={SG_INPUT} />
                    </div>
                  )}

                  {suggestType === 'contact' && (
                    <>
                      <div>
                        <span style={SG_LABEL}>Their role</span>
                        <input type="text" value={suggestForm.contact_role}
                          onChange={e => setSuggestForm(f => ({ ...f, contact_role: e.target.value }))}
                          placeholder="e.g. Bar Manager, Head Buyer, Distributor Rep"
                          style={SG_INPUT} />
                      </div>
                      <div>
                        <span style={SG_LABEL}>Where they work</span>
                        <input type="text" value={suggestForm.address}
                          onChange={e => setSuggestForm(f => ({ ...f, address: e.target.value }))}
                          placeholder="Account or company name"
                          style={SG_INPUT} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <span style={SG_LABEL}>Phone</span>
                          <input type="tel" value={suggestForm.contact_phone}
                            onChange={e => setSuggestForm(f => ({ ...f, contact_phone: e.target.value }))}
                            placeholder="Optional"
                            style={SG_INPUT} />
                        </div>
                        <div>
                          <span style={SG_LABEL}>Email</span>
                          <input type="email" value={suggestForm.contact_email}
                            onChange={e => setSuggestForm(f => ({ ...f, contact_email: e.target.value }))}
                            placeholder="Optional"
                            style={SG_INPUT} />
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <span style={SG_LABEL}>Why are you suggesting this? *</span>
                    <select value={suggestForm.reason}
                      onChange={e => setSuggestForm(f => ({ ...f, reason: e.target.value }))}
                      style={{ ...SG_INPUT, color: suggestForm.reason ? '#f0f0f0' : 'rgba(255,255,255,0.35)', colorScheme: 'dark' } as React.CSSProperties}>
                      <option value="">Select a reason…</option>
                      {SUGGESTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <span style={SG_LABEL}>Additional notes</span>
                    <textarea value={suggestForm.notes}
                      onChange={e => setSuggestForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Anything else we should know…"
                      rows={3}
                      style={{ ...SG_INPUT, resize: 'vertical' as const }} />
                  </div>

                  {suggestType === 'account' && (
                    !showContactSection ? (
                      <button onClick={() => setShowContactSection(true)} style={{ background: 'none', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 7, padding: '10px 14px', color: 'rgba(255,255,255,0.38)', cursor: 'pointer', fontSize: 12, fontFamily: F, textAlign: 'left', width: '100%' }}>
                        + Add a key contact at this venue (optional)
                      </button>
                    ) : (
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <span style={{ ...SG_LABEL, marginBottom: 0 }}>Key Contact</span>
                          <button onClick={() => { setShowContactSection(false); setSuggestForm(f => ({ ...f, contact_name: '', contact_role: '', contact_phone: '', contact_email: '' })) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.28)', fontFamily: F }}>Remove</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <input type="text" value={suggestForm.contact_name}
                            onChange={e => setSuggestForm(f => ({ ...f, contact_name: e.target.value }))}
                            placeholder="Their name"
                            style={SG_INPUT} />
                          <input type="text" value={suggestForm.contact_role}
                            onChange={e => setSuggestForm(f => ({ ...f, contact_role: e.target.value }))}
                            placeholder="Role (e.g. Bar Manager, Head Buyer)"
                            style={SG_INPUT} />
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <input type="tel" value={suggestForm.contact_phone}
                              onChange={e => setSuggestForm(f => ({ ...f, contact_phone: e.target.value }))}
                              placeholder="Phone"
                              style={SG_INPUT} />
                            <input type="email" value={suggestForm.contact_email}
                              onChange={e => setSuggestForm(f => ({ ...f, contact_email: e.target.value }))}
                              placeholder="Email"
                              style={SG_INPUT} />
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  {suggestErr && <div style={{ color: '#e85540', fontSize: 12, padding: '8px 12px', background: 'rgba(232,85,64,0.08)', borderRadius: 6, border: '1px solid rgba(232,85,64,0.18)' }}>{suggestErr}</div>}

                  <button onClick={handleSuggest} disabled={submitting} style={{ background: accent, color: '#000', border: 'none', borderRadius: 8, padding: '13px', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: F, letterSpacing: '0.02em', opacity: submitting ? 0.7 : 1, transition: 'opacity 150ms', marginTop: 4 }}>
                    {submitting ? 'Sending to team…' : 'Submit to Barley Bros'}
                  </button>
                </div>
              </>
            )}
          </Drawer>
        )
      })()}
    </div>
  )
}
