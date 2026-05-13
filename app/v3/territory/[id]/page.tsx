'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, MapPin, Phone, Mail, ShoppingCart, User, Navigation,
  Clock, CalendarDays, Settings, Plus, X, Check, Pencil, Trash2,
  AlertTriangle, Package, GlassWater, StickyNote, Globe, Instagram,
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
import { GradeBadge, GradeDetail } from '../../components/GradeBadge'

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
        .select('*, account_clients(client_slug)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as any
    },
    enabled: !!id,
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
  })
}

function useAccountPlacements(id: string) {
  return useQuery({
    queryKey: ['v3', 'account', id, 'placements'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('placements')
        .select('*')
        .eq('account_id', id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!id,
  })
}

function useAccountContacts(id: string) {
  return useQuery({
    queryKey: ['v3', 'account', id, 'contacts'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('contacts')
        .select('*')
        .eq('account_id', id)
        .order('is_decision_maker', { ascending: false })
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!id,
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

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.18em', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 0, width: 16, height: 1, background: v3.border.subtle }} />
        {children}
        <div style={{ width: 16, height: 1, background: v3.border.subtle }} />
      </div>
      {action}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccountDetailPage() {
  const { id } = useParams() as { id: string }
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()

  const { data: account, isLoading: acctLoading } = useAccount(id)
  const { data: visits = [], isLoading: visitsLoading } = useAccountVisits(id)
  const { data: placements = [] } = useAccountPlacements(id)
  const { data: contacts = [] } = useAccountContacts(id)
  const { data: orders = [] } = useAccountOrders(id)
  const { data: clients = [] } = useV3Clients()
  const { open: openLogVisit } = useOpenLogVisit()
  const { trigger: triggerWin } = useWinMoment()
  const advancePlacement = useAdvancePlacement()

  // Modal state
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'account', id, 'contacts'] })
      setConfirmDeleteId(null)
      toast('Contact removed')
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to delete', 'error'),
  })

  const deleteVisit = useMutation({
    mutationFn: async (visitId: string) => {
      const sb = getSupabase()
      const { error } = await sb.from('visits').delete().eq('id', visitId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'account', id, 'visits'] })
      qc.invalidateQueries({ queryKey: ['v3', 'visits'] })
      setConfirmDeleteVisitId(null)
      toast('Visit deleted')
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to delete visit', 'error'),
  })

  if (acctLoading) {
    return (
      <div style={{ padding: '24px', color: v3.text.muted, fontSize: '13px' }}>
        <Link href="/v3/territory" style={{ color: v3.text.muted, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 16, fontSize: '12px' }}>
          <ArrowLeft size={12} /> Territory
        </Link>
        <div>Loading…</div>
      </div>
    )
  }

  if (!account) {
    return (
      <div style={{ padding: '24px', color: v3.text.muted, fontSize: '13px' }}>
        <Link href="/v3/territory" style={{ color: v3.amberLight, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 16, fontSize: '12px' }}>
          <ArrowLeft size={12} /> Territory
        </Link>
        <div>Account not found.</div>
      </div>
    )
  }

  const hc = healthColor(account.last_visited, account.visit_frequency_days)
  const hl = healthLabel(account.last_visited, account.visit_frequency_days)

  // Grade — computed from this account's actual data.
  // maxRevenue: use $50k as the normalization ceiling (top-tier account benchmark).
  const gradeResult = computeGrade(
    account.id,
    orders.map((o: any) => ({ ...o, account_id: account.id })),
    visits.map((v: any) => ({ ...v, account_id: account.id })),
    placements.map((p: any) => ({ ...p, account_id: account.id })),
    50000,
  )
  const gradeCfg = GRADE_CONFIG[gradeResult.grade]
  const [showGradeDetail, setShowGradeDetail] = useState(false)

  const clientSlugs: string[] = (account.account_clients ?? []).map((ac: any) => ac.client_slug).filter(Boolean)
  const linkedClients = clients.filter(c => clientSlugs.includes(c.slug))
  const latestVisit = visits[0] ?? null
  const activePlacements = placements.filter(p => !p.lost_at)
  const lostPlacements = placements.filter(p => p.lost_at)
  const primaryContact = contacts.find(c => c.is_decision_maker) ?? contacts[0] ?? null
  const openFollowUps = visits.filter(v =>
    (v.status === 'Will Order Soon' || v.status === 'Needs Follow Up') &&
    !v.follow_up_cleared_at && !v.follow_up_dismissed_at
  )
  const lastVisitedStr = account.last_visited
    ? relativeTimeStr(account.last_visited) ?? formatShortDateMT(account.last_visited)
    : 'Never visited'

  // At-risk placements: committed >30d or ordered >14d
  const atRisk = activePlacements.filter(p => {
    const ageDays = (Date.now() - new Date(p.created_at).getTime()) / 86400000
    const updatedDays = (Date.now() - new Date(p.updated_at || p.created_at).getTime()) / 86400000
    return (p.status === 'committed' && ageDays > 30) || (p.status === 'ordered' && updatedDays > 14)
  })

  // Visit frequency display
  const freqLabel = account.visit_frequency_days ? `Every ${account.visit_frequency_days}d` : '—'
  const daysOverdue = account.last_visited && account.visit_frequency_days
    ? Math.floor((Date.now() - new Date(account.last_visited).getTime()) / 86400000) - account.visit_frequency_days
    : null

  const typeLabel = account.account_type === 'on_premise' ? 'On-Premise' : account.account_type === 'off_premise' ? 'Off-Premise' : '—'

  return (
    <div style={{ padding: '20px 24px 64px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Back ──────────────────────────────────────────────────── */}
      <Link href="/v3/territory" style={{ color: v3.text.muted, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 14, fontSize: '12px', fontWeight: 600, opacity: 0.6, letterSpacing: '0.02em' }}>
        <ArrowLeft size={11} /> Territory
      </Link>

      {/* ── Account Header ──────────────────────────────────────── */}
      <div style={{ background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderTop: `2px solid ${hc}`, borderRadius: v3.radius.md, padding: '18px 20px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
          <div style={{ marginTop: 6, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: hc, boxShadow: `0 0 10px ${hc}80` }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h1 style={{ fontSize: '20px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1 }}>{account.name}</h1>
              <span style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, background: v3.bg.elevated, padding: '2px 7px', borderRadius: v3.radius.sm, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{typeLabel}</span>
              <button
                onClick={() => setShowGradeDetail(s => !s)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                title={`${gradeResult.grade}-tier · ${gradeCfg.label} · Score ${gradeResult.score}/100 — click for breakdown`}
              >
                <GradeBadge grade={gradeResult.grade} size="md" showMomentum momentum={gradeResult.momentum} />
              </button>
            </div>
            {showGradeDetail && (
              <div style={{
                marginBottom: 10, padding: '14px 16px',
                background: gradeCfg.bg, border: `1px solid ${gradeCfg.border}`,
                borderRadius: v3.radius.lg, maxWidth: 340,
              }}>
                <GradeDetail result={gradeResult} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {account.address && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '12px', color: v3.text.secondary }}>
                  <MapPin size={10} />{account.address}
                </span>
              )}
              {account.phone && (
                <a href={`tel:${account.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '12px', color: v3.text.link, textDecoration: 'none' }}>
                  <Phone size={10} />{account.phone}
                </a>
              )}
              {account.website && (
                <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '12px', color: v3.text.link, textDecoration: 'none' }}>
                  <Globe size={10} />Website
                </a>
              )}
              {account.instagram && (
                <a href={`https://instagram.com/${account.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '12px', color: v3.text.link, textDecoration: 'none' }}>
                  <Instagram size={10} />{account.instagram.startsWith('@') ? account.instagram : `@${account.instagram}`}
                </a>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'flex-start' }}>
            <button onClick={() => setShowEdit(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', background: 'transparent', border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 600, color: v3.text.muted, cursor: 'pointer', letterSpacing: '0.02em' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(196,164,110,0.40)'; e.currentTarget.style.color = v3.text.secondary }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = v3.border.strong; e.currentTarget.style.color = v3.text.muted }}>
              <Settings size={12} />
            </button>
            {account.address && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(account.address)}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'transparent', border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 700, color: v3.text.secondary, textDecoration: 'none', letterSpacing: '0.02em' }}>
                <Navigation size={12} />Directions
              </a>
            )}
            <button onClick={() => openLogVisit({ id: account.id, name: account.name })}
              style={{ padding: '8px 16px', background: v3.amber, color: v3.text.inverse, border: 'none', borderRadius: v3.radius.md, fontSize: '13px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.02em', boxShadow: `0 0 14px ${v3.amber}40` }}>
              Log Visit
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {[
            { label: 'Health',      value: hl,         color: hc },
            { label: 'Last Visit',  value: lastVisitedStr, color: v3.text.secondary },
            { label: 'Priority',    value: account.priority?.toUpperCase() ?? '—', color: account.priority === 'A' ? v3.amberLight : account.priority === 'B' ? v3.status.warning : v3.text.secondary },
            { label: 'Visit Every', value: freqLabel,  color: v3.text.secondary },
            { label: 'Placements',  value: `${activePlacements.length} active`, color: activePlacements.length > 0 ? v3.amberLight : v3.text.muted },
          ].map(s => (
            <div key={s.label} style={{ padding: '8px 12px', background: v3.bg.surface, borderRadius: v3.radius.sm, border: `1px solid ${v3.border.subtle}` }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Visit hints */}
        {(account.best_days?.length > 0 || account.best_time || account.notes) && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${v3.border.subtle}` }}>
            {account.best_days?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', color: v3.text.secondary }}>
                <CalendarDays size={10} color={v3.text.muted} />
                <span style={{ color: v3.text.muted, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Best days</span>
                {account.best_days.join(', ')}
              </div>
            )}
            {account.best_time && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', color: v3.text.secondary }}>
                <Clock size={10} color={v3.text.muted} />
                <span style={{ color: v3.text.muted, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Best time</span>
                {account.best_time}
              </div>
            )}
            {account.notes && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: '12px', color: v3.text.secondary, flex: 1 }}>
                <StickyNote size={10} color={v3.text.muted} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>{account.notes}</span>
              </div>
            )}
          </div>
        )}

        {/* Brand chips */}
        {linkedClients.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {linkedClients.map(c => {
              const logo = clientLogoUrl(c)
              const ac = c.color || v3.amber
              return (
                <Link key={c.slug} href={`/v3/brands/${c.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', background: ac + '0e', border: `1px solid ${ac}22`, borderRadius: v3.radius.sm, textDecoration: 'none' }}>
                  {logo
                    ? <img src={logo} alt="" style={{ width: 12, height: 12, objectFit: 'contain' }} />
                    : <span style={{ fontSize: '9px', fontWeight: 900, color: ac }}>{c.name[0]}</span>
                  }
                  <span style={{ fontSize: '10px', fontWeight: 700, color: ac }}>{c.name}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* ── PRE-VISIT BRIEF ─────────────────────────────────────────── */}
      <div style={{
        background: v3.bg.card,
        borderLeft: `3px solid ${v3.amber}`,
        borderTop: `1px solid ${v3.border.subtle}`,
        borderRight: `1px solid ${v3.border.subtle}`,
        borderBottom: `1px solid ${v3.border.subtle}`,
        borderRadius: `0 ${v3.radius.md} ${v3.radius.md} 0`,
        marginBottom: 10,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 16px 6px', borderBottom: `1px solid ${v3.border.subtle}` }}>
          <span style={{ fontSize: '9px', fontWeight: 700, color: v3.amber, textTransform: 'uppercase', letterSpacing: '0.22em' }}>Pre-Visit Brief</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>

          {/* Last visit */}
          <div style={{ padding: '14px 16px', borderRight: `1px solid ${v3.border.subtle}` }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 8 }}>Last Visit</div>
            {latestVisit ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: VISIT_STATUS_COLOR[latestVisit.status] ?? v3.text.muted, boxShadow: `0 0 6px ${VISIT_STATUS_COLOR[latestVisit.status] ?? v3.text.muted}80`, flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: VISIT_STATUS_COLOR[latestVisit.status] ?? v3.text.primary }}>{latestVisit.status}</span>
                </div>
                <div style={{ fontSize: '10px', color: v3.text.muted, marginBottom: 6 }}>
                  {relativeTimeStr(latestVisit.visited_at) ?? formatShortDateMT(latestVisit.visited_at)}
                </div>
                {latestVisit.notes && (
                  <div style={{ fontSize: '12px', color: v3.text.secondary, lineHeight: 1.45, fontStyle: 'italic', borderLeft: `2px solid ${v3.border.default}`, paddingLeft: 8 }}>
                    "{briefNoteExpanded ? latestVisit.notes : latestVisit.notes.slice(0, 120)}{!briefNoteExpanded && latestVisit.notes.length > 120 ? '…' : ''}"
                    {latestVisit.notes.length > 120 && (
                      <button onClick={() => setBriefNoteExpanded(e => !e)} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '10px', padding: '0 0 0 4px', fontStyle: 'normal' }}>
                        {briefNoteExpanded ? 'less' : 'more'}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '13px', color: v3.text.muted, fontStyle: 'italic' }}>No visits logged yet</div>
            )}
          </div>

          {/* Key contact */}
          <div style={{ padding: '14px 16px', borderRight: `1px solid ${v3.border.subtle}` }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 8 }}>Talk To</div>
            {primaryContact ? (
              <>
                <div style={{ fontSize: '14px', fontWeight: 700, color: v3.text.primary, marginBottom: 2 }}>{primaryContact.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  {primaryContact.role && <span style={{ fontSize: '10px', color: v3.text.muted }}>{primaryContact.role}</span>}
                  {primaryContact.category && CATEGORY_META[primaryContact.category] && (
                    <span style={{ fontSize: '9px', fontWeight: 700, color: CATEGORY_META[primaryContact.category].color, background: CATEGORY_META[primaryContact.category].color + '16', padding: '1px 6px', borderRadius: v3.radius.sm, letterSpacing: '0.04em' }}>
                      {CATEGORY_META[primaryContact.category].label}
                    </span>
                  )}
                </div>
                {primaryContact.phone && (
                  <a href={`tel:${primaryContact.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', color: v3.text.link, textDecoration: 'none', marginBottom: 3 }}>
                    <Phone size={10} />{primaryContact.phone}
                  </a>
                )}
                {primaryContact.email && (
                  <a href={`mailto:${primaryContact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', color: v3.text.link, textDecoration: 'none' }}>
                    <Mail size={10} />{primaryContact.email}
                  </a>
                )}
              </>
            ) : (
              <div style={{ fontSize: '12px', color: v3.text.muted, fontStyle: 'italic' }}>
                No contacts yet —{' '}
                <button onClick={() => setContactModal({ mode: 'add' })} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '12px', padding: 0, textDecoration: 'underline' }}>add one</button>
              </div>
            )}
          </div>

          {/* Open items */}
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 8 }}>Open Items</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {openFollowUps.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: v3.status.warning, flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: v3.status.warning, fontWeight: 600 }}>{openFollowUps.length} follow-up{openFollowUps.length !== 1 ? 's' : ''} pending</span>
                </div>
              )}
              {atRisk.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: v3.amber, flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: v3.amber, fontWeight: 600 }}>{atRisk.length} placement{atRisk.length !== 1 ? 's' : ''} at risk</span>
                </div>
              )}
              {activePlacements.length > 0 && atRisk.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: v3.status.success, flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: v3.status.success, fontWeight: 600 }}>{activePlacements.length} active placement{activePlacements.length !== 1 ? 's' : ''}</span>
                </div>
              )}
              {daysOverdue !== null && daysOverdue > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: v3.status.danger, flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: v3.status.danger, fontWeight: 600 }}>{daysOverdue}d overdue</span>
                </div>
              )}
              {openFollowUps.length === 0 && atRisk.length === 0 && (daysOverdue === null || daysOverdue <= 0) && (
                <div style={{ fontSize: '12px', color: v3.text.muted, fontStyle: 'italic' }}>All clear</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── At-risk placements banner ────────────────────────────── */}
      {atRisk.length > 0 && (
        <div style={{ background: v3.amberDim, border: `1px solid ${v3.amber}28`, borderLeft: `3px solid ${v3.amber}`, borderRadius: v3.radius.md, padding: '10px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: v3.amber, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 6 }}>
            <AlertTriangle size={9} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
            {atRisk.length} Placement{atRisk.length !== 1 ? 's' : ''} Need Attention
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {atRisk.map(p => {
              const ageDays = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000)
              const cl = clients.find(c => c.slug === p.client_slug)
              const nextStatus = PLAC_STATUS_NEXT[p.status]
              const nextLabel = nextStatus ? PLAC_STATUS_LABEL[nextStatus] : null
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
                  <div style={{ fontSize: '12px', color: v3.text.secondary, flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, color: v3.text.primary }}>{p.product_name}</span>
                    {cl && <span style={{ color: v3.amberLight }}> · {cl.name}</span>}
                    <span style={{ color: v3.text.muted }}> — {p.status} for {ageDays}d</span>
                  </div>
                  {nextLabel && (
                    <button
                      onClick={async () => {
                        const next = await advancePlacement.mutateAsync({ id: p.id, status: p.status })
                        if (next === 'on_shelf') triggerWin({ product: p.product_name, account: account.name, title: 'ON SHELF' })
                        else toast(`Placement → ${PLAC_STATUS_LABEL[next] ?? next}`)
                      }}
                      disabled={advancePlacement.isPending}
                      style={{ flexShrink: 0, padding: '3px 9px', background: 'rgba(196,164,110,0.12)', border: `1px solid rgba(196,164,110,0.35)`, borderRadius: v3.radius.sm, fontSize: '10px', fontWeight: 700, color: v3.amberLight, cursor: 'pointer', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}
                    >
                      Mark {nextLabel}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Open follow-ups banner ─────────────────────────────── */}
      {openFollowUps.length > 0 && (
        <div style={{ background: v3.status.warningDim, border: `1px solid ${v3.status.warning}28`, borderLeft: `3px solid ${v3.status.warning}`, borderRadius: v3.radius.md, padding: '10px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: v3.status.warning, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6 }}>
            {openFollowUps.length} open follow-up{openFollowUps.length !== 1 ? 's' : ''}
          </div>
          {openFollowUps.map(v => (
            <div key={v.id} style={{ fontSize: '12px', color: v3.text.secondary, paddingLeft: 8, paddingBottom: 2 }}>
              <span style={{ color: v3.status.warning, fontWeight: 600 }}>{v.status}</span>
              {v.notes ? ` — ${v.notes.slice(0, 90)}` : ''}
              <span style={{ color: v3.text.muted, fontSize: '10px', marginLeft: 8 }}>{relativeTimeStr(v.visited_at) ?? ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Main two-column grid ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

        {/* LEFT — Placements + Orders */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Placements */}
          <div style={{ background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, padding: '14px 16px' }}>
            <SectionLabel action={
              <button onClick={() => setShowAddPlacement(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', background: 'rgba(196,164,110,0.07)', border: `1px solid rgba(196,164,110,0.25)`, borderRadius: v3.radius.sm, fontSize: '10px', fontWeight: 700, color: v3.amberLight, cursor: 'pointer', letterSpacing: '0.04em' }}>
                <Plus size={10} />Add
              </button>
            }>
              Placements {activePlacements.length > 0 && `· ${activePlacements.length} active`}
            </SectionLabel>

            {activePlacements.length === 0 ? (
              <div style={{ fontSize: '13px', color: v3.text.muted, paddingTop: 4 }}>No active placements — <button onClick={() => setShowAddPlacement(true)} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '13px', padding: 0, textDecoration: 'underline' }}>add one</button></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {activePlacements.map(p => {
                  const sc = PLAC_STATUS_COLOR[p.status] ?? v3.text.muted
                  const cl = clients.find(c => c.slug === p.client_slug)
                  const canAdvance = !!PLAC_STATUS_NEXT[p.status]
                  return (
                    <div key={p.id} style={{ padding: '9px 11px', background: v3.bg.surface, borderRadius: v3.radius.sm, border: `1px solid ${v3.border.subtle}`, borderLeft: `2px solid ${sc}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: v3.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.product_name}</div>
                          <div style={{ fontSize: '10px', color: v3.text.muted, marginTop: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {cl && <span style={{ color: cl.color || v3.amber, fontWeight: 600 }}>{cl.name}</span>}
                            {p.placement_type && <span>{p.placement_type}</span>}
                            {p.shelf_count && <span>{p.shelf_count} facing{p.shelf_count !== 1 ? 's' : ''}</span>}
                            {p.price_point && <span>${p.price_point}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: sc, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{PLAC_STATUS_LABEL[p.status] ?? p.status}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
                        {canAdvance && (
                          <button disabled={advancePlacement.isPending}
                            onClick={async () => {
                              const next = await advancePlacement.mutateAsync({ id: p.id, status: p.status })
                              if (next === 'on_shelf') triggerWin({ product: p.product_name, account: account.name, title: 'ON SHELF' })
                              else toast(`Placement → ${PLAC_STATUS_LABEL[next] ?? next}`)
                            }}
                            style={{ flex: 1, padding: '5px 8px', background: sc + '16', border: `1px solid ${sc}35`, borderRadius: v3.radius.sm, fontSize: '10px', fontWeight: 700, color: sc, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            → {PLAC_STATUS_LABEL[PLAC_STATUS_NEXT[p.status]]}
                          </button>
                        )}
                        <button onClick={() => setEditPlacement(p)} style={{ padding: '5px 7px', background: 'transparent', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: v3.radius.sm, color: v3.text.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(196,164,110,0.35)'; e.currentTarget.style.color = v3.amberLight }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = v3.text.muted }}>
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => setLostModal(p)} style={{ padding: '5px 8px', background: 'transparent', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: v3.radius.sm, fontSize: '10px', fontWeight: 600, color: v3.text.muted, cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = v3.status.danger + '40'; e.currentTarget.style.color = v3.status.danger }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = v3.text.muted }}>
                          Lost
                        </button>
                      </div>
                    </div>
                  )
                })}
                {lostPlacements.length > 0 && (
                  <div style={{ fontSize: '10px', color: v3.text.muted, paddingTop: 2, paddingLeft: 2 }}>{lostPlacements.length} lost placement{lostPlacements.length !== 1 ? 's' : ''} (hidden)</div>
                )}
              </div>
            )}
          </div>

          {/* Orders */}
          <div style={{ background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, padding: '14px 16px' }}>
            <SectionLabel action={
              <button onClick={() => setShowCreateOrder(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', background: 'rgba(196,164,110,0.07)', border: `1px solid rgba(196,164,110,0.25)`, borderRadius: v3.radius.sm, fontSize: '10px', fontWeight: 700, color: v3.amberLight, cursor: 'pointer', letterSpacing: '0.04em' }}>
                <Plus size={10} />Add
              </button>
            }>
              Orders {orders.length > 0 && `· ${orders.length}`}</SectionLabel>
            {orders.length === 0
              ? <div style={{ fontSize: '13px', color: v3.text.muted }}>No orders yet</div>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(showAllOrders ? orders : orders.slice(0, 5)).map(o => {
                    const total = o.po_line_items?.reduce((s: number, li: any) => s + (Number(li.total) || 0), 0) || Number(o.total_amount) || 0
                    const cl = clients.find(c => c.slug === o.client_slug)
                    const statusColor = o.status === 'fulfilled' ? v3.status.success : o.status === 'sent' ? v3.status.warning : v3.text.muted
                    return (
                      <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: v3.bg.surface, borderRadius: v3.radius.sm, border: `1px solid ${v3.border.subtle}` }}>
                        <ShoppingCart size={10} color={statusColor} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: v3.text.primary }}>{o.po_number ?? 'No PO#'}{cl ? ` · ${cl.name}` : ''}</div>
                          <div style={{ fontSize: '10px', color: v3.text.muted, marginTop: 1 }}>
                            {relativeTimeStr(o.sent_at || o.created_at) ?? '—'} · {o.order_type === 'distributor' ? 'Distributor' : 'Direct'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {total > 0 && <div style={{ fontSize: '12px', fontWeight: 800, color: v3.amberLight, fontFamily: 'monospace' }}>${total.toLocaleString()}</div>}
                          <div style={{ fontSize: '9px', fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>{o.status}</div>
                        </div>
                      </div>
                    )
                  })}
                  {orders.length > 5 && (
                    <button onClick={() => setShowAllOrders(s => !s)} style={{ background: 'none', border: 'none', color: v3.text.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', padding: '4px 0', textAlign: 'left', letterSpacing: '0.02em' }}>
                      {showAllOrders ? '↑ Show less' : `+ ${orders.length - 5} more order${orders.length - 5 !== 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              )
            }
          </div>
        </div>

        {/* RIGHT — Contacts */}
        <div>
          <div style={{ background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, padding: '14px 16px' }}>
            <SectionLabel action={
              <button onClick={() => setContactModal({ mode: 'add' })} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', background: 'rgba(196,164,110,0.07)', border: `1px solid rgba(196,164,110,0.25)`, borderRadius: v3.radius.sm, fontSize: '10px', fontWeight: 700, color: v3.amberLight, cursor: 'pointer', letterSpacing: '0.04em' }}>
                <Plus size={10} />Add
              </button>
            }>
              Contacts {contacts.length > 0 && `· ${contacts.length}`}
            </SectionLabel>

            {contacts.length === 0 ? (
              <div style={{ fontSize: '13px', color: v3.text.muted }}>No contacts — <button onClick={() => setContactModal({ mode: 'add' })} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '13px', padding: 0, textDecoration: 'underline' }}>add a key contact</button></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {contacts.map(contact => {
                  const catMeta = CATEGORY_META[contact.category] ?? CATEGORY_META.general
                  const isDeletingThis = confirmDeleteId === contact.id
                  return (
                    <div key={contact.id} style={{ padding: '9px 11px', background: v3.bg.surface, borderRadius: v3.radius.sm, border: `1px solid ${v3.border.subtle}`, borderLeft: contact.is_decision_maker ? `2px solid ${v3.amber}` : `2px solid transparent` }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <User size={11} color={contact.is_decision_maker ? v3.amberLight : v3.text.muted} style={{ marginTop: 2, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: v3.text.primary }}>{contact.name}</span>
                            {contact.is_decision_maker && (
                              <span style={{ fontSize: '9px', fontWeight: 800, color: v3.amberLight, background: v3.amberDim, padding: '1px 5px', borderRadius: v3.radius.sm, letterSpacing: '0.06em' }}>KEY</span>
                            )}
                            <span style={{ fontSize: '9px', fontWeight: 700, color: catMeta.color, background: catMeta.color + '16', padding: '1px 6px', borderRadius: v3.radius.sm, letterSpacing: '0.04em' }}>{catMeta.label}</span>
                          </div>
                          {contact.role && <div style={{ fontSize: '10px', color: v3.text.muted, marginBottom: 4 }}>{contact.role}</div>}
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {contact.phone && (
                              <a href={`tel:${contact.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '10px', color: v3.text.link, textDecoration: 'none' }}>
                                <Phone size={9} />{contact.phone}
                              </a>
                            )}
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '10px', color: v3.text.link, textDecoration: 'none' }}>
                                <Mail size={9} />{contact.email}
                              </a>
                            )}
                          </div>
                          {contact.notes && (
                            <div style={{ fontSize: '10px', color: v3.text.muted, marginTop: 4, fontStyle: 'italic' }}>{contact.notes}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => setContactModal({ mode: 'edit', contact })} style={{ padding: '4px', background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', display: 'flex', borderRadius: v3.radius.sm, transition: 'color 100ms' }}
                            onMouseEnter={e => e.currentTarget.style.color = v3.text.secondary}
                            onMouseLeave={e => e.currentTarget.style.color = v3.text.muted}>
                            <Pencil size={12} />
                          </button>
                          {isDeletingThis ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => setConfirmDeleteId(null)} style={{ padding: '3px 7px', background: 'none', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.sm, fontSize: '10px', color: v3.text.muted, cursor: 'pointer' }}>Cancel</button>
                              <button onClick={() => deleteContact.mutate(contact.id)} style={{ padding: '3px 7px', background: v3.status.danger + '20', border: `1px solid ${v3.status.danger}40`, borderRadius: v3.radius.sm, fontSize: '10px', color: v3.status.danger, cursor: 'pointer', fontWeight: 700 }}>Delete</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(contact.id)} style={{ padding: '4px', background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', display: 'flex', borderRadius: v3.radius.sm, transition: 'color 100ms' }}
                              onMouseEnter={e => e.currentTarget.style.color = v3.status.danger}
                              onMouseLeave={e => e.currentTarget.style.color = v3.text.muted}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Visit History ───────────────────────────────────────── */}
      <div style={{ marginTop: 10, background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, padding: '14px 16px' }}>
        <SectionLabel>Visit History {visits.length > 0 && `· ${visits.length}`}</SectionLabel>
        {visitsLoading
          ? <div style={{ color: v3.text.muted, fontSize: '13px' }}>Loading…</div>
          : visits.length === 0
          ? <div style={{ color: v3.text.muted, fontSize: '13px' }}>No visit history yet</div>
          : (
            <div>
              {(showAllVisits ? visits : visits.slice(0, 12)).map((v, i) => {
                const displayedCount = showAllVisits ? visits.length : Math.min(visits.length, 12)
                const sc = VISIT_STATUS_COLOR[v.status] ?? v3.text.muted
                const repName = Array.isArray(v.user_profiles) ? v.user_profiles[0]?.name : v.user_profiles?.name
                const cl = v.client_slug ? clients.find(c => c.slug === v.client_slug) : null
                return (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: i < displayedCount - 1 ? `1px solid ${v3.border.subtle}` : 'none' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, flexShrink: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc, boxShadow: `0 0 5px ${sc}70` }} />
                      {i < displayedCount - 1 && <div style={{ width: 1, height: 18, background: v3.border.subtle, marginTop: 3 }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: sc }}>{v.status}</span>
                        <span style={{ fontSize: '10px', color: v3.text.muted }}>{relativeTimeStr(v.visited_at) ?? formatShortDateMT(v.visited_at)}</span>
                        {cl && <span style={{ fontSize: '9px', color: cl.color || v3.amber, background: (cl.color || v3.amber) + '14', padding: '1px 6px', borderRadius: v3.radius.sm, fontWeight: 600 }}>{cl.name}</span>}
                        {repName && <span style={{ fontSize: '9px', color: v3.text.muted }}>· {repName}</span>}
                      </div>
                      {v.notes && <div style={{ fontSize: '12px', color: v3.text.secondary, lineHeight: 1.45, marginBottom: v.tasting_notes ? 4 : 0 }}>{v.notes}</div>}
                      {v.tasting_notes && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 4, padding: '5px 9px', background: 'rgba(196,164,110,0.06)', borderLeft: `2px solid rgba(196,164,110,0.25)`, borderRadius: `0 ${v3.radius.sm} ${v3.radius.sm} 0` }}>
                          <GlassWater size={9} color={v3.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: '10px', color: 'rgba(196,164,110,0.75)', lineHeight: 1.4 }}>{v.tasting_notes}</span>
                        </div>
                      )}
                      {v.feedback && (
                        <div style={{ marginTop: 4, fontSize: '10px', color: v3.text.muted, fontStyle: 'italic', lineHeight: 1.4 }}>
                          Feedback: {v.feedback}
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, paddingLeft: 4, display: 'flex', gap: 3 }}>
                      {confirmDeleteVisitId === v.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => setConfirmDeleteVisitId(null)} style={{ padding: '3px 7px', background: 'none', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.sm, fontSize: '10px', color: v3.text.muted, cursor: 'pointer' }}>No</button>
                          <button onClick={() => deleteVisit.mutate(v.id)} disabled={deleteVisit.isPending} style={{ padding: '3px 7px', background: v3.status.danger + '20', border: `1px solid ${v3.status.danger}40`, borderRadius: v3.radius.sm, fontSize: '10px', color: v3.status.danger, cursor: 'pointer', fontWeight: 700 }}>Delete</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => setEditVisit(v)} style={{ padding: '4px', background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', display: 'flex', opacity: 0.4 }}
                            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = v3.amberLight }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = v3.text.muted }}>
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => setConfirmDeleteVisitId(v.id)} style={{ padding: '4px', background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', display: 'flex', opacity: 0.4 }}
                            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = v3.status.danger }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = v3.text.muted }}>
                            <Trash2 size={11} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              {visits.length > 12 && (
                <button onClick={() => setShowAllVisits(s => !s)} style={{ background: 'none', border: 'none', color: v3.text.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', padding: '6px 0', width: '100%', textAlign: 'center', letterSpacing: '0.02em' }}>
                  {showAllVisits ? '↑ Show fewer visits' : `+ ${visits.length - 12} more visit${visits.length - 12 !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          )
        }
      </div>

      {/* ── Modals ───────────────────────────────────────────────── */}
      {showEdit && <EditAccountModal account={account} onClose={() => setShowEdit(false)} />}
      {showAddPlacement && <AddPlacementModal accountId={id} linkedClients={linkedClients} onClose={() => setShowAddPlacement(false)} />}
      {showCreateOrder && <CreateOrderModal accountId={id} accountName={account.name} linkedClients={linkedClients} onClose={() => setShowCreateOrder(false)} />}
      {contactModal && (
        <ContactFormModal
          accountId={id}
          contact={contactModal.contact}
          linkedClients={linkedClients}
          onClose={() => setContactModal(null)}
        />
      )}
      {lostModal && <MarkLostModal placement={lostModal} accountId={id} onClose={() => setLostModal(null)} />}
      {editPlacement && <EditPlacementModal placement={editPlacement} accountId={id} onClose={() => setEditPlacement(null)} />}
      {editVisit && <EditVisitModal visit={editVisit} accountId={id} onClose={() => setEditVisit(null)} />}
    </div>
  )
}
