'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ShoppingCart, Pencil, X, Check, AlertTriangle, Plus, ExternalLink, Zap } from 'lucide-react'
import { v3, v3input, v3label, WIN_STATUSES, HOT_STATUSES } from '../../lib/theme'
import { useV3Clients } from '../../lib/query'
import { useV3Toast } from '../../lib/context'
import { getSupabase } from '../../../lib/supabase'
import { clientLogoUrl } from '../../../lib/constants'
import { formatCurrency, relativeTimeStr, resolveTotal } from '../../../lib/formatters'
import type { Client } from '../../../lib/types'

// ── Local data hooks ──────────────────────────────────────────────────────────

function useBrandVisits(slug: string) {
  return useQuery({
    queryKey: ['v3', 'brand', slug, 'visits'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('visits')
        .select('id, visited_at, status, notes, account_id, accounts(id, name)')
        .eq('client_slug', slug)
        .order('visited_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!slug,
    staleTime: 2 * 60_000,
  })
}

function useBrandPlacements(slug: string) {
  return useQuery({
    queryKey: ['v3', 'brand', slug, 'placements'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('placements')
        .select('id, product_name, status, placement_type, price_point, lost_at, account_id, accounts(id, name)')
        .eq('client_slug', slug)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!slug,
    staleTime: 2 * 60_000,
  })
}

function useBrandOrders(slug: string) {
  return useQuery({
    queryKey: ['v3', 'brand', slug, 'orders'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('purchase_orders')
        .select('id, po_number, status, order_type, total_amount, account_id, created_at, sent_at, accounts(id, name), po_line_items(id, total)')
        .eq('client_slug', slug)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!slug,
    staleTime: 2 * 60_000,
  })
}

function useBrandCompliance(clientId: string) {
  return useQuery({
    queryKey: ['v3', 'brand', clientId, 'compliance'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('state_registrations')
        .select('*')
        .eq('client_id', clientId)
        .order('state', { ascending: true })
      if (error) throw error
      return (data ?? []) as any[]
    },
    enabled: !!clientId,
  })
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAC_STATUS_COLOR: Record<string, string> = {
  committed:  v3.health.new,
  ordered:    v3.status.warning,
  on_shelf:   v3.status.success,
  reordering: v3.amber,
}

const PLAC_STATUS_LABEL: Record<string, string> = {
  committed: 'Committed', ordered: 'Ordered', on_shelf: 'On Shelf', reordering: 'Reordering',
}
const PLAC_PRIORITY: Record<string, number> = {
  reordering: 4, on_shelf: 3, ordered: 2, committed: 1,
}

const VISIT_STATUS_COLOR: Record<string, string> = {
  'Will Order Soon':  v3.status.warning,
  'Just Ordered':     v3.status.success,
  'Needs Follow Up':  v3.status.danger,
  'Not Interested':   v3.text.muted,
  'Menu Feature Won': v3.amberLight,
  'New Placement':    v3.status.success,
  'General Check-In': v3.text.secondary,
  'Tasted':           v3.amber,
}

const REG_STATUS_COLOR: Record<string, string> = {
  active:         v3.status.success,
  pending:        v3.status.warning,
  expired:        v3.status.danger,
  not_registered: 'rgba(255,255,255,0.40)',
}
const REG_STATUS_LABEL: Record<string, string> = {
  active: 'Active', pending: 'Pending', expired: 'Expired', not_registered: 'Not Registered',
}
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

// ── Modal base ────────────────────────────────────────────────────────────────

function ModalBase({ onClose, children, maxWidth = 480 }: { onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: v3.bg.overlay, backdropFilter: 'blur(10px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth, background: v3.bg.elevated, borderRadius: '12px', boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)', maxHeight: '92vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

// ── Edit Brand Modal ──────────────────────────────────────────────────────────

function EditBrandModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const [name, setName]         = useState(client.name ?? '')
  const [category, setCategory] = useState(client.category ?? '')
  const [territory, setTerritory] = useState(client.territory ?? '')
  const [website, setWebsite]   = useState(client.website ?? '')
  const [instagram, setIg]      = useState(client.instagram ?? '')
  const [contactName, setContactName] = useState(client.contact_name ?? '')
  const [contactEmail, setContactEmail] = useState(client.contact_email ?? '')
  const [contactPhone, setContactPhone] = useState(client.contact_phone ?? '')
  const [notes, setNotes]       = useState(client.notes ?? '')
  const [orderType, setOrderType] = useState<'direct' | 'distributor'>(client.order_type ?? 'distributor')
  const [commissionRate, setCommission] = useState(String(client.commission_rate != null ? Math.round(client.commission_rate * 100) : ''))
  const [distributorName, setDistName] = useState(client.distributor_name ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const rate = parseFloat(commissionRate)
      const { error } = await sb.from('clients').update({
        name:            name.trim() || null,
        category:        category.trim() || null,
        territory:       territory.trim() || null,
        website:         website.trim() || null,
        instagram:       instagram.trim() || null,
        contact_name:    contactName.trim() || null,
        contact_email:   contactEmail.trim() || null,
        contact_phone:   contactPhone.trim() || null,
        notes:           notes.trim() || null,
        order_type:      orderType,
        commission_rate: !isNaN(rate) ? rate / 100 : client.commission_rate,
        distributor_name: distributorName.trim() || null,
      }).eq('id', client.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'clients'] })
      toast('Brand updated')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to save', 'error'),
  })

  return (
    <ModalBase onClose={onClose} maxWidth={520}>
      <div style={{ padding: '24px 28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Edit Brand</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={v3label}>Brand Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
            <div><label style={v3label}>Category</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Whiskey, Gin, RTD…" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
          </div>

          <div>
            <label style={v3label}>Order Type</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['direct', 'distributor'] as const).map(ot => (
                <button key={ot} type="button" onClick={() => setOrderType(ot)} style={{
                  flex: 1, padding: '8px 10px', borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${orderType === ot ? 'rgba(196,164,110,0.50)' : 'rgba(255,255,255,0.08)'}`,
                  background: orderType === ot ? 'rgba(196,164,110,0.09)' : 'transparent',
                  color: orderType === ot ? v3.amberLight : 'rgba(255,255,255,0.40)',
                }}>
                  {ot === 'direct' ? 'Direct Orders' : 'Order Inquiries'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={v3label}>Commission %</label>
              <input type="number" min={0} max={100} step={0.5} value={commissionRate} onChange={e => setCommission(e.target.value)} placeholder="e.g. 12" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
            <div><label style={v3label}>Territory</label>
              <input value={territory} onChange={e => setTerritory(e.target.value)} placeholder="Colorado, Front Range…" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
          </div>

          {orderType === 'distributor' && (
            <div><label style={v3label}>Distributor Name</label>
              <input value={distributorName} onChange={e => setDistName(e.target.value)} placeholder="RNDC, Breakthru, Grey Eagle…" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
          )}

          <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.18em', marginTop: 4 }}>Brand Contact</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: -8 }}>
            <div><label style={v3label}>Name</label>
              <input value={contactName} onChange={e => setContactName(e.target.value)} style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
            <div><label style={v3label}>Phone</label>
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
          </div>
          <div><label style={v3label}>Email</label>
            <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} style={{ ...v3input, background: v3.bg.sheet }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={v3label}>Website</label>
              <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
            <div><label style={v3label}>Instagram</label>
              <input value={instagram} onChange={e => setIg(e.target.value)} placeholder="@handle" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
          </div>

          <div><label style={v3label}>Internal Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none', lineHeight: 1.5 } as any} />
          </div>
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

// ── Registration Form Modal ───────────────────────────────────────────────────

function RegistrationFormModal({ clientId, reg, onClose }: { clientId: string; reg?: any; onClose: () => void }) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const editing = !!reg
  const [state, setState]     = useState(reg?.state ?? '')
  const [status, setStatus]   = useState<string>(reg?.status ?? 'pending')
  const [ttb, setTtb]         = useState(reg?.ttb_number ?? '')
  const [expiry, setExpiry]   = useState(reg?.expiry_date ?? '')
  const [notes, setNotes]     = useState(reg?.notes ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const payload = {
        client_id: clientId,
        state: state.trim().toUpperCase(),
        status,
        ttb_number: ttb.trim() || null,
        expiry_date: expiry || null,
        notes: notes.trim() || null,
      }
      if (editing) {
        const { error } = await sb.from('state_registrations').update(payload).eq('id', reg.id)
        if (error) throw error
      } else {
        const { error } = await sb.from('state_registrations').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'brand', clientId, 'compliance'] })
      toast(editing ? 'Registration updated' : 'Registration added')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to save', 'error'),
  })

  return (
    <ModalBase onClose={onClose} maxWidth={440}>
      <div style={{ padding: '24px 28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>
            {editing ? 'Edit Registration' : 'Add State Registration'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={v3label}>State *</label>
            {editing
              ? <div style={{ ...v3input, background: v3.bg.sheet, color: v3.text.secondary, cursor: 'default' } as any}>{reg.state}</div>
              : (
                <select value={state} onChange={e => setState(e.target.value)} style={{ ...v3input, appearance: 'none' as any, background: v3.bg.sheet }}>
                  <option value="">Select state…</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )
            }
          </div>

          <div>
            <label style={v3label}>Status</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {Object.entries(REG_STATUS_LABEL).map(([k, l]) => {
                const c = REG_STATUS_COLOR[k]
                const sel = status === k
                return (
                  <button key={k} type="button" onClick={() => setStatus(k)} style={{
                    padding: '5px 12px', borderRadius: v3.radius.full, fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${sel ? c + '60' : 'rgba(255,255,255,0.08)'}`,
                    background: sel ? c + '14' : 'transparent',
                    color: sel ? c : 'rgba(255,255,255,0.40)',
                  }}>{l}</button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={v3label}>TTB Number</label>
              <input value={ttb} onChange={e => setTtb(e.target.value)} placeholder="TTB-12345" style={{ ...v3input, background: v3.bg.sheet }} />
            </div>
            <div><label style={v3label}>Expiry Date</label>
              <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} style={{ ...v3input, background: v3.bg.sheet, colorScheme: 'dark' } as any} />
            </div>
          </div>

          <div><label style={v3label}>Notes <span style={{ opacity: 0.4, fontWeight: 400 }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Renewal process, contacts, notes…"
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none' } as any} />
          </div>
        </div>

        <button onClick={() => save.mutate()} disabled={(!editing && !state) || save.isPending}
          style={{
            marginTop: 24, width: '100%', padding: '13px',
            background: save.isPending ? v3.bg.sheet : v3.amber,
            color: '#000', border: 'none', borderRadius: v3.radius.md,
            fontSize: '13px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
          {save.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Registration'}
        </button>
      </div>
    </ModalBase>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 1, background: v3.border.subtle }} />
      {children}
      <div style={{ flex: 1, height: 1, background: v3.border.subtle }} />
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BrandDetailPage() {
  const { slug } = useParams() as { slug: string }
  const { data: clients = [] } = useV3Clients()
  const { data: visits = [], isLoading: vLoading }    = useBrandVisits(slug)
  const { data: placements = [] }                     = useBrandPlacements(slug)
  const { data: orders = [], isLoading: oLoading }    = useBrandOrders(slug)

  const client = clients.find(c => c.slug === slug)

  const { data: compliance = [] } = useBrandCompliance(client?.id ?? '')

  const [showEditBrand, setShowEditBrand]   = useState(false)
  const [regModal, setRegModal]             = useState<{ reg?: any } | null>(null)
  const [actFilter, setActFilter]           = useState<'all' | 'hot' | 'wins'>('all')

  if (!client) return (
    <div style={{ padding: '32px 24px', color: v3.text.muted, fontSize: '14px' }}>
      <Link href="/v3/brands" style={{ color: v3.amberLight, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: '13px' }}>
        <ArrowLeft size={13} /> Brands
      </Link>
      <div>Brand not found.</div>
    </div>
  )

  const ac = client.color || v3.amber
  const logo = clientLogoUrl(client)
  const nowMs = Date.now()
  const now30ms = nowMs - 30 * 86400000

  // Core metrics
  const visits30 = visits.filter(v => new Date(v.visited_at).getTime() >= now30ms)
  const activePlacements = placements.filter(p => !p.lost_at)
  const onShelf    = activePlacements.filter(p => p.status === 'on_shelf').length
  const reordering = activePlacements.filter(p => p.status === 'reordering').length
  const sentOrders = (orders as any[]).filter(o => ['sent', 'fulfilled'].includes(o.status))
  const totalRevenue = sentOrders.reduce((s, o) => s + resolveTotal(o), 0)

  // Commission MTD
  const monthStartMs = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
  const commissionMTD = sentOrders
    .filter(o => new Date(o.sent_at || o.created_at).getTime() >= monthStartMs)
    .reduce((s, o) => s + resolveTotal(o) * (client.commission_rate ?? 0), 0)

  // Placement funnel counts
  const placCounts = { committed: 0, ordered: 0, on_shelf: 0, reordering: 0 }
  for (const p of activePlacements) {
    if (p.status in placCounts) placCounts[p.status as keyof typeof placCounts]++
  }
  const maxPlacCount = Math.max(...Object.values(placCounts), 1)

  // Best placement per account (highest priority status)
  const placByAccount: Record<string, string> = {}
  for (const p of activePlacements) {
    if (!placByAccount[p.account_id] || (PLAC_PRIORITY[p.status] ?? 0) > (PLAC_PRIORITY[placByAccount[p.account_id]] ?? 0)) {
      placByAccount[p.account_id] = p.status
    }
  }

  // Top accounts by $ ordered (all-time, non-draft)
  const nonDraftOrders = (orders as any[]).filter(o => o.status !== 'draft')
  const acctOrderTotals: Record<string, { id: string; name: string; total: number }> = {}
  for (const o of nonDraftOrders) {
    if (!o.account_id) continue
    if (!acctOrderTotals[o.account_id]) {
      acctOrderTotals[o.account_id] = { id: o.account_id, name: o.accounts?.name || o.deliver_to_name || '—', total: 0 }
    }
    acctOrderTotals[o.account_id].total += resolveTotal(o)
  }
  const hasDollarData = Object.keys(acctOrderTotals).length > 0

  // Fallback to visit count if no order data
  const accountVisits: Record<string, { name: string; count: number; id: string }> = {}
  for (const v of visits) {
    if (!v.accounts) continue
    const id = v.account_id
    if (!accountVisits[id]) accountVisits[id] = { id, name: v.accounts.name, count: 0 }
    accountVisits[id].count++
  }

  const topAccounts = hasDollarData
    ? Object.values(acctOrderTotals).sort((a, b) => b.total - a.total).slice(0, 8)
    : Object.values(accountVisits).sort((a, b) => b.count - a.count).slice(0, 8).map(a => ({ ...a, total: 0 }))

  // Hot leads — accounts with actionable status in last 30d, deduped
  const hotLeadsSeen = new Set<string>()
  const hotLeads = visits.filter(v => {
    const ms = new Date(v.visited_at).getTime()
    return ms >= now30ms && HOT_STATUSES.has(v.status)
  }).filter(v => {
    if (!v.account_id || hotLeadsSeen.has(v.account_id)) return false
    hotLeadsSeen.add(v.account_id); return true
  })

  // 12-week sparkline data
  const weeklyVisits = Array.from({ length: 12 }, (_, i) => {
    const end = nowMs - i * 7 * 86400000
    const start = end - 7 * 86400000
    return { count: 0, start, end }
  }).reverse()
  for (const v of visits) {
    const ms = new Date(v.visited_at).getTime()
    const w = weeklyVisits.find(wk => ms >= wk.start && ms < wk.end)
    if (w) w.count++
  }
  const maxWeekCount = Math.max(...weeklyVisits.map(w => w.count), 1)

  // Filtered activity feed
  const filteredVisits = actFilter === 'hot'
    ? visits.filter(v => HOT_STATUSES.has(v.status))
    : actFilter === 'wins'
    ? visits.filter(v => WIN_STATUSES.has(v.status))
    : visits

  const winsCount = visits.filter(v => WIN_STATUSES.has(v.status)).length

  const kpis = [
    { label: 'Visits (30d)',    value: visits30.length,                                                    color: v3.text.secondary },
    { label: 'Active Plac.',    value: activePlacements.length,                                            color: v3.text.secondary },
    { label: 'On Shelf',        value: onShelf,                                                            color: v3.status.success,  glow: 'v3-glow-green' },
    { label: 'Reordering',      value: reordering,                                                         color: v3.amber,           glow: 'v3-glow-amber' },
    { label: 'Hot Leads',       value: hotLeads.length,                                                    color: hotLeads.length > 0 ? v3.status.warning : v3.text.muted },
    { label: 'Commission MTD',  value: commissionMTD > 0 ? formatCurrency(commissionMTD) : '—',           color: v3.status.success },
  ]

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 28px 0' }}>

      {/* ── Fixed header zone ─────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0 }}>

      <Link href="/v3/brands" style={{ color: v3.text.muted, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 10, fontSize: '12px', fontWeight: 600, opacity: 0.7, letterSpacing: '0.02em' }}>
        <ArrowLeft size={11} /> Brands
      </Link>

      {/* ── Brand header ─────────────────────────────────────────────────── */}
      <div style={{ borderTop: `2px solid ${ac}`, paddingTop: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: ac + '14', border: `1px solid ${ac}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {logo
              ? <img src={logo} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              : <span style={{ fontSize: 22, fontWeight: 900, color: ac }}>{client.name[0]}</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '26px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: '0 0 4px' }}>{client.name}</h1>
            <div style={{ fontSize: '13px', color: v3.text.muted, lineHeight: 1.5 }}>
              {[
                client.category ?? 'Spirits Brand',
                client.order_type === 'direct' ? 'Direct orders' : 'Distributor inquiries',
                client.commission_rate ? `${(client.commission_rate * 100).toFixed(0)}% commission` : null,
                client.territory ?? null,
                client.distributor_name ? `via ${client.distributor_name}` : null,
              ].filter(Boolean).join(' · ')}
            </div>
            {(client.contact_name || client.contact_email || client.contact_phone) && (
              <div style={{ fontSize: '12px', color: v3.text.muted, marginTop: 4 }}>
                {client.contact_name && <span style={{ color: v3.text.secondary }}>{client.contact_name}</span>}
                {client.contact_email && <a href={`mailto:${client.contact_email}`} style={{ color: v3.text.link, textDecoration: 'none', marginLeft: client.contact_name ? 8 : 0 }}>{client.contact_email}</a>}
                {client.contact_phone && <span style={{ marginLeft: 8 }}>{client.contact_phone}</span>}
              </div>
            )}
            {client.notes && (
              <div style={{ fontSize: '12px', color: v3.text.muted, marginTop: 6, fontStyle: 'italic', lineHeight: 1.5, maxWidth: 480 }}>{client.notes}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <a href={`/portal/${slug}`} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
              background: ac + '0e', border: `1px solid ${ac}30`, borderRadius: v3.radius.md,
              fontSize: '12px', fontWeight: 600, color: ac, textDecoration: 'none', letterSpacing: '0.02em',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = ac + '1a' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ac + '0e' }}>
              <ExternalLink size={11} />View Portal
            </a>
            <button onClick={() => setShowEditBrand(true)} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
              background: 'transparent', border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md,
              fontSize: '12px', fontWeight: 600, color: v3.text.muted, cursor: 'pointer', letterSpacing: '0.02em',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${ac}40`; e.currentTarget.style.color = v3.text.secondary }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = v3.border.strong; e.currentTarget.style.color = v3.text.muted }}>
              <Pencil size={11} />Edit
            </button>
          </div>
        </div>

        {/* KPI stat row */}
        <div style={{ display: 'flex', gap: 0, paddingBottom: 10, borderBottom: `1px solid ${v3.border.subtle}` }}>
          {kpis.map((k, i, arr) => (
            <div key={k.label} style={{ flex: 1, paddingRight: i < arr.length - 1 ? 16 : 0, borderRight: i < arr.length - 1 ? `1px solid ${v3.border.subtle}` : 'none', marginRight: i < arr.length - 1 ? 16 : 0 }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.20em', marginBottom: 8, fontFamily: v3.font.ui }}>{k.label}</div>
              <div className={k.glow ?? ''} style={{ fontSize: '26px', fontWeight: 900, color: k.color, fontFamily: 'monospace', lineHeight: 1, letterSpacing: '-0.03em' }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 12-week visit sparkline ───────────────────────────────────────── */}
      {visits.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: v3.font.ui }}>Visit Trend · 12 Weeks</span>
              <span style={{ fontSize: '11px', color: v3.text.muted, fontFamily: 'monospace' }}>{visits.length} total</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
              {weeklyVisits.map((w, i) => {
                const heightPx = Math.max((w.count / maxWeekCount) * 32, w.count > 0 ? 3 : 1)
                const isRecent = i >= weeklyVisits.length - 3
                return (
                  <div key={i} title={`${w.count} visit${w.count !== 1 ? 's' : ''}`} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{
                      width: '100%', height: `${heightPx}px`,
                      background: w.count > 0 ? (isRecent ? ac : ac + '55') : v3.border.subtle,
                      borderRadius: '2px 2px 0 0', transition: 'height 500ms',
                    }} />
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 80, flexShrink: 0, paddingBottom: 2 }}>
            <span style={{ fontSize: '9px', color: v3.text.muted }}>12w ago</span>
            <span style={{ fontSize: '9px', color: v3.text.muted }}>now</span>
          </div>
        </div>
      )}

      </div> {/* end header zone */}

      {/* ── Main 2-col grid ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 28, overflow: 'hidden' }}>

        {/* LEFT — Placement pipeline + Hot Leads + Orders + Compliance */}
        <div style={{ overflowY: 'auto', height: '100%', paddingBottom: 20 }}>
          <SectionLabel>{`Placement Pipeline · ${activePlacements.length} active`}</SectionLabel>
          {activePlacements.length === 0
            ? <div style={{ color: v3.text.muted, fontSize: '13px', paddingTop: 4 }}>No active placements</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(['reordering', 'on_shelf', 'ordered', 'committed'] as const).map(status => {
                  const count = placCounts[status]
                  const color = PLAC_STATUS_COLOR[status]
                  const pct = (count / maxPlacCount) * 100
                  return (
                    <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: count > 0 ? `0 0 6px ${color}` : 'none', flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', color: v3.text.secondary, width: 84, flexShrink: 0 }}>{PLAC_STATUS_LABEL[status]}</span>
                      <div style={{ flex: 1, height: 5, borderRadius: 3, background: v3.border.subtle, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}60, ${color})`, borderRadius: 3, transition: 'width 500ms ease' }} />
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: 900, color: count > 0 ? color : v3.text.muted, fontFamily: 'monospace', width: 24, textAlign: 'right', flexShrink: 0 }}>{count}</span>
                    </div>
                  )
                })}
              </div>
            )
          }

          {/* Hot Leads */}
          {hotLeads.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <SectionLabel>
                <Zap size={9} style={{ display: 'inline', marginRight: 5 }} />
                {`Hot Leads · ${hotLeads.length}`}
              </SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                {hotLeads.map(v => {
                  const sc = VISIT_STATUS_COLOR[v.status] ?? v3.text.muted
                  return (
                    <Link key={v.id} href={`/v3/territory/${v.account_id}`} style={{ textDecoration: 'none' }}>
                      <div className="v3-row-hover" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: v3.radius.sm }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc, boxShadow: `0 0 5px ${sc}`, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: v3.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.accounts?.name ?? '—'}</span>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: sc, flexShrink: 0, whiteSpace: 'nowrap' }}>{v.status === 'Will Order Soon' ? 'Will Order' : 'Follow Up'}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Orders */}
          <div style={{ marginTop: 20 }}>
            <div style={{ padding: '0 0 10px', borderBottom: `1px solid ${v3.border.subtle}`, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.22em', fontFamily: v3.font.ui }}>Orders</span>
              {sentOrders.length > 0 && (
                <>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: v3.amberLight, fontFamily: 'monospace' }}>{sentOrders.length}</span>
                  <span style={{ fontSize: '12px', color: v3.text.muted, marginLeft: 'auto', fontFamily: 'monospace' }}>{formatCurrency(totalRevenue)} total</span>
                </>
              )}
            </div>
            {oLoading
              ? <div style={{ padding: '16px 0', color: v3.text.muted, fontSize: '13px' }}>Loading…</div>
              : orders.length === 0
              ? <div style={{ padding: '16px 0', color: v3.text.muted, fontSize: '13px' }}>No orders yet</div>
              : (orders as any[]).map(o => {
                const total = resolveTotal(o)
                const statusColor = o.status === 'fulfilled' ? v3.status.success : o.status === 'sent' ? v3.status.warning : v3.text.muted
                return (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${v3.border.subtle}` }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = v3.bg.elevated}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <ShoppingCart size={10} color={statusColor} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: v3.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.accounts?.name ?? '—'}{o.po_number ? ` · ${o.po_number}` : ''}
                      </div>
                      <div style={{ fontSize: '10px', color: v3.text.muted, marginTop: 1 }}>
                        {relativeTimeStr(o.sent_at || o.created_at) ?? '—'} · {o.order_type === 'distributor' ? 'Dist.' : 'Direct'}
                      </div>
                    </div>
                    {total > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: v3.amberLight, fontFamily: 'monospace', flexShrink: 0 }}>{formatCurrency(total)}</span>}
                    <span style={{ fontSize: '9px', fontWeight: 700, color: statusColor, background: statusColor + '14', padding: '2px 6px', borderRadius: v3.radius.sm, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{o.status}</span>
                  </div>
                )
              })
            }
          </div>

          {/* Compliance */}
          {(() => {
            const now = new Date()
            const in30 = new Date(Date.now() + 30 * 86400000)
            const in90 = new Date(Date.now() + 90 * 86400000)
            const urgent       = compliance.filter(r => r.expiry_date && r.status === 'active' && new Date(r.expiry_date) <= in30)
            const expiringSoon = compliance.filter(r => r.expiry_date && r.status === 'active' && new Date(r.expiry_date) > in30 && new Date(r.expiry_date) <= in90)
            return (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${v3.border.subtle}` }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.22em', fontFamily: v3.font.ui }}>State Compliance</span>
                  {compliance.length > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: v3.text.muted, fontFamily: 'monospace' }}>{compliance.length} states</span>}
                  <button onClick={() => setRegModal({})} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', background: 'rgba(196,164,110,0.07)', border: `1px solid rgba(196,164,110,0.25)`, borderRadius: v3.radius.sm, fontSize: '10px', fontWeight: 700, color: v3.amberLight, cursor: 'pointer', letterSpacing: '0.04em' }}>
                    <Plus size={10} />Add State
                  </button>
                </div>
                {urgent.length > 0 && (
                  <div style={{ background: `${v3.status.danger}10`, border: `1px solid ${v3.status.danger}28`, borderLeft: `3px solid ${v3.status.danger}`, borderRadius: v3.radius.sm, padding: '8px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={12} color={v3.status.danger} />
                    <span style={{ fontSize: '12px', color: v3.status.danger, fontWeight: 600 }}>{urgent.length} expiring within 30 days</span>
                  </div>
                )}
                {expiringSoon.length > 0 && (
                  <div style={{ background: `${v3.status.warning}10`, border: `1px solid ${v3.status.warning}28`, borderLeft: `3px solid ${v3.status.warning}`, borderRadius: v3.radius.sm, padding: '8px 12px', marginBottom: 8 }}>
                    <span style={{ fontSize: '12px', color: v3.status.warning, fontWeight: 600 }}>{expiringSoon.length} expiring in 30–90 days</span>
                  </div>
                )}
                {compliance.length === 0
                  ? <div style={{ color: v3.text.muted, fontSize: '13px' }}>No state registrations yet — <button onClick={() => setRegModal({})} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '13px', padding: 0, textDecoration: 'underline' }}>add one</button></div>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {compliance.map(r => {
                        const sc = REG_STATUS_COLOR[r.status] ?? v3.text.muted
                        const isExpiringSoon = r.expiry_date && r.status === 'active' && new Date(r.expiry_date) <= in90
                        const daysUntil = r.expiry_date ? Math.ceil((new Date(r.expiry_date).getTime() - now.getTime()) / 86400000) : null
                        return (
                          <div key={r.id} onClick={() => setRegModal({ reg: r })}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: v3.bg.surface, borderRadius: v3.radius.sm, border: `1px solid ${isExpiringSoon ? sc + '30' : v3.border.subtle}`, borderLeft: `2px solid ${sc}`, cursor: 'pointer', transition: 'background 80ms' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = v3.bg.elevated}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = v3.bg.surface}
                          >
                            <span style={{ fontSize: '13px', fontWeight: 900, color: v3.text.primary, fontFamily: 'monospace', width: 28, flexShrink: 0 }}>{r.state}</span>
                            <span style={{ flex: 1, fontSize: '9px', fontWeight: 700, color: sc, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{REG_STATUS_LABEL[r.status] ?? r.status}</span>
                            {r.expiry_date && (
                              <span style={{ fontSize: '10px', color: daysUntil !== null && daysUntil <= 30 ? v3.status.danger : daysUntil !== null && daysUntil <= 90 ? v3.status.warning : v3.text.muted, flexShrink: 0 }}>
                                {daysUntil !== null && daysUntil <= 90 ? `${daysUntil}d` : r.expiry_date.slice(0, 7)}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                }
              </div>
            )
          })()}
        </div>

        {/* RIGHT — Top Accounts + Field Activity */}
        <div style={{ overflowY: 'auto', height: '100%', paddingBottom: 20 }}>

          {/* Top Accounts */}
          {topAccounts.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <SectionLabel>
                {hasDollarData ? `Top Accounts · by $ ordered · all time` : `Top Accounts · by visits`}
              </SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                {topAccounts.map((a, idx) => {
                  const plStatus = placByAccount[a.id]
                  const plColor = plStatus ? PLAC_STATUS_COLOR[plStatus] : null
                  const acctTotal = (a as any).total ?? 0
                  const maxTotal = (topAccounts[0] as any).total ?? 1
                  const barPct = maxTotal > 0 ? (acctTotal / maxTotal) * 100 : 0
                  return (
                    <Link key={a.id} href={`/v3/territory/${a.id}`} style={{ textDecoration: 'none' }}>
                      <div className="v3-row-hover" style={{ padding: '8px 10px', background: v3.bg.surface, borderRadius: v3.radius.sm, border: `1px solid ${v3.border.subtle}`, transition: 'all 80ms' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = v3.bg.elevated}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = v3.bg.surface}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: v3.text.muted, fontFamily: 'monospace', width: 14, flexShrink: 0 }}>{idx + 1}</span>
                          {plColor
                            ? <div style={{ width: 5, height: 5, borderRadius: '50%', background: plColor, flexShrink: 0 }} />
                            : <div style={{ width: 5, height: 5, borderRadius: '50%', background: v3.border.default, flexShrink: 0 }} />
                          }
                          <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: v3.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                          {hasDollarData && acctTotal > 0 && (
                            <span style={{ fontSize: '12px', fontWeight: 700, color: v3.amberLight, fontFamily: 'monospace', flexShrink: 0 }}>{formatCurrency(acctTotal)}</span>
                          )}
                          {!hasDollarData && (
                            <span style={{ fontSize: '11px', color: v3.text.muted, fontFamily: 'monospace', flexShrink: 0 }}>{(a as any).count} visits</span>
                          )}
                        </div>
                        {hasDollarData && barPct > 0 && (
                          <div style={{ marginTop: 5, height: 2, borderRadius: 2, background: v3.border.subtle, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${barPct}%`, background: `linear-gradient(90deg, ${ac}40, ${ac})`, borderRadius: 2 }} />
                          </div>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Field Activity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: v3.font.ui }}>Field Activity</span>
            <div style={{ display: 'flex', gap: 2, marginLeft: 2 }}>
              {([
                { key: 'all',  label: `All (${visits.length})` },
                { key: 'hot',  label: `Hot (${hotLeads.length})` },
                { key: 'wins', label: `Wins (${winsCount})` },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setActFilter(f.key)} style={{
                  padding: '2px 8px', borderRadius: v3.radius.sm, border: `1px solid ${actFilter === f.key ? ac + '50' : 'transparent'}`,
                  background: actFilter === f.key ? ac + '12' : 'transparent',
                  fontSize: '10px', fontWeight: 700, color: actFilter === f.key ? ac : v3.text.muted,
                  cursor: 'pointer', fontFamily: v3.font.ui, transition: 'all 120ms',
                }}>{f.label}</button>
              ))}
            </div>
          </div>
          {vLoading
            ? <div style={{ color: v3.text.muted, fontSize: '13px' }}>Loading…</div>
            : filteredVisits.length === 0
            ? <div style={{ color: v3.text.muted, fontSize: '13px', padding: '12px 0' }}>
                {actFilter === 'hot' ? 'No hot leads right now.' : actFilter === 'wins' ? 'No wins logged yet.' : 'No visits logged for this brand.'}
              </div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {filteredVisits.map((v, i) => {
                  const sc = VISIT_STATUS_COLOR[v.status] ?? v3.text.muted
                  return (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < filteredVisits.length - 1 ? `1px solid ${v3.border.subtle}` : 'none' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, flexShrink: 0 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc, boxShadow: `0 0 4px ${sc}80` }} />
                        {i < filteredVisits.length - 1 && <div style={{ width: 1, height: 18, background: v3.border.subtle, marginTop: 3 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                          {v.accounts?.name && (
                            <Link href={`/v3/territory/${v.account_id}`} style={{ fontSize: '13px', fontWeight: 700, color: v3.text.primary, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.accounts.name}
                            </Link>
                          )}
                          <span style={{ fontSize: '10px', color: v3.text.muted, flexShrink: 0 }}>{relativeTimeStr(v.visited_at) ?? v.visited_at?.slice(0, 10)}</span>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: sc, marginTop: 1 }}>{v.status}</div>
                        {v.notes && <div style={{ fontSize: '12px', color: v3.text.secondary, marginTop: 2, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{v.notes}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showEditBrand && <EditBrandModal client={client} onClose={() => setShowEditBrand(false)} />}
      {regModal && client && (
        <RegistrationFormModal clientId={client.id} reg={regModal.reg} onClose={() => setRegModal(null)} />
      )}
    </div>
  )
}
