'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '../../lib/supabase'
import { getPortalData, submitClientSuggestion, getCampaignExpenses, getCampaignAssets, createCampaignAsset } from '../../lib/data'
import { t, card, badge, inputStyle, labelStyle } from '../../lib/theme'
import { formatShortDateMT, startOfMonthMT, formatCurrency } from '../../lib/formatters'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  MapPin, Package, TrendingUp, LogOut, ChevronDown, ChevronUp,
  CheckCircle, Send, Building2, User, ExternalLink, Upload, FileDown,
  Calendar, Star, AlertCircle,
} from 'lucide-react'
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

const ACTION_STATUSES = ['Will Order Soon', 'Needs Follow Up']
const WIN_STATUSES = ['Just Ordered', 'Menu Feature Won', 'New Placement']

const PLACEMENT_STATUS_LABELS: Record<string, string> = {
  committed: 'Committed',
  ordered: 'Ordered',
  on_shelf: 'On Shelf',
  reordering: 'Reordering',
}
const PLACEMENT_STATUS_COLORS: Record<string, string> = {
  committed: '#e99928',
  ordered: '#6aaee0',
  on_shelf: '#3dbc76',
  reordering: '#a78bfa',
}

function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: '800', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        {children}
      </div>
      {action}
    </div>
  )
}

