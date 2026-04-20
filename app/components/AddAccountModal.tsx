'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { t, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle } from '../lib/theme'
import { createAccount, createContact } from '../lib/data'
import { invalidate } from '../lib/cache'

declare global { interface Window { google: any } }

export const CONTACT_CATEGORIES = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'manager', label: 'Manager / GM' },
  { value: 'owner', label: 'Owner' },
  { value: 'bartender', label: 'Bartender' },
  { value: 'distributor', label: 'Distributor Rep' },
  { value: 'sommelier', label: 'Sommelier' },
  { value: 'other', label: 'Other' },
]

interface ContactDraft {
  name: string
  role: string
  category: string
  email: string
  phone: string
  is_decision_maker: boolean
}

const emptyContact = (): ContactDraft => ({ name: '', role: '', category: 'buyer', email: '', phone: '', is_decision_maker: false })

export default function AddAccountModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: (account: any) => void
}) {
  const [form, setForm] = useState({ name: '', address: '', phone: '', account_type: 'on_premise' })
  const [contacts, setContacts] = useState<ContactDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const addressRef = useRef<HTMLInputElement>(null)
  const acRef = useRef<any>(null)

  useEffect(() => {
    function initAC() {
      if (!addressRef.current || !window.google?.maps?.places) return
      acRef.current = new window.google.maps.places.Autocomplete(addressRef.current, {
        types: ['establishment', 'geocode'],
        componentRestrictions: { country: 'us' },
      })
      acRef.current.addListener('place_changed', () => {
        const place = acRef.current.getPlace()
        if (place.formatted_address) setForm(f => ({ ...f, address: place.formatted_address }))
        if (!form.name && place.name) setForm(f => ({ ...f, name: place.name }))
      })
    }

    if (window.google?.maps?.places) {
      initAC()
    } else {
      const existing = document.querySelector('script[data-gm-places]')
      if (!existing) {
        const script = document.createElement('script')
        script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`
        script.async = true
        script.setAttribute('data-gm-places', '1')
        script.onload = initAC
        document.head.appendChild(script)
      } else {
        existing.addEventListener('load', initAC)
      }
    }
  }, [])

  function addContactRow() { setContacts(c => [...c, emptyContact()]) }
  function removeContactRow(i: number) { setContacts(c => c.filter((_, idx) => idx !== i)) }
  function updateContact(i: number, field: keyof ContactDraft, value: any) {
    setContacts(c => c.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  async function handleSave() {
    if (!form.name.trim()) { setErr('Account name is required'); return }
    setSaving(true)
    setErr('')
    try {
      const account = await createAccount({
        name: form.name.trim(),
        address: form.address || undefined,
        phone: form.phone || undefined,
        account_type: form.account_type,
      })
      // Save contacts
      await Promise.all(
        contacts
          .filter(c => c.name.trim())
          .map(c => createContact({
            account_id: account.id,
            name: c.name.trim(),
            role: c.role || c.category || undefined,
            email: c.email || undefined,
            phone: c.phone || undefined,
            is_decision_maker: c.is_decision_maker,
          }))
      )
      invalidate('accounts:all')
      onAdded(account)
    } catch (e: any) {
      setErr(e.message || 'Failed to save account')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '20px' }}>
      <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: '700', color: t.text.primary }}>New Account</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {/* Account fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <div>
            <label style={labelStyle}>Account Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. The Bindery" style={inputStyle} autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Address — type to search with Google</label>
            <input ref={addressRef} type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Start typing address..." style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(720) 555-0000" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))} style={selectStyle}>
                <option value="on_premise">On-Premise</option>
                <option value="off_premise">Off-Premise</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contacts section */}
        <div style={{ borderTop: `1px solid ${t.border.subtle}`, paddingTop: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contacts (optional)</div>
            <button type="button" onClick={addContactRow} style={{ background: 'none', border: 'none', color: t.gold, cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={13} /> Add Contact
            </button>
          </div>
          {contacts.length === 0 && (
            <div style={{ fontSize: '12px', color: t.text.muted, fontStyle: 'italic' }}>No contacts yet — click "Add Contact" to add key people.</div>
          )}
          {contacts.map((c, i) => (
            <div key={i} style={{ backgroundColor: t.bg.card, borderRadius: '10px', padding: '12px', marginBottom: '8px', border: `1px solid ${t.border.default}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: t.text.secondary }}>Contact {i + 1}</span>
                <button type="button" onClick={() => removeContactRow(i)} style={{ background: 'none', border: 'none', color: t.status.danger, cursor: 'pointer', padding: 0 }}>
                  <Trash2 size={13} />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <label style={{ ...labelStyle, marginBottom: '4px' }}>Name *</label>
                  <input type="text" value={c.name} onChange={e => updateContact(i, 'name', e.target.value)} placeholder="Full name" style={{ ...inputStyle, fontSize: '12px' }} />
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: '4px' }}>Category</label>
                  <select value={c.category} onChange={e => updateContact(i, 'category', e.target.value)} style={{ ...selectStyle, fontSize: '12px' }}>
                    {CONTACT_CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <label style={{ ...labelStyle, marginBottom: '4px' }}>Email</label>
                  <input type="email" value={c.email} onChange={e => updateContact(i, 'email', e.target.value)} placeholder="email@venue.com" style={{ ...inputStyle, fontSize: '12px' }} />
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: '4px' }}>Phone</label>
                  <input type="text" value={c.phone} onChange={e => updateContact(i, 'phone', e.target.value)} placeholder="(720) 555-0000" style={{ ...inputStyle, fontSize: '12px' }} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: t.text.secondary }}>
                <input type="checkbox" checked={c.is_decision_maker} onChange={e => updateContact(i, 'is_decision_maker', e.target.checked)} />
                Decision maker
              </label>
            </div>
          ))}
        </div>

        {err && <div style={{ fontSize: '12px', color: t.status.danger, marginBottom: '12px' }}>{err}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()} style={{ ...btnPrimary, opacity: (saving || !form.name.trim()) ? 0.6 : 1 }}>
            <Plus size={14} /> {saving ? 'Saving...' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  )
}
