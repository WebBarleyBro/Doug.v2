'use client'
import { useState, useEffect } from 'react'
import {
  Plus, X, ChevronRight, Megaphone, Target, Users, Check,
  Mail, Edit2, Link2, Paperclip, BarChart2, DollarSign,
  Send, Eye, MousePointer, Copy, CheckCheck, Trash2,
} from 'lucide-react'
import LayoutShell from '../layout-shell'
import EmptyState from '../components/EmptyState'
import { CardSkeleton } from '../components/LoadingSkeleton'
import {
  getCampaigns, createCampaign, updateCampaign, getAgencyPipeline, upsertPipelineStage,
  toggleMilestone, createMilestone, getEmailList, getClients,
} from '../lib/data'
import { t, card, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle, badge } from '../lib/theme'
import { formatShortDateMT, formatCurrency, saveDateMT } from '../lib/formatters'
import { PIPELINE_STAGES } from '../lib/constants'
import type { Campaign, Client } from '../lib/types'

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

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '10px 14px', backgroundColor: t.bg.page, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
      <span style={{ fontSize: '10px', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600' }}>{label}</span>
      <span className="mono" style={{ fontSize: '16px', fontWeight: '700', color: color || t.text.primary }}>{value}</span>
    </div>
  )
}

const BLANK_FORM = {
  name: '', campaign_type: 'email', client_slug: '', start_date: '', end_date: '',
  budget: '', spend: '', goal: '', target_reach: '', assets: '', status: 'active',
  notes: '',
}

