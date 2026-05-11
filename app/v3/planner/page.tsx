'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Check, MapPin, Search, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import { v3, v3input, v3label } from '../lib/theme'
import { useOpenLogVisit } from '../lib/context'
import { getSupabase } from '../../lib/supabase'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const today = todayStr()
  if (dateStr === today) return 'Today'
  if (dateStr === addDays(today, 1)) return 'Tomorrow'
  if (dateStr === addDays(today, -1)) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function usePlannerStops(date: string) {
  return useQuery({
    queryKey: ['v3', 'planner', date],
    queryFn: async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return []
      const { data, error } = await sb
        .from('planner_stops')
        .select('*, accounts(id, name, address, phone)')
        .eq('user_id', user.id)
        .eq('plan_date', date)
        .order('stop_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as any[]
    },
    staleTime: 30_000,
  })
}

function useDayVisits(date: string) {
  return useQuery({
    queryKey: ['v3', 'visits', 'day', date],
    queryFn: async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return []
      const { data, error } = await sb
        .from('visits')
        .select('account_id, status, client_slug')
        .eq('user_id', user.id)
        .gte('visited_at', date + 'T00:00:00')
        .lte('visited_at', date + 'T23:59:59')
      if (error) throw error
      return (data ?? []) as any[]
    },
  })
}

