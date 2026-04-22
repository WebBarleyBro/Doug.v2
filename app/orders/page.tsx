'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, ShoppingCart, Send, X, Trash2, ChevronRight, Package,
  MapPin, Calendar, Hash, Search, UserPlus, Truck, FileText,
  CheckCircle, Clock, MessageSquare,
} from 'lucide-react'
import LayoutShell from '../layout-shell'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ConfirmModal from '../components/ConfirmModal'
import {
  getOrders, getClients, getAccounts, createOrder, updateOrder, deleteOrder,
  getDistributorReps, createDistributorRep, getNextOrderNumber, getProducts,
  getClientSettings,
} from '../lib/data'
import { invalidatePrefix } from '../lib/cache'
import AddAccountModal from '../components/AddAccountModal'
import type { Product } from '../lib/types'
import { t, card, badge, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle } from '../lib/theme'
import { formatCurrency, formatShortDateMT, startOfMonthMT, resolveTotal } from '../lib/formatters'
import { clientLogoUrl } from '../lib/constants'
import type { Client, Contact } from '../lib/types'

// ─── Account Search Dropdown ──────────────────────────────────────────────

function AccountSearch({
  accounts,
  value,
  onChange,
  onAddAccount,
  placeholder = 'Search accounts...',
}: {
  accounts: any[]
  value: string
  onChange: (id: string, name: string, address: string) => void
  onAddAccount?: () => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selectedAccount = accounts.find(a => a.id === value)
  const filtered = query.length > 0
    ? accounts.filter(a => a.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : accounts.slice(0, 8)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{
        ...inputStyle,
        display: 'flex', alignItems: 'center', gap: '8px',
        cursor: 'pointer', padding: '0 10px',
      }} onClick={() => setOpen(o => !o)}>
        <Search size={13} color={t.text.muted} style={{ flexShrink: 0 }} />
        {open ? (
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: t.text.primary, fontSize: '13px', padding: '10px 0' }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: '13px', color: selectedAccount ? t.text.primary : t.text.muted, padding: '10px 0' }}>
            {selectedAccount ? selectedAccount.name : placeholder}
          </span>
        )}
        {value && (
          <button
            onClick={e => { e.stopPropagation(); onChange('', '', ''); setQuery('') }}
            style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: 0, display: 'flex' }}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`,
          borderRadius: '8px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: '13px', color: t.text.muted }}>No accounts found</div>
          )}
          {filtered.map(a => (
            <div
              key={a.id}
              onClick={() => { onChange(a.id, a.name, a.address || ''); setQuery(''); setOpen(false) }}
              style={{
                padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: t.text.primary,
                borderBottom: `1px solid ${t.border.subtle}`,
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = t.bg.cardHover)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
            >
              <div style={{ fontWeight: '500' }}>{a.name}</div>
              {a.address && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '1px' }}>{a.address}</div>}
            </div>
          ))}
          {onAddAccount && (
            <div
              onClick={() => { setOpen(false); onAddAccount() }}
              style={{
                padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
                color: t.gold, display: 'flex', alignItems: 'center', gap: '6px',
                borderTop: filtered.length > 0 ? `1px solid ${t.border.default}` : 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = t.bg.cardHover)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
            >
              <Plus size={13} /> Add New Account
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Add Distributor Rep Modal ────────────────────────────────────────────

function AddDistributorModal({
  clientSlug,
  onClose,
  onAdded,
}: {
  clientSlug: string
  onClose: () => void
  onAdded: (rep: Contact) => void
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!form.name || !form.email) { setErr('Name and email are required'); return }
    setSaving(true)
    try {
      const rep = await createDistributorRep({ ...form, client_slug: clientSlug })
      onAdded(rep)
      onClose()
    } catch (e: any) {
      setErr(e.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
      <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary }}>Add Distributor Rep</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Rep name" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="rep@distributor.com" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone (optional)</label>
            <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(720) 555-0000" style={inputStyle} />
          </div>
          {err && <div style={{ fontSize: '12px', color: t.status.danger }}>{err}</div>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button onClick={onClose} style={btnSecondary}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              <UserPlus size={14} /> {saving ? 'Saving...' : 'Add Rep'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Follow-up Kanban ─────────────────────────────────────────────────────

const followUpColumns: { key: string; label: string; icon: any; color: string }[] = [
  { key: 'not_started', label: 'Not Contacted', icon: Clock, color: t.text.muted },
  { key: 'contacted',   label: 'Contacted',     icon: MessageSquare, color: t.status.info },
  { key: 'waiting',     label: 'Waiting',        icon: Clock, color: t.gold },
  { key: 'closed',      label: 'Closed',         icon: CheckCircle, color: t.status.success },
]

function FollowUpKanban({ orders, clients, onUpdate }: { orders: any[]; clients: Client[]; onUpdate: () => void }) {
  const distributorOrders = orders.filter(o => o.order_type === 'distributor' || o.po_number?.startsWith('OI-'))

  if (distributorOrders.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: t.text.muted, fontSize: '13px' }}>
        No order inquiries yet. Create an inquiry to track follow-ups.
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', padding: '4px 0', overflowX: 'auto', minWidth: 0 }}>
      {followUpColumns.map(col => {
        const Icon = col.icon
        const colOrders = distributorOrders.filter(o => (o.follow_up_status || 'not_started') === col.key)
        return (
          <div key={col.key} style={{ backgroundColor: t.bg.card, borderRadius: '10px', border: `1px solid ${t.border.default}`, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon size={12} color={col.color} />
              <span style={{ fontSize: '11px', fontWeight: '700', color: col.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{col.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: t.text.muted, fontWeight: '600' }}>{colOrders.length}</span>
            </div>
            <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', minHeight: '80px' }}>
              {colOrders.map(o => {
                const client = clients.find(c => c.slug === o.client_slug)
                return (
                  <div key={o.id} style={{ backgroundColor: t.bg.elevated, borderRadius: '6px', padding: '8px 10px', border: `1px solid ${t.border.subtle}` }}>
                    <div className="mono" style={{ fontSize: '11px', color: t.gold, marginBottom: '3px' }}>{o.po_number}</div>
                    <div style={{ fontSize: '12px', color: t.text.primary, fontWeight: '500' }}>{o.deliver_to_name}</div>
                    {client && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{client.name}</div>}
                    <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {followUpColumns.filter(c => c.key !== col.key).map(next => (
                        <button
                          key={next.key}
                          onClick={() => updateOrder(o.id, { follow_up_status: next.key as any }).then(onUpdate)}
                          style={{
                            fontSize: '10px', padding: '3px 6px', borderRadius: '4px', cursor: 'pointer',
                            background: 'none', border: `1px solid ${t.border.default}`, color: t.text.muted,
                          }}
                        >
                          → {next.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [activeTab, setActiveTab] = useState<'direct' | 'inquiries' | 'followups'>('direct')
  const [showCreate, setShowCreate] = useState(false)
  const [orderType, setOrderType] = useState<'direct' | 'distributor'>('direct')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState('')
  const [deleteTarget, setDeleteTarget] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [resendTo, setResendTo] = useState('')
  const [resendState, setResendState] = useState<'idle' | 'open' | 'sending' | 'sent'>('idle')
  const [showEmailPreview, setShowEmailPreview] = useState(false)
  const [previewEmail, setPreviewEmail] = useState('')
  const [sendEmailError, setSendEmailError] = useState('')

  // Lock body scroll when any modal is open — fixes iOS Safari touch offset bug
  useEffect(() => {
    const anyOpen = showCreate || showEmailPreview || !!selectedOrder
    document.body.style.overflow = anyOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [showCreate, showEmailPreview, selectedOrder])

  const [distributorReps, setDistributorReps] = useState<Contact[]>([])
  const [showAddDistributor, setShowAddDistributor] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [nextPONum, setNextPONum] = useState('PO-000039')
  const [nextOINum, setNextOINum] = useState('OI-000001')
  const [clientProducts, setClientProducts] = useState<Product[]>([])
  const [clientSettings, setClientSettings] = useState<Record<string, any>>({})

  const [form, setForm] = useState({
    client_slug: '',
    account_id: '',
    deliver_to_name: '',
    deliver_to_address: '',
    deliver_to_phone: '',
    po_number: 'PO-000039',
    notes: '',
    distributor_rep_id: '',
    distributor_email: '',
    distributor_rep_name: '',
    line_items: [{ product_name: '', quantity: 1, price: 0 }],
  })

  const load = useCallback(async () => {
    const [ords, cls, accs, nextPO, nextOI, settings] = await Promise.all([
      getOrders(), getClients(), getAccounts({ limit: 500 }),
      getNextOrderNumber('PO'), getNextOrderNumber('OI'),
      getClientSettings(),
    ])
    setOrders(ords)
    setClients(cls)
    setAccounts(accs)
    setClientSettings(settings)
    setForm(f => ({ ...f, po_number: nextPO }))
    setNextPONum(nextPO)
    setNextOINum(nextOI)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Load distributor reps + products when client changes
  useEffect(() => {
    if (form.client_slug) {
      getDistributorReps(form.client_slug).then(setDistributorReps).catch(() => {})
      getProducts(form.client_slug).then(prods => setClientProducts(prods.filter(p => p.active !== false))).catch(() => {})
    } else {
      setDistributorReps([])
      setClientProducts([])
    }
  }, [form.client_slug])

  // Reset PO number when order type changes
  useEffect(() => {
    setForm(f => ({
      ...f,
      po_number: orderType === 'direct' ? nextPONum : nextOINum,
      distributor_rep_id: '',
      distributor_email: '',
      distributor_rep_name: '',
    }))
  }, [orderType, nextPONum, nextOINum])

  // Keep selected order in sync
  useEffect(() => {
    if (selectedOrder) {
      const updated = orders.find(o => o.id === selectedOrder.id)
      if (updated) setSelectedOrder(updated)
    }
  }, [orders])

  const monthStart = startOfMonthMT()
  const directOrders = orders.filter(o => !o.order_type || o.order_type === 'direct' || o.po_number?.startsWith('PO-'))
  const inquiryOrders = orders.filter(o => o.order_type === 'distributor' || o.po_number?.startsWith('OI-'))
  const monthDirectSent = directOrders.filter(o => o.status === 'sent' && o.created_at >= monthStart)
  const monthRevenue = monthDirectSent.reduce((s, o) => s + resolveTotal(o), 0)
  const monthCommission = orders
    .filter(o => ['sent', 'fulfilled'].includes(o.status) && o.created_at >= monthStart)
    .reduce((s, o) => s + Number(o.commission_amount || 0), 0)

  function addLineItem() {
    setForm(f => ({ ...f, line_items: [...f.line_items, { product_name: '', quantity: 1, price: 0 }] }))
  }
  function removeLineItem(i: number) {
    setForm(f => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }))
  }
  function updateLineItem(i: number, field: string, value: any) {
    setForm(f => ({
      ...f,
      line_items: f.line_items.map((li, idx) => {
        if (idx !== i) return li
        const updated = { ...li, [field]: value }
        // Auto-fill price from products when product_name changes
        if (field === 'product_name') {
          const match = clientProducts.find(p => p.name.toLowerCase() === String(value).toLowerCase())
          if (match?.price) updated.price = match.price
        }
        return updated
      }),
    }))
  }

  const orderTotal = form.line_items.reduce((s, li) => {
    const prod = clientProducts.find(p => p.name === li.product_name)
    const cases = (li as any).cases || 0
    const bottles = (li as any).bottles || 0
    const casePrice = prod?.price ?? li.price ?? 0
    const bottlePrice = prod?.bottle_price != null
      ? prod.bottle_price
      : (prod?.price && (prod as any).case_count ? prod.price / (prod as any).case_count : 0)
    return s + cases * casePrice + bottles * bottlePrice
  }, 0)
  const selectedClient = clients.find(c => c.slug === form.client_slug)
  const orderCommission = orderTotal * (selectedClient?.commission_rate || 0)

  function resetForm() {
    setForm({
      client_slug: '', account_id: '', deliver_to_name: '', deliver_to_address: '',
      deliver_to_phone: '', po_number: orderType === 'direct' ? nextPONum : nextOINum, notes: '',
      distributor_rep_id: '', distributor_email: '', distributor_rep_name: '',
      line_items: [{ product_name: '', quantity: 1, price: 0 }],
    })
  }

  function buildEmailBody(): { subject: string; text: string; html: string; replyTo?: string } {
    const client = selectedClient
    const settings = clientSettings[form.client_slug] || {}
    const contactName = settings.primary_contact_name || client?.contact_name || client?.name
    const contactEmail = settings.primary_contact_email || client?.contact_email || ''
    const contactPhone = settings.primary_contact_phone || client?.contact_phone || ''
    const lineItems = form.line_items.filter(li => li.product_name)
    const isOI = orderType === 'distributor'

    const resolveLineTotal = (li: any) => {
      const prod = clientProducts.find((p: any) => p.name === li.product_name)
      const cases = li.cases || 0
      const bottles = li.bottles || 0
      const casePrice = prod?.price ?? li.price ?? 0
      const bottlePrice = prod?.bottle_price ?? 0
      return cases * casePrice + bottles * bottlePrice
    }
    const total = lineItems.reduce((s, li) => s + resolveLineTotal(li), 0)

    const itemLines = lineItems.map(li => {
      const prod = clientProducts.find((p: any) => p.name === li.product_name)
      const cases = (li as any).cases || 0
      const bottles = (li as any).bottles || 0
      const casePrice = prod?.price ?? li.price ?? 0
      const bottlePrice = prod?.bottle_price ?? 0
      const parts = [
        cases > 0 ? `${cases} case${cases !== 1 ? 's' : ''} @ $${casePrice.toFixed(2)}` : '',
        bottles > 0 ? `${bottles} btl @ $${bottlePrice.toFixed(2)}` : '',
      ].filter(Boolean).join(' + ')
      return `  • ${li.product_name}${parts ? ` — ${parts} = $${resolveLineTotal(li).toFixed(2)}` : ''}`
    }).join('\n')

    const subject = isOI
      ? `Order Inquiry ${form.po_number} – ${form.deliver_to_name}`
      : `PO ${form.po_number} – ${form.deliver_to_name}`

    const text = [
      isOI ? `Order Inquiry: ${form.po_number}` : `PO Number: ${form.po_number}`,
      `Client: ${client?.name || form.client_slug}`,
      `Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      `Deliver To: ${form.deliver_to_name}${form.deliver_to_address ? ' · ' + form.deliver_to_address : ''}`,
      '',
      'Line Items:',
      itemLines || '  (no items)',
      '',
      `Total: $${total.toFixed(2)}`,
      form.notes ? `\nNotes: ${form.notes}` : null,
      '',
      isOI ? 'Please process this order inquiry and confirm pricing and availability.' : 'Please process this order at your earliest convenience.',
      '',
      contactName ? `— ${contactName}` : '— Barley Bros',
      contactEmail || null,
      contactPhone || null,
    ].filter(l => l !== null).join('\n')

    const htmlRows = lineItems.map(li => {
      const prod = clientProducts.find((p: any) => p.name === li.product_name)
      const cases = (li as any).cases || 0
      const bottles = (li as any).bottles || 0
      const casePrice = prod?.price ?? li.price ?? 0
      const bottlePrice = prod?.bottle_price ?? 0
      const qtyLabel = [
        cases > 0 ? `${cases} case${cases !== 1 ? 's' : ''}` : '',
        bottles > 0 ? `${bottles} btl` : '',
      ].filter(Boolean).join(' + ') || String(li.quantity)
      const lineTotal = resolveLineTotal(li)
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #2a2a26">${li.product_name}</td><td style="padding:8px 12px;border-bottom:1px solid #2a2a26;text-align:center">${qtyLabel}</td><td style="padding:8px 12px;border-bottom:1px solid #2a2a26;text-align:right">$${casePrice.toFixed(2)}/cs${bottlePrice > 0 ? ` · $${bottlePrice.toFixed(2)}/btl` : ''}</td><td style="padding:8px 12px;border-bottom:1px solid #2a2a26;text-align:right;font-weight:600">$${lineTotal.toFixed(2)}</td></tr>`
    }).join('')

    const html = `
<div style="font-family:sans-serif;background:#0c0c0a;color:#eceae4;padding:32px;max-width:580px;margin:0 auto">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#5a5754;margin-bottom:6px">Barley Bros</div>
  <h2 style="font-size:20px;margin:0 0 4px;color:#d4a843">${form.po_number}</h2>
  <p style="font-size:13px;color:#9a9790;margin:0 0 24px">${client?.name || form.client_slug} &nbsp;·&nbsp; ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
  <div style="background:#161614;border-radius:8px;padding:16px 18px;margin-bottom:18px">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#5a5754;margin-bottom:6px">Deliver To</div>
    <div style="font-size:15px;font-weight:700;color:#eceae4">${form.deliver_to_name}</div>
    ${form.deliver_to_address ? `<div style="font-size:13px;color:#9a9790;margin-top:3px">${form.deliver_to_address}</div>` : ''}
  </div>
  <table style="width:100%;border-collapse:collapse;background:#161614;border-radius:8px;overflow:hidden;margin-bottom:18px">
    <thead><tr style="background:#202020">
      <th style="padding:8px 12px;text-align:left;font-size:11px;color:#5a5754;font-weight:700;text-transform:uppercase">Product</th>
      <th style="padding:8px 12px;text-align:center;font-size:11px;color:#5a5754;font-weight:700;text-transform:uppercase">Qty</th>
      <th style="padding:8px 12px;text-align:right;font-size:11px;color:#5a5754;font-weight:700;text-transform:uppercase">Price</th>
      <th style="padding:8px 12px;text-align:right;font-size:11px;color:#5a5754;font-weight:700;text-transform:uppercase">Total</th>
    </tr></thead>
    <tbody>${htmlRows}</tbody>
  </table>
  <div style="background:#161614;border-radius:8px;padding:14px 18px;margin-bottom:24px">
    <div style="display:flex;justify-content:space-between;border-top:1px solid #2a2a26;padding-top:8px">
      <span style="font-size:15px;font-weight:700;color:#d4a843">Total</span>
      <span style="font-size:18px;font-weight:800;color:#eceae4">$${total.toFixed(2)}</span>
    </div>
  </div>
  ${form.notes ? `<div style="background:#111110;border-radius:6px;padding:12px 14px;margin-bottom:18px;font-size:13px;color:#9a9790">${form.notes}</div>` : ''}
  <p style="font-size:12px;color:#5a5754;margin-top:24px">${isOI ? 'Please process this order inquiry and confirm pricing and availability.' : 'Please process this order at your earliest convenience.'}</p>
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #2a2a26">
    <div style="font-size:13px;font-weight:600;color:#eceae4">${contactName || 'Barley Bros'}</div>
    ${contactEmail ? `<div style="font-size:12px;color:#9a9790;margin-top:2px">${contactEmail.split(',')[0].trim()}</div>` : ''}
    ${contactPhone ? `<div style="font-size:12px;color:#9a9790;margin-top:1px">${contactPhone}</div>` : ''}
    <div style="font-size:11px;color:#5a5754;margin-top:4px">${client?.name || 'Barley Bros'}</div>
  </div>
</div>`

    const replyTo = contactEmail.split(',')[0].trim() || undefined
    return { subject, text, html, replyTo }
  }

  async function handleCreate() {
    if (!form.client_slug || !form.deliver_to_name || !form.line_items[0].product_name) return
    setCreating(true); setCreateErr('')
    try {
      const extra = orderType === 'distributor' ? {
        order_type: 'distributor' as const,
        distributor_email: form.distributor_email || undefined,
        distributor_rep_name: form.distributor_rep_name || undefined,
        deliver_to_phone: form.deliver_to_phone || undefined,
      } : { order_type: 'direct' as const }

      const newOrder = await createOrder({
        client_slug: form.client_slug,
        client_name: selectedClient?.name || form.client_slug,
        account_id: form.account_id || undefined,
        deliver_to_name: form.deliver_to_name,
        deliver_to_address: form.deliver_to_address,
        po_number: form.po_number,
        notes: form.notes,
        line_items: form.line_items.filter(li => li.product_name).map(li => {
          const prod = clientProducts.find(p => p.name === li.product_name)
          return {
            product_name: li.product_name,
            quantity: li.quantity,
            price: prod?.price ?? li.price ?? 0,
            cases: (li as any).cases || 0,
            bottles: (li as any).bottles || 0,
            bottle_price: prod?.bottle_price ?? 0,
          }
        }),
        commission_rate: selectedClient?.commission_rate || 0,
        ...extra,
      })
      await updateOrder(newOrder.id, { status: 'sent' })
      invalidatePrefix('dashboard-stats')
      setShowCreate(false)
      resetForm()
      load()
      setActiveTab(orderType === 'distributor' ? 'inquiries' : 'direct')
    } catch (e: any) { setCreateErr(e.message || 'Failed to create order') }
    finally { setCreating(false) }
  }

  const tabOrders = activeTab === 'direct' ? directOrders : inquiryOrders

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Orders</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>{directOrders.length} direct · {inquiryOrders.length} inquiries</p>
          </div>
          <button onClick={() => { setShowCreate(true); setOrderType(activeTab === 'inquiries' ? 'distributor' : 'direct') }} style={btnPrimary}>
            <Plus size={16} /> {activeTab === 'inquiries' ? 'New Inquiry' : 'New Order'}
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '12px', marginBottom: '28px' }}>
          <StatCard label="Direct Orders This Month" value={monthDirectSent.length} icon={<Send size={18} />} color={t.gold} />
          <StatCard label="Revenue This Month" value={formatCurrency(monthRevenue)} color={t.status.success} />
          <StatCard label="Commission Earned" value={formatCurrency(monthCommission)} color={t.status.info} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', backgroundColor: t.bg.card, borderRadius: '10px', padding: '4px', border: `1px solid ${t.border.default}`, width: isMobile ? '100%' : 'fit-content', overflowX: isMobile ? 'auto' : 'visible' }}>
          {([
            { key: 'direct', label: 'Direct Orders', icon: FileText, count: directOrders.length },
            { key: 'inquiries', label: 'Order Inquiries', icon: Truck, count: inquiryOrders.length },
            { key: 'followups', label: 'Follow-Ups', icon: CheckCircle, count: inquiryOrders.filter(o => (o.follow_up_status || 'not_started') !== 'closed').length },
          ] as const).map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: active ? '600' : '400',
                  backgroundColor: active ? t.bg.elevated : 'transparent',
                  color: active ? t.text.primary : t.text.muted,
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                  transition: 'all 120ms ease',
                }}
              >
                <Icon size={13} />
                {tab.label}
                <span style={{
                  fontSize: '11px', fontWeight: '700', padding: '1px 6px', borderRadius: '10px',
                  backgroundColor: active ? t.goldDim : t.bg.input,
                  color: active ? t.gold : t.text.muted,
                  minWidth: '18px', textAlign: 'center',
                }}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'followups' ? (
          <FollowUpKanban orders={orders} clients={clients} onUpdate={load} />
        ) : loading ? null : tabOrders.length === 0 ? (
          <EmptyState
            icon={activeTab === 'inquiries' ? <Truck size={36} /> : <ShoppingCart size={36} />}
            title={activeTab === 'inquiries' ? 'No order inquiries yet' : 'No orders yet'}
            action={
              <button onClick={() => { setShowCreate(true); setOrderType(activeTab === 'inquiries' ? 'distributor' : 'direct') }} style={btnPrimary}>
                <Plus size={14} /> {activeTab === 'inquiries' ? 'New Inquiry' : 'Create Order'}
              </button>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {tabOrders.map(o => {
              const client = clients.find(c => c.slug === o.client_slug)
              const total = resolveTotal(o)
              const isSelected = selectedOrder?.id === o.id
              const isInquiry = o.order_type === 'distributor' || o.po_number?.startsWith('OI-')
              return (
                <div
                  key={o.id}
                  onClick={() => { setSelectedOrder(isSelected ? null : o); setResendState('idle'); setResendTo('') }}
                  style={{
                    ...card,
                    padding: '16px 20px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    borderLeft: `3px solid ${client?.color || t.gold}`,
                    backgroundColor: isSelected ? t.bg.cardHover : t.bg.card,
                    transition: 'background-color 150ms ease',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <span className="mono" style={{ fontSize: '13px', fontWeight: '600', color: t.gold }}>{o.po_number}</span>
                      <span style={badge.orderStatus(o.status)}>{o.status}</span>
                      {isInquiry && o.follow_up_status && o.follow_up_status !== 'not_started' && (
                        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: t.bg.input, color: t.text.muted }}>
                          {followUpColumns.find(c => c.key === o.follow_up_status)?.label}
                        </span>
                      )}
                      {client && (() => {
                        const logo = clientLogoUrl(client)
                        return logo ? (
                          <img src={logo} alt={client.name} title={client.name}
                            style={{ width: '20px', height: '20px', objectFit: 'contain', borderRadius: '3px', opacity: 0.9 }} />
                        ) : (
                          <span style={{ fontSize: '12px', color: t.text.muted }}>{client.name}</span>
                        )
                      })()}
                    </div>
                    <div style={{ fontSize: '12px', color: t.text.muted }}>
                      {o.deliver_to_name}
                      {o.distributor_rep_name && ` · via ${o.distributor_rep_name}`}
                      {' · '}{formatShortDateMT(o.created_at)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="mono" style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary }}>{formatCurrency(total)}</div>
                    {Number(o.commission_amount || 0) > 0 && (
                      <div className="mono" style={{ fontSize: '11px', color: t.gold }}>+{formatCurrency(Number(o.commission_amount))}</div>
                    )}
                  </div>
                  <ChevronRight size={16} style={{
                    color: t.text.muted, flexShrink: 0,
                    transform: isSelected ? 'rotate(90deg)' : 'none',
                    transition: 'transform 150ms ease',
                  }} />
                </div>
              )
            })}
          </div>
        )}

        <ConfirmModal isOpen={!!deleteTarget} onClose={() => setDeleteTarget('')}
          onConfirm={async () => { await deleteOrder(deleteTarget); setDeleteTarget(''); load() }}
          title="Delete Order" message="This will permanently delete this order and all line items." confirmLabel="Delete" danger
        />
      </div>

      {/* ── Order Detail Side Panel ── */}
      {selectedOrder && (() => {
        const o = selectedOrder
        const client = clients.find(c => c.slug === o.client_slug)
        const total = resolveTotal(o)
        const items: any[] = o.po_line_items || []
        const isInquiry = o.order_type === 'distributor' || o.po_number?.startsWith('OI-')
        return (
          <>
            <div onClick={() => setSelectedOrder(null)}
              style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', zIndex: 900 }} />
            <div className="slide-in-right" style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: '440px', maxWidth: '100vw',
              backgroundColor: t.bg.elevated, borderLeft: `1px solid ${t.border.hover}`,
              zIndex: 1000, overflowY: 'auto', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                padding: '20px 24px', borderBottom: `1px solid ${t.border.default}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                position: 'sticky', top: 0, backgroundColor: t.bg.elevated, zIndex: 1,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="mono" style={{ fontSize: '18px', fontWeight: '700', color: t.gold }}>{o.po_number}</div>
                    {isInquiry && (
                      <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', backgroundColor: t.bg.input, color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Inquiry
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                    <span style={badge.orderStatus(o.status)}>{o.status}</span>
                    {client && <span style={{ fontSize: '12px', color: t.text.secondary }}>{client.name}</span>}
                  </div>
                </div>
                <button onClick={() => setSelectedOrder(null)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '4px' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', flex: 1 }}>

                {/* Delivery */}
                <div style={{ ...card, padding: '14px 16px', backgroundColor: t.bg.card }}>
                  <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={11} /> {isInquiry ? 'Ship To' : 'Deliver To'}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{o.deliver_to_name || '—'}</div>
                  {o.deliver_to_address && <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>{o.deliver_to_address}</div>}
                  {o.deliver_to_phone && <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>{o.deliver_to_phone}</div>}
                </div>

                {/* Distributor info */}
                {isInquiry && (o.distributor_rep_name || o.distributor_email) && (
                  <div style={{ ...card, padding: '14px 16px', backgroundColor: t.bg.card }}>
                    <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Truck size={11} /> Distributor Rep
                    </div>
                    {o.distributor_rep_name && <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{o.distributor_rep_name}</div>}
                    {o.distributor_email && <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>{o.distributor_email}</div>}
                  </div>
                )}

                {/* Meta */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ ...card, padding: '12px 14px', backgroundColor: t.bg.card }}>
                    <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}><Calendar size={10} /> Date</div>
                    <div className="mono" style={{ fontSize: '13px', color: t.text.primary }}>{formatShortDateMT(o.created_at)}</div>
                  </div>
                  <div style={{ ...card, padding: '12px 14px', backgroundColor: t.bg.card }}>
                    <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}><Hash size={10} /> Number</div>
                    <div className="mono" style={{ fontSize: '13px', color: t.gold }}>{o.po_number}</div>
                  </div>
                </div>

                {/* Line items */}
                <div>
                  <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Package size={11} /> Line Items
                  </div>
                  {items.length === 0 ? (
                    <div style={{ fontSize: '13px', color: t.text.muted }}>No line items recorded</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${t.border.default}` }}>
                      {items.map((li: any, i: number) => {
                        const qty = Number(li.cases || 0) + Number(li.bottles || 0) + Number(li.quantity || 0) || 1
                        const unitPrice = Number(li.unit_price || li.price || 0)
                        const lineTotal = Number(li.total || 0) || unitPrice * qty
                        return (
                          <div key={li.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: i % 2 === 0 ? t.bg.card : t.bg.elevated }}>
                            <div>
                              <div style={{ fontSize: '13px', color: t.text.primary, fontWeight: '500' }}>{li.product_name}</div>
                              <div className="mono" style={{ fontSize: '11px', color: t.text.muted, marginTop: '1px' }}>{qty}x @ {formatCurrency(unitPrice)}</div>
                            </div>
                            <div className="mono" style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{formatCurrency(lineTotal)}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Total */}
                <div style={{ padding: '16px 20px', borderRadius: '8px', border: `1px solid ${t.goldBorder}`, backgroundColor: t.goldDim, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: t.gold }}>Order Total</span>
                  <span className="mono" style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary }}>{formatCurrency(total)}</span>
                </div>

                {Number(o.commission_amount || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                    <span style={{ fontSize: '12px', color: t.text.muted }}>Commission</span>
                    <span className="mono" style={{ fontSize: '14px', fontWeight: '600', color: t.status.success }}>+{formatCurrency(Number(o.commission_amount))}</span>
                  </div>
                )}

                {o.notes && (
                  <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}` }}>
                    <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Notes</div>
                    <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.5 }}>{o.notes}</p>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
                  {o.status === 'sent' && (
                    <button onClick={async () => { await updateOrder(o.id, { status: 'fulfilled' }); load() }}
                      style={{ ...btnPrimary, justifyContent: 'center', padding: '12px' }}>
                      Mark Fulfilled
                    </button>
                  )}
                  {o.status === 'draft' && (
                    <button onClick={async () => { await updateOrder(o.id, { status: 'sent' }); load() }}
                      style={{ ...btnPrimary, justifyContent: 'center', padding: '12px' }}>
                      <Send size={15} /> Mark Sent
                    </button>
                  )}
                  {(() => {
                    // Auto-resolve recipient: distributor email for inquiries, client settings for direct
                    const autoEmail = isInquiry
                      ? (o.distributor_email || '')
                      : (clientSettings[o.client_slug || '']?.primary_contact_email || client?.contact_email || '')

                    const doSend = async (email: string) => {
                      if (!email.trim() || resendState === 'sending') return
                      setResendState('sending')
                      const itemLines = items.map((li: any) => {
                        const qty = Number(li.cases||0)+Number(li.bottles||0)+Number(li.quantity||0)||1
                        const price = Number(li.unit_price||li.price||0)
                        return `  • ${li.product_name} – Qty: ${qty}${price > 0 ? ` @ $${price.toFixed(2)} = $${(qty*price).toFixed(2)}` : ''}`
                      }).join('\n')
                      const subject = isInquiry ? `Order Inquiry ${o.po_number} – ${o.deliver_to_name}` : `PO ${o.po_number} – ${o.deliver_to_name}`
                      const text = [
                        isInquiry ? `Order Inquiry #: ${o.po_number}` : `PO Number: ${o.po_number}`,
                        `Ship To: ${o.deliver_to_name}`,
                        o.deliver_to_address ? `Address: ${o.deliver_to_address}` : null,
                        o.deliver_to_phone ? `Phone: ${o.deliver_to_phone}` : null,
                        '', 'Line Items:', itemLines || '  (see attached)', '',
                        `Order Total: $${total.toFixed(2)}`,
                        o.notes ? `Notes: ${o.notes}` : null, '',
                        isInquiry ? 'Please process this order inquiry and confirm pricing and availability.' : 'Please process this order at your earliest convenience.',
                        '', '— Barley Bros',
                      ].filter(l => l !== null).join('\n')
                      const htmlRows = items.map((li: any) => {
                        const qty = Number(li.cases||0)+Number(li.bottles||0)+Number(li.quantity||0)||1
                        const price = Number(li.unit_price||li.price||0)
                        return `<tr><td style="padding:8px 12px;border-bottom:1px solid #2a2a26">${li.product_name}</td><td style="padding:8px 12px;border-bottom:1px solid #2a2a26;text-align:center">${qty}</td><td style="padding:8px 12px;border-bottom:1px solid #2a2a26;text-align:right;font-weight:600">$${(qty*price).toFixed(2)}</td></tr>`
                      }).join('')
                      const html = `<div style="font-family:sans-serif;background:#0c0c0a;color:#eceae4;padding:32px;max-width:580px;margin:0 auto"><h2 style="font-size:20px;margin:0 0 4px;color:#d4a843">${o.po_number}</h2><p style="font-size:13px;color:#9a9790;margin:0 0 20px">${o.deliver_to_name} · ${new Date(o.created_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p><table style="width:100%;border-collapse:collapse;background:#161614;border-radius:8px;overflow:hidden;margin-bottom:18px"><thead><tr style="background:#202020"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#5a5754">Product</th><th style="padding:8px 12px;text-align:center;font-size:11px;color:#5a5754">Qty</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:#5a5754">Total</th></tr></thead><tbody>${htmlRows}</tbody></table><div style="text-align:right;font-size:18px;font-weight:700;color:#eceae4">$${total.toFixed(2)}</div>${o.notes ? `<p style="font-size:13px;color:#9a9790;margin-top:16px">${o.notes}</p>` : ''}<p style="font-size:12px;color:#5a5754;margin-top:24px">${isInquiry ? 'Please process this order inquiry and confirm pricing and availability.' : 'Please process this order at your earliest convenience.'}</p><p style="margin-top:16px;font-size:13px;color:#bfb5a1">— Barley Bros</p></div>`
                      try {
                        const res = await fetch('/api/send-email', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ to: email.trim(), subject, text, html }),
                        })
                        if (res.ok) { setResendState('sent'); setResendTo('') }
                        else setResendState('open')
                      } catch { setResendState('open') }
                    }

                    if (resendState === 'sent') return (
                      <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: '13px', textAlign: 'center' }}>
                        ✓ Order sent successfully
                      </div>
                    )
                    if (resendState === 'open' || resendState === 'sending') return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '11px', color: t.text.muted }}>Sending to:</div>
                        <input
                          type="email" value={resendTo}
                          onChange={e => setResendTo(e.target.value)}
                          placeholder="Recipient email address"
                          style={{ backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`, borderRadius: '6px', padding: '12px', color: t.text.primary, fontSize: '14px', outline: 'none', width: '100%' }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => { setResendState('idle'); setResendTo('') }} style={{ ...btnSecondary, flex: 1, justifyContent: 'center', padding: '12px' }}>Cancel</button>
                          <button onClick={() => doSend(resendTo)}
                            style={{ ...btnPrimary, flex: 2, justifyContent: 'center', padding: '12px', minHeight: '48px', touchAction: 'manipulation', opacity: resendState === 'sending' ? 0.6 : 1 } as any}>
                            <Send size={14} /> {resendState === 'sending' ? 'Sending...' : 'Send'}
                          </button>
                        </div>
                      </div>
                    )
                    // idle — auto-send if email known, else open input
                    return (
                      <button
                        onClick={() => {
                          if (autoEmail) {
                            doSend(autoEmail)
                          } else {
                            setResendTo('')
                            setResendState('open')
                          }
                        }}
                        style={{ ...btnSecondary, justifyContent: 'center', padding: '12px', minHeight: '48px', touchAction: 'manipulation' } as any}>
                        <Send size={15} /> {resendState === 'sending' ? 'Sending…' : isInquiry ? 'Send to Distributor' : 'Resend Order'}
                        {autoEmail && <span style={{ fontSize: '11px', color: t.text.muted, marginLeft: '4px' }}>→ {autoEmail.split(',')[0]}</span>}
                      </button>
                    )
                  })()}
                  <button
                    onClick={() => { setDeleteTarget(o.id); setSelectedOrder(null) }}
                    style={{ padding: '12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', border: `1px solid rgba(224,82,82,0.3)`, backgroundColor: t.status.dangerBg, color: t.status.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* ── Create Order / Inquiry Modal ── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 1000, padding: isMobile ? '0' : '20px' }}>
          <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: isMobile ? '16px 16px 0 0' : '12px', width: '100%', maxWidth: '580px', maxHeight: isMobile ? '92vh' : '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Sticky header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${t.border.subtle}`, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: t.text.primary }}>New {orderType === 'distributor' ? 'Order Inquiry' : 'Direct Order'}</h2>
              <button onClick={() => { setShowCreate(false); resetForm() }} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {/* Scrollable form content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', WebkitOverflowScrolling: 'touch' } as any}>

              {/* Order type toggle */}
              <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', backgroundColor: t.bg.card, borderRadius: '8px', padding: '3px', border: `1px solid ${t.border.default}` }}>
                {([
                  { key: 'direct', label: isMobile ? 'Direct' : 'Direct Order', icon: FileText },
                  { key: 'distributor', label: isMobile ? 'Inquiry' : 'Order Inquiry (Distributor)', icon: Truck },
                ] as const).map(opt => {
                  const Icon = opt.icon
                  const active = orderType === opt.key
                  return (
                    <button key={opt.key} onClick={() => setOrderType(opt.key)}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        padding: '8px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        fontSize: '13px', fontWeight: active ? '600' : '400',
                        backgroundColor: active ? t.bg.elevated : 'transparent',
                        color: active ? t.text.primary : t.text.muted,
                        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                      }}
                    >
                      <Icon size={13} /> {opt.label}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={labelStyle}>Brand</label>
                  <select value={form.client_slug} onChange={e => setForm(f => ({ ...f, client_slug: e.target.value }))} style={selectStyle}>
                    <option value="">Select brand...</option>
                    {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{orderType === 'distributor' ? 'Inquiry #' : 'PO Number'}</label>
                  <input type="text" value={form.po_number} onChange={e => setForm(f => ({ ...f, po_number: e.target.value }))} style={inputStyle} />
                </div>
              </div>

              {/* Account search */}
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Account (links order to account)</label>
                <AccountSearch
                  accounts={accounts}
                  value={form.account_id}
                  onChange={(id, name, address) => setForm(f => ({ ...f, account_id: id, deliver_to_name: name || f.deliver_to_name, deliver_to_address: address || f.deliver_to_address }))}
                  onAddAccount={() => setShowAddAccount(true)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={labelStyle}>{orderType === 'distributor' ? 'Ship To' : 'Deliver To'}</label>
                  <input type="text" value={form.deliver_to_name} onChange={e => setForm(f => ({ ...f, deliver_to_name: e.target.value }))} placeholder="Business name" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Address</label>
                  <input type="text" value={form.deliver_to_address} onChange={e => setForm(f => ({ ...f, deliver_to_address: e.target.value }))} placeholder="Street address" style={inputStyle} />
                </div>
              </div>

              {orderType === 'distributor' && (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={labelStyle}>Phone</label>
                    <input type="text" value={form.deliver_to_phone} onChange={e => setForm(f => ({ ...f, deliver_to_phone: e.target.value }))} placeholder="(720) 555-0000" style={inputStyle} />
                  </div>

                  {/* Distributor rep */}
                  <div style={{ marginBottom: '14px', padding: '14px 16px', borderRadius: '8px', backgroundColor: t.bg.card, border: `1px solid ${t.border.default}` }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Truck size={11} /> Distributor Rep
                    </div>
                    {form.client_slug && distributorReps.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <select
                          value={form.distributor_rep_id}
                          onChange={e => {
                            const rep = distributorReps.find(r => r.id === e.target.value)
                            setForm(f => ({
                              ...f,
                              distributor_rep_id: e.target.value,
                              distributor_rep_name: rep?.name || f.distributor_rep_name,
                              distributor_email: rep?.email || f.distributor_email,
                            }))
                          }}
                          style={selectStyle}
                        >
                          <option value="">Select existing rep...</option>
                          {distributorReps.map(r => <option key={r.id} value={r.id}>{r.name} {r.email ? `(${r.email})` : ''}</option>)}
                        </select>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <input type="text" value={form.distributor_rep_name} onChange={e => setForm(f => ({ ...f, distributor_rep_name: e.target.value }))} placeholder="Rep name" style={{ ...inputStyle, fontSize: '13px' }} />
                      <input type="email" value={form.distributor_email} onChange={e => setForm(f => ({ ...f, distributor_email: e.target.value }))} placeholder="rep@distributor.com" style={{ ...inputStyle, fontSize: '13px' }} />
                    </div>
                    {form.client_slug && (
                      <button
                        onClick={() => setShowAddDistributor(true)}
                        style={{ marginTop: '10px', fontSize: '12px', color: t.gold, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 0' }}
                      >
                        <UserPlus size={12} /> Add Distributor Rep
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Products */}
              <div style={{ marginBottom: '20px' }}>
                {/* Line item rows */}
                {form.line_items.map((li, i) => {
                  const prod = clientProducts.find(p => p.name === li.product_name)
                  const cases = (li as any).cases || 0
                  const bottles = (li as any).bottles || 0
                  const caseAmt = cases * (prod?.price ?? li.price ?? 0)
                  const btlAmt = bottles * (prod?.bottle_price != null
                    ? prod.bottle_price
                    : (prod?.price && (prod as any).case_count ? prod.price / (prod as any).case_count : 0))
                  const sub = caseAmt + btlAmt
                  return (
                    <div key={i} style={{ marginBottom: '10px', padding: '12px', borderRadius: '8px', backgroundColor: t.bg.card, border: `1px solid ${t.border.default}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        {clientProducts.length > 0 ? (
                          <select
                            value={li.product_name}
                            onChange={e => {
                              const p = clientProducts.find(p => p.name === e.target.value)
                              setForm(f => ({
                                ...f,
                                line_items: f.line_items.map((item, idx) =>
                                  idx !== i ? item : { ...item, product_name: e.target.value, price: p?.price ?? item.price }
                                ),
                              }))
                            }}
                            style={{ ...selectStyle, fontSize: '13px', flex: 1 }}
                          >
                            <option value="">Select product…</option>
                            {clientProducts.map(p => (
                              <option key={p.id} value={p.name}>{p.name}{p.price ? ` — ${formatCurrency(p.price)}` : ''}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text" value={li.product_name}
                            onChange={e => updateLineItem(i, 'product_name', e.target.value)}
                            placeholder="Product name"
                            style={{ ...inputStyle, fontSize: '13px', flex: 1 }}
                          />
                        )}
                        {form.line_items.length > 1 && (
                          <button onClick={() => removeLineItem(i)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '4px', flexShrink: 0 }}><X size={16} /></button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '4px' }}>Bottles</div>
                          <input type="number" value={(li as any).bottles ?? ''} min="0" placeholder="0"
                            onChange={e => {
                              const b = parseInt(e.target.value) || 0
                              setForm(f => ({ ...f, line_items: f.line_items.map((item, idx) => idx !== i ? item : { ...item, bottles: b, quantity: ((item as any).cases || 0) + b }) }))
                            }}
                            style={{ ...inputStyle, fontSize: '14px' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '4px' }}>Cases</div>
                          <input type="number" value={(li as any).cases ?? ''} min="0" placeholder="0"
                            onChange={e => {
                              const c = parseInt(e.target.value) || 0
                              setForm(f => ({ ...f, line_items: f.line_items.map((item, idx) => idx !== i ? item : { ...item, cases: c, quantity: c + ((item as any).bottles || 0) }) }))
                            }}
                            style={{ ...inputStyle, fontSize: '14px' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '4px' }}>$/case</div>
                          <input type="number" value={li.price || ''} min="0" step="0.01"
                            onChange={e => updateLineItem(i, 'price', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            style={{ ...inputStyle, fontSize: '14px' }} />
                        </div>
                      </div>
                      {sub > 0 && (
                        <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '6px' }}>
                          {cases > 0 && <span>{cases} case{cases !== 1 ? 's' : ''} × {formatCurrency(prod?.price ?? li.price ?? 0)}</span>}
                          {cases > 0 && bottles > 0 && <span> + </span>}
                          {bottles > 0 && <span>{bottles} btl × {formatCurrency(prod?.bottle_price ?? 0)}</span>}
                          <span style={{ color: t.gold, fontWeight: '600' }}> = {formatCurrency(sub)}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
                <button onClick={addLineItem} style={{ fontSize: '13px', color: t.gold, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 0' }}>
                  <Plus size={13} /> Add item
                </button>
              </div>

              {orderTotal > 0 && (
                <div style={{ backgroundColor: t.bg.input, borderRadius: '8px', padding: '14px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${t.goldBorder}` }}>
                  <div style={{ fontSize: '11px', color: t.text.muted }}>Order Total</div>
                  <div className="mono" style={{ fontSize: '20px', fontWeight: '700', color: t.text.primary }}>{formatCurrency(orderTotal)}</div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Special instructions..." style={inputStyle} />
              </div>
            </div>

            {/* Sticky footer with action buttons */}
            <div style={{ padding: '16px 20px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', borderTop: `1px solid ${t.border.default}`, flexShrink: 0, backgroundColor: t.bg.elevated } as any}>
              {createErr && <div style={{ fontSize: '12px', color: t.status.danger, marginBottom: '8px' }}>{createErr}</div>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setShowCreate(false); resetForm() }} style={{ ...btnSecondary, flex: 1, justifyContent: 'center' }}>Cancel</button>
                {orderType === 'direct' ? (
                  <button
                    onClick={() => {
                      if (!form.client_slug) { setCreateErr('Select a brand first'); return }
                      if (!form.deliver_to_name) { setCreateErr('Enter a deliver-to name'); return }
                      if (form.line_items.every(li => !li.product_name)) { setCreateErr('Add at least one product'); return }
                      setCreateErr('')
                      const s = clientSettings[form.client_slug] || {}
                      setPreviewEmail(s.primary_contact_email || selectedClient?.contact_email || '')
                      setShowEmailPreview(true)
                    }}
                    style={{ ...btnPrimary, flex: 2, justifyContent: 'center', minHeight: '48px', touchAction: 'manipulation' } as any}
                  >
                    <Send size={15} /> Preview & Send
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (!form.client_slug) { setCreateErr('Select a brand first'); return }
                      if (!form.deliver_to_name) { setCreateErr('Enter a deliver-to name'); return }
                      setCreateErr('')
                      handleCreate()
                    }}
                    style={{ ...btnPrimary, flex: 2, justifyContent: 'center', minHeight: '48px', touchAction: 'manipulation', opacity: creating ? 0.6 : 1 } as any}>
                    {creating ? 'Creating...' : 'Create Inquiry'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Preview Modal ── */}
      {showEmailPreview && (() => {
        const { subject, html } = buildEmailBody()
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 1300, padding: isMobile ? '0' : '20px' }}>
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: isMobile ? '16px 16px 0 0' : '14px', width: '100%', maxWidth: '620px', maxHeight: isMobile ? '92vh' : '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${t.border.default}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary, margin: 0 }}>Email Preview</h3>
                  <p style={{ fontSize: '12px', color: t.text.muted, margin: '2px 0 0' }}>Review before sending</p>
                </div>
                <button onClick={() => { setShowEmailPreview(false); setSendEmailError('') }} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '4px', display: 'flex' }}><X size={18} /></button>
              </div>

              {/* Meta */}
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, width: '52px', textAlign: 'right', flexShrink: 0 }}>To:</span>
                  <input
                    type="email"
                    value={previewEmail}
                    onChange={e => { setPreviewEmail(e.target.value); setSendEmailError('') }}
                    placeholder="Enter recipient email address"
                    style={{ flex: 1, backgroundColor: t.bg.input, border: `1px solid ${sendEmailError ? t.status.danger : t.border.default}`, borderRadius: '6px', padding: '8px 10px', color: t.text.primary, fontSize: '14px', outline: 'none' }}
                  />
                </div>
                {sendEmailError && (
                  <div style={{ fontSize: '12px', color: t.status.danger, paddingLeft: '62px' }}>{sendEmailError}</div>
                )}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, width: '52px', textAlign: 'right', flexShrink: 0 }}>Subject:</span>
                  <span style={{ fontSize: '13px', color: t.text.secondary }}>{subject}</span>
                </div>
              </div>

              {/* Body preview */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', WebkitOverflowScrolling: 'touch' } as any}>
                <div style={{ backgroundColor: t.bg.card, borderRadius: '8px', overflow: 'hidden', border: `1px solid ${t.border.default}` }}>
                  <div dangerouslySetInnerHTML={{ __html: html }} />
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '16px 20px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', borderTop: `1px solid ${t.border.default}`, display: 'flex', gap: '10px', flexShrink: 0 } as any}>
                <button onClick={() => { setShowEmailPreview(false); setSendEmailError('') }} style={{ ...btnSecondary, flex: 1, justifyContent: 'center' }}>Cancel</button>
                <button
                  onClick={async () => {
                    if (!previewEmail.trim()) {
                      setSendEmailError('Enter a recipient email address above')
                      return
                    }
                    setSendEmailError('')
                    setCreating(true)
                    try {
                      // Send email FIRST — if it fails, nothing gets written to DB
                      const { subject: subj, text: txt, html: htmlBody, replyTo } = buildEmailBody()
                      const emailRes = await fetch('/api/send-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ to: previewEmail.trim(), subject: subj, text: txt, html: htmlBody, replyTo }),
                      })
                      if (!emailRes.ok) {
                        const errJson = await emailRes.json().catch(() => ({}))
                        throw new Error(errJson.error || 'Email delivery failed — check the address and try again')
                      }
                      // Email confirmed — now save the order
                      const resolvedItems = form.line_items.filter(li => li.product_name).map(li => {
                        const prod = clientProducts.find(p => p.name === li.product_name)
                        return {
                          product_name: li.product_name,
                          quantity: li.quantity,
                          price: prod?.price ?? li.price ?? 0,
                          cases: (li as any).cases || 0,
                          bottles: (li as any).bottles || 0,
                          bottle_price: prod?.bottle_price ?? 0,
                        }
                      })
                      const newOrder = await createOrder({
                        client_slug: form.client_slug,
                        client_name: selectedClient?.name || form.client_slug,
                        account_id: form.account_id || undefined,
                        deliver_to_name: form.deliver_to_name,
                        deliver_to_address: form.deliver_to_address,
                        po_number: form.po_number,
                        notes: form.notes,
                        line_items: resolvedItems,
                        commission_rate: selectedClient?.commission_rate || 0,
                        order_type: 'direct',
                      })
                      await updateOrder(newOrder.id, { status: 'sent' })
                      invalidatePrefix('dashboard-stats')
                      setShowEmailPreview(false)
                      setSendEmailError('')
                      setShowCreate(false)
                      resetForm()
                      load()
                      setActiveTab('direct')
                    } catch (e: any) {
                      setSendEmailError(e?.message || 'Failed to send order')
                    } finally { setCreating(false) }
                  }}
                  style={{ ...btnPrimary, flex: 2, justifyContent: 'center', minHeight: '48px', touchAction: 'manipulation', opacity: creating ? 0.6 : 1 } as any}
                >
                  <Send size={14} /> {creating ? 'Sending...' : 'Send Order'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Add Distributor Modal */}
      {showAddDistributor && form.client_slug && (
        <AddDistributorModal
          clientSlug={form.client_slug}
          onClose={() => setShowAddDistributor(false)}
          onAdded={rep => {
            setDistributorReps(prev => [...prev, rep])
            setForm(f => ({
              ...f,
              distributor_rep_id: rep.id,
              distributor_rep_name: rep.name,
              distributor_email: rep.email || f.distributor_email,
            }))
          }}
        />
      )}

      {/* Add Account Modal */}
      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onAdded={account => {
            setAccounts(prev => [...prev, account].sort((a, b) => a.name.localeCompare(b.name)))
            setForm(f => ({ ...f, account_id: account.id, deliver_to_name: account.name, deliver_to_address: account.address || f.deliver_to_address }))
            setShowAddAccount(false)
          }}
          isMobile={isMobile}
        />
      )}
    </LayoutShell>
  )
}
