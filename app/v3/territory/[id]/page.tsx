'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, MapPin, Phone, Mail, Navigation,
  CalendarDays, Settings, Plus, X, Check, Pencil, Trash2,
  AlertTriangle, StickyNote, Globe, Instagram,
} from 'lucide-react'
import { v3, v3input, v3label, healthColor, healthLabel } from '../../lib/theme'
import { useV3Clients, useAdvancePlacement } from '../../lib/query'
import { useOpenLogVisit, useWinMoment, useV3Toast } from '../../lib/context'
import { getSupabase } from '../../../lib/supabase'
import { clientLogoUrl } from '../../../lib/constants'
import { relativeTimeStr, formatShortDateMT } from '../../../lib/formatters'
import { createPlacement } from '../../../lib/data'
import type { Client } from '../../../lib/types'
import { computeGrade, GRADE_CONFIG } from '../../lib/grading'

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  buyer:       { label: 'Buyer',        color: '#c4a46e' },
  bar_manager: { label: 'Bar Manager',  color: '#3a9e74' },
  gm_owner:    { label: 'GM / Owner',   color: '#c4a46e' },
  chef:        { label: 'Chef',         color: '#b87840' },
  distributor: { label: 'Distributor',  color: '#6878b4' },
  media:       { label: 'Media',        color: '#6878b4' },
  general:     { label: 'General',      color: 'rgba(255,255,255,0.30)' },
  other:       { label: 'Other',        color: 'rgba(255,255,255,0.30)' },
}

const PLACEMENT_TYPES = ['shelf', 'back_bar', 'well', 'menu', 'cocktail', 'retail', 'seasonal', 'feature']

const PLAC_STATUS_COLOR: Record<string, string> = {
  committed:  'rgba(255,255,255,0.42)',
  ordered:    v3.status.warning,
  on_shelf:   v3.status.success,
  reordering: v3.amber,
}
const PLAC_STATUS_NEXT: Record<string, string> = {
  committed: 'ordered',
  ordered:   'on_shelf',
  on_shelf:  'reordering',
}
const PLAC_STATUS_LABEL: Record<string, string> = {
  committed:  'Committed',
  ordered:    'Ordered',
  on_shelf:   'On Shelf',
  reordering: 'Reordering',
}
const VISIT_STATUS_COLOR: Record<string, string> = {
  'Will Order Soon':  v3.status.warning,
  'Just Ordered':     v3.status.success,
  'Needs Follow Up':  v3.status.danger,
  'Not Interested':   v3.text.muted,
  'Menu Feature Won': v3.amberLight,
  'New Placement':    v3.health.warm,
  'General Check-In': 'rgba(255,255,255,0.30)',
  'Tasted':           v3.amber,
}

// ── Data hooks ─────────────────────────────────────────────────────────────────

function useAccount(id: string) {
  return useQuery({
    queryKey: ['v3', 'account', id],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('accounts')
        .select('id, name, address, phone, account_type, priority, visit_frequency_days, last_visited, lat, lng, best_days, best_time, notes, website, instagram, account_clients(client_slug)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as any
    },
    enabled: !!id,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })
}

