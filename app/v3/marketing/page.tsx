'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { v3, v3input, v3label } from '../lib/theme'
import { useV3Clients } from '../lib/query'
import { useV3Toast } from '../lib/context'
import { getSupabase } from '../../lib/supabase'
import type { Campaign } from '../../lib/types'

// ── Data hook ─────────────────────────────────────────────────────────────────

function useCampaigns() {
  return useQuery({
    queryKey: ['v3', 'campaigns'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('campaigns')
        .select('*, campaign_milestones(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Campaign[]
    },
  })
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  active:    v3.status.success,
  completed: v3.amber,
  paused:    v3.status.warning,
  draft:     'rgba(255,255,255,0.25)',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Active', completed: 'Completed', paused: 'Paused', draft: 'Draft',
}

// ── Create Campaign Modal ─────────────────────────────────────────────────────

function CreateCampaignModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const { data: clients = [] } = useV3Clients()
  const [title, setTitle]       = useState('')
  const [slug, setSlug]         = useState(clients[0]?.slug ?? '')
  const [type, setType]         = useState('')
  const [status, setStatus]     = useState<Campaign['status']>('draft')
  const [budget, setBudget]     = useState('')
  const [startDate, setStart]   = useState('')
  const [endDate, setEnd]       = useState('')
  const [description, setDesc]  = useState('')

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { error } = await sb.from('campaigns').insert({
        title: title.trim(),
        client_slug:   slug || null,
        campaign_type: type.trim() || null,
        status,
        budget: budget ? Number(budget) : null,
        start_date: startDate || null,
        end_date: endDate || null,
        description: description.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'campaigns'] })
      toast('Campaign created')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to create', 'error'),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: v3.bg.overlay, backdropFilter: 'blur(10px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 500, background: v3.bg.elevated, borderRadius: '12px', boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)', padding: '24px 28px 32px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>New Campaign</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={v3label}>Campaign Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="e.g. Summer Launch — NoCo Rye" style={{ ...v3input, background: v3.bg.sheet }} />
          </div>

          {clients.length > 0 && (
            <div>
              <label style={v3label}>Brand</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                <button type="button" onClick={() => setSlug('')} style={{
                  padding: '5px 11px', borderRadius: v3.radius.full, fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${!slug ? 'rgba(196,164,110,0.50)' : 'rgba(255,255,255,0.08)'}`,
                  background: !slug ? 'rgba(196,164,110,0.09)' : 'transparent',
                  color: !slug ? v3.amberLight : 'rgba(255,255,255,0.40)',
                }}>All Brands</button>
                {clients.map(c => (
                  <button key={c.slug} type="button" onClick={() => setSlug(c.slug)} style={{
                    padding: '5px 11px', borderRadius: v3.radius.full, fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${slug === c.slug ? (c.color || v3.amber) + '60' : 'rgba(255,255,255,0.08)'}`,
                    background: slug === c.slug ? (c.color || v3.amber) + '12' : 'transparent',
                    color: slug === c.slug ? (c.color || v3.amberLight) : 'rgba(255,255,255,0.40)',
                  }}>{c.name}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={v3label}>Type</label>
              <input value={type} onChange={e => setType(e.target.value)} placeholder="e.g. Social, Event, Sampling…" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
            <div><label style={v3label}>Budget</label>
              <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="$0" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={v3label}>Start Date</label>
              <input type="date" value={startDate} onChange={e => setStart(e.target.value)} style={{ ...v3input, background: v3.bg.sheet, colorScheme: 'dark' } as any} />
            </div>
            <div><label style={v3label}>End Date</label>
              <input type="date" value={endDate} onChange={e => setEnd(e.target.value)} style={{ ...v3input, background: v3.bg.sheet, colorScheme: 'dark' } as any} />
            </div>
          </div>

          <div>
            <label style={v3label}>Status</label>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {(Object.entries(STATUS_LABEL) as [Campaign['status'], string][]).map(([k, l]) => {
                const c = STATUS_COLOR[k]
                return (
                  <button key={k} type="button" onClick={() => setStatus(k)} style={{
                    padding: '5px 12px', borderRadius: v3.radius.full, fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${status === k ? c + '60' : 'rgba(255,255,255,0.08)'}`,
                    background: status === k ? c + '14' : 'transparent',
                    color: status === k ? c : 'rgba(255,255,255,0.40)',
                  }}>{l}</button>
                )
              })}
            </div>
          </div>

          <div><label style={v3label}>Description <span style={{ opacity: 0.4, fontWeight: 400 }}>(optional)</span></label>
            <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3}
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none', lineHeight: 1.5 } as any} />
          </div>
        </div>

        <button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}
          style={{
            marginTop: 24, width: '100%', padding: '13px',
            background: save.isPending ? v3.bg.sheet : v3.amber,
            color: '#000', border: 'none', borderRadius: v3.radius.md,
            fontSize: '12px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
          {save.isPending ? 'Creating…' : 'Create Campaign'}
        </button>
      </div>
    </div>
  )
}

// ── Campaign card ─────────────────────────────────────────────────────────────

function CampaignCard({ campaign, clients }: { campaign: Campaign; clients: any[] }) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const [expanded, setExpanded] = useState(false)
  const cl = clients.find(c => c.slug === campaign.client_slug)
  const sc = STATUS_COLOR[campaign.status] ?? v3.text.muted
  const milestones = campaign.campaign_milestones ?? []
  const done  = milestones.filter(m => m.completed).length
  const total = milestones.length

  const toggleMilestone = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const sb = getSupabase()
      const { error } = await sb.from('campaign_milestones').update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'campaigns'] })
    },
    onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
  })

  const updateStatus = useMutation({
    mutationFn: async (newStatus: Campaign['status']) => {
      const sb = getSupabase()
      const { error } = await sb.from('campaigns').update({ status: newStatus }).eq('id', campaign.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['v3', 'campaigns'] }),
    onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
  })

  const now = new Date()
  const daysLeft = campaign.end_date ? Math.ceil((new Date(campaign.end_date).getTime() - now.getTime()) / 86400000) : null

  return (
    <div style={{
      background: v3.bg.card, border: `1px solid ${v3.border.default}`,
      borderLeft: `3px solid ${sc}`, borderRadius: v3.radius.md, overflow: 'hidden',
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: v3.text.primary }}>{campaign.title}</span>
            {cl && (
              <span style={{ fontSize: '9px', fontWeight: 700, color: cl.color || v3.amber, background: (cl.color || v3.amber) + '14', padding: '1px 6px', borderRadius: v3.radius.sm, letterSpacing: '0.04em' }}>{cl.name}</span>
            )}
            <span style={{ fontSize: '9px', fontWeight: 700, color: sc, background: sc + '14', padding: '1px 7px', borderRadius: v3.radius.full, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{STATUS_LABEL[campaign.status] ?? campaign.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {campaign.campaign_type && <span style={{ fontSize: '11px', color: v3.text.muted }}>{campaign.campaign_type}</span>}
            {campaign.budget && <span style={{ fontSize: '11px', color: v3.text.muted }}>${campaign.budget.toLocaleString()} budget</span>}
            {campaign.start_date && <span style={{ fontSize: '11px', color: v3.text.muted }}>
              {campaign.start_date}{campaign.end_date ? ` → ${campaign.end_date}` : ''}
            </span>}
            {daysLeft !== null && campaign.status === 'active' && (
              <span style={{ fontSize: '11px', color: daysLeft <= 7 ? v3.status.danger : daysLeft <= 30 ? v3.status.warning : v3.text.muted, fontWeight: 600 }}>
                {daysLeft > 0 ? `${daysLeft}d left` : 'Ended'}
              </span>
            )}
          </div>
          {total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden', maxWidth: 120 }}>
                <div style={{ height: '100%', width: `${(done / total) * 100}%`, background: sc, borderRadius: 1, transition: 'width 400ms' }} />
              </div>
              <span style={{ fontSize: '10px', color: v3.text.muted, fontFamily: 'monospace' }}>{done}/{total} milestones</span>
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          {expanded ? <ChevronDown size={14} color={v3.text.muted} /> : <ChevronRight size={14} color={v3.text.muted} />}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${v3.border.subtle}`, paddingTop: 12 }}>
          {campaign.description && (
            <p style={{ fontSize: '12px', color: v3.text.secondary, lineHeight: 1.55, margin: '0 0 12px' }}>{campaign.description}</p>
          )}

          {/* Status controls */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 14, flexWrap: 'wrap' }}>
            {(Object.entries(STATUS_LABEL) as [Campaign['status'], string][]).map(([k, l]) => {
              const c = STATUS_COLOR[k]
              const isCurrent = campaign.status === k
              return (
                <button key={k} onClick={() => updateStatus.mutate(k)} disabled={isCurrent || updateStatus.isPending} style={{
                  padding: '4px 10px', borderRadius: v3.radius.full, fontSize: '10px', fontWeight: 600, cursor: isCurrent ? 'default' : 'pointer',
                  border: `1px solid ${isCurrent ? c + '60' : 'rgba(255,255,255,0.08)'}`,
                  background: isCurrent ? c + '14' : 'transparent',
                  color: isCurrent ? c : 'rgba(255,255,255,0.35)',
                }}>{l}</button>
              )
            })}
          </div>

          {/* Milestones */}
          {milestones.length > 0 && (
            <div>
              <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 8 }}>Milestones</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {milestones.map((m: any) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: v3.bg.surface, borderRadius: v3.radius.sm, border: `1px solid ${v3.border.subtle}` }}>
                    <button
                      onClick={() => toggleMilestone.mutate({ id: m.id, completed: !m.completed })}
                      style={{
                        width: 16, height: 16, borderRadius: 3, flexShrink: 0, cursor: 'pointer',
                        background: m.completed ? v3.status.success : 'transparent',
                        border: `2px solid ${m.completed ? v3.status.success : 'rgba(255,255,255,0.30)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        transition: 'all 150ms',
                      }}
                    >
                      {m.completed && <Check size={9} strokeWidth={3} color="#000" />}
                    </button>
                    <span style={{ fontSize: '12px', color: m.completed ? v3.text.muted : v3.text.secondary, textDecoration: m.completed ? 'line-through' : 'none', flex: 1 }}>{m.title}</span>
                    {m.due_date && <span style={{ fontSize: '10px', color: v3.text.muted, fontFamily: 'monospace', flexShrink: 0 }}>{m.due_date}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const { data: campaigns = [], isLoading } = useCampaigns()
  const { data: clients = [] }              = useV3Clients()
  const [showCreate, setShowCreate]         = useState(false)
  const [brandFilter, setBrandFilter]       = useState('all')
  const [statusFilter, setStatusFilter]     = useState('all')

  const filtered = campaigns.filter(c => {
    if (brandFilter !== 'all' && c.client_slug !== brandFilter) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    return true
  })

  const statCounts = campaigns.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div style={{ padding: '28px 28px 64px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: 0 }}>Marketing</h1>
          <div style={{ fontSize: '13px', color: v3.text.muted, marginTop: 4 }}>
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
            {statCounts.active ? ` · ${statCounts.active} active` : ''}
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
          background: 'rgba(196,164,110,0.08)', border: `1px solid rgba(196,164,110,0.30)`,
          borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 700, color: v3.amberLight,
          cursor: 'pointer', letterSpacing: '0.03em',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(196,164,110,0.14)'; e.currentTarget.style.borderColor = 'rgba(196,164,110,0.50)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(196,164,110,0.08)'; e.currentTarget.style.borderColor = 'rgba(196,164,110,0.30)' }}>
          <Plus size={13} />New Campaign
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {/* Status filter */}
        {[['all', 'All'], ...Object.entries(STATUS_LABEL)].map(([k, l]) => {
          const c = k === 'all' ? v3.text.muted : STATUS_COLOR[k]
          const sel = statusFilter === k
          return (
            <button key={k} onClick={() => setStatusFilter(k)} style={{
              padding: '5px 12px', borderRadius: v3.radius.full, fontSize: '10px', fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${sel ? (c + '60') : 'rgba(255,255,255,0.08)'}`,
              background: sel ? (c + '12') : 'transparent',
              color: sel ? c : 'rgba(255,255,255,0.35)',
            }}>
              {l}{k !== 'all' && statCounts[k] ? ` (${statCounts[k]})` : ''}
            </button>
          )
        })}

        {clients.length > 1 && (
          <>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
            <button onClick={() => setBrandFilter('all')} style={{
              padding: '5px 12px', borderRadius: v3.radius.full, fontSize: '10px', fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${brandFilter === 'all' ? 'rgba(196,164,110,0.50)' : 'rgba(255,255,255,0.08)'}`,
              background: brandFilter === 'all' ? 'rgba(196,164,110,0.09)' : 'transparent',
              color: brandFilter === 'all' ? v3.amberLight : 'rgba(255,255,255,0.35)',
            }}>All Brands</button>
            {clients.map(c => {
              const sel = brandFilter === c.slug
              const ac = c.color || v3.amber
              return (
                <button key={c.slug} onClick={() => setBrandFilter(sel ? 'all' : c.slug)} style={{
                  padding: '5px 12px', borderRadius: v3.radius.full, fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${sel ? ac + '60' : 'rgba(255,255,255,0.08)'}`,
                  background: sel ? ac + '12' : 'transparent',
                  color: sel ? ac : 'rgba(255,255,255,0.35)',
                }}>{c.name}</button>
              )
            })}
          </>
        )}
      </div>

      {/* Campaign list */}
      {isLoading
        ? <div style={{ color: v3.text.muted, fontSize: '13px' }}>Loading…</div>
        : filtered.length === 0
        ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: v3.text.muted, fontSize: '13px' }}>
            {campaigns.length === 0
              ? <span>No campaigns yet — <button onClick={() => setShowCreate(true)} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '13px', padding: 0, textDecoration: 'underline' }}>create one</button></span>
              : 'No campaigns match these filters'
            }
          </div>
        )
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(c => (
              <CampaignCard key={c.id} campaign={c} clients={clients} />
            ))}
          </div>
        )
      }

      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
