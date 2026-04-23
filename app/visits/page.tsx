'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MapPin, ChevronLeft } from 'lucide-react'
import LayoutShell from '../layout-shell'
import { getVisits } from '../lib/data'
import { getSupabase } from '../lib/supabase'
import { t, card, badge } from '../lib/theme'
import { formatShortDateMT, nDaysAgoMT, todayMT } from '../lib/formatters'
import type { UserProfile } from '../lib/types'

export default function VisitsPage() {
  const [visits, setVisits] = useState<any[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'today' | '7d' | '30d' | 'all'>('7d')
  const [repFilter, setRepFilter] = useState<string>('all')
  const [reps, setReps] = useState<any[]>([])

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: p } = await sb.from('user_profiles').select('*').eq('id', user.id).single()
      if (p) {
        setProfile(p)
        // Load reps for owner filter
        if (p.role === 'owner' || p.role === 'admin') {
          sb.from('user_profiles').select('id, name').in('role', ['owner', 'rep', 'admin']).then(({ data }) => setReps(data || []))
        }
      }
    })
  }, [])

  useEffect(() => {
    if (!profile) return
    const since = filter === 'today' ? todayMT() : filter === '7d' ? nDaysAgoMT(7) : filter === '30d' ? nDaysAgoMT(30) : nDaysAgoMT(365)
    const isOwner = profile.role === 'owner' || profile.role === 'admin'
    getVisits({
      since,
      userId: (!isOwner || repFilter !== 'all') ? (repFilter !== 'all' ? repFilter : profile.id) : undefined,
      limit: 300,
    }).then(vs => {
      // Dedup by date + user
      const seen = new Set<string>()
      const deduped = vs.filter((v: any) => {
        const key = `${String(v.visited_at).slice(0, 10)}|${v.user_id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setVisits(deduped)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [profile, filter, repFilter])

  const isOwner = profile?.role === 'owner' || profile?.role === 'admin'

  // Group by date
  const byDate: Record<string, any[]> = {}
  visits.forEach(v => {
    const day = String(v.visited_at).slice(0, 10)
    if (!byDate[day]) byDate[day] = []
    byDate[day].push(v)
  })
  const sortedDays = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: t.text.muted, textDecoration: 'none', fontSize: '13px', marginBottom: '20px' }}>
          <ChevronLeft size={16} /> Dashboard
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Visit Log</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>
              {loading ? 'Loading...' : `${visits.length} visit${visits.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {isOwner && reps.length > 0 && (
              <select value={repFilter} onChange={e => setRepFilter(e.target.value)}
                style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '8px', padding: '7px 10px', color: t.text.secondary, fontSize: '12px', outline: 'none' }}>
                <option value="all">All reps</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            {(['today', '7d', '30d', 'all'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '7px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                border: `1px solid ${filter === f ? t.gold : t.border.default}`,
                backgroundColor: filter === f ? t.goldDim : 'transparent',
                color: filter === f ? t.gold : t.text.secondary,
                fontWeight: filter === f ? '600' : '400',
              }}>
                {f === 'today' ? 'Today' : f === '7d' ? 'Last 7 days' : f === '30d' ? 'Last 30 days' : 'All time'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ color: t.text.muted, fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading visits...</div>
        ) : sortedDays.length === 0 ? (
          <div style={{ color: t.text.muted, fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>No visits in this period</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {sortedDays.map(day => (
              <div key={day}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                  {new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  <span style={{ marginLeft: '8px', fontWeight: '400' }}>· {byDate[day].length} visit{byDate[day].length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {byDate[day].map((v: any) => (
                    <Link key={v.id} href={v.account_id ? `/accounts/${v.account_id}` : '#'} style={{ textDecoration: 'none' }}>
                      <div style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px', borderLeft: `3px solid ${t.gold}`, cursor: 'pointer' }}>
                        <MapPin size={14} color={t.gold} style={{ marginTop: '2px', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{v.accounts?.name || 'Unknown account'}</span>
                            <span style={badge.visitStatus(v.status)}>{v.status}</span>
                          </div>
                          {v.notes && <div style={{ fontSize: '12px', color: t.text.secondary, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.notes}</div>}
                          {v.accounts?.address && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>{v.accounts.address}</div>}
                        </div>
                        {(isOwner || v.user_profiles?.name) && (
                          <div style={{ fontSize: '11px', color: t.text.muted, flexShrink: 0 }}>{v.user_profiles?.name || ''}</div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
