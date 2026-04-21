'use client'
import { useState, useEffect, useCallback } from 'react'
import { Package, Plus, X } from 'lucide-react'
import LayoutShell from '../layout-shell'
import EmptyState from '../components/EmptyState'
import ConfirmModal from '../components/ConfirmModal'
import { CardSkeleton } from '../components/LoadingSkeleton'
import { getPlacements, getClients, getAccounts, getProducts, createPlacement, advancePlacementStatus, revertPlacementStatus, markPlacementLost } from '../lib/data'
import { t, card, badge, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle } from '../lib/theme'
import { formatShortDateMT } from '../lib/formatters'
import { PLACEMENT_STATUS_LABELS, PLACEMENT_TYPES, PLACEMENT_TYPE_LABELS, clientLogoUrl } from '../lib/constants'
import type { Client, PlacementStatus } from '../lib/types'

const STATUS_TABS: PlacementStatus[] = ['committed', 'ordered', 'on_shelf', 'reordering']

export default function PlacementsPage() {
  const [placements, setPlacements] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [clientProducts, setClientProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [statusFilter, setStatusFilter] = useState<PlacementStatus | 'all'>('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [lostModal, setLostModal] = useState<{ id: string; clientSlug: string; open: boolean }>({ id: '', clientSlug: '', open: false })
  const [lostReason, setLostReason] = useState('')
  const [form, setForm] = useState({
    account_id: '',
    client_slug: '',
    product_name: '',
    placement_type: 'shelf',
    price_point: '',
    notes: '',
  })

  const load = useCallback(async () => {
    const [ps, cls] = await Promise.all([getPlacements(), getClients()])
    setPlacements(ps)
    setClients(cls)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Load accounts when create modal opens
  useEffect(() => {
    if (showCreate && accounts.length === 0) {
      getAccounts({ limit: 500 }).then(setAccounts).catch(() => {})
    }
  }, [showCreate, accounts.length])

  // Load products when brand is selected
  useEffect(() => {
    if (form.client_slug) {
      getProducts(form.client_slug).then(setClientProducts).catch(() => setClientProducts([]))
    } else {
      setClientProducts([])
    }
  }, [form.client_slug])

  async function handleCreate() {
    if (!form.account_id || !form.client_slug || !form.product_name) return
    setCreating(true)
    try {
      await createPlacement({
        account_id: form.account_id,
        client_slug: form.client_slug,
        product_name: form.product_name,
        placement_type: form.placement_type as any,
        price_point: form.price_point ? parseFloat(form.price_point) : undefined,
        status: 'committed',
      })
      setShowCreate(false)
      setForm({ account_id: '', client_slug: '', product_name: '', placement_type: 'shelf', price_point: '', notes: '' })
      load()
    } catch (e) { console.error(e) }
    finally { setCreating(false) }
  }

  const filtered = placements.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (clientFilter !== 'all' && p.client_slug !== clientFilter) return false
    return true
  })

  const counts: Record<string, number> = { all: placements.length }
  STATUS_TABS.forEach(s => { counts[s] = placements.filter(p => p.status === s).length })

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Placements</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>{placements.length} active placements</p>
          </div>
          <button onClick={() => setShowCreate(true)} style={btnPrimary}><Plus size={16} /> New Placement</button>
        </div>

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', overflowX: 'auto' }}>
          {(['all', ...STATUS_TABS] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              border: `1px solid ${statusFilter === s ? t.gold : t.border.default}`,
              backgroundColor: statusFilter === s ? t.goldDim : 'transparent',
              color: statusFilter === s ? t.gold : t.text.secondary,
              fontWeight: statusFilter === s ? '600' : '400',
              whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              {s === 'all' ? 'All' : PLACEMENT_STATUS_LABELS[s]}
              <span style={{
                fontSize: '11px', padding: '0 5px', borderRadius: '8px',
                backgroundColor: statusFilter === s ? t.goldBorder : t.border.default,
                color: statusFilter === s ? t.gold : t.text.muted,
              }}>
                {counts[s] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Client filter */}
        {clients.length > 1 && (
          <div style={{ marginBottom: '16px' }}>
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} style={{
              padding: '7px 12px', borderRadius: '8px', fontSize: '13px',
              border: `1px solid ${t.border.default}`,
              backgroundColor: t.bg.card, color: t.text.secondary, outline: 'none', cursor: 'pointer',
            }}>
              <option value="all">All Brands</option>
              {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
        )}

        {loading ? <CardSkeleton count={5} /> : filtered.length === 0 ? (
          <EmptyState
            icon={<Package size={36} />}
            title="No placements"
            subtitle={statusFilter !== 'all' ? `No ${PLACEMENT_STATUS_LABELS[statusFilter as PlacementStatus]} placements` : 'Track where your brands are placed'}
            action={<button onClick={() => setShowCreate(true)} style={btnPrimary}><Plus size={14} /> New Placement</button>}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(p => {
              const client = clients.find(c => c.slug === p.client_slug)
              return (
                <div key={p.id} style={{ ...card, padding: isMobile ? '14px' : '16px 20px', borderLeft: `3px solid ${client?.color || t.gold}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        {client && (() => { const logo = clientLogoUrl(client); return logo ? <img src={logo} alt={client.name} style={{ width: '18px', height: '18px', objectFit: 'contain', borderRadius: '3px' }} /> : null })()}
                        <div style={{ fontSize: '15px', fontWeight: '600', color: t.text.primary }}>{p.product_name}</div>
                      </div>
                      <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '8px' }}>
                        {p.accounts?.name} · {client?.name || p.client_slug} · {PLACEMENT_TYPE_LABELS[p.placement_type as keyof typeof PLACEMENT_TYPE_LABELS] || p.placement_type}
                        {p.price_point && ` · $${p.price_point}`}
                      </div>
                      <div style={{ fontSize: '11px', color: t.text.muted }}>Added {formatShortDateMT(p.created_at)}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                      <span style={badge.placementStatus(p.status)}>{PLACEMENT_STATUS_LABELS[p.status as PlacementStatus] || p.status}</span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {/* Move back */}
                        {p.status !== 'committed' && (
                          <button onClick={() => revertPlacementStatus(p.id, p.status).then(load)} style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                            border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.muted,
                          }}
                            title="Move back one step"
                          >
                            ← {PLACEMENT_STATUS_LABELS[{ ordered: 'committed', on_shelf: 'ordered', reordering: 'on_shelf' }[p.status as string] as PlacementStatus]}
                          </button>
                        )}
                        {/* Move forward */}
                        {p.status !== 'reordering' && (
                          <button onClick={() => advancePlacementStatus(p.id, p.status).then(load)} style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                            border: `1px solid ${t.border.hover}`, backgroundColor: 'transparent', color: t.text.secondary,
                          }}>
                            → {PLACEMENT_STATUS_LABELS[{ committed: 'ordered', ordered: 'on_shelf', on_shelf: 'reordering' }[p.status as string] as PlacementStatus]}
                          </button>
                        )}
                        <button onClick={() => { setLostModal({ id: p.id, clientSlug: p.client_slug || '', open: true }); setLostReason('') }} style={{
                          padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                          border: `1px solid rgba(224,82,82,0.3)`, backgroundColor: t.status.dangerBg, color: t.status.danger,
                        }}>
                          Mark Lost
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Create Placement Modal */}
        {showCreate && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary }}>New Placement</h3>
                <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Account</label>
                  <select value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))} style={selectStyle}>
                    <option value="">Select account...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Brand</label>
                  <select value={form.client_slug} onChange={e => setForm(f => ({ ...f, client_slug: e.target.value }))} style={selectStyle}>
                    <option value="">Select brand...</option>
                    {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Product Name</label>
                  {clientProducts.length > 0 ? (
                    <select value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} style={selectStyle}>
                      <option value="">Select product...</option>
                      {clientProducts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} placeholder="e.g. Barley Bros Wheat Whiskey 750ml" style={inputStyle} />
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Placement Type</label>
                    <select value={form.placement_type} onChange={e => setForm(f => ({ ...f, placement_type: e.target.value }))} style={selectStyle}>
                      {PLACEMENT_TYPES.map(pt => <option key={pt} value={pt}>{PLACEMENT_TYPE_LABELS[pt]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Price Point (optional)</label>
                    <input type="number" value={form.price_point} onChange={e => setForm(f => ({ ...f, price_point: e.target.value }))} placeholder="0.00" step="0.01" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setShowCreate(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleCreate} disabled={creating || !form.account_id || !form.client_slug || !form.product_name}
                  style={{ ...btnPrimary, opacity: (creating || !form.account_id || !form.client_slug || !form.product_name) ? 0.6 : 1 }}>
                  {creating ? 'Saving...' : 'Add Placement'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lost modal */}
        {lostModal.open && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '400px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary, marginBottom: '16px' }}>Mark Placement Lost</h3>
              <label style={labelStyle}>Reason (optional)</label>
              <input type="text" value={lostReason} onChange={e => setLostReason(e.target.value)} placeholder="e.g. Switched brands, ran out of space..." style={{ ...inputStyle, marginBottom: '20px' }} />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setLostModal({ id: '', clientSlug: '', open: false })} style={btnSecondary}>Cancel</button>

                <button onClick={async () => {
                  await markPlacementLost(lostModal.id, lostReason, lostModal.clientSlug)
                  setLostModal({ id: '', clientSlug: '', open: false })
                  load()
                }} style={{ ...btnPrimary, backgroundColor: t.status.danger }}>Confirm Lost</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
