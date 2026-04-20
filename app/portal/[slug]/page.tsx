'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '../../lib/supabase'
import { getPortalData } from '../../lib/data'
import { t, card, badge } from '../../lib/theme'
import { formatShortDateMT, relativeTimeStr, startOfMonthMT, formatCurrency } from '../../lib/formatters'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { MapPin, Package, ShoppingCart, Calendar, LogOut } from 'lucide-react'

export default function ClientPortalPage() {
  const { slug } = useParams() as { slug: string }
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setError('Not authorized'); return }
      const profile = await sb.from('user_profiles').select('*').eq('id', user.id).single()
      if (profile.data?.role !== 'portal' && profile.data?.role !== 'owner') {
        setError('Access denied'); return
      }
      try {
        const d = await getPortalData(slug)
        setData(d)
      } catch (e) { setError('Failed to load data') }
      finally { setLoading(false) }
    })
  }, [slug])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '12px', background: `linear-gradient(135deg, ${t.gold} 0%, #b8891e 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '800', color: '#0f0f0d', margin: '0 auto 12px' }}>D</div>
          <div style={{ color: t.text.muted, fontSize: '13px' }}>Loading your dashboard...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: t.status.danger }}>{error}</div>
      </div>
    )
  }

  const { client, visits, placements, orders, events } = data
  const monthStart = startOfMonthMT()
  const monthVisits = visits.filter((v: any) => v.visited_at >= monthStart).length
  const monthOrders = orders.length
  const monthRevenue = orders.reduce((s: number, o: any) => s + (o.total_amount || 0), 0)
  const activePlacements = placements.filter((p: any) => p.status !== 'lost')

  return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, color: t.text.primary, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
      {/* Header */}
      <header style={{ backgroundColor: t.bg.sidebar, borderBottom: `1px solid ${t.border.default}`, padding: '0 32px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 32, height: 32, borderRadius: '8px', background: `linear-gradient(135deg, ${t.gold} 0%, #b8891e 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: '#0f0f0d' }}>D</div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>Doug Portal</div>
            <div style={{ fontSize: '11px', color: t.text.muted }}>Powered by Barley Bros</div>
          </div>
        </div>
        {client && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: client.color || t.gold }} />
            <span style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{client.name}</span>
          </div>
        )}
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Welcome */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em', marginBottom: '4px' }}>
            {client?.name} — Brand Portal
          </h1>
          <p style={{ fontSize: '14px', color: t.text.muted }}>
            Live activity data from the Barley Bros team · Updated in real-time
          </p>
        </div>

        {/* This month at a glance */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
          {[
            { label: 'Visits This Month', value: monthVisits, icon: <MapPin size={20} />, color: t.gold },
            { label: 'Active Placements', value: activePlacements.length, icon: <Package size={20} />, color: t.status.success },
            { label: 'Orders This Month', value: monthOrders, icon: <ShoppingCart size={20} />, color: t.status.info },
            { label: 'Revenue This Month', value: formatCurrency(monthRevenue), icon: <Calendar size={20} />, color: t.status.warning },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '11px', color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{s.label}</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>{s.value}</div>
                </div>
                <div style={{ color: s.color, opacity: 0.7 }}>{s.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Activity feed + placements */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Recent Activity */}
          <div style={card}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary, marginBottom: '16px' }}>Recent Activity</h3>
            {visits.length === 0 ? (
              <div style={{ fontSize: '13px', color: t.text.muted }}>No recent activity</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {visits.slice(0, 10).map((v: any, i: number) => (
                  <div key={v.id} style={{ padding: '10px 0', borderBottom: i < Math.min(visits.length, 10) - 1 ? `1px solid ${t.border.subtle}` : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: t.text.primary }}>{v.accounts?.name}</div>
                        <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{v.accounts?.address}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                        <span style={badge.visitStatus(v.status)}>{v.status}</span>
                        <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '3px' }}>{relativeTimeStr(v.visited_at)}</div>
                      </div>
                    </div>
                    {v.notes && <p style={{ fontSize: '12px', color: t.text.secondary, marginTop: '4px', lineHeight: 1.4 }}>{v.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Placements */}
          <div style={card}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary, marginBottom: '16px' }}>Active Placements ({activePlacements.length})</h3>
            {activePlacements.length === 0 ? (
              <div style={{ fontSize: '13px', color: t.text.muted }}>No active placements</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {activePlacements.slice(0, 10).map((p: any, i: number) => (
                  <div key={p.id} style={{ padding: '10px 0', borderBottom: i < Math.min(activePlacements.length, 10) - 1 ? `1px solid ${t.border.subtle}` : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: t.text.primary }}>{p.product_name}</div>
                        <div style={{ fontSize: '11px', color: t.text.muted }}>{p.accounts?.name} · {p.placement_type}</div>
                      </div>
                      <span style={badge.placementStatus(p.status)}>{p.status.replace('_', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: '24px', padding: '16px 0', borderTop: `1px solid ${t.border.default}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12px', color: t.text.muted }}>
            Powered by Doug · Barley Bros spirits rep agency · Fort Collins, CO
          </div>
          <button onClick={() => getSupabase().auth.signOut().then(() => window.location.href = '/login')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', fontSize: '12px' }}>
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </main>
    </div>
  )
}
