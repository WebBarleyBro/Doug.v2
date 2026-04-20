'use client'
import { useState, useEffect } from 'react'
import { Shield, AlertTriangle, Plus, X } from 'lucide-react'
import LayoutShell from '../layout-shell'
import EmptyState from '../components/EmptyState'
import { getClients, getStateRegistrations, upsertStateRegistration } from '../lib/data'
import { t, card, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle } from '../lib/theme'
import { formatShortDateMT, daysAgoMT } from '../lib/formatters'
import { US_STATES } from '../lib/constants'
import type { Client } from '../lib/types'

const STATUS_COLORS: Record<string, string> = {
  active: '#3dba78', pending: '#e89a2e', expired: '#e05252', not_registered: '#6b6966',
}

export default function CompliancePage() {
  const [clients, setClients] = useState<Client[]>([])
  const [registrations, setRegistrations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState<{ open: boolean; clientId?: string }>({ open: false })
  const [form, setForm] = useState({ state: '', status: 'pending', ttb_number: '', expiry_date: '', notes: '' })

  useEffect(() => {
    Promise.all([getClients(), getStateRegistrations()])
      .then(([cls, regs]) => { setClients(cls); setRegistrations(regs); setLoading(false) })
  }, [])

  const expiringSoon = registrations.filter(r => {
    if (!r.expiry_date || r.status !== 'active') return false
    const days = daysAgoMT(r.expiry_date)
    return days !== null && days > -90 && days <= 0
  })
  const expired = registrations.filter(r => r.status === 'expired')
  const urgent = registrations.filter(r => {
    if (!r.expiry_date || r.status !== 'active') return false
    const days = daysAgoMT(r.expiry_date)
    return days !== null && days > -30 && days <= 0
  })

  async function handleSave() {
    if (!form.state || !addModal.clientId) return
    const client = clients.find(c => c.slug === addModal.clientId || c.id === addModal.clientId)
    await upsertStateRegistration({ ...form, status: form.status as any, client_id: client?.id || addModal.clientId })
    const regs = await getStateRegistrations()
    setRegistrations(regs)
    setAddModal({ open: false })
    setForm({ state: '', status: 'pending', ttb_number: '', expiry_date: '', notes: '' })
  }

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '1300px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Compliance</h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>State registrations, TTB approvals, label expiry tracking</p>
        </div>

        {/* Alert banners */}
        {urgent.length > 0 && (
          <div style={{ backgroundColor: t.status.dangerBg, border: `1px solid rgba(224,82,82,0.3)`, borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} color={t.status.danger} />
            <span style={{ color: t.status.danger, fontSize: '14px', fontWeight: '600' }}>
              {urgent.length} registration{urgent.length !== 1 ? 's' : ''} expire within 30 days
            </span>
          </div>
        )}
        {expiringSoon.length > 0 && !urgent.length && (
          <div style={{ backgroundColor: t.status.warningBg, border: `1px solid rgba(232,154,46,0.3)`, borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} color={t.status.warning} />
            <span style={{ color: t.status.warning, fontSize: '14px', fontWeight: '600' }}>
              {expiringSoon.length} registration{expiringSoon.length !== 1 ? 's' : ''} expire within 90 days
            </span>
          </div>
        )}

        {/* Per-client sections */}
        {clients.map(client => {
          const clientRegs = registrations.filter(r => r.client_id === client.id)
          return (
            <div key={client.id} style={{ ...card, marginBottom: '20px', padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: client.color }} />
                  <h2 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary }}>{client.name}</h2>
                  <span style={{ fontSize: '11px', color: t.text.muted }}>{clientRegs.length} state{clientRegs.length !== 1 ? 's' : ''}</span>
                </div>
                <button onClick={() => setAddModal({ open: true, clientId: client.id })} style={{ ...btnSecondary, padding: '6px 12px', fontSize: '12px' }}>
                  <Plus size={13} /> Add State
                </button>
              </div>

              {clientRegs.length === 0 ? (
                <div style={{ fontSize: '13px', color: t.text.muted }}>No registrations tracked yet</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                  {clientRegs.map((r: any) => {
                    const expiryDays = r.expiry_date ? daysAgoMT(r.expiry_date) : null
                    const isExpiringSoon = expiryDays !== null && expiryDays > -90 && expiryDays <= 0
                    return (
                      <div key={r.id} style={{
                        backgroundColor: t.bg.elevated,
                        border: `1px solid ${isExpiringSoon ? STATUS_COLORS[r.status] + '60' : t.border.default}`,
                        borderRadius: '8px',
                        padding: '10px 12px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary }}>{r.state}</span>
                          <span style={{
                            fontSize: '9px', padding: '2px 6px', borderRadius: '8px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em',
                            backgroundColor: STATUS_COLORS[r.status] + '20',
                            color: STATUS_COLORS[r.status],
                          }}>
                            {r.status.replace('_', ' ')}
                          </span>
                        </div>
                        {r.ttb_number && <div style={{ fontSize: '11px', color: t.text.muted }}>TTB: {r.ttb_number}</div>}
                        {r.expiry_date && (
                          <div style={{ fontSize: '11px', color: isExpiringSoon ? STATUS_COLORS[r.status] : t.text.muted, marginTop: '2px' }}>
                            Expires {formatShortDateMT(r.expiry_date)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Add modal */}
        {addModal.open && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '440px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary }}>Add State Registration</h3>
                <button onClick={() => setAddModal({ open: false })} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>State</label>
                  <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} style={selectStyle}>
                    <option value="">Select...</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={selectStyle}>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                    <option value="not_registered">Not Registered</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>TTB Number</label>
                  <input type="text" value={form.ttb_number} onChange={e => setForm(f => ({ ...f, ttb_number: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Expiry Date</label>
                  <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <label style={labelStyle}>Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setAddModal({ open: false })} style={btnSecondary}>Cancel</button>
                <button onClick={handleSave} style={btnPrimary}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
