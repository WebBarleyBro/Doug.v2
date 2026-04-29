'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  MapPin, Package, DollarSign, CheckSquare, Clock, AlertCircle,
  ChevronRight, Plus, Search, X, Calendar, Users, BarChart3,
  TrendingUp, Star, ArrowRight, Navigation,
} from 'lucide-react'
import LayoutShell, { useApp, useToast } from './layout-shell'
import VisitLogModal from './components/VisitLogModal'
import StatCard from './components/StatCard'
import EmptyState from './components/EmptyState'
import { StatsSkeleton, CardSkeleton } from './components/LoadingSkeleton'
import {
  getDashboardStats, getTodaySchedule, getFollowUpVisits,
  getOverdueAccounts, getTasks, globalSearch, completeTask,
  getVisitStreak, getClientSuggestions, clearFollowUp, dismissFollowUp,
  getPlannerStops, getPendingDistributorInquiries,
  acknowledgeClientSuggestion, createContact, createAccount, createTask, getAccounts,
} from './lib/data'
import type { PlannerStop } from './lib/data'
import { getSupabase } from './lib/supabase'
import { t, badge, card, btnPrimary, btnSecondary } from './lib/theme'
import { formatCurrency, formatShortDateMT, relativeTimeStr, daysAgoMT, todayMT } from './lib/formatters'
import { overdueColor } from './lib/theme'
import type { UserProfile, Task } from './lib/types'
import { useIsMobile } from './lib/use-is-mobile'

// ─── Desktop Dashboard ────────────────────────────────────────────────────

