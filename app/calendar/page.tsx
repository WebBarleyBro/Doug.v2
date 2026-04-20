'use client'
import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import LayoutShell from '../layout-shell'
import { getEvents, getClients, createEvent, deleteEvent } from '../lib/data'
import { t, card, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle } from '../lib/theme'
import { formatShortDateMT, todayMT } from '../lib/formatters'
import { EVENT_TYPE_LABELS } from '../lib/constants'
import type { Client } from '../lib/types'

const EVENT_TYPE_COLORS: Record<string, string> = {
  tasting: '#d4a843', meeting: '#4a9eff', planned_stop: '#3dba78',
  milestone: '#a78bfa', training: '#e89a2e', other: '#6b6966',
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

export default function CalendarPage() {
  const today = new Date()
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [events, setEvents] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', event_type: 'tasting', client_slug: '', start_time: todayMT() + 'T10:00', end_time: '', notes: '', status: 'planned' })

  const load = useCallback(async () => {
    const monthStart = new Date(viewYear, viewMonth, 1).toISOString()
    const monthEnd = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).toISOString()
    const [evs, cls] = await Promise.all([getEvents({ since: monthStart, until: monthEnd }), getClients()])
    setEvents(evs)
    setClients(cls)
  }, [viewMonth, viewYear])

  useEffect(() => { load() }, [load])

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const monthName = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function getEventsForDay(day: number) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter(e => e.start_time?.startsWith(dateStr))
  }

  const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : []

  async function handleCreate() {
    await createEvent({ ...form, start_time: new Date(form.start_time).toISOString(), end_time: form.end_time ? new Date(form.end_time).toISOString() : undefined } as any)
    setShowCreate(false)
    setForm({ title: '', event_type: 'tasting', client_slug: '', start_time: todayMT() + 'T10:00', end_time: '', notes: '', status: 'planned' })
    load()
  }

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '1300px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>{monthName}</h1>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }}
                style={{ background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '6px', color: t.text.secondary, cursor: 'pointer', padding: '5px 9px' }}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }}
                style={{ background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '6px', color: t.text.secondary, cursor: 'pointer', padding: '5px 9px' }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} style={btnPrimary}><Plus size={16} /> Add Event</button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', marginBottom: '1px' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: '600', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: t.border.subtle }}>
          {/* Empty cells before first day */}
          {[...Array(firstDay)].map((_, i) => (
            <div key={`empty-${i}`} style={{ backgroundColor: t.bg.page, minHeight: '80px' }} />
          ))}
          {/* Day cells */}
          {[...Array(daysInMonth)].map((_, i) => {
            const day = i + 1
            const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
            const dayEvents = getEventsForDay(day)
            const isSelected = selectedDay === day
            return (
              <div key={day} onClick={() => setSelectedDay(day === selectedDay ? null : day)} style={{
                backgroundColor: isSelected ? t.bg.card : t.bg.page,
                minHeight: '80px',
                padding: '8px',
                cursor: 'pointer',
                transition: 'background 150ms ease',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: isToday ? '700' : '400',
                  backgroundColor: isToday ? t.gold : 'transparent',
                  color: isToday ? '#0f0f0d' : t.text.primary,
                  marginBottom: '4px',
                }}>
                  {day}
                </div>
                {dayEvents.slice(0, 3).map(e => {
                  const client = clients.find(c => c.slug === e.client_slug)
                  return (
                    <div key={e.id} style={{
                      fontSize: '10px', padding: '1px 5px', borderRadius: '4px', marginBottom: '2px',
                      backgroundColor: (client?.color || EVENT_TYPE_COLORS[e.event_type] || t.gold) + '20',
                      color: client?.color || EVENT_TYPE_COLORS[e.event_type] || t.gold,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: '500',
                    }}>
                      {e.title}
                    </div>
                  )
                })}
                {dayEvents.length > 3 && <div style={{ fontSize: '10px', color: t.text.muted }}>+{dayEvents.length - 3} more</div>}
              </div>
            )
          })}
        </div>

        {/* Selected day events */}
        {selectedDay && selectedDayEvents.length > 0 && (
          <div style={{ ...card, marginTop: '20px', padding: '20px 24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary, marginBottom: '14px' }}>
              {new Date(viewYear, viewMonth, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            {selectedDayEvents.map(e => {
              const client = clients.find(c => c.slug === e.client_slug)
              const color = client?.color || EVENT_TYPE_COLORS[e.event_type] || t.gold
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${t.border.subtle}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: t.text.primary }}>{e.title}</div>
                    <div style={{ fontSize: '11px', color: t.text.muted }}>
                      {EVENT_TYPE_LABELS[e.event_type as keyof typeof EVENT_TYPE_LABELS]}
                      {e.accounts?.name && ` · ${e.accounts.name}`}
                      {client && ` · ${client.name}`}
                    </div>
                  </div>
                  <button onClick={() => deleteEvent(e.id).then(load)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '4px' }}>
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Create event modal */}
        {showCreate && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary }}>New Event</h3>
                <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div><label style={labelStyle}>Title</label><input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Event name..." style={inputStyle} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div><label style={labelStyle}>Type</label>
                    <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))} style={selectStyle}>
                      {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>Brand</label>
                    <select value={form.client_slug} onChange={e => setForm(f => ({ ...f, client_slug: e.target.value }))} style={selectStyle}>
                      <option value="">No brand</option>
                      {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div><label style={labelStyle}>Start</label><input type="datetime-local" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>End (optional)</label><input type="datetime-local" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={inputStyle} /></div>
                </div>
                <div><label style={labelStyle}>Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'none' }} /></div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setShowCreate(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleCreate} disabled={!form.title} style={{ ...btnPrimary, opacity: !form.title ? 0.6 : 1 }}>Save Event</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
