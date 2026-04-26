'use client'
import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, ChevronRight, Download } from 'lucide-react'
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
import { formatCurrency, formatShortDateMT, startOfMonthMT, resolveTotal } from '../lib/formatters'
import { clientLogoUrl } from '../lib/constants'
import type { Client } from '../lib/types'


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
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const twelveMonthsAgo = new Date(); twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    const safe = <T>(name: string, p: Promise<T>, fb: T): Promise<T> =>
      p.catch(e => { console.error(`finance/${name}:`, e); return fb })
    Promise.all([
      safe('clients', getClients(), []),
      safe('orders', getOrders(), []),
      safe('trend', getCommissionTrend(twelveMonthsAgo), []),
    ]).then(([cls, ords, trend]) => {
        setClients(cls)
        setOrders(ords.filter((o: any) => o.status === 'sent' || o.status === 'fulfilled'))

        const months: Record<string, { month: string; commission: number; revenue: number }> = {}
        for (let i = 11; i >= 0; i--) {
          const d = new Date()
          d.setMonth(d.getMonth() - i)
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

  const perClient = clients.map(c => {
    const clientOrders = monthOrders.filter(o => o.client_slug === c.slug)
    const commission = clientOrders.reduce((s: number, o: any) => s + resolveCommission(o), 0)
    const revenue = clientOrders.reduce((s: number, o: any) => s + resolveTotal(o), 0)
    const ytdComm = ytdOrders.filter((o: any) => o.client_slug === c.slug).reduce((s: number, o: any) => s + resolveCommission(o), 0)
    const ytdRev = ytdOrders.filter((o: any) => o.client_slug === c.slug).reduce((s: number, o: any) => s + resolveTotal(o), 0)
    return { ...c, commission, revenue, ytdCommission: ytdComm, ytdRevenue: ytdRev, orderCount: clientOrders.length }
  })

  const recentOrders = [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20)

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
    const a = document.createElement('a')
    a.href = url
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', gap: '12px' }}>
          <div>
            <h1 className="page-h1" style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Finance</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Commission and revenue tracking</p>
          </div>
          <button onClick={exportCSV} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px', fontSize: '13px',
            border: `1px solid ${t.border.default}`, backgroundColor: 'transparent',
            color: t.text.secondary, cursor: 'pointer', flexShrink: 0,
          }}>
            <Download size={14} /> Export CSV
          </button>
        </div>

        {loading ? <StatsSkeleton /> : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
            <StatCard label="Commission This Month" value={formatCurrency(thisMonthCommission)} icon={<DollarSign size={20} />} color={t.gold} />
            <StatCard label="Revenue This Month" value={formatCurrency(thisMonthRevenue)} icon={<TrendingUp size={20} />} color={t.status.success} />
            <StatCard label="Commission YTD" value={formatCurrency(ytdCommission)} icon={<DollarSign size={20} />} color={t.status.info} />
            <StatCard label="Revenue YTD" value={formatCurrency(ytdRevenue)} icon={<TrendingUp size={20} />} color={t.text.secondary} />
          </div>
        )}

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

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (perClient.length > 0 ? '1fr 1fr' : '1fr'), gap: '20px' }}>

          {perClient.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
                This Month by Brand
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {perClient.map((c, i) => (
                  <div key={c.slug} style={{
                    display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '14px',
                    padding: '14px 0',
                    borderBottom: i < perClient.length - 1 ? `1px solid ${t.border.subtle}` : 'none',
                    flexWrap: isMobile ? 'wrap' : 'nowrap',
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

          <div style={{ ...card, overflowX: isMobile ? 'auto' : 'visible' }}>
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
