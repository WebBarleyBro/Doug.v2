'use client'
import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Play, Users } from 'lucide-react'
import LayoutShell from '../layout-shell'
import ConfirmModal from '../components/ConfirmModal'
import { getEvents, getClients, createEvent, deleteEvent, getCampaigns } from '../lib/data'
import { getSupabase } from '../lib/supabase'
import { t, card, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle } from '../lib/theme'
import { formatShortDateMT, todayMT } from '../lib/formatters'
import { EVENT_TYPE_LABELS } from '../lib/constants'
import type { Client } from '../lib/types'

const EVENT_TYPE_COLORS: Record<string, string> = {
  tasting: '#d4a843', brand_dinner: '#f43f5e', meeting: '#4a9eff', planned_stop: '#3dba78',
  milestone: '#a78bfa', training: '#e89a2e', other: '#6b6966',
}

const CAMPAIGN_COLOR = '#a78bfa'
const MILESTONE_COLOR = '#f472b6'

const CATEGORY_OPTIONS = [
  'All', 'Tasting', 'Dinner', 'Meeting', 'Demo', 'Training', 'Event', 'Campaign', 'Milestone',
]

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
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', event_type: 'tasting', client_slug: '', client_slugs: [] as string[], start_time: todayMT() + 'T10:00', end_time: '', notes: '', url: '', status: 'planned' })
  const [isMobile, setIsMobile] = useState(false)
  const [tastingCounts, setTastingCounts] = useState<Record<string, number>>({})
  const [deleteEventTarget, setDeleteEventTarget] = useState<any>(null)
  const [createErr, setCreateErr] = useState('')
  const [createSaving, setCreateSaving] = useState(false)

  // Filters
  const [filterUser, setFilterUser] = useState('all')
  const [filterClient, setFilterClient] = useState('all')
  const [filterCategory, setFilterCategory] = useState('All')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const load = useCallback(async () => {
    const monthStart = new Date(viewYear, viewMonth, 1).toISOString()
    const monthEnd = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).toISOString()
    const [evs, camps] = await Promise.all([
      getEvents({ since: monthStart, until: monthEnd }).catch(() => []),
      getCampaigns().catch(() => []),
    ])
    setEvents(evs)
    setCampaigns(camps)
  }, [viewMonth, viewYear])

  useEffect(() => { load() }, [load])

  // Load clients independently so a failed events query can't wipe them out
  useEffect(() => {
    getClients().then(setClients).catch(() => {})
  }, [])

  // Load users for filter
  useEffect(() => {
    const sb = getSupabase()
    sb.from('user_profiles').select('id, name, full_name').in('role', ['owner', 'rep'])
      .then(({ data }) => setUsers(data || []))
      .catch(() => {})
  }, [])

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const monthName = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Build campaign entries for the month
  const campaignEntries: { dateStr: string; title: string; color: string; isCampaign: boolean; isMilestone: boolean; clientSlug: string }[] = []
  campaigns.forEach((camp: any) => {
    const color = camp.clients?.color || CAMPAIGN_COLOR
    const clientSlug = camp.client_slug || ''
    // Campaign start/end as entries
    if (camp.start_date) {
      const d = camp.start_date.slice(0, 10)
      const [y, m] = d.split('-').map(Number)
      if (y === viewYear && m - 1 === viewMonth) {
        campaignEntries.push({ dateStr: d, title: `📣 ${camp.name}`, color, isCampaign: true, isMilestone: false, clientSlug })
      }
    }
    // Milestones
    if (camp.campaign_milestones) {
      camp.campaign_milestones.forEach((ms: any) => {
        if (ms.due_date) {
          const d = ms.due_date.slice(0, 10)
          const [y, m] = d.split('-').map(Number)
          if (y === viewYear && m - 1 === viewMonth) {
            campaignEntries.push({ dateStr: d, title: ms.title, color: MILESTONE_COLOR, isCampaign: false, isMilestone: true, clientSlug })
          }
        }
      })
    }
  })

  function getEventsForDay(day: number) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    let evs = events.filter(e => e.start_time?.startsWith(dateStr))

    // Apply filters
    if (filterUser !== 'all') {
      evs = evs.filter(e => e.user_id === filterUser || e.created_by === filterUser)
    }
    if (filterClient !== 'all') {
      evs = evs.filter(e => e.client_slug === filterClient)
    }
    if (filterCategory !== 'All') {
      const cat = filterCategory.toLowerCase()
      evs = evs.filter(e => {
        const type = (e.event_type || '').toLowerCase()
        return type === cat || type.includes(cat)
      })
    }

    const camps = filterCategory === 'All' || filterCategory === 'Campaign'
      ? campaignEntries.filter(ce => ce.dateStr === dateStr && !ce.isMilestone && (filterClient === 'all' || ce.clientSlug === filterClient || ce.clientSlug === ''))
      : []
    const milestones = filterCategory === 'All' || filterCategory === 'Milestone'
      ? campaignEntries.filter(ce => ce.dateStr === dateStr && ce.isMilestone && (filterClient === 'all' || ce.clientSlug === filterClient || ce.clientSlug === ''))
      : []

    return { evs, camps, milestones }
  }

  const selectedDateStr = selectedDay
    ? `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null
  const selectedDayData = selectedDay ? getEventsForDay(selectedDay) : { evs: [], camps: [], milestones: [] }

  useEffect(() => {
    const tastingIds = selectedDayData.evs.filter((e: any) => e.event_type === 'tasting').map((e: any) => e.id)
    const uncounted = tastingIds.filter((id: string) => !(id in tastingCounts))
    if (uncounted.length) loadTastingCounts(uncounted)
  }, [selectedDay])
  const allSelectedItems = [
    ...selectedDayData.evs,
    ...selectedDayData.camps.map(c => ({ ...c, _isCampaignEntry: true })),
    ...selectedDayData.milestones.map(m => ({ ...m, _isMilestoneEntry: true })),
  ]

  async function loadTastingCounts(eventIds: string[]) {
    if (!eventIds.length) return
    const sb = getSupabase()
    const results = await Promise.all(
      eventIds.map(id => sb.from('tasting_consumers').select('id', { count: 'exact', head: true }).eq('event_id', id))
    )
    const counts: Record<string, number> = {}
    eventIds.forEach((id, i) => { counts[id] = results[i].count || 0 })
    setTastingCounts(prev => ({ ...prev, ...counts }))
  }

  async function handleCreate() {
    setCreateErr('')
    setCreateSaving(true)
    try {
      const payload: Record<string, any> = {
        name: form.title,
        title: form.title,
        event_type: form.event_type,
        status: form.status,
        start_time: new Date(form.start_time).toISOString(),
      }
      if (form.event_type === 'tasting' && form.client_slugs.length > 0) {
        payload.client_slug = form.client_slugs[0]
        payload.client_slugs = form.client_slugs
      } else if (form.client_slug) {
        payload.client_slug = form.client_slug
      }
      if (form.end_time) payload.end_time = new Date(form.end_time).toISOString()
      if (form.notes) payload.notes = form.notes
      if (form.url) payload.url = form.url
      await createEvent(payload as any)
      setShowCreate(false)
      setForm({ title: '', event_type: 'tasting', client_slug: '', client_slugs: [], start_time: todayMT() + 'T10:00', end_time: '', notes: '', url: '', status: 'planned' })
      load()
    } catch (err: any) {
      setCreateErr(err.message || 'Failed to save event')
    } finally {
      setCreateSaving(false)
    }
  }

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: '16px', fontSize: '12px', cursor: 'pointer',
    whiteSpace: 'nowrap',
    backgroundColor: active ? t.goldDim : t.bg.card,
    color: active ? t.gold : t.text.secondary,
    fontWeight: active ? '600' : '400',
    border: `1px solid ${active ? t.gold : t.border.default}`,
  })

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1300px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h1 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>{monthName}</h1>
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
          {!isMobile && (
            <button onClick={() => setShowCreate(true)} style={btnPrimary}><Plus size={16} /> Add Event</button>
          )}
        </div>

        {/* Filter bar */}
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '16px',
          overflowX: 'auto', paddingBottom: '4px',
          msOverflowStyle: 'none', scrollbarWidth: 'none',
        }}>
          {/* User filter */}
          {users.length > 0 && (
            <select
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              style={{ ...pillStyle(filterUser !== 'all'), paddingRight: '20px', appearance: 'none' as const, outline: 'none', colorScheme: 'dark' }}
            >
              <option value="all">All Users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name || u.full_name}</option>)}
            </select>
          )}

          {/* Client filter */}
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            style={{ ...pillStyle(filterClient !== 'all'), paddingRight: '20px', appearance: 'none' as const, outline: 'none', colorScheme: 'dark' }}
          >
            <option value="all">All Brands</option>
            {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>

          {/* Category filter pills */}
          {CATEGORY_OPTIONS.map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat)} style={pillStyle(filterCategory === cat)}>
              {cat}
            </button>
          ))}

          {isMobile && (
            <button onClick={() => setShowCreate(true)} style={{ ...pillStyle(false), backgroundColor: t.goldDim, color: t.gold, border: `1px solid ${t.gold}`, flexShrink: 0 }}>
              <Plus size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Add
            </button>
          )}
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', marginBottom: '1px' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ padding: isMobile ? '4px 2px' : '8px', textAlign: 'center', fontSize: isMobile ? '9px' : '11px', fontWeight: '600', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: t.border.subtle }}>
          {/* Empty cells before first day */}
          {[...Array(firstDay)].map((_, i) => (
            <div key={`empty-${i}`} style={{ backgroundColor: t.bg.page, minHeight: isMobile ? '48px' : '80px' }} />
          ))}
          {/* Day cells */}
          {[...Array(daysInMonth)].map((_, i) => {
            const day = i + 1
            const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
            const { evs: dayEvents, camps: dayCamps, milestones: dayMilestones } = getEventsForDay(day)
            const allDayItems = [...dayEvents, ...dayCamps, ...dayMilestones]
            const isSelected = selectedDay === day
            return (
              <div key={day} onClick={() => setSelectedDay(day === selectedDay ? null : day)} style={{
                backgroundColor: isSelected ? t.bg.elevated : t.bg.page,
                minHeight: isMobile ? '48px' : '80px',
                padding: isMobile ? '4px' : '8px',
                cursor: 'pointer',
                transition: 'background 150ms ease',
                outline: isSelected ? `1px solid ${t.border.hover}` : 'none',
                outlineOffset: '-1px',
              }}>
                <div style={{
                  width: isMobile ? 20 : 26, height: isMobile ? 20 : 26, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isMobile ? '11px' : '13px', fontWeight: isToday ? '700' : '400',
                  backgroundColor: isToday ? t.gold : 'transparent',
                  color: isToday ? '#0f0f0d' : t.text.primary,
                  marginBottom: '2px',
                }}>
                  {day}
                </div>
                {!isMobile && allDayItems.slice(0, 3).map((e: any, idx: number) => {
                  if (e._isCampaignEntry || e._isMilestoneEntry) {
                    return (
                      <div key={`camp-${idx}`} style={{
                        fontSize: '10px', padding: '1px 5px', borderRadius: '4px', marginBottom: '2px',
                        backgroundColor: e.color + '20',
                        color: e.color,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontWeight: '500',
                      }}>
                        {e.title}
                      </div>
                    )
                  }
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
                {isMobile && allDayItems.length > 0 && (
                  <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', marginTop: '2px' }}>
                    {allDayItems.slice(0, 3).map((e: any, idx: number) => {
                      const color = e._isCampaignEntry || e._isMilestoneEntry
                        ? e.color
                        : (clients.find(c => c.slug === e.client_slug)?.color || EVENT_TYPE_COLORS[e.event_type] || t.gold)
                      return <div key={idx} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
                    })}
                    {allDayItems.length > 3 && <div style={{ fontSize: '8px', color: t.text.muted }}>+{allDayItems.length - 3}</div>}
                  </div>
                )}
                {!isMobile && allDayItems.length > 3 && <div style={{ fontSize: '10px', color: t.text.muted }}>+{allDayItems.length - 3} more</div>}
              </div>
            )
          })}
        </div>

        {/* Selected day events */}
        {selectedDay && allSelectedItems.length > 0 && (
          <div style={{ ...card, marginTop: '20px', padding: isMobile ? '16px' : '20px 24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary, marginBottom: '14px' }}>
              {new Date(viewYear, viewMonth, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            {allSelectedItems.map((e: any, idx: number) => {
              if (e._isCampaignEntry || e._isMilestoneEntry) {
                return (
                  <div key={`camp-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${t.border.subtle}` }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: e.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: t.text.primary }}>{e.title}</div>
                      <div style={{ fontSize: '11px', color: t.text.muted }}>{e.isMilestone ? 'Campaign Milestone' : 'Campaign'}</div>
                    </div>
                  </div>
                )
              }
              const client = clients.find(c => c.slug === e.client_slug)
              const color = client?.color || EVENT_TYPE_COLORS[e.event_type] || t.gold
              const isTasting = e.event_type === 'tasting'
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${t.border.subtle}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: t.text.primary }}>{e.title}</div>
                    <div style={{ fontSize: '11px', color: t.text.muted, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>{EVENT_TYPE_LABELS[e.event_type as keyof typeof EVENT_TYPE_LABELS]}{e.accounts?.name && ` · ${e.accounts.name}`}{client && ` · ${client.name}`}</span>
                      {isTasting && tastingCounts[e.id] !== undefined && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: t.text.secondary }}>
                          <Users size={10} /> {tastingCounts[e.id]} response{tastingCounts[e.id] !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()} style={{ fontSize: '11px', color: t.gold, textDecoration: 'none', marginTop: '2px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔗 RSVP / Link</a>}
                  </div>
                  {isTasting && (
                    <a href={`/taste/${e.id}`} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()} title="Open tasting kiosk" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: '#0f0f0d', backgroundColor: t.gold, border: 'none', borderRadius: '8px', padding: '7px 14px', textDecoration: 'none', flexShrink: 0 }}>
                      <Play size={13} fill="#0f0f0d" /> Start Tasting
                    </a>
                  )}
                  <button onClick={() => setDeleteEventTarget(e)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Create event modal */}
        {showCreate && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary }}>New Event</h3>
                <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div><label style={labelStyle}>Title</label><input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Event name..." style={inputStyle} /></div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value, client_slugs: [] }))} style={{ ...selectStyle, colorScheme: 'dark' }}>
                    {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {form.event_type === 'tasting' ? (
                  <div>
                    <label style={labelStyle}>Brands being poured</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                      {clients.map(c => {
                        const active = form.client_slugs.includes(c.slug)
                        return (
                          <button key={c.slug} type="button"
                            onClick={() => setForm(f => ({ ...f, client_slugs: active ? f.client_slugs.filter(s => s !== c.slug) : [...f.client_slugs, c.slug] }))}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '10px', border: `2px solid ${active ? (c.color || t.gold) : t.border.default}`, backgroundColor: active ? (c.color || t.gold) + '18' : t.bg.card, cursor: 'pointer', transition: 'all 150ms ease', flexShrink: 0 }}>
                            {c.logo_url
                              ? <img src={c.logo_url} alt={c.name} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
                              : <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: (c.color || t.gold) + '30', border: `1px solid ${c.color || t.gold}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: c.color || t.gold }}>{c.name.charAt(0)}</div>
                            }
                            <span style={{ fontSize: 13, fontWeight: 600, color: active ? (c.color || t.gold) : t.text.primary }}>{c.name}</span>
                            {active && <div style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: c.color || t.gold, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3l2.5 2.5L8 1" stroke="#0f0f0d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
                          </button>
                        )
                      })}
                    </div>
                    {form.client_slugs.length === 0 && <p style={{ fontSize: 12, color: t.text.muted, marginTop: 6 }}>Select at least one brand</p>}
                  </div>
                ) : (
                  <div><label style={labelStyle}>Brand</label>
                    <select value={form.client_slug} onChange={e => setForm(f => ({ ...f, client_slug: e.target.value }))} style={{ ...selectStyle, colorScheme: 'dark' }}>
                      <option value="">No brand</option>
                      {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div><label style={labelStyle}>Start</label><input type="datetime-local" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={{ ...inputStyle, boxSizing: 'border-box', colorScheme: 'dark' }} /></div>
                  <div><label style={labelStyle}>End (optional)</label><input type="datetime-local" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={{ ...inputStyle, boxSizing: 'border-box', colorScheme: 'dark' }} /></div>
                </div>
                <div><label style={labelStyle}>Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'none' }} /></div>
                <div><label style={labelStyle}>URL / RSVP Link (optional)</label><input type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." style={inputStyle} /></div>
              </div>
              {createErr && (
                <div style={{ marginTop: '12px', padding: '10px 14px', backgroundColor: t.status.dangerBg, border: `1px solid rgba(232,85,64,0.3)`, borderRadius: '8px', fontSize: '13px', color: t.status.danger }}>
                  {createErr}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px', flexWrap: 'wrap' }}>
                <button onClick={() => { setShowCreate(false); setCreateErr('') }} style={btnSecondary}>Cancel</button>
                <button onClick={handleCreate} disabled={!form.title || createSaving} style={{ ...btnPrimary, opacity: (!form.title || createSaving) ? 0.6 : 1 }}>
                  {createSaving ? 'Saving…' : 'Save Event'}
                </button>
                {form.event_type === 'tasting' && (
                  <button
                    onClick={async () => {
                      setCreateErr('')
                      setCreateSaving(true)
                      try {
                        const payload: Record<string, any> = {
                          name: form.title,
                          title: form.title,
                          event_type: form.event_type,
                          status: form.status,
                          start_time: new Date(form.start_time).toISOString(),
                        }
                        if (form.client_slugs.length > 0) {
                          payload.client_slug = form.client_slugs[0]
                          payload.client_slugs = form.client_slugs
                        } else if (form.client_slug) {
                          payload.client_slug = form.client_slug
                        }
                        if (form.end_time) payload.end_time = new Date(form.end_time).toISOString()
                        if (form.notes) payload.notes = form.notes
                        if (form.url) payload.url = form.url
                        const created = await createEvent(payload as any)
                        setShowCreate(false)
                        setForm({ title: '', event_type: 'tasting', client_slug: '', client_slugs: [], start_time: todayMT() + 'T10:00', end_time: '', notes: '', url: '', status: 'planned' })
                        load()
                        window.open(`/taste/${created.id}`, '_blank')
                      } catch (err: any) {
                        setCreateErr(err.message || 'Failed to save event')
                      } finally {
                        setCreateSaving(false)
                      }
                    }}
                    disabled={!form.title || createSaving}
                    style={{ ...btnPrimary, opacity: (!form.title || createSaving) ? 0.6 : 1, backgroundColor: t.gold, display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Play size={14} fill="#0f0f0d" /> Save & Start Tasting
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={!!deleteEventTarget}
        onClose={() => setDeleteEventTarget(null)}
        onConfirm={async () => {
          if (!deleteEventTarget) return
          await deleteEvent(deleteEventTarget.id)
          setDeleteEventTarget(null)
          load()
        }}
        title="Delete Event"
        message={`Delete "${deleteEventTarget?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </LayoutShell>
  )
}