export default function MarketingPage() {
  const [tab, setTab] = useState<'campaigns' | 'pipeline' | 'email_list'>('campaigns')
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [pipeline, setPipeline] = useState<any[]>([])
  const [emailList, setEmailList] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [newMilestone, setNewMilestone] = useState<Record<string, string>>({})
  const [newMilestoneDue, setNewMilestoneDue] = useState<Record<string, string>>({})
  const [addingMilestone, setAddingMilestone] = useState<string | null>(null)
  const [emailFilter, setEmailFilter] = useState('all')
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [form, setForm] = useState({ ...BLANK_FORM })

  const reload = async () => {
    const [c, p, cls] = await Promise.all([getCampaigns(), getAgencyPipeline(), getClients()])
    setCampaigns(c)
    setPipeline(p)
    setClients(cls)
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  useEffect(() => {
    if (tab === 'email_list' && emailList.length === 0) {
      getEmailList().then(setEmailList).catch(() => {})
    }
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
      notes: [
        form.goal ? `GOAL: ${form.goal}` : '',
        form.target_reach ? `TARGET_REACH: ${form.target_reach}` : '',
        form.spend ? `SPEND: ${form.spend}` : '',
        form.assets ? `ASSETS: ${form.assets}` : '',
        form.notes ? form.notes : '',
      ].filter(Boolean).join('\n') || undefined,
    })
    await reload()
    setShowCreate(false)
    setForm({ ...BLANK_FORM })
  }

  async function handleSaveEdit() {
    if (!editingCampaign) return
    await updateCampaign(editingCampaign.id, {
      name: editingCampaign.name,
      status: editingCampaign.status,
      budget: editingCampaign.budget,
      start_date: editingCampaign.start_date ? saveDateMT(editingCampaign.start_date) : undefined,
      end_date: editingCampaign.end_date ? saveDateMT(editingCampaign.end_date) : undefined,
      notes: [
        editingCampaign._goal ? `GOAL: ${editingCampaign._goal}` : '',
        editingCampaign._target_reach ? `TARGET_REACH: ${editingCampaign._target_reach}` : '',
        editingCampaign._spend ? `SPEND: ${editingCampaign._spend}` : '',
        editingCampaign._assets ? `ASSETS: ${editingCampaign._assets}` : '',
        editingCampaign._notes ? editingCampaign._notes : '',
      ].filter(Boolean).join('\n') || undefined,
    })
    setEditingCampaign(null)
    await reload()
  }

  async function handleToggleMilestone(milestoneId: string, completed: boolean) {
    await toggleMilestone(milestoneId, !completed)
    await reload()
  }

  async function handleAddMilestone(campaignId: string) {
    const title = newMilestone[campaignId]?.trim()
    if (!title) return
    await createMilestone(campaignId, title, newMilestoneDue[campaignId] || undefined)
    setNewMilestone(m => ({ ...m, [campaignId]: '' }))
    setNewMilestoneDue(m => ({ ...m, [campaignId]: '' }))
    setAddingMilestone(null)
    await reload()
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleDrop(e: React.DragEvent, newStage: string) {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('pipeline_id')
    if (!id) return
    await upsertPipelineStage(id, newStage)
    const p = await getAgencyPipeline()
    setPipeline(p)
  }

  // Parse stored notes for structured fields
  function parseCampaignNotes(raw: string | undefined) {
    const lines = (raw || '').split('\n')
    const goal = lines.find(l => l.startsWith('GOAL:'))?.replace('GOAL:', '').trim() || ''
    const targetReach = lines.find(l => l.startsWith('TARGET_REACH:'))?.replace('TARGET_REACH:', '').trim() || ''
    const spend = lines.find(l => l.startsWith('SPEND:'))?.replace('SPEND:', '').trim() || ''
    const assets = lines.find(l => l.startsWith('ASSETS:'))?.replace('ASSETS:', '').trim() || ''
    const notes = lines.filter(l => !l.startsWith('GOAL:') && !l.startsWith('TARGET_REACH:') && !l.startsWith('SPEND:') && !l.startsWith('ASSETS:')).join('\n').trim()
    return { goal, targetReach, spend, assets, notes }
  }

  function openEdit(c: any) {
    const parsed = parseCampaignNotes(c.notes)
    setEditingCampaign({
      ...c,
      _goal: parsed.goal,
      _target_reach: parsed.targetReach,
      _spend: parsed.spend,
      _assets: parsed.assets,
      _notes: parsed.notes,
    })
  }

  const grouped = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = pipeline.filter(p => p.stage === stage)
    return acc
  }, {} as Record<string, any[]>)

  const activeCampaigns = campaigns.filter(c => c.status === 'active').length
  const totalBudget = campaigns.reduce((s, c) => s + Number(c.budget || 0), 0)

  const filteredEmail = emailFilter === 'all' ? emailList : emailList.filter(p => {
    const client = clients.find(c => c.slug === emailFilter)
    return client && (p.client_slug === emailFilter || p.event_client_slug === emailFilter)
  })

  function copyEmails() {
    const emails = filteredEmail.filter(p => p.email).map((p: any) => p.email).join(', ')
    navigator.clipboard.writeText(emails)
    setCopiedEmail(true)
    setTimeout(() => setCopiedEmail(false), 2000)
  }

  const tabs = [
    { key: 'campaigns', label: 'Campaigns', icon: <Megaphone size={14} /> },
    { key: 'pipeline', label: 'Agency Pipeline', icon: <Target size={14} /> },
    { key: 'email_list', label: 'Email List', icon: <Users size={14} /> },
  ]

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Marketing</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>
              {activeCampaigns > 0 ? `${activeCampaigns} active campaign${activeCampaigns !== 1 ? 's' : ''}` : 'Campaigns, pipeline, and email contacts'}
              {totalBudget > 0 && ` · ${formatCurrency(totalBudget)} total budget`}
            </p>
          </div>
          {tab === 'campaigns' && (
            <button onClick={() => setShowCreate(true)} style={btnPrimary}><Plus size={16} /> New Campaign</button>
          )}
          {tab === 'email_list' && emailList.length > 0 && (
            <button onClick={copyEmails} style={{ ...btnSecondary, gap: '6px' }}>
              {copiedEmail ? <><CheckCheck size={14} /> Copied!</> : <><Copy size={14} /> Copy Emails</>}
            </button>
          )}
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
              marginBottom: '-1px', transition: 'color 150ms ease',
            }}>
              {tb.icon}{tb.label}
            </button>
          ))}
        </div>

        {/* ── Campaigns Tab ── */}
        {tab === 'campaigns' && (
          loading ? <CardSkeleton count={4} /> : campaigns.length === 0 ? (
            <EmptyState icon={<Megaphone size={36} />} title="No campaigns yet"
              subtitle="Track email blasts, events, social pushes, and in-store activations"
              action={<button onClick={() => setShowCreate(true)} style={btnPrimary}><Plus size={14} /> New Campaign</button>}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {campaigns.map((c: any) => {
                const typeColor = CAMPAIGN_TYPE_COLORS[c.campaign_type] || t.gold
                const statusStyle = STATUS_COLORS[c.status] || STATUS_COLORS.draft
                const isExpanded = expanded.has(c.id)
                const milestones: any[] = c.campaign_milestones || []
                const completedMs = milestones.filter((m: any) => m.completed).length
                const parsed = parseCampaignNotes(c.notes)
                const spendNum = parsed.spend ? parseFloat(parsed.spend) : 0
                const budgetNum = c.budget ? Number(c.budget) : 0
                const spendPct = budgetNum > 0 ? Math.min(100, Math.round((spendNum / budgetNum) * 100)) : 0
                const assetLinks = parsed.assets ? parsed.assets.split('\n').filter(Boolean) : []

                return (
                  <div key={c.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>

                    {/* Campaign header */}
                    <div
                      onClick={() => toggleExpand(c.id)}
                      style={{
                        padding: '16px 20px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '14px',
                        borderLeft: `3px solid ${typeColor}`,
                      }}
                    >
                      <div style={{ color: t.text.muted, flexShrink: 0, transition: 'transform 150ms ease', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                        <ChevronRight size={16} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{c.name}</span>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '6px', backgroundColor: typeColor + '22', color: typeColor, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {c.campaign_type?.replace('_', ' ') ?? 'general'}
                          </span>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '6px', backgroundColor: statusStyle.bg, color: statusStyle.color, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {c.status}
                          </span>
                          {c.clients?.name && (
                            <span style={{ fontSize: '11px', color: t.text.muted }}>{c.clients.name}</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {c.start_date && (
                            <span style={{ fontSize: '11px', color: t.text.muted }}>
                              {formatShortDateMT(c.start_date)}{c.end_date ? ` → ${formatShortDateMT(c.end_date)}` : ''}
                            </span>
                          )}
                          {budgetNum > 0 && (
                            <span className="mono" style={{ fontSize: '11px', color: t.text.muted }}>
                              {spendNum > 0 ? `${formatCurrency(spendNum)} / ` : ''}{formatCurrency(budgetNum)}
                              {spendNum > 0 && <span style={{ color: spendPct > 80 ? t.status.danger : t.text.muted }}>{' '}({spendPct}%)</span>}
                            </span>
                          )}
                          {milestones.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '100px' }}>
                              <MilestoneProgress milestones={milestones} />
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={e => { e.stopPropagation(); openEdit(c) }}
                        style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '6px', flexShrink: 0 }}
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ padding: '0 20px 20px 20px', borderTop: `1px solid ${t.border.subtle}` }}>

                        {/* Stats row */}
                        {(parsed.goal || budgetNum > 0 || parsed.targetReach) && (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px', marginBottom: '16px' }}>
                            {parsed.goal && (
                              <div style={{ flex: 1, minWidth: '200px', padding: '10px 14px', backgroundColor: t.bg.page, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
                                <div style={{ fontSize: '10px', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '4px' }}>Objective</div>
                                <div style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.4 }}>{parsed.goal}</div>
                              </div>
                            )}
                            {budgetNum > 0 && (
                              <StatPill label="Budget" value={formatCurrency(budgetNum)} color={t.gold} />
                            )}
                            {spendNum > 0 && (
                              <StatPill label="Spent" value={formatCurrency(spendNum)} color={spendPct > 80 ? t.status.danger : t.status.warning} />
                            )}
                            {parsed.targetReach && (
                              <StatPill label="Target Reach" value={Number(parsed.targetReach).toLocaleString()} color={t.status.info} />
                            )}
                          </div>
                        )}

                        {/* Budget spend bar */}
                        {budgetNum > 0 && spendNum > 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Budget Utilization</span>
                              <span className="mono" style={{ fontSize: '10px', color: spendPct > 80 ? t.status.danger : t.text.muted }}>{spendPct}%</span>
                            </div>
                            <div style={{ height: '5px', backgroundColor: t.border.default, borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${spendPct}%`, height: '100%', backgroundColor: spendPct > 80 ? t.status.danger : t.gold, borderRadius: '3px', transition: 'width 400ms ease' }} />
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        {parsed.notes && (
                          <p style={{ fontSize: '13px', color: t.text.secondary, marginBottom: '16px', lineHeight: 1.6, padding: '12px', backgroundColor: t.bg.page, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
                            {parsed.notes}
                          </p>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: assetLinks.length > 0 ? '1fr 1fr' : '1fr', gap: '16px' }}>

                          {/* Milestones */}
                          <div>
                            <div style={{ fontSize: '11px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span>Tasks / Milestones</span>
                              {milestones.length > 0 && <span className="mono">{completedMs}/{milestones.length}</span>}
                            </div>

                            {milestones.length === 0 && addingMilestone !== c.id && (
                              <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '8px' }}>No milestones yet</div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                              {milestones.sort((a: any, b: any) => Number(a.completed) - Number(b.completed)).map((m: any) => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <button
                                    onClick={() => handleToggleMilestone(m.id, m.completed)}
                                    style={{
                                      width: 16, height: 16, borderRadius: '3px', flexShrink: 0,
                                      border: `1.5px solid ${m.completed ? t.status.success : t.border.hover}`,
                                      backgroundColor: m.completed ? t.status.success : 'transparent',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                    }}
                                  >
                                    {m.completed && <Check size={9} color="#0c0c0a" strokeWidth={3} />}
                                  </button>
                                  <span style={{
                                    fontSize: '13px', flex: 1, color: m.completed ? t.text.muted : t.text.secondary,
                                    textDecoration: m.completed ? 'line-through' : 'none',
                                  }}>
                                    {m.title}
                                  </span>
                                  {m.due_date && !m.completed && (
                                    <span style={{ fontSize: '10px', color: t.text.muted, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                                      {formatShortDateMT(m.due_date)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>

                            {addingMilestone === c.id ? (
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                  autoFocus
                                  type="text"
                                  value={newMilestone[c.id] || ''}
                                  onChange={e => setNewMilestone(m => ({ ...m, [c.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') handleAddMilestone(c.id); if (e.key === 'Escape') setAddingMilestone(null) }}
                                  placeholder="Milestone title..."
                                  style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px', flex: 1, minWidth: '160px' }}
                                />
                                <input
                                  type="date"
                                  value={newMilestoneDue[c.id] || ''}
                                  onChange={e => setNewMilestoneDue(m => ({ ...m, [c.id]: e.target.value }))}
                                  style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px', width: '130px' }}
                                  placeholder="Due date"
                                />
                                <button onClick={() => handleAddMilestone(c.id)} style={{ ...btnPrimary, padding: '6px 12px', fontSize: '12px' }}>Add</button>
                                <button onClick={() => setAddingMilestone(null)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={14} /></button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAddingMilestone(c.id)}
                                style={{ fontSize: '12px', color: t.gold, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0' }}
                              >
                                <Plus size={12} /> Add milestone
                              </button>
                            )}
                          </div>

                          {/* Assets */}
                          {assetLinks.length > 0 && (
                            <div>
                              <div style={{ fontSize: '11px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                                Assets & Links
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {assetLinks.map((link, i) => {
                                  const [label, url] = link.includes('|') ? link.split('|').map(s => s.trim()) : [link, link]
                                  const isUrl = url.startsWith('http')
                                  return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', backgroundColor: t.bg.page, borderRadius: '6px', border: `1px solid ${t.border.subtle}` }}>
                                      <Paperclip size={12} color={t.text.muted} style={{ flexShrink: 0 }} />
                                      {isUrl ? (
                                        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: t.status.info, textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {label !== url ? label : new URL(url).hostname}
                                        </a>
                                      ) : (
                                        <span style={{ fontSize: '12px', color: t.text.secondary, flex: 1 }}>{label}</span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ── Pipeline Tab ── */}
        {tab === 'pipeline' && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(PIPELINE_STAGES.length, 4)}, 1fr)`, gap: '10px', alignItems: 'start' }}>
            {PIPELINE_STAGES.map(stage => (
              <div key={stage}
                onDragOver={e => { e.preventDefault(); setDragOver(stage) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDrop(e, stage)}
                style={{
                  backgroundColor: dragOver === stage ? t.bg.cardHover : t.bg.elevated,
                  border: `1px solid ${dragOver === stage ? t.border.gold : t.border.default}`,
                  borderRadius: '8px', padding: '12px', minHeight: '160px', transition: 'all 150ms ease',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {stage.replace(/_/g, ' ')}
                  </span>
                  <span className="mono" style={{ fontSize: '10px', color: t.text.muted, backgroundColor: t.bg.page, padding: '1px 6px', borderRadius: '6px' }}>
                    {grouped[stage]?.length || 0}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(grouped[stage] || []).map((item: any) => (
                    <div key={item.id} draggable
                      onDragStart={e => e.dataTransfer.setData('pipeline_id', item.id)}
                      style={{
                        backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`,
                        borderRadius: '6px', padding: '10px 12px', cursor: 'grab',
                      }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{item.brand_name || item.prospect_name}</div>
                      {item.contact_name && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{item.contact_name}</div>}
                      {item.estimated_value && (
                        <div className="mono" style={{ fontSize: '11px', color: t.gold, marginTop: '4px' }}>${Number(item.estimated_value).toLocaleString()}/yr</div>
                      )}
                      {item.next_action && (
                        <div style={{ fontSize: '10px', color: t.text.secondary, marginTop: '4px' }}>→ {item.next_action}</div>
                      )}
                    </div>
                  ))}
                  {!(grouped[stage]?.length) && (
                    <div style={{ fontSize: '11px', color: t.border.hover, textAlign: 'center', padding: '16px 0' }}>drop here</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Email List Tab ── */}
        {tab === 'email_list' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: t.text.muted }}>
                  <span className="mono" style={{ color: t.text.primary, fontWeight: '700' }}>{filteredEmail.length}</span> contacts
                </span>
                {/* Brand filter */}
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
                        fontWeight: emailFilter === slug ? '600' : '400',
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
                subtitle="Contacts opt in during tasting events via the consumer capture form"
              />
            ) : (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 100px 80px', padding: '8px 16px', borderBottom: `1px solid ${t.border.default}` }}>
                  {['Name', 'Email', 'Brand Event', 'Date'].map(h => (
                    <span key={h} style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
                  ))}
                </div>
                {filteredEmail.map((person: any, i: number) => (
                  <div key={person.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1.2fr 100px 80px',
                    padding: '10px 16px', alignItems: 'center',
                    borderBottom: i < filteredEmail.length - 1 ? `1px solid ${t.border.subtle}` : 'none',
                  }}>
                    <span style={{ fontSize: '13px', color: t.text.primary }}>{person.name || person.first_name || '—'}</span>
                    <a href={`mailto:${person.email}`} style={{ fontSize: '12px', color: t.status.info, textDecoration: 'none', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {person.email || '—'}
                    </a>
                    <span style={{ fontSize: '11px', color: t.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {person.tasting_events?.client_slug || person.client_slug || '—'}
                    </span>
                    <span className="mono" style={{ fontSize: '11px', color: t.text.muted }}>{formatShortDateMT(person.captured_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Create Campaign Modal ── */}
        {showCreate && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary }}>New Campaign</h3>
                <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Campaign Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Q2 Spring Activation..." style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Type</label>
                    <select value={form.campaign_type} onChange={e => setForm(f => ({ ...f, campaign_type: e.target.value }))} style={selectStyle}>
                      <option value="email">Email</option>
                      <option value="social">Social</option>
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
                <div>
                  <label style={labelStyle}>Objective / Goal</label>
                  <input type="text" value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} placeholder="What does success look like?" style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date</label>
                    <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Budget ($)</label>
                    <input type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="0" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Spend to Date ($)</label>
                    <input type="number" value={form.spend} onChange={e => setForm(f => ({ ...f, spend: e.target.value }))} placeholder="0" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Target Reach</label>
                    <input type="number" value={form.target_reach} onChange={e => setForm(f => ({ ...f, target_reach: e.target.value }))} placeholder="# people" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Assets / Links</label>
                  <textarea value={form.assets} onChange={e => setForm(f => ({ ...f, assets: e.target.value }))} rows={3} placeholder={'One per line. Use "Label | URL" format:\nSell Sheet | https://drive.google.com/...\nEmail Template | https://...'} style={{ ...inputStyle, resize: 'none', fontSize: '12px' }} />
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Strategy, audience, key messages..." style={{ ...inputStyle, resize: 'none' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary }}>Edit Campaign</h3>
                <button onClick={() => setEditingCampaign(null)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Campaign Name</label>
                  <input type="text" value={editingCampaign.name} onChange={e => setEditingCampaign((c: any) => ({ ...c, name: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Objective / Goal</label>
                  <input type="text" value={editingCampaign._goal || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, _goal: e.target.value }))} placeholder="What does success look like?" style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select value={editingCampaign.status} onChange={e => setEditingCampaign((c: any) => ({ ...c, status: e.target.value }))} style={selectStyle}>
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Budget ($)</label>
                    <input type="number" value={editingCampaign.budget || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, budget: e.target.value ? parseFloat(e.target.value) : undefined }))} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Spend to Date ($)</label>
                    <input type="number" value={editingCampaign._spend || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, _spend: e.target.value }))} placeholder="0" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Target Reach</label>
                    <input type="number" value={editingCampaign._target_reach || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, _target_reach: e.target.value }))} placeholder="# people" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="date"
                      value={editingCampaign.start_date
                        ? new Date(editingCampaign.start_date.length === 10 ? editingCampaign.start_date + 'T12:00:00Z' : editingCampaign.start_date + (editingCampaign.start_date.endsWith('Z') || editingCampaign.start_date.includes('+') ? '' : 'Z')).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
                        : ''}
                      onChange={e => setEditingCampaign((c: any) => ({ ...c, start_date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date</label>
                    <input type="date"
                      value={editingCampaign.end_date
                        ? new Date(editingCampaign.end_date.length === 10 ? editingCampaign.end_date + 'T12:00:00Z' : editingCampaign.end_date + (editingCampaign.end_date.endsWith('Z') || editingCampaign.end_date.includes('+') ? '' : 'Z')).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
                        : ''}
                      onChange={e => setEditingCampaign((c: any) => ({ ...c, end_date: e.target.value }))} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Assets / Links</label>
                  <textarea value={editingCampaign._assets || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, _assets: e.target.value }))} rows={3} placeholder={'One per line. Use "Label | URL" format:\nSell Sheet | https://drive.google.com/...'} style={{ ...inputStyle, resize: 'none', fontSize: '12px' }} />
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={editingCampaign._notes || ''} onChange={e => setEditingCampaign((c: any) => ({ ...c, _notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setEditingCampaign(null)} style={btnSecondary}>Cancel</button>
                <button onClick={handleSaveEdit} style={btnPrimary}>Save Changes</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
