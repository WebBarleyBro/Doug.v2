'use client'
import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, MapPin, Phone, Globe,
  Plus, Trash2, Target, ChevronRight, ExternalLink,
} from 'lucide-react'
import { v3, v3input, v3label, v3btnPrimary, v3btnSecondary, WIN_STATUSES } from '../../lib/theme'
import {
  useV3Accounts, useV3Orders, useV3Placements,
  useV3RecentVisits, useV3Clients,
} from '../../lib/query'
import { useOpenLogVisit, useV3Toast } from '../../lib/context'
import { buildDemandMap, DEMAND_COLOR, DEMAND_LABEL, type DemandState } from '../../lib/demand'
import {
  computeAccountIntel,
  STAGE_COLOR, STAGE_LABEL, STAGE_DESC,
  SIGNAL_COLOR, SIGNAL_LABEL,
  type AccountStage,
} from '../../lib/stage'
import { relativeTimeStr, formatShortDateMT } from '../../../lib/formatters'
import { getSupabase } from '../../../lib/supabase'

// ── Account-scoped data hooks ─────────────────────────────────────────────────

function useAccountVisits(accountId: string) {
  return useQuery({
    queryKey: ['v3', 'account', accountId, 'visits'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('visits')
        .select('id, visited_at, status, notes, client_slug, user_id, follow_up_cleared_at, follow_up_dismissed_at, user_profiles(name, full_name)')
        .eq('account_id', accountId)
        .order('visited_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!accountId,
    staleTime: 2 * 60_000,
  })
}

function useAccountPlacements(accountId: string) {
  return useQuery({
    queryKey: ['v3', 'account', accountId, 'placements'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('placements')
        .select('id, product_name, placement_type, status, price_point, shelf_date, lost_at, lost_reason, client_slug, created_at, updated_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!accountId,
    staleTime: 2 * 60_000,
  })
}

function useAccountOrders(accountId: string) {
  return useQuery({
    queryKey: ['v3', 'account', accountId, 'orders'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('purchase_orders')
        .select('id, po_number, client_slug, status, order_type, total_amount, commission_amount, sent_at, created_at, notes, po_line_items(id, product_name, quantity, unit_price, total)')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!accountId,
    staleTime: 2 * 60_000,
  })
}

function useAccountContacts(accountId: string) {
  return useQuery({
    queryKey: ['v3', 'account', accountId, 'contacts'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('contacts')
        .select('id, name, role, category, email, phone, is_decision_maker, client_slug')
        .eq('account_id', accountId)
        .order('is_decision_maker', { ascending: false })
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!accountId,
    staleTime: 5 * 60_000,
  })
}

function useAccountTasks(accountId: string) {
  return useQuery({
    queryKey: ['v3', 'account', accountId, 'tasks'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('tasks')
        .select('id, title, priority, due_date, completed, client_slug')
        .eq('account_id', accountId)
        .eq('completed', false)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(10)
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!accountId,
    staleTime: 2 * 60_000,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function visitStatusColor(status: string) {
  if (WIN_STATUSES.has(status))     return v3.status.success
  if (status === 'Will Order Soon') return v3.amber
  if (status === 'Needs Follow Up') return v3.status.danger
  return 'rgba(255,255,255,0.30)'
}

function placementStatusLabel(status: string) {
  return { committed: 'Committed', ordered: 'Ordered', on_shelf: 'On Shelf', reordering: 'Reordering' }[status] ?? status
}

function placementStatusColor(status: string) {
  return { reordering: v3.status.success, on_shelf: v3.amber, ordered: v3.status.info, committed: 'rgba(255,255,255,0.30)' }[status] ?? 'rgba(255,255,255,0.30)'
}

function orderStatusColor(status: string) {
  return { fulfilled: v3.status.success, sent: v3.amber, draft: 'rgba(255,255,255,0.30)', cancelled: v3.status.danger }[status] ?? 'rgba(255,255,255,0.30)'
}

// ── AddContactModal ───────────────────────────────────────────────────────────

function AddContactModal({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const qc    = useQueryClient()
  const toast = useV3Toast()
  const [name,   setName]   = useState('')
  const [role,   setRole]   = useState('')
  const [email,  setEmail]  = useState('')
  const [phone,  setPhone]  = useState('')
  const [isDM,   setIsDM]   = useState(false)
  const [cat,    setCat]    = useState('general')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) { toast.show('Name is required', 'error'); return }
    setSaving(true)
    try {
      const sb = getSupabase()
      const { error } = await sb.from('contacts').insert({
        account_id: accountId, name: name.trim(), role: role.trim() || null,
        email: email.trim() || null, phone: phone.trim() || null,
        is_decision_maker: isDM, category: cat,
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['v3', 'account', accountId, 'contacts'] })
      toast.show('Contact added')
      onClose()
    } catch (err: any) {
      console.error('contact.create', err)
      toast.show('Failed to add contact', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', background: v3.bg.overlay }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', background: v3.bg.sheet, borderRadius: '12px 12px 0 0', padding: '24px 20px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: v3.type.lg, fontWeight: 700, color: v3.text.primary, fontFamily: v3.font.ui }}>Add Contact</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4, fontSize: 18 }}>✕</button>
        </div>
        <div><label style={v3label}>Name *</label><input style={v3input} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" autoFocus /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={v3label}>Role / Title</label><input style={v3input} value={role} onChange={e => setRole(e.target.value)} placeholder="Bar Manager" /></div>
          <div>
            <label style={v3label}>Category</label>
            <select style={{ ...v3input, paddingRight: 8 }} value={cat} onChange={e => setCat(e.target.value)}>
              <option value="general">General</option>
              <option value="buyer">Buyer</option>
              <option value="gm_owner">GM / Owner</option>
              <option value="chef">Chef</option>
              <option value="distributor">Distributor</option>
              <option value="media">Media</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={v3label}>Email</label><input style={v3input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@venue.com" /></div>
          <div><label style={v3label}>Phone</label><input style={v3input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(303) 555-0100" /></div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={isDM} onChange={e => setIsDM(e.target.checked)} style={{ accentColor: v3.amber }} />
          <span style={{ fontSize: v3.type.sm, color: v3.text.secondary, fontFamily: v3.font.ui }}>Decision maker</span>
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ ...v3btnSecondary, flex: 1 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ ...v3btnPrimary, flex: 2, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Add Contact'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Activity ─────────────────────────────────────────────────────────────

function ActivityTab({ visits }: { visits: any[] }) {
  if (!visits.length) return (
    <div style={{ padding: '32px 0', textAlign: 'center', color: v3.text.muted, fontSize: v3.type.base }}>No visits logged yet</div>
  )
  let lastDate = ''
  return (
    <div>
      {visits.map((v: any) => {
        const dateStr  = v.visited_at?.slice(0, 10) ?? ''
        const showDate = dateStr !== lastDate
        lastDate = dateStr
        const repName  = v.user_profiles?.name || v.user_profiles?.full_name || '—'
        const sc       = visitStatusColor(v.status)
        return (
          <div key={v.id}>
            {showDate && (
              <div style={{ fontSize: v3.type.xs, fontWeight: 700, color: v3.text.muted, padding: '14px 0 6px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {formatShortDateMT(dateStr)}
              </div>
            )}
            <div style={{ borderLeft: `2px solid ${sc}28`, paddingLeft: 14, paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: sc, fontFamily: v3.font.ui, letterSpacing: '0.04em' }}>{v.status}</span>
                <span style={{ fontSize: v3.type.xs, color: v3.text.muted }}>· {v.client_slug} · {repName}</span>
              </div>
              {v.notes && <p style={{ margin: 0, fontSize: v3.type.sm, color: v3.text.secondary, lineHeight: 1.5 }}>{v.notes}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Placements ───────────────────────────────────────────────────────────

function PlacementsTab({ placements, accountId }: { placements: any[]; accountId: string }) {
  const qc    = useQueryClient()
  const toast = useV3Toast()
  const active = placements.filter(p => !p.lost_at)
  const lost   = placements.filter(p =>  p.lost_at)
  const NEXT: Record<string, string> = { committed: 'ordered', ordered: 'on_shelf', on_shelf: 'reordering' }

  async function advance(p: any) {
    const next = NEXT[p.status]
    if (!next) return
    const sb = getSupabase()
    const { error } = await sb.from('placements').update({ status: next, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (error) { toast.show('Failed to advance', 'error'); return }
    qc.invalidateQueries({ queryKey: ['v3', 'account', accountId, 'placements'] })
    qc.invalidateQueries({ queryKey: ['v3', 'placements'] })
    toast.show(`Moved to ${placementStatusLabel(next)}`)
  }

  if (!active.length && !lost.length) return (
    <div style={{ padding: '32px 0', textAlign: 'center', color: v3.text.muted, fontSize: v3.type.base }}>No placements at this account yet</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {active.map((p: any) => {
        const c = placementStatusColor(p.status)
        const hasNext = !!NEXT[p.status]
        return (
          <div key={p.id} style={{ background: v3.bg.card, borderRadius: v3.radius.md, padding: '12px 14px', border: `1px solid ${v3.border.subtle}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: v3.type.base, fontWeight: 600, color: v3.text.primary, marginBottom: 3 }}>{p.product_name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: c, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: v3.font.ui }}>{placementStatusLabel(p.status)}</span>
                {p.client_slug && <span style={{ fontSize: v3.type.xs, color: v3.text.muted }}>· {p.client_slug}</span>}
                {p.placement_type && <span style={{ fontSize: v3.type.xs, color: v3.text.muted }}>· {p.placement_type.replace(/_/g, ' ')}</span>}
                {p.price_point && <span style={{ fontSize: v3.type.xs, color: v3.text.muted, fontFamily: v3.font.mono }}>${p.price_point}</span>}
              </div>
            </div>
            {hasNext && (
              <button onClick={() => advance(p)} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.sm, color: v3.text.secondary, fontSize: 10, fontWeight: 700, padding: '5px 9px', cursor: 'pointer', fontFamily: v3.font.ui, whiteSpace: 'nowrap' }}>
                → {placementStatusLabel(NEXT[p.status])}
              </button>
            )}
          </div>
        )
      })}
      {lost.length > 0 && (
        <>
          <div style={{ fontSize: v3.type.xs, color: v3.text.muted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 8 }}>Lost</div>
          {lost.map((p: any) => (
            <div key={p.id} style={{ background: v3.bg.card, borderRadius: v3.radius.md, padding: '10px 14px', border: `1px solid ${v3.border.subtle}`, opacity: 0.45 }}>
              <span style={{ fontSize: v3.type.sm, color: v3.text.secondary }}>{p.product_name}</span>
              {p.lost_reason && <span style={{ fontSize: v3.type.xs, color: v3.text.muted }}> · {p.lost_reason}</span>}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── Tab: Orders ───────────────────────────────────────────────────────────────

function OrdersTab({ orders }: { orders: any[] }) {
  if (!orders.length) return (
    <div style={{ padding: '32px 0', textAlign: 'center', color: v3.text.muted, fontSize: v3.type.base }}>
      No orders linked to this account<br />
      <span style={{ fontSize: v3.type.sm, marginTop: 6, display: 'block', lineHeight: 1.5 }}>
        Link orders from the Orders page to see them here.
      </span>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {orders.map((o: any) => {
        const c     = orderStatusColor(o.status)
        const total = (o.po_line_items ?? []).reduce((s: number, li: any) => s + (Number(li.total) || 0), 0) || Number(o.total_amount) || 0
        return (
          <div key={o.id} style={{ background: v3.bg.card, borderRadius: v3.radius.md, padding: '12px 14px', border: `1px solid ${v3.border.subtle}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: c, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: v3.font.ui }}>{o.status}</span>
                <span style={{ fontSize: v3.type.xs, color: v3.text.muted }}>{o.client_slug}</span>
                {o.po_number && <span style={{ fontSize: v3.type.xs, color: v3.text.muted, fontFamily: v3.font.mono }}>#{o.po_number}</span>}
              </div>
              {total > 0 && <span style={{ fontSize: v3.type.sm, fontWeight: 700, color: v3.text.primary, fontFamily: v3.font.mono }}>${total.toFixed(0)}</span>}
            </div>
            <div style={{ fontSize: v3.type.xs, color: v3.text.muted }}>
              {o.sent_at ? `Sent ${formatShortDateMT(o.sent_at.slice(0, 10))}` : `Created ${formatShortDateMT(o.created_at.slice(0, 10))}`}
              {' · '}{o.order_type === 'distributor' ? 'Distributor' : 'Direct'}
            </div>
            {o.notes && <p style={{ margin: '6px 0 0', fontSize: v3.type.sm, color: v3.text.secondary }}>{o.notes}</p>}
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Contacts ─────────────────────────────────────────────────────────────

function ContactsTab({ contacts, accountId, onAdd }: { contacts: any[]; accountId: string; onAdd: () => void }) {
  const qc    = useQueryClient()
  const toast = useV3Toast()

  async function handleDelete(id: string) {
    if (!confirm('Delete this contact?')) return
    const sb = getSupabase()
    const { error } = await sb.from('contacts').delete().eq('id', id)
    if (error) { toast.show('Failed to delete', 'error'); return }
    qc.invalidateQueries({ queryKey: ['v3', 'account', accountId, 'contacts'] })
    toast.show('Contact removed')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button onClick={onAdd} style={{ ...v3btnSecondary, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', width: '100%' }}>
        <Plus size={13} /> Add Contact
      </button>
      {contacts.length === 0 && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: v3.text.muted, fontSize: v3.type.base }}>No contacts yet</div>
      )}
      {contacts.map((c: any) => (
        <div key={c.id} style={{ background: v3.bg.card, borderRadius: v3.radius.md, padding: '12px 14px', border: `1px solid ${v3.border.subtle}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: v3.type.base, fontWeight: 600, color: v3.text.primary }}>{c.name}</span>
                {c.is_decision_maker && <span style={{ fontSize: 9, fontWeight: 700, color: v3.amber, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: v3.font.ui }}>DM</span>}
              </div>
              {c.role && <div style={{ fontSize: v3.type.sm, color: v3.text.secondary, marginBottom: 4 }}>{c.role}</div>}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: v3.type.sm, color: v3.text.link, textDecoration: 'none' }}>{c.email}</a>}
                {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize: v3.type.sm, color: v3.text.link, textDecoration: 'none' }}>{c.phone}</a>}
              </div>
            </div>
            <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.20)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Pre-Visit Brief ───────────────────────────────────────────────────────────
// The main value proposition: everything a rep needs BEFORE walking in the door.
// Shown above the tabs — always visible regardless of which tab is active.

function PreVisitBrief({ intel, visits, placements, contacts, tasks, clients }: {
  intel: ReturnType<typeof computeAccountIntel>
  visits: any[]
  placements: any[]
  contacts: any[]
  tasks: any[]
  clients: any[]
}) {
  const {
    stage, signal, nextAction,
    cadenceDays, daysUntilDue, isOverdue,
    openFollowUp, openFollowUpDaysAgo,
    lastVisitDaysAgo, lastVisitStatus,
    activePlacements, reorderingCount, brandCount,
  } = intel

  const stageColor  = STAGE_COLOR[stage]
  const signalColor = SIGNAL_COLOR[signal]
  const lastVisit   = visits[0]
  const decisionMakers = contacts.filter(c => c.is_decision_maker)
  const activePlacList = placements.filter(p => !p.lost_at)

  // Client name lookup
  const clientMap = Object.fromEntries(clients.map((c: any) => [c.slug, c.name]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Stage + signal header ── */}
      <div style={{ background: v3.bg.card, borderRadius: v3.radius.md, border: `1px solid ${v3.border.subtle}`, overflow: 'hidden' }}>
        {/* Stage bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${v3.border.subtle}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: signalColor, boxShadow: ['urgent', 'cooling'].includes(signal) ? `0 0 6px ${signalColor}` : undefined }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: signalColor, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: v3.font.ui }}>{SIGNAL_LABEL[signal]}</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: stageColor, background: stageColor + '18', padding: '3px 9px', borderRadius: v3.radius.sm, border: `1px solid ${stageColor}28`, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: v3.font.ui }}>
            {STAGE_LABEL[stage]}
          </span>
        </div>

        {/* Next action — the most important piece of information on this screen */}
        <div style={{ padding: '14px 14px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Target size={15} color={v3.amber} style={{ marginTop: 1, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: v3.type.xs, fontWeight: 700, color: v3.amber, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Objective for this visit</div>
              <p style={{ margin: 0, fontSize: v3.type.base, color: v3.text.primary, lineHeight: 1.55, fontWeight: 500 }}>{nextAction}</p>
            </div>
          </div>
        </div>

        {/* Cadence health */}
        <div style={{ padding: '8px 14px 12px', borderTop: `1px solid ${v3.border.subtle}` }}>
          <span style={{ fontSize: v3.type.xs, color: isOverdue ? SIGNAL_COLOR['overdue'] : v3.text.muted }}>
            {isOverdue
              ? `Visit overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''} · Your rhythm here is every ~${cadenceDays} days`
              : lastVisitDaysAgo === null
                ? `Never visited · Suggested cadence: every ${cadenceDays} days`
                : `Last visit ${lastVisitDaysAgo}d ago · Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''} (every ~${cadenceDays}d)`
            }
          </span>
        </div>
      </div>

      {/* ── Key contacts ── */}
      {decisionMakers.length > 0 && (
        <div style={{ background: v3.bg.card, borderRadius: v3.radius.md, border: `1px solid ${v3.border.subtle}`, padding: '12px 14px' }}>
          <div style={{ fontSize: v3.type.xs, fontWeight: 700, color: v3.text.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Ask for</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {decisionMakers.map((c: any) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: v3.type.base, fontWeight: 600, color: v3.text.primary }}>{c.name}</span>
                  {c.role && <span style={{ fontSize: v3.type.xs, color: v3.text.muted }}> · {c.role}</span>}
                </div>
                {c.phone && (
                  <a href={`tel:${c.phone}`} style={{ fontSize: v3.type.sm, color: v3.text.link, textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {c.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Open follow-up ── */}
      {openFollowUp && (
        <div style={{ background: v3.amberDim, border: `1px solid ${v3.amber}33`, borderRadius: v3.radius.md, padding: '10px 14px' }}>
          <span style={{ fontSize: v3.type.sm, color: v3.amber, fontWeight: 600 }}>
            "{openFollowUp}" from {openFollowUpDaysAgo}d ago — close the loop today
          </span>
        </div>
      )}

      {/* ── What's in here ── */}
      {activePlacList.length > 0 && (
        <div style={{ background: v3.bg.card, borderRadius: v3.radius.md, border: `1px solid ${v3.border.subtle}`, padding: '12px 14px' }}>
          <div style={{ fontSize: v3.type.xs, fontWeight: 700, color: v3.text.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>What's in here</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activePlacList.map((p: any) => {
              const c = placementStatusColor(p.status)
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontSize: v3.type.sm, color: v3.text.primary, flex: 1 }}>{p.product_name}</span>
                  <span style={{ fontSize: v3.type.xs, color: v3.text.muted }}>{clientMap[p.client_slug] || p.client_slug}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: c, fontFamily: v3.font.ui, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{placementStatusLabel(p.status)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Last visit context ── */}
      {lastVisit && (
        <div style={{ borderLeft: `2px solid ${visitStatusColor(lastVisit.status)}`, borderRadius: `0 ${v3.radius.md} ${v3.radius.md} 0`, padding: '10px 14px', background: v3.bg.card }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: lastVisit.notes ? 4 : 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: visitStatusColor(lastVisit.status), letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: v3.font.ui }}>{lastVisit.status}</span>
            <span style={{ fontSize: v3.type.xs, color: v3.text.muted }}>
              · {relativeTimeStr(lastVisit.visited_at)} · {lastVisit.client_slug}
            </span>
          </div>
          {lastVisit.notes && <p style={{ margin: 0, fontSize: v3.type.sm, color: v3.text.secondary, lineHeight: 1.5 }}>{lastVisit.notes}</p>}
        </div>
      )}

      {/* ── Open tasks ── */}
      {tasks.length > 0 && (
        <div style={{ background: v3.bg.card, borderRadius: v3.radius.md, border: `1px solid ${v3.border.subtle}`, padding: '10px 14px' }}>
          <div style={{ fontSize: v3.type.xs, fontWeight: 700, color: v3.text.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Open Tasks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {tasks.map((t: any) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: t.priority === 'high' ? v3.status.danger : t.priority === 'medium' ? v3.amber : v3.text.muted, flexShrink: 0 }} />
                <span style={{ fontSize: v3.type.sm, color: v3.text.secondary, flex: 1 }}>{t.title}</span>
                {t.due_date && <span style={{ fontSize: v3.type.xs, color: v3.text.muted, flexShrink: 0 }}>{t.due_date}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'brief' | 'activity' | 'placements' | 'orders' | 'contacts'

export default function AccountDetailPage() {
  const { id }       = useParams<{ id: string }>()
  const router       = useRouter()
  const { open: openLogVisit } = useOpenLogVisit()

  const [tab,     setTab]     = useState<Tab>('brief')
  const [showAdd, setShowAdd] = useState(false)

  const { data: accounts    = [] } = useV3Accounts()
  const { data: allOrders   = [] } = useV3Orders()
  const { data: allVisits90 = [] } = useV3RecentVisits(90)
  const { data: allPlacements = [] } = useV3Placements()
  const { data: clients     = [] } = useV3Clients()

  const { data: visits     = [] } = useAccountVisits(id)
  const { data: placements = [] } = useAccountPlacements(id)
  const { data: orders     = [] } = useAccountOrders(id)
  const { data: contacts   = [] } = useAccountContacts(id)
  const { data: tasks      = [] } = useAccountTasks(id)

  const account = useMemo(() => accounts.find(a => a.id === id), [accounts, id])

  const clientSlugs = useMemo(() => clients.map((c: any) => c.slug), [clients])

  const demandByBrand = useMemo(() => {
    if (!clientSlugs.length) return {}
    const dm = buildDemandMap(allOrders, [id], clientSlugs)
    return dm[id] ?? {}
  }, [allOrders, id, clientSlugs])

  const intel = useMemo(() => computeAccountIntel({
    accountId:    id,
    visits:       visits,
    placements:   placements,
    orders:       orders,
    clientSlugs,
    demandByBrand,
  }), [id, visits, placements, orders, clientSlugs, demandByBrand])

  if (!account && accounts.length > 0) {
    return (
      <div style={{ minHeight: '100vh', background: v3.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: v3.font.ui, color: v3.text.muted }}>
        Account not found.{' '}
        <button onClick={() => router.back()} style={{ color: v3.text.link, background: 'none', border: 'none', cursor: 'pointer', marginLeft: 6 }}>Go back</button>
      </div>
    )
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'brief',      label: 'Brief' },
    { key: 'activity',   label: 'Activity',   count: visits.length },
    { key: 'placements', label: 'Placements', count: placements.filter(p => !p.lost_at).length },
    { key: 'orders',     label: 'Orders',     count: orders.length },
    { key: 'contacts',   label: 'Contacts',   count: contacts.length },
  ]

  return (
    <div style={{ minHeight: '100vh', background: v3.bg.page, fontFamily: v3.font.ui }}>

      {/* ── Top bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: v3.bg.page, borderBottom: `1px solid ${v3.border.subtle}`,
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: v3.text.secondary, padding: 4, display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: v3.type.base, fontWeight: 700, color: v3.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {account?.name ?? '…'}
          </div>
          {account?.account_type && (
            <div style={{ fontSize: v3.type.xs, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              {account.account_type.replace('_', ' ')}
              {account?.address && ` · ${account.address.split(',').slice(-2).join(',').trim()}`}
            </div>
          )}
        </div>
        <button
          onClick={() => account && openLogVisit({ id: account.id, name: account.name })}
          style={{ ...v3btnPrimary, padding: '7px 14px', fontSize: 11, flexShrink: 0 }}>
          Log Visit
        </button>
      </div>

      {/* ── Address / links bar ── */}
      {(account?.address || account?.phone || account?.website) && (
        <div style={{ display: 'flex', gap: 14, padding: '8px 16px', overflowX: 'auto', scrollbarWidth: 'none', borderBottom: `1px solid ${v3.border.subtle}` }}>
          {account?.address && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(account.address)}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: v3.type.xs, color: v3.text.link, textDecoration: 'none', flexShrink: 0 }}>
              <MapPin size={11} /> Directions
            </a>
          )}
          {account?.phone && (
            <a href={`tel:${account.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: v3.type.xs, color: v3.text.link, textDecoration: 'none', flexShrink: 0 }}>
              <Phone size={11} /> {account.phone}
            </a>
          )}
          {account?.website && (
            <a href={account.website} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: v3.type.xs, color: v3.text.link, textDecoration: 'none', flexShrink: 0 }}>
              <Globe size={11} /> Website
            </a>
          )}
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${v3.border.subtle}`, padding: '0 4px', background: v3.bg.page, position: 'sticky', top: 53, zIndex: 10 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 10px',
              fontSize: v3.type.sm, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? v3.amber : v3.text.muted,
              borderBottom: `2px solid ${tab === t.key ? v3.amber : 'transparent'}`,
              fontFamily: v3.font.ui, transition: 'color 100ms',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span style={{ fontSize: 9, background: tab === t.key ? v3.amberDim : 'rgba(255,255,255,0.06)', color: tab === t.key ? v3.amber : v3.text.muted, padding: '1px 5px', borderRadius: 10, fontWeight: 700 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ padding: '16px 16px 120px' }}>
        {tab === 'brief' && (
          <PreVisitBrief
            intel={intel}
            visits={visits}
            placements={placements}
            contacts={contacts}
            tasks={tasks}
            clients={clients}
          />
        )}
        {tab === 'activity'   && <ActivityTab   visits={visits} />}
        {tab === 'placements' && <PlacementsTab placements={placements} accountId={id} />}
        {tab === 'orders'     && <OrdersTab     orders={orders} />}
        {tab === 'contacts'   && <ContactsTab   contacts={contacts} accountId={id} onAdd={() => setShowAdd(true)} />}
      </div>

      {showAdd && <AddContactModal accountId={id} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
