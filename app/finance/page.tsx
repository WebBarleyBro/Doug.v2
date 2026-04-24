'use client'
import { useState, useEffect, useCallback } from 'react'
import { DollarSign, TrendingUp, ChevronRight, Download, Receipt, Plus, X, AlertCircle, Check, Loader } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import Link from 'next/link'
import LayoutShell from '../layout-shell'
import StatCard from '../components/StatCard'
import { StatsSkeleton } from '../components/LoadingSkeleton'
import { getOrders, getClients, getCommissionTrend } from '../lib/data'
import { getSupabase } from '../lib/supabase'
import { t, card, badge, inputStyle, labelStyle, selectStyle } from '../lib/theme'
import { formatCurrency, formatShortDateMT, startOfMonthMT, resolveTotal } from '../lib/formatters'
import { clientLogoUrl } from '../lib/constants'
import type { Client, ClientInvoice } from '../lib/types'

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: t.text.muted,
  sent: t.status.info,
  paid: t.status.success,
  void: t.text.muted,
  overdue: t.status.danger,
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '8px', padding: '10px 14px' }}>
      <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '4px' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="mono" style={{ fontSize: '13px', color: p.color, fontWeight: '600' }}>
          {p.name}: {formatCurrency(p.value)}
        </div>
      ))}
    </div>
  )
}

const DEFAULT_FORM = {
  client_slug: '', period_month: '', retainer_amount: '', commission_amount: '',
  due_date: '', admin_notes: '',
}

