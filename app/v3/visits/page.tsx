'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ChevronRight, Filter, Download } from 'lucide-react'
import { v3, WIN_STATUSES } from '../lib/theme'
import { useV3Clients, useV3Profile, useV3AllProfiles } from '../lib/query'
import { getSupabase } from '../../lib/supabase'

const PERIODS = [
  { label: 'Today',  days: 0 },
  { label: '7D',     days: 7 },
  { label: '30D',    days: 30 },
  { label: '90D',    days: 90 },
  { label: 'All',    days: -1 },
]

const STATUS_COLORS: Record<string, string> = {
  'New Placement':    '#3a9e74',
  'Menu Feature Won': '#3a9e74',
  'Just Ordered':     '#3a9e74',
  'Will Order Soon':  '#b87840',
  'Needs Follow Up':  '#b85c5c',
  'Not Interested':   'rgba(255,255,255,0.22)',
  'General Check-In': 'rgba(255,255,255,0.35)',
  'Tasted':           '#c4a46e',
}

function useVisitsLog(days: number, clientSlug: string, status: string, repUserId: string) {
  return useQuery({
    queryKey: ['v3', 'visits', 'log', days, clientSlug, status, repUserId],
    queryFn: async () => {
      const sb = getSupabase()
      let q = sb
        .from('visits')
        .select('id, account_id, user_id, client_slug, visited_at, status, notes, accounts(id, name, account_type), user_profiles(id, name, full_name)')
        .order('visited_at', { ascending: false })
        .limit(1000)

      if (days === 0) {
        const now = new Date()
        const mtDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
        q = q.gte('visited_at', mtDate + 'T00:00:00-07:00').lt('visited_at', mtDate + 'T23:59:59-06:00')
      } else if (days > 0) {
        const since = new Date(Date.now() - days * 86400000).toISOString()
        q = q.gte('visited_at', since)
      }

      if (clientSlug !== 'all') q = q.eq('client_slug', clientSlug)
      if (status !== 'all') q = q.eq('status', status)
      if (repUserId !== 'all') q = q.eq('user_id', repUserId)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as any[]
    },
    staleTime: 2 * 60_000,
  })
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Denver' })
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Denver' })
}

function groupByDate(visits: any[]) {
  const groups: { date: string; label: string; visits: any[] }[] = []
  const map = new Map<string, any[]>()
  for (const v of visits) {
    const dateKey = v.visited_at.slice(0, 10)
    if (!map.has(dateKey)) map.set(dateKey, [])
    map.get(dateKey)!.push(v)
  }
  for (const [key, items] of map) {
    groups.push({ date: key, label: fmtDate(items[0].visited_at), visits: items })
  }
  return groups
}

