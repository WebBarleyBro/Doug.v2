'use client'
import { useState, useEffect } from 'react'
import {
  Plus, X, ChevronRight, Megaphone, Users, Check,
  Mail, Edit2, Paperclip, Copy, CheckCheck, Trash2,
  Instagram, Facebook, AtSign, Printer, Globe, Video,
  Image, FileText, Calendar, Layers, DollarSign,
} from 'lucide-react'
import LayoutShell, { useApp, useToast } from '../layout-shell'
import EmptyState from '../components/EmptyState'
import { CardSkeleton } from '../components/LoadingSkeleton'
import {
  getCampaigns, createCampaign, updateCampaign,
  toggleMilestone, createMilestone,
  getEmailList, getClients,
  createDeliverable, updateDeliverable, deleteDeliverable,
  getCampaignExpenses, createCampaignExpense, deleteCampaignExpense,
} from '../lib/data'
import { t, card, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle } from '../lib/theme'
import { formatShortDateMT, formatCurrency, saveDateMT } from '../lib/formatters'
import type { Campaign, Client, DeliverableType, DeliverableChannel, DeliverableStatus } from '../lib/types'

const CAMPAIGN_TYPE_COLORS: Record<string, string> = {
  email: '#4a9eff', social: '#a78bfa', event: '#d4a843',
  in_store: '#3dba78', press: '#e89a2e', other: '#6b6966',
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  active:    { color: t.status.success,  bg: t.status.successBg },
  paused:    { color: t.status.warning,  bg: t.status.warningBg },
  completed: { color: t.text.secondary,  bg: t.status.neutralBg },
  draft:     { color: t.text.muted,      bg: t.status.neutralBg },
}

const CHANNEL_META: Record<DeliverableChannel, { label: string; color: string; icon: any }> = {
  instagram: { label: 'Instagram', color: '#a78bfa', icon: Instagram },
  tiktok:    { label: 'TikTok',    color: '#e05252', icon: Video },
  facebook:  { label: 'Facebook',  color: '#4a9eff', icon: Facebook },
  email:     { label: 'Email',     color: '#3dba78', icon: AtSign },
  print:     { label: 'Print',     color: '#e89a2e', icon: Printer },
  website:   { label: 'Website',   color: '#6b6966', icon: Globe },
  other:     { label: 'Other',     color: t.text.muted, icon: Paperclip },
}

const DELIVERABLE_TYPE_LABELS: Record<DeliverableType, string> = {
  post: 'Post', story: 'Story', reel: 'Reel', email: 'Email',
  graphic: 'Graphic', event: 'Event', video: 'Video', other: 'Other',
}

const DELIVERABLE_STATUS_META: Record<DeliverableStatus, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: t.text.muted },
  in_progress: { label: 'In Progress', color: t.status.warning },
  review:      { label: 'In Review',   color: t.status.info },
  done:        { label: 'Done',        color: t.status.success },
}

function MilestoneProgress({ milestones }: { milestones: any[] }) {
  const total = milestones.length
  const done = milestones.filter(m => m.completed).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '4px', backgroundColor: t.border.default, borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct === 100 ? t.status.success : t.gold, borderRadius: '2px', transition: 'width 400ms ease' }} />
      </div>
      <span className="mono" style={{ fontSize: '10px', color: pct === 100 ? t.status.success : t.text.muted, flexShrink: 0 }}>{done}/{total}</span>
    </div>
  )
}

const BLANK_FORM = {
  name: '', campaign_type: 'social', client_slug: '', start_date: '', end_date: '',
  budget: '', status: 'active', description: '', target_audience: '', key_messages: '', channels: [] as string[],
}

const BLANK_DELIVERABLE = { title: '', deliverable_type: 'post' as DeliverableType, channel: 'instagram' as DeliverableChannel, due_date: '', notes: '' }

const BLANK_EXPENSE = { description: '', category: 'other', amount: '', vendor: '', expense_date: '', notes: '' }

