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
import { getOverdueAccounts } from '../lib/data'
import { getSupabase } from '../lib/supabase'
import { t, card, btnPrimary, btnSecondary } from '../lib/theme'
import { todayMT, formatShortDateMT, daysAgoMT } from '../lib/formatters'
import { overdueColor } from '../lib/theme'
import type { UserProfile } from '../lib/types'

interface Stop {
  id: string
  type: 'event' | 'account' | 'task'
  title: string
  sub?: string
  address?: string
  scheduledTime?: string
  completed: boolean
  accountId?: string
}

function SortableStop({ stop, onComplete, onLogVisit, onRemove }: {
  stop: Stop
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
      borderLeft: stop.type === 'event' ? `3px solid ${t.gold}` : `3px solid ${t.border.default}`,
    }}>
      <div {...attributes} {...listeners} style={{ color: t.text.muted, cursor: 'grab', flexShrink: 0, touchAction: 'none' }}>
        <GripVertical size={15} />
      </div>

      <button onClick={() => onComplete(stop.id)} style={{
        width: 18, height: 18, borderRadius: '4px', flexShrink: 0,
        border: `1.5px solid ${stop.completed ? t.status.success : t.border.hover}`,
        backgroundColor: stop.completed ? t.status.success : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}>
        {stop.completed && <Check size={10} color="#0c0c0a" strokeWidth={3} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px', fontWeight: '500', color: stop.completed ? t.text.muted : t.text.primary,
          textDecoration: stop.completed ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {stop.title}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
          {stop.sub && <div style={{ fontSize: '11px', color: t.text.muted }}>{stop.sub}</div>}
          {stop.scheduledTime && (
            <div style={{ fontSize: '11px', color: t.status.info, display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Clock size={9} /> {stop.scheduledTime}
            </div>
          )}
        </div>
      </div>

      {stop.accountId && !stop.completed && (
        <button onClick={() => onLogVisit(stop.accountId!)} style={{
          padding: '4px 9px', fontSize: '11px', borderRadius: '5px',
          border: `1px solid ${t.border.gold}`, backgroundColor: t.goldDim,
          color: t.gold, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          Log
        </button>
      )}
      <button onClick={() => onRemove(stop.id)} style={{
        background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer',
        padding: '4px', display: 'flex', flexShrink: 0,
      }}>
        <X size={13} />
      </button>
    </div>
  )
}

export default function PlannerPage() {
  const [stops, setStops] = useState<Stop[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [todayEvents, setTodayEvents] = useState<any[]>([])
  const [visitModal, setVisitModal] = useState<{ open: boolean; accountId?: string }>({ open: false })
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [date, setDate] = useState(todayMT())
  const [customStop, setCustomStop] = useState('')

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

  useEffect(() => {
    const saved = localStorage.getItem(`planner-${date}`)
    if (saved) { try { setStops(JSON.parse(saved)) } catch {} }
    else setStops([])
  }, [date])

  useEffect(() => {
    const sb = getSupabase()
    sb.from('events')
      .select('id, title, start_time, accounts(id, name, address)')
      .gte('start_time', date + 'T00:00:00')
      .lte('start_time', date + 'T23:59:59')
      .order('start_time')
      .then(({ data }) => {
        setTodayEvents(data || [])
        if (data?.length) {
          const saved = localStorage.getItem(`planner-${date}`)
          if (!saved) {
            const eventStops: Stop[] = data.map((e: any) => ({
              id: e.id,
              type: 'event',
              title: e.title,
              sub: e.accounts?.name,
              address: e.accounts?.address,
              scheduledTime: e.start_time ? new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : undefined,
              completed: false,
              accountId: e.accounts?.id,
            }))
            saveStops(eventStops)
          }
        }
      })
  }, [date])

  useEffect(() => {
    getOverdueAccounts().then(accs => setSuggestions(accs.slice(0, 10))).catch(() => {})
  }, [])

  function saveStops(newStops: Stop[]) {
    setStops(newStops)
    localStorage.setItem(`planner-${date}`, JSON.stringify(newStops))
  }

  function addStop(account: any) {
    const stop: Stop = {
      id: `stop-${account.id}-${Date.now()}`,
      type: 'account',
      title: account.name,
      sub: account.address,
      address: account.address,
      completed: false,
      accountId: account.id,
    }
    saveStops([...stops, stop])
  }

  function addCustomStop() {
    if (!customStop.trim()) return
    const stop: Stop = {
      id: `task-${Date.now()}`,
      type: 'task',
      title: customStop.trim(),
      completed: false,
    }
    saveStops([...stops, stop])
    setCustomStop('')
  }

  function toggleComplete(id: string) {
    saveStops(stops.map(s => s.id === id ? { ...s, completed: !s.completed } : s))
  }

  function removeStop(id: string) {
    saveStops(stops.filter(s => s.id !== id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = stops.findIndex(s => s.id === active.id)
      const newIndex = stops.findIndex(s => s.id === over.id)
      saveStops(arrayMove(stops, oldIndex, newIndex))
    }
  }

  const completed = stops.filter(s => s.completed).length

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 40px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
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
              fontSize: '13px', outline: 'none', cursor: 'pointer',
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
            {stops.length === 0 ? (
              <EmptyState icon={<MapPin size={32} />} title="No stops planned" subtitle="Add accounts from the suggestions panel →" />
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={stops.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                    {stops.map(stop => (
                      <SortableStop key={stop.id} stop={stop} onComplete={toggleComplete} onLogVisit={(accountId) => setVisitModal({ open: true, accountId })} onRemove={removeStop} />
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
          </div>

          {/* RIGHT — sidebar panels */}
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
                      <div style={{
                        fontSize: '10px', color: t.gold, fontFamily: 'var(--font-mono)',
                        minWidth: '44px', paddingTop: '2px',
                      }}>
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
                const alreadyAdded = stops.some(s => s.accountId === acc.id)
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
                      <span style={{ fontSize: '10px', color: t.status.success }}>✓</span>
                    ) : (
                      <button onClick={() => addStop(acc)} style={{
                        padding: '3px 8px', fontSize: '11px', borderRadius: '4px',
                        border: `1px solid ${t.border.gold}`, backgroundColor: t.goldDim,
                        color: t.gold, cursor: 'pointer', flexShrink: 0,
                      }}>
                        + Add
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {profile && (
          <VisitLogModal
            isOpen={visitModal.open}
            onClose={() => setVisitModal({ open: false })}
            onSuccess={() => setVisitModal({ open: false })}
            userId={profile.id}
            defaultAccountId={visitModal.accountId}
            isMobile={isMobile}
          />
        )}
      </div>
    </LayoutShell>
  )
}
