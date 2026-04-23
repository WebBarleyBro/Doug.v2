'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, GripVertical, Check, Clock, MapPin, X, Search, UserPlus, Map } from 'lucide-react'
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
import AddAccountModal from '../components/AddAccountModal'
import EmptyState from '../components/EmptyState'
import { getOverdueAccounts, getPlannerStops, upsertPlannerStop, updatePlannerStop, deletePlannerStop, savePlannerOrder, getAccounts, getVisits } from '../lib/data'
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
  const [todayVisits, setTodayVisits] = useState<any[]>([])
  const [stopSearch, setStopSearch] = useState('')
  const [stopResults, setStopResults] = useState<any[]>([])
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [stopSearchFocused, setStopSearchFocused] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const googleMapRef = useRef<any>(null)

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

  useEffect(() => {
    if (!profile?.id) return
    getVisits({ userId: profile.id, since: date, limit: 50 }).then(vs => {
      const seen = new Set<string>()
      setTodayVisits(vs.filter((v: any) => {
        const key = `${String(v.visited_at).slice(0, 10)}|${v.user_id}|${v.account_id}`
        if (seen.has(key) || String(v.visited_at).slice(0, 10) !== date) return false
        seen.add(key); return true
      }))
    }).catch(() => {})
  }, [profile?.id, date])

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
    if (!profile?.id) return
    getOverdueAccounts().then(accs => setSuggestions(accs.slice(0, 10))).catch(() => {})
  }, [profile?.id])

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

  useEffect(() => {
    if (stopSearch.length < 2) { setStopResults([]); return }
    const timer = setTimeout(() => {
      getAccounts({ search: stopSearch, limit: 8 }).then(setStopResults).catch(() => {})
    }, 250)
    return () => clearTimeout(timer)
  }, [stopSearch])

  async function addStopFromSearch(acc: any) {
    setStopSearch('')
    setStopResults([])
    setStopSearchFocused(false)
    await addStop(acc)
  }

  async function handleAccountAdded(account: any) {
    setShowAddAccount(false)
    await addStop(account)
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
  const mappableStops = stops.filter(s => s.address)

  // Initialise / refresh Google Map when showMap toggles or stops change
  useEffect(() => {
    if (!showMap || !mapRef.current) return
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!apiKey) return

    function initMap() {
      if (!mapRef.current) return
      const google = (window as any).google
      if (!google?.maps) return

      const map = new google.maps.Map(mapRef.current, {
        zoom: mappableStops.length ? 12 : 11,
        center: { lat: 40.5853, lng: -105.0844 }, // Fort Collins default
        mapTypeId: 'roadmap',
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#1a1a17' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#a09880' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a17' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d2d28' }] },
          { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a17' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d0d0b' }] },
        ],
      })
      googleMapRef.current = map

      if (mappableStops.length === 0) return

      const geocoder = new google.maps.Geocoder()
      const bounds = new google.maps.LatLngBounds()

      mappableStops.forEach((stop, i) => {
        geocoder.geocode({ address: stop.address }, (results: any, status: string) => {
          if (status !== 'OK' || !results?.[0]) return
          const pos = results[0].geometry.location
          bounds.extend(pos)

          const marker = new google.maps.Marker({
            position: pos,
            map,
            label: { text: String(i + 1), color: '#0c0c0a', fontWeight: '700', fontSize: '12px' },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 16,
              fillColor: stop.completed ? '#3dbc76' : '#d4a843',
              fillOpacity: 1,
              strokeWeight: 0,
            },
            title: stop.title,
          })

          const infoWindow = new google.maps.InfoWindow({
            content: `<div style="color:#111;font-family:sans-serif;padding:2px"><b>${stop.title}</b><br/><span style="font-size:11px">${stop.address}</span></div>`,
          })
          marker.addListener('click', () => infoWindow.open(map, marker))

          if (mappableStops.length === 1) {
            map.setCenter(pos)
            map.setZoom(15)
          } else {
            map.fitBounds(bounds)
          }
        })
      })
    }

    if ((window as any).google?.maps) {
      initMap()
    } else {
      const existing = document.getElementById('google-maps-script')
      if (!existing) {
        const script = document.createElement('script')
        script.id = 'google-maps-script'
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
        script.async = true
        script.onload = initMap
        document.head.appendChild(script)
      } else {
        existing.addEventListener('load', initMap)
        return () => existing.removeEventListener('load', initMap)
      }
    }
  }, [showMap, stops]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '28px 40px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px' }}>
          <div>
            <h1 className="page-h1" style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Day Planner</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>
              {stops.length > 0 ? `${completed} / ${stops.length} stops complete` : 'Build your route for today'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setShowMap(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                cursor: 'pointer', flexShrink: 0,
                backgroundColor: showMap ? t.goldDim : t.bg.card,
                color: showMap ? t.gold : t.text.secondary,
                border: `1px solid ${showMap ? t.border.gold : t.border.default}`,
              }}
            >
              <Map size={14} /> {showMap ? 'Hide Map' : 'Map View'}
            </button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{
                backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`,
                borderRadius: '8px', padding: '8px 12px', color: t.text.primary,
                fontSize: '13px', outline: 'none', cursor: 'pointer', flexShrink: 0,
              }} />
          </div>
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

        {/* Map panel */}
        {showMap && (
          <div style={{ marginBottom: '20px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${t.border.default}` }}>
            <div ref={mapRef} style={{ width: '100%', height: isMobile ? '260px' : '380px' }} />
            {mappableStops.length === 0 && (
              <div style={{ padding: '20px', backgroundColor: t.bg.elevated, textAlign: 'center', fontSize: '13px', color: t.text.muted }}>
                <MapPin size={20} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
                No stops with addresses yet — add accounts from the list below
              </div>
            )}
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

            {/* Add stop — search or create */}
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Account search */}
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: t.text.muted, pointerEvents: 'none' }} />
                    <input
                      type="text"
                      value={stopSearch}
                      onChange={e => setStopSearch(e.target.value)}
                      onFocus={() => setStopSearchFocused(true)}
                      onBlur={() => setTimeout(() => setStopSearchFocused(false), 150)}
                      placeholder="Search accounts to add..."
                      style={{
                        width: '100%', backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`,
                        borderRadius: '8px', padding: '10px 12px 10px 32px',
                        color: t.text.primary, fontSize: '13px', outline: 'none',
                      }}
                    />
                  </div>
                  <button
                    onClick={() => setShowAddAccount(true)}
                    style={{ ...btnSecondary, padding: '10px 14px', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    <UserPlus size={14} /> New Account
                  </button>
                </div>

                {/* Search results dropdown */}
                {stopSearchFocused && stopResults.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`,
                    borderRadius: '10px', marginTop: '4px', overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}>
                    {stopResults
                      .filter(acc => !stops.some(s => s.account_id === acc.id))
                      .map((acc: any) => {
                        const days = daysAgoMT(acc.last_visited)
                        return (
                          <button key={acc.id} onMouseDown={() => addStopFromSearch(acc)} style={{
                            display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                            padding: '10px 14px', background: 'none', border: 'none',
                            borderBottom: `1px solid ${t.border.subtle}`, cursor: 'pointer',
                            textAlign: 'left',
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: '500', color: t.text.primary }}>{acc.name}</div>
                              {acc.address && <div style={{ fontSize: '11px', color: t.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.address}</div>}
                            </div>
                            <div style={{ fontSize: '11px', color: overdueColor(days), flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                              {days === null ? 'never' : `${days}d ago`}
                            </div>
                          </button>
                        )
                      })}
                    {stopResults.every(acc => stops.some(s => s.account_id === acc.id)) && (
                      <div style={{ padding: '10px 14px', fontSize: '12px', color: t.text.muted }}>All matching accounts already on your route</div>
                    )}
                  </div>
                )}
              </div>

              {/* Custom task input */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={customStop}
                  onChange={e => setCustomStop(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomStop()}
                  placeholder="Or add a custom task / note..."
                  style={{
                    flex: 1, backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}`,
                    borderRadius: '8px', padding: '9px 12px', color: t.text.secondary, fontSize: '12px', outline: 'none',
                  }}
                />
                <button onClick={addCustomStop} disabled={!customStop.trim()} style={{ ...btnSecondary, padding: '9px 12px', opacity: customStop.trim() ? 1 : 0.4 }}>
                  <Plus size={14} />
                </button>
              </div>
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
              {/* Today's logged visits */}
              <div style={{ ...card, padding: '14px 16px' }}>
                <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
                  Logged Today ({todayVisits.length})
                </div>
                {todayVisits.length === 0 ? (
                  <div style={{ fontSize: '12px', color: t.text.muted }}>No visits logged yet today</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {todayVisits.map((v: any) => (
                      <div key={v.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.gold, flexShrink: 0, marginTop: '5px' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: '500', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.accounts?.name || 'Unknown'}</div>
                          <div style={{ fontSize: '10px', color: t.text.muted }}>{v.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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

        {showAddAccount && (
          <AddAccountModal
            onClose={() => setShowAddAccount(false)}
            onAdded={handleAccountAdded}
            isMobile={isMobile}
          />
        )}
      </div>
    </LayoutShell>
  )
}
