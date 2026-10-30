'use client'
// Client portal page: data orchestration, period state, drawers. All numbers come
// from portal-metrics.ts; all presentation from portal-ui.tsx.
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { UserRound, Loader2 } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'
import { getPortalData, submitClientSuggestion, getClientFiles, uploadClientFile } from '../../lib/data'
import type { ClientFile, ClientFileType } from '../../lib/types'
import { clientLogoUrl, WESTERN_PEAK_LOGO_SCREEN_URL } from '../../lib/constants'
import {
  type PeriodSelection, type PeriodReport, type PdfSource,
  resolveRange, parseHash, toHash, stepSelection, defaultSelection, buildPeriodReport, getAccountDetail,
  buildMonthlyPdfData, buildQuarterlyPdfData, fmtMonthShort, fmtShortYear, quarterOf, quarterFirstMonth, addMonths, mtDayKey, isoDayKey,
} from './portal-metrics'
import {
  C, FS, FM, FIRM, accentTokens, PortalStyles, Seg, Btn, Panel, MeasuresBlock, CumulativeChart, Funnel, Ledger, AccountsPanel, EventsPanel, Timeline,
  Drawer, Field, AccountDrawer, OrderDrawer, MonthlyPreview, QuarterlyPreview, mono, upperLabel,
} from './portal-ui'
import PortalMap from './PortalMap'

const SUGGESTION_REASONS: { value: string; label: string }[] = [
  { value: 'inbound_request', label: 'They asked for us' },
  { value: 'competitor_gap', label: 'Gap I noticed' },
  { value: 'warm_referral', label: 'Referral' },
  { value: 'staff_fan', label: 'Staff interest' },
  { value: 'strategic_fit', label: 'High-volume, strong fit' },
  { value: 'other', label: 'Other' },
]

const FILE_KINDS: { label: string; type: ClientFileType; description?: string }[] = [
  { label: 'Logo or brand asset', type: 'brand_asset' },
  { label: 'Product photo', type: 'photo' },
  { label: 'Price sheet', type: 'other', description: 'Price sheet' },
  { label: 'Sell sheet', type: 'other', description: 'Sell sheet' },
  { label: 'Other', type: 'other' },
]
const FILE_TYPE_LABEL: Record<string, string> = { logo: 'Logo', brand_asset: 'Brand asset', photo: 'Photo', compliance: 'Compliance', other: 'File' }

type DrawerKind = null | 'files' | 'suggest' | 'report' | { account: string } | { order: string }