function exportCsv(visits: any[]) {
  const rows = [
    ['Date', 'Time', 'Account', 'Status', 'Brand', 'Rep', 'Notes'],
    ...visits.map(v => [
      v.visited_at.slice(0, 10),
      new Date(v.visited_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Denver' }),
      v.accounts?.name ?? '',
      v.status ?? '',
      v.client_slug ?? '',
      v.user_profiles?.name || v.user_profiles?.full_name || '',
      (v.notes ?? '').replace(/"/g, '""'),
    ]),
  ]
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `visits-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const ALL_STATUSES = [
  'New Placement', 'Menu Feature Won', 'Just Ordered',
  'Will Order Soon', 'General Check-In', 'Needs Follow Up', 'Not Interested', 'Tasted',
]

export default function VisitsPage() {
  const { data: clients = [] } = useV3Clients()
  const { data: profile } = useV3Profile()
  const { data: allProfiles = [] } = useV3AllProfiles()
  const [period, setPeriod] = useState(1)  // index into PERIODS
  const [brandFilter, setBrandFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [repFilter, setRepFilter] = useState('all')

  const isAdminOrOwner = ['owner', 'admin'].includes((profile as any)?.role || '')
  const selectedPeriod = PERIODS[period]
  const { data: visits = [], isLoading } = useVisitsLog(selectedPeriod.days, brandFilter, statusFilter, repFilter)

  const groups = useMemo(() => groupByDate(visits), [visits])

  const totalUnique = useMemo(() => {
    const seen = new Set(visits.map((v: any) => v.visited_at.slice(0, 10) + ':' + v.account_id))
    return seen.size
  }, [visits])

  const winCount = useMemo(() => visits.filter((v: any) => WIN_STATUSES.has(v.status)).length, [visits])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 28px 60px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: 0 }}>
            Visits
          </h1>
          <div style={{ fontSize: '13px', color: v3.text.muted, marginTop: 3 }}>
            Full field activity log
          </div>
        </div>

        {/* Period toggles + export */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {PERIODS.map((p, i) => (
            <button key={p.label} onClick={() => setPeriod(i)} style={{
              padding: '6px 14px', borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 700,
              border: `1px solid ${period === i ? v3.amber + '60' : v3.border.default}`,
              background: period === i ? v3.amberDim : 'transparent',
              color: period === i ? v3.amberLight : v3.text.muted,
              cursor: 'pointer', transition: 'all 120ms', fontFamily: v3.font.ui,
            }}>{p.label}</button>
          ))}
          {visits.length > 0 && (
            <button onClick={() => exportCsv(visits)} title="Export CSV" style={{
              marginLeft: 4, padding: '6px 10px', borderRadius: v3.radius.md, fontSize: '12px',
              border: `1px solid ${v3.border.default}`, background: 'transparent',
              color: v3.text.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: v3.font.ui, fontWeight: 600,
            }}>
              <Download size={11} />CSV
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
        <div>
          <div className="v3-mono" style={{ fontSize: '40px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.04em', lineHeight: 1 }}>
            {visits.length}
          </div>
          <div style={{ fontSize: '10px', color: v3.text.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Visit Rows
          </div>
        </div>
        <div style={{ width: 1, background: v3.border.subtle, alignSelf: 'stretch' }} />
        <div>
          <div className="v3-mono" style={{ fontSize: '40px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.04em', lineHeight: 1 }}>
            {totalUnique}
          </div>
          <div style={{ fontSize: '10px', color: v3.text.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Unique Visits
          </div>
        </div>
        {winCount > 0 && (
          <>
            <div style={{ width: 1, background: v3.border.subtle, alignSelf: 'stretch' }} />
            <div>
              <div className="v3-mono v3-glow-green" style={{ fontSize: '40px', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {winCount}
              </div>
              <div style={{ fontSize: '10px', color: v3.text.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Wins
              </div>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={12} color={v3.text.muted} />
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
          style={{ background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.secondary, fontSize: '13px', padding: '6px 10px', cursor: 'pointer', outline: 'none', fontFamily: v3.font.ui }}>
          <option value="all">All Brands</option>
          {(clients as any[]).map((c: any) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.secondary, fontSize: '13px', padding: '6px 10px', cursor: 'pointer', outline: 'none', fontFamily: v3.font.ui }}>
          <option value="all">All Outcomes</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {isAdminOrOwner && (
          <select value={repFilter} onChange={e => setRepFilter(e.target.value)}
            style={{ background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.secondary, fontSize: '13px', padding: '6px 10px', cursor: 'pointer', outline: 'none', fontFamily: v3.font.ui }}>
            <option value="all">All Reps</option>
            {(allProfiles as any[]).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name || p.full_name || 'Rep'}</option>
            ))}
          </select>
        )}
        <span style={{ fontSize: '12px', color: v3.text.muted }}>
          {visits.length} row{visits.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Visit feed */}
      {isLoading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: v3.text.muted, fontSize: '14px' }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: v3.text.muted, fontSize: '14px' }}>
          No visits in this period.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {groups.map(group => (
            <div key={group.date}>
              {/* Date header */}
              <div style={{
                fontSize: '10px', fontWeight: 800, color: v3.text.muted,
                textTransform: 'uppercase', letterSpacing: '0.14em',
                paddingBottom: 10,
                borderBottom: `1px solid ${v3.border.subtle}`,
                marginBottom: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>{group.label}</span>
                <span style={{ color: v3.text.muted, fontWeight: 600 }}>
                  {group.visits.length} visit{group.visits.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Visits in this day */}
              {group.visits.map((v: any, i: number) => {
                const color = STATUS_COLORS[v.status] ?? v3.text.muted
                const isWin = WIN_STATUSES.has(v.status)
                const repName = v.user_profiles?.name || v.user_profiles?.full_name || null
                const cl = (clients as any[]).find((c: any) => c.slug === v.client_slug)

                return (
                  <div key={v.id} style={{
                    display: 'grid', gridTemplateColumns: '3px 1fr auto',
                    gap: 14, padding: '12px 0',
                    borderBottom: i < group.visits.length - 1 ? `1px solid ${v3.border.subtle}` : 'none',
                    alignItems: 'flex-start',
                  }}>
                    {/* Status strip */}
                    <div style={{
                      width: 3, alignSelf: 'stretch', borderRadius: 2,
                      background: color,
                      opacity: isWin ? 1 : 0.6,
                    }} />

                    {/* Main content */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Link href={`/v3/territory/${v.account_id}`}
                          style={{ fontSize: '14px', fontWeight: 700, color: v3.text.primary, textDecoration: 'none' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = v3.amberLight}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = v3.text.primary}>
                          {v.accounts?.name ?? 'Unknown Account'}
                        </Link>
                        {isWin && (
                          <span style={{
                            fontSize: '8px', fontWeight: 800, color: '#3a9e74',
                            background: 'rgba(90,158,160,0.12)', padding: '2px 7px',
                            borderRadius: v3.radius.sm, letterSpacing: '0.06em', textTransform: 'uppercase',
                          }}>Win</span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                        {/* Status */}
                        <span style={{ fontSize: '12px', fontWeight: 700, color, letterSpacing: '0.02em' }}>
                          {v.status}
                        </span>

                        {/* Brand */}
                        {cl && (
                          <span style={{ fontSize: '10px', color: cl.color || v3.amber, fontWeight: 600 }}>
                            {cl.name}
                          </span>
                        )}

                        {/* Rep */}
                        {repName && (
                          <span style={{ fontSize: '10px', color: v3.text.muted }}>
                            {repName.split(' ')[0]}
                          </span>
                        )}

                        {/* Time */}
                        <span style={{ fontSize: '10px', color: v3.text.muted }}>
                          {fmtTime(v.visited_at)}
                        </span>
                      </div>

                      {/* Notes */}
                      {v.notes && (
                        <div style={{
                          marginTop: 7, fontSize: '13px', color: v3.text.secondary,
                          lineHeight: 1.55, fontStyle: 'italic',
                          maxWidth: 560,
                        }}>
                          {v.notes}
                        </div>
                      )}
                    </div>

                    {/* Account link arrow */}
                    <Link href={`/v3/territory/${v.account_id}`} style={{
                      color: v3.text.muted, opacity: 0.4, display: 'flex', alignItems: 'center',
                      marginTop: 2, textDecoration: 'none', flexShrink: 0,
                    }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.4'}>
                      <ChevronRight size={14} />
                    </Link>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
