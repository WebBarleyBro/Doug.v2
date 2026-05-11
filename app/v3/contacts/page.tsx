'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Phone, Mail, Search, Plus, X, ChevronDown, Check, Trash2, Pencil } from 'lucide-react'
import { v3, v3input, v3label } from '../lib/theme'
import { useV3Clients, useV3Accounts } from '../lib/query'
import { createContact, updateContact, deleteContact } from '../../lib/data'
import { useV3Toast } from '../lib/context'

const CATEGORIES = ['buyer', 'gm_owner', 'bar manager', 'chef', 'distributor', 'media', 'general', 'other']
const CAT_LABEL: Record<string, string> = {
  buyer: 'Buyer', gm_owner: 'GM / Owner', 'bar manager': 'Bar Mgr', chef: 'Chef',
  distributor: 'Distributor', media: 'Media', general: 'General', other: 'Other',
}
const CAT_FILTER = ['all', ...CATEGORIES]

function useAllContacts() {
  return useQuery({
    queryKey: ['v3', 'contacts', 'all'],
    queryFn: async () => {
      const { getSupabase } = await import('../../lib/supabase')
      const sb = getSupabase()
      const { data, error } = await sb
        .from('contacts')
        .select('id, name, role, category, phone, email, is_decision_maker, is_distributor_rep, account_id, client_slug, notes, accounts(id, name)')
        .order('name')
        .limit(2000)
      if (error) throw error
      return (data ?? []) as any[]
    },
    staleTime: 2 * 60_000,
  })
}

// ── Contact Modal ─────────────────────────────────────────────────────────────

interface ContactForm {
  name: string
  role: string
  category: string
  account_id: string
  client_slug: string
  phone: string
  email: string
  notes: string
  is_decision_maker: boolean
  is_distributor_rep: boolean
}

const BLANK: ContactForm = {
  name: '', role: '', category: 'buyer', account_id: '', client_slug: '',
  phone: '', email: '', notes: '', is_decision_maker: false, is_distributor_rep: false,
}

