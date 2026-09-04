'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '../../lib/supabase'
import { getPortalData, getPortalVisitsInRange, submitClientSuggestion, getClientFiles, uploadClientFile } from '../../lib/data'
import { formatShortDateMT, todayMT } from '../../lib/formatters'
import {
  LogOut, CheckCircle, Upload, FileDown, Download, X, Key, ChevronRight,
  Calendar, Loader2, Megaphone, ShieldCheck, FolderOpen, Sparkles, CalendarRange,
} from 'lucide-react'
import type { ClientFile, ClientFileType } from '../../lib/types'
import { clientLogoUrl } from '../../lib/constants'
import {
  type RangeSelection, type PresetDays, type PeriodReport, type OutcomeGroup,
  resolveRange, defaultRangeSelection, recentMonthKeys, buildPeriodReport,
  OUTCOME_GROUP_COLOR, OUTCOME_GROUP_LABEL, OUTCOME_DESCRIPTION, PIPELINE_LABEL,
  outcomeGroup, compactMoney, toMs, mtShortDate,
} from './portal-metrics'
import {
  T, F, PIPELINE_RAMP, readableAccent, Counter, Glass, Panel, Eyebrow, DeltaChip,
  StatTile, Chip, Drawer, SectionTitle, TrendChart, OutcomeBreakdown, TopAccounts, PlacementsPanel, HealthPanel,
} from './portal-ui'

const SUGGESTION_REASONS = [
  { value: 'inbound_request',  label: 'They reached out asking for us' },
  { value: 'competitor_gap',   label: 'Gap / opportunity I noticed on-premise' },
  { value: 'warm_referral',    label: 'Referred by someone in the industry' },
  { value: 'staff_fan',        label: 'Staff or bartender expressed interest' },
  { value: 'strategic_fit',    label: 'High-volume account, strong fit for the brand' },
  { value: 'other',            label: 'Other reason' },
]

