'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '../../lib/supabase'
import { getPortalData, submitClientSuggestion, getCampaignAssets, createCampaignAsset, getClientFiles, uploadClientFile } from '../../lib/data'
import { t, card, badge, inputStyle, labelStyle, selectStyle } from '../../lib/theme'
import { formatShortDateMT, startOfMonthMT, formatCurrency } from '../../lib/formatters'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  MapPin, Package, LogOut, ChevronDown, ChevronUp, CheckCircle, Send,
  Building2, User, ExternalLink, Upload, FileDown, Calendar, Star,
  AlertCircle, Folder, Download, Shield, TrendingUp, BarChart2,
  Plus, X, Check,
} from 'lucide-react'
import type { ClientFile, ClientFileType } from '../../lib/types'
import { clientLogoUrl } from '../../lib/constants'

const SUGGESTION_REASONS = [
  { value: 'inbound_request', label: 'They reached out asking for us' },
  { value: 'competitor_gap', label: 'Gap/opportunity I noticed on-premise' },
  { value: 'warm_referral', label: 'Referred by someone in the industry' },
  { value: 'staff_fan', label: 'Staff or bartender expressed interest' },
  { value: 'strategic_fit', label: 'High-volume account, strong fit for the brand' },
  { value: 'other', label: 'Other reason' },
]

const STATUS_ACCENT: Record<string, string> = {
  'Will Order Soon': '#6aaee0',
  'Just Ordered': '#3dbc76',
  'Needs Follow Up': '#e99928',
  'Not Interested': '#e85540',
  'Menu Feature Won': '#3dbc76',
  'New Placement': '#3dbc76',
  'General Check-In': '#7a7060',
}

const PLACEMENT_STATUS_LABELS: Record<string, string> = {
  committed: 'Committed', ordered: 'Ordered', on_shelf: 'On Shelf', reordering: 'Reordering',
}
const PLACEMENT_STATUS_COLORS: Record<string, string> = {
  committed: '#e99928', ordered: '#6aaee0', on_shelf: '#3dbc76', reordering: '#a78bfa',
}
const REG_STATUS_COLORS: Record<string, string> = {
  active: '#3dbc76', pending: '#e99928', expired: '#e85540', not_registered: '#4a4a45',
}
const REG_STATUS_LABELS: Record<string, string> = {
  active: 'Active', pending: 'Pending', expired: 'Expired', not_registered: 'Not Registered',
}

const WIN_STATUSES = ['Just Ordered', 'Menu Feature Won', 'New Placement']
const ACTION_STATUSES = ['Will Order Soon', 'Needs Follow Up']

