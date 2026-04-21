'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Plus, Trash2, CheckCircle, MapPin, ChevronDown, ChevronUp } from 'lucide-react'
import { t, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle } from '../lib/theme'
import { createAccount, createContact, getClients, getAccounts } from '../lib/data'
import { invalidate } from '../lib/cache'
import VisitLogModal from './VisitLogModal'
import type { Client } from '../lib/types'

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

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BEST_TIME_OPTIONS = ['morning', 'afternoon', 'evening', 'anytime']
const BEST_TIME_LABELS: Record<string, string> = {
  morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', anytime: 'Anytime',
}
const PRIORITY_COLORS: Record<string, string> = { A: '#ef4444', B: '#d4a843', C: '#22c55e' }
const PRIORITY_LABELS: Record<string, string> = {
  A: 'High priority — visit often',
  B: 'Normal cadence',
  C: 'Low priority — occasional',
}

interface ContactDraft {
  name: string
  role: string
  category: string
  email: string
  phone: string
  is_decision_maker: boolean
}

const emptyContact = (): ContactDraft => ({
  name: '', role: '', category: 'buyer', email: '', phone: '', is_decision_maker: false,
})

export default function AddAccountModal({
  onClose,
  onAdded,
  isMobile = false,
}: {
  onClose: () => void
  onAdded: (account: any) => void
  isMobile?: boolean
}) {
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    account_type: 'on_premise',
    // Advanced
    client_slugs: [] as string[],
    priority: 'B',
    visit_frequency_days: 21,
    best_days: [] as string[],
    best_time: 'anytime',
    website: '',
    instagram: '',
    notes: '',
  })
  const [clients, setClients] = useState<Client[]>([])
  const [contacts, setContacts] = useState<ContactDraft[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState('')
  const [savedAccount, setSavedAccount] = useState<any>(null)
  const [showVisit, setShowVisit] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const acRef = useRef<any>(null)

  // Load clients for brand picker
  useEffect(() => {
    getClients().then(setClients).catch(() => {})
  }, [])

  // Google Places autocomplete on name field
  useEffect(() => {
    let alive = true
    function initAC() {
      if (!alive || !nameRef.current || acRef.current) return
      acRef.current = new window.google.maps.places.Autocomplete(nameRef.current, {
        types: ['establishment'],
        componentRestrictions: { country: 'us' },
        fields: ['name', 'formatted_address', 'formatted_phone_number'],
      })
      acRef.current.addListener('place_changed', () => {
        const place = acRef.current.getPlace()
        setForm(f => ({
          ...f,
          name: place.name || f.name,
          address: place.formatted_address || f.address,
          phone: place.formatted_phone_number || f.phone,
        }))
      })
    }

    if (!document.getElementById('gm-places-script')) {
      const script = document.createElement('script')
      script.id = 'gm-places-script'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`
      script.async = true
      document.head.appendChild(script)
    }

    const interval = setInterval(() => {
      if (window.google?.maps?.places) { clearInterval(interval); initAC() }
    }, 100)

    return () => { alive = false; clearInterval(interval) }
  }, [])

  // Duplicate name detection
  useEffect(() => {
    const name = form.name.trim()
    if (name.length < 3) { setDuplicateWarning(''); return }
    const timer = setTimeout(async () => {
      try {
        const accounts = await getAccounts({ search: name })
        const match = accounts.find(a => a.name.toLowerCase() === name.toLowerCase())
        setDuplicateWarning(match ? `"${match.name}" already exists${match.address ? ` at ${match.address}` : ''}.` : '')
      } catch { setDuplicateWarning('') }
    }, 400)
    return () => clearTimeout(timer)
  }, [form.name])

  function toggleDay(day: string) {
    setForm(f => ({
      ...f,
      best_days: f.best_days.includes(day)
        ? f.best_days.filter(d => d !== day)
        : [...f.best_days, day],
    }))
  }

  function toggleBrand(slug: string) {
    setForm(f => ({
      ...f,
      client_slugs: f.client_slugs.includes(slug)
        ? f.client_slugs.filter(s => s !== slug)
        : [...f.client_slugs, slug],
    }))
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
        visit_frequency_days: form.visit_frequency_days,
        client_slugs: form.client_slugs,
        notes: form.notes || undefined,
        website: form.website || undefined,
        instagram: form.instagram || undefined,
        best_days: form.best_days,
        best_time: form.best_time,
        priority: form.priority,
      })
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
      setSavedAccount(account)
    } catch (e: any) {
      setErr(e.message || 'Failed to save account')
    } finally { setSaving(false) }
  }

  // Success state
  if (savedAccount && !showVisit) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '20px' }}>
        <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', padding: '36px 28px', width: '100%', maxWidth: '420px', textAlign: 'center' }}>
          <CheckCircle size={40} color={t.status.success} style={{ marginBottom: '16px' }} />
          <div style={{ fontSize: '17px', fontWeight: '700', color: t.text.primary, marginBottom: '6px' }}>{savedAccount.name} added!</div>
          <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '28px' }}>Want to log a visit while you're here?</div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => { onAdded(savedAccount); onClose() }} style={btnSecondary}>Done</button>
            <button onClick={() => setShowVisit(true)} style={btnPrimary}>
              <MapPin size={14} /> Log a Visit
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (showVisit && savedAccount) {
    return (
      <VisitLogModal
        isOpen
        onClose={() => { onAdded(savedAccount); onClose() }}
        onSuccess={() => { onAdded(savedAccount); onClose() }}
        defaultAccountId={savedAccount.id}
        defaultAccountName={savedAccount.name}
        isMobile={isMobile}
      />
    )
  }

  const pillBtn = (active: boolean, color?: string): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
    border: `1px solid ${active ? (color || t.gold) : t.border.default}`,
    backgroundColor: active ? ((color || t.gold) + '22') : 'transparent',
    color: active ? (color || t.gold) : t.text.muted,
    fontWeight: active ? '600' : '400',
    transition: 'all 120ms ease',
  })

  const priorityColors: Record<string, string> = PRIORITY_COLORS

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '20px' }}>
      <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', width: '100%', maxWidth: '520px', maxHeight: '92vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: `1px solid ${t.border.subtle}` }}>
          <h3 style={{ fontSize: '17px', fontWeight: '700', color: t.text.primary }}>New Account</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px' }}>

          {/* ── Basic Fields ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Account Name — start typing to search Google</label>
              <input
                ref={nameRef}
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. The Bindery, Whole Foods..."
                style={{ ...inputStyle, borderColor: duplicateWarning ? '#f59e0b' : undefined }}
                autoFocus
                autoComplete="off"
              />
              {duplicateWarning && (
                <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ⚠ {duplicateWarning} Save anyway if this is a different location.
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>Address</label>
              <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Auto-fills from Google, or type manually" style={inputStyle} />
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

          {/* ── More Details Toggle ── */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
              border: `1px solid ${showAdvanced ? t.border.hover : t.border.default}`,
              backgroundColor: showAdvanced ? t.bg.card : 'transparent',
              color: showAdvanced ? t.text.primary : t.text.muted,
              fontSize: '13px', fontWeight: '600', marginBottom: showAdvanced ? '0' : '16px',
            }}
          >
            <span>More Details {!showAdvanced && form.client_slugs.length === 0 && form.priority === 'B' && !form.notes ? <span style={{ fontSize: '11px', color: t.text.muted, fontWeight: '400' }}>— brands, visit schedule, notes...</span> : ''}</span>
            {showAdvanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showAdvanced && (
            <div style={{ border: `1px solid ${t.border.default}`, borderRadius: '12px', padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>

              {/* Brands */}
              {clients.length > 0 && (
                <div>
                  <label style={labelStyle}>Brands They Carry</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {clients.map(c => (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => toggleBrand(c.slug)}
                        style={pillBtn(form.client_slugs.includes(c.slug), c.color)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Priority + Visit Frequency */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Account Priority</label>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    {(['A', 'B', 'C'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, priority: p }))}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: '8px', cursor: 'pointer',
                          border: `1px solid ${form.priority === p ? priorityColors[p] : t.border.default}`,
                          backgroundColor: form.priority === p ? priorityColors[p] + '22' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        title={PRIORITY_LABELS[p]}
                      >
                        <span style={{
                          width: 10, height: 10, borderRadius: '50%',
                          backgroundColor: priorityColors[p],
                          boxShadow: form.priority === p ? `0 0 6px ${priorityColors[p]}` : 'none',
                        }} />
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '4px' }}>{PRIORITY_LABELS[form.priority]}</div>
                </div>
                <div>
                  <label style={labelStyle}>Visit Every (days)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={form.visit_frequency_days}
                    onChange={e => setForm(f => ({ ...f, visit_frequency_days: parseInt(e.target.value) || 21 }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Best Days */}
              <div>
                <label style={labelStyle}>Best Days to Visit</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {DAYS.map(day => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      style={{
                        width: 40, height: 36, borderRadius: '8px', fontSize: '11px',
                        fontWeight: form.best_days.includes(day) ? '700' : '400',
                        cursor: 'pointer',
                        border: `1px solid ${form.best_days.includes(day) ? t.gold : t.border.default}`,
                        backgroundColor: form.best_days.includes(day) ? t.goldDim : 'transparent',
                        color: form.best_days.includes(day) ? t.gold : t.text.muted,
                      }}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Best Time */}
              <div>
                <label style={labelStyle}>Best Time to Visit</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {BEST_TIME_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, best_time: opt }))}
                      style={pillBtn(form.best_time === opt)}
                    >
                      {BEST_TIME_LABELS[opt]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Website + Instagram */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Website</label>
                  <input type="url" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Instagram</label>
                  <input type="text" value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="@handle" style={inputStyle} />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Special instructions, parking, who to ask for..."
                  style={{ ...inputStyle, resize: 'none' }}
                />
              </div>
            </div>
          )}

          {/* ── Contacts Section ── */}
          <button
            onClick={() => { setShowContacts(v => !v); if (!showContacts && contacts.length === 0) setContacts([emptyContact()]) }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
              border: `1px solid ${showContacts ? t.border.hover : t.border.default}`,
              backgroundColor: showContacts ? t.bg.card : 'transparent',
              color: showContacts ? t.text.primary : t.text.muted,
              fontSize: '13px', fontWeight: '600', marginBottom: showContacts ? '0' : '0',
            }}
          >
            <span>Add Key Contacts <span style={{ fontSize: '11px', color: t.text.muted, fontWeight: '400' }}>— optional</span></span>
            {showContacts ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showContacts && (
            <div style={{ border: `1px solid ${t.border.default}`, borderRadius: '12px', padding: '14px', marginTop: '8px' }}>
              {contacts.map((c, i) => (
                <div key={i} style={{ backgroundColor: t.bg.card, borderRadius: '10px', padding: '12px', marginBottom: '8px', border: `1px solid ${t.border.default}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: t.text.secondary }}>Contact {i + 1}</span>
                    <button type="button" onClick={() => setContacts(c => c.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: t.status.danger, cursor: 'pointer', padding: 0 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px' }}>Name *</label>
                      <input type="text" value={c.name} onChange={e => setContacts(cs => cs.map((r, idx) => idx === i ? { ...r, name: e.target.value } : r))} placeholder="Full name" style={{ ...inputStyle, fontSize: '12px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px' }}>Category</label>
                      <select value={c.category} onChange={e => setContacts(cs => cs.map((r, idx) => idx === i ? { ...r, category: e.target.value } : r))} style={{ ...selectStyle, fontSize: '12px' }}>
                        {CONTACT_CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px' }}>Email</label>
                      <input type="email" value={c.email} onChange={e => setContacts(cs => cs.map((r, idx) => idx === i ? { ...r, email: e.target.value } : r))} placeholder="email@venue.com" style={{ ...inputStyle, fontSize: '12px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px' }}>Phone</label>
                      <input type="text" value={c.phone} onChange={e => setContacts(cs => cs.map((r, idx) => idx === i ? { ...r, phone: e.target.value } : r))} placeholder="(720) 555-0000" style={{ ...inputStyle, fontSize: '12px' }} />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: t.text.secondary }}>
                    <input type="checkbox" checked={c.is_decision_maker} onChange={e => setContacts(cs => cs.map((r, idx) => idx === i ? { ...r, is_decision_maker: e.target.checked } : r))} />
                    Decision maker
                  </label>
                </div>
              ))}
              <button type="button" onClick={() => setContacts(c => [...c, emptyContact()])} style={{ background: 'none', border: 'none', color: t.gold, cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 0' }}>
                <Plus size={13} /> Add another contact
              </button>
            </div>
          )}

          {err && <div style={{ fontSize: '12px', color: t.status.danger, marginTop: '12px' }}>{err}</div>}

          {/* Footer */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button onClick={onClose} style={btnSecondary}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.name.trim()} style={{ ...btnPrimary, opacity: (saving || !form.name.trim()) ? 0.6 : 1 }}>
              <Plus size={14} /> {saving ? 'Saving...' : 'Add Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