function useAccountVisits(id: string) {
  return useQuery({
    queryKey: ['v3', 'account', id, 'visits'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('visits')
        .select('id, visited_at, status, notes, tasting_notes, feedback, client_slug, user_id, user_profiles(name)')
        .eq('account_id', id)
        .order('visited_at', { ascending: false })
        .limit(25)
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!id,
    staleTime: 5 * 60_000,
  })
}

function useAccountPlacements(id: string) {
  return useQuery({
    queryKey: ['v3', 'account', id, 'placements'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('placements')
        .select('id, account_id, client_slug, product_name, placement_type, status, price_point, shelf_count, notes, created_at, updated_at, lost_at, lost_reason')
        .eq('account_id', id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!id,
    staleTime: 5 * 60_000,
  })
}

function useAccountContacts(id: string) {
  return useQuery({
    queryKey: ['v3', 'account', id, 'contacts'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('contacts')
        .select('id, account_id, client_slug, name, role, category, email, phone, is_decision_maker, notes')
        .eq('account_id', id)
        .order('is_decision_maker', { ascending: false })
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!id,
    staleTime: 10 * 60_000,
  })
}

function useAccountOrders(id: string) {
  return useQuery({
    queryKey: ['v3', 'account', id, 'orders'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('purchase_orders')
        .select('id, po_number, status, order_type, total_amount, client_slug, created_at, sent_at, po_line_items(id, product_name, quantity, total)')
        .eq('account_id', id)
        .order('created_at', { ascending: false })
        .limit(8)
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!id,
    staleTime: 5 * 60_000,
  })
}

// ── Modal base ────────────────────────────────────────────────────────────────

function ModalBase({ onClose, children, maxWidth = 480 }: { onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'absolute', inset: 0, background: v3.bg.overlay, backdropFilter: 'blur(10px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth,
        background: v3.bg.elevated,
        borderRadius: '12px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)',
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        {children}
      </div>
    </div>
  )
}

// ── Edit Account Modal ────────────────────────────────────────────────────────

function EditAccountModal({ account, onClose }: { account: any; onClose: () => void }) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const [name, setName]     = useState(account.name ?? '')
  const [address, setAddr]  = useState(account.address ?? '')
  const [phone, setPhone]   = useState(account.phone ?? '')
  const [website, setWeb]   = useState(account.website ?? '')
  const [instagram, setIg]  = useState(account.instagram ?? '')
  const [type, setType]     = useState(account.account_type ?? 'on_premise')
  const [priority, setPri]  = useState(account.priority ?? 'B')
  const [freq, setFreq]     = useState(String(account.visit_frequency_days ?? 30))
  const [bestTime, setBT]   = useState(account.best_time ?? '')
  const [bestDays, setBD]   = useState<string[]>(account.best_days ?? [])
  const [notes, setNotes]   = useState(account.notes ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { error } = await sb.from('accounts').update({
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        instagram: instagram.trim() || null,
        account_type: type,
        priority,
        visit_frequency_days: Number(freq) || 30,
        best_days: bestDays.length ? bestDays : null,
        best_time: bestTime.trim() || null,
        notes: notes.trim() || null,
      }).eq('id', account.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'account', account.id] })
      qc.invalidateQueries({ queryKey: ['v3', 'accounts'] })
      toast('Account updated')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to save', 'error'),
  })

  const toggleDay = (d: string) => setBD(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])

  const fieldSet = (label: string, child: React.ReactNode) => (
    <div>
      <label style={v3label}>{label}</label>
      {child}
    </div>
  )

  return (
    <ModalBase onClose={onClose} maxWidth={520}>
      <div style={{ padding: '24px 28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Edit Account</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.40)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fieldSet('Account Name *', <input value={name} onChange={e => setName(e.target.value)} style={{ ...v3input, background: v3.bg.sheet }} />)}
          {fieldSet('Address', <input value={address} onChange={e => setAddr(e.target.value)} style={{ ...v3input, background: v3.bg.sheet }} />)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {fieldSet('Phone', <input value={phone} onChange={e => setPhone(e.target.value)} style={{ ...v3input, background: v3.bg.sheet }} />)}
            {fieldSet('Visit Every (days)', <input type="number" value={freq} onChange={e => setFreq(e.target.value)} style={{ ...v3input, background: v3.bg.sheet }} />)}
          </div>

          {/* Type + Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={v3label}>Type</label>
              <div style={{ display: 'flex', gap: 5 }}>
                {[['on_premise', 'On-Premise'], ['off_premise', 'Off-Premise']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setType(v)} style={{
                    flex: 1, padding: '8px 6px', borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 600,
                    border: `1px solid ${type === v ? 'rgba(196,164,110,0.50)' : 'rgba(255,255,255,0.08)'}`,
                    background: type === v ? 'rgba(196,164,110,0.09)' : 'transparent',
                    color: type === v ? v3.amberLight : 'rgba(255,255,255,0.40)', cursor: 'pointer',
                  }}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={v3label}>Priority</label>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['A', 'B', 'C'] as const).map(p => {
                  const c = p === 'A' ? v3.amberLight : p === 'B' ? v3.status.warning : v3.text.muted
                  return (
                    <button key={p} type="button" onClick={() => setPri(p)} style={{
                      flex: 1, padding: '8px', borderRadius: v3.radius.md, fontSize: '14px', fontWeight: 800,
                      border: `1px solid ${priority === p ? c + '60' : 'rgba(255,255,255,0.08)'}`,
                      background: priority === p ? c + '12' : 'transparent',
                      color: priority === p ? c : 'rgba(255,255,255,0.30)', cursor: 'pointer',
                    }}>{p}</button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Best days */}
          <div>
            <label style={v3label}>Best Days to Visit</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {DAYS_OF_WEEK.map(d => {
                const sel = bestDays.includes(d)
                return (
                  <button key={d} type="button" onClick={() => toggleDay(d)} style={{
                    padding: '5px 10px', borderRadius: v3.radius.full, fontSize: '10px', fontWeight: 600,
                    border: `1px solid ${sel ? 'rgba(196,164,110,0.50)' : 'rgba(255,255,255,0.08)'}`,
                    background: sel ? 'rgba(196,164,110,0.09)' : 'transparent',
                    color: sel ? v3.amberLight : 'rgba(255,255,255,0.35)', cursor: 'pointer',
                  }}>{d.slice(0, 3)}</button>
                )
              })}
            </div>
          </div>

          {fieldSet('Best Time to Visit', <input value={bestTime} onChange={e => setBT(e.target.value)} placeholder="e.g. 2–5pm, after lunch rush" style={{ ...v3input, background: v3.bg.sheet }} />)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {fieldSet('Website', <input value={website} onChange={e => setWeb(e.target.value)} placeholder="https://" style={{ ...v3input, background: v3.bg.sheet }} />)}
            {fieldSet('Instagram', <input value={instagram} onChange={e => setIg(e.target.value)} placeholder="@handle" style={{ ...v3input, background: v3.bg.sheet }} />)}
          </div>
          {fieldSet('Internal Notes', (
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Parking situation, building access, anything useful…"
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none', lineHeight: 1.5 } as any} />
          ))}
        </div>

        <button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}
          style={{
            marginTop: 24, width: '100%', padding: '13px',
            background: save.isPending ? v3.bg.sheet : v3.amber,
            color: '#000', border: 'none', borderRadius: v3.radius.md,
            fontSize: '13px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
          {save.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </ModalBase>
  )
}

// ── Contact Form Modal ────────────────────────────────────────────────────────

function ContactFormModal({ accountId, contact, linkedClients, onClose }: {
  accountId: string; contact?: any; linkedClients: Client[]; onClose: () => void
}) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const editing = !!contact
  const [name, setName]     = useState(contact?.name ?? '')
  const [role, setRole]     = useState(contact?.role ?? '')
  const [category, setCat]  = useState(contact?.category ?? 'general')
  const [phone, setPhone]   = useState(contact?.phone ?? '')
  const [email, setEmail]   = useState(contact?.email ?? '')
  const [notes, setNotes]   = useState(contact?.notes ?? '')
  const [dm, setDm]         = useState(contact?.is_decision_maker ?? false)
  const [slug, setSlug]     = useState(contact?.client_slug ?? (linkedClients[0]?.slug ?? ''))

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const payload = {
        name: name.trim(), role: role.trim() || null, category,
        phone: phone.trim() || null, email: email.trim() || null,
        notes: notes.trim() || null, is_decision_maker: dm,
        client_slug: slug || null,
      }
      if (editing) {
        const { error } = await sb.from('contacts').update(payload).eq('id', contact.id)
        if (error) throw error
      } else {
        const { error } = await sb.from('contacts').insert({ ...payload, account_id: accountId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'account', accountId, 'contacts'] })
      toast(editing ? 'Contact updated' : 'Contact added')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to save', 'error'),
  })

  return (
    <ModalBase onClose={onClose} maxWidth={480}>
      <div style={{ padding: '24px 28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>
            {editing ? 'Edit Contact' : 'Add Contact'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.40)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={v3label}>Name *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="First Last" style={{ ...v3input, background: v3.bg.sheet }} /></div>
            <div><label style={v3label}>Role / Title</label><input value={role} onChange={e => setRole(e.target.value)} placeholder="Bar Manager" style={{ ...v3input, background: v3.bg.sheet }} /></div>
          </div>

          <div>
            <label style={v3label}>Category</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {Object.entries(CATEGORY_META).filter(([k]) => k !== 'other').map(([k, m]) => (
                <button key={k} type="button" onClick={() => setCat(k)} style={{
                  padding: '5px 11px', borderRadius: v3.radius.full, fontSize: '10px', fontWeight: 700,
                  border: `1px solid ${category === k ? m.color + '60' : 'rgba(255,255,255,0.08)'}`,
                  background: category === k ? m.color + '12' : 'transparent',
                  color: category === k ? m.color : 'rgba(255,255,255,0.38)', cursor: 'pointer',
                }}>{m.label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={v3label}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(303) 555-0100" style={{ ...v3input, background: v3.bg.sheet }} /></div>
            <div><label style={v3label}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@bar.com" style={{ ...v3input, background: v3.bg.sheet }} /></div>
          </div>

          {linkedClients.length > 1 && (
            <div>
              <label style={v3label}>Associated Brand</label>
              <select value={slug} onChange={e => setSlug(e.target.value)} style={{ ...v3input, appearance: 'none', background: v3.bg.sheet }}>
                <option value="">No brand association</option>
                {linkedClients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div><label style={v3label}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Any useful context about this contact…"
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none' } as any} />
          </div>

          {/* Decision maker toggle */}
          <button type="button" onClick={() => setDm(d => !d)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: dm ? 'rgba(196,164,110,0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${dm ? 'rgba(196,164,110,0.40)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: v3.radius.md, cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 4, flexShrink: 0,
              background: dm ? v3.amber : 'transparent',
              border: `2px solid ${dm ? v3.amber : 'rgba(255,255,255,0.40)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {dm && <Check size={11} strokeWidth={3} color="#000" />}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: dm ? v3.amberLight : v3.text.secondary }}>Decision Maker</div>
              <div style={{ fontSize: '10px', color: v3.text.muted, marginTop: 1 }}>Prioritized in pre-visit brief and contacts list</div>
            </div>
          </button>
        </div>

        <button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}
          style={{
            marginTop: 24, width: '100%', padding: '13px',
            background: save.isPending ? v3.bg.sheet : v3.amber,
            color: '#000', border: 'none', borderRadius: v3.radius.md,
            fontSize: '13px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
          {save.isPending ? 'Saving…' : editing ? 'Save Contact' : 'Add Contact'}
        </button>
      </div>
    </ModalBase>
  )
}

// ── Add Placement Modal ───────────────────────────────────────────────────────

function AddPlacementModal({ accountId, linkedClients, onClose }: {
  accountId: string; linkedClients: Client[]; onClose: () => void
}) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const [product, setProduct]   = useState('')
  const [type, setType]         = useState('shelf')
  const [status, setStatus]     = useState<'committed' | 'on_shelf'>('committed')
  const [slug, setSlug]         = useState(linkedClients[0]?.slug ?? '')
  const [price, setPrice]       = useState('')
  const [shelf, setShelf]       = useState('')
  const [notes, setNotes]       = useState('')

  const save = useMutation({
    mutationFn: async () => {
      await createPlacement({
        account_id: accountId,
        client_slug: slug || undefined,
        product_name: product.trim(),
        placement_type: type as any,
        status,
        price_point: price ? Number(price) : undefined,
        shelf_count: shelf ? Number(shelf) : undefined,
        notes: notes.trim() || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'account', accountId, 'placements'] })
      qc.invalidateQueries({ queryKey: ['v3', 'placements'] })
      toast('Placement added')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to add placement', 'error'),
  })

  return (
    <ModalBase onClose={onClose} maxWidth={460}>
      <div style={{ padding: '24px 28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Add Placement</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.40)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={v3label}>Product Name *</label>
            <input value={product} onChange={e => setProduct(e.target.value)} autoFocus
              placeholder="e.g. NoCo Rye Whiskey, Single Barrel Select"
              style={{ ...v3input, background: v3.bg.sheet }} />
          </div>

          {linkedClients.length > 1 && (
            <div><label style={v3label}>Brand</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {linkedClients.map(c => (
                  <button key={c.slug} type="button" onClick={() => setSlug(c.slug)} style={{
                    padding: '6px 12px', borderRadius: v3.radius.full, fontSize: '12px', fontWeight: 600,
                    border: `1px solid ${slug === c.slug ? (c.color || v3.amber) + '60' : 'rgba(255,255,255,0.08)'}`,
                    background: slug === c.slug ? (c.color || v3.amber) + '12' : 'transparent',
                    color: slug === c.slug ? (c.color || v3.amberLight) : 'rgba(255,255,255,0.40)', cursor: 'pointer',
                  }}>{c.name}</button>
                ))}
              </div>
            </div>
          )}

          {/* Status chips */}
          <div>
            <label style={v3label}>Status</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['committed', 'Committed', 'We have a verbal — no order yet'], ['on_shelf', 'On Shelf', 'Product is already placed']] as const).map(([v, l, d]) => (
                <button key={v} type="button" onClick={() => setStatus(v)} style={{
                  flex: 1, padding: '9px 10px', borderRadius: v3.radius.md, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${status === v ? 'rgba(196,164,110,0.45)' : 'rgba(255,255,255,0.08)'}`,
                  background: status === v ? 'rgba(196,164,110,0.09)' : 'rgba(255,255,255,0.02)',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: status === v ? v3.amberLight : 'rgba(255,255,255,0.50)' }}>{l}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>{d}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label style={v3label}>Type</label>
              <select value={type} onChange={e => setType(e.target.value)} style={{ ...v3input, appearance: 'none', background: v3.bg.sheet }}>
                {PLACEMENT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div><label style={v3label}>Shelf Count</label>
              <input type="number" value={shelf} onChange={e => setShelf(e.target.value)} placeholder="—" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
            <div><label style={v3label}>Price Point</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="$0" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
          </div>

          <div><label style={v3label}>Notes <span style={{ opacity: 0.4, fontWeight: 400 }}>(opt)</span></label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Shelf location, buyer notes…"
              style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
        </div>

        <button onClick={() => save.mutate()} disabled={!product.trim() || save.isPending}
          style={{
            marginTop: 24, width: '100%', padding: '13px',
            background: save.isPending ? v3.bg.sheet : v3.amber,
            color: '#000', border: 'none', borderRadius: v3.radius.md,
            fontSize: '13px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
          {save.isPending ? 'Saving…' : 'Add Placement'}
        </button>
      </div>
    </ModalBase>
  )
}

// ── Mark Lost Modal ───────────────────────────────────────────────────────────

function MarkLostModal({ placement, accountId, onClose }: { placement: any; accountId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const [reason, setReason] = useState('')

  const markLost = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { error } = await sb.from('placements').update({
        lost_at: new Date().toISOString(),
        lost_reason: reason.trim() || null,
      }).eq('id', placement.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'account', accountId, 'placements'] })
      qc.invalidateQueries({ queryKey: ['v3', 'placements'] })
      toast('Placement marked as lost')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
  })

  return (
    <ModalBase onClose={onClose} maxWidth={400}>
      <div style={{ padding: '24px 28px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: v3.status.danger, letterSpacing: '-0.02em' }}>Mark Placement Lost</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.40)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
        </div>
        <div style={{ fontSize: '14px', color: v3.text.secondary, marginBottom: 16 }}>
          <strong style={{ color: v3.text.primary }}>{placement.product_name}</strong> will be moved to lost. This records the date and reason for your brand reports.
        </div>
        <label style={v3label}>Reason <span style={{ opacity: 0.4, fontWeight: 400 }}>(optional)</span></label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
          placeholder="Price too high, buyer changed, delisted, competitor won the spot…"
          style={{ ...v3input, background: v3.bg.sheet, resize: 'none', marginBottom: 20 } as any} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'transparent', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.secondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => markLost.mutate()} disabled={markLost.isPending}
            style={{ flex: 2, padding: '11px', background: v3.status.danger, color: '#fff', border: 'none', borderRadius: v3.radius.md, fontSize: '13px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {markLost.isPending ? 'Saving…' : 'Mark Lost'}
          </button>
        </div>
      </div>
    </ModalBase>
  )
}

// ── Edit Placement Modal ──────────────────────────────────────────────────────

function EditPlacementModal({ placement, accountId, onClose }: { placement: any; accountId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const [product, setProduct] = useState(placement.product_name ?? '')
  const [type, setType]       = useState(placement.placement_type ?? 'shelf')
  const [price, setPrice]     = useState(placement.price_point != null ? String(placement.price_point) : '')
  const [shelf, setShelf]     = useState(placement.shelf_count != null ? String(placement.shelf_count) : '')
  const [notes, setNotes]     = useState(placement.notes ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { error } = await sb.from('placements').update({
        product_name:    product.trim(),
        placement_type:  type,
        price_point:     price ? Number(price) : null,
        shelf_count:     shelf ? Number(shelf) : null,
        notes:           notes.trim() || null,
      }).eq('id', placement.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'account', accountId, 'placements'] })
      qc.invalidateQueries({ queryKey: ['v3', 'placements'] })
      toast('Placement updated')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to save', 'error'),
  })

  return (
    <ModalBase onClose={onClose} maxWidth={440}>
      <div style={{ padding: '24px 28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Edit Placement</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.40)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={v3label}>Product Name *</label>
            <input value={product} onChange={e => setProduct(e.target.value)} autoFocus
              style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label style={v3label}>Type</label>
              <select value={type} onChange={e => setType(e.target.value)} style={{ ...v3input, appearance: 'none' as any, background: v3.bg.sheet }}>
                {PLACEMENT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div><label style={v3label}>Shelf Count</label>
              <input type="number" value={shelf} onChange={e => setShelf(e.target.value)} placeholder="—" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
            <div><label style={v3label}>Price Point</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="$0" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
          </div>
          <div><label style={v3label}>Notes <span style={{ opacity: 0.4, fontWeight: 400 }}>(opt)</span></label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Shelf location, buyer notes…" style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
        </div>

        <button onClick={() => save.mutate()} disabled={!product.trim() || save.isPending}
          style={{
            marginTop: 24, width: '100%', padding: '13px',
            background: save.isPending ? v3.bg.sheet : v3.amber,
            color: '#000', border: 'none', borderRadius: v3.radius.md,
            fontSize: '13px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
          {save.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </ModalBase>
  )
}

// ── Edit Visit Modal ──────────────────────────────────────────────────────────

const VISIT_STATUSES = [
  'Will Order Soon', 'Just Ordered', 'Needs Follow Up',
  'Not Interested', 'Menu Feature Won', 'New Placement', 'General Check-In', 'Tasted',
] as const

function EditVisitModal({ visit, accountId, onClose }: { visit: any; accountId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const [status, setStatus]        = useState<string>(visit.status ?? 'General Check-In')
  const [notes, setNotes]          = useState(visit.notes ?? '')
  const [tastingNotes, setTasting] = useState(visit.tasting_notes ?? '')
  const [feedback, setFeedback]    = useState(visit.feedback ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { error } = await sb.from('visits').update({
        status,
        notes:         notes.trim() || null,
        tasting_notes: tastingNotes.trim() || null,
        feedback:      feedback.trim() || null,
      }).eq('id', visit.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'account', accountId, 'visits'] })
      qc.invalidateQueries({ queryKey: ['v3', 'visits'] })
      qc.invalidateQueries({ queryKey: ['v3', 'followups'] })
      toast('Visit updated')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to update', 'error'),
  })

  return (
    <ModalBase onClose={onClose} maxWidth={460}>
      <div style={{ padding: '24px 28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Edit Visit</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.40)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={v3label}>Outcome</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {VISIT_STATUSES.map(s => {
                const sc = VISIT_STATUS_COLOR[s] ?? v3.text.muted
                const sel = status === s
                return (
                  <button key={s} type="button" onClick={() => setStatus(s)} style={{
                    textAlign: 'left', padding: '7px 12px', borderRadius: v3.radius.sm,
                    border: `1px solid ${sel ? sc + '50' : 'rgba(255,255,255,0.07)'}`,
                    background: sel ? sc + '12' : 'transparent',
                    color: sel ? sc : 'rgba(255,255,255,0.45)',
                    fontSize: '13px', fontWeight: sel ? 700 : 400, cursor: 'pointer',
                  }}>
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label style={v3label}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="What happened, what's the plan…"
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none', lineHeight: 1.5 } as any} />
          </div>

          <div>
            <label style={v3label}>Tasting Notes <span style={{ opacity: 0.4, fontWeight: 400 }}>(optional)</span></label>
            <textarea value={tastingNotes} onChange={e => setTasting(e.target.value)} rows={2}
              placeholder="Consumer feedback, bartender reactions…"
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none', lineHeight: 1.5 } as any} />
          </div>

          <div>
            <label style={v3label}>Buyer Feedback <span style={{ opacity: 0.4, fontWeight: 400 }}>(optional)</span></label>
            <input value={feedback} onChange={e => setFeedback(e.target.value)}
              placeholder="What the buyer or manager said about the product…"
              style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
        </div>

        <button onClick={() => save.mutate()} disabled={save.isPending}
          style={{
            marginTop: 24, width: '100%', padding: '13px',
            background: save.isPending ? v3.bg.sheet : v3.amber,
            color: '#000', border: 'none', borderRadius: v3.radius.md,
            fontSize: '13px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
          {save.isPending ? 'Saving…' : 'Save Visit'}
        </button>
      </div>
    </ModalBase>
  )
}

// ── Create Order Modal ────────────────────────────────────────────────────────

function CreateOrderModal({ accountId, accountName, linkedClients, onClose }: {
  accountId: string; accountName: string; linkedClients: Client[]; onClose: () => void
}) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const [slug, setSlug]         = useState(linkedClients[0]?.slug ?? '')
  const [type, setType]         = useState<'direct' | 'distributor'>('direct')
  const [poNum, setPoNum]       = useState('')
  const [notes, setNotes]       = useState('')
  const [product, setProduct]   = useState('')
  const [qty, setQty]           = useState('1')
  const [price, setPrice]       = useState('')

  const lineTotal = (Number(qty) || 1) * (Number(price) || 0)
  const orderTotal = lineTotal

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { data: order, error: oErr } = await sb.from('purchase_orders').insert({
        account_id:     accountId,
        deliver_to_name: accountName,
        client_slug:    slug || null,
        order_type:     type,
        status:         'draft',
        po_number:      poNum.trim() || null,
        notes:          notes.trim() || null,
        total_amount:   orderTotal || null,
      }).select('id').single()
      if (oErr) throw oErr
      if (product.trim() && order) {
        await sb.from('po_line_items').insert({
          purchase_order_id: order.id,
          product_name:      product.trim(),
          quantity:          Number(qty) || 1,
          unit_price:        Number(price) || 0,
          total:             lineTotal,
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'account', accountId, 'orders'] })
      qc.invalidateQueries({ queryKey: ['v3', 'orders'] })
      toast('Order created')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to create order', 'error'),
  })

  return (
    <ModalBase onClose={onClose} maxWidth={480}>
      <div style={{ padding: '24px 28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>New Order</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.40)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Brand */}
          {linkedClients.length > 0 && (
            <div>
              <label style={v3label}>Brand</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {linkedClients.map(c => (
                  <button key={c.slug} type="button" onClick={() => setSlug(c.slug)} style={{
                    padding: '6px 12px', borderRadius: v3.radius.full, fontSize: '12px', fontWeight: 600,
                    border: `1px solid ${slug === c.slug ? (c.color || v3.amber) + '60' : 'rgba(255,255,255,0.08)'}`,
                    background: slug === c.slug ? (c.color || v3.amber) + '12' : 'transparent',
                    color: slug === c.slug ? (c.color || v3.amberLight) : 'rgba(255,255,255,0.40)', cursor: 'pointer',
                  }}>{c.name}</button>
                ))}
              </div>
            </div>
          )}

          {/* Order type */}
          <div>
            <label style={v3label}>Order Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['direct', 'Direct PO', 'We send direct to account'], ['distributor', 'Distributor', 'Inquiry sent to distributor']] as const).map(([v, l, d]) => (
                <button key={v} type="button" onClick={() => setType(v)} style={{
                  flex: 1, padding: '9px 10px', borderRadius: v3.radius.md, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${type === v ? 'rgba(196,164,110,0.45)' : 'rgba(255,255,255,0.08)'}`,
                  background: type === v ? 'rgba(196,164,110,0.09)' : 'rgba(255,255,255,0.02)',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: type === v ? v3.amberLight : 'rgba(255,255,255,0.50)' }}>{l}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>{d}</div>
                </button>
              ))}
            </div>
          </div>

          {/* PO# */}
          <div><label style={v3label}>PO Number <span style={{ opacity: 0.4, fontWeight: 400 }}>(optional)</span></label>
            <input value={poNum} onChange={e => setPoNum(e.target.value)} placeholder="PO-2026-001"
              style={{ ...v3input, background: v3.bg.sheet }} />
          </div>

          {/* Line item */}
          <div style={{ padding: '12px 14px', background: v3.bg.surface, borderRadius: v3.radius.md, border: `1px solid ${v3.border.subtle}` }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 10 }}>Line Item <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={product} onChange={e => setProduct(e.target.value)} placeholder="Product name / SKU"
                style={{ ...v3input, background: v3.bg.sheet }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={v3label}>Qty</label>
                  <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1" placeholder="1"
                    style={{ ...v3input, background: v3.bg.sheet }} />
                </div>
                <div><label style={v3label}>Unit Price</label>
                  <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="$0"
                    style={{ ...v3input, background: v3.bg.sheet }} />
                </div>
              </div>
              {lineTotal > 0 && (
                <div style={{ fontSize: '12px', color: v3.amberLight, fontWeight: 700, textAlign: 'right' }}>
                  Total: ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div><label style={v3label}>Notes <span style={{ opacity: 0.4, fontWeight: 400 }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Special instructions, delivery notes…"
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none' } as any} />
          </div>
        </div>

        <button onClick={() => save.mutate()} disabled={save.isPending}
          style={{
            marginTop: 20, width: '100%', padding: '13px',
            background: save.isPending ? v3.bg.sheet : v3.amber,
            color: '#000', border: 'none', borderRadius: v3.radius.md,
            fontSize: '13px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
          {save.isPending ? 'Creating…' : 'Create Order (Draft)'}
        </button>
      </div>
    </ModalBase>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHdr({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <span style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.22em' }}>{label}</span>
      {action}
    </div>
  )
}

function AddBtn({ onClick, label = 'Add' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
      background: 'transparent', border: `1px solid rgba(196,164,110,0.22)`,
      borderRadius: '3px', fontSize: '10px', fontWeight: 700,
      color: 'rgba(196,164,110,0.60)', cursor: 'pointer', letterSpacing: '0.04em',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(196,164,110,0.07)'; e.currentTarget.style.borderColor = 'rgba(196,164,110,0.45)'; e.currentTarget.style.color = '#d4b47e' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(196,164,110,0.22)'; e.currentTarget.style.color = 'rgba(196,164,110,0.60)' }}>
      <Plus size={10} strokeWidth={2.5} />{label}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccountDetailPage() {
  const { id } = useParams() as { id: string }
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()

  const { data: account, isLoading: acctLoading } = useAccount(id)
  const { data: visits = [] } = useAccountVisits(id)
  const { data: placements = [] } = useAccountPlacements(id)
  const { data: contacts = [] } = useAccountContacts(id)
  const { data: orders = [] } = useAccountOrders(id)
  const { data: clients = [] } = useV3Clients()
  const { open: openLogVisit } = useOpenLogVisit()
  const { trigger: triggerWin } = useWinMoment()
  const advancePlacement = useAdvancePlacement()

  const [showEdit, setShowEdit]             = useState(false)
  const [showAddPlacement, setShowAddPlacement] = useState(false)
  const [editPlacement, setEditPlacement]   = useState<any | null>(null)
  const [editVisit, setEditVisit]           = useState<any | null>(null)
  const [contactModal, setContactModal]     = useState<{ mode: 'add' | 'edit'; contact?: any } | null>(null)
  const [lostModal, setLostModal]           = useState<any>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteVisitId, setConfirmDeleteVisitId] = useState<string | null>(null)
  const [showCreateOrder, setShowCreateOrder] = useState(false)
  const [showAllVisits, setShowAllVisits]     = useState(false)
  const [showAllOrders, setShowAllOrders]     = useState(false)
  const [briefNoteExpanded, setBriefNoteExpanded] = useState(false)

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const sb = getSupabase()
      const { error } = await sb.from('contacts').delete().eq('id', contactId)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['v3', 'account', id, 'contacts'] }); setConfirmDeleteId(null); toast('Contact removed') },
    onError: (e: any) => toast(e?.message ?? 'Failed to delete', 'error'),
  })

  const deleteVisit = useMutation({
    mutationFn: async (visitId: string) => {
      const sb = getSupabase()
      const { error } = await sb.from('visits').delete().eq('id', visitId)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['v3', 'account', id, 'visits'] }); qc.invalidateQueries({ queryKey: ['v3', 'visits'] }); setConfirmDeleteVisitId(null); toast('Visit deleted') },
    onError: (e: any) => toast(e?.message ?? 'Failed to delete visit', 'error'),
  })

  if (acctLoading) return (
    <div style={{ padding: '24px', color: v3.text.muted, fontSize: '13px' }}>
      <Link href="/v3/territory" style={{ color: v3.text.muted, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 16, fontSize: '12px' }}>
        <ArrowLeft size={12} /> Territory
      </Link>
      <div>Loading…</div>
    </div>
  )

  if (!account) return (
    <div style={{ padding: '24px', color: v3.text.muted, fontSize: '13px' }}>
      <Link href="/v3/territory" style={{ color: v3.amberLight, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 16, fontSize: '12px' }}>
        <ArrowLeft size={12} /> Territory
      </Link>
      <div>Account not found.</div>
    </div>
  )

  const hc = healthColor(account.last_visited, account.visit_frequency_days)
  const hl = healthLabel(account.last_visited, account.visit_frequency_days)

  const gradeResult = computeGrade(
    account.id,
    orders.map((o: any) => ({ ...o, account_id: account.id })),
    visits.map((v: any) => ({ ...v, account_id: account.id })),
    placements.map((p: any) => ({ ...p, account_id: account.id })),
    50000,
  )
  const gradeCfg = GRADE_CONFIG[gradeResult.grade]

  const clientSlugs: string[] = (account.account_clients ?? []).map((ac: any) => ac.client_slug).filter(Boolean)
  const linkedClients = clients.filter((c: any) => clientSlugs.includes(c.slug))
  const latestVisit = visits[0] ?? null
  const activePlacements = placements.filter((p: any) => !p.lost_at)
  const lostPlacements = placements.filter((p: any) => p.lost_at)
  const primaryContact = contacts.find((c: any) => c.is_decision_maker) ?? contacts[0] ?? null
  const openFollowUps = visits.filter((v: any) =>
    (v.status === 'Will Order Soon' || v.status === 'Needs Follow Up') &&
    !v.follow_up_cleared_at && !v.follow_up_dismissed_at
  )
  const lastVisitedStr = account.last_visited
    ? relativeTimeStr(account.last_visited) ?? formatShortDateMT(account.last_visited)
    : 'Never'

  const atRisk = activePlacements.filter((p: any) => {
    const ageDays = (Date.now() - new Date(p.created_at).getTime()) / 86400000
    const updatedDays = (Date.now() - new Date((p.updated_at || p.created_at)).getTime()) / 86400000
    return (p.status === 'committed' && ageDays > 30) || (p.status === 'ordered' && updatedDays > 14)
  })

  const freqLabel = account.visit_frequency_days ? `Every ${account.visit_frequency_days}d` : '—'
  const daysOverdue = account.last_visited && account.visit_frequency_days
    ? Math.floor((Date.now() - new Date(account.last_visited).getTime()) / 86400000) - account.visit_frequency_days
    : null
  const typeLabel = account.account_type === 'on_premise' ? 'On-Premise' : 'Off-Premise'

  const WIN_SET = new Set(['New Placement', 'Menu Feature Won', 'Just Ordered'])
  const wins = visits.filter((v: any) => WIN_SET.has(v.status)).length
  const winRate = visits.length > 0 ? Math.round((wins / visits.length) * 100) : null

  const totalRevenue = orders
    .filter((o: any) => ['sent', 'fulfilled'].includes(o.status))
    .reduce((s: number, o: any) => {
      const lineTotal = (o.po_line_items ?? []).reduce((ls: number, li: any) => ls + (Number(li.total) || 0), 0)
      return s + (lineTotal || Number(o.total_amount) || 0)
    }, 0)

  const now30 = Date.now() - 30 * 86400000
  const visits30 = visits.filter((v: any) => new Date(v.visited_at).getTime() >= now30).length

  const visibleVisits = showAllVisits ? visits : visits.slice(0, 5)
  const visibleOrders = showAllOrders ? orders : orders.slice(0, 4)

  return (
    <div style={{ minHeight: '100vh', background: v3.bg.page }}>

      {/* ── Back nav ──────────────────────────────────────────────── */}
      <div style={{ padding: '16px 28px 0' }}>
        <Link href="/v3/territory" style={{ color: 'rgba(255,255,255,0.38)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = v3.amberLight}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.38)'}>
          <ArrowLeft size={11} strokeWidth={2.5} /> Territory
        </Link>
      </div>

      {/* ── Hero header ───────────────────────────────────────────── */}
      <div style={{ padding: '16px 28px 20px', borderTop: `2px solid ${hc}`, marginTop: 12, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160, background: `radial-gradient(ellipse at 0% 0%, ${hc}08 0%, transparent 60%)`, pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: hc, boxShadow: `0 0 12px ${hc}90`, flexShrink: 0 }} />
              <h1 style={{ fontSize: '28px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.04em', margin: 0, lineHeight: 1 }}>
                {account.name}
              </h1>
              <span style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '3px', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
                {typeLabel}
              </span>
              {account.priority && (
                <span style={{
                  fontSize: '11px', fontWeight: 900, letterSpacing: '0.04em', flexShrink: 0,
                  color: account.priority === 'A' ? v3.amberLight : account.priority === 'B' ? v3.status.warning : v3.text.muted,
                }}>
                  {account.priority}-Priority
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              {account.address && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', color: v3.text.secondary }}>
                  <MapPin size={10} color={v3.text.muted} />{account.address}
                </span>
              )}
              {account.phone && (
                <a href={`tel:${account.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', color: v3.text.link, textDecoration: 'none' }}>
                  <Phone size={10} />{account.phone}
                </a>
              )}
              {account.website && (
                <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', color: v3.text.link, textDecoration: 'none' }}>
                  <Globe size={10} />Website
                </a>
              )}
              {account.instagram && (
                <a href={`https://instagram.com/${account.instagram.replace('@','')}`} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', color: v3.text.link, textDecoration: 'none' }}>
                  <Instagram size={10} />{account.instagram.startsWith('@') ? account.instagram : `@${account.instagram}`}
                </a>
              )}
            </div>

            {(account.best_days?.length > 0 || account.best_time || account.notes) && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                {account.best_days?.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', color: v3.text.secondary }}>
                    <CalendarDays size={10} color={v3.text.muted} />
                    <span style={{ color: v3.text.muted, fontWeight: 700 }}>Best:</span>
                    {account.best_days.join(', ')}
                    {account.best_time && <span style={{ color: v3.text.muted }}> · {account.best_time}</span>}
                  </div>
                )}
                {account.notes && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', color: v3.text.secondary }}>
                    <StickyNote size={10} color={v3.text.muted} />
                    {account.notes}
                  </div>
                )}
              </div>
            )}

            {linkedClients.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {linkedClients.map((c: any) => {
                  const logo = clientLogoUrl(c)
                  const ac = c.color || v3.amber
                  return (
                    <Link key={c.slug} href={`/v3/brands/${c.slug}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: ac + '0e', border: `1px solid ${ac}22`, borderRadius: '3px', textDecoration: 'none' }}>
                      {logo ? <img src={logo} alt="" style={{ width: 12, height: 12, objectFit: 'contain' }} /> : <span style={{ fontSize: '9px', fontWeight: 900, color: ac }}>{c.name[0]}</span>}
                      <span style={{ fontSize: '10px', fontWeight: 700, color: ac }}>{c.name}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'flex-start' }}>
            <button onClick={() => setShowEdit(true)} title="Edit account" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
              background: 'transparent', border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md,
              color: v3.text.muted, cursor: 'pointer',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(196,164,110,0.40)'; e.currentTarget.style.color = v3.text.secondary }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = v3.border.strong; e.currentTarget.style.color = v3.text.muted }}>
              <Settings size={13} />
            </button>
            {account.address && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(account.address)}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', height: 34, background: 'transparent', border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 700, color: v3.text.secondary, textDecoration: 'none', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                <Navigation size={12} />Directions
              </a>
            )}
            <button onClick={() => openLogVisit({ id: account.id, name: account.name })}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 18px', height: 34, background: v3.amber, color: '#000', border: 'none', borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.03em', whiteSpace: 'nowrap', boxShadow: `0 0 18px ${v3.amber}35` }}>
              Log Visit
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', borderTop: `1px solid ${v3.border.subtle}`, borderBottom: `1px solid ${v3.border.subtle}`, marginBottom: 20 }}>
        {[
          { label: 'Health',      value: hl,      color: hc,                              sub: account.visit_frequency_days ? freqLabel : null },
          { label: 'Last Visit',  value: lastVisitedStr, color: daysOverdue !== null && daysOverdue > 0 ? v3.status.danger : v3.text.secondary, sub: daysOverdue !== null && daysOverdue > 0 ? `${daysOverdue}d overdue` : null },
          { label: 'Visits 30d',  value: String(visits30), color: visits30 > 0 ? v3.amberLight : v3.text.muted, sub: `${visits.length} all time` },
          { label: 'Win Rate',    value: winRate !== null ? `${winRate}%` : '—', color: winRate !== null && winRate >= 50 ? v3.status.success : winRate !== null ? v3.status.warning : v3.text.muted, sub: wins > 0 ? `${wins} wins` : 'no wins yet' },
          { label: 'Placements',  value: String(activePlacements.length), color: activePlacements.length > 0 ? v3.status.success : v3.text.muted, sub: atRisk.length > 0 ? `${atRisk.length} at risk` : lostPlacements.length > 0 ? `${lostPlacements.length} lost` : 'active' },
          { label: 'Revenue',     value: totalRevenue > 0 ? `$${totalRevenue >= 1000 ? (totalRevenue / 1000).toFixed(1) + 'k' : Math.round(totalRevenue)}` : '—', color: totalRevenue > 0 ? v3.amberLight : v3.text.muted, sub: `${orders.filter((o: any) => ['sent','fulfilled'].includes(o.status)).length} orders` },
        ].map((k, i) => (
          <div key={k.label} style={{
            padding: '12px 16px',
            borderRight: i < 5 ? `1px solid ${v3.border.subtle}` : 'none',
            background: 'transparent',
          }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 5 }}>{k.label}</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: k.color, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 3 }}>{k.value}</div>
            {k.sub && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)', fontWeight: 500 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Main layout ──────────────────────────────────────────── */}
      <div style={{ padding: '0 28px 64px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Pre-visit brief */}
          <div style={{ borderLeft: `2px solid ${v3.amber}40`, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '6px 16px 6px', borderBottom: `1px solid ${v3.border.subtle}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: `${v3.amber}90`, textTransform: 'uppercase', letterSpacing: '0.22em' }}>Pre-Visit Brief</span>
              {openFollowUps.length > 0 && (
                <span style={{ fontSize: '9px', fontWeight: 700, color: v3.status.warning, background: 'rgba(160,132,64,0.12)', padding: '2px 7px', borderRadius: '3px', letterSpacing: '0.04em' }}>
                  {openFollowUps.length} OPEN FOLLOW-UP{openFollowUps.length !== 1 ? 'S' : ''}
                </span>
              )}
              {atRisk.length > 0 && (
                <span style={{ fontSize: '9px', fontWeight: 700, color: v3.amber, background: 'rgba(196,164,110,0.10)', padding: '2px 7px', borderRadius: '3px', letterSpacing: '0.04em' }}>
                  {atRisk.length} AT RISK
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              {/* Last visit */}
              <div style={{ padding: '12px 16px', borderRight: `1px solid ${v3.border.subtle}` }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 8 }}>Last Visit</div>
                {latestVisit ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: VISIT_STATUS_COLOR[latestVisit.status] ?? v3.text.muted, boxShadow: `0 0 6px ${VISIT_STATUS_COLOR[latestVisit.status] ?? v3.text.muted}80`, flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', fontWeight: 700, color: VISIT_STATUS_COLOR[latestVisit.status] ?? v3.text.primary }}>{latestVisit.status}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: v3.text.muted, marginBottom: latestVisit.notes ? 8 : 0 }}>
                      {relativeTimeStr(latestVisit.visited_at) ?? formatShortDateMT(latestVisit.visited_at)}
                    </div>
                    {latestVisit.notes && (
                      <div style={{ fontSize: '11px', color: v3.text.secondary, lineHeight: 1.5, fontStyle: 'italic', borderLeft: `2px solid ${v3.border.default}`, paddingLeft: 8 }}>
                        "{briefNoteExpanded ? latestVisit.notes : latestVisit.notes.slice(0, 100)}{!briefNoteExpanded && latestVisit.notes.length > 100 ? '…' : ''}"
                        {latestVisit.notes.length > 100 && (
                          <button onClick={() => setBriefNoteExpanded((e: boolean) => !e)} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '10px', padding: '0 0 0 4px', fontStyle: 'normal' }}>
                            {briefNoteExpanded ? 'less' : 'more'}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: '12px', color: v3.text.muted, fontStyle: 'italic' }}>No visits logged yet</div>
                )}
              </div>

              {/* Talk to */}
              <div style={{ padding: '12px 16px', borderRight: `1px solid ${v3.border.subtle}` }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 8 }}>Talk To</div>
                {primaryContact ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: (CATEGORY_META[primaryContact.category]?.color || v3.amber) + '18', border: `1px solid ${(CATEGORY_META[primaryContact.category]?.color || v3.amber)}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: CATEGORY_META[primaryContact.category]?.color || v3.amberLight }}>
                          {primaryContact.name[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: v3.text.primary, lineHeight: 1.2 }}>{primaryContact.name}</div>
                        {primaryContact.role && <div style={{ fontSize: '10px', color: v3.text.muted }}>{primaryContact.role}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {primaryContact.phone && (
                        <a href={`tel:${primaryContact.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', color: v3.text.link, textDecoration: 'none' }}>
                          <Phone size={9} />{primaryContact.phone}
                        </a>
                      )}
                      {primaryContact.email && (
                        <a href={`mailto:${primaryContact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', color: v3.text.link, textDecoration: 'none' }}>
                          <Mail size={9} />{primaryContact.email}
                        </a>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '12px', color: v3.text.muted }}>
                    No contacts yet —{' '}
                    <button onClick={() => setContactModal({ mode: 'add' })} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '12px', padding: 0, textDecoration: 'underline' }}>add one</button>
                  </div>
                )}
              </div>

              {/* Open items */}
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 8 }}>Open Items</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {openFollowUps.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: v3.status.warning, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: v3.status.warning, fontWeight: 600 }}>{openFollowUps.length} follow-up{openFollowUps.length !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {atRisk.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: v3.amber, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: v3.amber, fontWeight: 600 }}>{atRisk.length} placement{atRisk.length !== 1 ? 's' : ''} at risk</span>
                    </div>
                  )}
                  {daysOverdue !== null && daysOverdue > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: v3.status.danger, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: v3.status.danger, fontWeight: 600 }}>{daysOverdue}d overdue</span>
                    </div>
                  )}
                  {openFollowUps.length === 0 && atRisk.length === 0 && (daysOverdue === null || daysOverdue <= 0) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: v3.status.success, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: v3.status.success, fontWeight: 600 }}>All clear</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Placements */}
          <div style={{ borderTop: `1px solid ${v3.border.subtle}`, padding: '20px 0' }}>
            <SectionHdr label={`Placements · ${activePlacements.length} active`} action={<AddBtn onClick={() => setShowAddPlacement(true)} />} />

            {activePlacements.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activePlacements.map((p: any) => {
                  const sc = PLAC_STATUS_COLOR[p.status] ?? v3.text.muted
                  const nextStatus = PLAC_STATUS_NEXT[p.status]
                  const isAtRisk = atRisk.find((r: any) => r.id === p.id)
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                      borderBottom: `1px solid ${isAtRisk ? v3.amber + '20' : v3.border.subtle}`,
                    }}>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        {(['committed', 'ordered', 'on_shelf', 'reordering'] as const).map(s => (
                          <div key={s} style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: s === p.status ? PLAC_STATUS_COLOR[s] : 'rgba(255,255,255,0.10)',
                            boxShadow: s === p.status ? `0 0 6px ${PLAC_STATUS_COLOR[s]}80` : 'none',
                          }} />
                        ))}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: v3.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.product_name}</span>
                          {isAtRisk && <AlertTriangle size={10} color={v3.amber} />}
                        </div>
                        <div style={{ fontSize: '10px', color: v3.text.muted }}>
                          {PLAC_STATUS_LABEL[p.status]}
                          {p.placement_type && ` · ${p.placement_type.replace('_', ' ')}`}
                          {p.price_point && ` · $${p.price_point}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        {nextStatus && (
                          <button onClick={() => advancePlacement.mutate({ id: p.id, status: p.status })} title={`Advance to ${PLAC_STATUS_LABEL[nextStatus]}`}
                            style={{ padding: '4px 8px', background: sc + '14', border: `1px solid ${sc}30`, borderRadius: '3px', fontSize: '10px', fontWeight: 700, color: sc, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            → {PLAC_STATUS_LABEL[nextStatus]}
                          </button>
                        )}
                        <button onClick={() => setEditPlacement(p)} style={{ padding: '4px 7px', background: 'transparent', border: `1px solid ${v3.border.default}`, borderRadius: '3px', color: v3.text.muted, cursor: 'pointer' }}>
                          <Pencil size={10} />
                        </button>
                        <button onClick={() => setLostModal(p)} title="Mark lost" style={{ padding: '4px 7px', background: 'transparent', border: `1px solid rgba(191,120,80,0.20)`, borderRadius: '3px', color: v3.status.danger, cursor: 'pointer' }}>
                          <X size={10} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: v3.text.muted, fontStyle: 'italic' }}>
                No active placements —{' '}
                <button onClick={() => setShowAddPlacement(true)} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '12px', padding: 0, textDecoration: 'underline' }}>add one</button>
              </div>
            )}

            {lostPlacements.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${v3.border.subtle}` }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 8 }}>Lost</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {lostPlacements.map((p: any) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'rgba(255,255,255,0.28)' }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.20)', flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.product_name}</span>
                      {p.lost_reason && <span style={{ fontSize: '10px', fontStyle: 'italic' }}>{p.lost_reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Orders */}
          <div style={{ borderTop: `1px solid ${v3.border.subtle}`, padding: '20px 0' }}>
            <SectionHdr label="Orders & Inquiries" action={<AddBtn onClick={() => setShowCreateOrder(true)} />} />
            {orders.length === 0 ? (
              <div style={{ fontSize: '12px', color: v3.text.muted, fontStyle: 'italic' }}>
                No orders yet —{' '}
                <button onClick={() => setShowCreateOrder(true)} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '12px', padding: 0, textDecoration: 'underline' }}>create one</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {visibleOrders.map((o: any) => {
                    const lineTotal = (o.po_line_items ?? []).reduce((s: number, li: any) => s + (Number(li.total) || 0), 0)
                    const amount = lineTotal || Number(o.total_amount) || 0
                    const statusColor: Record<string, string> = { draft: v3.text.muted, sent: v3.status.warning, fulfilled: v3.status.success, cancelled: v3.status.danger }
                    const sc = statusColor[o.status] ?? v3.text.muted
                    return (
                      <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${v3.border.subtle}` }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: v3.text.secondary }}>
                            {o.po_number || (o.order_type === 'distributor' ? 'Distributor Inquiry' : 'Direct Order')}
                          </div>
                          <div style={{ fontSize: '10px', color: v3.text.muted }}>{formatShortDateMT(o.sent_at || o.created_at)}</div>
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: sc, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{o.status}</div>
                        {amount > 0 && <div style={{ fontSize: '13px', fontWeight: 800, color: v3.amberLight, fontFamily: 'monospace', flexShrink: 0 }}>${amount.toLocaleString()}</div>}
                      </div>
                    )
                  })}
                </div>
                {orders.length > 4 && (
                  <button onClick={() => setShowAllOrders((v: boolean) => !v)} style={{ marginTop: 8, background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '11px', padding: '4px 0' }}>
                    {showAllOrders ? 'Show less' : `Show all ${orders.length} orders`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Visit history timeline */}
          <div style={{ borderTop: `1px solid ${v3.border.subtle}`, padding: '20px 0' }}>
            <SectionHdr label={`Visit History · ${visits.length}`} />
            {visits.length === 0 ? (
              <div style={{ fontSize: '12px', color: v3.text.muted, fontStyle: 'italic' }}>No visit history yet.</div>
            ) : (
              <>
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 1, background: v3.border.subtle }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {visibleVisits.map((v: any) => {
                      const sc = VISIT_STATUS_COLOR[v.status] ?? v3.text.muted
                      const isWin = WIN_SET.has(v.status)
                      return (
                        <div key={v.id} style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
                          <div style={{
                            position: 'absolute', left: -14, top: 3,
                            width: 10, height: 10, borderRadius: '50%',
                            background: sc, border: `1.5px solid ${v3.bg.card}`,
                            boxShadow: `0 0 ${isWin ? '8px' : '4px'} ${sc}${isWin ? '90' : '50'}`,
                            flexShrink: 0,
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: v.notes ? 4 : 0 }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: sc }}>{v.status}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                <span style={{ fontSize: '10px', color: v3.text.muted }}>{relativeTimeStr(v.visited_at) ?? formatShortDateMT(v.visited_at)}</span>
                                <button onClick={() => setEditVisit(v)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.20)', cursor: 'pointer', padding: 0 }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = v3.amberLight}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.20)'}>
                                  <Pencil size={10} />
                                </button>
                                {confirmDeleteVisitId === v.id ? (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => deleteVisit.mutate(v.id)} style={{ background: 'none', border: 'none', color: v3.status.danger, cursor: 'pointer', fontSize: '10px', padding: 0, fontWeight: 700 }}>Delete</button>
                                    <button onClick={() => setConfirmDeleteVisitId(null)} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', fontSize: '10px', padding: 0 }}>Cancel</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setConfirmDeleteVisitId(v.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.15)', cursor: 'pointer', padding: 0 }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = v3.status.danger}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.15)'}>
                                    <Trash2 size={10} />
                                  </button>
                                )}
                              </div>
                            </div>
                            {v.notes && <div style={{ fontSize: '11px', color: v3.text.muted, lineHeight: 1.45, fontStyle: 'italic' }}>"{v.notes}"</div>}
                            {v.feedback && <div style={{ fontSize: '10px', color: v3.text.muted, marginTop: 2 }}>Feedback: {v.feedback}</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {visits.length > 5 && (
                  <button onClick={() => setShowAllVisits((v: boolean) => !v)} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '11px', padding: '4px 0' }}>
                    {showAllVisits ? 'Show less' : `Show all ${visits.length} visits`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Grade section */}
          <div style={{ padding: '0 0 24px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 14 }}>Account Grade</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '8px', flexShrink: 0,
                background: gradeCfg.bg, border: `1.5px solid ${gradeCfg.border}`,
                boxShadow: gradeCfg.glow !== 'none' ? gradeCfg.glow : undefined,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '26px', fontWeight: 900, color: gradeCfg.color, letterSpacing: '-0.03em', lineHeight: 1, userSelect: 'none' }}>
                  {gradeResult.grade}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: gradeCfg.color, letterSpacing: '-0.01em' }}>{gradeCfg.label}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)', marginTop: 2, fontFamily: 'monospace' }}>
                  {gradeResult.score} / 100 points
                </div>
                {gradeResult.momentum !== 'flat' && (
                  <div style={{ fontSize: '10px', fontWeight: 700, marginTop: 4, color: gradeResult.momentum === 'up' ? v3.status.success : 'rgba(191,120,80,0.85)' }}>
                    {gradeResult.momentum === 'up' ? '↑ Trending up' : '↓ Activity declining'}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${gradeResult.score}%`, background: gradeCfg.color, borderRadius: 2, transition: 'width 800ms cubic-bezier(0.4,0,0.2,1)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {([
                { key: 'revenue',   label: 'Revenue',      weight: '35%', desc: 'Lifetime order value' },
                { key: 'velocity',  label: 'Order Freq.',  weight: '20%', desc: 'Orders last 90 days' },
                { key: 'placement', label: 'Placements',   weight: '20%', desc: 'Active placement health' },
                { key: 'winRate',   label: 'Win Rate',     weight: '15%', desc: 'Visits with wins' },
                { key: 'recency',   label: 'Recency',      weight: '10%', desc: 'Days since last visit' },
              ] as const).map(({ key, label, weight }) => {
                const val = gradeResult.scores[key]
                const barColor = val >= 70 ? gradeCfg.color : val >= 40 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'
                return (
                  <div key={key}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{weight}</span>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', width: 22, textAlign: 'right' }}>{val}</span>
                      </div>
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${val}%`, background: barColor, borderRadius: 2, transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ borderTop: `1px solid ${v3.border.subtle}`, paddingTop: 12 }}>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.30)', lineHeight: 1.7 }}>
                <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.40)', marginBottom: 4 }}>How grades are calculated</div>
                Revenue (35%) + order frequency (20%) + active placements (20%) + win rate (15%) + visit recency (10%)
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {([['S', '#e8d48a', '82+'], ['A', '#5a9ea0', '65+'], ['B', '#6878b4', '45+'], ['C', '#a08440', '22+'], ['D', 'rgba(255,255,255,0.32)', '<22']] as const).map(([g, c, range]) => (
                  <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '11px', fontWeight: 900, color: c }}>{g}</span>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{range}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Contacts */}
          <div style={{ borderTop: `1px solid ${v3.border.subtle}`, paddingTop: 20 }}>
            <SectionHdr label="Contacts" action={<AddBtn onClick={() => setContactModal({ mode: 'add' })} />} />

            {contacts.length === 0 ? (
              <div style={{ fontSize: '12px', color: v3.text.muted, fontStyle: 'italic' }}>
                No contacts —{' '}
                <button onClick={() => setContactModal({ mode: 'add' })} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '12px', padding: 0, textDecoration: 'underline' }}>add a key contact</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {contacts.map((c: any) => {
                  const catMeta = CATEGORY_META[c.category] ?? CATEGORY_META.general
                  return (
                    <div key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: `1px solid ${v3.border.subtle}`, alignItems: 'flex-start' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: catMeta.color + '18', border: `1px solid ${catMeta.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: catMeta.color }}>{c.name[0].toUpperCase()}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: v3.text.primary }}>{c.name}</span>
                          {c.is_decision_maker && <span style={{ fontSize: '8px', fontWeight: 700, color: v3.amberLight, background: 'rgba(196,164,110,0.12)', padding: '1px 5px', borderRadius: '2px', letterSpacing: '0.06em' }}>KEY</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          {c.role && <span style={{ fontSize: '10px', color: v3.text.muted }}>{c.role}</span>}
                          <span style={{ fontSize: '9px', fontWeight: 700, color: catMeta.color, background: catMeta.color + '14', padding: '1px 5px', borderRadius: '2px' }}>{catMeta.label}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          {c.phone && <a href={`tel:${c.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: v3.text.link, textDecoration: 'none' }}><Phone size={9} />{c.phone}</a>}
                          {c.email && <a href={`mailto:${c.email}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: v3.text.link, textDecoration: 'none' }}><Mail size={9} />{c.email}</a>}
                        </div>
                        {c.notes && <div style={{ fontSize: '10px', color: v3.text.muted, marginTop: 4, fontStyle: 'italic' }}>{c.notes}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => setContactModal({ mode: 'edit', contact: c })} style={{ background: 'none', border: `1px solid ${v3.border.default}`, borderRadius: '3px', color: v3.text.muted, cursor: 'pointer', padding: '4px 6px' }}>
                          <Pencil size={10} />
                        </button>
                        {confirmDeleteId === c.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button onClick={() => deleteContact.mutate(c.id)} style={{ background: 'none', border: 'none', color: v3.status.danger, cursor: 'pointer', fontSize: '10px', fontWeight: 700, padding: 0 }}>Delete</button>
                            <button onClick={() => setConfirmDeleteId(null)} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', fontSize: '10px', padding: 0 }}>Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(c.id)} style={{ background: 'none', border: `1px solid rgba(191,120,80,0.20)`, borderRadius: '3px', color: v3.status.danger, cursor: 'pointer', padding: '4px 6px' }}>
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────── */}
      {showEdit && <EditAccountModal account={account} onClose={() => setShowEdit(false)} />}
      {showAddPlacement && <AddPlacementModal accountId={id} linkedClients={linkedClients} onClose={() => setShowAddPlacement(false)} />}
      {editPlacement && <EditPlacementModal placement={editPlacement} accountId={id} onClose={() => setEditPlacement(null)} />}
      {lostModal && <MarkLostModal placement={lostModal} accountId={id} onClose={() => setLostModal(null)} />}
      {editVisit && <EditVisitModal visit={editVisit} accountId={id} onClose={() => setEditVisit(null)} />}
      {showCreateOrder && <CreateOrderModal accountId={id} accountName={account.name} linkedClients={linkedClients} onClose={() => setShowCreateOrder(false)} />}
      {contactModal && (
        <ContactFormModal
          accountId={id}
          contact={contactModal.contact}
          linkedClients={linkedClients}
          onClose={() => setContactModal(null)}
        />
      )}
    </div>
  )
}
