'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, GripVertical, Check, Clock, MapPin, X } from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import LayoutShell from '../layout-shell'
import VisitLogModal from '../components/VisitLogModal'
import EmptyState from '../components/EmptyState'
import { getOverdueAccounts, getPlannerStops, upsertPlannerStop, updatePlannerStop, deletePlannerStop, savePlannerOrder } from '../lib/data'
import type { PlannerStop } from '../lib/data'
import { getSupabase } from '../lib/supabase'
import { t, card, btnPrimary, btnSecondary } from '../lib/theme'
import { todayMT, formatShortDateMT, daysAgoMT } from '../lib/formatters'
import { overdueColor } from '../lib/theme'
import type { UserProfile } from '../lib/types'

function SortableStop({ stop, onComplete, onLogVisit, onRemove }: {
  stop: PlannerStop
  onComplete: (id: string) => void
  onLogVisit: (accountId: string) => void
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id })

  return (
    <div ref={setNodeRef} style={{
      ...card,
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      opacity: isDragging ? 0.4 : 1,
      transform: CSS.Transform.toString(transform),
      transition,
      borderLeft: stop.stop_type === 'event' ? `3px solid ${t.gold}` : `3px solid ${t.border.default}`,
    }}>
      <div {...attributes} {...listeners} style={{ color: t.text.muted, cursor: 'grab', flexShrink: 0, touchAction: 'none' }}>
        <GripVertical size={15} />
      </div>

      <button onClick={() => onComplete(stop.id)} style={{
        width: 20, height: 20, borderRadius: '5px', flexShrink: 0,
        border: `1.5px solid ${stop.completed ? t.status.success : t.border.hover}`,
        backgroundColor: stop.completed ? t.status.success : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', minWidth: 20,
      }}>
        {stop.completed && <Check size={11} color="#0c0c0a" strokeWidth={3} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px', fontWeight: '500', color: stop.completed ? t.text.muted : t.text.primary,
          textDecoration: stop.completed ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {stop.title}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
          {stop.subtitle && <div style={{ fontSize: '11px', color: t.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stop.subtitle}</div>}
          {stop.scheduled_time && (
            <div style={{ fontSize: '11px', color: t.status.info, display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
              <Clock size={9} /> {stop.scheduled_time}
            </div>
          )}
        </div>
      </div>

      {stop.account_id && !stop.completed && (
        <button onClick={() => onLogVisit(stop.account_id!)} style={{
          padding: '4px 9px', fontSize: '11px', borderRadius: '5px',
          border: `1px solid ${t.border.gold}`, backgroundColor: t.goldDim,
          color: t.gold, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, minHeight: 28,
        }}>
          Log
        </button>
      )}
      <button onClick={() => onRemove(stop.id)} style={{
        background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer',
        padding: '4px', display: 'flex', flexShrink: 0, minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center',
      }}>
        <X size={13} />
      </button>
    </div>
  )
}

export default function PlannerPage() {
  const [stops, setStops] = useState<PlannerStop[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [todayEvents, setTodayEvents] = useState<any[]>([])
  const [visitModal, setVisitModal] = useState<{ open: boolean; accountId?: string }>({ open: false })
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [date, setDate] = useState(todayMT())
  const [customStop, setCustomStop] = useState('')
  const [loading, setLoading] = useState(true)
  const [overdueOpen, setOverdueOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: p } = await sb.from('user_profiles').select('*').eq('id', user.id).single()
        if (p) setProfile(p)
      }
    })
  }, [])

  const loadStops = useCallback(async (userId: string, d: string) => {
    setLoading(true)
    try {
      const data = await getPlannerStops(userId, d)
      setStops(data)
    } catch {
      setStops([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (profile?.id) loadStops(profile.id, date)
  }, [profile?.id, date, loadStops])

  // Auto-seed from today's events when there are no planned stops
  useEffect(() => {
    if (!profile?.id || loading) return
    const sb = getSupabase()
    sb.from('events')
      .select('id, title, start_time, accounts(id, name, address)')
      .gte('start_time', new Date(date + 'T00:00:00').toISOString())
      .lte('start_time', new Date(date + 'T23:59:59').toISOString())
      .order('start_time')
      .then(async ({ data }) => {
        setTodayEvents(data || [])
        if (data?.length && stops.length === 0) {
          const eventStops = data.map((e: any, i: number) => ({
            user_id: profile.id,
            plan_date: date,
            account_id: e.accounts?.id || null,
            title: e.title,
            subtitle: e.accounts?.name || null,
            address: e.accounts?.address || null,
            scheduled_time: e.start_time ? new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null,
            stop_order: i,
            completed: false,
            stop_type: 'event' as const,
          }))
          const created = await Promise.all(eventStops.map(s => upsertPlannerStop(s)))
          setStops(created.filter(Boolean) as PlannerStop[])
        }
      })
  }, [profile?.id, date, loading, stops.length])

  useEffect(() => {
    getOverdueAccounts().then(accs => setSuggestions(accs.slice(0, 10))).catch(() => {})
  }, [])

  async function addStop(account: any) {
    if (!profile) return
    const stop = await upsertPlannerStop({
      user_id: profile.id,
      plan_date: date,
      account_id: account.id,
      title: account.name,
      subtitle: account.address || null,
      address: account.address || null,
      scheduled_time: null,
      stop_order: stops.length,
      completed: false,
      stop_type: 'account',
    })
    setStops(prev => [...prev, stop])
  }

  async function addCustomStop() {
    if (!customStop.trim() || !profile) return
    const stop = await upsertPlannerStop({
      user_id: profile.id,
      plan_date: date,
      account_id: null,
      title: customStop.trim(),
      subtitle: null,
      address: null,
      scheduled_time: null,
      stop_order: stops.length,
      completed: false,
      stop_type: 'task',
    })
    setStops(prev => [...prev, stop])
    setCustomStop('')
  }

  async function toggleComplete(id: string) {
    const stop = stops.find(s => s.id === id)
    if (!stop) return
    const updated = { ...stop, completed: !stop.completed }
    setStops(prev => prev.map(s => s.id === id ? updated : s))
    await updatePlannerStop(id, { completed: !stop.completed })
  }

  async function removeStop(id: string) {
    setStops(prev => prev.filter(s => s.id !== id))
    await deletePlannerStop(id)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = stops.findIndex(s => s.id === active.id)
      const newIndex = stops.findIndex(s => s.id === over.id)
      const reordered = arrayMove(stops, oldIndex, newIndex)
      setStops(reordered)
      await savePlannerOrder(reordered.map((s, i) => ({ id: s.id, stop_order: i })))
    }
  }

  const completed = stops.filter(s => s.completed).length

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '28px 40px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Day Planner</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>
              {stops.length > 0 ? `${completed} / ${stops.length} stops complete` : 'Build your route for today'}
            </p>
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{
              backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`,
              borderRadius: '8px', padding: '8px 12px', color: t.text.primary,
              fontSize: '13px', outline: 'none', cursor: 'pointer', flexShrink: 0,
            }} />
        </div>

        {/* Progress bar */}
        {stops.length > 0 && (
          <div style={{ height: '3px', backgroundColor: t.border.default, borderRadius: '2px', marginBottom: '24px' }}>
            <div style={{
              width: `${(completed / stops.length) * 100}%`,
              height: '100%',
              backgroundColor: completed === stops.length ? t.status.success : t.gold,
              borderRadius: '2px',
              transition: 'width 400ms ease',
              boxShadow: `0 0 8px ${completed === stops.length ? t.status.success : t.gold}`,
            }} />
          </div>
        )}

        {/* 2-column layout on desktop */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 300px',
          gap: '20px',
          alignItems: 'start',
        }}>

          {/* LEFT — stops list */}
          <div>
            {loading ? (
              <div style={{ ...card, padding: '48px', textAlign: 'center', color: t.text.muted, fontSize: '13px' }}>Loading stops...</div>
            ) : stops.length === 0 ? (
              <EmptyState icon={<MapPin size={32} />} title="No stops planned" subtitle={isMobile ? 'Tap below to add overdue accounts' : 'Add accounts from the suggestions panel →'} />
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={stops.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                    {stops.map(stop => (
                      <SortableStop key={stop.id} stop={stop} onComplete={toggleComplete}
                        onLogVisit={(accountId) => setVisitModal({ open: true, accountId })}
                        onRemove={removeStop}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* Add custom stop */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <input
                type="text"
                value={customStop}
                onChange={e => setCustomStop(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomStop()}
                placeholder="Add a custom stop or task..."
                style={{
                  flex: 1, backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`,
                  borderRadius: '6px', padding: '9px 12px', color: t.text.primary, fontSize: '13px', outline: 'none',
                }}
              />
              <button onClick={addCustomStop} style={{ ...btnPrimary, padding: '9px 14px' }}>
                <Plus size={15} />
              </button>
            </div>

            {/* Mobile: overdue accounts collapsed section */}
            {isMobile && (
              <div style={{ marginTop: '20px' }}>
                <button onClick={() => setOverdueOpen(o => !o)} style={{
                  ...btnSecondary, width: '100%', justifyContent: 'center', fontSize: '13px',
                }}>
                  {overdueOpen ? 'Hide' : 'Add accounts to route'} ({suggestions.filter(acc => !stops.some(s => s.account_id === acc.id)).length} overdue)
                </button>
                {overdueOpen && suggestions.length > 0 && (
                  <div style={{ ...card, marginTop: '8px', padding: '12px 14px' }}>
                    {suggestions.map((acc: any) => {
                      const days = daysAgoMT(acc.last_visited)
                      const alreadyAdded = stops.some(s => s.account_id === acc.id)
                      return (
                        <div key={acc.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 0', borderBottom: `1px solid ${t.border.subtle}`, gap: '8px',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</div>
                            <div style={{ fontSize: '10px', color: overdueColor(days), fontFamily: 'var(--font-mono)' }}>
                              {days === null ? 'never' : `${days}d ago`}
                            </div>
                          </div>
                          {alreadyAdded ? (
                            <span style={{ fontSize: '10px', color: t.status.success }}>✓</span>
                          ) : (
                            <button onClick={() => addStop(acc)} style={{
                              padding: '5px 10px', fontSize: '12px', borderRadius: '6px',
                              border: `1px solid ${t.border.gold}`, backgroundColor: t.goldDim,
                              color: t.gold, cursor: 'pointer', flexShrink: 0, minHeight: 32,
                            }}>+ Add</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — sidebar panels (desktop only) */}
          {!isMobile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Today's scheduled events */}
              {todayEvents.length > 0 && (
                <div style={{ ...card, padding: '14px 16px' }}>
                  <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
                    Scheduled Today
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {todayEvents.map((e: any) => (
                      <div key={e.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '10px', color: t.gold, fontFamily: 'var(--font-mono)', minWidth: '44px', paddingTop: '2px' }}>
                          {e.start_time ? new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '--:--'}
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: t.text.primary, fontWeight: '500' }}>{e.title}</div>
                          {e.accounts?.name && <div style={{ fontSize: '11px', color: t.text.muted }}>{e.accounts.name}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overdue suggestions */}
              <div style={{ ...card, padding: '14px 16px' }}>
                <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
                  Overdue — Add to Route
                </div>
                {suggestions.length === 0 ? (
                  <div style={{ fontSize: '12px', color: t.text.muted }}>All accounts visited recently</div>
                ) : suggestions.map((acc: any) => {
                  const days = daysAgoMT(acc.last_visited)
                  const alreadyAdded = stops.some(s => s.account_id === acc.id)
                  return (
                    <div key={acc.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                      padding: '7px 0', borderBottom: `1px solid ${t.border.subtle}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</div>
                        <div style={{ fontSize: '10px', color: overdueColor(days), fontFamily: 'var(--font-mono)' }}>
                          {days === null ? 'never' : `${days}d ago`}
                        </div>
                      </div>
                      {alreadyAdded ? (
                        <span style={{ fontSize: '10px', color: t.status.success }}>✓ Added</span>
                      ) : (
                        <button onClick={() => addStop(acc)} style={{
                          padding: '3px 8px', fontSize: '11px', borderRadius: '4px',
                          border: `1px solid ${t.border.gold}`, backgroundColor: t.goldDim,
                          color: t.gold, cursor: 'pointer', flexShrink: 0, minHeight: 28,
                        }}>
                          + Add
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {profile && (
          <VisitLogModal
            isOpen={visitModal.open}
            onClose={() => setVisitModal({ open: false })}
            onSuccess={() => {
              setVisitModal({ open: false })
              getOverdueAccounts().then(accs => setSuggestions(accs.slice(0, 10))).catch(() => {})
            }}
            userId={profile.id}
            defaultAccountId={visitModal.accountId}
            isMobile={isMobile}
          />
        )}
      </div>
    </LayoutShell>
  )
}
