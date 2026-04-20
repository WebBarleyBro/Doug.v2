'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  MapPin, Package, DollarSign, CheckSquare, Clock, AlertCircle,
  ChevronRight, Plus, Search, X, Calendar, Users, BarChart3,
  TrendingUp, Star, ArrowRight,
} from 'lucide-react'
import LayoutShell, { useApp } from './layout-shell'
import VisitLogModal from './components/VisitLogModal'
import StatCard from './components/StatCard'
import EmptyState from './components/EmptyState'
import { StatsSkeleton, CardSkeleton } from './components/LoadingSkeleton'
import {
  getDashboardStats, getTodaySchedule, getFollowUpVisits,
  getOverdueAccounts, getTasks, globalSearch, completeTask,
  getOrders, getClients,
} from './lib/data'
import { getSupabase } from './lib/supabase'
import { t, badge, card, btnPrimary, btnSecondary } from './lib/theme'
import { formatCurrency, formatShortDateMT, relativeTimeStr, daysAgoMT, todayMT } from './lib/formatters'
import { overdueColor } from './lib/theme'
import type { UserProfile, Task } from './lib/types'

// ─── Desktop Dashboard ────────────────────────────────────────────────────

function DesktopDashboard({ profile }: { profile: UserProfile }) {
  const [stats, setStats] = useState<any>(null)
  const [commission, setCommission] = useState(0)
  const [schedule, setSchedule] = useState<any>(null)
  const [followups, setFollowups] = useState<any[]>([])
  const [overdue, setOverdue] = useState<any[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [visitModal, setVisitModal] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  const isOwner = profile.role === 'owner'

  const load = useCallback(async () => {
    try {
      const [s, sched, fu, od, t] = await Promise.all([
        getDashboardStats(profile.id, isOwner).catch(e => { console.error('stats err', e); return null }),
        getTodaySchedule(profile.id).catch(e => { console.error('schedule err', e); return null }),
        getFollowUpVisits().catch(e => { console.error('followup err', e); return [] }),
        getOverdueAccounts().catch(e => { console.error('overdue err', e); return [] }),
        getTasks({ userId: profile.id, completed: false }).catch(e => { console.error('tasks err', e); return [] }),
      ])
      setStats(s); setSchedule(sched); setFollowups(fu ?? []); setOverdue(od ?? []); setTasks(t ?? [])
    } catch (e) { console.error('dashboard load err', e) }
    finally { setLoading(false) }

    // Commission in a separate try so it never blocks the rest
    try {
      const [orders, clients] = await Promise.all([getOrders(), getClients()])
      const rateMap = Object.fromEntries(clients.map((c: any) => [c.slug, c.commission_rate || 0]))
      const thisMonth = new Date().toISOString().slice(0, 7)
      const monthComm = orders
        .filter((o: any) => (o.created_at || '').slice(0, 7) === thisMonth)
        .reduce((sum: number, o: any) => {
          const stored = Number(o.commission_amount) || 0
          if (stored > 0) return sum + stored
          return sum + Number(o.total_amount || 0) * (rateMap[o.client_slug] || 0)
        }, 0)
      setCommission(monthComm)
    } catch (e) { console.error('commission err', e) }
  }, [profile.id, isOwner])

  useEffect(() => { load() }, [load])

  // Search
  useEffect(() => {
    if (!search || search.length < 2) { setSearchResults(null); return }
    const t = setTimeout(() => {
      globalSearch(search).then(setSearchResults)
    }, 200)
    return () => clearTimeout(t)
  }, [search])

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div style={{ padding: '32px 48px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em', marginBottom: '4px' }}>
            {greeting}, {profile.name?.split(' ')[0] || profile.email?.split('@')[0] || 'there'}
          </h1>
          <p style={{ fontSize: '13px', color: t.text.muted }}>{today}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.text.muted }} />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setSearchOpen(true) }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search accounts, contacts..."
                style={{
                  backgroundColor: t.bg.card,
                  border: `1px solid ${t.border.default}`,
                  borderRadius: '8px',
                  padding: '9px 12px 9px 34px',
                  color: t.text.primary,
                  fontSize: '13px',
                  width: '240px',
                  outline: 'none',
                }}
              />
              {search && (
                <button onClick={() => { setSearch(''); setSearchResults(null) }}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '2px' }}>
                  <X size={12} />
                </button>
              )}
            </div>
            {searchOpen && searchResults && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                backgroundColor: t.bg.elevated,
                border: `1px solid ${t.border.hover}`,
                borderRadius: '10px',
                marginTop: '6px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                overflow: 'hidden',
              }}>
                {searchResults.accounts?.map((a: any) => (
                  <Link key={a.id} href={`/accounts/${a.id}`} onClick={() => setSearchOpen(false)} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', textDecoration: 'none',
                    borderBottom: `1px solid ${t.border.subtle}`,
                  }}>
                    <MapPin size={14} color={t.text.muted} />
                    <div>
                      <div style={{ fontSize: '13px', color: t.text.primary }}>{a.name}</div>
                      {a.address && <div style={{ fontSize: '11px', color: t.text.muted }}>{a.address}</div>}
                    </div>
                  </Link>
                ))}
                {searchResults.contacts?.map((c: any) => (
                  <Link key={c.id} href={`/contacts`} onClick={() => setSearchOpen(false)} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', textDecoration: 'none',
                    borderBottom: `1px solid ${t.border.subtle}`,
                  }}>
                    <Users size={14} color={t.text.muted} />
                    <div>
                      <div style={{ fontSize: '13px', color: t.text.primary }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: t.text.muted }}>{c.role} · {c.accounts?.name}</div>
                    </div>
                  </Link>
                ))}
                {!searchResults.accounts?.length && !searchResults.contacts?.length && (
                  <div style={{ padding: '16px 14px', fontSize: '13px', color: t.text.muted }}>No results found</div>
                )}
              </div>
            )}
          </div>
          <button onClick={() => setVisitModal(true)} style={btnPrimary}>
            <Plus size={16} /> Log Visit
          </button>
        </div>
      </div>

      {/* Stats */}
      {loading ? <StatsSkeleton /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
          <StatCard label={isOwner ? 'Team Visits This Month' : 'My Visits This Month'}
            value={stats?.teamVisits || 0}
            icon={<MapPin size={22} />}
            color={t.gold}
            subtext={isOwner && stats?.myVisits !== stats?.teamVisits ? `${stats?.myVisits} by you` : undefined}
          />
          <StatCard label="Active Placements"
            value={stats?.activePlacements || 0}
            icon={<Package size={22} />}
            color={t.status.success}
            href="/placements"
          />
          <StatCard
            label="Commission This Month"
            value={formatCurrency(commission)}
            icon={<DollarSign size={22} />}
            color={t.status.info}
            href="/finance"
          />
          <StatCard label="Open Tasks"
            value={stats?.openTasks || 0}
            icon={<CheckSquare size={22} />}
            color={stats?.openTasks > 10 ? t.status.warning : t.text.muted}
          />
        </div>
      )}

      {/* Main 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>

        {/* Column 1: Today's Schedule */}
        <div style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.bg.elevated }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={14} color={t.status.info} />
              <span style={{ fontSize: '12px', fontWeight: '700', color: t.text.primary }}>Today's Schedule</span>
            </div>
            <Link href="/planner" style={{ fontSize: '11px', color: t.gold, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '600' }}>View all <ChevronRight size={11} /></Link>
          </div>
          <div style={{ padding: '12px' }}>
            {loading ? <CardSkeleton count={3} /> : !schedule?.events?.length && !schedule?.tasks?.length && !schedule?.milestones?.length ? (
              <EmptyState icon={<Calendar size={28} />} title="Nothing scheduled today" subtitle="Use the planner to add stops" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {schedule?.events?.map((e: any) => (
                  <ScheduleItem key={e.id} type="event" title={e.title} sub={e.accounts?.name} time={e.start_time} />
                ))}
                {schedule?.milestones?.map((m: any) => (
                  <ScheduleItem key={m.id} type="milestone" title={m.title} sub={m.campaigns?.title} />
                ))}
                {schedule?.tasks?.map((task: any) => (
                  <ScheduleItem key={task.id} type="task" title={task.title} sub={task.accounts?.name}
                    onComplete={() => completeTask(task.id).then(load)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Follow-Ups Due */}
        <div style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.bg.elevated }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={14} color={t.status.warning} />
              <span style={{ fontSize: '12px', fontWeight: '700', color: t.text.primary }}>Follow-Ups Due</span>
              {followups.length > 0 && <span style={{ fontSize: '10px', backgroundColor: 'rgba(234,179,8,0.15)', color: t.status.warning, borderRadius: '10px', padding: '2px 7px', fontWeight: '700' }}>{followups.length}</span>}
            </div>
            <Link href="/accounts" style={{ fontSize: '11px', color: t.gold, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '600' }}>View all <ChevronRight size={11} /></Link>
          </div>
          <div style={{ padding: '12px' }}>
            {loading ? <CardSkeleton count={3} /> : followups.length === 0 ? (
              <EmptyState icon={<CheckSquare size={28} />} title="No follow-ups pending" subtitle="You're all caught up!" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {followups.slice(0, 8).map(v => (
                  <Link key={v.id} href={`/accounts/${v.account_id}`} style={{
                    backgroundColor: t.bg.card, border: `1px solid ${t.border.subtle}`, borderRadius: '8px',
                    textDecoration: 'none', display: 'block', padding: '10px 14px',
                    transition: 'border-color 150ms ease',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.accounts?.name}
                        </div>
                        <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>
                          {relativeTimeStr(v.visited_at)}
                        </div>
                      </div>
                      <span style={badge.visitStatus(v.status)}>{v.status}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Accounts Overdue */}
        <div style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.bg.elevated }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={14} color={t.status.danger} />
              <span style={{ fontSize: '12px', fontWeight: '700', color: t.text.primary }}>Accounts Overdue</span>
              {overdue.length > 0 && <span style={{ fontSize: '10px', backgroundColor: 'rgba(224,82,82,0.15)', color: t.status.danger, borderRadius: '10px', padding: '2px 7px', fontWeight: '700' }}>{overdue.length}</span>}
            </div>
            <Link href="/accounts" style={{ fontSize: '11px', color: t.gold, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '600' }}>View all <ChevronRight size={11} /></Link>
          </div>
          <div style={{ padding: '12px' }}>
            {loading ? <CardSkeleton count={3} /> : overdue.length === 0 ? (
              <EmptyState icon={<Star size={28} />} title="All accounts up to date" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {overdue.slice(0, 8).map((acc: any) => {
                  const days = daysAgoMT(acc.last_visited)
                  const color = overdueColor(days)
                  return (
                    <Link key={acc.id} href={`/accounts/${acc.id}`} style={{
                      backgroundColor: t.bg.card, border: `1px solid ${t.border.subtle}`, borderRadius: '8px',
                      textDecoration: 'none', display: 'block', padding: '10px 14px',
                      borderLeft: `3px solid ${color}`, transition: 'border-color 150ms ease',
                    }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {acc.name}
                      </div>
                      <div style={{ fontSize: '11px', color: color, marginTop: '2px' }}>
                        {days === null ? 'Never visited' : `${days}d ago · Due every ${acc.visit_frequency_days}d`}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tasks section */}
      {tasks.length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <SectionHeader title="Open Tasks" count={tasks.length} />
          <div style={{
            backgroundColor: t.bg.card,
            border: `1px solid ${t.border.default}`,
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            {tasks.slice(0, 8).map((task, i) => (
              <TaskRow key={task.id} task={task} last={i === Math.min(tasks.length, 8) - 1}
                onComplete={() => completeTask(task.id).then(load)} />
            ))}
          </div>
        </div>
      )}

      <VisitLogModal
        isOpen={visitModal}
        onClose={() => setVisitModal(false)}
        onSuccess={load}
        userId={profile.id}
      />
    </div>
  )
}

// ─── Mobile Dashboard ─────────────────────────────────────────────────────

function MobileDashboard({ profile }: { profile: UserProfile }) {
  const { setShowVisitLog } = useApp()
  const [stats, setStats] = useState<any>(null)
  const [schedule, setSchedule] = useState<any>(null)
  const [followups, setFollowups] = useState<any[]>([])
  const [overdue, setOverdue] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [visitModal, setVisitModal] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, sched, fu, od] = await Promise.all([
        getDashboardStats(profile.id, profile.role === 'owner'),
        getTodaySchedule(profile.id),
        getFollowUpVisits(),
        getOverdueAccounts(),
      ])
      setStats(s); setSchedule(sched); setFollowups(fu); setOverdue(od)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [profile.id, profile.role])

  useEffect(() => { load() }, [load])

  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div style={{ padding: '16px', paddingBottom: '8px' }}>
      {/* Date + greeting */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '2px' }}>{today}</div>
        <div style={{ fontSize: '20px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>
          Hey {profile.name?.split(' ')[0] || profile.email?.split('@')[0] || 'there'} 👋
        </div>
      </div>

      {/* Big Log Visit button */}
      <button
        onClick={() => setVisitModal(true)}
        style={{
          width: '100%',
          padding: '16px',
          background: `linear-gradient(135deg, ${t.gold} 0%, #b8891e 100%)`,
          border: 'none',
          borderRadius: '14px',
          color: '#0f0f0d',
          fontSize: '16px',
          fontWeight: '700',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          marginBottom: '16px',
          boxShadow: `0 6px 24px rgba(212,168,67,0.3)`,
          letterSpacing: '-0.01em',
        }}
      >
        <Plus size={22} strokeWidth={2.5} /> Log a Visit
      </button>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        {loading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '10px', padding: '14px', height: '72px', animation: 'skeleton-pulse 1.2s ease-in-out infinite' }} />
            ))}
          </>
        ) : (
          <>
            <MiniStat label="Visits This Month" value={stats?.teamVisits || 0} color={t.gold} />
            <MiniStat label="Active Placements" value={stats?.activePlacements || 0} color={t.status.success} href="/placements" />
            <MiniStat label="Follow-Ups Due" value={followups.length} color={followups.length > 0 ? t.status.warning : t.text.muted} />
            <MiniStat label="Open Tasks" value={stats?.openTasks || 0} color={stats?.openTasks > 5 ? t.status.warning : t.text.muted} />
          </>
        )}
      </div>

      {/* Today's Schedule */}
      {!loading && (schedule?.events?.length > 0 || schedule?.tasks?.length > 0) && (
        <MobileSection title="Today" icon={<Calendar size={15} />}>
          {schedule.events?.slice(0, 3).map((e: any) => (
            <MobileListItem key={e.id} title={e.title} sub={e.accounts?.name} dot={t.status.info} />
          ))}
          {schedule.tasks?.slice(0, 3).map((task: any) => (
            <MobileListItem key={task.id} title={task.title} sub={task.accounts?.name} dot={t.gold} />
          ))}
        </MobileSection>
      )}

      {/* Follow-ups */}
      {followups.length > 0 && (
        <MobileSection title={`Follow-Ups (${followups.length})`} icon={<Clock size={15} />} href="/accounts">
          {followups.slice(0, 4).map(v => (
            <Link key={v.id} href={`/accounts/${v.account_id}`} style={{ textDecoration: 'none' }}>
              <MobileListItem
                title={v.accounts?.name}
                sub={`${relativeTimeStr(v.visited_at)} · ${v.status}`}
                dot={t.status.warning}
                chevron
              />
            </Link>
          ))}
        </MobileSection>
      )}

      {/* Overdue accounts */}
      {overdue.length > 0 && (
        <MobileSection title={`Overdue (${overdue.length})`} icon={<AlertCircle size={15} />} href="/accounts">
          {overdue.slice(0, 4).map((acc: any) => {
            const days = daysAgoMT(acc.last_visited)
            return (
              <Link key={acc.id} href={`/accounts/${acc.id}`} style={{ textDecoration: 'none' }}>
                <MobileListItem
                  title={acc.name}
                  sub={days === null ? 'Never visited' : `${days} days ago`}
                  dot={overdueColor(days)}
                  chevron
                />
              </Link>
            )
          })}
        </MobileSection>
      )}

      <VisitLogModal
        isOpen={visitModal}
        onClose={() => setVisitModal(false)}
        onSuccess={load}
        userId={profile.id}
        isMobile
      />
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────

function SectionHeader({ title, count, href }: { title: string; count?: number; href?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', paddingBottom: '10px', borderBottom: `1px solid ${t.border.subtle}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</span>
        {count !== undefined && count > 0 && (
          <span style={{ fontSize: '10px', backgroundColor: t.goldDim, color: t.gold, borderRadius: '10px', padding: '2px 7px', fontWeight: '700' }}>
            {count}
          </span>
        )}
      </div>
      {href && (
        <Link href={href} style={{ fontSize: '11px', color: t.gold, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '600', letterSpacing: '0.02em' }}>
          View all <ChevronRight size={11} />
        </Link>
      )}
    </div>
  )
}

function ScheduleItem({ type, title, sub, time, onComplete }: any) {
  const colors = { event: t.status.info, milestone: t.gold, task: t.status.success }
  return (
    <div style={{
      ...card, padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: '10px',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: colors[type as keyof typeof colors], flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: '500', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {sub && <div style={{ fontSize: '11px', color: t.text.muted }}>{sub}</div>}
      </div>
      {onComplete && (
        <button onClick={onComplete} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
          <CheckSquare size={14} />
        </button>
      )}
    </div>
  )
}

function TaskRow({ task, last, onComplete }: { task: Task; last: boolean; onComplete: () => void }) {
  const priorityColor: Record<string, string> = {
    urgent: t.status.danger, high: t.status.warning, medium: t.gold, low: t.text.muted,
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 16px',
      borderBottom: last ? 'none' : `1px solid ${t.border.subtle}`,
    }}>
      <button onClick={onComplete} style={{
        width: 18, height: 18, borderRadius: '4px',
        border: `1.5px solid ${t.border.hover}`,
        backgroundColor: 'transparent', cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
        {task.accounts && <div style={{ fontSize: '11px', color: t.text.muted }}>{(task.accounts as any).name}</div>}
      </div>
      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: priorityColor[task.priority] || t.text.muted, flexShrink: 0 }} />
    </div>
  )
}

function MiniStat({ label, value, color, href }: { label: string; value: number | string; color: string; href?: string }) {
  const inner = (
    <div style={{
      backgroundColor: t.bg.card,
      border: `1px solid ${t.border.default}`,
      borderRadius: '10px',
      padding: '14px',
    }}>
      <div style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em', lineHeight: 1, marginBottom: '4px' }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: t.text.muted, fontWeight: '500' }}>{label}</div>
      <div style={{ width: 24, height: 2, borderRadius: 1, backgroundColor: color, marginTop: '8px' }} />
    </div>
  )
  if (href) return <Link href={href} style={{ textDecoration: 'none' }}>{inner}</Link>
  return inner
}

function MobileSection({ title, icon, href, children }: any) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: t.text.muted }}>
          {icon}
          <span style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        </div>
        {href && (
          <Link href={href} style={{ color: t.text.muted, textDecoration: 'none' }}>
            <ChevronRight size={16} />
          </Link>
        )}
      </div>
      <div style={{
        backgroundColor: t.bg.card,
        border: `1px solid ${t.border.default}`,
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

function MobileListItem({ title, sub, dot, chevron }: { title: string; sub?: string; dot?: string; chevron?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 16px',
      borderBottom: `1px solid ${t.border.subtle}`,
    }}>
      {dot && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dot, flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: '500', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        {sub && <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '1px' }}>{sub}</div>}
      </div>
      {chevron && <ChevronRight size={16} color={t.text.muted} />}
    </div>
  )
}

// ─── Page root ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: p } = await sb.from('user_profiles').select('*').eq('id', user.id).single()
      if (p) setProfile(p)
    })
  }, [])

  if (!profile) return null

  return (
    <LayoutShell>
      {isMobile ? <MobileDashboard profile={profile} /> : <DesktopDashboard profile={profile} />}
    </LayoutShell>
  )
}
