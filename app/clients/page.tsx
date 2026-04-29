'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { DollarSign, MapPin, ChevronRight, Plus, X } from 'lucide-react'
import LayoutShell from '../layout-shell'
import { useToast } from '../layout-shell'
import { CardSkeleton } from '../components/LoadingSkeleton'
import EmptyState from '../components/EmptyState'
import { getClients, createClient } from '../lib/data'
import { t, card, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle } from '../lib/theme'
import { formatPercent } from '../lib/formatters'
import { clientLogoUrl } from '../lib/constants'
import type { Client } from '../lib/types'

const PRESET_COLORS = ['#c8a96e', '#6aaee0', '#3dba78', '#a78bfa', '#f97316', '#e85540', '#e99928', '#64b5f6']

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function ClientsPage() {
  const toast = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addErr, setAddErr] = useState('')
  const [form, setForm] = useState({
    name: '', slug: '', order_type: 'distributor' as 'direct' | 'distributor',
    commission_rate: '', color: PRESET_COLORS[0],
    contact_name: '', contact_email: '', territory: '', notes: '',
  })

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    getClients().then(cls => { setClients(cls); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  function resetForm() {
    setForm({ name: '', slug: '', order_type: 'distributor', commission_rate: '', color: PRESET_COLORS[0], contact_name: '', contact_email: '', territory: '', notes: '' })
    setAddErr('')
  }

  async function handleAdd() {
    if (!form.name.trim()) { setAddErr('Brand name is required.'); return }
    if (!form.slug.trim()) { setAddErr('Slug is required.'); return }
    const rate = parseFloat(form.commission_rate)
    if (isNaN(rate) || rate < 0 || rate > 1) { setAddErr('Commission rate must be between 0 and 1 (e.g. 0.15 for 15%).'); return }
    setSaving(true)
    setAddErr('')
    try {
      await createClient({
        name: form.name.trim(),
        slug: form.slug.trim(),
        order_type: form.order_type,
        commission_rate: rate,
        color: form.color,
        contact_name: form.contact_name || undefined,
        contact_email: form.contact_email || undefined,
        territory: form.territory || undefined,
        notes: form.notes || undefined,
      })
      const updated = await getClients()
      setClients(updated)
      setShowAdd(false)
      resetForm()
      toast('Brand added')
    } catch (err: any) {
      console.error('clients.create', err)
      setAddErr(err.message || 'Failed to create brand.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div>
            <h1 className="page-h1" style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Clients</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Your brand portfolio</p>
          </div>
          <button onClick={() => { resetForm(); setShowAdd(true) }} style={{ ...btnPrimary, padding: '8px 14px', fontSize: '13px' }}>
            <Plus size={14} /> Add Brand
          </button>
        </div>

        {loading ? <CardSkeleton count={4} /> : clients.length === 0 ? (
          <EmptyState icon={<DollarSign size={36} />} title="No brands yet" subtitle="Add your first brand to get started" action={
            <button onClick={() => { resetForm(); setShowAdd(true) }} style={btnPrimary}><Plus size={14} /> Add Brand</button>
          } />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {clients.map(client => (
              <Link key={client.slug} href={`/clients/${client.slug}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  ...card,
                  padding: '20px 24px',
                  borderLeft: `4px solid ${client.color || t.gold}`,
                  cursor: 'pointer',
                  transition: 'background 150ms ease',
                }}>
                  <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '16px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                    {(() => {
                      const logo = clientLogoUrl(client)
                      return logo ? (
                        <img src={logo} alt={client.name}
                          style={{ width: '52px', height: '52px', objectFit: 'contain', flexShrink: 0, borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.04)', padding: '4px' }} />
                      ) : (
                        <div style={{ width: '52px', height: '52px', borderRadius: '8px', backgroundColor: `${client.color}22`, border: `1px solid ${client.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '20px', fontWeight: '700', color: client.color }}>{client.name[0]}</span>
                        </div>
                      )
                    })()}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <h2 style={{ fontSize: '17px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.01em' }}>
                          {client.name}
                        </h2>
                        <span style={{
                          fontSize: '10px', padding: '2px 8px', borderRadius: '10px',
                          backgroundColor: client.order_type === 'direct' ? t.goldDim : t.status.infoBg,
                          color: client.order_type === 'direct' ? t.gold : t.status.info,
                          fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          {client.order_type}
                        </span>
                        {client.category && (
                          <span style={{ fontSize: '11px', color: t.text.muted }}>{client.category}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {client.territory && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={11} color={t.text.muted} />
                            <span style={{ fontSize: '12px', color: t.text.muted }}>{client.territory}</span>
                          </div>
                        )}
                        {client.commission_rate > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <DollarSign size={11} color={t.text.muted} />
                            <span style={{ fontSize: '12px', color: t.text.muted }}>{formatPercent(client.commission_rate)} commission</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} color={t.text.muted} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Add Brand Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ ...card, width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: '700', color: t.text.primary }}>Add Brand</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted, padding: '4px' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Brand Name *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))}
                  placeholder="e.g. Whiskey Creek Distillery" autoFocus />
              </div>
              <div>
                <label style={labelStyle}>Slug (URL key) *</label>
                <input style={inputStyle} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="e.g. whiskey-creek" />
                <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '4px' }}>Auto-generated from name. Must be unique and lowercase.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Order Type *</label>
                  <select style={selectStyle} value={form.order_type} onChange={e => setForm(f => ({ ...f, order_type: e.target.value as any }))}>
                    <option value="distributor">Distributor</option>
                    <option value="direct">Direct</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Commission Rate *</label>
                  <input style={inputStyle} type="number" step="0.01" min="0" max="1" value={form.commission_rate}
                    onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))}
                    placeholder="0.15" />
                  <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '4px' }}>Decimal (0.15 = 15%)</div>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Brand Color</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{
                      width: '28px', height: '28px', borderRadius: '6px', backgroundColor: c, border: form.color === c ? `3px solid ${t.text.primary}` : '2px solid transparent', cursor: 'pointer', transition: 'border 150ms',
                    }} />
                  ))}
                  <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${t.border.default}`, cursor: 'pointer', padding: '0', backgroundColor: 'transparent' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Contact Name</label>
                  <input style={inputStyle} value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Brand contact" />
                </div>
                <div>
                  <label style={labelStyle}>Contact Email</label>
                  <input style={inputStyle} type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="contact@brand.com" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Territory</label>
                <input style={inputStyle} value={form.territory} onChange={e => setForm(f => ({ ...f, territory: e.target.value }))} placeholder="e.g. Colorado, Wyoming" />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this brand..." />
              </div>
            </div>

            {addErr && (
              <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px', backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '13px' }}>
                {addErr}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '22px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={btnSecondary} disabled={saving}>Cancel</button>
              <button onClick={handleAdd} style={btnPrimary} disabled={saving || !form.name.trim() || !form.slug.trim()}>
                {saving ? 'Adding...' : 'Add Brand'}
              </button>
            </div>
          </div>
        </div>
      )}
    </LayoutShell>
  )
}
