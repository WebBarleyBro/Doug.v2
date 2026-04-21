'use client'
import { useState, useEffect } from 'react'
import { Search, Plus, Star, Mail, Phone, Edit2, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import LayoutShell from '../layout-shell'
import EmptyState from '../components/EmptyState'
import ConfirmModal from '../components/ConfirmModal'
import { CardSkeleton } from '../components/LoadingSkeleton'
import { getContacts, createContact, updateContact, deleteContact, getAccounts } from '../lib/data'
import { t, card, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle } from '../lib/theme'
import type { Contact } from '../lib/types'

const CONTACT_CATEGORIES = [
  { value: 'general',     label: 'General' },
  { value: 'distributor', label: 'Distributor Rep' },
  { value: 'buyer',       label: 'Buyer' },
  { value: 'chef',        label: 'Chef / Bar Manager' },
  { value: 'gm_owner',   label: 'GM / Owner' },
  { value: 'media',       label: 'Media / Press' },
  { value: 'other',       label: 'Other' },
]

const CATEGORY_COLORS: Record<string, string> = {
  distributor: t.status.info,
  buyer:       t.gold,
  chef:        t.status.success,
  gm_owner:   t.status.warning,
  media:       '#a78bfa',
  general:     t.text.muted,
  other:       t.text.muted,
}

function CategoryBadge({ category }: { category?: string }) {
  const cat = CONTACT_CATEGORIES.find(c => c.value === (category || 'general'))
  const color = CATEGORY_COLORS[category || 'general'] || t.text.muted
  return (
    <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', backgroundColor: color + '1a', color, fontWeight: '600', border: `1px solid ${color}33` }}>
      {cat?.label || category || 'General'}
    </span>
  )
}

// Searchable account select
function AccountSelect({ accounts, value, onChange }: { accounts: any[]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = accounts.find(a => a.id === value)
  const filtered = query ? accounts.filter(a => a.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : accounts.slice(0, 8)

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '0 10px' }}
        onClick={() => setOpen(o => !o)}>
        <Search size={13} color={t.text.muted} style={{ flexShrink: 0 }} />
        {open ? (
          <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search accounts..." onClick={e => e.stopPropagation()}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: t.text.primary, fontSize: '13px', padding: '10px 0' }} />
        ) : (
          <span style={{ flex: 1, fontSize: '13px', color: selected ? t.text.primary : t.text.muted, padding: '10px 0' }}>
            {selected ? selected.name : 'Select account (optional)'}
          </span>
        )}
        {value && <button onClick={e => { e.stopPropagation(); onChange(''); setQuery('') }}
          style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: 0, display: 'flex' }}><X size={13} /></button>}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100, backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '8px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
          onMouseLeave={() => setOpen(false)}>
          {filtered.length === 0 && <div style={{ padding: '10px 14px', fontSize: '13px', color: t.text.muted }}>No accounts found</div>}
          {filtered.map(a => (
            <div key={a.id} onClick={() => { onChange(a.id); setQuery(''); setOpen(false) }}
              style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: t.text.primary, borderBottom: `1px solid ${t.border.subtle}` }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = t.bg.cardHover)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
              {a.name}
              {a.address && <div style={{ fontSize: '11px', color: t.text.muted }}>{a.address}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [deleteTarget, setDeleteTarget] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', account_id: '', role: '', category: 'general', notes: '' })
  const [saving, setSaving] = useState(false)

  async function loadAll() {
    const [cs, accs] = await Promise.all([getContacts(), getAccounts({ limit: 500 })])
    setContacts(cs)
    setAccounts(accs)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const filtered = contacts.filter(c => {
    const matchSearch = !search || [c.name, c.email, c.role, c.notes].some(v => v?.toLowerCase().includes(search.toLowerCase()))
    const matchCat = categoryFilter === 'all' || (c as any).category === categoryFilter
    return matchSearch && matchCat
  })

  function openAdd() {
    setEditingContact(null)
    setForm({ name: '', email: '', phone: '', account_id: '', role: '', category: 'general', notes: '' })
    setShowModal(true)
  }

  function openEdit(c: Contact) {
    setEditingContact(c)
    setForm({ name: c.name || '', email: c.email || '', phone: c.phone || '', account_id: c.account_id || '', role: c.role || '', category: (c as any).category || 'general', notes: (c as any).notes || '' })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingContact) {
        await updateContact(editingContact.id, { name: form.name, email: form.email || undefined, phone: form.phone || undefined, account_id: form.account_id || undefined, role: form.role || undefined, category: form.category, notes: form.notes || undefined } as any)
      } else {
        await createContact({ name: form.name, email: form.email || undefined, phone: form.phone || undefined, account_id: form.account_id || undefined, role: form.role || undefined, category: form.category, notes: form.notes || undefined } as any)
      }
      setShowModal(false)
      loadAll()
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const categoryCounts: Record<string, number> = { all: contacts.length }
  contacts.forEach(c => {
    const cat = (c as any).category || 'general'
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
  })

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Contacts</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>{contacts.length} contacts across all accounts</p>
          </div>
          <button onClick={openAdd} style={{ ...btnPrimary, fontSize: '13px' }}>
            <Plus size={15} /> Add Contact
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.text.muted }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..."
            style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '8px', padding: '10px 12px 10px 36px', color: t.text.primary, fontSize: '14px', width: '100%', outline: 'none' }} />
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {[{ value: 'all', label: 'All' }, ...CONTACT_CATEGORIES].map(cat => {
            const active = categoryFilter === cat.value
            const count = categoryCounts[cat.value] || 0
            const color = cat.value === 'all' ? t.gold : (CATEGORY_COLORS[cat.value] || t.text.muted)
            return (
              <button key={cat.value} onClick={() => setCategoryFilter(cat.value)} style={{
                padding: '5px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                border: `1px solid ${active ? color : t.border.default}`,
                backgroundColor: active ? color + '1a' : 'transparent',
                color: active ? color : t.text.muted,
                fontWeight: active ? '600' : '400',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}>
                {cat.label}
                {count > 0 && <span style={{ fontSize: '10px', opacity: 0.7 }}>({count})</span>}
              </button>
            )
          })}
        </div>

        {loading ? <CardSkeleton count={5} /> : filtered.length === 0 ? (
          <EmptyState icon={<Phone size={36} />} title="No contacts found"
            subtitle={search || categoryFilter !== 'all' ? 'Try a different filter' : 'Add contacts from account pages or click Add Contact'}
            action={<button onClick={openAdd} style={btnPrimary}><Plus size={14} /> Add Contact</button>}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(c => (
              <div key={c.id} style={{ ...card, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{c.name}</span>
                      {c.is_decision_maker && <Star size={12} fill={t.gold} color={t.gold} />}
                      <CategoryBadge category={(c as any).category} />
                    </div>
                    {c.role && <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '1px' }}>{c.role}</div>}
                    {(c as any).accounts?.name && (
                      <div style={{ fontSize: '12px', color: t.text.secondary, marginTop: '2px' }}>
                        {(c as any).accounts?.id
                          ? <Link href={`/accounts/${(c as any).accounts.id}`} style={{ color: t.text.secondary, textDecoration: 'none' }}>{(c as any).accounts.name}</Link>
                          : (c as any).accounts.name}
                      </div>
                    )}
                    {(c as any).notes && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '3px', fontStyle: 'italic' }}>{(c as any).notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {c.email && <a href={`mailto:${c.email}`} style={{ color: t.gold, display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontSize: '12px' }}><Mail size={14} />{c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} style={{ color: t.text.muted, display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontSize: '12px' }}><Phone size={14} />{c.phone}</a>}
                    <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted, padding: '4px', display: 'flex' }}><Edit2 size={14} /></button>
                    <button onClick={() => setDeleteTarget(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.status.danger, padding: '4px', display: 'flex' }}><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add / Edit Contact Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary }}>{editingContact ? 'Edit Contact' : 'Add Contact'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" style={inputStyle} autoFocus />
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={selectStyle}>
                    {CONTACT_CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Role / Title</label>
                  <input type="text" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="General Manager, Buyer..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(720) 555-0000" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Account</label>
                <AccountSelect accounts={accounts} value={form.account_id} onChange={id => setForm(f => ({ ...f, account_id: id }))} />
              </div>

              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any context or notes..." style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={btnSecondary}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()}
                style={{ ...btnPrimary, opacity: saving || !form.name.trim() ? 0.6 : 1 }}>
                {saving ? 'Saving...' : editingContact ? 'Save Changes' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget('')}
        onConfirm={async () => {
          await deleteContact(deleteTarget)
          setDeleteTarget('')
          loadAll()
        }}
        title="Delete Contact"
        message="Permanently delete this contact?"
        confirmLabel="Delete"
        danger
      />
    </LayoutShell>
  )
}
