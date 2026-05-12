'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, X, Check, Trash2, Search, Pencil } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { v3, v3input, v3label, v3btnPrimary, v3btnSecondary } from '../lib/theme'
import { useV3Orders, useV3Clients } from '../lib/query'
import { useV3Toast } from '../lib/context'
import { formatCurrency, relativeTimeStr, resolveTotal } from '../../lib/formatters'
import { getSupabase } from '../../lib/supabase'
import { getProducts, getDistributorReps, getNextOrderNumber } from '../../lib/data'
import type { Client, Product, Contact } from '../../lib/types'

const ORDER_STATUSES = ['draft', 'sent', 'fulfilled', 'cancelled'] as const
const ORDER_LABELS: Record<string, string> = { draft: 'Draft', sent: 'Sent', fulfilled: 'Fulfilled', cancelled: 'Cancelled' }
const ORDER_COLORS: Record<string, string> = {
  draft:     v3.text.muted,
  sent:      v3.status.warning,
  fulfilled: v3.status.success,
  cancelled: v3.status.danger,
}

function StatusPill({ status }: { status: string }) {
  const c = ORDER_COLORS[status] ?? v3.text.muted
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, color: c, background: c + '18', padding: '3px 9px', borderRadius: v3.radius.full, border: `1px solid ${c}30`, whiteSpace: 'nowrap' }}>
      {ORDER_LABELS[status] ?? status}
    </span>
  )
}

