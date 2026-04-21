'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '../../lib/supabase'
import { getPortalData, submitClientSuggestion, getCampaignExpenses, getCampaignAssets, createCampaignAsset } from '../../lib/data'
import { t, card, badge, inputStyle, labelStyle } from '../../lib/theme'
import { formatShortDateMT, relativeTimeStr, startOfMonthMT, formatCurrency, daysAgoMT } from '../../lib/formatters'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { MapPin, Package, TrendingUp, LogOut, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Plus, Send, Building2, User, ExternalLink, Upload, FileDown } from 'lucide-react'
import { clientLogoUrl } from '../../lib/constants'

const SUGGESTION_REASONS = [
  { value: 'inbound_request', label: 'They reached out asking for us' },
  { value: 'competitor_gap', label: 'Gap/opportunity I noticed on-premise' },
  { value: 'warm_referral', label: 'Referred by someone in the industry' },
  { value: 'staff_fan', label: 'Staff or bartender expressed interest' },
  { value: 'strategic_fit', label: 'High-volume account, strong fit for the brand' },
  { value: 'other', label: 'Other reason' },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: '800', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '14px' }}>
      {children}
    </div>
  )
}

function StatTile({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.3 }}>{label}</div>
        <div style={{ color, opacity: 0.75 }}>{icon}</div>
      </div>
      <div style={{ fontSize: '26px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '5px' }}>{sub}</div>}
    </div>
  )
}