export default function MarketingPage() {
  const { profile } = useApp()
  const toast = useToast()
  const isIntern = profile?.role === 'intern'

  const [isMobile, setIsMobile] = useState(false)
  const [tab, setTab] = useState<'campaigns' | 'email_list'>('campaigns')
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [emailList, setEmailList] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [newMilestone, setNewMilestone] = useState<Record<string, string>>({})
  const [newMilestoneDue, setNewMilestoneDue] = useState<Record<string, string>>({})
  const [addingMilestone, setAddingMilestone] = useState<string | null>(null)
  const [addingDeliverable, setAddingDeliverable] = useState<string | null>(null)
  const [newDeliverable, setNewDeliverable] = useState<Record<string, typeof BLANK_DELIVERABLE>>({})
  const [campaignExpenses, setCampaignExpenses] = useState<Record<string, any[]>>({})
  const [showAddExpense, setShowAddExpense] = useState<string | null>(null)
  const [addExpenseForm, setAddExpenseForm] = useState({ ...BLANK_EXPENSE })
  const [expenseSaving, setExpenseSaving] = useState(false)
  const [emailFilter, setEmailFilter] = useState('all')
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [form, setForm] = useState({ ...BLANK_FORM })

  const reload = async () => {
    const [c, cls] = await Promise.all([getCampaigns(), getClients()])
    setCampaigns(c)
    setClients(cls)
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (tab === 'email_list' && emailList.length === 0) {
      getEmailList().then(setEmailList).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function handleCreateCampaign() {
    if (!form.name) return
    await createCampaign({
      name: form.name,
      campaign_type: form.campaign_type as any,
      client_slug: form.client_slug || undefined,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      budget: form.budget ? parseFloat(form.budget) : undefined,
      status: form.status as any,
      description: form.description || undefined,
      target_audience: form.target_audience || undefined,
      key_messages: form.key_messages || undefined,
      channels: form.channels.length > 0 ? form.channels : undefined,
    })
    await reload()
    setShowCreate(false)
    setForm({ ...BLANK_FORM })
  }

  async function handleSaveEdit() {
    if (!editingCampaign) return
    setEditSaving(true)
    try {
      const displayName = editingCampaign.name || editingCampaign.title || ''
      await updateCampaign(editingCampaign.id, {
        name: displayName || undefined,
        title: displayName || undefined,
        status: editingCampaign.status,
        budget: editingCampaign.budget,
        start_date: editingCampaign.start_date ? saveDateMT(editingCampaign.start_date) : undefined,
        end_date: editingCampaign.end_date ? saveDateMT(editingCampaign.end_date) : undefined,
        description: editingCampaign.description ?? undefined,
        target_audience: editingCampaign.target_audience ?? undefined,
        key_messages: editingCampaign.key_messages ?? undefined,
        channels: editingCampaign.channels?.length > 0 ? editingCampaign.channels : undefined,
        notes: editingCampaign.notes ?? undefined,
      })
      setEditingCampaign(null)
      toast('Campaign saved')
      await reload()
    } catch (err: any) {
      console.error('updateCampaign', err)
      toast(err?.message || 'Failed to save campaign', 'error')
    } finally {
      setEditSaving(false)
    }
  }

  async function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
    if (!campaignExpenses[id]) {
      getCampaignExpenses(id).then(exps => {
        setCampaignExpenses(prev => ({ ...prev, [id]: exps }))
      }).catch(() => setCampaignExpenses(prev => ({ ...prev, [id]: [] })))
    }
  }

  function toggleChannel(ch: string, arr: string[], set: (v: string[]) => void) {
    set(arr.includes(ch) ? arr.filter(c => c !== ch) : [...arr, ch])
  }

  async function handleAddDeliverable(campaignId: string) {
    const d = newDeliverable[campaignId] || { ...BLANK_DELIVERABLE }
    if (!d.title.trim()) return
    await createDeliverable({
      campaign_id: campaignId,
      title: d.title.trim(),
      deliverable_type: d.deliverable_type,
      channel: d.channel,
      due_date: d.due_date || undefined,
      notes: d.notes || undefined,
    })
    setNewDeliverable(m => ({ ...m, [campaignId]: { ...BLANK_DELIVERABLE } }))
    setAddingDeliverable(null)
    await reload()
  }

  async function handleDeliverableStatus(id: string, status: DeliverableStatus) {
    await updateDeliverable(id, { status })
    await reload()
  }

  async function handleDeleteDeliverable(id: string) {
    await deleteDeliverable(id)
    await reload()
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'active').length
  const totalBudget = campaigns.reduce((s, c) => s + Number(c.budget || 0), 0)

  const filteredEmail = emailFilter === 'all' ? emailList : emailList.filter(p => p.client_slug === emailFilter || (p.client_id && clients.find(c => c.slug === emailFilter)?.id === p.client_id))

  function copyEmails() {
    navigator.clipboard.writeText(filteredEmail.filter(p => p.email).map((p: any) => p.email).join(', '))
    setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 2000)
  }

  const tabs = isIntern
    ? [{ key: 'campaigns', label: 'Campaigns', icon: <Megaphone size={14} /> }]
    : [
        { key: 'campaigns', label: 'Campaigns', icon: <Megaphone size={14} /> },
        { key: 'email_list', label: 'Email List', icon: <Users size={14} /> },
      ]

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-h1" style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Marketing</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>
              {activeCampaigns > 0 ? `${activeCampaigns} active campaign${activeCampaigns !== 1 ? 's' : ''}` : 'Campaigns and email contacts'}
              {totalBudget > 0 && ` · ${formatCurrency(totalBudget)} total budget`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {tab === 'campaigns' && !isIntern && (
              <button onClick={() => setShowCreate(true)} style={btnPrimary}><Plus size={16} /> New Campaign</button>
            )}
            {tab === 'email_list' && emailList.length > 0 && (
              <button onClick={copyEmails} style={{ ...btnSecondary, gap: '6px' }}>
                {copiedEmail ? <><CheckCheck size={14} /> Copied!</> : <><Copy size={14} /> Copy Emails</>}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: `1px solid ${t.border.default}` }}>
          {tabs.map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key as any)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: '600',
              color: tab === tb.key ? t.text.primary : t.text.muted,
              borderBottom: `2px solid ${tab === tb.key ? t.gold : 'transparent'}`,
              marginBottom: '-1px', transition: 'color 150ms ease', fontFamily: 'inherit',
            }}>
              {tb.icon}{tb.label}
            </button>
          ))}
        </div>

        {/* ── Campaigns Tab ── */}
        {tab === 'campaigns' && (
          loading ? <CardSkeleton count={4} /> : campaigns.length === 0 ? (
            <EmptyState icon={<Megaphone size={36} />} title="No campaigns yet"
              subtitle="Track social campaigns, events, email blasts, and activations"
              action={!isIntern ? <button onClick={() => setShowCreate(true)} style={btnPrimary}><Plus size={14} /> New Campaign</button> : undefined}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {campaigns.map((c: any) => {
                const typeColor = CAMPAIGN_TYPE_COLORS[c.campaign_type] || t.gold
                const statusStyle = STATUS_COLORS[c.status] || STATUS_COLORS.draft
                const isExpanded = expanded.has(c.id)
                const milestones: any[] = c.campaign_milestones || []
                const deliverables: any[] = c.campaign_deliverables || []
                const budgetNum = c.budget ? Number(c.budget) : 0
                const channelList: string[] = c.channels || []

                return (
                  <div key={c.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>

                    {/* Campaign header row */}
                    <div onClick={() => { toggleExpand(c.id) }} style={{
                      padding: '16px 20px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '14px',
                      borderLeft: `3px solid ${typeColor}`,
                    }}>
                      <div style={{ color: t.text.muted, flexShrink: 0, transition: 'transform 150ms ease', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                        <ChevronRight size={16} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{c.title || c.name}</span>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '6px', backgroundColor: typeColor + '22', color: typeColor, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {c.campaign_type?.replace('_', ' ') ?? 'general'}
                          </span>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '6px', backgroundColor: statusStyle.bg, color: statusStyle.color, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {c.status}
                          </span>
                          {c.clients?.name && <span style={{ fontSize: '11px', color: t.text.muted }}>{c.clients.name}</span>}
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {c.start_date && (
                            <span style={{ fontSize: '11px', color: t.text.muted }}>
                              {formatShortDateMT(c.start_date)}{c.end_date ? ` → ${formatShortDateMT(c.end_date)}` : ''}
                            </span>
                          )}
                          {budgetNum > 0 && (
                            <span className="mono" style={{ fontSize: '11px', color: t.text.muted }}>{formatCurrency(budgetNum)}</span>
                          )}
                          {/* Channel pills */}
                          {channelList.slice(0, 4).map(ch => {
                            const meta = CHANNEL_META[ch as DeliverableChannel] || CHANNEL_META.other
                            const Icon = meta.icon
                            return (
                              <span key={ch} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: meta.color, padding: '1px 6px', borderRadius: '4px', backgroundColor: meta.color + '18', border: `1px solid ${meta.color}33` }}>
                                <Icon size={9} />{meta.label}
                              </span>
                            )
                          })}
                          {deliverables.length > 0 && (
                            <span style={{ fontSize: '11px', color: t.text.muted }}>
                              {deliverables.filter((d: any) => d.status === 'done').length}/{deliverables.length} deliverables done
                            </span>
                          )}
                          {milestones.length > 0 && deliverables.length === 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '100px' }}>
                              <MilestoneProgress milestones={milestones} />
                            </div>
                          )}
                        </div>
                      </div>

                      {!isIntern && (
                        <button onClick={e => { e.stopPropagation(); setEditingCampaign({ ...c, name: c.title || c.name || '' }) }}
                          style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '6px', flexShrink: 0 }}>
                          <Edit2 size={14} />
                        </button>
                      )}
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ padding: '20px', borderTop: `1px solid ${t.border.subtle}` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>

                          {/* Left column: brief + strategy */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                            {c.description && (
                              <div style={{ padding: '14px 16px', backgroundColor: t.bg.page, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
                                <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Campaign Brief</div>
                                <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.6, margin: 0 }}>{c.description}</p>
                              </div>
                            )}

                            {c.target_audience && (
                              <div style={{ padding: '14px 16px', backgroundColor: t.bg.page, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
                                <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Target Audience</div>
                                <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.6, margin: 0 }}>{c.target_audience}</p>
                              </div>
                            )}

                            {c.key_messages && (
                              <div style={{ padding: '14px 16px', backgroundColor: t.bg.page, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
                                <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Key Messages</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {c.key_messages.split('\n').filter(Boolean).map((msg: string, i: number) => (
                                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                      <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: typeColor, flexShrink: 0, marginTop: '6px' }} />
                                      <span style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.5 }}>{msg.replace(/^[-•]\s*/, '')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {c.notes && (
                              <div style={{ padding: '14px 16px', backgroundColor: t.bg.page, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
                                <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Notes</div>
                                <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.6, margin: 0 }}>{c.notes}</p>
                              </div>
                            )}

                            {budgetNum > 0 && (() => {
                              const exps: any[] = campaignExpenses[c.id] || []
                              const totalExp = exps.reduce((s, e) => s + Number(e.amount || 0), 0)
                              return (
                                <div style={{ display: 'flex', gap: '10px' }}>
                                  <div style={{ flex: 1, padding: '12px 14px', backgroundColor: t.bg.page, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
                                    <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Budget</div>
                                    <div className="mono" style={{ fontSize: '18px', fontWeight: '700', color: t.gold }}>{formatCurrency(budgetNum)}</div>
                                  </div>
                                  {totalExp > 0 && (
                                    <div style={{ flex: 1, padding: '12px 14px', backgroundColor: t.bg.page, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
                                      <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Spent</div>
                                      <div className="mono" style={{ fontSize: '18px', fontWeight: '700', color: totalExp > budgetNum ? t.status.danger : t.status.success }}>{formatCurrency(totalExp)}</div>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}

                            {/* Expenses */}
                            {!isIntern && (() => {
                              const exps: any[] = campaignExpenses[c.id] || []
                              const totalExp = exps.reduce((s, e) => s + Number(e.amount || 0), 0)
                              return (
                                <div style={{ padding: '14px 16px', backgroundColor: t.bg.page, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: exps.length > 0 ? '10px' : '0' }}>
                                    <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <DollarSign size={10} /> Expenses{totalExp > 0 && <span style={{ color: t.gold }}>— {formatCurrency(totalExp)}</span>}
                                    </div>
                                    <button
                                      onClick={() => { setShowAddExpense(c.id); setAddExpenseForm({ ...BLANK_EXPENSE }) }}
                                      style={{ fontSize: '11px', fontWeight: '600', color: t.gold, backgroundColor: 'transparent', border: `1px solid ${t.goldBorder}`, borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}
                                    >+ Add</button>
                                  </div>
                                  {exps.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: showAddExpense === c.id ? '10px' : '0' }}>
                                      {exps.map((exp: any) => (
                                        <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', backgroundColor: t.bg.elevated, borderRadius: '6px' }}>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: '12px', color: t.text.primary }}>{exp.description}</span>
                                            <span style={{ fontSize: '10px', color: t.text.muted, marginLeft: '6px' }}>{exp.category}{exp.vendor ? ` · ${exp.vendor}` : ''}{exp.expense_date ? ` · ${formatShortDateMT(exp.expense_date)}` : ''}</span>
                                          </div>
                                          <span className="mono" style={{ fontSize: '12px', fontWeight: '700', color: t.gold, flexShrink: 0 }}>{formatCurrency(Number(exp.amount))}</span>
                                          <button onClick={async () => {
                                            await deleteCampaignExpense(exp.id)
                                            setCampaignExpenses(prev => ({ ...prev, [c.id]: prev[c.id].filter((e: any) => e.id !== exp.id) }))
                                          }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted, padding: '2px', flexShrink: 0, display: 'flex' }}>
                                            <X size={11} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {showAddExpense === c.id && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: exps.length > 0 ? '0' : '0' }}>
                                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '6px' }}>
                                        <div>
                                          <label style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', display: 'block', marginBottom: '3px' }}>Description *</label>
                                          <input value={addExpenseForm.description} onChange={e => setAddExpenseForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Instagram ads" style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} />
                                        </div>
                                        <div>
                                          <label style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', display: 'block', marginBottom: '3px' }}>Amount ($) *</label>
                                          <input type="number" min="0" step="0.01" value={addExpenseForm.amount} onChange={e => setAddExpenseForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} />
                                        </div>
                                        <div>
                                          <label style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', display: 'block', marginBottom: '3px' }}>Category</label>
                                          <select value={addExpenseForm.category} onChange={e => setAddExpenseForm(f => ({ ...f, category: e.target.value }))} style={{ ...selectStyle, fontSize: '12px', padding: '6px 8px' }}>
                                            {['advertising', 'printing', 'events', 'merchandise', 'shipping', 'travel', 'other'].map(cat => (
                                              <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', display: 'block', marginBottom: '3px' }}>Date</label>
                                          <input type="date" value={addExpenseForm.expense_date} onChange={e => setAddExpenseForm(f => ({ ...f, expense_date: e.target.value }))} style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} />
                                        </div>
                                        <div>
                                          <label style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', display: 'block', marginBottom: '3px' }}>Vendor</label>
                                          <input value={addExpenseForm.vendor} onChange={e => setAddExpenseForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Optional" style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} />
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                        <button onClick={() => setShowAddExpense(null)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: '12px', minHeight: 'unset' }}>Cancel</button>
                                        <button
                                          disabled={!addExpenseForm.description.trim() || !addExpenseForm.amount || expenseSaving}
                                          onClick={async () => {
                                            if (!addExpenseForm.description.trim() || !addExpenseForm.amount) return
                                            const client_slug = c.client_slug || ''
                                            setExpenseSaving(true)
                                            try {
                                              const created = await createCampaignExpense({
                                                campaign_id: c.id, client_slug,
                                                description: addExpenseForm.description.trim(),
                                                category: addExpenseForm.category,
                                                amount: parseFloat(addExpenseForm.amount) || 0,
                                                vendor: addExpenseForm.vendor || undefined,
                                                expense_date: addExpenseForm.expense_date || undefined,
                                                notes: addExpenseForm.notes || undefined,
                                                added_by: 'internal',
                                              })
                                              setCampaignExpenses(prev => ({ ...prev, [c.id]: [created, ...(prev[c.id] || [])] }))
                                              setShowAddExpense(null)
                                              toast('Expense added')
                                            } catch (err) { console.error(err); toast('Failed to add expense', 'error') }
                                            setExpenseSaving(false)
                                          }}
                                          style={{ ...btnPrimary, padding: '5px 10px', fontSize: '12px', minHeight: 'unset', opacity: (!addExpenseForm.description.trim() || !addExpenseForm.amount || expenseSaving) ? 0.5 : 1 }}
                                        >
                                          {expenseSaving ? 'Saving…' : 'Add Expense'}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                          </div>

                          {/* Right column: deliverables + milestones */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                            {/* Deliverables */}
                            <div>
                              <div style={{ fontSize: '11px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Deliverables</span>
                                {deliverables.length > 0 && <span className="mono">{deliverables.filter((d: any) => d.status === 'done').length}/{deliverables.length}</span>}
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                                {deliverables.sort((a: any, b: any) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0)).map((d: any) => {
                                  const chMeta = CHANNEL_META[d.channel as DeliverableChannel] || CHANNEL_META.other
                                  const ChIcon = chMeta.icon
                                  const statusMeta = DELIVERABLE_STATUS_META[d.status as DeliverableStatus] || DELIVERABLE_STATUS_META.not_started
                                  return (
                                    <div key={d.id} style={{
                                      display: 'flex', alignItems: 'center', gap: '8px',
                                      padding: '9px 12px', borderRadius: '8px',
                                      backgroundColor: t.bg.page, border: `1px solid ${t.border.subtle}`,
                                      opacity: d.status === 'done' ? 0.6 : 1,
                                    }}>
                                      <ChIcon size={12} color={chMeta.color} style={{ flexShrink: 0 }} />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '13px', color: t.text.secondary, textDecoration: d.status === 'done' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {d.title}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                          <span style={{ fontSize: '10px', color: chMeta.color }}>{chMeta.label}</span>
                                          <span style={{ fontSize: '10px', color: t.text.muted }}>· {DELIVERABLE_TYPE_LABELS[d.deliverable_type as DeliverableType] || d.deliverable_type}</span>
                                          {d.due_date && <span style={{ fontSize: '10px', color: t.text.muted }}>· Due {formatShortDateMT(d.due_date)}</span>}
                                        </div>
                                      </div>
                                      <select
                                        value={d.status}
                                        onChange={e => handleDeliverableStatus(d.id, e.target.value as DeliverableStatus)}
                                        onClick={e => e.stopPropagation()}
                                        style={{ fontSize: '10px', color: statusMeta.color, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
                                      >
                                        {Object.entries(DELIVERABLE_STATUS_META)
                                          .filter(([k]) => !isIntern || k !== 'done')
                                          .map(([k, v]) => (
                                            <option key={k} value={k}>{v.label}{isIntern && k === 'review' ? ' (submit for approval)' : ''}</option>
                                          ))}
                                      </select>
                                      {!isIntern && (
                                        <button onClick={() => handleDeleteDeliverable(d.id)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                                          <Trash2 size={11} />
                                        </button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>

                              {addingDeliverable === c.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: t.bg.elevated, borderRadius: '8px', border: `1px solid ${t.border.hover}` }}>
                                  <input autoFocus type="text"
                                    value={newDeliverable[c.id]?.title || ''}
                                    onChange={e => setNewDeliverable(m => ({ ...m, [c.id]: { ...(m[c.id] || BLANK_DELIVERABLE), title: e.target.value } }))}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddDeliverable(c.id); if (e.key === 'Escape') setAddingDeliverable(null) }}
                                    placeholder="Deliverable title..."
                                    style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}
                                  />
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                                    <select value={newDeliverable[c.id]?.channel || 'instagram'}
                                      onChange={e => setNewDeliverable(m => ({ ...m, [c.id]: { ...(m[c.id] || BLANK_DELIVERABLE), channel: e.target.value as DeliverableChannel } }))}
                                      style={{ ...selectStyle, fontSize: '11px', padding: '5px 8px' }}>
                                      {Object.entries(CHANNEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                    </select>
                                    <select value={newDeliverable[c.id]?.deliverable_type || 'post'}
                                      onChange={e => setNewDeliverable(m => ({ ...m, [c.id]: { ...(m[c.id] || BLANK_DELIVERABLE), deliverable_type: e.target.value as DeliverableType } }))}
                                      style={{ ...selectStyle, fontSize: '11px', padding: '5px 8px' }}>
                                      {Object.entries(DELIVERABLE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                    <input type="date"
                                      value={newDeliverable[c.id]?.due_date || ''}
                                      onChange={e => setNewDeliverable(m => ({ ...m, [c.id]: { ...(m[c.id] || BLANK_DELIVERABLE), due_date: e.target.value } }))}
                                      style={{ ...inputStyle, fontSize: '11px', padding: '5px 8px' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                    <button onClick={() => setAddingDeliverable(null)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                                    <button onClick={() => handleAddDeliverable(c.id)} style={{ ...btnPrimary, padding: '5px 12px', fontSize: '12px' }}>Add</button>
                                  </div>
                                </div>
                              ) : !isIntern ? (
                                <button onClick={() => setAddingDeliverable(c.id)}
                                  style={{ fontSize: '12px', color: t.gold, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0' }}>
                                  <Plus size={12} /> Add deliverable
                                </button>
                              ) : null}
                            </div>

                            {/* Milestones */}
                            {(milestones.length > 0 || addingMilestone === c.id) && (
                              <div>
                                <div style={{ fontSize: '11px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span>Milestones</span>
                                  {milestones.length > 0 && <span className="mono">{milestones.filter(m => m.completed).length}/{milestones.length}</span>}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '6px' }}>
                                  {milestones.sort((a: any, b: any) => Number(a.completed) - Number(b.completed)).map((m: any) => (
                                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <button onClick={() => toggleMilestone(m.id, !m.completed).then(reload)} style={{
                                        width: 16, height: 16, borderRadius: '3px', flexShrink: 0,
                                        border: `1.5px solid ${m.completed ? t.status.success : t.border.hover}`,
                                        backgroundColor: m.completed ? t.status.success : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                      }}>
                                        {m.completed && <Check size={9} color="#0c0c0a" strokeWidth={3} />}
                                      </button>
                                      <span style={{ fontSize: '13px', flex: 1, color: m.completed ? t.text.muted : t.text.secondary, textDecoration: m.completed ? 'line-through' : 'none' }}>{m.title}</span>
                                      {m.due_date && !m.completed && (
                                        <span style={{ fontSize: '10px', color: t.text.muted, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{formatShortDateMT(m.due_date)}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {addingMilestone === c.id ? (
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <input autoFocus type="text"
                                      value={newMilestone[c.id] || ''}
                                      onChange={e => setNewMilestone(m => ({ ...m, [c.id]: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter') { createMilestone(c.id, newMilestone[c.id] || '', newMilestoneDue[c.id] || undefined).then(() => { setNewMilestone(m => ({ ...m, [c.id]: '' })); setNewMilestoneDue(m => ({ ...m, [c.id]: '' })); setAddingMilestone(null); reload() }) } if (e.key === 'Escape') setAddingMilestone(null) }}
                                      placeholder="Milestone title..."
                                      style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px', flex: 1, minWidth: '140px' }}
                                    />
                                    <input type="date" value={newMilestoneDue[c.id] || ''}
                                      onChange={e => setNewMilestoneDue(m => ({ ...m, [c.id]: e.target.value }))}
                                      style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px', width: '130px' }} />
                                    <button onClick={() => { createMilestone(c.id, newMilestone[c.id] || '', newMilestoneDue[c.id] || undefined).then(() => { setNewMilestone(m => ({ ...m, [c.id]: '' })); setNewMilestoneDue(m => ({ ...m, [c.id]: '' })); setAddingMilestone(null); reload() }) }} style={{ ...btnPrimary, padding: '6px 12px', fontSize: '12px' }}>Add</button>
                                    <button onClick={() => setAddingMilestone(null)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={14} /></button>
                                  </div>
                                ) : (
                                  !isIntern && <button onClick={() => setAddingMilestone(c.id)}
                                    style={{ fontSize: '12px', color: t.gold, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0' }}>
                                    <Plus size={12} /> Add milestone
                                  </button>
                                )}
                              </div>
                            )}
                            {milestones.length === 0 && addingMilestone !== c.id && !isIntern && deliverables.length > 0 && (
                              <button onClick={() => setAddingMilestone(c.id)}
                                style={{ fontSize: '12px', color: t.text.muted, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0' }}>
                                <Plus size={12} /> Add milestone
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ── Email List Tab ── */}
        {tab === 'email_list' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: t.text.muted }}>
                  <span className="mono" style={{ color: t.text.primary, fontWeight: '700' }}>{filteredEmail.length}</span> contacts
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['all', ...clients.map(c => c.slug)].map(slug => {
                    const label = slug === 'all' ? 'All Brands' : clients.find(c => c.slug === slug)?.name || slug
                    const color = slug === 'all' ? t.gold : clients.find(c => c.slug === slug)?.color || t.gold
                    return (
                      <button key={slug} onClick={() => setEmailFilter(slug)} style={{
                        padding: '5px 12px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer',
                        border: `1px solid ${emailFilter === slug ? color : t.border.default}`,
                        backgroundColor: emailFilter === slug ? color + '20' : 'transparent',
                        color: emailFilter === slug ? color : t.text.muted,
                        fontWeight: emailFilter === slug ? '600' : '400', fontFamily: 'inherit',
                      }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {emailList.length === 0 ? (
              <EmptyState icon={<Mail size={36} />} title="No email list yet"
                subtitle="Contacts opt in during tasting events via the consumer capture form" />
            ) : (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 100px 80px', padding: '8px 16px', borderBottom: `1px solid ${t.border.default}`, minWidth: '420px' }}>
                  {['Name', 'Email', 'Brand Event', 'Date'].map(h => (
                    <span key={h} style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
                  ))}
                </div>
                {filteredEmail.map((person: any, i: number) => (
                  <div key={person.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1.2fr 100px 80px',
                    padding: '10px 16px', alignItems: 'center',
                    borderBottom: i < filteredEmail.length - 1 ? `1px solid ${t.border.subtle}` : 'none',
                    minWidth: '420px',
                  }}>
                    <span style={{ fontSize: '13px', color: t.text.primary }}>{person.name || person.first_name || '—'}</span>
                    <a href={`mailto:${person.email}`} style={{ fontSize: '12px', color: t.status.info, textDecoration: 'none', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {person.email || '—'}
                    </a>
                    <span style={{ fontSize: '11px', color: t.text.muted }}>{person.client_slug || clients.find(c => c.id === person.client_id)?.name || '—'}</span>
                    <span className="mono" style={{ fontSize: '11px', color: t.text.muted }}>{formatShortDateMT(person.captured_at)}</span>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Create Campaign Modal ── */}
        {showCreate && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary }}>New Campaign</h3>
                <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Campaign Name *</label>
                    <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Spring Activation 2026" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={selectStyle}>
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Type</label>
                    <select value={form.campaign_type} onChange={e => setForm(f => ({ ...f, campaign_type: e.target.value }))} style={selectStyle}>
                      <option value="social">Social</option>
                      <option value="email">Email</option>
                      <option value="event">Event</option>
                      <option value="in_store">In-Store</option>
                      <option value="press">Press / PR</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Brand</label>
                    <select value={form.client_slug} onChange={e => setForm(f => ({ ...f, client_slug: e.target.value }))} style={selectStyle}>
                      <option value="">All brands</option>
                      {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date</label>
                    <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Channels</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {Object.entries(CHANNEL_META).map(([key, meta]) => {
                      const Icon = meta.icon
                      const active = form.channels.includes(key)
                      return (
                        <button key={key} type="button" onClick={() => toggleChannel(key, form.channels, ch => setForm(f => ({ ...f, channels: ch })))} style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '5px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit',
                          border: `1px solid ${active ? meta.color : t.border.default}`,
                          backgroundColor: active ? meta.color + '20' : 'transparent',
                          color: active ? meta.color : t.text.muted,
                        }}>
                          <Icon size={11} />{meta.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Campaign Brief</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
                    placeholder="What is this campaign about? Goals, context, strategy..." style={{ ...inputStyle, resize: 'none' }} />
                </div>
                <div>
                  <label style={labelStyle}>Target Audience</label>
                  <input type="text" value={form.target_audience} onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))}
                    placeholder="21-35 year olds, cocktail enthusiasts, on-premise accounts..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Key Messages</label>
                  <textarea value={form.key_messages} onChange={e => setForm(f => ({ ...f, key_messages: e.target.value }))} rows={3}
                    placeholder={'One per line:\n- Locally distilled, nationally recognized\n- Perfect for craft cocktails'} style={{ ...inputStyle, resize: 'none', fontSize: '12px' }} />
                </div>
                <div>
                  <label style={labelStyle}>Budget ($)</label>
                  <input type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="0" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setShowCreate(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleCreateCampaign} disabled={!form.name} style={{ ...btnPrimary, opacity: !form.name ? 0.6 : 1 }}>Create Campaign</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit Campaign Modal ── */}
        {editingCampaign && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary }}>Edit Campaign</h3>
                <button onClick={() => setEditingCampaign(null)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Campaign Name</label>
                    <input type="text" value={editingCampaign.name || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, name: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select value={editingCampaign.status} onChange={e => setEditingCampaign((c: any) => ({ ...c, status: e.target.value }))} style={selectStyle}>
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="date"
                      value={editingCampaign.start_date ? new Date(editingCampaign.start_date.length === 10 ? editingCampaign.start_date + 'T12:00:00Z' : editingCampaign.start_date + (editingCampaign.start_date.endsWith('Z') || editingCampaign.start_date.includes('+') ? '' : 'Z')).toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) : ''}
                      onChange={e => setEditingCampaign((c: any) => ({ ...c, start_date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date</label>
                    <input type="date"
                      value={editingCampaign.end_date ? new Date(editingCampaign.end_date.length === 10 ? editingCampaign.end_date + 'T12:00:00Z' : editingCampaign.end_date + (editingCampaign.end_date.endsWith('Z') || editingCampaign.end_date.includes('+') ? '' : 'Z')).toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) : ''}
                      onChange={e => setEditingCampaign((c: any) => ({ ...c, end_date: e.target.value }))} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Channels</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {Object.entries(CHANNEL_META).map(([key, meta]) => {
                      const Icon = meta.icon
                      const active = (editingCampaign.channels || []).includes(key)
                      return (
                        <button key={key} type="button" onClick={() => toggleChannel(key, editingCampaign.channels || [], ch => setEditingCampaign((c: any) => ({ ...c, channels: ch })))} style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '5px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit',
                          border: `1px solid ${active ? meta.color : t.border.default}`,
                          backgroundColor: active ? meta.color + '20' : 'transparent',
                          color: active ? meta.color : t.text.muted,
                        }}>
                          <Icon size={11} />{meta.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Campaign Brief</label>
                  <textarea value={editingCampaign.description || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, description: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'none' }} />
                </div>
                <div>
                  <label style={labelStyle}>Target Audience</label>
                  <input type="text" value={editingCampaign.target_audience || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, target_audience: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Key Messages</label>
                  <textarea value={editingCampaign.key_messages || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, key_messages: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'none', fontSize: '12px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Budget ($)</label>
                    <input type="number" value={editingCampaign.budget || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, budget: e.target.value ? parseFloat(e.target.value) : undefined }))} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={editingCampaign.notes || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setEditingCampaign(null)} style={btnSecondary} disabled={editSaving}>Cancel</button>
                <button onClick={handleSaveEdit} style={{ ...btnPrimary, opacity: editSaving ? 0.7 : 1 }} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