export default function ClientPortalPage() {
  const { slug } = useParams() as { slug: string }

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isPreview, setIsPreview] = useState(false)
  const [userProfile, setUserProfile] = useState<{ id: string; name: string; email: string; role: string } | null>(null)
  const [loadedAt, setLoadedAt] = useState<number>(() => Date.now())
  const [repNames, setRepNames] = useState<Record<string, string>>({})

  const [view, setView] = useState<'client' | 'firm'>('client')
  const [sel, setSel] = useState<PeriodSelection>(() => (typeof window !== 'undefined' ? parseHash(window.location.hash, Date.now()) : defaultSelection(Date.now())))
  const range = useMemo(() => resolveRange(sel, loadedAt), [sel, loadedAt])

  const [drawer, setDrawer] = useState<DrawerKind>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [clientFiles, setClientFiles] = useState<ClientFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [fileKind, setFileKind] = useState(0)
  const [fileUploading, setFileUploading] = useState(false)
  const [fileErr, setFileErr] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const emptySuggest = { name: '', address: '', reason: '', notes: '', contactName: '', contactRole: '', contactPhone: '', contactEmail: '' }
  const venueInputRef = useRef<HTMLInputElement>(null)
  const [suggestForm, setSuggestForm] = useState(emptySuggest)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [suggestErr, setSuggestErr] = useState('')

  const [reportKind, setReportKind] = useState<'month' | 'quarter'>('month')
  const [reportMonth, setReportMonth] = useState('')
  const [reportQuarter, setReportQuarter] = useState<{ year: number; q: number } | null>(null)
  const [earlier, setEarlier] = useState<{ name: string; url: string; date: string }[]>([])
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState('')

  const [showChangePw, setShowChangePw] = useState(false)
  const [newPw, setNewPw] = useState(''); const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState(''); const [pwSuccess, setPwSuccess] = useState(false); const [pwLoading, setPwLoading] = useState(false)

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
      setUserProfile({ id: user.id, name: profile?.name || '', email: user.email || '', role: profile?.role || '' })
      try {
        const d = await getPortalData(slug)
        if (!d) { setError('Brand not found'); setLoading(false); return }
        setData(d)
        setLoadedAt(Date.now())
        setFilesLoading(true)
        getClientFiles(slug).then(f => { setClientFiles(f); setFilesLoading(false) }).catch(() => setFilesLoading(false))
        if (isStaff) {
          // Rep names are only readable by staff (RLS) and only shown in the firm view.
          sb.from('user_profiles').select('id, name').then(({ data: profiles }) => {
            const map: Record<string, string> = {}
            for (const p of (profiles || []) as { id: string; name: string | null }[]) if (p.name) map[p.id] = p.name
            setRepNames(map)
          })
        }
      } catch (e) { console.error('portal.load', e); setError('Failed to load data') }
      finally { setLoading(false) }
    })
  }, [slug])

  // ── Period ↔ URL hash ─────────────────────────────────────────────────────────
  useEffect(() => {
    const h = toHash(sel)
    if (h !== '#custom' && window.location.hash !== h) window.history.replaceState(null, '', h)
  }, [sel])
  useEffect(() => {
    const onHash = () => setSel(parseHash(window.location.hash, Date.now()))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // ── Google Places search on the Suggest an account venue field ────────────────
  // Picking a result fills Venue and Address. Listeners and the dropdown are removed
  // when the drawer closes so nothing leaks between openings.
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (drawer !== 'suggest' || submitted || !key) return
    const w = window as any
    let ac: any = null
    let alive = true
    const init = () => {
      if (!alive || ac || !venueInputRef.current) return
      ac = new w.google.maps.places.Autocomplete(venueInputRef.current, { types: ['establishment'], componentRestrictions: { country: 'us' }, fields: ['name', 'formatted_address'] })
      ac.addListener('place_changed', () => {
        const p = ac.getPlace()
        setSuggestForm(f => ({ ...f, name: p?.name || f.name, address: p?.formatted_address || f.address }))
      })
    }
    if (!document.getElementById('gm-script')) {
      const sc = document.createElement('script'); sc.id = 'gm-script'; sc.async = true
      sc.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
      document.head.appendChild(sc)
    }
    const iv = setInterval(() => { if (w.google?.maps?.places) { clearInterval(iv); init() } }, 100)
    return () => {
      alive = false; clearInterval(iv)
      if (ac && w.google?.maps?.event) w.google.maps.event.clearInstanceListeners(ac)
      document.querySelectorAll('.pac-container').forEach(el => el.remove())
    }
  }, [drawer, submitted])

  // ── Account menu ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menuOpen])

  const isStaff = isPreview
  const firm = isStaff && view === 'firm'

  const report = useMemo<PeriodReport | null>(() => {
    if (!data) return null
    return buildPeriodReport({
      visits: data.visits, orders: data.orders, events: data.events, accounts: data.accounts, tastingConsumers: data.tastingConsumers,
      range, nowMs: loadedAt, staff: firm, repNames,
    })
  }, [data, range, loadedAt, firm, repNames])

  const pdfSource = useMemo<PdfSource | null>(() => data ? ({ visits: data.visits, orders: data.orders, events: data.events, accounts: data.accounts, tastingConsumers: data.tastingConsumers, nowMs: loadedAt }) : null, [data, loadedAt])
  const monthlyData = useMemo(() => (pdfSource && drawer === 'report' && reportMonth ? buildMonthlyPdfData(pdfSource, reportMonth) : null), [pdfSource, drawer, reportMonth])
  const quarterlyData = useMemo(() => (pdfSource && drawer === 'report' && reportQuarter ? buildQuarterlyPdfData(pdfSource, reportQuarter.year, reportQuarter.q) : null), [pdfSource, drawer, reportQuarter])

  const closeDrawer = useCallback(() => setDrawer(null), [])
  const openAccount = useCallback((id: string) => setDrawer({ account: id }), [])
  const openOrder = useCallback((id: string) => setDrawer({ order: id }), [])

  const openReport = () => {
    const todayMonth = mtDayKey(loadedAt).slice(0, 7)
    const month = sel.mode === 'month' ? sel.anchor : sel.mode === 'quarter' ? addMonths(sel.anchor, 2) > todayMonth ? todayMonth : addMonths(sel.anchor, 2) : todayMonth
    setReportMonth(month)
    setReportQuarter(quarterOf(sel.mode === 'quarter' ? sel.anchor : month))
    setReportKind(sel.mode === 'quarter' ? 'quarter' : 'month')
    setPdfError('')
    setDrawer('report')
    const sb = getSupabase()
    sb.storage.from('client-files').list(`reports/${slug}`, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } })
      .then(({ data: files }) => {
        const rows = (files || []).filter(f => f.name && !f.name.startsWith('.')).map(f => ({
          name: f.name.replace(/\.pdf$/i, ''), url: sb.storage.from('client-files').getPublicUrl(`reports/${slug}/${f.name}`).data.publicUrl,
          date: f.created_at ? fmtShortYear(isoDayKey(f.created_at)) : '',
        }))
        setEarlier(rows)
      }).catch(() => setEarlier([]))
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────
  async function handleSuggest() {
    if (!suggestForm.name.trim() || !suggestForm.reason) { setSuggestErr('Venue and reason are required'); return }
    setSubmitting(true); setSuggestErr('')
    try {
      await submitClientSuggestion({
        client_slug: slug, suggestion_type: 'account', name: suggestForm.name.trim(), address: suggestForm.address || undefined,
        reason: suggestForm.reason, notes: suggestForm.notes || undefined,
        contact_person: suggestForm.contactName.trim() || undefined, contact_category: suggestForm.contactRole.trim() || undefined,
        contact_phone: suggestForm.contactPhone.trim() || undefined, contact_email: suggestForm.contactEmail.trim() || undefined,
        submitted_by_name: userProfile?.name || undefined, submitted_by_email: userProfile?.email || undefined,
      })
      fetch('/api/client-suggestion-notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: data?.client?.name || slug, suggestion_type: 'account', name: suggestForm.name, address: suggestForm.address,
          reason: SUGGESTION_REASONS.find(r => r.value === suggestForm.reason)?.label, notes: suggestForm.notes,
          contact_name: suggestForm.contactName || undefined, contact_role: suggestForm.contactRole || undefined,
          contact_email: suggestForm.contactEmail || undefined, contact_phone: suggestForm.contactPhone || undefined,
          submitted_by: userProfile?.name || userProfile?.email,
        }),
      }).catch(() => {})
      setSubmitted(true)
    } catch (e: any) { console.error('portal.suggest', e); setSuggestErr(e.message || 'Could not send') }
    finally { setSubmitting(false) }
  }

  async function handleFileUpload(file: File) {
    setFileUploading(true); setFileErr('')
    const kind = FILE_KINDS[fileKind] || FILE_KINDS[4]
    try {
      const uploaded = await uploadClientFile(slug, file, { file_type: kind.type, description: kind.description, uploaded_by: isStaff ? userProfile?.id : undefined, uploaded_by_portal: !isStaff })
      setClientFiles(prev => [uploaded, ...prev])
    } catch (e: any) { console.error('portal.upload', e); setFileErr(e.message || 'Upload failed') }
    finally { setFileUploading(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const handleDownloadPDF = useCallback(async () => {
    if (!data) return
    setPdfBusy(true); setPdfError('')
    try {
      const [{ pdf }, mod] = await Promise.all([import('@react-pdf/renderer'), import('./PortalReportPDF')])
      const preparedOn = new Date(loadedAt).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric' })
      const clientName = data.client?.name || slug
      let doc: React.ReactElement, filename: string
      if (reportKind === 'month' && monthlyData) {
        doc = React.createElement(mod.MonthlyReportPDF, { data: monthlyData, clientName, preparedOn })
        filename = `${slug}-${monthlyData.monthKey}.pdf`
      } else if (quarterlyData) {
        doc = React.createElement(mod.QuarterlyReportPDF, { data: quarterlyData, clientName, preparedOn })
        filename = `${slug}-Q${quarterlyData.q}-${quarterlyData.year}.pdf`
      } else return
      const blob = await pdf(doc as any).toBlob()
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
  }, [data, slug, loadedAt, reportKind, monthlyData, quarterlyData])

  // ── Loading / error ───────────────────────────────────────────────────────────
  const accent = accentTokens(data?.client?.color)
  if (loading) return (
    <div className="pt-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.mute, fontFamily: FS, minHeight: '100vh', fontSize: 13 }}>
      <PortalStyles accent={accent} />
      Loading brand report…
    </div>
  )
  if (error || !report || !data) return (
    <div className="pt-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: FS, minHeight: '100vh', padding: 24, textAlign: 'center' }}>
      <PortalStyles accent={accent} />
      <div>
        <div style={{ fontSize: 14, color: C.dn, marginBottom: 12 }}>{error || 'Something went wrong'}</div>
        <button onClick={() => { getSupabase().auth.signOut(); window.location.href = '/login' }} style={{ fontSize: 13, color: C.ink2, textDecoration: 'underline' }}>Sign in again</button>
      </div>
    </div>
  )

  // ── Derived ───────────────────────────────────────────────────────────────────
  const { client } = data
  const logoUrl = client ? clientLogoUrl(client) : null
  const mapToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const showMap = !!mapToken && report.mapAccounts.length > 0
  const activeOnMap = report.mapAccounts.filter(a => a.active).length
  const hasEvents = report.events.length > 0
  const updatedAt = new Date(loadedAt).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit' })
  const accountDetail = drawer && typeof drawer === 'object' && 'account' in drawer ? getAccountDetail(report, drawer.account) : null
  const orderDetail = drawer && typeof drawer === 'object' && 'order' in drawer ? report.ordersLedger.all.find(o => o.id === drawer.order) || null : null
  const today = mtDayKey(loadedAt)
  const todayMonth = today.slice(0, 7)
  const reportQNext = reportQuarter ? addMonths(quarterFirstMonth(reportQuarter.year, reportQuarter.q), 3) <= todayMonth : false
  const preparedOn = new Date(loadedAt).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric' })
  const whoUploaded = (f: ClientFile) => (f.uploaded_by_portal ? client?.name : f.user_profiles?.name || FIRM.name)

  return (
    <div className="pt-root">
      <PortalStyles accent={accent} />
      <div className="pt-wrap">
        {/* ── Staff bar: rendered only for owner/admin/rep/intern (role check, not CSS) ── */}
        {isStaff && (
          <div className="pt-staffbar" aria-label="Staff preview">
            <span style={{ ...upperLabel, fontSize: 11, color: accent.accentInk, letterSpacing: '.08em' }}>Staff preview</span>
            <Seg ariaLabel="Viewer" value={view} onChange={v => setView(v as 'client' | 'firm')} style={{ transform: 'scale(.92)', transformOrigin: 'right center' }}
              options={[{ value: 'client', label: 'Client view' }, { value: 'firm', label: `${FIRM.name} view` }]} />
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="pt-bar">
          <div className="pt-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={WESTERN_PEAK_LOGO_SCREEN_URL} alt="Western Peak" style={{ height: 28, width: 'auto', display: 'block' }} />
            <span className="pt-brand-label" style={{ ...upperLabel, fontSize: 11, whiteSpace: 'nowrap' }}>Brand report</span>
          </div>
          <div className="pt-tools">
            <div className="pt-tools-row">
              <Seg ariaLabel="Period" value={sel.mode} onChange={m => setSel(s => ({ ...s, mode: m, anchor: s.anchor || todayMonth }))}
                options={[{ value: '30d', label: 'Last 30 days' }, { value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'custom', label: 'Custom' }]} />
              {(sel.mode === 'month' || sel.mode === 'quarter') && (
                <span role="group" aria-label="Move period" style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', background: C.surface, flexShrink: 0 }}>
                  <button type="button" onClick={() => setSel(s => stepSelection(s, -1))} aria-label="Previous" style={{ padding: '7px 12px', fontSize: 13, color: C.ink2, borderRight: `1px solid ${C.line}` }}>‹</button>
                  <span style={{ ...mono, fontSize: 12.5, minWidth: 80, textAlign: 'center', padding: '7px 8px', color: C.ink, whiteSpace: 'nowrap' }}>{range.navLabel}</span>
                  <button type="button" onClick={() => setSel(s => stepSelection(s, 1))} disabled={!range.canNext} aria-label="Next" style={{ padding: '7px 12px', fontSize: 13, color: range.canNext ? C.ink2 : C.faint, borderLeft: `1px solid ${C.line}` }}>›</button>
                </span>
              )}
              {sel.mode === 'custom' && (
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <input type="date" value={sel.customStart} max={sel.customEnd || today} aria-label="From" onChange={e => setSel(s => ({ ...s, customStart: e.target.value }))}
                    style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, padding: '7px 8px', fontSize: 13, fontFamily: FM }} />
                  <span style={{ color: C.mute }}>to</span>
                  <input type="date" value={sel.customEnd} min={sel.customStart} max={today} aria-label="To" onChange={e => setSel(s => ({ ...s, customEnd: e.target.value }))}
                    style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, padding: '7px 8px', fontSize: 13, fontFamily: FM }} />
                </span>
              )}
            </div>
            <div className="pt-tools-row">
              <Btn onClick={() => setDrawer('files')}>Files</Btn>
              <Btn onClick={() => { setSubmitted(false); setSuggestErr(''); setDrawer('suggest') }}>Suggest an account</Btn>
              <Btn primary onClick={openReport}>Download report</Btn>
              <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button type="button" onClick={() => setMenuOpen(o => !o)} aria-label="Account menu" aria-haspopup="menu" aria-expanded={menuOpen}
                  style={{ width: 36, height: 36, border: `1px solid ${C.line}`, borderRadius: 8, display: 'grid', placeItems: 'center', color: C.ink2, background: C.surface }}>
                  <UserRound size={16} />
                </button>
                {menuOpen && (
                  <div role="menu" className="pt-menu" style={{ position: 'absolute', right: 0, top: 42, background: C.raised, border: `1px solid ${C.line}`, borderRadius: 10, padding: 6, minWidth: 190, zIndex: 20, boxShadow: '0 12px 32px rgba(0,0,0,.5)' }}>
                    <div style={{ padding: '8px 10px', fontSize: 12, color: C.mute, borderBottom: `1px solid ${C.line2}`, marginBottom: 4 }}>{userProfile?.name || userProfile?.email}</div>
                    <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setShowChangePw(true); setPwError(''); setPwSuccess(false); setNewPw(''); setConfirmPw('') }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 7, fontSize: 13.5 }}>Change password</button>
                    <button role="menuitem" type="button" onClick={() => getSupabase().auth.signOut().then(() => { window.location.href = '/login' })} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 7, fontSize: 13.5 }}>Sign out</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Identity ── */}
        <section className="pt-id">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoUrl} alt={client?.name} style={{ width: 50, height: 50, borderRadius: 12, objectFit: 'contain', background: accent.accentSoft, border: `1px solid ${C.line}`, padding: 4 }} />
              : <div style={{ width: 50, height: 50, borderRadius: 12, background: accent.accentSoft, color: accent.accentInk, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 20, border: `1px solid ${C.line}` }}>{(client?.name || '?')[0]}</div>}
            <div>
              <h1 style={{ fontSize: 'clamp(26px, 3vw, 34px)', fontWeight: 600, letterSpacing: '-0.025em', margin: 0, lineHeight: 1.05 }}>{client?.name}</h1>
            </div>
          </div>
          <div className="pt-id-right">
            <div style={{ fontSize: 16, fontWeight: 600 }}>{range.labelToDate}</div>
            <div style={{ fontSize: 13, color: C.mute }}>Compared with the {range.compareLabel} · updated {updatedAt} MT</div>
          </div>
        </section>

        <MeasuresBlock report={report} />

        <div className="pt-row32">
          <CumulativeChart report={report} />
          <Funnel report={report} />
        </div>

        {showMap && (
          <Panel title="Account map" sub={`${report.mapAccounts.length} account${report.mapAccounts.length === 1 ? '' : 's'} · ${activeOnMap} active`}>
            <PortalMap accounts={report.mapAccounts} onSelect={openAccount} token={mapToken} />
          </Panel>
        )}

        <Ledger report={report} firm={firm} onOpenAccount={openAccount} />

        {hasEvents ? (
          <div className="pt-row2">
            <AccountsPanel report={report} />
            <EventsPanel report={report} />
          </div>
        ) : (
          <AccountsPanel report={report} wide />
        )}

        <Timeline report={report} firm={firm} onOpenOrder={openOrder} onOpenAccount={openAccount} />

        <footer style={{ marginTop: 26, paddingTop: 16, borderTop: `1px solid ${C.line}`, fontSize: 12.5, color: C.mute, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <span>Prepared by {FIRM.name} · Updates as the field logs it · Mountain Time</span>
          <span>Questions: {FIRM.contact}</span>
        </footer>
      </div>

      {/* ── Drawers ── */}
      {accountDetail && <AccountDrawer detail={accountDetail} firm={firm} onClose={closeDrawer} />}
      {orderDetail && <OrderDrawer order={orderDetail} accent={accent} onOpenAccount={openAccount} onClose={closeDrawer} />}

      {drawer === 'files' && (
        <Drawer title="Files" sub={`Shared between ${client?.name} and ${FIRM.name}`} onClose={closeDrawer}>
          <div>
            {filesLoading ? <div style={{ color: C.mute, fontSize: 13 }}>Loading…</div>
              : clientFiles.length === 0 ? <div style={{ color: C.mute, fontSize: 13.5, padding: '8px 0' }}>No files yet.</div>
              : clientFiles.map(f => (
                <div key={f.id} className="pt-file">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                    <small style={{ display: 'block', color: C.mute, fontSize: 12, marginTop: 2 }}>{f.description || FILE_TYPE_LABEL[f.file_type] || 'File'} · {whoUploaded(f)} · {fmtShortYear(isoDayKey(f.created_at))}</small>
                  </div>
                  <a href={f.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${C.line}`, background: C.surface, textDecoration: 'none' }}>Open</a>
                </div>
              ))}
          </div>
          <h3 style={{ ...upperLabel, fontSize: 11.5, letterSpacing: '.05em', margin: '14px 0 4px' }}>Upload</h3>
          <Field label="What is it">
            <select value={fileKind} onChange={e => setFileKind(Number(e.target.value))}>
              {FILE_KINDS.map((k, i) => <option key={k.label} value={i}>{k.label}</option>)}
            </select>
          </Field>
          <Field label="File"><input ref={fileInputRef} type="file" /></Field>
          <Btn primary disabled={fileUploading} style={{ alignSelf: 'flex-start' }} onClick={() => { const f = fileInputRef.current?.files?.[0]; if (!f) { setFileErr('Choose a file first'); return } handleFileUpload(f) }}>
            {fileUploading ? <><Loader2 size={14} /> Uploading…</> : 'Upload'}
          </Btn>
          {fileErr && <div style={{ color: C.dn, fontSize: 13 }}>{fileErr}</div>}
        </Drawer>
      )}

      {drawer === 'suggest' && (
        <Drawer title="Suggest an account" onClose={closeDrawer}>
          {submitted ? (
            <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(143,211,180,.12)', color: C.up, fontSize: 13.5 }}>Sent to {FIRM.contactFirst}.</div>
          ) : (
            <>
              <Field label="Venue"><input ref={venueInputRef} value={suggestForm.name} onChange={e => setSuggestForm(f => ({ ...f, name: e.target.value }))} placeholder="Start typing to search" autoComplete="off" /></Field>
              <Field label="Address or town"><input value={suggestForm.address} onChange={e => setSuggestForm(f => ({ ...f, address: e.target.value }))} placeholder="Optional" /></Field>
              <Field label="Why this one">
                <select value={suggestForm.reason} onChange={e => setSuggestForm(f => ({ ...f, reason: e.target.value }))}>
                  <option value="">Choose…</option>
                  {SUGGESTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="Notes"><textarea rows={3} value={suggestForm.notes} onChange={e => setSuggestForm(f => ({ ...f, notes: e.target.value }))} /></Field>
              <h3 style={{ ...upperLabel, fontSize: 11.5, letterSpacing: '.05em', margin: '8px 0 0' }}>Contact at this venue <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></h3>
              <Field label="Name"><input value={suggestForm.contactName} onChange={e => setSuggestForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Who should we ask for?" /></Field>
              <Field label="Role"><input value={suggestForm.contactRole} onChange={e => setSuggestForm(f => ({ ...f, contactRole: e.target.value }))} placeholder="Bar manager, buyer, owner…" /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <Field label="Phone"><input type="tel" value={suggestForm.contactPhone} onChange={e => setSuggestForm(f => ({ ...f, contactPhone: e.target.value }))} /></Field>
                <Field label="Email"><input type="email" value={suggestForm.contactEmail} onChange={e => setSuggestForm(f => ({ ...f, contactEmail: e.target.value }))} /></Field>
              </div>
              {suggestErr && <div style={{ color: C.dn, fontSize: 13 }}>{suggestErr}</div>}
              <Btn primary disabled={submitting} onClick={handleSuggest} style={{ alignSelf: 'flex-start' }}>{submitting ? 'Sending…' : 'Send'}</Btn>
            </>
          )}
        </Drawer>
      )}

      {drawer === 'report' && (
        <Drawer title="Report" sub="One page. Same numbers as the screen." onClose={closeDrawer}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Seg ariaLabel="Report kind" value={reportKind} onChange={v => setReportKind(v as 'month' | 'quarter')} options={[{ value: 'month', label: 'Monthly' }, { value: 'quarter', label: 'Quarterly' }]} />
            {reportKind === 'month' ? (
              <span role="group" aria-label="Report month" style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', background: C.surface }}>
                <button type="button" aria-label="Previous month" onClick={() => setReportMonth(m => addMonths(m, -1))} style={{ padding: '7px 12px', color: C.ink2, borderRight: `1px solid ${C.line}` }}>‹</button>
                <span style={{ ...mono, fontSize: 12.5, minWidth: 88, textAlign: 'center', padding: '7px 10px' }}>{reportMonth ? fmtMonthShort(reportMonth) : ''}</span>
                <button type="button" aria-label="Next month" disabled={!reportMonth || reportMonth >= todayMonth} onClick={() => setReportMonth(m => addMonths(m, 1))} style={{ padding: '7px 12px', color: reportMonth && reportMonth < todayMonth ? C.ink2 : C.faint, borderLeft: `1px solid ${C.line}` }}>›</button>
              </span>
            ) : (
              <span role="group" aria-label="Report quarter" style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', background: C.surface }}>
                <button type="button" aria-label="Previous quarter" onClick={() => setReportQuarter(q => q ? quarterOf(addMonths(quarterFirstMonth(q.year, q.q), -3)) : q)} style={{ padding: '7px 12px', color: C.ink2, borderRight: `1px solid ${C.line}` }}>‹</button>
                <span style={{ ...mono, fontSize: 12.5, minWidth: 88, textAlign: 'center', padding: '7px 10px' }}>{reportQuarter ? `Q${reportQuarter.q} ${reportQuarter.year}` : ''}</span>
                <button type="button" aria-label="Next quarter" disabled={!reportQNext} onClick={() => setReportQuarter(q => q ? quarterOf(addMonths(quarterFirstMonth(q.year, q.q), 3)) : q)} style={{ padding: '7px 12px', color: reportQNext ? C.ink2 : C.faint, borderLeft: `1px solid ${C.line}` }}>›</button>
              </span>
            )}
            <Btn primary disabled={pdfBusy} onClick={handleDownloadPDF} style={{ marginLeft: 'auto' }}>{pdfBusy ? <><Loader2 size={14} /> Building…</> : 'Download PDF'}</Btn>
          </div>
          {pdfError && <div style={{ color: C.dn, fontSize: 13 }}>{pdfError}</div>}
          {reportKind === 'month' && monthlyData && <MonthlyPreview data={monthlyData} clientName={client?.name || slug} preparedOn={preparedOn} />}
          {reportKind === 'quarter' && quarterlyData && <QuarterlyPreview data={quarterlyData} clientName={client?.name || slug} preparedOn={preparedOn} />}
          {earlier.length > 0 && (
            <div>
              <h3 style={{ ...upperLabel, fontSize: 11.5, letterSpacing: '.05em', margin: '14px 0 4px' }}>Earlier</h3>
              {earlier.map(r => (
                <div key={r.url} className="pt-file"><div>{r.name}{r.date && <small style={{ display: 'block', color: C.mute, fontSize: 12, marginTop: 2 }}>{r.date}</small>}</div>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${C.line}`, background: C.surface, textDecoration: 'none' }}>PDF</a></div>
              ))}
            </div>
          )}
        </Drawer>
      )}

      {showChangePw && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 20 }} role="dialog" aria-label="Change password" onMouseDown={e => { if (e.target === e.currentTarget) setShowChangePw(false) }}>
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 24, width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Change password</h2>
              <button type="button" onClick={() => setShowChangePw(false)} aria-label="Close" style={{ width: 34, height: 34, border: `1px solid ${C.line}`, borderRadius: 8, display: 'grid', placeItems: 'center', color: C.ink2 }}>✕</button>
            </div>
            {pwSuccess ? <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(143,211,180,.12)', color: C.up, fontSize: 13.5 }}>Password updated.</div> : (
              <>
                <Field label="New password"><input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setPwError('') }} /></Field>
                <Field label="Confirm password"><input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setPwError('') }} /></Field>
                {pwError && <div style={{ color: C.dn, fontSize: 13 }}>{pwError}</div>}
                <Btn primary disabled={pwLoading} onClick={async () => {
                  if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return }
                  if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
                  setPwLoading(true)
                  const { error: err } = await getSupabase().auth.updateUser({ password: newPw })
                  setPwLoading(false)
                  if (err) { setPwError(err.message); return }
                  setPwSuccess(true); setTimeout(() => setShowChangePw(false), 1500)
                }}>{pwLoading ? 'Saving…' : 'Update password'}</Btn>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