export default function ClientPortalPage() {
  const { slug } = useParams() as { slug: string }
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [isPreview, setIsPreview] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('90d')
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([])
  const [visitFilter, setVisitFilter] = useState<'all' | 'action' | 'wins' | 'general'>('all')
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)
  const [campaignAssets, setCampaignAssets] = useState<Record<string, any[]>>({})
  const [uploadingAsset, setUploadingAsset] = useState(false)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [orderLineItems, setOrderLineItems] = useState<Record<string, any[]>>({})
  const [clientFiles, setClientFiles] = useState<ClientFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [fileUploadErr, setFileUploadErr] = useState('')
  const [showFileUpload, setShowFileUpload] = useState(false)
  const [fileUploadMode, setFileUploadMode] = useState<'asset' | 'compliance'>('asset')
  const [fileUploadType, setFileUploadType] = useState<ClientFileType>('other')
  const [fileUploadDesc, setFileUploadDesc] = useState('')
  const [fileUploadExpiry, setFileUploadExpiry] = useState('')
  const portalFileInputRef = useRef<HTMLInputElement>(null)
  const [showSuggest, setShowSuggest] = useState(false)
  const [suggestType, setSuggestType] = useState<'account' | 'contact'>('account')
  const [suggestForm, setSuggestForm] = useState({ name: '', address: '', reason: '', reason_detail: '', notes: '', submitted_by_name: '', submitted_by_email: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [suggestErr, setSuggestErr] = useState('')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null
      if (!user) { window.location.replace(`/login?redirect=/portal/${slug}`); return }
      const { data: profile } = await sb.from('user_profiles').select('role, client_slug').eq('id', user.id).single()
      const isStaff = ['owner', 'admin', 'rep', 'intern'].includes(profile?.role)
      const isPortal = profile?.role === 'portal'
      if (!isStaff && !isPortal) { setError(`Access denied`); setLoading(false); return }
      if (isPortal && profile?.client_slug && profile.client_slug !== slug) {
        setError(`Access denied — this portal is for ${profile.client_slug}.`); setLoading(false); return
      }
      if (isStaff) setIsPreview(true)
      try {
        const d = await getPortalData(slug)
        setData(d)
        sb.from('events')
          .select('id, title, event_type, start_time, accounts(name, address)')
          .eq('client_slug', slug)
          .gt('start_time', new Date().toISOString())
          .order('start_time').limit(6)
          .then(({ data: ev }) => setUpcomingEvents(ev || []))
        setFilesLoading(true)
        getClientFiles(slug).then(f => { setClientFiles(f); setFilesLoading(false) }).catch(() => setFilesLoading(false))
      } catch { setError('Failed to load data') }
      finally { setLoading(false) }
    })
  }, [slug])

  async function handleSuggest() {
    if (!suggestForm.name.trim() || !suggestForm.reason) { setSuggestErr('Name and reason are required'); return }
    setSubmitting(true); setSuggestErr('')
    try {
      await submitClientSuggestion({
        client_slug: slug, suggestion_type: suggestType, name: suggestForm.name,
        address: suggestForm.address || undefined, notes: suggestForm.notes || undefined,
        reason: suggestForm.reason, reason_detail: suggestForm.reason_detail || undefined,
        submitted_by_name: suggestForm.submitted_by_name || undefined,
        submitted_by_email: suggestForm.submitted_by_email || undefined,
      })
      setSubmitted(true)
      setSuggestForm({ name: '', address: '', reason: '', reason_detail: '', notes: '', submitted_by_name: '', submitted_by_email: '' })
    } catch (e: any) { setSuggestErr(e.message || 'Failed to submit') }
    finally { setSubmitting(false) }
  }

  function handlePrintReport() {
    if (!data) return
    const { client: cl, visits: vs, placements: pls, orders: ords } = data
    const mStart = startOfMonthMT()
    const mVisits = vs.filter((v: any) => v.visited_at >= mStart).length
    const actPlacements = pls.filter((p: any) => !p.lost_at)
    const nonDraftOrders = ords.filter((o: any) => o.status !== 'draft')
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const clName = (cl?.name || slug).replace(/</g, '&lt;')
    const isDistClient = cl?.order_type === 'distributor'
    const html = `<!DOCTYPE html><html><head><title>${clName} — Field Report</title>
    <style>body{font-family:sans-serif;color:#111;max-width:800px;margin:0 auto;padding:32px}h1{font-size:24px;margin-bottom:4px}h2{font-size:16px;margin-top:32px;border-bottom:2px solid #eee;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #eee}th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#666}.meta{color:#666;font-size:13px;margin-bottom:24px}</style>
    </head><body>
    <h1>${clName}</h1>
    <div class="meta">Field Report — Generated by Barley Bros · ${dateStr}</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
      <div style="background:#f9f9f9;border-radius:8px;padding:16px"><div style="font-size:11px;color:#666;text-transform:uppercase">Visits This Month</div><div style="font-size:28px;font-weight:700">${mVisits}</div></div>
      <div style="background:#f9f9f9;border-radius:8px;padding:16px"><div style="font-size:11px;color:#666;text-transform:uppercase">Active Placements</div><div style="font-size:28px;font-weight:700">${actPlacements.length}</div></div>
      <div style="background:#f9f9f9;border-radius:8px;padding:16px"><div style="font-size:11px;color:#666;text-transform:uppercase">${isDistClient ? 'Distributor Inquiries' : 'Orders'}</div><div style="font-size:28px;font-weight:700">${nonDraftOrders.length}</div></div>
    </div>
    ${vs.length > 0 ? `<h2>Field Activity</h2><table><thead><tr><th>Account</th><th>Outcome</th><th>Date</th><th>Notes</th></tr></thead><tbody>${vs.slice(0,20).map((v: any) => `<tr><td>${v.accounts?.name||''}</td><td>${v.status}</td><td>${formatShortDateMT(v.visited_at)}</td><td>${v.notes||''}</td></tr>`).join('')}</tbody></table>` : ''}
    ${actPlacements.length > 0 ? `<h2>Active Placements (${actPlacements.length})</h2><table><thead><tr><th>Account</th><th>Product</th><th>Status</th></tr></thead><tbody>${actPlacements.map((p: any) => `<tr><td>${p.accounts?.name||''}</td><td>${p.product_name}</td><td>${p.status}</td></tr>`).join('')}</tbody></table>` : ''}
    </body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '12px', background: `linear-gradient(135deg, ${t.gold} 0%, #b8891e 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '800', color: '#0f0f0d', margin: '0 auto 12px' }}>D</div>
        <div style={{ color: t.text.muted, fontSize: '13px' }}>Loading your brand report...</div>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '14px', color: t.status.danger, marginBottom: '8px' }}>{error}</div>
        <button onClick={() => { getSupabase().auth.signOut(); window.location.href = '/login' }} style={{ fontSize: '12px', color: t.text.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Sign in again</button>
      </div>
    </div>
  )

  const { client, visits, placements, orders, events, campaigns, registrations, visitTrend } = data
  const accent = client?.color || t.gold
  const logoUrl = client ? clientLogoUrl(client) : null
  const isDistributorClient = client?.order_type === 'distributor'
  const monthStart = startOfMonthMT()
  const monthVisits = visits.filter((v: any) => v.visited_at >= monthStart).length
  const activePlacements = placements.filter((p: any) => !p.lost_at)
  const nonDraftOrders = orders.filter((o: any) => o.status !== 'draft')
  const actionVisits = visits.filter((v: any) => ACTION_STATUSES.includes(v.status))
  const winVisits = visits.filter((v: any) => WIN_STATUSES.includes(v.status))
  const generalVisits = visits.filter((v: any) => !ACTION_STATUSES.includes(v.status) && !WIN_STATUSES.includes(v.status))
  const filteredVisits = visitFilter === 'action' ? actionVisits : visitFilter === 'wins' ? winVisits : visitFilter === 'general' ? generalVisits : visits
  const warmAccountCount = new Set(actionVisits.map((v: any) => v.account_id).filter(Boolean)).size
  const warmAccounts = Object.values(
    actionVisits.reduce((acc: any, v: any) => {
      if (!v.account_id || acc[v.account_id]) return acc
      acc[v.account_id] = v; return acc
    }, {})
  ) as any[]

  // Date range filtering
  const drDays = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : null
  const drStart = drDays ? new Date(Date.now() - drDays * 86400000).toISOString().slice(0, 10) : null
  const drVisits = drStart ? visits.filter((v: any) => String(v.visited_at).slice(0, 10) >= drStart) : visits
  const drOrders = drStart ? orders.filter((o: any) => String(o.created_at || '').slice(0, 10) >= drStart) : orders
  const drNonDraftOrders = drOrders.filter((o: any) => o.status !== 'draft')
  const drActionVisits = drVisits.filter((v: any) => ACTION_STATUSES.includes(v.status))
  const drWinVisits = drVisits.filter((v: any) => WIN_STATUSES.includes(v.status))
  const drInProgressCount = new Set(drActionVisits.map((v: any) => v.account_id).filter(Boolean)).size
  const drInProgress = Object.values(
    drActionVisits.reduce((acc: any, v: any) => {
      if (!v.account_id || acc[v.account_id]) return acc
      acc[v.account_id] = v; return acc
    }, {})
  ) as any[]
  const outcomeData = Object.entries(
    drVisits.reduce((acc: any, v: any) => { acc[v.status] = (acc[v.status] || 0) + 1; return acc }, {} as Record<string, number>)
  ).sort(([, a], [, b]) => (b as number) - (a as number))
    .map(([status, count]) => ({ status, count: count as number, fill: STATUS_ACCENT[status] || '#4a4a45' }))
  // Dynamic visit trend based on dateRange
  const dynamicVisitTrend = (() => {
    const now = new Date()
    if (dateRange === '7d') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now); d.setDate(d.getDate() - (6 - i))
        const dateStr = d.toISOString().slice(0, 10)
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const count = visits.filter((v: any) => String(v.visited_at).slice(0, 10) === dateStr).length
        return { week: label, visits: count, weekEnd: label }
      })
    } else if (dateRange === '30d') {
      return Array.from({ length: 4 }, (_, i) => {
        const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() - (3 - i) * 7)
        const weekStart = new Date(weekEnd); weekStart.setDate(weekStart.getDate() - 6)
        const startStr = weekStart.toISOString().slice(0, 10)
        const endStr = weekEnd.toISOString().slice(0, 10)
        const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const endLabel = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const count = visits.filter((v: any) => { const d = String(v.visited_at).slice(0, 10); return d >= startStr && d <= endStr }).length
        return { week: label, visits: count, weekEnd: endLabel }
      })
    } else if (dateRange === '90d') {
      return Array.from({ length: 12 }, (_, i) => {
        const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() - (11 - i) * 7)
        const weekStart = new Date(weekEnd); weekStart.setDate(weekStart.getDate() - 6)
        const startStr = weekStart.toISOString().slice(0, 10)
        const endStr = weekEnd.toISOString().slice(0, 10)
        const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const endLabel = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const count = visits.filter((v: any) => { const d = String(v.visited_at).slice(0, 10); return d >= startStr && d <= endStr }).length
        return { week: label, visits: count, weekEnd: endLabel }
      })
    } else {
      return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now); d.setMonth(d.getMonth() - (11 - i))
        const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        const count = visits.filter((v: any) => String(v.visited_at).slice(0, 7) === prefix).length
        return { week: label, visits: count, weekEnd: label }
      })
    }
  })()

  const placementBreakdown = ['committed', 'ordered', 'on_shelf', 'reordering'].map(status => ({
    status, label: PLACEMENT_STATUS_LABELS[status], color: PLACEMENT_STATUS_COLORS[status],
    count: activePlacements.filter((p: any) => p.status === status).length,
  })).filter(g => g.count > 0)
  const expiringRegs = registrations.filter((r: any) => {
    if (!r.expiry_date || r.status === 'expired') return false
    return (new Date(r.expiry_date).getTime() - Date.now()) < 60 * 86400000
  })
  const expiredRegs = registrations.filter((r: any) => r.status === 'expired')

  const TABS = [
    { key: 'overview', label: 'Overview', icon: <BarChart2 size={13} /> },
    { key: 'activity', label: 'Field Activity', icon: <MapPin size={13} />, count: visits.length },
    { key: 'placements', label: 'Placements', icon: <Package size={13} />, count: activePlacements.length },
    { key: 'orders', label: isDistributorClient ? 'Inquiries' : 'Orders', icon: <Send size={13} />, count: nonDraftOrders.length },
    { key: 'campaigns', label: 'Campaigns', icon: <TrendingUp size={13} />, count: campaigns?.length || undefined },
    { key: 'compliance', label: 'Compliance', icon: <Shield size={13} />, count: (expiringRegs.length + expiredRegs.length) || undefined, countDanger: expiringRegs.length > 0 || expiredRegs.length > 0 },
    { key: 'files', label: 'Files', icon: <Folder size={13} />, count: clientFiles.length || undefined },
  ]

  const pad = isMobile ? '16px' : '28px 40px'

  return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, color: t.text.primary, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Preview banner */}
      {isPreview && (
        <div style={{ backgroundColor: '#7c3aed', color: '#fff', fontSize: '12px', fontWeight: '600', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span>Previewing client portal — this is exactly what {client?.name || slug} sees.</span>
          <a href={`/clients/${slug}`} style={{ color: '#fff', fontSize: '11px', opacity: 0.85, textDecoration: 'underline', whiteSpace: 'nowrap' }}>← Back to CRM</a>
        </div>
      )}

      {/* Sticky header */}
      <header style={{ backgroundColor: t.bg.sidebar, borderBottom: `1px solid ${accent}33`, padding: `0 ${isMobile ? '16px' : '32px'}`, height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {logoUrl ? (
            <img src={logoUrl} alt={client?.name} style={{ height: '32px', width: 'auto', maxWidth: '100px', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: '7px', background: `linear-gradient(135deg, ${accent} 0%, ${accent}99 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: '#0f0f0d', flexShrink: 0 }}>
              {client?.name?.[0] || 'P'}
            </div>
          )}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: t.text.primary, lineHeight: 1.2 }}>{client?.name}</div>
            <div style={{ fontSize: '10px', color: t.text.muted, lineHeight: 1.2 }}>Barley Bros — Brand Report</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handlePrintReport} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '6px', padding: '6px 10px', color: t.text.muted, cursor: 'pointer', fontSize: '12px' }}>
            <FileDown size={12} /> {!isMobile && 'Download PDF'}
          </button>
          <button onClick={() => getSupabase().auth.signOut().then(() => { window.location.href = '/login' })} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '6px', padding: '6px 10px', color: t.text.muted, cursor: 'pointer', fontSize: '12px' }}>
            <LogOut size={12} /> {!isMobile && 'Sign out'}
          </button>
        </div>
      </header>


      {/* Tab navigation */}
      <div style={{ backgroundColor: t.bg.elevated, borderBottom: `1px solid ${t.border.default}`, position: 'sticky', top: '60px', zIndex: 15, overflowX: 'auto' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', padding: `0 ${isMobile ? '12px' : '32px'}`, gap: '2px', whiteSpace: 'nowrap' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); if (tab.key === 'activity') setVisitFilter('all') }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '12px 14px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: activeTab === tab.key ? '700' : '500',
                color: activeTab === tab.key ? accent : t.text.secondary,
                borderBottom: `2px solid ${activeTab === tab.key ? accent : 'transparent'}`,
                transition: 'color 150ms',
                position: 'relative',
              }}
            >
              {tab.icon}
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span style={{
                  fontSize: '10px', fontWeight: '700', lineHeight: 1,
                  backgroundColor: tab.countDanger ? `${t.status.danger}22` : `${accent}22`,
                  color: tab.countDanger ? t.status.danger : accent,
                  padding: '2px 5px', borderRadius: '8px',
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: pad }}>

        {/* ══ OVERVIEW TAB ══ */}
        {activeTab === 'overview' && (
          <div>
            {/* Date range + KPI row */}
            <div style={{ marginBottom: '20px' }}>
              {/* Date range selector */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Overview</div>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: t.bg.elevated, borderRadius: '8px', padding: '3px' }}>
                  {([['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['all', 'All time']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setDateRange(key)} style={{
                      padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: dateRange === key ? '700' : '500',
                      border: 'none', cursor: 'pointer',
                      backgroundColor: dateRange === key ? accent : 'transparent',
                      color: dateRange === key ? '#0c0c0a' : t.text.muted,
                      transition: 'all 150ms',
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              {/* KPI grid */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px' }}>
                <button onClick={() => setActiveTab('activity')} style={{ ...card, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', border: `1px solid ${accent}44` }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Visits</div>
                  <div style={{ fontSize: '26px', fontWeight: '800', color: accent, letterSpacing: '-0.03em', lineHeight: 1 }}>{drVisits.length}</div>
                  <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '4px' }}>{dateRange === 'all' ? 'all time' : dateRange === '7d' ? 'last 7 days' : dateRange === '30d' ? 'last 30 days' : 'last 90 days'}</div>
                  <div style={{ height: '2px', borderRadius: '1px', backgroundColor: accent, marginTop: '10px', opacity: 0.6 }} />
                </button>
                <button onClick={() => setActiveTab('placements')} style={{ ...card, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', border: `1px solid ${t.status.success}44` }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Placements</div>
                  <div style={{ fontSize: '26px', fontWeight: '800', color: t.status.success, letterSpacing: '-0.03em', lineHeight: 1 }}>{activePlacements.length}</div>
                  <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '4px' }}>active on shelf / menu</div>
                  <div style={{ height: '2px', borderRadius: '1px', backgroundColor: t.status.success, marginTop: '10px', opacity: 0.6 }} />
                </button>
                <button onClick={() => setActiveTab('orders')} style={{ ...card, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', border: `1px solid ${t.status.info}44` }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{isDistributorClient ? 'Inquiries' : 'Orders'}</div>
                  <div style={{ fontSize: '26px', fontWeight: '800', color: t.status.info, letterSpacing: '-0.03em', lineHeight: 1 }}>{drNonDraftOrders.length}</div>
                  <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '4px' }}>{isDistributorClient ? 'sent to distributor' : 'purchase orders'}</div>
                  <div style={{ height: '2px', borderRadius: '1px', backgroundColor: t.status.info, marginTop: '10px', opacity: 0.6 }} />
                </button>
                <button onClick={() => { setActiveTab('activity'); setVisitFilter('action') }} style={{ ...card, padding: '14px 16px', cursor: 'pointer', border: `1px solid ${'#6aaee0' + '66'}`, backgroundColor: `${'#6aaee0'}0d`, textAlign: 'left' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>In Progress</div>
                  <div style={{ fontSize: '26px', fontWeight: '800', color: '#6aaee0', letterSpacing: '-0.03em', lineHeight: 1 }}>{drInProgressCount}</div>
                  <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '4px' }}>accounts being followed up</div>
                  <div style={{ height: '2px', borderRadius: '1px', backgroundColor: '#6aaee0', marginTop: '10px', opacity: 0.6 }} />
                </button>
              </div>
            </div>

            {/* Charts row */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: '16px', marginBottom: '20px' }}>
              {/* Visit trend chart */}
              {dynamicVisitTrend.some((w: any) => w.visits > 0) && (
                <div style={{ ...card, padding: isMobile ? '14px' : '18px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: t.text.primary }}>
                        Visit Trend — {dateRange === '7d' ? 'Last 7 Days' : dateRange === '30d' ? 'Last 4 Weeks' : dateRange === '90d' ? 'Last 12 Weeks' : 'Last 12 Months'}
                      </div>
                      <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>Accounts visited {dateRange === '7d' || dateRange === '30d' ? 'by day' : dateRange === '90d' ? 'per week' : 'per month'} by our team</div>
                    </div>
                    <button onClick={() => setActiveTab('activity')} style={{ fontSize: '11px', color: accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', flexShrink: 0 }}>See all →</button>
                  </div>
                  <ResponsiveContainer width="100%" height={isMobile ? 100 : 130}>
                    <BarChart data={dynamicVisitTrend} barCategoryGap="40%">
                      <CartesianGrid strokeDasharray="3 3" stroke={t.border.subtle} vertical={false} />
                      <XAxis dataKey="week" tick={{ fill: t.text.muted, fontSize: isMobile ? 8 : 9 }} axisLine={false} tickLine={false} interval={isMobile ? 3 : 1} />
                      <YAxis tick={{ fill: t.text.muted, fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} width={18} />
                      <Tooltip contentStyle={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: t.text.muted }} itemStyle={{ color: accent }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: any) => [v, 'visits']} labelFormatter={(lbl: any, pl: any) => { const wE = pl?.[0]?.payload?.weekEnd; return wE ? `${lbl} – ${wE}` : lbl }} />
                      <Bar dataKey="visits" fill={accent} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* Visit outcome breakdown */}
              {outcomeData.length > 0 && (
                <div style={{ ...card, padding: isMobile ? '14px' : '18px 22px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: t.text.primary, marginBottom: '4px' }}>Visit Outcomes</div>
                  <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '14px' }}>
                    {dateRange === 'all' ? 'All time' : dateRange === '7d' ? 'Last 7 days' : dateRange === '30d' ? 'Last 30 days' : 'Last 90 days'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {outcomeData.slice(0, 6).map(({ status, count, fill }) => {
                      const pct = drVisits.length > 0 ? Math.round((count / drVisits.length) * 100) : 0
                      return (
                        <div key={status}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', color: t.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{status}</span>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: fill, flexShrink: 0, marginLeft: '6px' }}>{count}</span>
                          </div>
                          <div style={{ height: '5px', borderRadius: '3px', backgroundColor: t.border.subtle, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, backgroundColor: fill, borderRadius: '3px', transition: 'width 400ms ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 2-col: recent wins + in progress */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              {/* Recent wins */}
              <div style={{ ...card, padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: t.text.primary }}>Recent Wins</div>
                  {drWinVisits.length > 5 && <button onClick={() => { setActiveTab('activity'); setVisitFilter('wins') }} style={{ fontSize: '11px', color: t.status.success, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>See all →</button>}
                </div>
                {drWinVisits.length === 0 ? (
                  <div style={{ fontSize: '12px', color: t.text.muted, padding: '12px 0' }}>No wins in this period.</div>
                ) : drWinVisits.slice(0, 5).map((v: any) => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${t.border.subtle}` }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: t.status.success, flexShrink: 0, marginTop: '5px', boxShadow: `0 0 4px ${t.status.success}88` }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.accounts?.name || 'Unknown'}</div>
                      <div style={{ fontSize: '11px', color: t.status.success, marginTop: '1px' }}>{v.status}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: t.text.muted, flexShrink: 0 }}>{formatShortDateMT(v.visited_at)}</div>
                  </div>
                ))}
              </div>

              {/* In Progress */}
              <div style={{ ...card, padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: t.text.primary }}>In Progress</div>
                    <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>Accounts our team is actively following up with</div>
                  </div>
                  {drInProgress.length > 5 && <button onClick={() => { setActiveTab('activity'); setVisitFilter('action') }} style={{ fontSize: '11px', color: '#6aaee0', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>See all →</button>}
                </div>
                {drInProgress.length === 0 ? (
                  <div style={{ fontSize: '12px', color: t.text.muted, padding: '12px 0' }}>No active follow-ups in this period.</div>
                ) : drInProgress.slice(0, 5).map((v: any) => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${t.border.subtle}` }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: STATUS_ACCENT[v.status] || '#6aaee0', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.accounts?.name || 'Unknown'}</div>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: STATUS_ACCENT[v.status] || '#6aaee0', backgroundColor: `${STATUS_ACCENT[v.status] || '#6aaee0'}18`, padding: '2px 6px', borderRadius: '6px', flexShrink: 0 }}>{v.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming events */}
            {upcomingEvents.length > 0 && (
              <div style={{ ...card, padding: '18px 20px', marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: t.text.primary, marginBottom: '12px' }}>Upcoming Events & Tastings</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {upcomingEvents.slice(0, 3).map((e: any) => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', backgroundColor: `${t.status.success}0d`, border: `1px solid ${t.status.success}22`, borderRadius: '8px' }}>
                      <Calendar size={14} color={t.status.success} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{e.title}</div>
                        {e.accounts?.name && <div style={{ fontSize: '11px', color: t.text.muted }}>{e.accounts.name}</div>}
                      </div>
                      <div style={{ fontSize: '11px', color: t.status.success, fontWeight: '600', flexShrink: 0 }}>
                        {new Date(e.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Placements breakdown summary */}
            {activePlacements.length > 0 && (
              <div style={{ ...card, padding: '18px 20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: t.text.primary }}>{activePlacements.length} Active Placements</div>
                  <button onClick={() => setActiveTab('placements')} style={{ fontSize: '11px', color: t.status.success, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>View all →</button>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {placementBreakdown.map(g => (
                    <div key={g.status} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: `${g.color}14`, border: `1px solid ${g.color}33`, borderRadius: '8px', padding: '8px 14px' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: g.color, boxShadow: `0 0 5px ${g.color}88` }} />
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: '800', color: g.color, lineHeight: 1 }}>{g.count}</div>
                        <div style={{ fontSize: '10px', color: t.text.muted }}>{g.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Stacked bar */}
                {activePlacements.length > 0 && (
                  <div style={{ marginTop: '12px', height: '6px', backgroundColor: t.border.subtle, borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                    {placementBreakdown.map(g => (
                      <div key={g.status} style={{ width: `${(g.count / activePlacements.length) * 100}%`, backgroundColor: g.color, transition: 'width 400ms ease' }} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Compliance alerts in overview */}
            {(expiringRegs.length > 0 || expiredRegs.length > 0) && (
              <div style={{ ...card, padding: '16px 20px', marginBottom: '20px', border: `1px solid ${t.status.danger}33`, backgroundColor: `${t.status.danger}07` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={16} color={t.status.danger} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: t.status.danger }}>
                        {expiredRegs.length > 0 ? `${expiredRegs.length} expired registration${expiredRegs.length > 1 ? 's' : ''}` : ''}{expiredRegs.length > 0 && expiringRegs.length > 0 ? ' · ' : ''}{expiringRegs.length > 0 ? `${expiringRegs.length} expiring within 60 days` : ''}
                      </div>
                      <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>Action required — see Compliance tab</div>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab('compliance')} style={{ fontSize: '11px', color: t.status.danger, background: 'none', border: `1px solid ${t.status.danger}44`, borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontWeight: '600' }}>View →</button>
                </div>
              </div>
            )}

            {/* Suggest section */}
            <div style={{ ...card, padding: isMobile ? '16px' : '22px 28px' }}>
              <button onClick={() => setShowSuggest(!showSuggest)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0 }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: t.text.primary }}>Suggest an Account or Contact</div>
                  <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '3px' }}>Know a bar, restaurant, or rep we should be talking to?</div>
                </div>
                {showSuggest ? <ChevronUp size={16} color={t.text.muted} /> : <ChevronDown size={16} color={t.text.muted} />}
              </button>
              {showSuggest && (
                <div style={{ marginTop: '20px' }}>
                  {submitted ? (
                    <div style={{ padding: '16px', backgroundColor: `${t.status.success}14`, border: `1px solid ${t.status.success}44`, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <CheckCircle size={18} color={t.status.success} />
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: t.status.success }}>Submitted — thank you!</div>
                        <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>Our team will review and follow up.</div>
                      </div>
                      <button onClick={() => setSubmitted(false)} style={{ marginLeft: 'auto', fontSize: '12px', color: accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>Add another</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {(['account', 'contact'] as const).map(type => (
                          <button key={type} onClick={() => setSuggestType(type)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', backgroundColor: suggestType === type ? accent + '22' : 'transparent', color: suggestType === type ? accent : t.text.secondary, border: `1px solid ${suggestType === type ? accent + '66' : t.border.default}` }}>
                            {type === 'account' ? <Building2 size={14} /> : <User size={14} />}
                            {type === 'account' ? 'An Account' : 'A Contact'}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                        <div>
                          <label style={labelStyle}>{suggestType === 'account' ? 'Account name *' : 'Contact name *'}</label>
                          <input value={suggestForm.name} onChange={e => setSuggestForm(f => ({ ...f, name: e.target.value }))} placeholder={suggestType === 'account' ? 'e.g. The Blind Pig' : 'e.g. Jamie — Bar Manager'} style={inputStyle} />
                        </div>
                        {suggestType === 'account' && (
                          <div>
                            <label style={labelStyle}>Address (optional)</label>
                            <input value={suggestForm.address} onChange={e => setSuggestForm(f => ({ ...f, address: e.target.value }))} placeholder="City or full address" style={inputStyle} />
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={labelStyle}>Reason *</label>
                        <select value={suggestForm.reason} onChange={e => setSuggestForm(f => ({ ...f, reason: e.target.value }))} style={selectStyle}>
                          <option value="">Select a reason</option>
                          {SUGGESTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Notes (optional)</label>
                        <input value={suggestForm.notes} onChange={e => setSuggestForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any context that would help our team..." style={inputStyle} />
                      </div>
                      {suggestErr && <div style={{ fontSize: '12px', color: t.status.danger }}>{suggestErr}</div>}
                      <button onClick={handleSuggest} disabled={submitting || !suggestForm.name.trim() || !suggestForm.reason} style={{ padding: '11px 20px', backgroundColor: accent, color: '#0c0c0a', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: submitting || !suggestForm.name.trim() || !suggestForm.reason ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <Send size={14} /> {submitting ? 'Sending...' : 'Submit to Barley Bros'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ ACTIVITY TAB ══ */}
        {activeTab === 'activity' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {([
                  { key: 'all', label: `All (${drVisits.length})` },
                  { key: 'wins', label: `Wins (${drWinVisits.length})`, color: t.status.success },
                  { key: 'action', label: `In Progress (${drActionVisits.length})`, color: '#6aaee0' },
                  { key: 'general', label: `General (${drVisits.filter((v: any) => !ACTION_STATUSES.includes(v.status) && !WIN_STATUSES.includes(v.status)).length})` },
                ] as { key: string; label: string; color?: string }[]).map(f => (
                  <button key={f.key} onClick={() => setVisitFilter(f.key as any)} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', fontWeight: visitFilter === f.key ? '700' : '500', border: `1px solid ${visitFilter === f.key ? (f.color || accent) : t.border.default}`, backgroundColor: visitFilter === f.key ? `${(f.color || accent)}22` : 'transparent', color: visitFilter === f.key ? (f.color || accent) : t.text.muted }}>
                    {f.label}
                  </button>
                ))}
              </div>
              {/* Date range mini selector in activity tab */}
              <div style={{ display: 'flex', gap: '3px', backgroundColor: t.bg.elevated, borderRadius: '7px', padding: '2px' }}>
                {(['7d', '30d', '90d', 'all'] as const).map(k => (
                  <button key={k} onClick={() => setDateRange(k)} style={{ padding: '4px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: dateRange === k ? '700' : '500', border: 'none', cursor: 'pointer', backgroundColor: dateRange === k ? accent : 'transparent', color: dateRange === k ? '#0c0c0a' : t.text.muted }}>
                    {k === 'all' ? 'All' : k}
                  </button>
                ))}
              </div>
            </div>
            {(visitFilter === 'all' ? drVisits : visitFilter === 'wins' ? drWinVisits : visitFilter === 'action' ? drActionVisits : drVisits.filter((v: any) => !ACTION_STATUSES.includes(v.status) && !WIN_STATUSES.includes(v.status))).length === 0 ? (
              <div style={{ fontSize: '13px', color: t.text.muted, padding: '40px 0', textAlign: 'center' }}>No visits in this category.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(visitFilter === 'all' ? drVisits : visitFilter === 'wins' ? drWinVisits : visitFilter === 'action' ? drActionVisits : drVisits.filter((v: any) => !ACTION_STATUSES.includes(v.status) && !WIN_STATUSES.includes(v.status))).map((v: any) => {
                  const ac = STATUS_ACCENT[v.status] || t.text.muted
                  return (
                    <div key={v.id} style={{ ...card, padding: '12px 14px 12px 16px', boxShadow: `inset 3px 0 0 ${ac}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: v.notes ? '8px' : '0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                          <span style={badge.visitStatus(v.status)}>{v.status}</span>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary }}>{v.accounts?.name || 'Unknown account'}</span>
                          {v.accounts?.address && !isMobile && <span style={{ fontSize: '11px', color: t.text.muted }}>{v.accounts.address}</span>}
                        </div>
                        <span style={{ fontSize: '11px', color: t.text.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatShortDateMT(v.visited_at)}</span>
                      </div>
                      {v.notes && <div style={{ fontSize: '12px', color: t.text.secondary, lineHeight: 1.6, borderLeft: `2px solid ${t.border.default}`, paddingLeft: '10px' }}>{v.notes}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ PLACEMENTS TAB ══ */}
        {activeTab === 'placements' && (
          <div>
            {activePlacements.length === 0 ? (
              <div style={{ fontSize: '13px', color: t.text.muted, padding: '60px 0', textAlign: 'center' }}>No active placements tracked yet.</div>
            ) : (
              <>
                {/* Status breakdown */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {placementBreakdown.map(g => (
                    <div key={g.status} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: `${g.color}14`, border: `1px solid ${g.color}33`, borderRadius: '8px', padding: '10px 16px' }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: g.color, boxShadow: `0 0 5px ${g.color}88` }} />
                      <div>
                        <div style={{ fontSize: '22px', fontWeight: '800', color: g.color, lineHeight: 1 }}>{g.count}</div>
                        <div style={{ fontSize: '10px', color: t.text.muted }}>{g.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Progress bar */}
                <div style={{ height: '6px', backgroundColor: t.border.subtle, borderRadius: '3px', overflow: 'hidden', display: 'flex', marginBottom: '20px' }}>
                  {placementBreakdown.map(g => <div key={g.status} style={{ width: `${(g.count / activePlacements.length) * 100}%`, backgroundColor: g.color }} />)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px' }}>
                  {activePlacements.map((p: any) => {
                    const sc = PLACEMENT_STATUS_COLORS[p.status] || t.text.muted
                    return (
                      <div key={p.id} style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: sc, flexShrink: 0, boxShadow: `0 0 4px ${sc}88` }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.accounts?.name}</div>
                          <div style={{ fontSize: '11px', color: t.text.muted }}>{p.product_name}{p.placement_type ? ` · ${p.placement_type.replace('_', ' ')}` : ''}{p.price_point ? ` · $${p.price_point}` : ''}</div>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: sc, backgroundColor: `${sc}18`, padding: '2px 7px', borderRadius: '6px', flexShrink: 0 }}>{PLACEMENT_STATUS_LABELS[p.status]}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ ORDERS TAB ══ */}
        {activeTab === 'orders' && (
          <div>
            {/* Distributor explanation */}
            {isDistributorClient && (
              <div style={{ ...card, padding: '16px 20px', marginBottom: '20px', border: `1px solid ${t.border.gold}`, backgroundColor: t.goldDim }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: t.gold, marginBottom: '6px' }}>About Distributor Inquiries</div>
                <div style={{ fontSize: '12px', color: t.text.secondary, lineHeight: 1.6 }}>
                  When our team generates demand for your brand at an account, we submit a formal inquiry to your distributor rep to fulfill it. Each entry below represents market demand we've created for your brand and documented with your distribution partner.
                </div>
              </div>
            )}
            {nonDraftOrders.length === 0 ? (
              <div style={{ fontSize: '13px', color: t.text.muted, padding: '60px 0', textAlign: 'center' }}>No {isDistributorClient ? 'inquiries' : 'orders'} on record yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {nonDraftOrders.map((o: any) => {
                  const isExpanded = expandedOrder === o.id
                  const lineItems = orderLineItems[o.id]
                  const STATUS_COLORS: Record<string, string> = { sent: t.status.info, fulfilled: t.status.success, cancelled: t.status.danger }
                  const statusColor = STATUS_COLORS[o.status] || t.text.muted
                  return (
                    <div key={o.id} style={{ ...card, overflow: 'hidden' }}>
                      <button onClick={async () => {
                        if (isExpanded) { setExpandedOrder(null) } else {
                          setExpandedOrder(o.id)
                          if (orderLineItems[o.id] === undefined) {
                            const { data: li } = await getSupabase().from('po_line_items').select('product_name, quantity, price, total').eq('po_id', o.id).order('id')
                            setOrderLineItems(prev => ({ ...prev, [o.id]: li || [] }))
                          }
                        }
                      }} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.deliver_to_name}</span>
                            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', backgroundColor: statusColor + '22', color: statusColor, fontWeight: '700', textTransform: 'uppercase', flexShrink: 0 }}>{o.status}</span>
                            {isDistributorClient && o.distributor_status && o.distributor_status !== 'not_contacted' && (() => {
                              const DS_COLOR: Record<string, string> = { contacted: t.status.info, confirmed: t.status.success, ordered: t.status.success }
                              const DS_LABEL: Record<string, string> = { contacted: 'Inquiry Sent', confirmed: 'Confirmed', ordered: 'Ordered' }
                              const dc = DS_COLOR[o.distributor_status] || t.text.muted
                              return (
                                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', backgroundColor: dc + '22', color: dc, fontWeight: '700', flexShrink: 0, border: `1px solid ${dc}44` }}>
                                  {DS_LABEL[o.distributor_status] || o.distributor_status}
                                </span>
                              )
                            })()}
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', backgroundColor: t.bg.elevated, color: t.text.muted, fontWeight: '600', border: `1px solid ${t.border.subtle}`, flexShrink: 0 }}>
                              {isDistributorClient ? 'Distributor Inquiry' : 'Purchase Order'}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: t.text.muted }}>{o.po_number} · {formatShortDateMT(o.created_at)}{o.distributor_rep_name ? ` · Rep: ${o.distributor_rep_name}` : ''}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                          {o.total_amount > 0 && <span style={{ fontSize: '14px', fontWeight: '700', color: accent }}>{formatCurrency(o.total_amount)}</span>}
                          <span style={{ color: t.text.muted, fontSize: '12px' }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div style={{ borderTop: `1px solid ${t.border.subtle}`, padding: '14px 16px' }}>
                          {lineItems === undefined ? (
                            <div style={{ fontSize: '12px', color: t.text.muted, fontStyle: 'italic' }}>Loading details...</div>
                          ) : lineItems.length === 0 ? (
                            <div style={{ fontSize: '12px', color: t.text.muted }}>No line items on file.</div>
                          ) : (
                            <div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 16px', paddingBottom: '8px', marginBottom: '4px', borderBottom: `1px solid ${t.border.subtle}` }}>
                                {['Product', 'Qty', 'Total'].map(h => (
                                  <div key={h} style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: h === 'Product' ? 'left' : 'right' }}>{h}</div>
                                ))}
                              </div>
                              {lineItems.map((li: any, i: number) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 16px', padding: '5px 0' }}>
                                  <div style={{ fontSize: '12px', color: t.text.primary }}>{li.product_name}</div>
                                  <div style={{ fontSize: '12px', color: t.text.secondary, textAlign: 'right' }}>{li.quantity}</div>
                                  <div style={{ fontSize: '12px', color: t.text.primary, fontWeight: '600', textAlign: 'right' }}>{formatCurrency(li.total || (li.price * li.quantity))}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ CAMPAIGNS TAB ══ */}
        {activeTab === 'campaigns' && (
          <div>
            {!campaigns || campaigns.length === 0 ? (
              <div style={{ fontSize: '13px', color: t.text.muted, padding: '60px 0', textAlign: 'center' }}>No active campaigns at the moment.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {campaigns.map((camp: any) => {
                  const isExpanded = expandedCampaign === camp.id
                  const milestones: any[] = camp.campaign_milestones || []
                  const completedMs = milestones.filter((m: any) => m.completed).length
                  const msPct = milestones.length > 0 ? Math.round((completedMs / milestones.length) * 100) : 0
                  const assets: any[] = campaignAssets[camp.id] || []
                  const statusColors: Record<string, string> = { active: t.status.success, completed: t.status.info, paused: t.status.warning, draft: t.text.muted }
                  const statusColor = statusColors[camp.status] || t.text.muted
                  return (
                    <div key={camp.id} style={{ ...card, overflow: 'hidden' }}>
                      <button onClick={async () => {
                        if (isExpanded) { setExpandedCampaign(null) } else {
                          setExpandedCampaign(camp.id)
                          if (!campaignAssets[camp.id]) {
                            const asts = await getCampaignAssets(camp.id).catch(() => [])
                            setCampaignAssets(prev => ({ ...prev, [camp.id]: asts }))
                          }
                        }
                      }} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 20px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '14px', fontWeight: '700', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{camp.title || camp.name}</span>
                              <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', backgroundColor: statusColor + '22', color: statusColor, fontWeight: '700', textTransform: 'uppercase', flexShrink: 0 }}>{camp.status}</span>
                            </div>
                            <div style={{ fontSize: '11px', color: t.text.muted }}>
                              {camp.campaign_type && <span style={{ marginRight: '10px' }}>{camp.campaign_type}</span>}
                              {camp.start_date && <span>{camp.start_date}{camp.end_date ? ` → ${camp.end_date}` : ''}</span>}
                            </div>
                          </div>
                          <span style={{ color: t.text.muted, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                        {milestones.length > 0 && (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                              <div style={{ fontSize: '11px', color: t.text.muted }}>{completedMs} of {milestones.length} milestones complete</div>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: msPct === 100 ? t.status.success : accent }}>{msPct}%</div>
                            </div>
                            <div style={{ height: '5px', backgroundColor: t.border.subtle, borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${msPct}%`, backgroundColor: msPct === 100 ? t.status.success : accent, borderRadius: '3px', transition: 'width 400ms ease' }} />
                            </div>
                          </div>
                        )}
                      </button>
                      {isExpanded && (
                        <div style={{ borderTop: `1px solid ${t.border.subtle}`, padding: '16px 20px' }}>
                          {camp.description && <p style={{ fontSize: '13px', color: t.text.secondary, marginBottom: '16px', lineHeight: 1.6 }}>{camp.description}</p>}
                          {milestones.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Milestones</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {milestones.map((m: any) => (
                                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', backgroundColor: m.completed ? `${t.status.success}0d` : t.bg.elevated, borderRadius: '6px', border: `1px solid ${m.completed ? t.status.success + '22' : t.border.subtle}` }}>
                                    <div style={{ width: 16, height: 16, borderRadius: '4px', border: `1.5px solid ${m.completed ? t.status.success : t.border.hover}`, backgroundColor: m.completed ? t.status.success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      {m.completed && <span style={{ fontSize: '9px', color: '#0c0c0a', fontWeight: '900' }}>✓</span>}
                                    </div>
                                    <span style={{ fontSize: '12px', color: m.completed ? t.text.muted : t.text.primary, textDecoration: m.completed ? 'line-through' : 'none', flex: 1 }}>{m.title}</span>
                                    {m.due_date && <span style={{ fontSize: '10px', color: t.text.muted, flexShrink: 0 }}>{formatShortDateMT(m.due_date)}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Assets */}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Shared Assets</div>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: accent, fontWeight: '600', cursor: 'pointer' }}>
                                <Upload size={11} /> Share a file
                                <input type="file" style={{ display: 'none' }} onChange={async e => {
                                  const file = e.target.files?.[0]; if (!file) return
                                  setUploadingAsset(true)
                                  try {
                                    const sb = getSupabase()
                                    const path = `${slug}/${camp.id}/${Date.now()}-${file.name}`
                                    const { error: upErr } = await sb.storage.from('campaign-assets').upload(path, file, { upsert: false })
                                    if (upErr) throw upErr
                                    const { data: urlData } = sb.storage.from('campaign-assets').getPublicUrl(path)
                                    const created = await createCampaignAsset({ campaign_id: camp.id, client_slug: slug, name: file.name, file_url: urlData.publicUrl, file_type: file.type, file_size: file.size, uploaded_by: 'client' })
                                    setCampaignAssets(prev => ({ ...prev, [camp.id]: [created, ...(prev[camp.id] || [])] }))
                                  } catch (err) { console.error('Upload failed:', err) }
                                  setUploadingAsset(false); e.target.value = ''
                                }} />
                              </label>
                            </div>
                            {assets.length === 0 ? (
                              <div style={{ fontSize: '12px', color: t.text.muted }}>No assets shared yet.</div>
                            ) : assets.map((asset: any) => (
                              <div key={asset.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', backgroundColor: t.bg.elevated, borderRadius: '6px', border: `1px solid ${t.border.subtle}`, marginBottom: '4px' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '12px', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
                                  <div style={{ fontSize: '10px', color: t.text.muted }}>{asset.uploaded_by === 'client' ? 'Your upload' : 'From Barley Bros'}</div>
                                </div>
                                <a href={asset.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: accent, textDecoration: 'none' }}>
                                  <ExternalLink size={12} /> View
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ COMPLIANCE TAB ══ */}
        {activeTab === 'compliance' && (
          <div>
            {/* Expiry alerts */}
            {(expiredRegs.length > 0 || expiringRegs.length > 0) && (
              <div style={{ ...card, padding: '14px 18px', marginBottom: '16px', border: `1px solid ${t.status.danger}33`, backgroundColor: `${t.status.danger}07` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <AlertCircle size={15} color={t.status.danger} />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: t.status.danger }}>Compliance Alerts</span>
                </div>
                {expiredRegs.map((r: any) => (
                  <div key={r.id} style={{ fontSize: '12px', color: t.status.danger, marginBottom: '3px' }}>⚠ {r.state} — Expired {formatShortDateMT(r.expiry_date)}</div>
                ))}
                {expiringRegs.filter((r: any) => r.status !== 'expired').map((r: any) => (
                  <div key={r.id} style={{ fontSize: '12px', color: t.status.warning, marginBottom: '3px' }}>⚠ {r.state} — Expires {formatShortDateMT(r.expiry_date)}</div>
                ))}
              </div>
            )}
            {registrations.length === 0 ? (
              <div style={{ fontSize: '13px', color: t.text.muted, padding: '60px 0', textAlign: 'center' }}>No state registrations on file yet.</div>
            ) : (
              <>
                {/* Summary counts */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {Object.entries(REG_STATUS_LABELS).map(([status, label]) => {
                    const count = registrations.filter((r: any) => r.status === status).length
                    if (count === 0) return null
                    const color = REG_STATUS_COLORS[status]
                    return (
                      <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: `${color}14`, border: `1px solid ${color}33`, borderRadius: '8px', padding: '8px 14px' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
                        <span style={{ fontSize: '16px', fontWeight: '800', color }}>{count}</span>
                        <span style={{ fontSize: '11px', color: t.text.muted }}>{label}</span>
                      </div>
                    )
                  })}
                </div>
                {/* Registration table */}
                <div style={{ ...card, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : '80px 1fr auto auto', gap: '1px', backgroundColor: t.border.subtle }}>
                    {/* Header */}
                    {!isMobile && ['State', 'Details', 'Expiry', 'Status'].map(h => (
                      <div key={h} style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 14px', backgroundColor: t.bg.elevated }}>{h}</div>
                    ))}
                    {isMobile && ['State', 'Status'].map(h => (
                      <div key={h} style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 14px', backgroundColor: t.bg.elevated }}>{h}</div>
                    ))}
                    {/* Rows */}
                    {registrations.map((r: any) => {
                      const color = REG_STATUS_COLORS[r.status] || t.text.muted
                      const isExpired = r.status === 'expired'
                      const isExpiringSoon = r.expiry_date && !isExpired && (new Date(r.expiry_date).getTime() - Date.now()) < 60 * 86400000
                      if (isMobile) return (
                        <>
                          <div key={`${r.id}-state`} style={{ padding: '10px 14px', backgroundColor: t.bg.card, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary }}>{r.state}</span>
                            {r.ttb_number && <span style={{ fontSize: '10px', color: t.text.muted }}>TTB: {r.ttb_number}</span>}
                          </div>
                          <div key={`${r.id}-status`} style={{ padding: '10px 14px', backgroundColor: t.bg.card, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            {(isExpired || isExpiringSoon) && <AlertCircle size={12} color={isExpired ? t.status.danger : t.status.warning} />}
                            <span style={{ fontSize: '10px', fontWeight: '700', color, backgroundColor: `${color}22`, padding: '2px 7px', borderRadius: '6px' }}>{REG_STATUS_LABELS[r.status] || r.status}</span>
                          </div>
                        </>
                      )
                      return (
                        <>
                          <div key={`${r.id}-state`} style={{ padding: '10px 14px', backgroundColor: t.bg.card, display: 'flex', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary }}>{r.state}</span>
                          </div>
                          <div key={`${r.id}-detail`} style={{ padding: '10px 14px', backgroundColor: t.bg.card }}>
                            {r.ttb_number && <div style={{ fontSize: '12px', color: t.text.secondary }}>TTB: {r.ttb_number}</div>}
                            {r.notes && <div style={{ fontSize: '11px', color: t.text.muted }}>{r.notes}</div>}
                          </div>
                          <div key={`${r.id}-expiry`} style={{ padding: '10px 14px', backgroundColor: t.bg.card }}>
                            {r.expiry_date ? (
                              <span style={{ fontSize: '12px', color: isExpired ? t.status.danger : isExpiringSoon ? t.status.warning : t.text.muted }}>
                                {isExpired ? '⚠ ' : isExpiringSoon ? '⚠ ' : ''}{formatShortDateMT(r.expiry_date)}
                              </span>
                            ) : <span style={{ fontSize: '12px', color: t.text.muted }}>—</span>}
                          </div>
                          <div key={`${r.id}-status`} style={{ padding: '10px 14px', backgroundColor: t.bg.card, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: '10px', fontWeight: '700', color, backgroundColor: `${color}22`, padding: '2px 7px', borderRadius: '6px' }}>{REG_STATUS_LABELS[r.status] || r.status}</span>
                          </div>
                        </>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ FILES TAB ══ */}
        {activeTab === 'files' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '13px', color: t.text.muted }}>Logos, photos, brand assets, and compliance documents shared between your team and Barley Bros.</div>
              <button onClick={() => { setFileUploadMode('asset'); setFileUploadType('logo'); setFileUploadExpiry(''); setShowFileUpload(true); setFileUploadErr('') }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', backgroundColor: accent + '22', color: accent, border: `1px solid ${accent}66`, borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}>
                <Upload size={13} /> Share Asset
              </button>
            </div>
            {showFileUpload && (
              <div style={{ ...card, padding: '18px', marginBottom: '16px', border: `1px solid ${fileUploadMode === 'compliance' ? t.status.warning + '55' : accent + '44'}` }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary, marginBottom: '12px' }}>
                  {fileUploadMode === 'compliance' ? 'Upload a Compliance Document' : 'Share a Brand Asset'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  {fileUploadMode === 'asset' ? (
                    <div>
                      <label style={labelStyle}>Asset Type</label>
                      <select value={fileUploadType} onChange={e => setFileUploadType(e.target.value as ClientFileType)} style={selectStyle}>
                        <option value="logo">Logo</option>
                        <option value="photo">Photo</option>
                        <option value="brand_asset">Brand Asset</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label style={labelStyle}>Expiry Date <span style={{ color: t.status.warning, fontWeight: '600' }}>(important)</span></label>
                      <input type="date" value={fileUploadExpiry} onChange={e => setFileUploadExpiry(e.target.value)} style={inputStyle} />
                    </div>
                  )}
                  {fileUploadMode === 'asset' && (
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ fontSize: '11px', color: t.text.muted, paddingBottom: '10px' }}>Logos, photos, and brand materials</div>
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={labelStyle}>Description <span style={{ color: t.text.muted, fontWeight: '400' }}>(optional)</span></label>
                  <input type="text" value={fileUploadDesc} onChange={e => setFileUploadDesc(e.target.value)} placeholder={fileUploadMode === 'compliance' ? 'e.g. CO TTB Certificate, State Registration…' : 'e.g. Primary logo — white on dark, Summer campaign photo…'} style={inputStyle} />
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={labelStyle}>File</label>
                  <input ref={portalFileInputRef} type="file" style={{ display: 'block', fontSize: '13px', color: t.text.secondary }} accept={fileUploadMode === 'compliance' ? '.pdf,.doc,.docx,.xls,.xlsx,.csv' : 'image/*,.pdf,.doc,.docx,.zip'} />
                </div>
                {fileUploadErr && <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', color: t.status.danger, marginBottom: '10px' }}><AlertCircle size={13} /> {fileUploadErr}</div>}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowFileUpload(false); setFileUploadErr('') }} style={{ padding: '8px 14px', background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: t.text.secondary, cursor: 'pointer' }}>Cancel</button>
                  <button disabled={fileUploading} onClick={async () => {
                    const file = portalFileInputRef.current?.files?.[0]
                    if (!file) { setFileUploadErr('Please select a file'); return }
                    setFileUploading(true); setFileUploadErr('')
                    try {
                      const sb = getSupabase()
                      const { data: { user } } = await sb.auth.getUser()
                      const newFile = await uploadClientFile(slug, file, { file_type: fileUploadType, description: fileUploadDesc || undefined, expiry_date: fileUploadExpiry || undefined, uploaded_by: user?.id, uploaded_by_portal: true })
                      setClientFiles(prev => [newFile, ...prev])
                      setShowFileUpload(false); setFileUploadType('other'); setFileUploadDesc(''); setFileUploadExpiry('')
                      if (portalFileInputRef.current) portalFileInputRef.current.value = ''
                    } catch (err: any) { setFileUploadErr(err.message || 'Upload failed') }
                    finally { setFileUploading(false) }
                  }} style={{ padding: '8px 16px', backgroundColor: fileUploadMode === 'compliance' ? t.status.warning : accent, color: '#0c0c0a', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', opacity: fileUploading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Upload size={13} /> {fileUploading ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
              </div>
            )}
            {filesLoading ? (
              <div style={{ fontSize: '13px', color: t.text.muted }}>Loading files…</div>
            ) : clientFiles.length === 0 ? (
              <div style={{ fontSize: '13px', color: t.text.muted, padding: '60px 0', textAlign: 'center' }}>
                <Folder size={28} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.3 }} />
                No files yet — use the button above to share files with your team
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {clientFiles.map(f => {
                  const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f.name)
                  const isExpired = f.expiry_date ? new Date(f.expiry_date) < new Date() : false
                  const isExpiringSoon = f.expiry_date && !isExpired && (new Date(f.expiry_date).getTime() - Date.now()) < 30 * 86400000
                  const ftLabels: Record<string, string> = { logo: 'Logo', compliance: 'Compliance', photo: 'Photo', brand_asset: 'Brand Asset', other: 'File' }
                  return (
                    <div key={f.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px' }}>
                      {isImage && <div style={{ width: '40px', height: '40px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', backgroundColor: t.bg.elevated }}><img src={f.file_url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '6px', backgroundColor: accent + '22', color: accent, fontWeight: '700', flexShrink: 0 }}>{ftLabels[f.file_type] || 'File'}</span>
                        </div>
                        {f.description && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{f.description}</div>}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
                          {f.expiry_date && <span style={{ fontSize: '11px', color: isExpired ? t.status.danger : isExpiringSoon ? t.status.warning : t.text.muted }}>{isExpired ? '⚠ Expired' : isExpiringSoon ? '⚠ Expires soon' : 'Expires'} {formatShortDateMT(f.expiry_date)}</span>}
                          <span style={{ fontSize: '11px', color: t.text.muted }}>{f.uploaded_by_portal ? 'Your upload' : 'From Barley Bros'} · {formatShortDateMT(f.created_at)}</span>
                        </div>
                      </div>
                      <a href={f.file_url} target="_blank" rel="noreferrer" download style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', backgroundColor: accent + '22', color: accent, border: `1px solid ${accent}44`, borderRadius: '7px', fontSize: '12px', fontWeight: '600', textDecoration: 'none', flexShrink: 0 }}>
                        <Download size={13} /> View
                      </a>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}


      </main>

      {/* Footer */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: `20px ${isMobile ? '16px' : '40px'}`, borderTop: `1px solid ${t.border.subtle}`, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: 20, height: 20, borderRadius: '4px', background: `linear-gradient(135deg, ${t.gold} 0%, #b8891e 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '800', color: '#0f0f0d', flexShrink: 0 }}>D</div>
        <div style={{ fontSize: '11px', color: t.text.muted }}>Powered by <strong style={{ color: t.text.secondary }}>Barley Bros</strong> · Fort Collins, CO</div>
      </div>

    </div>
  )
}