function ContactModal({
  contact,
  onClose,
  onSaved,
}: {
  contact?: any
  onClose: () => void
  onSaved: () => void
}) {
  const { data: clients = [] } = useV3Clients()
  const { data: accounts = [] } = useV3Accounts()
  const { show: toast } = useV3Toast()
  const [form, setForm] = useState<ContactForm>(
    contact
      ? {
          name: contact.name ?? '',
          role: contact.role ?? '',
          category: contact.category ?? 'buyer',
          account_id: contact.account_id ?? '',
          client_slug: contact.client_slug ?? '',
          phone: contact.phone ?? '',
          email: contact.email ?? '',
          notes: contact.notes ?? '',
          is_decision_maker: contact.is_decision_maker ?? false,
          is_distributor_rep: contact.is_distributor_rep ?? false,
        }
      : BLANK
  )
  const [saving, setSaving] = useState(false)
  const [acctSearch, setAcctSearch] = useState(contact?.accounts?.name ?? '')
  const [showAcctDrop, setShowAcctDrop] = useState(false)
  const acctRef = useRef<HTMLDivElement>(null)

  const filteredAccounts = useMemo(() => {
    const q = acctSearch.toLowerCase()
    return (accounts as any[]).filter((a: any) => a.name.toLowerCase().includes(q)).slice(0, 8)
  }, [accounts, acctSearch])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setShowAcctDrop(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function set(k: keyof ContactForm, v: any) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('Name is required', 'error'); return }
    setSaving(true)
    try {
      const payload: any = {
        name: form.name.trim(),
        role: form.role.trim() || null,
        category: form.category || null,
        account_id: form.account_id || null,
        client_slug: form.client_slug || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
        is_decision_maker: form.is_decision_maker,
        is_distributor_rep: form.is_distributor_rep,
      }
      if (contact?.id) {
        await updateContact(contact.id, payload)
        toast('Contact updated')
      } else {
        await createContact(payload)
        toast('Contact added')
      }
      onSaved()
      onClose()
    } catch (err: any) {
      console.error('contact.save', err)
      toast(err.message ?? 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: v3.bg.overlay,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 900, padding: 16,
  }
  const panel: React.CSSProperties = {
    background: v3.bg.sheet, border: `1px solid ${v3.border.strong}`,
    borderRadius: v3.radius.xl, width: '100%', maxWidth: 520,
    maxHeight: '90vh', overflowY: 'auto', padding: 28,
  }
  const row: React.CSSProperties = { marginBottom: 18 }
  const inputStyle: React.CSSProperties = { ...v3input }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>
              {contact ? 'Edit Contact' : 'Add Contact'}
            </div>
            <div style={{ fontSize: '11px', color: v3.text.muted, marginTop: 2 }}>
              {contact ? contact.name : 'New person in your network'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: v3.text.muted, padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Name */}
        <div style={row}>
          <label style={v3label}>Name *</label>
          <input style={inputStyle} value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Alex Rivera"
            onFocus={e => (e.target as HTMLElement).style.borderColor = v3.amber + '80'}
            onBlur={e => (e.target as HTMLElement).style.borderColor = v3.border.default} />
        </div>

        {/* Role + Category row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <div>
            <label style={v3label}>Title / Role</label>
            <input style={inputStyle} value={form.role}
              onChange={e => set('role', e.target.value)}
              placeholder="e.g. Bar Manager"
              onFocus={e => (e.target as HTMLElement).style.borderColor = v3.amber + '80'}
              onBlur={e => (e.target as HTMLElement).style.borderColor = v3.border.default} />
          </div>
          <div>
            <label style={v3label}>Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{CAT_LABEL[c] ?? c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Account picker */}
        <div style={{ ...row, position: 'relative' }} ref={acctRef}>
          <label style={v3label}>Account</label>
          <div style={{ position: 'relative' }}>
            <input
              style={{ ...inputStyle, paddingRight: 32 }}
              value={acctSearch}
              onChange={e => { setAcctSearch(e.target.value); setShowAcctDrop(true); if (!e.target.value) set('account_id', '') }}
              onFocus={() => setShowAcctDrop(true)}
              placeholder="Search accounts…"
            />
            <ChevronDown size={13} color={v3.text.muted} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>
          {showAcctDrop && filteredAccounts.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: v3.bg.elevated, border: `1px solid ${v3.border.strong}`,
              borderRadius: v3.radius.md, overflow: 'hidden', marginTop: 2,
            }}>
              {filteredAccounts.map((a: any) => (
                <div key={a.id}
                  onClick={() => { set('account_id', a.id); setAcctSearch(a.name); setShowAcctDrop(false) }}
                  style={{
                    padding: '9px 14px', fontSize: '13px', color: v3.text.primary, cursor: 'pointer',
                    background: form.account_id === a.id ? v3.amberDim : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = v3.bg.sheet}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = form.account_id === a.id ? v3.amberDim : 'transparent'}
                >
                  {form.account_id === a.id && <Check size={12} color={v3.amber} />}
                  {a.name}
                  {a.address && <span style={{ fontSize: '11px', color: v3.text.muted, marginLeft: 'auto' }}>{a.address.split(',')[0]}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Brand (hidden for distributor reps — they use the rep assignment panel) */}
        {!form.is_distributor_rep && (
          <div style={row}>
            <label style={v3label}>Brand</label>
            <select value={form.client_slug} onChange={e => set('client_slug', e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">No brand</option>
              {(clients as any[]).map((c: any) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Phone + Email */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <div>
            <label style={v3label}>Phone</label>
            <input style={inputStyle} value={form.phone} type="tel"
              onChange={e => set('phone', e.target.value)}
              placeholder="(970) 555-0100"
              onFocus={e => (e.target as HTMLElement).style.borderColor = v3.amber + '80'}
              onBlur={e => (e.target as HTMLElement).style.borderColor = v3.border.default} />
          </div>
          <div>
            <label style={v3label}>Email</label>
            <input style={inputStyle} value={form.email} type="email"
              onChange={e => set('email', e.target.value)}
              placeholder="alex@venue.com"
              onFocus={e => (e.target as HTMLElement).style.borderColor = v3.amber + '80'}
              onBlur={e => (e.target as HTMLElement).style.borderColor = v3.border.default} />
          </div>
        </div>

        {/* Decision maker toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, cursor: 'pointer' }}
          onClick={() => set('is_decision_maker', !form.is_decision_maker)}>
          <div style={{
            width: 18, height: 18, borderRadius: v3.radius.sm,
            border: `1.5px solid ${form.is_decision_maker ? v3.amber : v3.border.strong}`,
            background: form.is_decision_maker ? v3.amberDim : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'all 120ms',
          }}>
            {form.is_decision_maker && <Check size={11} color={v3.amber} />}
          </div>
          <div>
            <div style={{ fontSize: '13px', color: v3.text.primary, fontWeight: 600 }}>Decision maker</div>
            <div style={{ fontSize: '11px', color: v3.text.muted }}>Buying authority or final say on placement</div>
          </div>
        </div>

        {/* Distributor rep toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.is_distributor_rep ? 12 : 18, cursor: 'pointer' }}
          onClick={() => set('is_distributor_rep', !form.is_distributor_rep)}>
          <div style={{
            width: 18, height: 18, borderRadius: v3.radius.sm,
            border: `1.5px solid ${form.is_distributor_rep ? v3.amber : v3.border.strong}`,
            background: form.is_distributor_rep ? v3.amberDim : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'all 120ms',
          }}>
            {form.is_distributor_rep && <Check size={11} color={v3.amber} />}
          </div>
          <div>
            <div style={{ fontSize: '13px', color: v3.text.primary, fontWeight: 600 }}>Distributor rep</div>
            <div style={{ fontSize: '11px', color: v3.text.muted }}>This contact receives order inquiries on behalf of a distributor</div>
          </div>
        </div>

        {/* Distributor rep: brand selector (shown when is_distributor_rep is checked) */}
        {form.is_distributor_rep && (
          <div style={{ background: v3.amberDim, border: `1px solid rgba(196,164,110,0.18)`, borderRadius: v3.radius.md, padding: '12px 14px', marginBottom: 18 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: v3.amber, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Rep Assignment</div>
            <div style={row}>
              <label style={v3label}>Primary Brand</label>
              <select value={form.client_slug} onChange={e => set('client_slug', e.target.value)}
                style={{ ...v3input, cursor: 'pointer' }}>
                <option value="">Not assigned to a brand</option>
                {(clients as any[]).map((c: any) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
              <div style={{ fontSize: '11px', color: v3.text.muted, marginTop: 4 }}>This will autofill when creating order inquiries for this brand</div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div style={row}>
          <label style={v3label}>Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Preferences, history, how you know them…"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            onFocus={e => (e.target as HTMLElement).style.borderColor = v3.amber + '80'}
            onBlur={e => (e.target as HTMLElement).style.borderColor = v3.border.default} />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose} style={{
            background: 'transparent', border: `1px solid ${v3.border.default}`,
            color: v3.text.muted, borderRadius: v3.radius.md, padding: '9px 18px',
            fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: v3.font.ui,
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            background: v3.amber, color: '#000', border: 'none',
            borderRadius: v3.radius.md, padding: '9px 22px',
            fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: v3.font.ui,
            opacity: saving ? 0.6 : 1, letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            {saving ? 'Saving…' : contact ? 'Save Changes' : 'Add Contact'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const { data: contacts = [], isLoading, refetch } = useAllContacts()
  const { data: clients = [] } = useV3Clients()
  const { show: toast } = useV3Toast()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [brandFilter, setBrandFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editContact, setEditContact] = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return (contacts as any[]).filter(c => {
      if (q && !c.name?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q) && !c.phone?.includes(q)) return false
      if (catFilter !== 'all' && c.category !== catFilter && c.role?.toLowerCase() !== catFilter) return false
      if (brandFilter !== 'all' && c.client_slug !== brandFilter) return false
      return true
    })
  }, [contacts, search, catFilter, brandFilter])

  async function handleDelete(id: string) {
    try {
      await deleteContact(id)
      toast('Contact deleted')
      refetch()
    } catch (err: any) {
      console.error('contact.delete', err)
      toast('Delete failed', 'error')
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 28px 48px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: 0 }}>Contacts</h1>
          <div style={{ fontSize: '12px', color: v3.text.muted, marginTop: 3 }}>Buyers, bar managers, and distributor reps</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: 'transparent', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, height: 38 }}>
            <Search size={13} color={v3.text.muted} style={{ flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Name, email, phone…"
              style={{ background: 'none', border: 'none', outline: 'none', color: v3.text.primary, fontSize: '13px', width: 200, fontFamily: v3.font.ui }} />
          </div>
          <button onClick={() => { setEditContact(null); setShowModal(true) }} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: v3.amber, color: '#000', border: 'none',
            borderRadius: v3.radius.md, padding: '0 16px', height: 38,
            fontSize: '12px', fontWeight: 800, cursor: 'pointer',
            fontFamily: v3.font.ui, letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            <Plus size={14} />Add Contact
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {CAT_FILTER.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)} style={{
              padding: '5px 11px', borderRadius: v3.radius.full, fontSize: '11px', fontWeight: 700,
              border: `1px solid ${catFilter === cat ? v3.amber + '60' : v3.border.default}`,
              background: catFilter === cat ? v3.amberDim : 'transparent',
              color: catFilter === cat ? v3.amberLight : v3.text.muted,
              cursor: 'pointer', transition: 'all 120ms', textTransform: 'capitalize',
              fontFamily: v3.font.ui,
            }}>
              {cat === 'all' ? 'All' : (CAT_LABEL[cat] ?? cat)}
            </button>
          ))}
        </div>
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
          style={{ background: 'transparent', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.secondary, fontSize: '12px', padding: '6px 10px', cursor: 'pointer', outline: 'none', fontFamily: v3.font.ui }}>
          <option value="all">All Brands</option>
          {(clients as any[]).map((c: any) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <span style={{ fontSize: '11px', color: v3.text.muted, marginLeft: 4 }}>
          {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Contact list */}
      <div style={{ overflow: 'hidden' }}>
        {isLoading
          ? <div style={{ padding: '32px', textAlign: 'center', color: v3.text.muted, fontSize: '13px' }}>Loading…</div>
          : filtered.length === 0
          ? <div style={{ padding: '48px', textAlign: 'center', color: v3.text.muted, fontSize: '13px' }}>
              {search ? `No contacts match "${search}".` : 'No contacts yet.'}
              <div style={{ marginTop: 12 }}>
                <button onClick={() => { setEditContact(null); setShowModal(true) }} style={{
                  background: v3.amberDim, border: `1px solid ${v3.amber}40`, borderRadius: v3.radius.md,
                  color: v3.amberLight, padding: '8px 16px', fontSize: '12px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: v3.font.ui,
                }}>Add your first contact</button>
              </div>
            </div>
          : filtered.map((contact: any, i: number) => {
            const cl = (clients as any[]).find((c: any) => c.slug === contact.client_slug)
            const ac = cl?.color || v3.amber
            const isDeleting = confirmDelete === contact.id
            return (
              <div key={contact.id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto',
                alignItems: 'center', gap: 12, padding: '12px 18px',
                borderBottom: i < filtered.length - 1 ? `1px solid ${v3.border.subtle}` : 'none',
                background: isDeleting ? 'rgba(184,92,92,0.05)' : 'transparent',
                transition: 'background 120ms',
              }}
                onMouseEnter={e => { if (!isDeleting) (e.currentTarget as HTMLElement).style.background = v3.bg.elevated }}
                onMouseLeave={e => { if (!isDeleting) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: contact.is_decision_maker ? v3.amberDim : v3.bg.surface,
                    border: `1px solid ${contact.is_decision_maker ? v3.amber + '40' : v3.border.subtle}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', fontWeight: 800, color: contact.is_decision_maker ? v3.amberLight : v3.text.muted,
                  }}>
                    {(contact.name?.[0] ?? '?').toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: v3.text.primary }}>{contact.name}</span>
                      {contact.is_decision_maker && (
                        <span style={{ fontSize: '8px', fontWeight: 800, color: v3.amberLight, background: v3.amberDim, padding: '1px 6px', borderRadius: v3.radius.sm, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Key</span>
                      )}
                      {contact.is_distributor_rep && (
                        <span style={{ fontSize: '8px', fontWeight: 800, color: v3.status.info, background: v3.status.infoDim, padding: '1px 6px', borderRadius: v3.radius.sm, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Rep</span>
                      )}
                      {(contact.role || contact.category) && (
                        <span style={{ fontSize: '10px', color: v3.text.muted }}>{contact.role || CAT_LABEL[contact.category] || contact.category}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                      {contact.accounts?.name && (
                        <Link href={`/v3/territory/${contact.account_id}`} style={{ fontSize: '11px', color: v3.text.secondary, textDecoration: 'none' }}>
                          {contact.accounts.name}
                        </Link>
                      )}
                      {cl && (
                        <span style={{ fontSize: '10px', color: ac, fontWeight: 600 }}>{cl.name}</span>
                      )}
                      {contact.notes && (
                        <span style={{ fontSize: '10px', color: v3.text.muted, fontStyle: 'italic' }}
                          title={contact.notes}>
                          {contact.notes.length > 40 ? contact.notes.slice(0, 40) + '…' : contact.notes}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
                      background: v3.bg.surface, border: `1px solid ${v3.border.default}`,
                      borderRadius: v3.radius.md, textDecoration: 'none',
                      fontSize: '11px', fontWeight: 600, color: v3.text.secondary,
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = v3.status.success + '60'; (e.currentTarget as HTMLElement).style.color = v3.status.success }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = v3.border.default; (e.currentTarget as HTMLElement).style.color = v3.text.secondary }}>
                      <Phone size={11} />{contact.phone}
                    </a>
                  )}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
                      background: v3.bg.surface, border: `1px solid ${v3.border.default}`,
                      borderRadius: v3.radius.md, textDecoration: 'none',
                      fontSize: '11px', fontWeight: 600, color: v3.text.secondary,
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = v3.status.info + '60'; (e.currentTarget as HTMLElement).style.color = v3.status.info }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = v3.border.default; (e.currentTarget as HTMLElement).style.color = v3.text.secondary }}>
                      <Mail size={11} />{contact.email}
                    </a>
                  )}

                  {/* Edit */}
                  <button onClick={() => { setEditContact(contact); setShowModal(true) }}
                    title="Edit contact"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 30, height: 30, background: 'transparent',
                      border: `1px solid ${v3.border.subtle}`, borderRadius: v3.radius.md,
                      cursor: 'pointer', color: v3.text.muted, flexShrink: 0,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = v3.amber + '60'; (e.currentTarget as HTMLElement).style.color = v3.amberLight }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = v3.border.subtle; (e.currentTarget as HTMLElement).style.color = v3.text.muted }}>
                    <Pencil size={12} />
                  </button>

                  {/* Delete */}
                  {isDeleting ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleDelete(contact.id)} style={{
                        padding: '5px 10px', background: 'rgba(184,92,92,0.12)', border: `1px solid ${v3.status.danger}60`,
                        borderRadius: v3.radius.md, color: v3.status.danger, fontSize: '11px', fontWeight: 700,
                        cursor: 'pointer', fontFamily: v3.font.ui,
                      }}>Delete</button>
                      <button onClick={() => setConfirmDelete(null)} style={{
                        padding: '5px 10px', background: 'transparent', border: `1px solid ${v3.border.default}`,
                        borderRadius: v3.radius.md, color: v3.text.muted, fontSize: '11px', fontWeight: 600,
                        cursor: 'pointer', fontFamily: v3.font.ui,
                      }}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(contact.id)}
                      title="Delete contact"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 30, height: 30, background: 'transparent',
                        border: `1px solid ${v3.border.subtle}`, borderRadius: v3.radius.md,
                        cursor: 'pointer', color: v3.text.muted, flexShrink: 0,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = v3.status.danger + '60'; (e.currentTarget as HTMLElement).style.color = v3.status.danger }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = v3.border.subtle; (e.currentTarget as HTMLElement).style.color = v3.text.muted }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        }
      </div>

      {/* Modal */}
      {showModal && (
        <ContactModal
          contact={editContact}
          onClose={() => { setShowModal(false); setEditContact(null) }}
          onSaved={() => refetch()}
        />
      )}
    </div>
  )
}