export default function ClientPortalPage() {
  const { slug } = useParams() as { slug: string }
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [isPreview, setIsPreview] = useState(false)
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([])

  // Visit filter
  const [visitFilter, setVisitFilter] = useState<'all' | 'action' | 'wins' | 'general'>('all')

  // Suggest form
  const [showSuggest, setShowSuggest] = useState(false)
  const [suggestType, setSuggestType] = useState<'account' | 'contact'>('account')
  const [suggestForm, setSuggestForm] = useState({ name: '', address: '', reason: '', reason_detail: '', notes: '', submitted_by_name: '', submitted_by_email: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [suggestErr, setSuggestErr] = useState('')

  // Campaign state
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)
  const [campaignExpenses, setCampaignExpenses] = useState<Record<string, any[]>>({})
  const [campaignAssets, setCampaignAssets] = useState<Record<string, any[]>>({})
  const [uploadingAsset, setUploadingAsset] = useState(false)

  // Order state
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [orderLineItems, setOrderLineItems] = useState<Record<string, any[]>>({})

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null
      if (!user) { window.location.replace(`/login?redirect=/portal/${slug}`); return }
      const { data: profile } = await sb.from('user_profiles').select('role, client_slug').eq('id', user.id).single()
      const staffRoles = ['owner', 'admin', 'rep', 'intern']
      const isStaff = staffRoles.includes(profile?.role)
      const isPortal = profile?.role === 'portal'
      if (!isStaff && !isPortal) {
        setError(`Access denied — your account (role: ${profile?.role ?? 'no profile'}) is not authorized.`)
        setLoading(false); return
      }
      if (isPortal && profile?.client_slug && profile.client_slug !== slug) {
        setError(`Access denied — portal account is assigned to "${profile.client_slug}", not "${slug}".`)
        setLoading(false); return
      }
      if (isStaff) setIsPreview(true)
      try {
        const d = await getPortalData(slug)
        setData(d)
        // Fetch upcoming events
        sb.from('events')
          .select('id, title, event_type, start_time, accounts(name, address)')
          .eq('client_slug', slug)
          .gt('start_time', new Date().toISOString())
          .order('start_time')
          .limit(6)
          .then(({ data: ev }) => setUpcomingEvents(ev || []))
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
    const { client: cl, visits: vs, placements: pls, orders: ords, events: evts } = data
    const mStart = startOfMonthMT()
    const mVisits = vs.filter((v: any) => v.visited_at >= mStart).length
    const actPlacements = pls.filter((p: any) => !p.lost_at)
    const nonDraftOrders = ords.filter((o: any) => o.status !== 'draft')
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const clName = (cl?.name || slug).replace(/</g, '&lt;')
    const orderRows = nonDraftOrders.map((o: any) =>
      `<tr><td>${(o.deliver_to_name || '—').replace(/</g, '&lt;')}</td><td>${isDistInquiry(o) ? 'Distributor Inquiry' : 'Purchase Order'}</td><td>${o.status}</td><td>${o.total_amount > 0 ? '$' + Number(o.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td><td>${formatShortDateMT(o.created_at)}</td></tr>`
    ).join('')
    const placementRows = actPlacements.slice(0, 40).map((p: any) =>
      `<tr><td>${(p.accounts?.name || '—').replace(/</g, '&lt;')}</td><td>${(p.product_name || '—').replace(/</g, '&lt;')}</td><td>${p.status || '—'}</td></tr>`
    ).join('')
    const visitRows = vs.slice(0, 30).map((v: any) =>
      `<tr><td>${(v.accounts?.name || '—').replace(/</g, '&lt;')}</td><td>${v.status}</td><td>${formatShortDateMT(v.visited_at)}</td><td>${(v.notes || '—').replace(/</g, '&lt;')}</td></tr>`
    ).join('')
    const html = `<!DOCTYPE html><html><head><title>${clName} — Field Report</title>
<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;padding:48px 56px;color:#111;max-width:820px;margin:0 auto;font-size:13px}
h1{font-size:24px;font-weight:800;margin:0 0 4px}.meta{color:#888;font-size:12px;margin-bottom:24px}
h2{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#666;margin:28px 0 10px;border-bottom:1px solid #eee;padding-bottom:6px}
.stats{display:flex;gap:12px;margin-bottom:24px}.stat{background:#f7f7f5;border-radius:8px;padding:12px 16px;flex:1}
.stat-label{font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:4px}
.stat-val{font-size:24px;font-weight:800}table{width:100%;border-collapse:collapse}
th{text-align:left;padding:6px 10px;border-bottom:2px solid #ddd;font-size:10px;text-transform:uppercase;color:#666}
td{padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;vertical-align:top}
@media print{body{padding:24px}}</style></head><body>
<h1>${clName} — Field Report</h1>
<div class="meta">Generated ${dateStr} · Barley Bros · Fort Collins, CO</div>
<div class="stats">
  <div class="stat"><div class="stat-label">Visits This Month</div><div class="stat-val">${mVisits}</div></div>
  <div class="stat"><div class="stat-label">Active Placements</div><div class="stat-val">${actPlacements.length}</div></div>
  <div class="stat"><div class="stat-label">Orders (90 days)</div><div class="stat-val">${nonDraftOrders.length}</div></div>
  <div class="stat"><div class="stat-label">Events</div><div class="stat-val">${evts.length}</div></div>
</div>
${nonDraftOrders.length > 0 ? `<h2>Orders</h2><table><thead><tr><th>Account</th><th>Type</th><th>Status</th><th>Amount</th><th>Date</th></tr></thead><tbody>${orderRows}</tbody></table>` : ''}
${actPlacements.length > 0 ? `<h2>Active Placements (${actPlacements.length})</h2><table><thead><tr><th>Account</th><th>Product</th><th>Status</th></tr></thead><tbody>${placementRows}</tbody></table>` : ''}
${vs.length > 0 ? `<h2>Recent Field Activity</h2><table><thead><tr><th>Account</th><th>Outcome</th><th>Date</th><th>Notes</th></tr></thead><tbody>${visitRows}</tbody></table>` : ''}
</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400) }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '12px', background: `linear-gradient(135deg, ${t.gold} 0%, #b8891e 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '800', color: '#0f0f0d', margin: '0 auto 12px' }}>D</div>
          <div style={{ color: t.text.muted, fontSize: '13px' }}>Loading your field report...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: t.status.danger, marginBottom: '8px' }}>{error}</div>
          <button onClick={() => { getSupabase().auth.signOut(); window.location.href = '/login' }}
            style={{ fontSize: '12px', color: t.text.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Sign in</button>
        </div>
      </div>
    )
  }

  const { client, visits, placements, orders, events, campaigns, funnel, visitTrend } = data
  const isDistInquiry = (o: any) =>
    o.order_type === 'distributor' || (o.order_type !== 'direct' && (o.distributor_email || o.distributor_rep_name))
  const nonDraftOrders = orders.filter((o: any) => o.status !== 'draft')
  const distOrders = nonDraftOrders.filter(isDistInquiry)
  const visibleOrders = nonDraftOrders

  const accent = client?.color || t.gold
  const logoUrl = client ? clientLogoUrl(client) : null
  const monthStart = startOfMonthMT()
  const monthVisits = visits.filter((v: any) => v.visited_at >= monthStart).length
  const activePlacements = placements.filter((p: any) => !p.lost_at)
  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const pad = isMobile ? '16px' : '32px 40px'

  // Visit groupings
  const actionVisits = visits.filter((v: any) => ACTION_STATUSES.includes(v.status))
  const winVisits = visits.filter((v: any) => WIN_STATUSES.includes(v.status))
  const generalVisits = visits.filter((v: any) => !ACTION_STATUSES.includes(v.status) && !WIN_STATUSES.includes(v.status))
  const filteredVisits = visitFilter === 'action' ? actionVisits : visitFilter === 'wins' ? winVisits : visitFilter === 'general' ? generalVisits : visits

  // Placement breakdown
  const placementBreakdown = ['committed', 'ordered', 'on_shelf', 'reordering'].map(status => ({
    status,
    count: activePlacements.filter((p: any) => p.status === status).length,
    items: activePlacements.filter((p: any) => p.status === status),
  })).filter(g => g.count > 0)

  // Pipeline numbers
  const interestedAccounts = [...new Set(actionVisits.map((v: any) => v.account_id).filter(Boolean))].length
  const confirmedOrders = nonDraftOrders.filter((o: any) => o.status === 'fulfilled').length

  return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, color: t.text.primary, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Preview banner */}
      {isPreview && (
        <div style={{ backgroundColor: '#7c3aed', color: '#fff', fontSize: '12px', fontWeight: '600', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span>Previewing client portal — this is exactly what {client?.name || slug} sees when they log in.</span>
          <a href={`/clients/${slug}`} style={{ color: '#fff', fontSize: '11px', opacity: 0.85, textDecoration: 'underline', whiteSpace: 'nowrap' }}>← Back to CRM</a>
        </div>
      )}

      {/* Sticky header */}
      <header style={{ backgroundColor: t.bg.sidebar, borderBottom: `1px solid ${accent}33`, padding: `0 ${isMobile ? '16px' : '32px'}`, height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
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
            <div style={{ fontSize: '10px', color: t.text.muted, lineHeight: 1.2 }}>Barley Bros Field Report</div>
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

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: pad }}>

        {/* ── Hero ── */}
        <div style={{ marginBottom: '32px', paddingBottom: '28px', borderBottom: `1px solid ${t.border.subtle}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: isMobile ? '26px' : '34px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '8px' }}>
                {month} Field Report
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: t.text.muted, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <MapPin size={13} color={accent} /> {visits.length} account visits in 90 days
                </span>
                {activePlacements.length > 0 && (
                  <span style={{ fontSize: '13px', color: t.text.muted, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Package size={13} color={t.status.success} /> {activePlacements.length} active placements
                  </span>
                )}
                {events.length > 0 && (
                  <span style={{ fontSize: '13px', color: t.text.muted, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Calendar size={13} color={t.status.warning} /> {events.length} events in 90 days
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI tiles ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: '12px', marginBottom: '28px' }}>
          {/* Visits */}
          <div style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '10px', padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, ${accent}, transparent)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Visits This Month</div>
              <MapPin size={16} color={accent} opacity={0.7} />
            </div>
            <div style={{ fontSize: '34px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.04em', lineHeight: 1 }}>{monthVisits}</div>
            <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '6px' }}>{visits.length} total in 90 days</div>
          </div>

          {/* Placements */}
          <div style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '10px', padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, ${t.status.success}, transparent)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Active Placements</div>
              <Package size={16} color={t.status.success} opacity={0.7} />
            </div>
            <div style={{ fontSize: '34px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.04em', lineHeight: 1 }}>{activePlacements.length}</div>
            <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '6px' }}>{placements.length} total tracked</div>
          </div>

          {/* Orders */}
          <div style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '10px', padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, ${t.status.info}, transparent)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.09em' }}>{distOrders.length > 0 ? 'Order Inquiries Sent' : 'Orders Placed'}</div>
              <Send size={16} color={t.status.info} opacity={0.7} />
            </div>
            <div style={{ fontSize: '34px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.04em', lineHeight: 1 }}>
              {distOrders.length > 0 ? distOrders.length : visibleOrders.length}
            </div>
            <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '6px' }}>
              {distOrders.length > 0 ? 'to distributors on your behalf' : 'purchase orders placed'}
            </div>
          </div>

          {/* Events */}
          <div style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '10px', padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, ${t.status.warning}, transparent)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Events & Tastings</div>
              <TrendingUp size={16} color={t.status.warning} opacity={0.7} />
            </div>
            <div style={{ fontSize: '34px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.04em', lineHeight: 1 }}>{events.length}</div>
            <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '6px' }}>
              {upcomingEvents.length > 0 ? `${upcomingEvents.length} upcoming` : 'in last 90 days'}
            </div>
          </div>

          {/* Showing Interest */}
          <div style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '10px', padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, ${accent}, transparent)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Showing Interest</div>
              <Star size={16} color={accent} opacity={0.7} />
            </div>
            <div style={{ fontSize: '34px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.04em', lineHeight: 1 }}>{interestedAccounts}</div>
            <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '6px' }}>accounts following up</div>
          </div>
        </div>

        {/* ── Visit Trend ── */}
        {visitTrend.some((w: any) => w.visits > 0) && (
          <div style={{ ...card, marginBottom: '24px', padding: isMobile ? '16px' : '22px 28px' }}>
            <SectionHeader>Account Visits — Last 12 Weeks</SectionHeader>
            <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '16px' }}>Each bar represents accounts our team visited that week on your behalf.</div>
            <ResponsiveContainer width="100%" height={isMobile ? 120 : 160}>
              <BarChart data={visitTrend} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke={t.border.subtle} vertical={false} />
                <XAxis dataKey="week" tick={{ fill: t.text.muted, fontSize: isMobile ? 8 : 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: t.text.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
                <Tooltip
                  contentStyle={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: t.text.muted }}
                  itemStyle={{ color: accent }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(value: any) => [value, 'visits']}
                  labelFormatter={(label: any, payload: any) => {
                    const weekEnd = payload?.[0]?.payload?.weekEnd
                    return weekEnd ? `${label} – ${weekEnd}` : label
                  }}
                />
                <Bar dataKey="visits" fill={accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Field Activity ── */}
        <div style={{ ...card, marginBottom: '24px', padding: isMobile ? '16px' : '22px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '11px', fontWeight: '800', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Recent Field Activity — Last 90 Days
            </div>
            {/* Filter chips */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {([
                { key: 'all', label: `All (${visits.length})` },
                { key: 'action', label: `Needs Attention (${actionVisits.length})`, color: t.status.warning },
                { key: 'wins', label: `Wins (${winVisits.length})`, color: t.status.success },
                { key: 'general', label: `General (${generalVisits.length})` },
              ] as { key: string; label: string; color?: string }[]).map(f => (
                <button key={f.key} onClick={() => setVisitFilter(f.key as any)} style={{
                  padding: '4px 10px', borderRadius: '20px', fontSize: '11px', cursor: 'pointer', fontWeight: visitFilter === f.key ? '700' : '500',
                  border: `1px solid ${visitFilter === f.key ? (f.color || accent) : t.border.default}`,
                  backgroundColor: visitFilter === f.key ? `${(f.color || accent)}22` : 'transparent',
                  color: visitFilter === f.key ? (f.color || accent) : t.text.muted,
                  transition: 'all 100ms ease',
                }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {visits.length === 0 ? (
            <div style={{ fontSize: '13px', color: t.text.muted, padding: '24px 0', textAlign: 'center' }}>No field activity recorded in this period.</div>
          ) : filteredVisits.length === 0 ? (
            <div style={{ fontSize: '13px', color: t.text.muted, padding: '24px 0', textAlign: 'center' }}>No visits in this category.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filteredVisits.slice(0, 30).map((v: any) => {
                const ac = STATUS_ACCENT[v.status] || t.text.muted
                return (
                  <div key={v.id} style={{ backgroundColor: t.bg.elevated, borderRadius: '8px', padding: '12px 14px 12px 16px', boxShadow: `inset 3px 0 0 ${ac}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                        <span style={badge.visitStatus(v.status)}>{v.status}</span>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary }}>{v.accounts?.name || 'Unknown account'}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: t.text.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatShortDateMT(v.visited_at)}</span>
                    </div>
                    {v.accounts?.address && (
                      <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: v.notes ? '6px' : '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.accounts.address}</div>
                    )}
                    {v.notes && (
                      <div style={{ fontSize: '12px', color: t.text.secondary, lineHeight: 1.6, borderLeft: `2px solid ${t.border.default}`, paddingLeft: '10px', marginTop: '6px' }}>
                        {v.notes}
                      </div>
                    )}
                  </div>
                )
              })}
              {filteredVisits.length > 30 && (
                <div style={{ fontSize: '12px', color: t.text.muted, textAlign: 'center', padding: '8px 0' }}>
                  +{filteredVisits.length - 30} more visits in this period
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Active Placements ── */}
        {activePlacements.length > 0 && (
          <div style={{ ...card, marginBottom: '24px', padding: isMobile ? '16px' : '22px 28px' }}>
            <SectionHeader>Active Placement Coverage</SectionHeader>

            {/* Status breakdown */}
            {placementBreakdown.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
                {placementBreakdown.map(g => (
                  <div key={g.status} style={{ backgroundColor: `${PLACEMENT_STATUS_COLORS[g.status]}14`, border: `1px solid ${PLACEMENT_STATUS_COLORS[g.status]}30`, borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: PLACEMENT_STATUS_COLORS[g.status], boxShadow: `0 0 5px ${PLACEMENT_STATUS_COLORS[g.status]}88` }} />
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: '800', color: PLACEMENT_STATUS_COLORS[g.status], lineHeight: 1 }}>{g.count}</div>
                      <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '1px' }}>{PLACEMENT_STATUS_LABELS[g.status]}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Placement list */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px' }}>
              {activePlacements.slice(0, 24).map((p: any) => {
                const statusColor = PLACEMENT_STATUS_COLORS[p.status] || t.text.muted
                return (
                  <div key={p.id} style={{ backgroundColor: t.bg.elevated, borderRadius: '8px', padding: '12px 14px', border: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColor, flexShrink: 0, boxShadow: `0 0 4px ${statusColor}88` }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.accounts?.name}</div>
                      <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '1px' }}>
                        {p.product_name}{p.placement_type ? ` · ${p.placement_type.replace('_', ' ')}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: statusColor, backgroundColor: `${statusColor}18`, padding: '2px 7px', borderRadius: '6px', textTransform: 'capitalize', flexShrink: 0 }}>
                      {PLACEMENT_STATUS_LABELS[p.status] || p.status}
                    </span>
                  </div>
                )
              })}
            </div>
            {activePlacements.length > 24 && (
              <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '10px' }}>+{activePlacements.length - 24} more placements</div>
            )}
          </div>
        )}

        {/* ── Orders / Inquiries ── */}
        {visibleOrders.length > 0 && (
          <div style={{ ...card, marginBottom: '24px', padding: isMobile ? '18px 16px' : '22px 28px' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ marginTop: '-14px' }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '10px' }}>
                  {distOrders.length > 0 ? 'Order Inquiries — Last 90 Days' : 'Orders — Last 90 Days'}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <span style={{ fontSize: '36px', fontWeight: '800', color: accent, letterSpacing: '-0.03em', lineHeight: 1 }}>{visibleOrders.length}</span>
                  <span style={{ fontSize: '13px', color: t.text.muted }}>
                    {distOrders.length > 0 ? 'distributor inquiries sent on your behalf' : 'orders placed on your behalf'}
                  </span>
                </div>
                {distOrders.length > 0 && (
                  <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '8px', lineHeight: 1.6, borderLeft: `3px solid ${t.border.default}`, paddingLeft: '10px' }}>
                    Order inquiries represent accounts that expressed interest — we send a formal request to the distributor to create a record of the demand we generated.
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {visibleOrders.map((o: any) => {
                const isExpanded = expandedOrder === o.id
                const lineItems = orderLineItems[o.id]
                const STATUS_COLORS: Record<string, string> = { sent: t.status.info, fulfilled: t.status.success, cancelled: t.status.danger }
                const statusColor = STATUS_COLORS[o.status] || t.text.muted
                const isOrderInquiry = isDistInquiry(o)
                return (
                  <div key={o.id} style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderRadius: '8px', overflow: 'hidden' }}>
                    <button
                      onClick={async () => {
                        if (isExpanded) { setExpandedOrder(null) } else {
                          setExpandedOrder(o.id)
                          if (orderLineItems[o.id] === undefined) {
                            const { data: liData } = await getSupabase().from('po_line_items').select('product_name, quantity, price, total').eq('po_id', o.id).order('id')
                            setOrderLineItems(prev => ({ ...prev, [o.id]: liData || [] }))
                          }
                        }
                      }}
                      style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', textAlign: 'left' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.deliver_to_name}</span>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', backgroundColor: statusColor + '22', color: statusColor, fontWeight: '700', textTransform: 'uppercase', flexShrink: 0 }}>{o.status}</span>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', backgroundColor: t.bg.page, color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', border: `1px solid ${t.border.subtle}`, flexShrink: 0 }}>
                            {isOrderInquiry ? 'Order Inquiry' : 'Purchase Order'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: t.text.muted }}>
                          {o.po_number} · {formatShortDateMT(o.created_at)}
                          {o.deliver_to_address && !isMobile ? ` · ${o.deliver_to_address}` : ''}
                        </div>
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
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto auto' : '1fr auto auto auto', gap: '4px 16px', paddingBottom: '8px', marginBottom: '4px', borderBottom: `1px solid ${t.border.subtle}` }}>
                              {['Product', 'Qty', ...(isMobile ? [] : ['Unit Price']), 'Total'].map(h => (
                                <div key={h} style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: h === 'Product' ? 'left' : 'right' }}>{h}</div>
                              ))}
                            </div>
                            {lineItems.map((li: any, idx: number) => (
                              <div key={idx} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto auto' : '1fr auto auto auto', gap: '4px 16px', padding: '6px 0', borderBottom: `1px solid ${t.border.subtle}` }}>
                                <div style={{ fontSize: '12px', color: t.text.primary }}>{li.product_name}</div>
                                <div style={{ fontSize: '12px', color: t.text.secondary, textAlign: 'right' }}>{li.quantity}</div>
                                {!isMobile && <div style={{ fontSize: '12px', color: t.text.secondary, textAlign: 'right' }}>{formatCurrency(li.price)}</div>}
                                <div style={{ fontSize: '12px', fontWeight: '600', color: t.text.primary, textAlign: 'right' }}>{formatCurrency(li.total)}</div>
                              </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary }}>Total: {formatCurrency(o.total_amount)}</span>
                            </div>
                          </div>
                        )}
                        {(o.distributor_email || o.distributor_rep_name) && (
                          <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${t.border.subtle}` }}>
                            Sent to: {o.distributor_rep_name || ''}{o.distributor_email ? ` · ${o.distributor_email}` : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Events & Tastings ── */}
        {(upcomingEvents.length > 0 || events.length > 0) && (
          <div style={{ ...card, marginBottom: '24px', padding: isMobile ? '16px' : '22px 28px' }}>
            <SectionHeader>Events & Tastings</SectionHeader>
            {upcomingEvents.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: t.status.success, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Upcoming</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {upcomingEvents.map((e: any) => (
                    <div key={e.id} style={{ backgroundColor: `${t.status.success}0d`, border: `1px solid ${t.status.success}22`, borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Calendar size={14} color={t.status.success} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{e.title}</div>
                        {e.accounts?.name && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '1px' }}>{e.accounts.name}</div>}
                      </div>
                      <div style={{ fontSize: '11px', color: t.status.success, fontWeight: '600', flexShrink: 0 }}>
                        {new Date(e.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {events.length > 0 && (
              <div>
                {upcomingEvents.length > 0 && <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Past 90 Days</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {events.slice(0, 8).map((e: any) => (
                    <div key={e.id} style={{ backgroundColor: t.bg.elevated, borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', border: `1px solid ${t.border.subtle}` }}>
                      <Calendar size={14} color={t.text.muted} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{e.title}</div>
                        {e.accounts?.name && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '1px' }}>{e.accounts.name}</div>}
                      </div>
                      <div style={{ fontSize: '11px', color: t.text.muted, flexShrink: 0 }}>{formatShortDateMT(e.start_time)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Campaigns ── */}
        {campaigns && campaigns.length > 0 && (
          <div style={{ ...card, marginBottom: '24px', padding: isMobile ? '16px' : '22px 28px' }}>
            <SectionHeader>Active Campaigns ({campaigns.length})</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {campaigns.map((camp: any) => {
                const isExpanded = expandedCampaign === camp.id
                const milestones: any[] = camp.campaign_milestones || []
                const completedMs = milestones.filter((m: any) => m.completed).length
                const expenses: any[] = campaignExpenses[camp.id] || []
                const assets: any[] = campaignAssets[camp.id] || []
                const totalExpenses = expenses.reduce((s: number, exp: any) => s + Number(exp.amount || 0), 0)
                const msPct = milestones.length > 0 ? Math.round((completedMs / milestones.length) * 100) : 0
                const statusColors: Record<string, string> = { active: t.status.success, completed: t.status.info, paused: t.status.warning, draft: t.text.muted }
                const statusColor = statusColors[camp.status] || t.text.muted
                return (
                  <div key={camp.id} style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderRadius: '8px', overflow: 'hidden' }}>
                    <button
                      onClick={async () => {
                        if (isExpanded) { setExpandedCampaign(null) } else {
                          setExpandedCampaign(camp.id)
                          if (!campaignExpenses[camp.id]) {
                            const [exps, asts] = await Promise.all([getCampaignExpenses(camp.id).catch(() => []), getCampaignAssets(camp.id).catch(() => [])])
                            setCampaignExpenses(prev => ({ ...prev, [camp.id]: exps }))
                            setCampaignAssets(prev => ({ ...prev, [camp.id]: asts }))
                          }
                        }
                      }}
                      style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{camp.title || camp.name}</span>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', backgroundColor: statusColor + '22', color: statusColor, fontWeight: '700', textTransform: 'uppercase', flexShrink: 0 }}>{camp.status}</span>
                        </div>
                        <span style={{ color: t.text.muted, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: t.text.muted }}>
                        {camp.start_date && <span>{camp.start_date}{camp.end_date ? ` – ${camp.end_date}` : ''}</span>}
                        {milestones.length > 0 && <span>{completedMs} of {milestones.length} milestones complete</span>}
                        {expenses.length > 0 && <span style={{ color: accent }}>Spend: {formatCurrency(totalExpenses)}</span>}
                      </div>
                      {milestones.length > 0 && (
                        <div style={{ height: '4px', backgroundColor: t.border.subtle, borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${msPct}%`, backgroundColor: accent, borderRadius: '2px', transition: 'width 300ms ease' }} />
                        </div>
                      )}
                    </button>
                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${t.border.subtle}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {milestones.length > 0 && (
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Milestones</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              {milestones.map((m: any) => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: m.completed ? t.status.success : 'transparent', border: `2px solid ${m.completed ? t.status.success : t.border.hover}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {m.completed && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#0f0f0d' }} />}
                                  </div>
                                  <span style={{ fontSize: '12px', color: m.completed ? t.text.muted : t.text.primary, textDecoration: m.completed ? 'line-through' : 'none' }}>{m.title}</span>
                                  {m.due_date && <span style={{ fontSize: '11px', color: t.text.muted, marginLeft: 'auto' }}>{m.due_date}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {expenses.length > 0 && (
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Campaign Expenses — {formatCurrency(totalExpenses)}</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              {(() => {
                                const byCategory: Record<string, number> = {}
                                expenses.forEach((exp: any) => { byCategory[exp.category] = (byCategory[exp.category] || 0) + Number(exp.amount || 0) })
                                return Object.entries(byCategory).map(([cat, amt]) => (
                                  <div key={cat} style={{ backgroundColor: t.bg.page, border: `1px solid ${t.border.subtle}`, borderRadius: '6px', padding: '6px 10px' }}>
                                    <div style={{ fontSize: '10px', color: t.text.muted, textTransform: 'capitalize', marginBottom: '2px' }}>{cat}</div>
                                    <div style={{ fontSize: '13px', fontWeight: '700', color: accent }}>{formatCurrency(amt)}</div>
                                  </div>
                                ))
                              })()}
                            </div>
                          </div>
                        )}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Assets ({assets.length})</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: '600', color: accent, backgroundColor: accent + '18', border: `1px solid ${accent}44`, borderRadius: '6px', padding: '4px 10px', cursor: uploadingAsset ? 'wait' : 'pointer' }}>
                              <Upload size={11} /> {uploadingAsset ? 'Uploading…' : 'Upload File'}
                              <input type="file" style={{ display: 'none' }} disabled={uploadingAsset} onChange={async (e) => {
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
                            <div style={{ fontSize: '12px', color: t.text.muted }}>No assets yet. Use the button above to share files with your team.</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {assets.map((asset: any) => (
                                <div key={asset.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', backgroundColor: t.bg.page, borderRadius: '6px', border: `1px solid ${t.border.subtle}` }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12px', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
                                    <div style={{ fontSize: '10px', color: t.text.muted }}>{asset.uploaded_by === 'client' ? 'Your upload' : 'From Barley Bros'}{asset.file_size ? ` · ${Math.round(asset.file_size / 1024)}KB` : ''}</div>
                                  </div>
                                  <a href={asset.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: accent, textDecoration: 'none', flexShrink: 0 }}>
                                    <ExternalLink size={12} /> View
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Suggest an Account ── */}
        <div style={{ ...card, marginBottom: '24px', padding: isMobile ? '16px' : '22px 28px', border: `1px solid ${accent}33` }}>
          <button onClick={() => setShowSuggest(!showSuggest)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0 }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>Suggest an Account or Contact</div>
              <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '3px' }}>Know a bar, restaurant, or rep we should be talking to? Tell us.</div>
            </div>
            {showSuggest ? <ChevronUp size={16} color={t.text.muted} /> : <ChevronDown size={16} color={t.text.muted} />}
          </button>
          {showSuggest && (
            <div style={{ marginTop: '20px' }}>
              {submitted ? (
                <div style={{ padding: '20px', backgroundColor: `${t.status.success}14`, border: `1px solid ${t.status.success}44`, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle size={18} color={t.status.success} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: t.status.success }}>Submitted — thank you!</div>
                    <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>Our team will review this and follow up.</div>
                  </div>
                  <button onClick={() => setSubmitted(false)} style={{ marginLeft: 'auto', fontSize: '12px', color: accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>Add another</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['account', 'contact'] as const).map(type => (
                      <button key={type} onClick={() => setSuggestType(type)} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                        backgroundColor: suggestType === type ? accent + '22' : 'transparent', color: suggestType === type ? accent : t.text.secondary,
                        border: `1px solid ${suggestType === type ? accent + '66' : t.border.default}`,
                      }}>
                        {type === 'account' ? <Building2 size={14} /> : <User size={14} />}
                        {type === 'account' ? 'An Account' : 'A Contact'}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>{suggestType === 'account' ? 'Account name *' : 'Contact name *'}</label>
                      <input value={suggestForm.name} onChange={e => setSuggestForm(f => ({ ...f, name: e.target.value }))} placeholder={suggestType === 'account' ? 'e.g. The Blind Pig' : 'e.g. Jamie — Bar Manager'} style={inputStyle} />
                    </div>
                    {suggestType === 'account' && (
                      <div>
                        <label style={labelStyle}>Address (optional)</label>
                        <input value={suggestForm.address} onChange={e => setSuggestForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St, Denver, CO" style={inputStyle} />
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Why are you flagging this? *</label>
                    <select value={suggestForm.reason} onChange={e => setSuggestForm(f => ({ ...f, reason: e.target.value }))} style={{ ...inputStyle, appearance: 'none' as const }}>
                      <option value="">Select a reason...</option>
                      {SUGGESTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Additional context</label>
                    <textarea value={suggestForm.notes} onChange={e => setSuggestForm(f => ({ ...f, notes: e.target.value }))} placeholder="Details that would help our team..." rows={3} style={{ ...inputStyle, resize: 'none' as const }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Your name (optional)</label>
                      <input value={suggestForm.submitted_by_name} onChange={e => setSuggestForm(f => ({ ...f, submitted_by_name: e.target.value }))} placeholder="So we know who to follow up with" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Your email (optional)</label>
                      <input type="email" value={suggestForm.submitted_by_email} onChange={e => setSuggestForm(f => ({ ...f, submitted_by_email: e.target.value }))} placeholder="we'll let you know what happens" style={inputStyle} />
                    </div>
                  </div>
                  {suggestErr && <div style={{ fontSize: '12px', color: t.status.danger }}>{suggestErr}</div>}
                  <button onClick={handleSuggest} disabled={submitting || !suggestForm.name.trim() || !suggestForm.reason}
                    style={{ padding: '11px 20px', backgroundColor: accent, color: '#0c0c0a', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: submitting || !suggestForm.name.trim() || !suggestForm.reason ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Send size={14} /> {submitting ? 'Sending...' : 'Submit to Barley Bros'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '20px 0', borderTop: `1px solid ${t.border.subtle}`, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 20, height: 20, borderRadius: '4px', background: `linear-gradient(135deg, ${t.gold} 0%, #b8891e 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '800', color: '#0f0f0d', flexShrink: 0 }}>D</div>
          <div style={{ fontSize: '11px', color: t.text.muted }}>Powered by <strong style={{ color: t.text.secondary }}>Barley Bros</strong> · Fort Collins, CO</div>
        </div>

      </main>
    </div>
  )
}