function DesktopDashboard({ profile }: { profile: UserProfile }) {
  const toast = useToast()
  const [stats, setStats] = useState<any>(null)
  const [commission, setCommission] = useState(0)
  const [schedule, setSchedule] = useState<any>(null)
  const [followups, setFollowups] = useState<any[]>([])
  const [overdue, setOverdue] = useState<any[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [streak, setStreak] = useState<{ streak: number; teamWeekVisits: number; bestDay: string | null } | null>(null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [suggestionLoading, setSuggestionLoading] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [visitModal, setVisitModal] = useState(false)
  const [followUpAccountId, setFollowUpAccountId] = useState<string | undefined>(undefined)
  const [activePlacementAccountIds, setActivePlacementAccountIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [showAllFollowUps, setShowAllFollowUps] = useState(false)
  const [plannerStops, setPlannerStops] = useState<PlannerStop[]>([])
  const [pendingInquiries, setPendingInquiries] = useState<any[]>([])

  const isOwner = profile.role === 'owner'

  const load = useCallback(async () => {
    try {
      const [s, sched, fu, od, taskData] = await Promise.all([
        getDashboardStats(profile.id, isOwner).catch(e => { console.error('stats err', e); return null }),
        getTodaySchedule(profile.id).catch(e => { console.error('schedule err', e); return null }),
        getFollowUpVisits().catch(e => { console.error('followup err', e); return [] }),
        getOverdueAccounts().catch(e => { console.error('overdue err', e); return [] }),
        getTasks({ userId: profile.id, completed: false }).catch(e => { console.error('tasks err', e); return [] }),
      ])
      setStats(s); setSchedule(sched); setFollowups(fu ?? []); setOverdue(od ?? []); setTasks(taskData ?? [])
      if (isOwner) {
        getClientSuggestions('new').then(setSuggestions).catch(() => {})
        getPendingDistributorInquiries().then(setPendingInquiries).catch(() => {})
      }
      // Fetch active placement account IDs for urgency scoring
      getSupabase().from('placements').select('account_id').is('lost_at', null).then(({ data }) => {
        setActivePlacementAccountIds(new Set((data || []).map((p: any) => p.account_id).filter(Boolean)))
      }).catch(() => {})
      // Visit streak
      getVisitStreak(profile.id).then(setStreak).catch(() => {})
      // Planner stops for today's progress
      getPlannerStops(profile.id, todayMT()).then(setPlannerStops).catch(() => {})
      // Commission comes from getDashboardStats to avoid duplicate fetches
      if (s?.commissionThisMonth !== undefined) setCommission(s.commissionThisMonth)
    } catch (e) { console.error('dashboard load err', e) }
    finally { setLoading(false) }
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
            {greeting}, {profile.name?.split(' ')[0] || 'there'}
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
                      <div style={{ fontSize: '11px', color: t.text.muted }}>{c.role}{c.accounts?.name ? ` · ${c.accounts.name}` : ''}</div>
                    </div>
                  </Link>
                ))}
                {searchResults.placements?.map((p: any) => (
                  <Link key={p.id} href={`/placements`} onClick={() => setSearchOpen(false)} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', textDecoration: 'none',
                    borderBottom: `1px solid ${t.border.subtle}`,
                  }}>
                    <Package size={14} color={t.text.muted} />
                    <div>
                      <div style={{ fontSize: '13px', color: t.text.primary }}>{p.product_name}</div>
                      {p.accounts?.name && <div style={{ fontSize: '11px', color: t.text.muted }}>{p.accounts.name}</div>}
                    </div>
                  </Link>
                ))}
                {searchResults.orders?.map((o: any) => (
                  <Link key={o.id} href={`/orders`} onClick={() => setSearchOpen(false)} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', textDecoration: 'none',
                    borderBottom: `1px solid ${t.border.subtle}`,
                  }}>
                    <Package size={14} color={t.gold} />
                    <div>
                      <div style={{ fontSize: '13px', color: t.text.primary }}>{o.po_number}</div>
                      {o.deliver_to_name && <div style={{ fontSize: '11px', color: t.text.muted }}>{o.deliver_to_name}</div>}
                    </div>
                  </Link>
                ))}
                {searchResults.visits?.map((v: any) => (
                  <Link key={v.id} href={v.accounts?.id ? `/accounts/${v.accounts.id}` : '/accounts'} onClick={() => setSearchOpen(false)} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', textDecoration: 'none',
                    borderBottom: `1px solid ${t.border.subtle}`,
                  }}>
                    <MapPin size={14} color={t.gold} />
                    <div>
                      <div style={{ fontSize: '13px', color: t.text.primary }}>{v.accounts?.name || 'Visit'}</div>
                      <div style={{ fontSize: '11px', color: t.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>{v.notes}</div>
                    </div>
                  </Link>
                ))}
                {!searchResults.accounts?.length && !searchResults.contacts?.length && !searchResults.placements?.length && !searchResults.orders?.length && !searchResults.visits?.length && (
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

      {isOwner && suggestions.length > 0 && (
        <div style={{ marginBottom: '20px', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${t.goldBorder}` }}>
            <AlertCircle size={14} color={t.gold} />
            <span style={{ fontSize: '12px', fontWeight: '700', color: t.gold }}>
              {suggestions.length} {suggestions.length === 1 ? 'suggestion' : 'suggestions'} from clients
            </span>
          </div>
          {suggestions.map((s: any, i: number) => {
            const isActioning = suggestionLoading === s.id
            const isAccount = s.suggestion_type !== 'contact'
            return (
              <div key={s.id} style={{ padding: '12px 16px', borderBottom: i < suggestions.length - 1 ? `1px solid ${t.border.subtle}` : 'none' }}>
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{s.name}</span>
                    <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', backgroundColor: isAccount ? 'rgba(74,158,255,0.12)' : 'rgba(100,200,100,0.12)', color: isAccount ? '#4a9eff' : '#4caf50', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {isAccount ? 'Account' : 'Contact'}
                    </span>
                    {!isAccount && s.contact_category === 'distributor' && (
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(233,153,40,0.15)', color: t.gold, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Distributor Rep
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: t.gold, fontWeight: '600' }}>{s.client_slug}</span>
                  </div>
                  {s.address && <div style={{ fontSize: '11px', color: t.text.muted }}>{s.address}</div>}
                  {s.reason && <div style={{ fontSize: '11px', color: t.text.secondary, marginTop: '2px' }}>{s.reason.replace(/_/g, ' ')}{s.reason_detail ? ` — ${s.reason_detail}` : ''}</div>}
                  {s.notes && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px', fontStyle: 'italic' }}>{s.notes}</div>}
                  {s.submitted_by_name && <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '4px' }}>Submitted by {s.submitted_by_name}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {isAccount ? (
                      <button
                        disabled={isActioning}
                        onClick={async () => {
                          setSuggestionLoading(s.id)
                          try {
                            const portalNotes = `Suggested via portal${s.submitted_by_name ? ` by ${s.submitted_by_name}` : ''}${s.reason ? ` · ${s.reason.replace(/_/g, ' ')}` : ''}${s.contact_person ? `\nContact there: ${s.contact_person}` : ''}${s.notes ? `\n${s.notes}` : ''}`
                            const newAccount = await createAccount({ name: s.name, address: s.address || undefined, account_type: 'on_premise', notes: portalNotes })
                            const due = new Date(); due.setDate(due.getDate() + 7)
                            await createTask({ user_id: profile.id, assigned_to: profile.id, title: `Visit ${s.name}`, description: `Suggested by ${s.client_slug}${s.submitted_by_name ? ` (${s.submitted_by_name})` : ''}${s.contact_person ? `. Ask for ${s.contact_person}.` : ''}`.trim(), priority: 'medium', due_date: due.toISOString().slice(0, 10), client_slug: s.client_slug }).catch(() => {})
                            if (s.contact_person) {
                              await createContact({ name: s.contact_person, client_slug: s.client_slug, account_id: (newAccount as any)?.id || null, category: 'general', notes: `Contact at ${s.name}. Suggested via portal by ${s.submitted_by_name || s.client_slug}.` }).catch(() => {})
                            }
                            await acknowledgeClientSuggestion(s.id)
                            setSuggestions(prev => prev.filter(x => x.id !== s.id))
                            toast(`${s.name} added · task created${s.contact_person ? ` · ${s.contact_person} added as contact` : ''}`)
                          } catch { toast('Failed to add account', 'error') }
                          setSuggestionLoading(null)
                        }}
                        style={{ fontSize: '11px', fontWeight: '700', padding: '5px 10px', borderRadius: '6px', border: `1px solid ${t.goldBorder}`, background: t.goldDim, color: t.gold, cursor: isActioning ? 'default' : 'pointer', opacity: isActioning ? 0.6 : 1 }}
                      >
                        {isActioning ? 'Adding…' : s.contact_person ? '+ Add Account & Contact' : '+ Add Account + Task'}
                      </button>
                    ) : (
                      <button
                        disabled={isActioning}
                        onClick={async () => {
                          setSuggestionLoading(s.id)
                          try {
                            const accounts = await getAccounts().catch(() => [])
                            const workplaceName = s.address || ''
                            const match = workplaceName ? accounts.find((a: any) => a.name.toLowerCase().includes(workplaceName.toLowerCase()) || workplaceName.toLowerCase().includes(a.name.toLowerCase())) : null
                            const notes = [
                              workplaceName ? `Works at: ${workplaceName}` : null,
                              s.reason ? s.reason.replace(/_/g, ' ') : null,
                              s.reason_detail || null,
                              s.notes || null,
                              `Suggested via portal${s.submitted_by_name ? ` by ${s.submitted_by_name}` : ''}`,
                            ].filter(Boolean).join('\n')
                            await createContact({ name: s.name, client_slug: s.client_slug, account_id: match?.id || null, category: (s.contact_category || 'general') as any, notes })
                            await acknowledgeClientSuggestion(s.id)
                            setSuggestions(prev => prev.filter(x => x.id !== s.id))
                            toast(`${s.name} added to contacts${match ? ` · linked to ${match.name}` : ''}`)
                          } catch { toast('Failed to add contact', 'error') }
                          setSuggestionLoading(null)
                        }}
                        style={{ fontSize: '11px', fontWeight: '700', padding: '5px 10px', borderRadius: '6px', border: `1px solid ${t.goldBorder}`, background: t.goldDim, color: t.gold, cursor: isActioning ? 'default' : 'pointer', opacity: isActioning ? 0.6 : 1 }}
                      >
                        {isActioning ? 'Adding…' : '+ Add Contact'}
                      </button>
                    )}
                  </div>
                  <button
                    disabled={isActioning}
                    onClick={async () => {
                      setSuggestionLoading(s.id)
                      await acknowledgeClientSuggestion(s.id).catch(() => {})
                      setSuggestions(prev => prev.filter(x => x.id !== s.id))
                      setSuggestionLoading(null)
                    }}
                    style={{ fontSize: '11px', fontWeight: '500', padding: '5px 10px', borderRadius: '6px', border: 'none', background: 'transparent', color: t.text.muted, cursor: isActioning ? 'default' : 'pointer', opacity: isActioning ? 0.6 : 1 }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isOwner && pendingInquiries.length > 0 && (
        <div style={{ marginBottom: '20px', backgroundColor: 'rgba(233,153,40,0.07)', border: `1px solid rgba(233,153,40,0.22)`, borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid rgba(233,153,40,0.15)`, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={14} color={t.status.warning} />
              <span style={{ fontSize: '12px', fontWeight: '700', color: t.status.warning }}>
                {pendingInquiries.length} Pending Distributor {pendingInquiries.length === 1 ? 'Inquiry' : 'Inquiries'}
              </span>
            </div>
            <Link href="/orders" style={{ fontSize: '11px', color: t.gold, textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
              View all <ChevronRight size={11} />
            </Link>
          </div>
          {pendingInquiries.slice(0, 5).map((o: any, i: number) => {
            const isOverdue = o.distributor_status === 'contacted'
            const daysAgo = o.distributor_contacted_at
              ? Math.floor((Date.now() - new Date(o.distributor_contacted_at).getTime()) / 86400_000)
              : null
            return (
              <div key={o.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
                borderBottom: i < Math.min(pendingInquiries.length, 5) - 1 ? `1px solid ${t.border.subtle}` : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{o.deliver_to_name}</span>
                  {o.client_slug && <span style={{ fontSize: '12px', color: t.text.muted, marginLeft: '8px' }}>{o.client_slug}</span>}
                </div>
                <span style={{ fontSize: '11px', color: isOverdue ? t.status.danger : t.text.muted, flexShrink: 0 }}>
                  {isOverdue && daysAgo !== null ? `⚠ ${daysAgo}d ago — no response` : 'Not contacted'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Stats */}
      {loading ? <StatsSkeleton /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
          <StatCard label={isOwner ? 'Team Visits This Month' : 'My Visits This Month'}
            value={stats?.teamVisits || 0}
            icon={<MapPin size={22} />}
            color={t.gold}
            subtext={isOwner && stats?.myVisits !== stats?.teamVisits ? `${stats?.myVisits} by you` : undefined}
            href="/visits"
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

      {/* Visit Streak + Team Momentum */}
      {streak !== null && (streak.streak > 0 || streak.teamWeekVisits > 0) && (
        <div style={{ ...card, marginBottom: '20px', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
          {streak.streak > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>🔥</span>
              <div>
                <span style={{ fontSize: '15px', fontWeight: '700', color: t.gold }}>{streak.streak}-day streak</span>
                <span style={{ fontSize: '12px', color: t.text.muted, marginLeft: '6px' }}>keep it up</span>
              </div>
            </div>
          )}
          {streak.teamWeekVisits > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} color={t.status.success} />
              <span style={{ fontSize: '13px', color: t.text.secondary }}>
                <span style={{ fontWeight: '700', color: t.status.success }}>{streak.teamWeekVisits}</span> team visits this week
              </span>
            </div>
          )}
          {streak.bestDay && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Star size={14} color={t.text.muted} />
              <span style={{ fontSize: '12px', color: t.text.muted }}>Best day: <span style={{ color: t.text.secondary, fontWeight: '600' }}>{streak.bestDay}</span></span>
            </div>
          )}
        </div>
      )}

      {/* Today's Route Progress */}
      {plannerStops.length > 0 && (
        <DailyProgressBar stops={plannerStops} />
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
          <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${t.border.subtle}`, backgroundColor: t.bg.elevated }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={14} color={t.status.warning} />
              <span style={{ fontSize: '12px', fontWeight: '700', color: t.text.primary }}>Follow-Up Queue</span>
              {followups.length > 0 && <span style={{ fontSize: '10px', backgroundColor: 'rgba(234,179,8,0.15)', color: t.status.warning, borderRadius: '10px', padding: '2px 7px', fontWeight: '700' }}>{followups.length}</span>}
            </div>
            <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '4px' }}>
              Visits you marked "Will Order Soon" or "Needs Follow Up" — sorted by urgency
            </div>
          </div>
          <div style={{ padding: '12px' }}>
            {loading ? <CardSkeleton count={3} /> : followups.length === 0 ? (
              <EmptyState icon={<CheckSquare size={28} />} title="No follow-ups pending" subtitle="You're all caught up!" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[...followups]
                  .map(v => {
                    const days = daysAgoMT(v.visited_at) ?? 0
                    const statusScore = v.status === 'Will Order Soon' ? 40 : v.status === 'Needs Follow Up' ? 30 : 0
                    const daysScore = days * 5
                    const placementScore = activePlacementAccountIds.has(v.account_id) ? 10 : 0
                    const freqScore = v.accounts?.visit_frequency_days && v.accounts.visit_frequency_days <= 14 ? 10 : 0
                    return { ...v, _urgency: statusScore + daysScore + placementScore + freqScore }
                  })
                  .sort((a, b) => b._urgency - a._urgency)
                  .slice(0, showAllFollowUps ? undefined : 8)
                  .map(v => {
                    const days = daysAgoMT(v.visited_at) ?? 0
                    const isHigh = v._urgency >= 60
                    const isMed = v._urgency >= 40
                    const urgencyColor = isHigh ? t.status.danger : isMed ? t.status.warning : t.text.muted
                    return (
                      <div key={v.id} style={{
                        backgroundColor: isHigh ? 'rgba(232,85,64,0.07)' : t.bg.elevated,
                        border: `1px solid ${isHigh ? 'rgba(232,85,64,0.20)' : isMed ? 'rgba(233,153,40,0.18)' : t.border.subtle}`,
                        borderLeft: `3px solid ${urgencyColor}`,
                        borderRadius: '8px',
                        padding: '10px 12px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Link href={`/accounts/${v.account_id}`} style={{ textDecoration: 'none' }}>
                              <div style={{ fontSize: '13px', fontWeight: isHigh ? '700' : '600', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {v.accounts?.name}
                              </div>
                            </Link>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                              <span style={badge.visitStatus(v.status)}>{v.status}</span>
                              <span className="mono" style={{ fontSize: '11px', color: urgencyColor, fontWeight: '600' }}>{days}d ago</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                            <button
                              onClick={() => { setFollowUpAccountId(v.account_id); setVisitModal(true) }}
                              style={{
                                fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
                                color: isHigh ? t.status.danger : t.gold,
                                backgroundColor: isHigh ? 'rgba(232,85,64,0.12)' : t.goldDim,
                                border: `1px solid ${isHigh ? 'rgba(232,85,64,0.28)' : t.border.gold}`,
                                borderRadius: '6px', padding: '4px 8px',
                              }}
                            >
                              Log visit
                            </button>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={async () => {
                                  setFollowups(prev => prev.filter(f => f.id !== v.id))
                                  await clearFollowUp(v.id)
                                  toast('Follow-up cleared')
                                }}
                                style={{
                                  flex: 1, fontSize: '10px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
                                  color: t.status.success, backgroundColor: 'rgba(61,186,120,0.10)',
                                  border: '1px solid rgba(61,186,120,0.25)', borderRadius: '5px', padding: '3px 6px',
                                }}
                                title="Mark follow-up as done"
                              >
                                Cleared
                              </button>
                              <button
                                onClick={async () => {
                                  setFollowups(prev => prev.filter(f => f.id !== v.id))
                                  await dismissFollowUp(v.id)
                                  toast('Follow-up disregarded', 'info')
                                }}
                                style={{
                                  flex: 1, fontSize: '10px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
                                  color: t.text.muted, backgroundColor: t.bg.card,
                                  border: `1px solid ${t.border.subtle}`, borderRadius: '5px', padding: '3px 6px',
                                }}
                                title="No longer applicable"
                              >
                                Disregard
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                {followups.length > 8 && (
                  <button onClick={() => setShowAllFollowUps(v => !v)} style={{
                    marginTop: '4px', width: '100%', padding: '8px', background: 'none',
                    border: `1px solid ${t.border.default}`, borderRadius: '7px',
                    color: t.text.muted, fontSize: '12px', cursor: 'pointer',
                  }}>
                    {showAllFollowUps ? `Show less` : `Show all ${followups.length} follow-ups`}
                  </button>
                )}
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
            {tasks.map((task, i) => (
              <TaskRow key={task.id} task={task} last={i === tasks.length - 1}
                onComplete={() => completeTask(task.id).then(load)} />
            ))}
          </div>
        </div>
      )}

      <VisitLogModal
        isOpen={visitModal}
        onClose={() => { setVisitModal(false); setFollowUpAccountId(undefined) }}
        onSuccess={load}
        userId={profile.id}
        defaultAccountId={followUpAccountId}
      />
    </div>
  )
}

// ─── Mobile Dashboard ─────────────────────────────────────────────────────

function MobileDashboard({ profile }: { profile: UserProfile }) {
  const { showVisitLog, setShowVisitLog } = useApp()
  const toast = useToast()
  const [stats, setStats] = useState<any>(null)
  const [commission, setCommission] = useState(0)
  const [schedule, setSchedule] = useState<any>(null)
  const [followups, setFollowups] = useState<any[]>([])
  const [overdue, setOverdue] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [suggestionLoading, setSuggestionLoading] = useState<string | null>(null)
  const [pendingInquiries, setPendingInquiries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [visitModal, setVisitModal] = useState(false)
  const [plannerStops, setPlannerStops] = useState<PlannerStop[]>([])

  const load = useCallback(async () => {
    try {
      const [s, sched, fu, od] = await Promise.all([
        getDashboardStats(profile.id, profile.role === 'owner'),
        getTodaySchedule(profile.id),
        getFollowUpVisits(),
        getOverdueAccounts(),
      ])
      setStats(s); setSchedule(sched); setFollowups(fu); setOverdue(od)
      if (profile.role === 'owner') {
        getClientSuggestions('new').then(setSuggestions).catch(() => {})
        getPendingDistributorInquiries().then(setPendingInquiries).catch(() => {})
      }
      if (s?.commissionThisMonth !== undefined) setCommission(s.commissionThisMonth)
      getPlannerStops(profile.id, todayMT()).then(setPlannerStops).catch(() => {})
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [profile.id, profile.role])

  useEffect(() => { load() }, [load])

  // Sync FAB -> open local modal
  useEffect(() => {
    if (showVisitLog) {
      setVisitModal(true)
      setShowVisitLog(false)
    }
  }, [showVisitLog, setShowVisitLog])

  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div style={{ padding: '16px', paddingBottom: '8px' }}>
      {/* Date + greeting */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '2px' }}>{today}</div>
        <div style={{ fontSize: '20px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>
          Hey {profile.name?.split(' ')[0] || 'there'} 👋
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

      {profile.role === 'owner' && suggestions.length > 0 && (
        <div style={{ marginBottom: '16px', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${t.goldBorder}` }}>
            <AlertCircle size={13} color={t.gold} />
            <span style={{ fontSize: '12px', fontWeight: '700', color: t.gold, flex: 1 }}>
              {suggestions.length} {suggestions.length === 1 ? 'suggestion' : 'suggestions'} from clients
            </span>
          </div>
          {suggestions.map((s: any, i: number) => {
            const isActioning = suggestionLoading === s.id
            const isAccount = s.suggestion_type !== 'contact'
            return (
              <div key={s.id} style={{ padding: '10px 14px', borderTop: i > 0 ? `1px solid ${t.border.subtle}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{s.name}</span>
                  <span style={{ fontSize: '9px', fontWeight: '700', padding: '2px 5px', borderRadius: '4px', backgroundColor: isAccount ? 'rgba(74,158,255,0.12)' : 'rgba(100,200,100,0.12)', color: isAccount ? '#4a9eff' : '#4caf50', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {isAccount ? 'Account' : 'Contact'}
                  </span>
                  {!isAccount && s.contact_category === 'distributor' && (
                    <span style={{ fontSize: '9px', fontWeight: '700', padding: '2px 5px', borderRadius: '4px', backgroundColor: 'rgba(233,153,40,0.15)', color: t.gold, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Dist. Rep
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: s.contact_person || s.address || s.notes ? '4px' : '8px' }}>
                  {s.client_slug}{s.reason ? ` · ${s.reason.replace(/_/g, ' ')}` : ''}
                </div>
                {s.address && <div style={{ fontSize: '11px', color: t.text.secondary, marginBottom: '4px' }}>{s.address}</div>}
                {s.contact_person && <div style={{ fontSize: '11px', color: t.text.secondary, marginBottom: '4px' }}>Contact: {s.contact_person}</div>}
                {s.notes && <div style={{ fontSize: '11px', color: t.text.muted, fontStyle: 'italic', marginBottom: '4px' }}>{s.notes}</div>}
                {s.submitted_by_name && <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '8px' }}>Submitted by {s.submitted_by_name}</div>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  {isAccount ? (
                    <button disabled={isActioning} onClick={async () => {
                      setSuggestionLoading(s.id)
                      try {
                        const portalNotes = `Suggested via portal${s.submitted_by_name ? ` by ${s.submitted_by_name}` : ''}${s.reason ? ` · ${s.reason.replace(/_/g, ' ')}` : ''}${s.contact_person ? `\nContact there: ${s.contact_person}` : ''}${s.notes ? `\n${s.notes}` : ''}`
                        const newAccount = await createAccount({ name: s.name, address: s.address || undefined, account_type: 'on_premise', notes: portalNotes })
                        const due = new Date(); due.setDate(due.getDate() + 7)
                        await createTask({ user_id: profile.id, assigned_to: profile.id, title: `Visit ${s.name}`, description: `Suggested by ${s.client_slug}${s.submitted_by_name ? ` (${s.submitted_by_name})` : ''}${s.contact_person ? `. Ask for ${s.contact_person}.` : ''}`.trim(), priority: 'medium', due_date: due.toISOString().slice(0, 10), client_slug: s.client_slug }).catch(() => {})
                        if (s.contact_person) {
                          await createContact({ name: s.contact_person, client_slug: s.client_slug, account_id: (newAccount as any)?.id || null, category: 'general', notes: `Contact at ${s.name}. Suggested via portal by ${s.submitted_by_name || s.client_slug}.` }).catch(() => {})
                        }
                        await acknowledgeClientSuggestion(s.id)
                        setSuggestions(prev => prev.filter(x => x.id !== s.id))
                        toast(`${s.name} added · task created${s.contact_person ? ` · ${s.contact_person} added as contact` : ''}`)
                      } catch { toast('Failed', 'error') }
                      setSuggestionLoading(null)
                    }} style={{ fontSize: '11px', fontWeight: '700', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${t.goldBorder}`, background: t.goldDim, color: t.gold, cursor: isActioning ? 'default' : 'pointer', opacity: isActioning ? 0.6 : 1 }}>
                      {isActioning ? 'Adding…' : s.contact_person ? '+ Add Account & Contact' : '+ Add Account + Task'}
                    </button>
                  ) : (
                    <button disabled={isActioning} onClick={async () => {
                      setSuggestionLoading(s.id)
                      try {
                        const accounts = await getAccounts().catch(() => [])
                        const workplaceName = s.address || ''
                        const match = workplaceName ? accounts.find((a: any) => a.name.toLowerCase().includes(workplaceName.toLowerCase()) || workplaceName.toLowerCase().includes(a.name.toLowerCase())) : null
                        const notes = [workplaceName ? `Works at: ${workplaceName}` : null, s.reason ? s.reason.replace(/_/g, ' ') : null, s.notes || null, `Suggested via portal${s.submitted_by_name ? ` by ${s.submitted_by_name}` : ''}`].filter(Boolean).join('\n')
                        await createContact({ name: s.name, client_slug: s.client_slug, account_id: match?.id || null, category: (s.contact_category || 'general') as any, notes })
                        await acknowledgeClientSuggestion(s.id)
                        setSuggestions(prev => prev.filter(x => x.id !== s.id))
                        toast(`${s.name} added to contacts${match ? ` · linked to ${match.name}` : ''}`)
                      } catch { toast('Failed', 'error') }
                      setSuggestionLoading(null)
                    }} style={{ fontSize: '11px', fontWeight: '700', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${t.goldBorder}`, background: t.goldDim, color: t.gold, cursor: isActioning ? 'default' : 'pointer', opacity: isActioning ? 0.6 : 1 }}>
                      {isActioning ? 'Adding…' : '+ Add Contact'}
                    </button>
                  )}
                  <button disabled={isActioning} onClick={async () => {
                    setSuggestionLoading(s.id)
                    await acknowledgeClientSuggestion(s.id).catch(() => {})
                    setSuggestions(prev => prev.filter(x => x.id !== s.id))
                    setSuggestionLoading(null)
                  }} style={{ fontSize: '11px', fontWeight: '500', padding: '4px 8px', borderRadius: '6px', border: 'none', background: 'transparent', color: t.text.muted, cursor: isActioning ? 'default' : 'pointer', opacity: isActioning ? 0.6 : 1 }}>
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {profile.role === 'owner' && pendingInquiries.length > 0 && (
        <div style={{ marginBottom: '16px', backgroundColor: 'rgba(233,153,40,0.07)', border: `1px solid rgba(233,153,40,0.22)`, borderRadius: '10px', overflow: 'hidden' }}>
          <Link href="/orders" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <Clock size={13} color={t.status.warning} />
            <span style={{ fontSize: '12px', fontWeight: '700', color: t.status.warning, flex: 1 }}>
              {pendingInquiries.length} Pending Distributor {pendingInquiries.length === 1 ? 'Inquiry' : 'Inquiries'}
            </span>
            <ChevronRight size={13} color={t.status.warning} />
          </Link>
        </div>
      )}

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
            <MiniStat label="Commission MTD" value={formatCurrency(commission)} color={t.status.success} href="/finance" />
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

      {/* Today's Route Progress */}
      {plannerStops.length > 0 && (
        <DailyProgressBar stops={plannerStops} />
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

// ─── Daily Progress Bar ──────────────────────────────────────────────────

function DailyProgressBar({ stops }: { stops: PlannerStop[] }) {
  const router = useRouter()
  const total = stops.length
  const done = stops.filter(s => s.completed).length
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const nextStop = stops.filter(s => !s.completed)[0] ?? null

  const getMessage = () => {
    if (total === 0) return ''
    if (done === 0) return `0/${total} stops visited. Time to hit the road! 🚗`
    if (done === total) return `${total}/${total} stops done. You absolutely crushed it today! 🏆`
    if (pct >= 75) return `${done}/${total} stops visited. Almost there — push through! 💪`
    if (pct >= 50) return `${done}/${total} stops visited. Halfway! You're on fire. 🔥`
    if (pct >= 25) return `${done}/${total} stops visited. Getting warmed up! Keep rolling.`
    return `${done}/${total} stops visited. Just getting started!`
  }

  const barColor = done === total ? t.status.success : t.gold
  const glowColor = done === total ? 'rgba(61,188,118,0.4)' : 'rgba(212,168,67,0.35)'

  return (
    <div
      onClick={() => router.push('/planner')}
      style={{
        ...card,
        padding: '14px 18px',
        background: `linear-gradient(135deg, ${t.bg.elevated} 0%, ${t.bg.card} 100%)`,
        border: `1px solid ${done === total ? 'rgba(61,188,118,0.3)' : t.goldBorder}`,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        marginBottom: '20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Today's Route
        </span>
        <span style={{ fontSize: '13px', fontWeight: '700', color: barColor }}>
          {done}/{total}
        </span>
      </div>
      {/* XP bar track */}
      <div style={{
        height: '10px',
        borderRadius: '99px',
        backgroundColor: 'rgba(255,255,255,0.07)',
        overflow: 'hidden',
        marginBottom: '10px',
        position: 'relative',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: '99px',
          background: done === total
            ? `linear-gradient(90deg, #2da85e, ${t.status.success})`
            : `linear-gradient(90deg, #b8891e, ${t.gold})`,
          boxShadow: pct > 0 ? `0 0 10px ${glowColor}` : 'none',
          transition: 'width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }} />
        {pct > 0 && pct < 100 && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s infinite',
          }} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ fontSize: '12px', color: t.text.secondary, fontWeight: '500', flex: 1, minWidth: 0 }}>
          {getMessage()}
          {nextStop && done < total && (
            <span style={{ display: 'block', fontSize: '11px', color: t.text.muted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Next: {nextStop.title}
            </span>
          )}
        </div>
        {nextStop?.address && done < total && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(nextStop.address)}`}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '8px',
              backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`,
              color: t.gold, fontSize: '12px', fontWeight: '700',
              textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            <Navigation size={12} /> Directions
          </a>
        )}
      </div>
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
  const isMobile = useIsMobile()

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
