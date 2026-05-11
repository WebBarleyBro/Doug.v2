'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Plus, MapPin, X, Check, Pencil, Trash2 } from 'lucide-react'
import { v3, v3input, v3label, v3btnPrimary, v3btnSecondary } from '../lib/theme'
import { useV3Clients } from '../lib/query'
import { getSupabase } from '../../lib/supabase'
import { clientLogoUrl } from '../../lib/constants'

function useV3Events() {
  return useQuery({
    queryKey: ['v3', 'events'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('events')
        .select('id, title, event_type, start_time, end_time, status, client_slug, notes, accounts(id, name)')
        .order('start_time', { ascending: true })
        .limit(100)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })
}

const EVENT_TYPE_COLOR: Record<string, string> = {
  tasting:   v3.amber,
  meeting:   v3.status.success,
  demo:      v3.status.warning,
  milestone: v3.text.muted,
}

const STATUS_COLOR: Record<string, string> = {
  planned:   v3.text.muted,
  confirmed: v3.status.success,
  completed: v3.text.secondary,
  cancelled: v3.status.danger,
}

const EVENT_TYPES = ['tasting', 'meeting', 'demo', 'milestone']

function toLocalDatetimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatEventDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function formatEventTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Create Event Modal ────────────────────────────────────────────────────────
function CreateEventModal({ onClose }: { onClose: () => void }) {
  const { data: clients = [] } = useV3Clients()
  const qc = useQueryClient()

  const defaultStart = toLocalDatetimeValue(new Date())
  const [title, setTitle]       = useState('')
  const [eventType, setEventType] = useState('tasting')
  const [startTime, setStartTime] = useState(defaultStart)
  const [endTime, setEndTime]     = useState('')
  const [clientSlug, setClientSlug] = useState('')
  const [notes, setNotes]         = useState('')
  const [error, setError]         = useState('')

  const create = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { error } = await sb.from('events').insert({
        title: title.trim(),
        event_type: eventType,
        start_time: new Date(startTime).toISOString(),
        end_time: endTime ? new Date(endTime).toISOString() : null,
        client_slug: clientSlug || null,
        notes: notes.trim() || null,
        status: 'planned',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'events'] })
      setTimeout(onClose, 400)
    },
    onError: (e: any) => setError(e?.message ?? 'Failed to create event'),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'absolute', inset: 0, background: v3.bg.overlay, backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 480,
        background: v3.bg.elevated,
        borderRadius: v3.radius.xl,
        border: `1px solid ${v3.border.strong}`,
        padding: '24px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>New Event</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={v3label}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. NoCo Distillery Tasting @ The Golden Pony" autoFocus
              style={{ ...v3input, background: v3.bg.sheet }} />
          </div>

          <div>
            <label style={v3label}>Type</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EVENT_TYPES.map(t => {
                const sel = eventType === t
                const c = EVENT_TYPE_COLOR[t] ?? v3.text.muted
                return (
                  <button key={t} onClick={() => setEventType(t)} style={{
                    padding: '6px 14px', borderRadius: v3.radius.full, fontSize: '11px', fontWeight: 700,
                    border: `1.5px solid ${sel ? c + '70' : v3.border.default}`,
                    background: sel ? c + '14' : 'transparent',
                    color: sel ? c : v3.text.muted,
                    cursor: 'pointer', transition: `all 130ms`,
                    textTransform: 'capitalize',
                  }}>{t}</button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={v3label}>Start</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)}
                style={{ ...v3input, background: v3.bg.sheet, colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={v3label}>End <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
              <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)}
                style={{ ...v3input, background: v3.bg.sheet, colorScheme: 'dark' }} />
            </div>
          </div>

          <div>
            <label style={v3label}>Brand <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
            <select value={clientSlug} onChange={e => setClientSlug(e.target.value)}
              style={{ ...v3input, background: v3.bg.sheet, appearance: 'none' as any }}>
              <option value="">— No brand —</option>
              {clients.map((c: any) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label style={v3label}>Notes <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Location, attendees, details…"
              style={{ ...v3input, background: v3.bg.sheet, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 } as any} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '9px 12px', background: v3.status.dangerDim, border: `1px solid ${v3.status.danger}33`, borderRadius: v3.radius.md, fontSize: '12px', color: v3.status.danger }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ ...v3btnSecondary, flex: 1 }}>Cancel</button>
          <button
            onClick={() => create.mutate()}
            disabled={!title.trim() || !startTime || create.isPending}
            style={{
              ...v3btnPrimary, flex: 2,
              opacity: !title.trim() || !startTime || create.isPending ? 0.45 : 1,
              cursor: !title.trim() || !startTime || create.isPending ? 'not-allowed' : 'pointer',
              background: create.isSuccess ? v3.status.success : v3.amber,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            {create.isSuccess ? <><Check size={14} strokeWidth={3} /> Created</> : create.isPending ? 'Creating…' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Event Modal ──────────────────────────────────────────────────────────
function EditEventModal({ event, onClose }: { event: any; onClose: () => void }) {
  const { data: clients = [] } = useV3Clients()
  const qc = useQueryClient()
  const [title, setTitle]     = useState(event.title ?? '')
  const [eventType, setEventType] = useState(event.event_type ?? 'tasting')
  const [startTime, setStartTime] = useState(event.start_time ? toLocalDatetimeValue(new Date(event.start_time)) : '')
  const [endTime, setEndTime]   = useState(event.end_time ? toLocalDatetimeValue(new Date(event.end_time)) : '')
  const [clientSlug, setClientSlug] = useState(event.client_slug ?? '')
  const [status, setStatus]     = useState(event.status ?? 'planned')
  const [notes, setNotes]       = useState(event.notes ?? '')
  const [error, setError]       = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { error } = await sb.from('events').update({
        title: title.trim(),
        event_type: eventType,
        start_time: new Date(startTime).toISOString(),
        end_time: endTime ? new Date(endTime).toISOString() : null,
        client_slug: clientSlug || null,
        status,
        notes: notes.trim() || null,
      }).eq('id', event.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['v3', 'events'] }); setTimeout(onClose, 300) },
    onError: (e: any) => setError(e?.message ?? 'Save failed'),
  })

  const del = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { error } = await sb.from('events').delete().eq('id', event.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['v3', 'events'] }); onClose() },
    onError: (e: any) => setError(e?.message ?? 'Delete failed'),
  })

  const EVENT_STATUSES = ['planned', 'confirmed', 'completed', 'cancelled'] as const

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'absolute', inset: 0, background: v3.bg.overlay, backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 500, background: v3.bg.elevated, border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.xl, padding: '24px', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Edit Event</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={v3label}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ ...v3input, background: v3.bg.sheet }} />
          </div>

          <div>
            <label style={v3label}>Type</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EVENT_TYPES.map(t => {
                const sel = eventType === t; const c = EVENT_TYPE_COLOR[t] ?? v3.text.muted
                return (
                  <button key={t} onClick={() => setEventType(t)} style={{ padding: '6px 14px', borderRadius: v3.radius.full, fontSize: '11px', fontWeight: 700, border: `1.5px solid ${sel ? c + '70' : v3.border.default}`, background: sel ? c + '14' : 'transparent', color: sel ? c : v3.text.muted, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
                )
              })}
            </div>
          </div>

          <div>
            <label style={v3label}>Status</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EVENT_STATUSES.map(s => {
                const sel = status === s; const c = STATUS_COLOR[s] ?? v3.text.muted
                return (
                  <button key={s} onClick={() => setStatus(s)} style={{ padding: '6px 14px', borderRadius: v3.radius.full, fontSize: '11px', fontWeight: 700, border: `1.5px solid ${sel ? c + '70' : v3.border.default}`, background: sel ? c + '14' : 'transparent', color: sel ? c : v3.text.muted, cursor: 'pointer', textTransform: 'capitalize' }}>{s}</button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={v3label}>Start</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...v3input, background: v3.bg.sheet, colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={v3label}>End <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
              <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...v3input, background: v3.bg.sheet, colorScheme: 'dark' }} />
            </div>
          </div>

          <div>
            <label style={v3label}>Brand <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
            <select value={clientSlug} onChange={e => setClientSlug(e.target.value)} style={{ ...v3input, background: v3.bg.sheet, appearance: 'none' as any }}>
              <option value="">— No brand —</option>
              {clients.map((c: any) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label style={v3label}>Notes <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...v3input, background: v3.bg.sheet, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 } as any} />
          </div>
        </div>

        {error && <div style={{ marginTop: 12, padding: '9px 12px', background: v3.status.dangerDim, border: `1px solid ${v3.status.danger}33`, borderRadius: v3.radius.md, fontSize: '12px', color: v3.status.danger }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {!confirmDel
            ? <button onClick={() => setConfirmDel(true)} style={{ padding: '9px 12px', background: 'transparent', border: `1px solid ${v3.border.subtle}`, borderRadius: v3.radius.md, color: v3.text.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = v3.status.danger + '50'; e.currentTarget.style.color = v3.status.danger }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = v3.border.subtle; e.currentTarget.style.color = v3.text.muted }}>
                <Trash2 size={14} />
              </button>
            : <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => del.mutate()} disabled={del.isPending} style={{ padding: '9px 12px', background: v3.status.dangerDim, border: `1px solid ${v3.status.danger}40`, borderRadius: v3.radius.md, fontSize: '11px', fontWeight: 700, color: v3.status.danger, cursor: 'pointer' }}>{del.isPending ? '…' : 'Delete'}</button>
                <button onClick={() => setConfirmDel(false)} style={{ padding: '9px 10px', background: 'transparent', border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, fontSize: '11px', color: v3.text.muted, cursor: 'pointer' }}>Cancel</button>
              </div>
          }
          <button onClick={onClose} style={{ flex: 1, padding: '9px', background: 'transparent', border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 600, color: v3.text.muted, cursor: 'pointer' }}>Close</button>
          <button onClick={() => save.mutate()} disabled={!title.trim() || !startTime || save.isPending}
            style={{ flex: 2, padding: '9px', background: save.isSuccess ? v3.status.success : v3.amber, color: '#000', border: 'none', borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {save.isSuccess ? <><Check size={14} strokeWidth={3} />Saved</> : save.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { data: events = [], isLoading } = useV3Events()
  const { data: clients = [] } = useV3Clients()
  const [showCreate, setShowCreate] = useState(false)
  const [editEvent, setEditEvent]   = useState<any | null>(null)

  const now = new Date()
  const upcoming = events.filter(e => e.status !== 'cancelled' && new Date(e.start_time) >= now)
  const past     = events.filter(e => e.status === 'completed' || new Date(e.start_time) < now).slice(0, 20)

  function renderEvent(e: any) {
    const cl = clients.find((c: any) => c.slug === e.client_slug)
    const logo = cl ? clientLogoUrl(cl) : null
    const ac = cl?.color || v3.amber
    const typeColor = EVENT_TYPE_COLOR[e.event_type] ?? v3.text.muted
    const statusColor = STATUS_COLOR[e.status] ?? v3.text.muted

    return (
      <div key={e.id} style={{
        display: 'grid', gridTemplateColumns: '100px 1fr auto',
        alignItems: 'center', gap: 16,
        padding: '10px 20px',
        borderBottom: `1px solid ${v3.border.subtle}`,
      }}
        onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = v3.bg.elevated}
        onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = 'transparent'}
      >
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: v3.text.secondary }}>{formatEventDate(e.start_time)}</div>
          <div style={{ fontSize: '11px', color: v3.text.muted, marginTop: 1, fontFamily: 'monospace' }}>{formatEventTime(e.start_time)}</div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: v3.text.primary }}>{e.title}</span>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: typeColor, background: typeColor + '14', padding: '2px 6px', borderRadius: '3px' }}>
              {e.event_type}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
            {e.accounts?.name && (
              <span style={{ fontSize: '11px', color: v3.text.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
                <MapPin size={9} />{e.accounts.name}
              </span>
            )}
            {cl && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', color: ac }}>
                {logo
                  ? <img src={logo} alt="" style={{ width: 12, height: 12, objectFit: 'contain' }} />
                  : <span style={{ fontWeight: 800 }}>{cl.name[0]}</span>
                }
                {cl.name}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: statusColor, background: statusColor + '12', padding: '3px 8px', borderRadius: '3px', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
            {e.status}
          </span>
          <button onClick={() => setEditEvent(e)} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center', opacity: 0.4, borderRadius: '3px' }}
            onMouseEnter={ev => { ev.currentTarget.style.opacity = '1'; ev.currentTarget.style.color = v3.amberLight }}
            onMouseLeave={ev => { ev.currentTarget.style.opacity = '0.4'; ev.currentTarget.style.color = v3.text.muted }}>
            <Pencil size={12} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 28px 48px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: 0 }}>Calendar</h1>
          <div style={{ fontSize: '12px', color: v3.text.muted, marginTop: 3 }}>Tastings, meetings, and events</div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px',
          background: v3.amber, border: 'none', borderRadius: v3.radius.md,
          fontSize: '12px', fontWeight: 700, color: v3.text.inverse,
          cursor: 'pointer', letterSpacing: '0.02em',
          boxShadow: `0 0 16px ${v3.amber}30`,
        }}>
          <Plus size={13} />
          New Event
        </button>
      </div>

      <div style={{ background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ padding: '9px 20px', background: v3.bg.surface, borderBottom: `1px solid ${v3.border.subtle}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '10px', fontWeight: 800, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Upcoming</span>
          {upcoming.length > 0 && <span style={{ fontSize: '11px', fontWeight: 700, color: v3.amberLight, fontFamily: 'monospace' }}>{upcoming.length}</span>}
        </div>
        {isLoading
          ? <div style={{ padding: '24px 20px', color: v3.text.muted, fontSize: '12px' }}>Loading…</div>
          : upcoming.length === 0
          ? <div style={{ padding: '28px 20px', textAlign: 'center', color: v3.text.muted, fontSize: '12px' }}>
              No upcoming events.{' '}
              <button onClick={() => setShowCreate(true)} style={{ background: 'none', border: 'none', color: v3.amberLight, cursor: 'pointer', fontSize: '12px', padding: 0, fontWeight: 600 }}>
                Create one →
              </button>
            </div>
          : upcoming.map(e => renderEvent(e))
        }
      </div>

      {past.length > 0 && (
        <div style={{ background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, overflow: 'hidden' }}>
          <div style={{ padding: '9px 20px', background: v3.bg.surface, borderBottom: `1px solid ${v3.border.subtle}` }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Recent Past</span>
          </div>
          {past.map(e => (
            <div key={e.id} style={{ opacity: 0.55 }}>
              {renderEvent(e)}
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
      {editEvent && <EditEventModal event={editEvent} onClose={() => setEditEvent(null)} />}
    </div>
  )
}