export default function FinancePage() {
  const [clients, setClients] = useState<Client[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [trendData, setTrendData] = useState<any[]>([])
  const [invoices, setInvoices] = useState<ClientInvoice[]>([])
  const [depletions, setDepletions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [invoicesLoading, setInvoicesLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [markingSentId, setMarkingSentId] = useState<string | null>(null)
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const twelveMonthsAgo = new Date(); twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    Promise.all([getClients(), getOrders(), getCommissionTrend(twelveMonthsAgo)])
      .then(([cls, ords, trend]) => {
        setClients(cls)
        setOrders(ords.filter((o: any) => o.status === 'sent' || o.status === 'fulfilled'))
        const months: Record<string, { month: string; commission: number; revenue: number }> = {}
        for (let i = 11; i >= 0; i--) {
          const d = new Date(); d.setMonth(d.getMonth() - i)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          months[key] = { month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), commission: 0, revenue: 0 }
        }
        const rateMapTrend = Object.fromEntries(cls.map((c: any) => [c.slug, c.commission_rate || 0]))
        trend.forEach((o: any) => {
          const key = (o.sent_at || o.created_at).slice(0, 7)
          if (months[key]) {
            const stored = Number(o.commission_amount) || 0
            const rev = Number(o.total_amount) || resolveTotal(o)
            months[key].commission += stored > 0 ? stored : rev * (rateMapTrend[o.client_slug] || 0)
            months[key].revenue += rev
          }
        })
        setTrendData(Object.values(months))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true)
    try {
      const { data: { session } } = await getSupabase().auth.getSession()
      const token = session?.access_token
      const [invRes, depRes] = await Promise.all([
        fetch('/api/billing/invoices', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/billing/depletions', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (invRes.ok) setInvoices(await invRes.json())
      if (depRes.ok) setDepletions(await depRes.json())
    } catch { /* non-fatal */ }
    finally { setInvoicesLoading(false) }
  }, [])

  useEffect(() => { loadInvoices() }, [loadInvoices])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function getToken() {
    const { data: { session } } = await getSupabase().auth.getSession()
    return session?.access_token
  }

  // Auto-fill retainer when client changes
  function handleClientChange(slug: string) {
    const client = clients.find(c => c.slug === slug)
    setForm(f => ({
      ...f,
      client_slug: slug,
      retainer_amount: client?.monthly_retainer_fee ? String(client.monthly_retainer_fee) : f.retainer_amount,
    }))
  }

  // Auto-fill commission from pending depletions for selected client + prior month
  useEffect(() => {
    if (!form.client_slug || !form.period_month) return
    // Commission from depletions comes from the PREVIOUS month's depletions
    const [y, m] = form.period_month.split('-').map(Number)
    const prevDate = new Date(y, m - 2, 1)
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    const client = clients.find(c => c.slug === form.client_slug)
    const rate = client?.commission_rate || 0
    const pending = depletions.filter(d => d.client_slug === form.client_slug && d.period_month === prevMonth && !d.invoice_id)
    const commissionTotal = pending.reduce((s: number, d: any) => s + (Number(d.sale_value) || 0), 0) * rate
    if (commissionTotal > 0) {
      setForm(f => ({ ...f, commission_amount: commissionTotal.toFixed(2) }))
    }
  }, [form.client_slug, form.period_month, depletions, clients])

  async function handleCreateInvoice() {
    if (!form.client_slug || !form.period_month) return
    setSaving(true); setErr('')
    try {
      const token = await getToken()
      const res = await fetch('/api/billing/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          client_slug: form.client_slug,
          period_month: form.period_month,
          retainer_amount: Number(form.retainer_amount) || 0,
          commission_amount: Number(form.commission_amount) || 0,
          due_date: form.due_date || null,
          admin_notes: form.admin_notes || null,
          line_items: [
            ...(Number(form.retainer_amount) > 0 ? [{ description: `Monthly retainer — ${form.period_month}`, amount: Number(form.retainer_amount), type: 'retainer' }] : []),
            ...(Number(form.commission_amount) > 0 ? [{ description: `Commission earned — prev. month depletions`, amount: Number(form.commission_amount), type: 'commission' }] : []),
          ],
        }),
      })
      let json: any = {}
      try { json = await res.json() } catch { /* response wasn't JSON */ }
      if (!res.ok) { setErr(json.error || `Server error (${res.status})`); return }
      setShowCreate(false)
      setForm(DEFAULT_FORM)
      await loadInvoices()
      showToast('Invoice created')
    } catch (e: any) { setErr(e?.message || 'Network error') }
    finally { setSaving(false) }
  }

  async function handleMarkSent(id: string) {
    setMarkingSentId(id); setErr('')
    try {
      const token = await getToken()
      const res = await fetch(`/api/billing/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'sent' }),
      })
      let json: any = {}
      try { json = await res.json() } catch { /* response wasn't JSON */ }
      if (!res.ok) { setErr(json.error || `Server error (${res.status})`); return }
      await loadInvoices()
      showToast('Invoice marked as sent')
    } catch (e: any) { setErr(e?.message || 'Network error') }
    finally { setMarkingSentId(null) }
  }

  async function handleVoidInvoice(id: string) {
    if (!confirm('Void this invoice? This cannot be undone.')) return
    setVoidingId(id)
    try {
      const token = await getToken()
      await fetch(`/api/billing/invoices/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      await loadInvoices()
      showToast('Invoice voided')
    } catch { /* non-fatal */ }
    finally { setVoidingId(null) }
  }

  const rateMap = Object.fromEntries(clients.map(c => [c.slug, c.commission_rate || 0]))
  function resolveCommission(o: any): number {
    const stored = Number(o.commission_amount) || 0
    if (stored > 0) return stored
    return resolveTotal(o) * (rateMap[o.client_slug] || 0)
  }

  const monthStart = startOfMonthMT()
  const effectiveDate = (o: any) => o.sent_at || o.created_at
  const monthOrders = orders.filter(o => effectiveDate(o) >= monthStart)
  const thisMonthCommission = monthOrders.reduce((s, o) => s + resolveCommission(o), 0)
  const thisMonthRevenue = monthOrders.reduce((s, o) => s + resolveTotal(o), 0)
  const mtYear = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }).slice(0, 4)
  const ytdStart = `${mtYear}-01-01`
  const ytdOrders = orders.filter(o => effectiveDate(o) >= ytdStart)
  const ytdCommission = ytdOrders.reduce((s, o) => s + resolveCommission(o), 0)
  const ytdRevenue = ytdOrders.reduce((s, o) => s + resolveTotal(o), 0)
  const retainerMRR = clients.reduce((s, c) => s + (c.monthly_retainer_fee || 0), 0)

  const perClient = clients.map(c => {
    const clientOrders = monthOrders.filter(o => o.client_slug === c.slug)
    const commission = clientOrders.reduce((s: number, o: any) => s + resolveCommission(o), 0)
    const revenue = clientOrders.reduce((s: number, o: any) => s + resolveTotal(o), 0)
    const ytdComm = ytdOrders.filter((o: any) => o.client_slug === c.slug).reduce((s: number, o: any) => s + resolveCommission(o), 0)
    const ytdRev = ytdOrders.filter((o: any) => o.client_slug === c.slug).reduce((s: number, o: any) => s + resolveTotal(o), 0)
    return { ...c, commission, revenue, ytdCommission: ytdComm, ytdRevenue: ytdRev, orderCount: clientOrders.length }
  })

  const recentOrders = [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20)

  const draftInvoices = invoices.filter(i => i.status === 'draft')
  const activeInvoices = invoices.filter(i => i.status !== 'void')
  const overdueInvoices = invoices.filter(i => i.status === 'overdue')

  const currentMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }).slice(0, 7)

  function exportCSV() {
    const rows = [
      ['PO Number', 'Date', 'Client', 'Deliver To', 'Revenue', 'Commission', 'Status'],
      ...orders.map(o => [
        o.po_number || '',
        (o.created_at || '').slice(0, 10),
        clients.find(c => c.slug === o.client_slug)?.name || o.client_slug || '',
        o.deliver_to_name || '',
        resolveTotal(o).toFixed(2),
        resolveCommission(o).toFixed(2),
        o.status || '',
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '10px', padding: '10px 18px', fontSize: '13px', color: t.text.primary, zIndex: 9999, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            <Check size={14} color={t.status.success} /> {toast}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', gap: '12px' }}>
          <div>
            <h1 className="page-h1" style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Finance</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Commission, revenue, and client billing</p>
          </div>
          <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.secondary, cursor: 'pointer', flexShrink: 0 }}>
            <Download size={14} /> Export CSV
          </button>
        </div>

        {/* Stats */}
        {loading ? <StatsSkeleton /> : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: '12px', marginBottom: '28px' }}>
            <StatCard label="Commission This Month" value={formatCurrency(thisMonthCommission)} icon={<DollarSign size={20} />} color={t.gold} />
            <StatCard label="Revenue This Month" value={formatCurrency(thisMonthRevenue)} icon={<TrendingUp size={20} />} color={t.status.success} />
            <StatCard label="Commission YTD" value={formatCurrency(ytdCommission)} icon={<DollarSign size={20} />} color={t.status.info} />
            <StatCard label="Revenue YTD" value={formatCurrency(ytdRevenue)} icon={<TrendingUp size={20} />} color={t.text.secondary} />
            <StatCard label="Retainer MRR" value={formatCurrency(retainerMRR)} icon={<Receipt size={20} />} color={t.status.warning} />
          </div>
        )}

        {/* Overdue alert */}
        {overdueInvoices.length > 0 && (
          <div style={{ ...card, padding: '14px 18px', marginBottom: '20px', border: `1px solid ${t.status.danger}44`, backgroundColor: t.status.danger + '10', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={16} color={t.status.danger} />
            <span style={{ fontSize: '13px', color: t.status.danger, fontWeight: '600' }}>
              {overdueInvoices.length} invoice{overdueInvoices.length > 1 ? 's are' : ' is'} overdue — {overdueInvoices.map(i => clients.find(c => c.slug === i.client_slug)?.name || i.client_slug).join(', ')}
            </span>
          </div>
        )}

        {/* Chart */}
        <div style={{ ...card, marginBottom: '20px', padding: isMobile ? '16px' : '22px 24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '18px' }}>
            Commission — Last 12 Months
          </div>
          <ResponsiveContainer width="100%" height={isMobile ? 160 : 200}>
            <BarChart data={trendData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={t.border.subtle} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: t.text.muted, fontSize: isMobile ? 9 : 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: t.text.muted, fontSize: isMobile ? 9 : 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="commission" name="Commission" fill={t.gold} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Billing / Invoices */}
        <div style={{ ...card, marginBottom: '20px', padding: isMobile ? '16px' : '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Client Invoices
              {draftInvoices.length > 0 && <span style={{ marginLeft: '8px', fontSize: '10px', backgroundColor: t.status.warning + '30', color: t.status.warning, borderRadius: '6px', padding: '2px 6px', fontWeight: '700' }}>{draftInvoices.length} need review</span>}
            </div>
            <button onClick={() => { setForm({ ...DEFAULT_FORM, period_month: currentMonth }); setErr(''); setShowCreate(true) }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', backgroundColor: t.gold, color: '#0c0c0a', border: 'none', cursor: 'pointer' }}>
              <Plus size={13} /> New Invoice
            </button>
          </div>

          {err && <div style={{ fontSize: '12px', color: t.status.danger, marginBottom: '12px', padding: '8px 12px', backgroundColor: t.status.danger + '15', borderRadius: '8px' }}>{err}</div>}

          {invoicesLoading ? (
            <div style={{ fontSize: '13px', color: t.text.muted, padding: '12px 0' }}>Loading invoices…</div>
          ) : activeInvoices.length === 0 ? (
            <div style={{ fontSize: '13px', color: t.text.muted, padding: '12px 0' }}>No invoices yet. Create one to start billing clients.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {activeInvoices.map((inv) => {
                const cl = clients.find(c => c.slug === inv.client_slug)
                const total = (inv.retainer_amount || 0) + (inv.commission_amount || 0)
                const isMarkingSent = markingSentId === inv.id
                const isVoiding = voidingId === inv.id
                return (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: `1px solid ${t.border.subtle}`, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: INVOICE_STATUS_COLORS[inv.status] || t.text.muted, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>
                        {cl?.name || inv.client_slug}
                        <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: '400', color: t.text.muted }}>{inv.period_month}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>
                        {inv.retainer_amount > 0 && `Retainer ${formatCurrency(inv.retainer_amount)}`}
                        {inv.retainer_amount > 0 && inv.commission_amount > 0 && ' + '}
                        {inv.commission_amount > 0 && `Commission ${formatCurrency(inv.commission_amount)}`}
                        {inv.due_date && ` · Due ${formatShortDateMT(inv.due_date)}`}
                      </div>
                    </div>
                    <div className="mono" style={{ fontSize: '14px', fontWeight: '700', color: t.text.primary, flexShrink: 0 }}>{formatCurrency(total)}</div>
                    <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', padding: '2px 7px', borderRadius: '6px', backgroundColor: INVOICE_STATUS_COLORS[inv.status] + '20', color: INVOICE_STATUS_COLORS[inv.status], flexShrink: 0 }}>{inv.status}</span>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      {inv.status === 'draft' && (
                        <button onClick={() => handleMarkSent(inv.id)} disabled={isMarkingSent} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: '600', backgroundColor: t.status.info + '20', color: t.status.info, border: `1px solid ${t.status.info}44`, cursor: 'pointer', opacity: isMarkingSent ? 0.6 : 1 }}>
                          {isMarkingSent ? <Loader size={11} /> : null} Mark Sent
                        </button>
                      )}
                      {(inv.status === 'draft' || inv.status === 'sent') && (
                        <button onClick={() => handleVoidInvoice(inv.id)} disabled={isVoiding} style={{ padding: '5px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: '600', backgroundColor: 'transparent', color: t.text.muted, border: `1px solid ${t.border.default}`, cursor: 'pointer', opacity: isVoiding ? 0.6 : 1 }}>
                          {isVoiding ? <Loader size={11} /> : <X size={11} />}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (perClient.length > 0 ? '1fr 1fr' : '1fr'), gap: '20px' }}>

          {/* Per-client breakdown */}
          {perClient.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
                This Month by Brand
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {perClient.map((c, i) => (
                  <div key={c.slug} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '14px', padding: '14px 0', borderBottom: i < perClient.length - 1 ? `1px solid ${t.border.subtle}` : 'none', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                    {(() => {
                      const logo = clientLogoUrl(c)
                      return logo ? (
                        <img src={logo} alt={c.name} style={{ width: '32px', height: '32px', objectFit: 'contain', flexShrink: 0, borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.04)' }} />
                      ) : (
                        <div style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: `${c.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: c.color }}>{c.name[0]}</span>
                        </div>
                      )
                    })()}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>
                        {c.orderCount} order{c.orderCount !== 1 ? 's' : ''} · {(c.commission_rate * 100).toFixed(0)}% rate
                        {(c.monthly_retainer_fee ?? 0) > 0 && ` · ${formatCurrency(c.monthly_retainer_fee!)} retainer`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="mono" style={{ fontSize: '14px', fontWeight: '700', color: t.text.primary }}>{formatCurrency(c.commission)}</div>
                      <div style={{ fontSize: '11px', color: t.text.muted }}>of {formatCurrency(c.revenue)}</div>
                    </div>
                    <div style={{ width: 60, height: 4, backgroundColor: t.border.default, borderRadius: 2, flexShrink: 0 }}>
                      <div style={{ width: `${ytdCommission > 0 ? Math.min(100, (c.ytdCommission / ytdCommission) * 100) : 0}%`, height: '100%', backgroundColor: c.color, borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent orders */}
          <div style={{ ...card, overflowX: isMobile ? 'auto' : 'visible' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent Orders</div>
              <Link href="/orders" style={{ fontSize: '12px', color: t.text.muted, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
                All <ChevronRight size={12} />
              </Link>
            </div>
            {recentOrders.length === 0 ? (
              <div style={{ fontSize: '13px', color: t.text.muted }}>No orders yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recentOrders.map((o, i) => {
                  const client = clients.find(c => c.slug === o.client_slug)
                  const total = resolveTotal(o)
                  return (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: i < recentOrders.length - 1 ? `1px solid ${t.border.subtle}` : 'none' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: client?.color || t.gold, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mono" style={{ fontSize: '12px', fontWeight: '600', color: t.text.primary }}>{o.po_number}</div>
                        <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '1px' }}>{o.deliver_to_name} · {formatShortDateMT(o.created_at)}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div className="mono" style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{formatCurrency(total)}</div>
                        <span style={badge.orderStatus(o.status)}>{o.status}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Invoice Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary }}>New Invoice</h3>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {err && <div style={{ fontSize: '12px', color: t.status.danger, marginBottom: '12px', padding: '8px 12px', backgroundColor: t.status.danger + '15', borderRadius: '8px' }}>{err}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Client</label>
                <select value={form.client_slug} onChange={e => handleClientChange(e.target.value)} style={selectStyle}>
                  <option value="">Select client…</option>
                  {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Billing Month</label>
                <input type="month" value={form.period_month} onChange={e => setForm(f => ({ ...f, period_month: e.target.value }))} style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Retainer ($)</label>
                  <input type="number" min="0" step="0.01" value={form.retainer_amount} onChange={e => setForm(f => ({ ...f, retainer_amount: e.target.value }))} placeholder="0.00" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Commission ($)</label>
                  <input type="number" min="0" step="0.01" value={form.commission_amount} onChange={e => setForm(f => ({ ...f, commission_amount: e.target.value }))} placeholder="Auto-fills from depletions" style={inputStyle} />
                </div>
              </div>

              {form.commission_amount && Number(form.commission_amount) > 0 && (
                <div style={{ fontSize: '11px', color: t.status.info, backgroundColor: t.status.info + '15', borderRadius: '8px', padding: '8px 12px' }}>
                  Commission auto-calculated from prior month depletions. Edit the amount above if needed.
                </div>
              )}

              <div>
                <label style={labelStyle}>Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Admin Notes (optional)</label>
                <textarea value={form.admin_notes} onChange={e => setForm(f => ({ ...f, admin_notes: e.target.value }))} rows={2} placeholder="Internal notes…" style={{ ...inputStyle, resize: 'none' }} />
              </div>

              <div style={{ borderTop: `1px solid ${t.border.subtle}`, paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '700', color: t.text.primary }}>
                  <span>Total</span>
                  <span className="mono">{formatCurrency((Number(form.retainer_amount) || 0) + (Number(form.commission_amount) || 0))}</span>
                </div>
                <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '4px' }}>Invoice will be saved as a draft for your review before sending.</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', backgroundColor: 'transparent', color: t.text.secondary, border: `1px solid ${t.border.default}`, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreateInvoice} disabled={saving || !form.client_slug || !form.period_month} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', backgroundColor: t.gold, color: '#0c0c0a', border: 'none', cursor: 'pointer', opacity: saving || !form.client_slug || !form.period_month ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </LayoutShell>
  )
}