export default function ClientPortalPage() {
  const { slug } = useParams() as { slug: string }
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [showSuggest, setShowSuggest] = useState(false)
  const [suggestType, setSuggestType] = useState<'account' | 'contact'>('account')
  const [suggestForm, setSuggestForm] = useState({ name: '', address: '', reason: '', reason_detail: '', notes: '', submitted_by_name: '', submitted_by_email: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [suggestErr, setSuggestErr] = useState('')

  const [showInquiries, setShowInquiries] = useState(false)

  // Campaign state
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)
  const [campaignExpenses, setCampaignExpenses] = useState<Record<string, any[]>>({})
  const [campaignAssets, setCampaignAssets] = useState<Record<string, any[]>>({})
  const [uploadingAsset, setUploadingAsset] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setError('Not authorized'); setLoading(false); return }
      const { data: profile } = await sb.from('user_profiles').select('role, client_slug').eq('id', user.id).single()
      if (profile?.role !== 'portal' && profile?.role !== 'owner') {
        setError('Access denied'); setLoading(false); return
      }
      if (profile?.role === 'portal' && profile?.client_slug && profile.client_slug !== slug) {
        setError('Access denied'); setLoading(false); return
      }
      try {
        const d = await getPortalData(slug)
        setData(d)
      } catch (e) { setError('Failed to load data') }
      finally { setLoading(false) }
    })
  }, [slug])

  async function handleSuggest() {
    if (!suggestForm.name.trim() || !suggestForm.reason) { setSuggestErr('Name and reason are required'); return }
    setSubmitting(true); setSuggestErr('')
    try {
      await submitClientSuggestion({
        client_slug: slug,
        suggestion_type: suggestType,
        name: suggestForm.name,
        address: suggestForm.address || undefined,
        notes: suggestForm.notes || undefined,
        reason: suggestForm.reason,
        reason_detail: suggestForm.reason_detail || undefined,
        submitted_by_name: suggestForm.submitted_by_name || undefined,
        submitted_by_email: suggestForm.submitted_by_email || undefined,
      })
      setSubmitted(true)
      setSuggestForm({ name: '', address: '', reason: '', reason_detail: '', notes: '', submitted_by_name: '', submitted_by_email: '' })
    } catch (e: any) { setSuggestErr(e.message || 'Failed to submit') }
    finally { setSubmitting(false) }
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
            style={{ fontSize: '12px', color: t.text.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Sign in
          </button>
        </div>
      </div>
    )
  }

  const { client, visits, placements, orders, events, distOrders, campaigns, funnel, visitTrend } = data
  const accent = client?.color || t.gold
  const logoUrl = client ? clientLogoUrl(client) : null
  const monthStart = startOfMonthMT()

  const monthVisits = visits.filter((v: any) => v.visited_at >= monthStart).length
  const activePlacements = placements.filter((p: any) => !p.lost_at)
  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const pad = isMobile ? '16px' : '32px 40px'

  return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, color: t.text.primary, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
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
        <button
          onClick={() => getSupabase().auth.signOut().then(() => { window.location.href = '/login' })}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '6px', padding: '6px 10px', color: t.text.muted, cursor: 'pointer', fontSize: '12px' }}
        >
          <LogOut size={12} /> {isMobile ? '' : 'Sign out'}
        </button>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: pad }}>

        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '6px' }}>
            {month} Field Report
          </div>
          <div style={{ fontSize: '13px', color: t.text.muted }}>
            Live data from the Barley Bros team · {visits.length} account visits in the last 90 days
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
          <StatTile label="Visits This Month" value={monthVisits} color={accent} icon={<MapPin size={18} />} sub={`${visits.length} in 90 days`} />
          <StatTile label="Active Placements" value={activePlacements.length} color={t.status.success} icon={<Package size={18} />} sub={`${placements.length} total tracked`} />
          <StatTile label="Inquiries Sent" value={funnel.inquiries} color={t.status.info} icon={<Send size={18} />} sub="to distributors" />
          <StatTile label="Events / Tastings" value={events.length} color={t.status.warning} icon={<TrendingUp size={18} />} sub="in last 90 days" />
        </div>

        {distOrders.length > 0 && (
          <div style={{ ...card, marginBottom: '20px', padding: isMobile ? '18px 16px' : '22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
              <div>
                <SectionLabel>Distributor Inquiries — Last 90 Days</SectionLabel>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '-6px' }}>
                  <span style={{ fontSize: '36px', fontWeight: '800', color: t.status.info, letterSpacing: '-0.03em', lineHeight: 1 }}>{funnel.inquiries}</span>
                  <span style={{ fontSize: '13px', color: t.text.muted }}>
                    {funnel.inquiries === 1 ? 'inquiry sent' : 'inquiries sent'} to distributors on your behalf
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '6px', lineHeight: 1.5 }}>
                  Each inquiry represents an account that expressed interest. Fulfillment is between the distributor and supplier — we send the inquiry so there&apos;s a record of the interest we generated.
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowInquiries(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '8px', padding: '8px 14px', color: t.text.secondary, fontSize: '12px', fontWeight: '600', cursor: 'pointer', marginBottom: showInquiries ? '16px' : 0 }}
            >
              {showInquiries ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showInquiries ? 'Hide' : 'View'} full inquiry log ({distOrders.length})
            </button>

            {showInquiries && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : '1fr 1fr auto', gap: '0', borderBottom: `1px solid ${t.border.default}`, paddingBottom: '6px', marginBottom: '4px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Account</div>
                    {!isMobile && <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Distributor Rep</div>}
                    <div style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Date Sent</div>
                  </div>
                  {distOrders.map((o: any, i: number) => (
                    <div key={o.id} style={{
                      display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : '1fr 1fr auto',
                      gap: '0', padding: '9px 0',
                      borderBottom: i < distOrders.length - 1 ? `1px solid ${t.border.subtle}` : 'none',
                      alignItems: 'center',
                    }}>
                      <div style={{ fontSize: '13px', color: t.text.primary, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '12px' }}>
                        {o.deliver_to_name || '—'}
                      </div>
                      {!isMobile && (
                        <div style={{ fontSize: '12px', color: t.text.muted, paddingRight: '12px' }}>
                          {o.distributor_rep_name || '—'}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: t.text.muted, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {formatShortDateMT(o.created_at)}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${t.border.subtle}`, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      const rows = distOrders.map((o: any) => `
                        <tr>
                          <td>${(o.deliver_to_name || '—').replace(/</g, '&lt;')}</td>
                          <td>${(o.distributor_rep_name || '—').replace(/</g, '&lt;')}</td>
                          <td>${formatShortDateMT(o.created_at)}</td>
                        </tr>`).join('')
                      const html = `<!DOCTYPE html><html><head><title>Distributor Inquiries — ${(client?.name || '').replace(/</g, '&lt;')}</title>
<style>
  body{font-family:Arial,sans-serif;padding:48px 56px;color:#111;max-width:760px;margin:0 auto}
  h1{font-size:22px;font-weight:800;margin:0 0 4px}
  .meta{color:#666;font-size:13px;margin-bottom:8px}
  .note{font-size:12px;color:#888;margin-bottom:28px;line-height:1.5;border-left:3px solid #ddd;padding-left:12px}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;padding:8px 12px;border-bottom:2px solid #ccc;font-size:11px;text-transform:uppercase;color:#666;letter-spacing:.06em}
  td{padding:10px 12px;border-bottom:1px solid #eee;font-size:13px}
  tr:last-child td{border-bottom:none}
  @media print{body{padding:24px}}
</style></head><body>
  <h1>Distributor Inquiries — ${(client?.name || '').replace(/</g, '&lt;')}</h1>
  <div class="meta">Generated ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} · Barley Bros Field Report</div>
  <div class="note">Each inquiry below represents an account where interest was expressed and Barley Bros sent a formal request to the distributor. Fulfillment is between the distributor and supplier.</div>
  <table>
    <thead><tr><th>Account</th><th>Distributor Rep</th><th>Date Sent</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`
                      const w = window.open('', '_blank')
                      if (w) { w.document.write(html); w.document.close(); w.print() }
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: accent, backgroundColor: accent + '18', border: `1px solid ${accent}44`, cursor: 'pointer' }}
                  >
                    <FileDown size={13} /> Save as PDF
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {visitTrend.some((w: any) => w.visits > 0) && (
          <div style={{ ...card, marginBottom: '20px', padding: isMobile ? '16px' : '22px 24px' }}>
            <SectionLabel>Field Visit Cadence — Last 12 Weeks</SectionLabel>
            <ResponsiveContainer width="100%" height={isMobile ? 120 : 150}>
              <BarChart data={visitTrend} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={t.border.subtle} vertical={false} />
                <XAxis dataKey="week" tick={{ fill: t.text.muted, fontSize: isMobile ? 8 : 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: t.text.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: t.text.muted }}
                  itemStyle={{ color: accent }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="visits" name="Visits" fill={accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}


        {activePlacements.length > 0 && (
          <div style={{ ...card, marginBottom: '20px', padding: isMobile ? '16px' : '22px 24px' }}>
            <SectionLabel>Active Placement Coverage ({activePlacements.length} accounts)</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px' }}>
              {activePlacements.slice(0, 20).map((p: any) => (
                <div key={p.id} style={{ backgroundColor: t.bg.elevated, borderRadius: '8px', padding: '12px 14px', border: `1px solid ${t.border.subtle}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.accounts?.name}
                      </div>
                      <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>
                        {p.product_name} · {p.placement_type?.replace('_', ' ')}
                      </div>
                    </div>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: accent, flexShrink: 0, marginTop: '3px', boxShadow: `0 0 4px ${accent}88` }} />
                  </div>
                </div>
              ))}
            </div>
            {activePlacements.length > 20 && (
              <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '10px' }}>+{activePlacements.length - 20} more placements</div>
            )}
          </div>
        )}

        {campaigns && campaigns.length > 0 && (
          <div style={{ ...card, marginBottom: '20px', padding: isMobile ? '16px' : '22px 24px' }}>
            <SectionLabel>Active Campaigns ({campaigns.length})</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {campaigns.map((camp: any) => {
                const isExpanded = expandedCampaign === camp.id
                const milestones: any[] = camp.campaign_milestones || []
                const completedMs = milestones.filter((m: any) => m.completed).length
                const expenses: any[] = campaignExpenses[camp.id] || []
                const assets: any[] = campaignAssets[camp.id] || []
                const totalExpenses = expenses.reduce((s: number, exp: any) => s + Number(exp.amount || 0), 0)
                const msPct = milestones.length > 0 ? Math.round((completedMs / milestones.length) * 100) : 0

                const statusColors: Record<string, string> = {
                  active: t.status.success,
                  completed: t.status.info,
                  paused: t.status.warning,
                  draft: t.text.muted,
                }
                const statusColor = statusColors[camp.status] || t.text.muted

                return (
                  <div key={camp.id} style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderRadius: '8px', overflow: 'hidden' }}>
                    <button
                      onClick={async () => {
                        if (isExpanded) {
                          setExpandedCampaign(null)
                        } else {
                          setExpandedCampaign(camp.id)
                          if (!campaignExpenses[camp.id]) {
                            const [exps, asts] = await Promise.all([
                              getCampaignExpenses(camp.id).catch(() => []),
                              getCampaignAssets(camp.id).catch(() => []),
                            ])
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
                        <span style={{ color: t.text.muted, flexShrink: 0, fontSize: '14px' }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: t.text.muted }}>
                        {camp.start_date && <span>{camp.start_date}{camp.end_date ? ` – ${camp.end_date}` : ''}</span>}
                        {milestones.length > 0 && <span>{completedMs} of {milestones.length} milestones complete</span>}
                        {expenses.length > 0 && <span style={{ color: accent }}>Campaign spend: {formatCurrency(totalExpenses)}</span>}
                      </div>
                      {milestones.length > 0 && (
                        <div style={{ height: '4px', backgroundColor: t.border.subtle, borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${msPct}%`, backgroundColor: accent, borderRadius: '2px', transition: 'width 300ms ease' }} />
                        </div>
                      )}
                    </button>

                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${t.border.subtle}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        {/* Milestones */}
                        {milestones.length > 0 && (
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                              Milestones — {completedMs}/{milestones.length} complete
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              {milestones.map((m: any) => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: m.completed ? t.status.success : 'transparent', border: `2px solid ${m.completed ? t.status.success : t.border.hover}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {m.completed && <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#0f0f0d' }} />}
                                  </div>
                                  <span style={{ fontSize: '12px', color: m.completed ? t.text.muted : t.text.primary, textDecoration: m.completed ? 'line-through' : 'none' }}>{m.title}</span>
                                  {m.due_date && <span style={{ fontSize: '11px', color: t.text.muted, marginLeft: 'auto' }}>{m.due_date}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Expense summary */}
                        {expenses.length > 0 && (
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                              Campaign Expenses — Total: {formatCurrency(totalExpenses)}
                            </div>
                            {/* Group by category */}
                            {(() => {
                              const byCategory: Record<string, number> = {}
                              expenses.forEach((exp: any) => {
                                byCategory[exp.category] = (byCategory[exp.category] || 0) + Number(exp.amount || 0)
                              })
                              return (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {Object.entries(byCategory).map(([cat, amt]) => (
                                    <div key={cat} style={{ backgroundColor: t.bg.page, border: `1px solid ${t.border.subtle}`, borderRadius: '6px', padding: '6px 10px' }}>
                                      <div style={{ fontSize: '10px', color: t.text.muted, textTransform: 'capitalize', marginBottom: '2px' }}>{cat}</div>
                                      <div style={{ fontSize: '13px', fontWeight: '700', color: accent }}>{formatCurrency(amt)}</div>
                                    </div>
                                  ))}
                                </div>
                              )
                            })()}
                          </div>
                        )}

                        {/* Assets */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              Campaign Assets ({assets.length})
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: '600', color: accent, backgroundColor: accent + '18', border: `1px solid ${accent}44`, borderRadius: '6px', padding: '4px 10px', cursor: uploadingAsset ? 'wait' : 'pointer' }}>
                              <Upload size={11} /> {uploadingAsset ? 'Uploading…' : 'Upload File'}
                              <input
                                type="file"
                                style={{ display: 'none' }}
                                disabled={uploadingAsset}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  setUploadingAsset(true)
                                  try {
                                    const sb = getSupabase()
                                    const path = `${slug}/${camp.id}/${Date.now()}-${file.name}`
                                    const { error: upErr } = await sb.storage.from('campaign-assets').upload(path, file, { upsert: false })
                                    if (upErr) throw upErr
                                    const { data: urlData } = sb.storage.from('campaign-assets').getPublicUrl(path)
                                    const created = await createCampaignAsset({
                                      campaign_id: camp.id,
                                      client_slug: slug,
                                      name: file.name,
                                      file_url: urlData.publicUrl,
                                      file_type: file.type,
                                      file_size: file.size,
                                      uploaded_by: 'client',
                                    })
                                    setCampaignAssets(prev => ({ ...prev, [camp.id]: [created, ...(prev[camp.id] || [])] }))
                                  } catch (err) { console.error('Upload failed:', err) }
                                  setUploadingAsset(false)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                          </div>
                          {assets.length === 0 ? (
                            <div style={{ fontSize: '12px', color: t.text.muted }}>No assets uploaded yet. Use the button above to share files with your team.</div>
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

        <div style={{ ...card, marginBottom: '20px', padding: isMobile ? '16px' : '22px 24px' }}>
          <SectionLabel>Recent Field Activity ({visits.slice(0, 25).length} of {visits.length})</SectionLabel>
          {visits.length === 0 ? (
            <div style={{ fontSize: '13px', color: t.text.muted }}>No field activity recorded in this period.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {visits.slice(0, 25).map((v: any, i: number) => (
                <div key={v.id} style={{
                  padding: '12px 0',
                  borderBottom: i < Math.min(visits.length, 25) - 1 ? `1px solid ${t.border.subtle}` : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{v.accounts?.name || 'Unknown account'}</div>
                      {v.accounts?.address && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.accounts.address}</div>}
                      {v.notes && <div style={{ fontSize: '12px', color: t.text.secondary, marginTop: '4px', lineHeight: 1.5 }}>{v.notes}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={badge.visitStatus(v.status)}>{v.status}</span>
                      <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '3px' }}>{relativeTimeStr(v.visited_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...card, marginBottom: '20px', padding: isMobile ? '16px' : '22px 24px', border: `1px solid ${accent}33` }}>
          <button
            onClick={() => setShowSuggest(!showSuggest)}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0 }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>Suggest an Account or Contact</div>
              <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '3px' }}>Know a bar, restaurant, or rep we should be talking to? Tell us.</div>
            </div>
            {showSuggest ? <ChevronUp size={16} color={t.text.muted} /> : <ChevronDown size={16} color={t.text.muted} />}
          </button>

          {showSuggest && (
            <div style={{ marginTop: '20px' }}>
              {submitted ? (
                <div style={{ padding: '20px', backgroundColor: t.status.successBg, border: `1px solid ${t.status.success}44`, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                        backgroundColor: suggestType === type ? accent + '22' : 'transparent',
                        color: suggestType === type ? accent : t.text.secondary,
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
                      <input value={suggestForm.name} onChange={e => setSuggestForm(f => ({ ...f, name: e.target.value }))}
                        placeholder={suggestType === 'account' ? 'e.g. The Blind Pig' : 'e.g. Jamie — Bar Manager at X'}
                        style={inputStyle} />
                    </div>
                    {suggestType === 'account' && (
                      <div>
                        <label style={labelStyle}>Address (optional)</label>
                        <input value={suggestForm.address} onChange={e => setSuggestForm(f => ({ ...f, address: e.target.value }))}
                          placeholder="123 Main St, Denver, CO"
                          style={inputStyle} />
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
                    <label style={labelStyle}>Any additional context?</label>
                    <textarea value={suggestForm.notes} onChange={e => setSuggestForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Details that would help our team when they walk in..."
                      rows={3} style={{ ...inputStyle, resize: 'none' as const }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Your name (optional)</label>
                      <input value={suggestForm.submitted_by_name} onChange={e => setSuggestForm(f => ({ ...f, submitted_by_name: e.target.value }))}
                        placeholder="So we know who to follow up with"
                        style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Your email (optional)</label>
                      <input type="email" value={suggestForm.submitted_by_email} onChange={e => setSuggestForm(f => ({ ...f, submitted_by_email: e.target.value }))}
                        placeholder="we'll let you know what happens"
                        style={inputStyle} />
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

        <div style={{ padding: '20px 0', borderTop: `1px solid ${t.border.subtle}`, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 20, height: 20, borderRadius: '4px', background: `linear-gradient(135deg, ${t.gold} 0%, #b8891e 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '800', color: '#0f0f0d', flexShrink: 0 }}>D</div>
          <div style={{ fontSize: '11px', color: t.text.muted }}>Powered by <strong style={{ color: t.text.secondary }}>Barley Bros</strong> · Fort Collins, CO</div>
        </div>

      </main>
    </div>
  )
}