// ── Account typeahead ─────────────────────────────────────────────────────────
function AccountSearch({ value, name, onChange }: { value: string; name: string; onChange: (id: string, name: string) => void }) {
  const [query, setQuery] = useState(name)
  const [results, setResults] = useState<any[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (value) return
    if (!query.trim() || query.length < 2) { setResults([]); return }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const sb = getSupabase()
      const { data } = await sb.from('accounts').select('id, name').ilike('name', `%${query}%`).limit(8)
      setResults(data ?? [])
    }, 220)
  }, [query, value])

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: v3.bg.sheet, border: `1px solid ${v3.amber}55`, borderRadius: v3.radius.md }}>
        <span style={{ flex: 1, fontSize: '14px', color: v3.text.primary, fontWeight: 600 }}>{name}</span>
        <button onClick={() => { onChange('', ''); setQuery('') }} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 0, display: 'flex' }}><X size={13} /></button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: v3.bg.sheet, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md }}>
        <Search size={13} color={v3.text.muted} style={{ flexShrink: 0 }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search accounts…"
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: v3.text.primary, fontSize: '14px', padding: '10px 0', fontFamily: v3.font.ui }} />
      </div>
      {results.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 20, background: v3.bg.elevated, border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {results.map(a => (
            <button key={a.id} onClick={() => { onChange(a.id, a.name); setQuery(a.name); setResults([]) }}
              style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${v3.border.subtle}`, textAlign: 'left', cursor: 'pointer', color: v3.text.primary, fontSize: '14px', fontFamily: v3.font.ui, fontWeight: 600 }}>
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add New Account (inline from order creation) ──────────────────────────────
function AddNewAccountModal({ onCreated, onClose }: { onCreated: (id: string, name: string) => void; onClose: () => void }) {
  const [name, setName]     = useState('')
  const [address, setAddr]  = useState('')
  const [type, setType]     = useState<'on_premise' | 'off_premise'>('on_premise')
  const [error, setError]   = useState('')

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb.from('accounts').insert({
        name: name.trim(),
        address: address.trim() || null,
        account_type: type,
        visit_frequency_days: 30,
        priority: 'B',
      }).select('id, name').single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => { onCreated(data.id, data.name); onClose() },
    onError: (e: any) => setError(e?.message ?? 'Failed to create account'),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 420, background: v3.bg.elevated, border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.xl, padding: '24px', boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>New Account</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={v3label}>Account Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="The Golden Pony Bar & Grill"
              style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
          <div>
            <label style={v3label}>Address</label>
            <input value={address} onChange={e => setAddr(e.target.value)} placeholder="123 Main St, Denver, CO"
              style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
          <div>
            <label style={v3label}>Type</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {([['on_premise', 'On-Premise'], ['off_premise', 'Off-Premise']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setType(v)} style={{
                  flex: 1, padding: '9px', border: `1px solid ${type === v ? v3.amber + '60' : v3.border.default}`,
                  background: type === v ? v3.amber + '12' : 'transparent',
                  borderRadius: v3.radius.md, fontSize: '13px', fontWeight: 700,
                  color: type === v ? v3.amberLight : v3.text.muted, cursor: 'pointer',
                }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        {error && <div style={{ marginTop: 12, fontSize: '13px', color: v3.status.danger }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md, fontSize: '13px', fontWeight: 600, color: v3.text.muted, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}
            style={{ flex: 2, padding: '10px', background: v3.amber, border: 'none', borderRadius: v3.radius.md, fontSize: '13px', fontWeight: 800, color: '#000', cursor: 'pointer', opacity: !name.trim() ? 0.4 : 1 }}>
            {save.isPending ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create Order Modal ────────────────────────────────────────────────────────
function CreateOrderModal({ clients, onClose }: { clients: Client[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [brandSlug, setBrandSlug]       = useState(clients[0]?.slug ?? '')
  const [accountId, setAccountId]       = useState('')
  const [accountName, setAccountName]   = useState('')
  const [orderType, setOrderType]       = useState<'direct' | 'distributor'>('distributor')
  const [distEmail, setDistEmail]       = useState('')
  const [distRepId, setDistRepId]       = useState('')
  const [notes, setNotes]               = useState('')
  const [poNumber, setPoNumber]         = useState('')
  const [lineItems, setLineItems]       = useState([{ name: '', qty: 1, price: 0 }])
  const [products, setProducts]         = useState<Product[]>([])
  const [distReps, setDistReps]         = useState<Contact[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [error, setError]               = useState('')
  const [showAddAccount, setShowAddAccount] = useState(false)
  const toast = useV3Toast()

  const selectedClient   = clients.find(c => c.slug === brandSlug)
  const total            = lineItems.reduce((s, li) => s + li.qty * (li.price || 0), 0)
  const commissionRate   = selectedClient?.commission_rate ?? 0
  const commissionAmount = Math.round(total * commissionRate * 100) / 100

  // When brand changes → auto-set order type + load products + dist reps
  useEffect(() => {
    if (!brandSlug) return
    const cl = clients.find(c => c.slug === brandSlug)
    if (cl?.order_type === 'direct' || cl?.order_type === 'distributor') {
      setOrderType(cl.order_type)
    }
    setDistRepId('')
    setDistEmail('')
    setProductsLoading(true)
    Promise.all([
      getProducts(brandSlug).catch(() => [] as Product[]),
      getDistributorReps(brandSlug).catch(() => [] as Contact[]),
    ]).then(([prods, reps]) => {
      setProducts(prods)
      setDistReps(reps)
      setProductsLoading(false)
    })
  }, [brandSlug])

  // When order type changes → fetch next sequential PO/OI number
  useEffect(() => {
    const prefix = orderType === 'direct' ? 'PO' : 'OI'
    getNextOrderNumber(prefix)
      .then(n => setPoNumber(n))
      .catch(() => setPoNumber(`${prefix}-${Date.now().toString().slice(-4)}`))
  }, [orderType])

  function updateLine(i: number, field: string, val: string | number) {
    setLineItems(items => items.map((li, idx) => idx === i ? { ...li, [field]: val } : li))
  }

  function pickProduct(i: number, name: string) {
    const match = products.find(p => p.name.toLowerCase() === name.toLowerCase())
    setLineItems(items => items.map((li, idx) =>
      idx === i ? { ...li, name, price: match?.price ?? li.price } : li
    ))
  }

  function addLine() { setLineItems(items => [...items, { name: '', qty: 1, price: 0 }]) }
  function removeLine(i: number) { setLineItems(items => items.filter((_, idx) => idx !== i)) }

  const create = useMutation({
    mutationFn: async (sendNow: boolean) => {
      const sb = getSupabase()
      const { data: po, error: poErr } = await sb.from('purchase_orders').insert({
        client_slug: brandSlug,
        account_id: accountId || null,
        deliver_to_name: accountName || null,
        po_number: poNumber,
        order_type: orderType,
        status: sendNow ? 'sent' : 'draft',
        total_amount: total,
        commission_amount: commissionAmount,
        notes: notes.trim() || null,
        distributor_email: orderType === 'distributor' ? distEmail.trim() || null : null,
        distributor_rep_id: distRepId || null,
        sent_at: sendNow ? new Date().toISOString() : null,
      }).select('id').single()
      if (poErr) throw poErr

      const validLines = lineItems.filter(li => li.name.trim())
      if (validLines.length > 0) {
        const { error: liErr } = await sb.from('po_line_items').insert(
          validLines.map(li => ({
            purchase_order_id: po.id,
            product_name: li.name.trim(),
            quantity: li.qty,
            unit_price: li.price,
            total: li.qty * li.price,
          }))
        )
        if (liErr) throw liErr
      }
    },
    onSuccess: (_, sendNow) => {
      qc.invalidateQueries({ queryKey: ['v3', 'orders'] })
      toast.show(sendNow ? 'Order sent' : 'Draft saved')
      setTimeout(onClose, 400)
    },
    onError: (e: any) => setError(e?.message ?? 'Failed to create order'),
  })

  const canSubmit = brandSlug && accountId && lineItems.some(li => li.name.trim()) && !create.isPending

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'absolute', inset: 0, background: v3.bg.overlay, backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 580,
        background: v3.bg.elevated, border: `1px solid ${v3.border.strong}`,
        borderRadius: v3.radius.xl, padding: '28px 28px 24px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        maxHeight: '94vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>New Order</div>
            {poNumber && (
              <div className="v3-mono" style={{ fontSize: '10px', color: v3.text.muted, marginTop: 3, letterSpacing: '0.08em' }}>{poNumber}</div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Brand selector */}
          <div>
            <label style={v3label}>Brand</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {clients.map(c => {
                const sel = brandSlug === c.slug
                const ac  = c.color || v3.amber
                return (
                  <button key={c.slug} onClick={() => setBrandSlug(c.slug)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                    borderRadius: v3.radius.full, fontSize: '13px', fontWeight: 700,
                    border: `1.5px solid ${sel ? ac + '70' : v3.border.default}`,
                    background: sel ? ac + '14' : 'transparent',
                    color: sel ? ac : v3.text.muted,
                    cursor: 'pointer', fontFamily: v3.font.ui,
                  }}>
                    {c.logo_url && <img src={c.logo_url} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />}
                    {c.name}
                    {sel && <Check size={11} strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Order type */}
          <div>
            <label style={v3label}>Order Type</label>
            <div style={{ display: 'flex', gap: 0, background: v3.bg.sheet, borderRadius: v3.radius.md, padding: 3 }}>
              {(['distributor', 'direct'] as const).map(t => (
                <button key={t} onClick={() => setOrderType(t)} style={{
                  flex: 1, padding: '9px 12px', border: 'none', borderRadius: v3.radius.sm,
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: v3.font.ui,
                  background: orderType === t ? v3.bg.elevated : 'transparent',
                  color: orderType === t ? v3.text.primary : v3.text.muted,
                  boxShadow: orderType === t ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                  transition: 'all 120ms',
                }}>
                  {t === 'distributor' ? 'Order Inquiry' : 'Direct Order'}
                </button>
              ))}
            </div>
          </div>

          {/* Account */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...v3label, marginBottom: 0 }}>Account *</label>
              {!accountId && (
                <button onClick={() => setShowAddAccount(true)} style={{ background: 'none', border: 'none', color: v3.amberLight, fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Plus size={11} /> New Account
                </button>
              )}
            </div>
            <AccountSearch value={accountId} name={accountName} onChange={(id, name) => { setAccountId(id); setAccountName(name) }} />
            {!accountId && <div style={{ fontSize: '10px', color: v3.text.muted, marginTop: 4 }}>Search by name, or create a new account above.</div>}
          </div>

          {/* Distributor-specific */}
          {orderType === 'distributor' && (
            <div style={{ display: 'flex', gap: 10 }}>
              {distReps.length > 0 && (
                <div style={{ flex: 1 }}>
                  <label style={v3label}>Rep <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
                  <select value={distRepId} onChange={e => {
                    setDistRepId(e.target.value)
                    const rep = distReps.find(r => r.id === e.target.value)
                    if (rep?.email) setDistEmail(rep.email)
                  }} style={{ ...v3input, background: v3.bg.sheet, appearance: 'none' as any }}>
                    <option value="">— Select rep —</option>
                    {distReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ flex: 1 }}>
                <label style={v3label}>Email <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
                <input value={distEmail} onChange={e => setDistEmail(e.target.value)}
                  placeholder="rep@distributor.com" type="email"
                  style={{ ...v3input, background: v3.bg.sheet }} />
              </div>
            </div>
          )}

          {/* Products (datalists are hidden, placed here for DOM locality) */}
          {products.length > 0 && lineItems.map((_, i) => (
            <datalist key={i} id={`order-prod-${i}`}>
              {products.map(p => <option key={p.id} value={p.name} />)}
            </datalist>
          ))}

          <div>
            <label style={v3label}>Products</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 84px 28px', gap: 6 }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '0 12px' }}>Product</div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center' }}>Qty</div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center' }}>Unit $</div>
                <div />
              </div>
              {lineItems.map((li, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 84px 28px', gap: 6, alignItems: 'center' }}>
                  <input
                    list={products.length > 0 ? `order-prod-${i}` : undefined}
                    value={li.name}
                    onChange={e => pickProduct(i, e.target.value)}
                    placeholder="Product name"
                    style={{ ...v3input, background: v3.bg.sheet, padding: '8px 12px', fontSize: '14px' }}
                  />
                  <input type="number" min={1} value={li.qty} onChange={e => updateLine(i, 'qty', Number(e.target.value) || 1)}
                    style={{ ...v3input, background: v3.bg.sheet, padding: '8px', textAlign: 'center', fontSize: '14px' }} />
                  <input type="number" min={0} step={0.01} value={li.price || ''} onChange={e => updateLine(i, 'price', Number(e.target.value) || 0)}
                    placeholder="0.00"
                    style={{ ...v3input, background: v3.bg.sheet, padding: '8px', textAlign: 'right', fontSize: '14px' }} />
                  <button onClick={() => removeLine(i)} disabled={lineItems.length === 1}
                    style={{ background: 'none', border: 'none', color: lineItems.length === 1 ? v3.border.subtle : v3.text.muted, cursor: lineItems.length === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button onClick={addLine} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'transparent', border: `1px dashed ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.muted, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: v3.font.ui }}>
                <Plus size={12} /> Add line
              </button>
              {!brandSlug && (
                <div style={{ fontSize: '10px', color: v3.text.muted, paddingLeft: 2, marginTop: 2 }}>
                  Select a brand above to load product suggestions
                </div>
              )}
              {brandSlug && productsLoading && (
                <div style={{ fontSize: '10px', color: v3.amber, paddingLeft: 2, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="spin" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${v3.amber}`, borderTopColor: 'transparent' }} />
                  Loading products…
                </div>
              )}
              {brandSlug && !productsLoading && products.length === 0 && (
                <div style={{ fontSize: '10px', color: v3.text.muted, paddingLeft: 2, marginTop: 2 }}>
                  No products on file for this brand — type manually
                </div>
              )}
            </div>

            {/* Total + commission preview */}
            {total > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${v3.border.subtle}` }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 2 }}>Total</div>
                  <div className="v3-mono" style={{ fontSize: '20px', fontWeight: 900, color: v3.amberLight }}>{formatCurrency(total)}</div>
                </div>
                {commissionRate > 0 && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 2 }}>Commission ({Math.round(commissionRate * 100)}%)</div>
                    <div className="v3-mono" style={{ fontSize: '20px', fontWeight: 900, color: v3.status.success }}>{formatCurrency(commissionAmount)}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label style={v3label}>Notes <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Special instructions, context…"
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none', fontFamily: v3.font.ui, lineHeight: 1.5 } as any} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '9px 12px', background: v3.status.dangerDim, border: `1px solid ${v3.status.danger}33`, borderRadius: v3.radius.md, fontSize: '13px', color: v3.status.danger }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          <button onClick={onClose} style={{ ...v3btnSecondary, flex: 1 }}>Cancel</button>
          <button onClick={() => create.mutate(false)} disabled={!canSubmit}
            style={{ ...v3btnSecondary, flex: 1, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
            {create.isPending ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={() => create.mutate(true)} disabled={!canSubmit}
            style={{
              ...v3btnPrimary, flex: 2,
              opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: create.isSuccess ? v3.status.success : v3.amber,
            }}>
            {create.isSuccess
              ? <><Check size={14} strokeWidth={3} /> Done</>
              : create.isPending ? 'Sending…'
              : orderType === 'direct' ? 'Create Order' : 'Send Inquiry'}
          </button>
        </div>
      </div>
      {showAddAccount && (
        <AddNewAccountModal
          onCreated={(id, name) => { setAccountId(id); setAccountName(name) }}
          onClose={() => setShowAddAccount(false)}
        />
      )}
    </div>
  )
}

// ── Edit Order Modal ──────────────────────────────────────────────────────────
function EditOrderModal({ order, clients, onClose }: { order: any; clients: Client[]; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useV3Toast()
  const cl = clients.find(c => c.slug === order.client_slug)
  const ac = cl?.color || v3.amber
  const [status, setStatus]       = useState<string>(order.status)
  const [notes, setNotes]         = useState(order.notes ?? '')
  const [distEmail, setDistEmail] = useState(order.distributor_email ?? '')
  const [deliverTo, setDeliverTo] = useState(order.deliver_to_name ?? '')
  const [error, setError]         = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const updates: Record<string, any> = {
        status,
        notes:          notes.trim()    || null,
        deliver_to_name: deliverTo.trim() || null,
        distributor_email: order.order_type === 'distributor' ? distEmail.trim() || null : order.distributor_email,
      }
      if (status === 'sent' && !order.sent_at) updates.sent_at = new Date().toISOString()
      const { error } = await sb.from('purchase_orders').update(updates).eq('id', order.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'orders'] })
      toast.show('Order updated')
      setTimeout(onClose, 300)
    },
    onError: (e: any) => setError(e?.message ?? 'Save failed'),
  })

  const del = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { error } = await sb.from('purchase_orders').delete().eq('id', order.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'orders'] })
      toast.show('Order deleted')
      onClose()
    },
    onError: (e: any) => setError(e?.message ?? 'Delete failed'),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'absolute', inset: 0, background: v3.bg.overlay, backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 460, background: v3.bg.elevated, border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.xl, padding: '24px', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Edit Order</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
              {order.po_number && <span className="v3-mono" style={{ fontSize: '10px', color: v3.text.muted }}>{order.po_number}</span>}
              {cl && <span style={{ fontSize: '12px', color: ac, fontWeight: 600 }}>{cl.name}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={v3label}>Status</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['draft', 'sent', 'fulfilled', 'cancelled'] as const).map(s => {
                const sc = ORDER_COLORS[s]; const sel = status === s
                return (
                  <button key={s} onClick={() => setStatus(s)} style={{ padding: '7px 13px', borderRadius: v3.radius.full, fontSize: '12px', fontWeight: 700, border: `1.5px solid ${sel ? sc + '70' : v3.border.default}`, background: sel ? sc + '14' : 'transparent', color: sel ? sc : v3.text.muted, cursor: 'pointer', fontFamily: v3.font.ui }}>
                    {ORDER_LABELS[s]}
                  </button>
                )
              })}
            </div>
            {status === 'sent' && !order.sent_at && (
              <div style={{ fontSize: '10px', color: v3.status.warning, marginTop: 5 }}>Sent date will be set to now</div>
            )}
          </div>



          {order.order_type === 'distributor' && (
            <div>
              <label style={v3label}>Distributor Email</label>
              <input value={distEmail} onChange={e => setDistEmail(e.target.value)} type="email" placeholder="rep@distributor.com" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
          )}

          <div>
            <label style={v3label}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Context, special instructions…"
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none', fontFamily: v3.font.ui, lineHeight: 1.5 } as any} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: '9px 12px', background: v3.status.dangerDim, border: `1px solid ${v3.status.danger}33`, borderRadius: v3.radius.md, fontSize: '13px', color: v3.status.danger }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {!confirmDel
            ? <button onClick={() => setConfirmDel(true)}
                style={{ padding: '9px 12px', background: 'transparent', border: `1px solid ${v3.border.subtle}`, borderRadius: v3.radius.md, color: v3.text.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = v3.status.danger + '50'; e.currentTarget.style.color = v3.status.danger }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = v3.border.subtle; e.currentTarget.style.color = v3.text.muted }}>
                <Trash2 size={14} />
              </button>
            : <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => del.mutate()} disabled={del.isPending} style={{ padding: '9px 12px', background: v3.status.dangerDim, border: `1px solid ${v3.status.danger}40`, borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 700, color: v3.status.danger, cursor: 'pointer' }}>
                  {del.isPending ? '…' : 'Delete'}
                </button>
                <button onClick={() => setConfirmDel(false)} style={{ padding: '9px 10px', background: 'transparent', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, fontSize: '12px', color: v3.text.muted, cursor: 'pointer' }}>Cancel</button>
              </div>
          }
          <button onClick={onClose} style={{ ...v3btnSecondary, flex: 1 }}>Close</button>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            style={{ ...v3btnPrimary, flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: save.isSuccess ? v3.status.success : v3.amber }}>
            {save.isSuccess ? <><Check size={14} strokeWidth={3} />Saved</> : save.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Order Detail Modal ────────────────────────────────────────────────────────
function OrderDetailModal({ order, clients, onEdit, onClose }: { order: any; clients: Client[]; onEdit: (o: any) => void; onClose: () => void }) {
  const cl = clients.find(c => c.slug === order.client_slug)
  const ac = cl?.color || v3.amber

  const { data: lineItems = [], isLoading: liLoading } = useQuery({
    queryKey: ['v3', 'order-items', order.id],
    queryFn: async () => {
      const sb = getSupabase()
      const { data } = await sb.from('po_line_items').select('*').eq('purchase_order_id', order.id).order('id')
      return data ?? []
    },
  })

  const total      = lineItems.length > 0
    ? lineItems.reduce((s: number, li: any) => s + (Number(li.total) || 0), 0)
    : Number(order.total_amount) || 0
  const commission = Number(order.commission_amount) || 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'absolute', inset: 0, background: v3.bg.overlay, backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 520, background: v3.bg.elevated, border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.xl, padding: '24px', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              {order.po_number && <span className="v3-mono" style={{ fontSize: '14px', fontWeight: 800, color: v3.text.primary }}>{order.po_number}</span>}
              <StatusPill status={order.status} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {cl && <span style={{ fontSize: '13px', color: ac, fontWeight: 700 }}>{cl.name}</span>}
              <span style={{ fontSize: '12px', color: v3.text.muted }}>·</span>
              <span style={{ fontSize: '12px', color: v3.text.muted, textTransform: 'capitalize' }}>{order.order_type === 'distributor' ? 'Order Inquiry' : 'Direct Order'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { onClose(); setTimeout(() => onEdit(order), 50) }} style={{ padding: '7px 12px', background: 'transparent', border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 700, color: v3.text.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Pencil size={12} /> Edit
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
          </div>
        </div>

        {/* Meta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Account', value: order.accounts?.name || order.deliver_to_name || '—' },
            { label: 'Created', value: order.created_at ? new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
            ...(order.sent_at ? [{ label: 'Sent', value: new Date(order.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }] : []),
            ...(order.order_type === 'distributor' && order.distributor_email ? [{ label: 'To', value: order.distributor_email }] : []),
          ].map(f => (
            <div key={f.label} style={{ padding: '10px 12px', background: v3.bg.sheet, borderRadius: v3.radius.md }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: '13px', color: v3.text.primary, fontWeight: 600, wordBreak: 'break-all' }}>{f.value}</div>
            </div>
          ))}
        </div>

        {/* Line items */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>Products</div>
          {liLoading
            ? <div style={{ fontSize: '13px', color: v3.text.muted }}>Loading…</div>
            : lineItems.length === 0
            ? (
              <div style={{ padding: '12px 14px', background: v3.bg.sheet, borderRadius: v3.radius.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: v3.text.muted }}>No itemized products on file</span>
                {Number(order.total_amount) > 0 && (
                  <span className="v3-mono" style={{ fontSize: '14px', fontWeight: 700, color: v3.amberLight }}>{formatCurrency(Number(order.total_amount))}</span>
                )}
              </div>
            )
            : (
              <div style={{ border: `1px solid ${v3.border.subtle}`, borderRadius: v3.radius.md, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 80px 80px', padding: '7px 12px', background: v3.bg.sheet, borderBottom: `1px solid ${v3.border.subtle}` }}>
                  {['Product', 'Qty', 'Unit $', 'Total'].map(h => (
                    <div key={h} style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: h !== 'Product' ? 'right' : 'left' }}>{h}</div>
                  ))}
                </div>
                {(lineItems as any[]).map((li, i) => (
                  <div key={li.id} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 80px 80px', padding: '9px 12px', borderBottom: i < lineItems.length - 1 ? `1px solid ${v3.border.subtle}` : 'none', alignItems: 'center' }}>
                    <div style={{ fontSize: '14px', color: v3.text.primary, fontWeight: 600 }}>{li.product_name}</div>
                    <div style={{ fontSize: '13px', color: v3.text.secondary, textAlign: 'right' }}>{li.quantity}</div>
                    <div className="v3-mono" style={{ fontSize: '13px', color: v3.text.secondary, textAlign: 'right' }}>{li.unit_price ? formatCurrency(Number(li.unit_price)) : '—'}</div>
                    <div className="v3-mono" style={{ fontSize: '14px', color: v3.amberLight, fontWeight: 700, textAlign: 'right' }}>{li.total ? formatCurrency(Number(li.total)) : '—'}</div>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* Totals */}
        {total > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, paddingTop: 14, borderTop: `1px solid ${v3.border.subtle}` }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 3 }}>Order Total</div>
              <div className="v3-mono" style={{ fontSize: '22px', fontWeight: 900, color: v3.amberLight }}>{formatCurrency(total)}</div>
            </div>
            {commission > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 3 }}>Commission</div>
                <div className="v3-mono" style={{ fontSize: '22px', fontWeight: 900, color: v3.status.success }}>{formatCurrency(commission)}</div>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div style={{ marginTop: 16, padding: '10px 14px', background: v3.bg.sheet, borderRadius: v3.radius.md, borderLeft: `2px solid ${v3.border.default}` }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: '13px', color: v3.text.secondary, lineHeight: 1.5 }}>{order.notes}</div>
          </div>
        )}

        {/* Email preview — distributor inquiries only */}
        {order.order_type === 'distributor' && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${v3.border.subtle}`, paddingTop: 16 }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>Email Preview</div>
            <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${v3.border.subtle}`, borderRadius: v3.radius.md, fontFamily: v3.font.ui }}>
              {order.distributor_email && (
                <div style={{ fontSize: '12px', color: v3.text.muted, marginBottom: 6 }}>
                  <span style={{ color: v3.text.secondary, fontWeight: 600 }}>To:</span> {order.distributor_email}
                </div>
              )}
              <div style={{ fontSize: '12px', color: v3.text.muted, marginBottom: 12 }}>
                <span style={{ color: v3.text.secondary, fontWeight: 600 }}>Subject:</span>{' '}
                Order Inquiry — {cl?.name ?? 'Brand'} — {order.accounts?.name ?? order.deliver_to_name ?? 'Account'}
              </div>
              <div style={{ fontSize: '13px', color: v3.text.secondary, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {`Hi,\n\nI'm following up on an order inquiry for ${order.accounts?.name ?? 'our account'}${cl ? ` — ${cl.name}` : ''}.\n\n`}
                {lineItems.length > 0
                  ? `Products requested:\n${(lineItems as any[]).map(li => `  • ${li.product_name}${li.quantity > 1 ? ` × ${li.quantity}` : ''}`).join('\n')}\n\n`
                  : total > 0 ? `Order amount: ${formatCurrency(total)}\n\n` : ''
                }
                {order.notes ? `Notes: ${order.notes}\n\n` : ''}
                {`Please let me know estimated lead time and any questions.\n\nThank you,\nBarley Bros`}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Order Row ─────────────────────────────────────────────────────────────────
function OrderRow({ o, clients, onEdit, onDetail }: { o: any; clients: Client[]; onEdit: (o: any) => void; onDetail: (o: any) => void }) {
  const cl         = clients.find(c => c.slug === o.client_slug)
  const ac         = cl?.color || v3.amber
  const total      = resolveTotal(o)
  const commission = Number(o.commission_amount) || 0
  const isDirect   = o.order_type === 'direct'
  const label      = o.deliver_to_name || o.accounts?.name || '—'

  return (
    <div onClick={() => onDetail(o)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 4px', borderBottom: `1px solid ${v3.border.subtle}`, transition: 'background 80ms', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = v3.bg.elevated}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: ORDER_COLORS[o.status] ?? v3.text.muted, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: v3.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          {o.po_number && (
            <span className="v3-mono" style={{ fontSize: '10px', color: v3.text.muted, flexShrink: 0 }}>{o.po_number}</span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: v3.text.muted }}>
          {relativeTimeStr(o.sent_at || o.created_at)}
          {' · '}
          <span style={{ color: isDirect ? v3.amberLight + 'aa' : v3.text.muted }}>
            {isDirect ? 'Direct' : 'Distributor'}
          </span>
        </div>
      </div>

      {cl && (
        cl.logo_url
          ? <img src={cl.logo_url} alt="" style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: 2, opacity: 0.6, flexShrink: 0 }} />
          : <div style={{ fontSize: '9px', fontWeight: 800, color: ac, flexShrink: 0 }}>{cl.name[0]}</div>
      )}

      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 64 }}>
        {total > 0
          ? <>
              <div className="v3-mono" style={{ fontSize: '14px', fontWeight: 700, color: v3.amberLight }}>{formatCurrency(total)}</div>
              {commission > 0 && <div style={{ fontSize: '10px', color: v3.status.success }}>{formatCurrency(commission)}</div>}
            </>
          : <div style={{ fontSize: '12px', color: v3.text.muted }}>—</div>
        }
      </div>

      <button onClick={e => { e.stopPropagation(); onEdit(o) }} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.5 }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
        <Pencil size={13} />
      </button>
      <StatusPill status={o.status} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const { data: orders = [], isLoading, isError } = useV3Orders()
  const { data: clients = [] }           = useV3Clients()

  const [statusFilter, setStatusFilter] = useState('all')
  const [brandFilter, setBrandFilter]   = useState('all')
  const [showCreate, setShowCreate]     = useState(false)
  const [editOrder, setEditOrder]       = useState<any | null>(null)
  const [detailOrder, setDetailOrder]   = useState<any | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, draft: 0, sent: 0, fulfilled: 0, cancelled: 0 }
    for (const o of orders as any[]) {
      c.all++
      if (o.status) c[o.status] = (c[o.status] || 0) + 1
    }
    return c
  }, [orders])

  const filteredOrders = useMemo(() => {
    return (orders as any[]).filter(o => {
      if (statusFilter === 'sent' && !['sent', 'fulfilled'].includes(o.status)) return false
      if (statusFilter !== 'all' && statusFilter !== 'sent' && o.status !== statusFilter) return false
      if (brandFilter !== 'all' && o.client_slug !== brandFilter) return false
      return true
    })
  }, [orders, statusFilter, brandFilter])

  const stats = useMemo(() => {
    const sent = (orders as any[]).filter(o => ['sent', 'fulfilled'].includes(o.status))
    const revenue    = sent.reduce((s, o) => s + resolveTotal(o), 0)
    const commission = sent.reduce((s, o) => s + (Number(o.commission_amount) || 0), 0)
    return { draft: counts.draft, sent: counts.sent + counts.fulfilled, revenue, commission }
  }, [orders, counts])

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: 0 }}>Orders</h1>
          <div style={{ fontSize: '14px', color: v3.text.muted, marginTop: 4 }}>Direct orders and distributor inquiries</div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
          background: v3.amber, border: 'none', borderRadius: v3.radius.md,
          fontSize: '14px', fontWeight: 700, color: v3.text.inverse, cursor: 'pointer',
          boxShadow: `0 0 14px ${v3.amber}30`,
        }}>
          <Plus size={14} /> New Order
        </button>
      </div>

      {/* Stat row */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32, paddingBottom: 20, borderBottom: `1px solid ${v3.border.subtle}` }}>
        {[
          { label: 'Draft',      value: stats.draft,      color: v3.text.muted,    sub: 'unsent' },
          { label: 'Sent',       value: stats.sent,       color: v3.status.success, sub: 'orders placed' },
          { label: 'Revenue',    value: stats.revenue    > 0 ? formatCurrency(stats.revenue)    : '—', color: v3.amberLight,     sub: 'sent + fulfilled' },
          { label: 'Commission', value: stats.commission > 0 ? formatCurrency(stats.commission) : '—', color: v3.status.success, sub: 'earned' },
        ].map((s, i, arr) => (
          <div key={s.label} style={{ flex: 1, paddingRight: i < arr.length - 1 ? 24 : 0, borderRight: i < arr.length - 1 ? `1px solid ${v3.border.subtle}` : 'none', marginRight: i < arr.length - 1 ? 24 : 0 }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 10, fontFamily: v3.font.ui }}>
              {s.label}
            </div>
            <div className="v3-mono" style={{ fontSize: '40px', fontWeight: 900, color: s.color, lineHeight: 1, letterSpacing: '-0.04em' }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.38)', marginTop: 6 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Status tabs + brand filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0, flex: 1, borderBottom: `1px solid ${v3.border.subtle}` }}>
          {[
            { id: 'all',   label: 'All',   count: counts.all   },
            { id: 'draft', label: 'Draft', count: counts.draft },
            { id: 'sent',  label: 'Sent',  count: counts.sent + counts.fulfilled },
          ].map(s => (
            <button key={s.id} onClick={() => setStatusFilter(s.id)} style={{
              padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 700,
              color: statusFilter === s.id ? v3.amberLight : v3.text.muted,
              borderBottom: `2px solid ${statusFilter === s.id ? v3.amber : 'transparent'}`,
              whiteSpace: 'nowrap', transition: 'color 120ms', fontFamily: v3.font.ui,
            }}>
              {s.label} <span style={{ opacity: 0.55 }}>{s.count}</span>
            </button>
          ))}
        </div>
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
          style={{ background: 'transparent', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.secondary, fontSize: '13px', padding: '6px 10px', cursor: 'pointer', outline: 'none', fontFamily: v3.font.ui }}>
          <option value="all">All Brands</option>
          {clients.map((c: Client) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      {/* Order list */}
      <div>
        {isLoading
          ? <div style={{ padding: 40, textAlign: 'center', color: v3.text.muted, fontSize: '14px' }}>Loading…</div>
          : isError
          ? <div style={{ padding: 40, textAlign: 'center', color: v3.status.danger, fontSize: '14px' }}>Failed to load orders. Refresh to try again.</div>
          : filteredOrders.length === 0
          ? <div style={{ padding: 40, textAlign: 'center', color: v3.text.muted, fontSize: '14px' }}>
              No orders yet.{' '}
              <button onClick={() => setShowCreate(true)} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '14px', padding: 0, fontWeight: 600, fontFamily: v3.font.ui }}>
                Create one →
              </button>
            </div>
          : filteredOrders.map((o: any) => <OrderRow key={o.id} o={o} clients={clients} onEdit={setEditOrder} onDetail={setDetailOrder} />)
        }
      </div>

      {showCreate && <CreateOrderModal clients={clients} onClose={() => setShowCreate(false)} />}
      {detailOrder && <OrderDetailModal order={detailOrder} clients={clients} onEdit={o => { setDetailOrder(null); setEditOrder(o) }} onClose={() => setDetailOrder(null)} />}
      {editOrder && <EditOrderModal order={editOrder} clients={clients} onClose={() => setEditOrder(null)} />}
    </div>
  )
}