// Account search dropdown
function AccountDropdown({ onSelect }: { onSelect: (id: string, name: string, address: string | null) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); return }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const sb = getSupabase()
      const { data } = await sb.from('accounts').select('id, name, address').ilike('name', `%${query}%`).limit(8)
      setResults(data ?? [])
    }, 220)
  }, [query])

  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: v3.bg.sheet, border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md }}>
        <Search size={13} color={v3.text.muted} />
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search accounts…"
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: v3.text.primary, fontSize: '14px', padding: '10px 0', fontFamily: v3.font.ui }} />
      </div>
      {results.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 20, background: v3.bg.elevated, border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {results.map(a => (
            <button key={a.id} onClick={() => { onSelect(a.id, a.name, a.address); setQuery(''); setResults([]) }}
              style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${v3.border.subtle}`, textAlign: 'left', cursor: 'pointer', fontFamily: v3.font.ui }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: v3.text.primary }}>{a.name}</div>
              {a.address && <div style={{ fontSize: '11px', color: v3.text.muted, marginTop: 1 }}>{a.address}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PlannerPage() {
  const qc = useQueryClient()
  const { open: openLogVisit } = useOpenLogVisit()
  const [date, setDate] = useState(todayStr())
  const [showAddStop, setShowAddStop] = useState(false)
  const isToday = date === todayStr()

  const { data: stops = [], isLoading } = usePlannerStops(date)
  const { data: dayVisits = [] } = useDayVisits(date)

  const visitedAccountIds = useMemo(() => new Set(dayVisits.map(v => v.account_id)), [dayVisits])

  const activeStops    = stops.filter(s => !s.completed)
  const completedStops = stops.filter(s => s.completed)

  // Add stop
  const addStop = useMutation({
    mutationFn: async ({ accountId, title, address }: { accountId: string; title: string; address: string | null }) => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await sb.from('planner_stops').insert({
        user_id: user.id,
        plan_date: date,
        account_id: accountId,
        title,
        subtitle: address || null,
        address: address || null,
        stop_type: 'account',
        stop_order: stops.length,
        completed: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'planner', date] })
      setShowAddStop(false)
    },
  })

  // Toggle complete
  const toggleComplete = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const sb = getSupabase()
      const { error } = await sb.from('planner_stops').update({ completed }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['v3', 'planner', date] }),
  })

  // Remove stop
  const removeStop = useMutation({
    mutationFn: async (id: string) => {
      const sb = getSupabase()
      const { error } = await sb.from('planner_stops').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['v3', 'planner', date] }),
  })

  function handleLogVisit(stop: any) {
    openLogVisit({ id: stop.account_id, name: stop.title })
    // Mark complete
    if (!stop.completed) toggleComplete.mutate({ id: stop.id, completed: true })
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 28px 48px' }}>

      {/* ── Date nav ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <button onClick={() => setDate(d => addDays(d, -1))} style={{ background: 'none', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.muted, cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em' }}>
            {formatDateLabel(date)}
          </div>
          <div style={{ fontSize: '11px', color: v3.text.muted, marginTop: 2 }}>{formatDateFull(date)}</div>
        </div>
        <button onClick={() => setDate(d => addDays(d, 1))} style={{ background: 'none', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.muted, cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
          <ChevronRight size={16} />
        </button>
        {!isToday && (
          <button onClick={() => setDate(todayStr())} style={{ padding: '6px 12px', background: v3.amberDim, border: `1px solid ${v3.amber}40`, borderRadius: v3.radius.md, color: v3.amberLight, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: v3.font.ui }}>
            Today
          </button>
        )}
      </div>

      {/* ── Stats strip ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Planned', value: stops.length, color: v3.text.secondary },
          { label: 'Done', value: completedStops.length, color: completedStops.length > 0 ? v3.status.success : v3.text.secondary },
          { label: 'Visited', value: visitedAccountIds.size, color: visitedAccountIds.size > 0 ? v3.status.success : v3.text.secondary },
          { label: 'Remaining', value: activeStops.length, color: activeStops.length > 0 ? v3.status.warning : v3.status.success },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, padding: '10px 14px', background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, textAlign: 'center' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 5 }}>{s.label}</div>
            <div className="v3-mono" style={{ fontSize: '22px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Active stops ─────────────────────────────────────────────────── */}
      {isLoading
        ? <div style={{ padding: '24px', color: v3.text.muted, fontSize: '13px', textAlign: 'center' }}>Loading…</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeStops.length === 0 && completedStops.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md }}>
                <div style={{ fontSize: '13px', color: v3.text.muted, marginBottom: 12 }}>No stops planned for {formatDateLabel(date).toLowerCase()}.</div>
                <button onClick={() => setShowAddStop(true)} style={{ padding: '8px 16px', background: v3.amber, border: 'none', borderRadius: v3.radius.md, color: v3.text.inverse, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: v3.font.ui }}>
                  Add a stop
                </button>
              </div>
            )}

            {activeStops.map(stop => {
              const alreadyVisited = stop.account_id && visitedAccountIds.has(stop.account_id)
              return (
                <div key={stop.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px',
                  background: v3.bg.card,
                  border: `1px solid ${alreadyVisited ? v3.status.success + '40' : v3.border.default}`,
                  borderLeft: `3px solid ${alreadyVisited ? v3.status.success : v3.amber}`,
                  borderRadius: v3.radius.md,
                }}>
                  <button onClick={() => toggleComplete.mutate({ id: stop.id, completed: true })}
                    style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${v3.border.strong}`, background: 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent' }} />
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {stop.account_id
                      ? <Link href={`/v3/territory/${stop.account_id}`} style={{ textDecoration: 'none' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: v3.text.primary }}>{stop.title}</div>
                        </Link>
                      : <div style={{ fontSize: '14px', fontWeight: 700, color: v3.text.primary }}>{stop.title}</div>
                    }
                    {stop.subtitle && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: v3.text.muted, marginTop: 2 }}>
                        <MapPin size={9} />{stop.subtitle}
                      </div>
                    )}
                    {alreadyVisited && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', color: v3.status.success, marginTop: 3, fontWeight: 700 }}>
                        <CheckCircle2 size={10} /> Visit logged
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {stop.account_id && (
                      <button onClick={() => handleLogVisit(stop)} style={{
                        padding: '7px 14px', background: alreadyVisited ? 'transparent' : v3.amber,
                        border: `1px solid ${alreadyVisited ? v3.border.default : 'none'}`,
                        borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 700,
                        color: alreadyVisited ? v3.text.secondary : v3.text.inverse,
                        cursor: 'pointer', fontFamily: v3.font.ui,
                      }}>
                        {alreadyVisited ? 'Log Again' : 'Log Visit'}
                      </button>
                    )}
                    <button onClick={() => removeStop.mutate(stop.id)} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Add stop */}
            {showAddStop
              ? (
                <div style={{ padding: '14px 16px', background: v3.bg.card, border: `1px solid ${v3.amber}40`, borderRadius: v3.radius.md }}>
                  <AccountDropdown onSelect={(id, name, address) => addStop.mutate({ accountId: id, title: name, address })} />
                  <button onClick={() => setShowAddStop(false)} style={{ marginTop: 8, background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', fontSize: '12px', fontFamily: v3.font.ui }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowAddStop(true)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px', background: 'transparent',
                  border: `1px dashed ${v3.border.default}`, borderRadius: v3.radius.md,
                  color: v3.text.muted, fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: v3.font.ui,
                  transition: 'all 120ms',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = v3.amber + '60'; (e.currentTarget as HTMLElement).style.color = v3.amberLight }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = v3.border.default; (e.currentTarget as HTMLElement).style.color = v3.text.muted }}>
                  <Plus size={14} /> Add stop
                </button>
              )
            }

            {/* ── Completed ──────────────────────────────────────────────── */}
            {completedStops.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 8, paddingLeft: 4 }}>
                  Completed · {completedStops.length}
                </div>
                {completedStops.map(stop => (
                  <div key={stop.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px', marginBottom: 4,
                    background: v3.bg.card, border: `1px solid ${v3.border.subtle}`,
                    borderRadius: v3.radius.md, opacity: 0.55,
                  }}>
                    <CheckCircle2 size={16} color={v3.status.success} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: v3.text.secondary, textDecoration: 'line-through' }}>{stop.title}</div>
                    </div>
                    <button onClick={() => toggleComplete.mutate({ id: stop.id, completed: false })}
                      style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', fontSize: '10px', fontFamily: v3.font.ui }}>
                      Undo
                    </button>
                    <button onClick={() => removeStop.mutate(stop.id)} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4, display: 'flex' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
    </div>
  )
}
