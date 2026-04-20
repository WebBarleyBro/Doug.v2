'use client'
import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, ChevronRight } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import Link from 'next/link'
import LayoutShell from '../layout-shell'
import StatCard from '../components/StatCard'
import { StatsSkeleton } from '../components/LoadingSkeleton'
import { getOrders, getClients, getCommissionTrend } from '../lib/data'
import { t, card, badge } from '../lib/theme'
import { formatCurrency, formatShortDateMT, startOfMonthMT } from '../lib/formatters'
import { clientLogoUrl } from '../lib/constants'
import type { Client } from '../lib/types'

// Compute total from all possible column names (old CRM = "total", new = "total_amount")
function resolveTotal(o: any): number {
  const items: any[] = o.po_line_items || []
  if (items.length > 0) {
    const fromItems = items.reduce((sum, li) => {
      const lineTotal = Number(li.total || 0)
      if (lineTotal > 0) return sum + lineTotal
      const price = Number(li.unit_price || li.price || 0)
      const qty = Number(li.cases || 0) + Number(li.bottles || 0) + Number(li.quantity || 1) || 1
      return sum + price * qty
    }, 0)
    if (fromItems > 0) return fromItems
  }
  return Number(o.total_amount || (o as any).total || 0)
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

export default function FinancePage() {
  const [clients, setClients] = useState<Client[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [trendData, setTrendData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch both sent and fulfilled orders for full history
    Promise.all([getClients(), getOrders(), getCommissionTrend(12)])
      .then(([cls, ords, trend]) => {
        setClients(cls)
        // Only count sent/fulfilled for financials
        setOrders(ords.filter((o: any) => o.status === 'sent' || o.status === 'fulfilled'))

        // 12-month commission + revenue chart
        const months: Record<string, { month: string; commission: number; revenue: number }> = {}
        for (let i = 11; i >= 0; i--) {
          const d = new Date()
          d.setMonth(d.getMonth() - i)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          months[key] = { month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), commission: 0, revenue: 0 }
        }
        const rateMapTrend = Object.fromEntries(cls.map((c: any) => [c.slug, c.commission_rate || 0]))
        trend.forEach((o: any) => {
          const key = o.created_at.slice(0, 7)
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

  // Build rate map for commission fallback (old orders may have commission_amount = 0)
  const rateMap = Object.fromEntries(clients.map(c => [c.slug, c.commission_rate || 0]))
  function resolveCommission(o: any): number {
    const stored = Number(o.commission_amount) || 0
    if (stored > 0) return stored
    return resolveTotal(o) * (rateMap[o.client_slug] || 0)
  }

  const monthStart = startOfMonthMT()
  const monthOrders = orders.filter(o => o.created_at >= monthStart)
  const thisMonthCommission = monthOrders.reduce((s, o) => s + resolveCommission(o), 0)
  const thisMonthRevenue = monthOrders.reduce((s, o) => s + resolveTotal(o), 0)
  const ytdStart = new Date(new Date().getFullYear(), 0, 1).toISOString()
  const ytdOrders = orders.filter(o => o.created_at >= ytdStart)
  const ytdCommission = ytdOrders.reduce((s, o) => s + resolveCommission(o), 0)
  const ytdRevenue = ytdOrders.reduce((s, o) => s + resolveTotal(o), 0)

  // Per-client breakdown — show all active clients
  const perClient = clients.map(c => {
    const clientOrders = monthOrders.filter(o => o.client_slug === c.slug)
    const commission = clientOrders.reduce((s, o) => s + resolveCommission(o), 0)
    const revenue = clientOrders.reduce((s, o) => s + resolveTotal(o), 0)
    const ytdComm = ytdOrders.filter(o => o.client_slug === c.slug).reduce((s, o) => s + resolveCommission(o), 0)
    const ytdRev = ytdOrders.filter(o => o.client_slug === c.slug).reduce((s, o) => s + resolveTotal(o), 0)
    return { ...c, commission, revenue, ytdCommission: ytdComm, ytdRevenue: ytdRev, orderCount: clientOrders.length }
  })

  const recentOrders = [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20)

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Finance</h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Commission and revenue tracking</p>
        </div>

        {/* Stats */}
        {loading ? <StatsSkeleton /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
            <StatCard label="Commission This Month" value={formatCurrency(thisMonthCommission)} icon={<DollarSign size={20} />} color={t.gold} />
            <StatCard label="Revenue This Month" value={formatCurrency(thisMonthRevenue)} icon={<TrendingUp size={20} />} color={t.status.success} />
            <StatCard label="Commission YTD" value={formatCurrency(ytdCommission)} icon={<DollarSign size={20} />} color={t.status.info} />
            <StatCard label="Revenue YTD" value={formatCurrency(ytdRevenue)} icon={<TrendingUp size={20} />} color={t.text.secondary} />
          </div>
        )}

        {/* Chart */}
        <div style={{ ...card, marginBottom: '20px', padding: '22px 24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '18px' }}>
            Commission — Last 12 Months
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={t.border.subtle} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: t.text.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: t.text.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="commission" name="Commission" fill={t.gold} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: perClient.length > 0 ? '1fr 1fr' : '1fr', gap: '20px' }}>

          {/* Per-client breakdown */}
          {perClient.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
                This Month by Brand
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {perClient.map((c, i) => (
                  <div key={c.slug} style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '14px 0',
                    borderBottom: i < perClient.length - 1 ? `1px solid ${t.border.subtle}` : 'none',
                  }}>
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
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="mono" style={{ fontSize: '14px', fontWeight: '700', color: t.text.primary }}>{formatCurrency(c.commission)}</div>
                      <div style={{ fontSize: '11px', color: t.text.muted }}>of {formatCurrency(c.revenue)}</div>
                    </div>
                    <div style={{ width: 60, height: 4, backgroundColor: t.border.default, borderRadius: 2, flexShrink: 0 }}>
                      <div style={{
                        width: `${ytdCommission > 0 ? Math.min(100, (c.ytdCommission / ytdCommission) * 100) : 0}%`,
                        height: '100%', backgroundColor: c.color, borderRadius: 2,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent orders */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Recent Orders
              </div>
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
                    <div key={o.id} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 0',
                      borderBottom: i < recentOrders.length - 1 ? `1px solid ${t.border.subtle}` : 'none',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: client?.color || t.gold, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mono" style={{ fontSize: '12px', fontWeight: '600', color: t.text.primary }}>{o.po_number}</div>
                        <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '1px' }}>
                          {o.deliver_to_name} · {formatShortDateMT(o.created_at)}
                        </div>
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
    </LayoutShell>
  )
}