export default function ClientPortalPage() {
  const { slug } = useParams() as { slug: string }

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isPreview, setIsPreview] = useState(false)
  const [userProfile, setUserProfile] = useState<{ name: string; email: string } | null>(null)

  const [sel, setSel] = useState<RangeSelection>(defaultRangeSelection)
  const [showCustom, setShowCustom] = useState(false)
  const range = useMemo(() => resolveRange(sel), [sel])

  const [extraVisits, setExtraVisits] = useState<Record<string, any[]>>({})
  const [fetchingExtra, setFetchingExtra] = useState(false)

  const [feedGroup, setFeedGroup] = useState<'all' | OutcomeGroup>('all')
  const [feedLimit, setFeedLimit] = useState(12)
  const [drawer, setDrawer] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState('')

  const [showChangePw, setShowChangePw] = useState(false)
  const [newPw, setNewPw] = useState(''); const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState(''); const [pwSuccess, setPwSuccess] = useState(false); const [pwLoading, setPwLoading] = useState(false)

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapAccounts, setMapAccounts] = useState<any[]>([])

  const [clientFiles, setClientFiles] = useState<ClientFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [showFileUpload, setShowFileUpload] = useState(false)
  const [fileUploadType, setFileUploadType] = useState<ClientFileType>('other')
  const [fileUploadDesc, setFileUploadDesc] = useState('')
  const [fileUploadExpiry, setFileUploadExpiry] = useState('')
  const [fileUploadErr, setFileUploadErr] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const emptySuggest = { name: '', address: '', contact_email: '', contact_phone: '', contact_name: '', contact_role: '', reason: '', notes: '' }
  const [suggestType, setSuggestType] = useState<'account' | 'contact'>('account')
  const [suggestForm, setSuggestForm] = useState(emptySuggest)
  const [showContactSection, setShowContactSection] = useState(false)
  const suggestNameRef = useRef<HTMLInputElement>(null)
  const suggestAcRef = useRef<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [suggestErr, setSuggestErr] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Auth + load ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null
      if (!user) { window.location.replace(`/login?redirect=/portal/${slug}`); return }
      const { data: profile } = await sb.from('user_profiles').select('role, client_slug, name').eq('id', user.id).single()
      const isStaff = ['owner', 'admin', 'rep', 'intern'].includes(profile?.role)
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
        setFilesLoading(true)
        getClientFiles(slug).then(f => { setClientFiles(f); setFilesLoading(false) }).catch(() => setFilesLoading(false))
        const ids = new Set([
          ...(d.visits || []).map((v: any) => v.account_id),
          ...(d.placements || []).filter((p: any) => !p.lost_at).map((p: any) => p.account_id),
        ])
        sb.from('accounts').select('id,name,account_type,lat,lng')
          .not('lat', 'is', null).not('lng', 'is', null).neq('lat', 0).neq('lng', 0)
          .then(({ data: accs }) => setMapAccounts((accs || []).filter((a: any) => ids.has(a.id))))
      } catch (e) { console.error('portal.load', e); setError('Failed to load data') }
      finally { setLoading(false) }
    })
  }, [slug])

  useEffect(() => {
    if (!data?.historyStartISO) return
    const floorMs = new Date(data.historyStartISO).getTime()
    if (range.priorStartMs >= floorMs) return
    const key = range.priorStartISO
    if (extraVisits[key]) return
    let alive = true
    setFetchingExtra(true)
    getPortalVisitsInRange(slug, key, data.historyStartISO)
      .then(rows => { if (alive) setExtraVisits(prev => ({ ...prev, [key]: rows })) })
      .catch(e => console.error('portal.visitsInRange', e))
      .finally(() => { if (alive) setFetchingExtra(false) })
    return () => { alive = false }
  }, [data, range.priorStartMs, range.priorStartISO, slug, extraVisits])

  const report = useMemo<PeriodReport | null>(() => {
    if (!data) return null
    const seen = new Set<string>()
    const visits: any[] = []
    for (const v of [...data.visits, ...Object.values(extraVisits).flat()]) {
      if (!seen.has(v.id)) { seen.add(v.id); visits.push(v) }
    }
    return buildPeriodReport({ visits, placements: data.placements, orders: data.orders, events: data.events, range })
  }, [data, extraVisits, range])

  // ── Map ───────────────────────────────────────────────────────────────────────
  const hasMapToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const showMap = hasMapToken && mapAccounts.length > 0

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || !mapRef.current || mapInstanceRef.current || !showMap) return
    import('mapbox-gl').then(({ default: mb }) => {
      if (mapInstanceRef.current || !mapRef.current) return
      mb.accessToken = token
      const map = new mb.Map({
        container: mapRef.current, style: 'mapbox://styles/mapbox/dark-v11',
        center: [-104.9903, 39.7392], zoom: 7.4, attributionControl: false, cooperativeGestures: true,
      })
      map.addControl(new mb.NavigationControl({ showCompass: false }), 'bottom-right')
      mapInstanceRef.current = map
      map.on('load', () => setMapReady(true))
    }).catch(e => console.error('portal.map', e))
    return () => { setMapReady(false); mapInstanceRef.current?.remove(); mapInstanceRef.current = null }
  }, [showMap])

  const placedIds = useMemo(() => new Set((data?.placements || []).filter((p: any) => !p.lost_at).map((p: any) => p.account_id)), [data])
  const visitedInPeriod = useMemo(() => new Set((report?.visits || []).map(v => v.account_id)), [report])

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !mapAccounts.length || !data) return
    const map = mapInstanceRef.current
    const accent = readableAccent(data.client?.color)
    const coords: [number, number][] = []
    document.querySelectorAll('.portal-pin').forEach(el => el.remove())
    import('mapbox-gl').then(({ default: mb }) => {
      if (mapInstanceRef.current !== map) return
      mapAccounts.forEach((acc: any) => {
        const isPlaced = placedIds.has(acc.id)
        const isVisited = visitedInPeriod.has(acc.id)
        if (!isPlaced && !isVisited) return
        coords.push([acc.lng, acc.lat])
        const el = document.createElement('div')
        el.className = 'portal-pin'
        el.style.cssText = 'width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;'
        const dot = document.createElement('div')
        dot.className = isPlaced ? 'pr-pin-placed' : 'pr-pin-visited'
        dot.style.cssText = isPlaced
          ? `width:15px;height:15px;border-radius:50%;background:${accent};border:2.5px solid ${T.void};box-shadow:0 0 0 3px ${accent}44, 0 0 16px ${accent}99;transition:transform 180ms cubic-bezier(0.34,1.56,0.64,1);`
          : `width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.62);border:2px solid ${T.void};transition:transform 180ms cubic-bezier(0.34,1.56,0.64,1);`
        el.onmouseenter = () => { dot.style.transform = 'scale(1.5)' }
        el.onmouseleave = () => { dot.style.transform = 'scale(1)' }
        el.appendChild(dot)
        new mb.Marker({ element: el, anchor: 'center' })
          .setLngLat([acc.lng, acc.lat])
          .setPopup(new mb.Popup({ offset: 14, closeButton: false }).setText(`${acc.name} — ${isPlaced ? 'Active placement' : 'Visited this period'}`))
          .addTo(map)
      })
      if (coords.length) {
        // Frame the working territory, not the extremes: a single far-flung account
        // (or a bad geocode) would otherwise zoom the map out to the whole country.
        // Every pin is still drawn — outliers just sit outside the initial view.
        const pct = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))))]
        const lngs = coords.map(c => c[0]).sort((a, b) => a - b)
        const lats = coords.map(c => c[1]).sort((a, b) => a - b)
        const sw: [number, number] = coords.length >= 6 ? [pct(lngs, 0.05), pct(lats, 0.05)] : [lngs[0], lats[0]]
        const ne: [number, number] = coords.length >= 6 ? [pct(lngs, 0.95), pct(lats, 0.95)] : [lngs[lngs.length - 1], lats[lats.length - 1]]
        const bounds = new mb.LngLatBounds(sw, ne)
        // The glass stat bar covers the lower band of the hero, so pins are fitted
        // into the visible upper area rather than the raw container.
        map.fitBounds(bounds, { padding: { top: 44, bottom: 186, left: 52, right: 52 }, maxZoom: 12.5, duration: 700 })
      }
    })
  }, [mapReady, mapAccounts, data, placedIds, visitedInPeriod])

  // ── Google Places ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (drawer !== 'suggest' || suggestType !== 'account') {
      if (suggestAcRef.current && (window as any).google?.maps?.event) (window as any).google.maps.event.clearInstanceListeners(suggestAcRef.current)
      suggestAcRef.current = null; return
    }
    let alive = true
    const init = () => {
      if (!alive || !suggestNameRef.current || suggestAcRef.current) return
      suggestAcRef.current = new (window as any).google.maps.places.Autocomplete(suggestNameRef.current, { types: ['establishment'], componentRestrictions: { country: 'us' }, fields: ['name', 'formatted_address'] })
      suggestAcRef.current.addListener('place_changed', () => {
        const p = suggestAcRef.current.getPlace()
        setSuggestForm(f => ({ ...f, name: p.name || f.name, address: p.formatted_address || f.address }))
      })
    }
    if (!document.getElementById('gm-script') && process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) {
      const s = document.createElement('script'); s.id = 'gm-script'
      s.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`
      s.async = true; document.head.appendChild(s)
    }
    const iv = setInterval(() => { if ((window as any).google?.maps?.places) { clearInterval(iv); init() } }, 100)
    return () => {
      alive = false; clearInterval(iv)
      if (suggestAcRef.current && (window as any).google?.maps?.event) (window as any).google.maps.event.clearInstanceListeners(suggestAcRef.current)
      suggestAcRef.current = null
    }
  }, [drawer, suggestType])

  // ── Handlers ──────────────────────────────────────────────────────────────────
  async function handleSuggest() {
    if (!suggestForm.name.trim() || !suggestForm.reason) { setSuggestErr('Name and reason are required'); return }
    setSubmitting(true); setSuggestErr('')
    try {
      await submitClientSuggestion({
        client_slug: slug, suggestion_type: suggestType, name: suggestForm.name, address: suggestForm.address || undefined,
        contact_email: (suggestType === 'contact' || showContactSection) ? suggestForm.contact_email || undefined : undefined,
        contact_phone: (suggestType === 'contact' || showContactSection) ? suggestForm.contact_phone || undefined : undefined,
        contact_person: suggestType === 'account' && showContactSection ? suggestForm.contact_name || undefined : undefined,
        contact_category: suggestForm.contact_role || undefined,
        reason: suggestForm.reason, notes: suggestForm.notes || undefined,
        submitted_by_name: userProfile?.name || undefined, submitted_by_email: userProfile?.email || undefined,
      })
      fetch('/api/client-suggestion-notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: data?.client?.name || slug, suggestion_type: suggestType, name: suggestForm.name, address: suggestForm.address,
          reason: SUGGESTION_REASONS.find(r => r.value === suggestForm.reason)?.label, notes: suggestForm.notes,
          submitted_by: userProfile?.name || userProfile?.email,
          contact_name: suggestType === 'account' && showContactSection ? suggestForm.contact_name : undefined,
          contact_role: suggestForm.contact_role, contact_email: suggestForm.contact_email, contact_phone: suggestForm.contact_phone,
        }),
      }).catch(() => {})
      setSubmitted(true)
    } catch (e: any) { console.error('portal.suggest', e); setSuggestErr(e.message || 'Failed to submit') }
    finally { setSubmitting(false) }
  }

  async function handleFileUpload(file: File) {
    setFileUploading(true); setFileUploadErr('')
    try {
      const uploaded = await uploadClientFile(slug, file, { file_type: fileUploadType, description: fileUploadDesc || undefined, expiry_date: fileUploadExpiry || undefined, uploaded_by_portal: true })
      setClientFiles(prev => [uploaded, ...prev])
      setShowFileUpload(false); setFileUploadDesc(''); setFileUploadExpiry('')
    } catch (e: any) { console.error('portal.upload', e); setFileUploadErr(e.message || 'Upload failed') }
    finally { setFileUploading(false) }
  }

  const handleDownloadPDF = useCallback(async () => {
    if (!report || !data) return
    setPdfBusy(true); setPdfError('')
    try {
      const [{ pdf }, { PortalReportPDF }] = await Promise.all([import('@react-pdf/renderer'), import('./PortalReportPDF')])
      let logo: string | null = null
      const url0 = clientLogoUrl(data.client)
      if (url0) {
        try {
          const blob = await fetch(url0).then(r => r.ok ? r.blob() : Promise.reject(r.status))
          if (/png|jpe?g/.test(blob.type)) logo = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob) })
        } catch { logo = null }
      }
      const generatedAt = new Date().toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'long', day: 'numeric', year: 'numeric' })
      const doc = React.createElement(PortalReportPDF, {
        report, clientName: data.client?.name || slug, logoUrl: logo, accent: readableAccent(data.client?.color),
        isDistributor: data.client?.order_type === 'distributor', generatedAt,
        placements: (data.placements || []).filter((p: any) => !p.lost_at),
      })
      const blob = await pdf(doc as any).toBlob()
      const safeName = (data.client?.name || slug).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')
      const filename = `${safeName}-Field-Report-${range.label.replace(/[^\w\-]+/g, '-')}.pdf`
      const file = new File([blob], filename, { type: 'application/pdf' })
      const nav = navigator as any
      if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        try { await nav.share({ files: [file], title: filename }); return } catch (e: any) { if (e?.name === 'AbortError') return }
      }
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = objUrl; a.download = filename; a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(objUrl), 30_000)
    } catch (e) { console.error('portal.pdf', e); setPdfError('Could not build the PDF. Please try again.') }
    finally { setPdfBusy(false) }
  }, [report, data, slug, range.label])

  const pickOutcome = useCallback((g: OutcomeGroup | 'all') => {
    setFeedGroup(g); setFeedLimit(12)
    document.getElementById('pr-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // ── Loading / error ───────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.page, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F }}>
      <style>{`@keyframes prSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.07)', borderTopColor: T.gold, animation: 'prSpin .7s linear infinite', margin: '0 auto 14px' }} />
        <div style={{ color: T.muted, fontSize: 12 }}>Loading brand report…</div>
      </div>
    </div>
  )
  if (error || !report || !data) return (
    <div style={{ minHeight: '100vh', background: T.page, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: T.bad, marginBottom: 12 }}>{error || 'Something went wrong'}</div>
        <button onClick={() => { getSupabase().auth.signOut(); window.location.href = '/login' }} style={{ fontSize: 12, color: T.text2, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Sign in again</button>
      </div>
    </div>
  )

  // ── Derived ───────────────────────────────────────────────────────────────────
  const { client, campaigns, registrations } = data
  const accent = readableAccent(client?.color)
  const logoUrl = client ? clientLogoUrl(client) : null
  const isDist = client?.order_type === 'distributor'
  const orderNoun = isDist ? 'Inquiries' : 'Orders'
  const { kpis } = report
  const priorLabel = range.priorLabel
  const activePlacements = (data.placements || []).filter((p: any) => !p.lost_at)
  const feedVisits = feedGroup === 'all' ? report.visits : report.visits.filter(v => outcomeGroup(v.status) === feedGroup)
  const monthKeys = recentMonthKeys(13)
  const monthLabel = (k: string) => new Date(k + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const today = todayMT()
  const upcomingEvents = (data.events || []).filter((e: any) => toMs(e.start_time) > Date.now() && e.status !== 'cancelled').sort((a: any, b: any) => toMs(a.start_time) - toMs(b.start_time)).slice(0, 5)
  const expiringRegs = (registrations || []).filter((r: any) => r.expiry_date && r.status !== 'expired' && (toMs(r.expiry_date) - Date.now()) < 60 * 86400000)
  const orderStatusLabel = (s: string) => s === 'fulfilled' ? 'Delivered' : isDist ? 'Sent to distributor' : 'Submitted'
  const inputStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, borderRadius: 9, color: T.text, fontSize: 14, padding: '11px 13px', fontFamily: F, outline: 'none', width: '100%', boxSizing: 'border-box', minHeight: 44 }
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: T.muted, display: 'block', marginBottom: 6 }

  const heroStats = [
    { label: 'Visits', value: kpis.visits.current, d: kpis.visits },
    { label: 'Accounts reached', value: kpis.accountsReached.current, d: kpis.accountsReached },
    { label: 'Field wins', value: kpis.wins.current, d: kpis.wins },
  ]

  const linkCards = [
    { key: 'orders', label: orderNoun, sub: `${kpis.orders.current} in ${range.label.toLowerCase()}`, icon: <FileDown size={15} /> },
    { key: 'events', label: 'Events & tastings', sub: upcomingEvents.length ? `${upcomingEvents.length} coming up` : `${kpis.events.current} in period`, icon: <Calendar size={15} /> },
    campaigns?.length > 0 && { key: 'campaigns', label: 'Campaigns', sub: `${campaigns.length} running`, icon: <Megaphone size={15} /> },
    registrations?.length > 0 && { key: 'compliance', label: 'State compliance', sub: expiringRegs.length ? `${expiringRegs.length} expiring soon` : `${registrations.length} states registered`, icon: <ShieldCheck size={15} />, alert: expiringRegs.length > 0 },
    { key: 'files', label: 'Files & assets', sub: clientFiles.length ? `${clientFiles.length} files` : 'Upload or download', icon: <FolderOpen size={15} /> },
    { key: 'suggest', label: 'Suggest an account', sub: 'Know a venue we should visit?', icon: <Sparkles size={15} /> },
  ].filter(Boolean) as { key: string; label: string; sub: string; icon: React.ReactNode; alert?: boolean }[]

  return (
    <div style={{ minHeight: '100vh', background: T.page, color: T.text, fontFamily: F, WebkitFontSmoothing: 'antialiased' as any }}>
      <style>{`
        @keyframes prSlideIn { from { transform: translateX(44px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes prSpin { to { transform: rotate(360deg) } }
        @keyframes prRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .pr-shell { max-width: 1640px; margin: 0 auto; padding: 0 28px 72px; }
        .pr-rise { animation: prRise 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .pr-tiles { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 12px; }
        .pr-split { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }
        .pr-main-rail { display: grid; grid-template-columns: minmax(0,1.55fr) minmax(320px,1fr); gap: 16px; align-items: start; }
        .pr-links { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
        .pr-hero { position: relative; border-radius: 20px; overflow: hidden; border: 1px solid ${T.border}; min-height: 530px; display: flex; flex-direction: column; justify-content: flex-end; }
        .pr-hero-glass { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 2px; }
        .pr-filter { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .pr-vs-short { display: none; }
        .pr-panel { transition: border-color 200ms, box-shadow 200ms; }
        .pr-panel:hover { border-color: rgba(255,255,255,0.11); }
        .pr-tile { transition: transform 180ms cubic-bezier(0.16,1,0.3,1), border-color 180ms; }
        .pr-tile:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.14); }
        .pr-link { transition: transform 180ms cubic-bezier(0.16,1,0.3,1), border-color 180ms, background 180ms; }
        .pr-link:hover { transform: translateY(-2px); border-color: ${accent}55; background: rgba(255,255,255,0.035) !important; }
        .pr-ghost:hover { color: ${T.text} !important; border-color: rgba(255,255,255,0.16) !important; }
        .pr-chip:hover { border-color: rgba(255,255,255,0.2); }
        .pr-outcome:hover { opacity: 1 !important; }
        .pr-row { transition: background 140ms; }
        .pr-row:hover { background: rgba(255,255,255,0.03); }
        select, input[type=date], input[type=month] { color-scheme: dark; }
        select option { background: ${T.raised}; color: ${T.text}; }
        ::-webkit-scrollbar { width: 7px; height: 7px } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.13); border-radius: 4px }
        .mapboxgl-popup-content { background: ${T.raised} !important; color: ${T.text} !important; border: 1px solid ${T.border}; border-radius: 9px !important; padding: 9px 13px !important; font-family: ${F}; font-size: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.7); }
        .mapboxgl-popup-tip { border-top-color: ${T.raised} !important; }
        .mapboxgl-ctrl-group { background: ${T.raised} !important; border: 1px solid ${T.border} !important; }
        .mapboxgl-ctrl-group button + button { border-top-color: rgba(255,255,255,0.1) !important; }
        .mapboxgl-ctrl-icon { filter: invert(0.85); }
        @media (max-width: 1180px) {
          .pr-main-rail { grid-template-columns: 1fr; }
          .pr-tiles { grid-template-columns: repeat(3, minmax(0,1fr)); }
        }
        @media (max-width: 900px) {
          .pr-split { grid-template-columns: 1fr; }
          .pr-links { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .pr-shell { padding: 0 16px 56px; }
        }
        @media (max-width: 640px) {
          .pr-shell { padding: 0 12px 48px; }
          .pr-tiles { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
          .pr-links { grid-template-columns: 1fr; }
          .pr-hero { min-height: 0; border-radius: 16px; }
          .pr-hero-glass { grid-template-columns: repeat(3, minmax(0,1fr)); }
          .pr-hide-sm { display: none !important; }
          .pr-vs-long { display: none; }
          .pr-vs-short { display: inline; }
          .pr-delta { font-size: 10.5px !important; gap: 3px !important; }
          .pr-hero-label { white-space: normal !important; overflow: visible !important; font-size: 9.5px !important; line-height: 1.25; }
          .pr-filter { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; margin: 0 -12px; padding: 0 12px 4px; }
          .pr-filter::-webkit-scrollbar { display: none; }
          .pr-drawer { width: 100vw !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pr-rise, .pr-tile, .pr-link, .pr-panel { animation: none !important; transition: none !important; }
        }
      `}</style>

      {isPreview && (
        <div style={{ background: T.raised, borderBottom: `1px solid ${accent}33`, color: T.text2, fontSize: 11.5, padding: '7px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>Staff preview — this is exactly what {client?.name} sees</span>
          <a href={`/v3/brands/${slug}`} style={{ color: accent, textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>← Back to CRM</a>
        </div>
      )}

      {/* ── Header ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 60, background: 'rgba(10,8,6,0.86)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderBottom: `1px solid ${T.borderSoft}` }}>
        <div className="pr-shell" style={{ padding: '0 28px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
            {logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoUrl} alt={client?.name} style={{ height: 34, width: 'auto', maxWidth: 86, objectFit: 'contain' }} />
              : <div style={{ width: 34, height: 34, borderRadius: 9, background: accent + '26', border: `1px solid ${accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: accent }}>{client?.name?.[0] || 'B'}</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.text, lineHeight: 1.1, letterSpacing: '-0.025em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client?.name}</div>
              <div style={{ fontSize: 9.5, color: T.gold, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 3, fontWeight: 700, whiteSpace: 'nowrap' }}>
                Barley Bros<span className="pr-hide-sm"> · Brand Report</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={handleDownloadPDF} disabled={pdfBusy} style={{ display: 'flex', alignItems: 'center', gap: 7, background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: '#0a0806', border: 'none', borderRadius: 9, padding: '9px 14px', cursor: pdfBusy ? 'wait' : 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: F, minHeight: 40, opacity: pdfBusy ? 0.7 : 1, boxShadow: `0 4px 18px ${accent}33` }}>
              {pdfBusy ? <Loader2 size={14} style={{ animation: 'prSpin 0.8s linear infinite' }} /> : <FileDown size={14} />}
              <span className="pr-hide-sm">{pdfBusy ? 'Building…' : 'Download PDF'}</span>
            </button>
            <button onClick={() => { setShowChangePw(true); setPwError(''); setPwSuccess(false); setNewPw(''); setConfirmPw('') }} title="Change password" aria-label="Change password" className="pr-ghost" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, borderRadius: 9, width: 40, height: 40, color: T.text2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Key size={15} /></button>
            <button onClick={() => getSupabase().auth.signOut().then(() => { window.location.href = '/login' })} title="Sign out" aria-label="Sign out" className="pr-ghost" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, borderRadius: 9, width: 40, height: 40, color: T.text2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LogOut size={15} /></button>
          </div>
        </div>
      </header>

      {/* ── Filter bar — scopes everything below it ── */}
      <div style={{ position: 'sticky', top: 64, zIndex: 55, background: 'rgba(10,8,6,0.9)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: `1px solid ${T.borderSoft}` }}>
        <div className="pr-shell" style={{ padding: '11px 28px' }}>
          <div className="pr-filter">
            {([7, 30, 90] as PresetDays[]).map(d => (
              <Chip key={d} color={accent} active={sel.mode === 'preset' && sel.presetDays === d} onClick={() => { setSel(s => ({ ...s, mode: 'preset', presetDays: d })); setFeedLimit(12) }}>Last {d} days</Chip>
            ))}
            <select value={sel.mode === 'month' ? sel.month : ''} aria-label="Choose a calendar month"
              onChange={e => { if (e.target.value) { setSel(s => ({ ...s, mode: 'month', month: e.target.value })); setFeedLimit(12) } }}
              style={{
                padding: '8px 11px', borderRadius: 9, fontSize: 12, fontWeight: 600, fontFamily: F, minHeight: 34, cursor: 'pointer',
                background: sel.mode === 'month' ? accent + '22' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${sel.mode === 'month' ? accent + '77' : T.border}`, color: sel.mode === 'month' ? T.text : T.text2,
              }}>
              <option value="">By month…</option>
              {monthKeys.map(k => <option key={k} value={k}>{monthLabel(k)}</option>)}
            </select>
            <Chip color={accent} active={sel.mode === 'custom'} onClick={() => setShowCustom(v => !v)}>
              <CalendarRange size={13} /> Custom range
            </Chip>
            {(showCustom || sel.mode === 'custom') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, paddingLeft: 4, borderLeft: `1px solid ${T.border}` }}>
                <input type="date" value={sel.customStart} max={sel.customEnd || today} aria-label="Start date"
                  onChange={e => setSel(s => ({ ...s, customStart: e.target.value, mode: e.target.value && s.customEnd ? 'custom' : s.mode }))}
                  style={{ padding: '7px 9px', borderRadius: 8, fontSize: 12, fontFamily: F, minHeight: 34, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, color: T.text2 }} />
                <span style={{ color: T.muted, fontSize: 12 }}>→</span>
                <input type="date" value={sel.customEnd} min={sel.customStart} max={today} aria-label="End date"
                  onChange={e => setSel(s => ({ ...s, customEnd: e.target.value, mode: e.target.value && s.customStart ? 'custom' : s.mode }))}
                  style={{ padding: '7px 9px', borderRadius: 8, fontSize: 12, fontFamily: F, minHeight: 34, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, color: T.text2 }} />
              </div>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.muted, whiteSpace: 'nowrap', paddingLeft: 8 }} className="pr-hide-sm">
              {fetchingExtra ? 'Loading older history…' : `Comparing against ${priorLabel}`}
            </span>
          </div>
        </div>
      </div>

      <main className="pr-shell" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
        {pdfError && <div style={{ fontSize: 12.5, color: T.bad, background: 'rgba(224,102,74,0.1)', border: '1px solid rgba(224,102,74,0.28)', borderRadius: 10, padding: '10px 14px' }}>{pdfError}</div>}

        {/* ── Hero ── */}
        <section className="pr-hero pr-rise" style={{ opacity: fetchingExtra ? 0.75 : 1, transition: 'opacity 220ms' }}>
          {showMap
            ? <div ref={mapRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
            : <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: `radial-gradient(120% 90% at 15% 0%, ${accent}22, transparent 60%), linear-gradient(160deg, #14100b, #0a0806 70%)` }} />}
          {/* Two scrims: one anchors the headline on the left, one seats the glass bar
              at the bottom — so the map stays legible through the middle and right. */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'linear-gradient(95deg, rgba(10,8,6,0.94) 0%, rgba(10,8,6,0.72) 30%, rgba(10,8,6,0.2) 58%, rgba(10,8,6,0.05) 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(10,8,6,0.5) 0%, rgba(10,8,6,0) 18%, rgba(10,8,6,0) 46%, rgba(10,8,6,0.82) 88%, rgba(10,8,6,0.95) 100%)' }} />

          <div style={{ position: 'relative', zIndex: 2, padding: 'clamp(16px, 2.4vw, 26px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <Eyebrow>{range.label}</Eyebrow>
                <h1 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 800, letterSpacing: '-0.04em', margin: '8px 0 0', lineHeight: 1.02, color: T.text }}>
                  {kpis.visits.current === 0 ? 'No visits yet this period' : <>We visited <span style={{ color: accent }}>{kpis.accountsReached.current} account{kpis.accountsReached.current === 1 ? '' : 's'}</span> for you</>}
                </h1>
                <p style={{ fontSize: 13.5, color: T.text2, margin: '9px 0 0', lineHeight: 1.5, maxWidth: 520 }}>
                  {kpis.visits.current === 0
                    ? `Nothing logged between ${range.label.toLowerCase()}. Your team's earlier activity is still available — pick a different range above.`
                    : `${kpis.visits.current} field visit${kpis.visits.current === 1 ? '' : 's'} producing ${kpis.wins.current} win${kpis.wins.current === 1 ? '' : 's'}, with ${report.snapshot.activePlacements} placement${report.snapshot.activePlacements === 1 ? '' : 's'} live across the territory.`}
                </p>
              </div>
              {showMap && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11.5, color: T.text2, background: 'rgba(10,8,6,0.55)', backdropFilter: 'blur(8px)', padding: '8px 12px', borderRadius: 10, border: `1px solid ${T.border}` }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: accent, boxShadow: `0 0 10px ${accent}aa` }} />Active placement</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(255,255,255,0.62)' }} />Visited this period</span>
                </div>
              )}
            </div>

            <Glass className="pr-hero-glass" style={{ padding: 0, overflow: 'hidden' }}>
              {heroStats.map((s, i) => (
                <div key={s.label} style={{ padding: 'clamp(12px, 1.6vw, 18px) clamp(12px, 1.8vw, 22px)', borderRight: i < heroStats.length - 1 ? `1px solid ${T.borderSoft}` : 'none', minWidth: 0 }}>
                  <div className="pr-hero-label" style={{ fontSize: 10.5, color: T.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
                  <div style={{ fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 800, color: T.text, letterSpacing: '-0.045em', lineHeight: 1.02, margin: '4px 0 5px' }}><Counter to={s.value} /></div>
                  <DeltaChip d={s.d} suffix={priorLabel} />
                </div>
              ))}
            </Glass>
          </div>
        </section>

        {/* ── Supporting KPIs ── */}
        <div className="pr-tiles pr-rise" style={{ opacity: fetchingExtra ? 0.6 : 1, transition: 'opacity 220ms' }}>
          <StatTile accent={accent} label="Win rate" value={`${kpis.winRate.current}%`} d={kpis.winRate} unit="pts" priorLabel={priorLabel} hint="Share of visits that ended in a win" />
          <StatTile accent={accent} label={orderNoun} value={String(kpis.orders.current)} d={kpis.orders} priorLabel={priorLabel} hint={isDist ? 'Order inquiries sent to your distributor' : 'Purchase orders submitted'} />
          {report.hasOrderValue
            ? <StatTile accent={accent} label="Order value" value={compactMoney(kpis.orderValue.current)} d={kpis.orderValue} unit="dollars" priorLabel={priorLabel} hint="Total value of orders in the period" />
            : <StatTile accent={accent} label="In progress" value={String(kpis.inProgress.current)} d={kpis.inProgress} priorLabel={priorLabel} hint="Accounts that committed to order or asked for follow-up" />}
          <StatTile accent={accent} label="New placements" value={String(kpis.newPlacements.current)} d={kpis.newPlacements} priorLabel={priorLabel} hint="Placements added during the period" />
          <StatTile accent={accent} label="Events & tastings" value={String(kpis.events.current)} d={kpis.events} priorLabel={priorLabel} hint="Tastings, demos, and meetings held" />
        </div>

        <div className="pr-rise"><TrendChart report={report} accent={accent} dimmed={fetchingExtra} /></div>

        <div className="pr-split pr-rise">
          <OutcomeBreakdown report={report} onPick={pickOutcome} activeGroup={feedGroup} />
          <TopAccounts report={report} accent={accent} />
        </div>

        <div className="pr-main-rail pr-rise">
          {/* Activity feed */}
          <Panel id="pr-feed" style={{ padding: '18px 0 0' }}>
            <div style={{ padding: '0 18px' }}>
              <SectionTitle sub={`${feedVisits.length} of ${report.visits.length} visit${report.visits.length === 1 ? '' : 's'} · ${range.label}`}>Field activity</SectionTitle>
              <div className="pr-filter" style={{ marginBottom: 12 }}>
                <Chip color={accent} active={feedGroup === 'all'} onClick={() => { setFeedGroup('all'); setFeedLimit(12) }}>All</Chip>
                {(['win', 'progress', 'neutral', 'passed'] as OutcomeGroup[]).map(g => (
                  <Chip key={g} color={OUTCOME_GROUP_COLOR[g]} dot={OUTCOME_GROUP_COLOR[g]} active={feedGroup === g} onClick={() => { setFeedGroup(g); setFeedLimit(12) }}>{OUTCOME_GROUP_LABEL[g]}</Chip>
                ))}
              </div>
            </div>
            {feedVisits.length === 0 ? (
              <div style={{ padding: '32px 18px', textAlign: 'center', color: T.muted, fontSize: 12.5 }}>No visits match this filter in {range.label.toLowerCase()}.</div>
            ) : (
              <div>
                {feedVisits.slice(0, feedLimit).map(v => {
                  const c = OUTCOME_GROUP_COLOR[outcomeGroup(v.status)]
                  return (
                    <div key={v.id} className="pr-row" style={{ display: 'grid', gridTemplateColumns: '4px 1fr auto', gap: 13, padding: '12px 18px', borderTop: `1px solid ${T.borderSoft}`, alignItems: 'start' }}>
                      <div style={{ width: 4, borderRadius: 2, background: c, alignSelf: 'stretch', minHeight: 32 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{v.accounts?.name || 'Account'}</div>
                        <div style={{ fontSize: 12, marginTop: 3, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, color: T.text2 }}>{v.status}</span>
                          {OUTCOME_DESCRIPTION[v.status] && <span style={{ color: T.muted }}>· {OUTCOME_DESCRIPTION[v.status]}</span>}
                        </div>
                        {v.notes && <div style={{ fontSize: 12, color: T.muted, marginTop: 5, lineHeight: 1.55 }}>{v.notes}</div>}
                      </div>
                      <div style={{ fontSize: 11.5, color: T.faint, whiteSpace: 'nowrap', paddingTop: 2 }}>{mtShortDate(toMs(v.visited_at))}</div>
                    </div>
                  )
                })}
                {feedLimit < feedVisits.length && (
                  <button onClick={() => setFeedLimit(n => n + 25)} className="pr-ghost" style={{ width: '100%', padding: 14, background: 'none', border: 'none', borderTop: `1px solid ${T.borderSoft}`, cursor: 'pointer', fontSize: 12.5, color: T.text2, fontFamily: F, fontWeight: 600 }}>
                    Show 25 more · {feedVisits.length - feedLimit} remaining
                  </button>
                )}
              </div>
            )}
          </Panel>

          {/* Rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <PlacementsPanel report={report} accent={accent} onOpen={() => setDrawer('placements')} />
            <HealthPanel report={report} accent={accent} />
          </div>
        </div>

        {/* ── Links ── */}
        <div className="pr-links pr-rise">
          {linkCards.map(item => (
            <button key={item.key} onClick={() => setDrawer(item.key)} className="pr-link" style={{ background: T.cardSolid, border: `1px solid ${T.border}`, borderRadius: 14, padding: '15px 17px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13, fontFamily: F, textAlign: 'left', minHeight: 68 }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: accent + '1c', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${accent}2e` }}>{item.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: T.text }}>{item.label}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: item.alert ? T.bad : T.muted, marginTop: 3 }}>{item.sub}</span>
              </span>
              <ChevronRight size={15} color={T.faint} />
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: T.faint, paddingTop: 10, lineHeight: 1.6 }}>
          Prepared by Barley Bros · Field data updates continuously · All dates in Mountain Time
        </div>
      </main>

      {/* ── Drawers ── */}
      {drawer === 'placements' && (
        <Drawer title="Active placements" count={activePlacements.length} onClose={() => setDrawer(null)}>
          {activePlacements.length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>No active placements yet.</div>}
          {activePlacements.map((p: any, i: number) => {
            const idx = ['committed', 'ordered', 'on_shelf', 'reordering'].indexOf(p.status); const c = PIPELINE_RAMP[idx] || accent
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '4px 1fr auto', gap: 12, padding: '12px 0', borderBottom: i < activePlacements.length - 1 ? `1px solid ${T.borderSoft}` : 'none', alignItems: 'center' }}>
                <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: c, minHeight: 34 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{p.accounts?.name || '—'}</div>
                  <div style={{ fontSize: 12, color: T.text2, marginTop: 2 }}>{p.product_name}{p.placement_type ? ` · ${p.placement_type}` : ''}</div>
                  <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>Since {formatShortDateMT(p.created_at)}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.text, background: c + '33', padding: '4px 9px', borderRadius: 6, whiteSpace: 'nowrap' }}>{PIPELINE_LABEL[p.status] || p.status}</span>
              </div>
            )
          })}
        </Drawer>
      )}

      {drawer === 'orders' && (
        <Drawer title={`${orderNoun} · ${range.label}`} count={report.orders.length} onClose={() => setDrawer(null)}>
          {report.orders.length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>No {orderNoun.toLowerCase()} in this period.</div>}
          {report.orders.map((o: any, i: number) => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: i < report.orders.length - 1 ? `1px solid ${T.borderSoft}` : 'none' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{o.deliver_to_name || o.accounts?.name || 'Order'}</div>
                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>{o.po_number ? `PO ${o.po_number} · ` : ''}{mtShortDate(toMs(o.sent_at || o.created_at))}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {Number(o.total_amount) > 0 && <div style={{ fontSize: 14.5, fontWeight: 700, color: T.gold, fontVariantNumeric: 'tabular-nums' }}>${Number(o.total_amount).toLocaleString()}</div>}
                <div style={{ fontSize: 10.5, fontWeight: 600, color: o.status === 'fulfilled' ? T.good : T.text2, marginTop: 3 }}>{orderStatusLabel(o.status)}</div>
              </div>
            </div>
          ))}
        </Drawer>
      )}

      {drawer === 'events' && (
        <Drawer title="Events & tastings" onClose={() => setDrawer(null)}>
          {upcomingEvents.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: T.gold, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 9 }}>Coming up</div>
              {upcomingEvents.map((e: any) => (
                <div key={e.id} style={{ padding: '11px 0', borderBottom: `1px solid ${T.borderSoft}` }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{e.title}</div>
                  <div style={{ fontSize: 12, color: T.text2, marginTop: 3 }}>{new Date(toMs(e.start_time)).toLocaleString('en-US', { timeZone: 'America/Denver', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{e.accounts?.name ? ` · ${e.accounts.name}` : ''}</div>
                </div>
              ))}
              <div style={{ height: 20 }} />
            </>
          )}
          <div style={{ fontSize: 10.5, fontWeight: 700, color: T.gold, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 9 }}>{range.label}</div>
          {report.events.length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>No events in this period.</div>}
          {report.events.map((e: any) => (
            <div key={e.id} style={{ padding: '11px 0', borderBottom: `1px solid ${T.borderSoft}` }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{e.title}</div>
              <div style={{ fontSize: 12, color: T.text2, marginTop: 3 }}>{mtShortDate(toMs(e.start_time))}{e.event_type ? ` · ${String(e.event_type).replace('_', ' ')}` : ''}{e.accounts?.name ? ` · ${e.accounts.name}` : ''}</div>
            </div>
          ))}
        </Drawer>
      )}

      {drawer === 'campaigns' && (
        <Drawer title="Campaigns" count={campaigns?.length} onClose={() => setDrawer(null)}>
          {(campaigns || []).map((c: any, i: number) => {
            const sc = c.status === 'active' ? T.good : c.status === 'paused' ? '#c98500' : T.muted
            return (
              <div key={c.id} style={{ padding: '12px 0', borderBottom: i < campaigns.length - 1 ? `1px solid ${T.borderSoft}` : 'none', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{c.title}</div>
                  {c.start_date && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>{formatShortDateMT(c.start_date)}{c.end_date ? ` – ${formatShortDateMT(c.end_date)}` : ''}</div>}
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: sc, background: sc + '22', padding: '4px 9px', borderRadius: 6, textTransform: 'capitalize', alignSelf: 'flex-start' }}>{c.status}</span>
              </div>
            )
          })}
        </Drawer>
      )}

      {drawer === 'compliance' && (
        <Drawer title="State compliance" count={registrations?.length} onClose={() => setDrawer(null)}>
          {expiringRegs.length > 0 && (
            <div style={{ background: 'rgba(224,102,74,0.1)', border: '1px solid rgba(224,102,74,0.3)', borderRadius: 10, padding: '11px 13px', marginBottom: 15, fontSize: 12.5, color: T.bad }}>
              {expiringRegs.length} registration{expiringRegs.length > 1 ? 's' : ''} expiring within 60 days
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {(registrations || []).map((r: any) => {
              const sc: Record<string, string> = { active: T.good, pending: '#c98500', expired: T.bad, not_registered: T.muted }
              const sl: Record<string, string> = { active: 'Active', pending: 'Pending', expired: 'Expired', not_registered: 'N/A' }
              const col = sc[r.status] || T.muted
              return (
                <div key={r.id} style={{ background: T.cardSolid, border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{r.state}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: col, background: col + '22', padding: '2px 7px', borderRadius: 5 }}>{sl[r.status] || r.status}</span>
                  </div>
                  {r.expiry_date && <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>Expires {formatShortDateMT(r.expiry_date)}</div>}
                </div>
              )
            })}
          </div>
        </Drawer>
      )}

      {drawer === 'files' && (
        <Drawer title="Files & assets" count={clientFiles.length || undefined} onClose={() => setDrawer(null)}>
          {!showFileUpload ? (
            <button onClick={() => setShowFileUpload(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: accent + '1c', border: `1px solid ${accent}44`, borderRadius: 9, padding: '11px 15px', color: T.text, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: F, marginBottom: 16, minHeight: 44 }}>
              <Upload size={14} /> Upload a file
            </button>
          ) : (
            <div style={{ background: T.cardSolid, border: `1px solid ${T.border}`, borderRadius: 11, padding: 15, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 9 }}>
                <select value={fileUploadType} onChange={e => setFileUploadType(e.target.value as ClientFileType)} aria-label="File type" style={inputStyle}>
                  {(['logo', 'compliance', 'photo', 'brand_asset', 'other'] as const).map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
                <input type="date" value={fileUploadExpiry} onChange={e => setFileUploadExpiry(e.target.value)} aria-label="Expiry date" style={inputStyle} />
              </div>
              <input type="text" value={fileUploadDesc} onChange={e => setFileUploadDesc(e.target.value)} placeholder="Description (optional)" style={{ ...inputStyle, marginBottom: 9 }} />
              <div style={{ display: 'flex', gap: 9 }}>
                <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFileUpload(f) }} />
                <button onClick={() => fileInputRef.current?.click()} disabled={fileUploading} style={{ background: accent, color: '#0a0806', border: 'none', borderRadius: 9, padding: '11px 17px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F, minHeight: 44 }}>{fileUploading ? 'Uploading…' : 'Choose file'}</button>
                <button onClick={() => { setShowFileUpload(false); setFileUploadErr('') }} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 9, padding: '11px 14px', fontSize: 13, color: T.text2, cursor: 'pointer', fontFamily: F, minHeight: 44 }}>Cancel</button>
              </div>
              {fileUploadErr && <div style={{ color: T.bad, fontSize: 12, marginTop: 7 }}>{fileUploadErr}</div>}
            </div>
          )}
          {filesLoading ? <div style={{ color: T.muted, fontSize: 12 }}>Loading…</div>
            : clientFiles.length === 0 ? <div style={{ color: T.muted, fontSize: 13 }}>No files yet.</div>
            : clientFiles.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: `1px solid ${T.borderSoft}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.description || f.name}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{f.file_type.replace('_', ' ')}{f.expiry_date ? ` · expires ${formatShortDateMT(f.expiry_date)}` : ''}</div>
                </div>
                <a href={f.file_url} target="_blank" rel="noopener noreferrer" aria-label={`Download ${f.name}`} style={{ color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 9, border: `1px solid ${T.border}`, flexShrink: 0 }}><Download size={15} /></a>
              </div>
            ))}
        </Drawer>
      )}

      {drawer === 'suggest' && (
        <Drawer title="Suggest to Barley Bros" onClose={() => setDrawer(null)}>
          {submitted ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 0', textAlign: 'center' }}>
              <div style={{ width: 54, height: 54, borderRadius: '50%', background: T.good + '22', border: `1px solid ${T.good}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle size={25} color={T.good} /></div>
              <div>
                <div style={{ fontSize: 16.5, fontWeight: 700, color: T.text, marginBottom: 8 }}>Submitted</div>
                <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.6 }}>Our team will review your suggestion and follow up.</div>
              </div>
              <button onClick={() => { setSuggestForm(emptySuggest); setShowContactSection(false); setSubmitted(false); setSuggestErr('') }} style={{ fontSize: 13, color: T.text, background: 'none', border: `1px solid ${T.border}`, borderRadius: 9, padding: '11px 21px', cursor: 'pointer', fontFamily: F, fontWeight: 600 }}>Submit another</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 3, marginBottom: 18, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3, border: `1px solid ${T.borderSoft}` }}>
                {([['account', 'Account / venue'], ['contact', 'Industry contact']] as const).map(([t, lbl]) => (
                  <button key={t} onClick={() => { setSuggestType(t); setSuggestForm(emptySuggest); setShowContactSection(false); setSuggestErr('') }}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: 'none', background: suggestType === t ? accent : 'transparent', color: suggestType === t ? '#0a0806' : T.text2, cursor: 'pointer', fontFamily: F, minHeight: 40 }}>{lbl}</button>
                ))}
              </div>
              <p style={{ fontSize: 12.5, color: T.text2, lineHeight: 1.6, margin: '0 0 18px' }}>
                {suggestType === 'account' ? 'Know a bar, restaurant, or retailer we should approach? Tell us about it.' : 'Know a buyer, manager, or distributor rep we should connect with?'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                <div><span style={labelStyle}>{suggestType === 'account' ? 'Venue / account name *' : 'Their name *'}</span>
                  <input ref={suggestNameRef} type="text" value={suggestForm.name} onChange={e => setSuggestForm(f => ({ ...f, name: e.target.value }))} placeholder={suggestType === 'account' ? 'e.g. The Crafty Fox' : 'e.g. Jamie Rivera'} style={inputStyle} /></div>
                {suggestType === 'account' && (
                  <div><span style={labelStyle}>Address</span><input type="text" value={suggestForm.address} onChange={e => setSuggestForm(f => ({ ...f, address: e.target.value }))} placeholder="Start typing to search…" style={inputStyle} /></div>
                )}
                {suggestType === 'contact' && (
                  <>
                    <div><span style={labelStyle}>Their role</span><input type="text" value={suggestForm.contact_role} onChange={e => setSuggestForm(f => ({ ...f, contact_role: e.target.value }))} placeholder="e.g. Bar Manager, Head Buyer" style={inputStyle} /></div>
                    <div><span style={labelStyle}>Where they work</span><input type="text" value={suggestForm.address} onChange={e => setSuggestForm(f => ({ ...f, address: e.target.value }))} placeholder="Account or company name" style={inputStyle} /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                      <div><span style={labelStyle}>Phone</span><input type="tel" value={suggestForm.contact_phone} onChange={e => setSuggestForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="Optional" style={inputStyle} /></div>
                      <div><span style={labelStyle}>Email</span><input type="email" value={suggestForm.contact_email} onChange={e => setSuggestForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="Optional" style={inputStyle} /></div>
                    </div>
                  </>
                )}
                <div><span style={labelStyle}>Why are you suggesting this? *</span>
                  <select value={suggestForm.reason} onChange={e => setSuggestForm(f => ({ ...f, reason: e.target.value }))} style={{ ...inputStyle, color: suggestForm.reason ? T.text : T.muted }}>
                    <option value="">Select a reason…</option>
                    {SUGGESTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select></div>
                <div><span style={labelStyle}>Additional notes</span><textarea value={suggestForm.notes} onChange={e => setSuggestForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anything else we should know…" rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
                {suggestType === 'account' && (!showContactSection ? (
                  <button onClick={() => setShowContactSection(true)} style={{ background: 'none', border: `1px dashed ${T.border}`, borderRadius: 9, padding: '12px 14px', color: T.text2, cursor: 'pointer', fontSize: 12.5, fontFamily: F, textAlign: 'left', width: '100%' }}>+ Add a key contact at this venue (optional)</button>
                ) : (
                  <div style={{ background: T.cardSolid, border: `1px solid ${T.border}`, borderRadius: 11, padding: '15px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ ...labelStyle, marginBottom: 0 }}>Key contact</span>
                      <button onClick={() => { setShowContactSection(false); setSuggestForm(f => ({ ...f, contact_name: '', contact_role: '', contact_phone: '', contact_email: '' })) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: T.muted, fontFamily: F }}>Remove</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <input type="text" value={suggestForm.contact_name} onChange={e => setSuggestForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Their name" style={inputStyle} />
                      <input type="text" value={suggestForm.contact_role} onChange={e => setSuggestForm(f => ({ ...f, contact_role: e.target.value }))} placeholder="Role (e.g. Bar Manager)" style={inputStyle} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                        <input type="tel" value={suggestForm.contact_phone} onChange={e => setSuggestForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="Phone" style={inputStyle} />
                        <input type="email" value={suggestForm.contact_email} onChange={e => setSuggestForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="Email" style={inputStyle} />
                      </div>
                    </div>
                  </div>
                ))}
                {suggestErr && <div style={{ color: T.bad, fontSize: 12.5, padding: '9px 13px', background: 'rgba(224,102,74,0.1)', borderRadius: 9, border: '1px solid rgba(224,102,74,0.26)' }}>{suggestErr}</div>}
                <button onClick={handleSuggest} disabled={submitting} style={{ background: accent, color: '#0a0806', border: 'none', borderRadius: 10, padding: 15, fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: F, opacity: submitting ? 0.7 : 1, marginTop: 4 }}>{submitting ? 'Sending to team…' : 'Submit to Barley Bros'}</button>
              </div>
            </>
          )}
        </Drawer>
      )}

      {showChangePw && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }} role="dialog" aria-label="Change password">
          <div style={{ backgroundColor: T.raised, border: `1px solid ${T.border}`, borderRadius: 16, padding: 26, width: '100%', maxWidth: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: T.text }}>Change password</div>
              <button onClick={() => setShowChangePw(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', padding: 6 }}><X size={17} /></button>
            </div>
            {pwSuccess ? (
              <div style={{ textAlign: 'center', padding: '18px 0' }}>
                <CheckCircle size={34} color={T.good} style={{ marginBottom: 11 }} />
                <div style={{ fontSize: 14, color: T.good, fontWeight: 600 }}>Password updated</div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 13 }}><label style={labelStyle}>New password</label><input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setPwError('') }} placeholder="••••••••" style={inputStyle} /></div>
                <div style={{ marginBottom: 17 }}><label style={labelStyle}>Confirm password</label><input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setPwError('') }} placeholder="••••••••" style={inputStyle} /></div>
                {pwError && <div style={{ fontSize: 12, color: T.bad, marginBottom: 13 }}>{pwError}</div>}
                <button disabled={pwLoading} onClick={async () => {
                  if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return }
                  if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
                  setPwLoading(true)
                  const { error: err } = await getSupabase().auth.updateUser({ password: newPw })
                  setPwLoading(false)
                  if (err) { setPwError(err.message); return }
                  setPwSuccess(true); setTimeout(() => setShowChangePw(false), 2000)
                }} style={{ width: '100%', padding: 13, backgroundColor: accent, color: '#0a0806', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: pwLoading ? 'not-allowed' : 'pointer', opacity: pwLoading ? 0.6 : 1, fontFamily: F, minHeight: 46 }}>{pwLoading ? 'Saving…' : 'Update password'}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
