'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, CheckCircle2, Pencil, Check, X, Plus, Zap, MapPin } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { v3 } from '../lib/theme'
import {
  useV3Clients, useV3RecentVisits, useV3FollowUps,
  useV3Profile, useV3TerritoryCoverage,
  useV3MyTasks, useV3AtRiskPlacements,
  useV3OverdueQuery, useV3CommissionMTD,
  useV3TodayStops, useV3WinRate, useV3PotentialToday,
  useV3Orders, useV3Placements, useV3Accounts,
} from '../lib/query'
import { useOpenLogVisit, useV3Toast } from '../lib/context'
import { clientLogoUrl } from '../../lib/constants'
import { clearFollowUp, dismissFollowUp, completeTask, createTask } from '../../lib/data'
import { getSupabase } from '../../lib/supabase'
import { buildGradeMap, gradeOrder } from '../lib/grading'
import type { GradeResult } from '../lib/grading'
import { GradeBadge } from '../components/GradeBadge'

// ── Goals (user-editable, persisted in user_profiles) ────────────────────────

function useGoals() {
  const qc = useQueryClient()
  const { data: profile } = useV3Profile()
  const toast = useV3Toast()

  const daily   = (profile as any)?.goal_daily   ?? 8
  const monthly = (profile as any)?.goal_monthly ?? 80

  async function saveGoals(d: number, m: number) {
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const { error } = await sb.from('user_profiles').update({ goal_daily: d, goal_monthly: m }).eq('id', user.id)
    if (error) { console.error('goals.save', error); toast.show('Failed to save goals', 'error'); return }
    qc.invalidateQueries({ queryKey: ['v3', 'profile'] })
  }

  function setDaily(n: number)   { saveGoals(n, monthly) }
  function setMonthly(n: number) { saveGoals(daily, n) }

  return { daily, monthly, setDaily, setMonthly }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function monthLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'long' })
}

function fmtCurrency(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

function todayDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

function monthStartStr() {
  const mt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
  return mt.slice(0, 7) + '-01'
}

// ── Progress ring ─────────────────────────────────────────────────────────────

function ProgressRing({ value, total, size = 72, strokeWidth = 5, color }: {
  value: number; total: number; size?: number; strokeWidth?: number; color: string
}) {
  const radius = (size - strokeWidth * 2) / 2
  const circ   = 2 * Math.PI * radius
  const pct    = total > 0 ? Math.min(value / total, 1) : 0
  const filled = circ * pct
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
      {pct > 0 && (
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.4,0,0.2,1)' }}
        />
      )}
    </svg>
  )
}

// ── Stat ──────────────────────────────────────────────────────────────────────

function Stat({ label, value, glow, color, note, children }: {
  label: string; value: React.ReactNode; glow?: string
  color: string; note?: string; children?: React.ReactNode
}) {
  const isDim = color === 'rgba(255,255,255,0.10)'
  return (
    <div style={{ flex: 1, position: 'relative', padding: '4px 0' }}>
      {!isDim && (
        <div style={{
          position: 'absolute', left: -24, top: -16, right: -24, bottom: -16,
          background: `radial-gradient(ellipse at 30% 60%, ${color}09 0%, transparent 65%)`,
          pointerEvents: 'none',
        }} />
      )}
      <div style={{
        fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.55)',
        textTransform: 'uppercase', letterSpacing: '0.24em',
        marginBottom: 12, fontFamily: v3.font.ui,
      }}>
        {label}
      </div>
      <div
        className={`v3-mono${glow ? ` ${glow}` : ''}`}
        style={{ fontSize: '38px', fontWeight: 800, color, letterSpacing: '-0.05em', lineHeight: 1, position: 'relative' }}
      >
        {value}
      </div>
      {note && (
        <div style={{ marginTop: 8, fontSize: '14px', color: 'rgba(255,255,255,0.38)', letterSpacing: '0.05em' }}>
          {note}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label, count, countColor, href, action }: {
  label: string; count?: number; countColor?: string; href?: string; action?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{
        fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.60)',
        textTransform: 'uppercase', letterSpacing: '0.22em',
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {count != null && count > 0 && (
          <span className="v3-mono" style={{ fontSize: '14px', fontWeight: 700, color: countColor ?? 'rgba(255,255,255,0.30)' }}>
            {count}
          </span>
        )}
        {action}
        {href && (
          <Link href={href} style={{
            fontSize: '14px', color: 'rgba(196,164,110,0.55)', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 2,
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = v3.amberLight}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(196,164,110,0.55)'}
          >
            all <ChevronRight size={10} />
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Log button ────────────────────────────────────────────────────────────────

function LogBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        padding: '5px 12px', background: 'transparent',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px',
        fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.25)',
        cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 130ms', flexShrink: 0,
        fontFamily: v3.font.ui,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(196,164,110,0.40)'
        e.currentTarget.style.color = v3.amberLight
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
        e.currentTarget.style.color = 'rgba(255,255,255,0.25)'
      }}
    >Log</button>
  )
}

// ── Follow-up row ─────────────────────────────────────────────────────────────

function FollowUpRow({ visit, gradeResult }: { visit: any; gradeResult?: GradeResult }) {
  const { open } = useOpenLogVisit()
  const toast = useV3Toast()
  const qc = useQueryClient()
  const daysAgo = Math.floor((Date.now() - new Date(visit.visited_at).getTime()) / 86400000)
  const isUrgent = daysAgo >= 7

  const clear = useMutation({
    mutationFn: () => clearFollowUp(visit.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['v3', 'followups'] }); toast.show('Follow-up cleared') },
  })
  const dismiss = useMutation({
    mutationFn: () => dismissFollowUp(visit.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['v3', 'followups'] }); toast.show('Follow-up dismissed') },
  })

  return (
    <div className="v3-row-hover" style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto auto auto auto',
      alignItems: 'center', gap: 8, padding: '13px 8px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <Link href={`/v3/territory/${visit.account_id}`} style={{ textDecoration: 'none', minWidth: 0, display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{
          width: 2, height: 26, flexShrink: 0, borderRadius: 1,
          background: isUrgent ? v3.status.warning : 'rgba(255,255,255,0.08)',
        }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {visit.accounts?.name ?? '—'}
          </div>
          <div style={{ fontSize: '14px', color: isUrgent ? `${v3.status.warning}bb` : 'rgba(255,255,255,0.42)', marginTop: 2, letterSpacing: '0.01em' }}>
            {visit.status}
          </div>
        </div>
      </Link>
      {gradeResult
        ? <GradeBadge grade={gradeResult.grade} size="sm" showMomentum momentum={gradeResult.momentum} tooltip />
        : <div style={{ width: 22 }} />
      }
      <span className="v3-mono" style={{ fontSize: '14px', color: isUrgent ? v3.status.warning : 'rgba(255,255,255,0.38)', whiteSpace: 'nowrap' }}>
        {daysAgo === 0 ? 'today' : `${daysAgo}d`}
      </span>
      <button
        onClick={e => { e.stopPropagation(); clear.mutate() }}
        disabled={clear.isPending || dismiss.isPending}
        title="Mark cleared — they ordered"
        style={{
          padding: '5px 9px', background: 'transparent',
          border: '1px solid rgba(58,158,116,0.20)', borderRadius: '3px',
          fontSize: '14px', fontWeight: 600, color: 'rgba(90,158,160,0.55)',
          cursor: 'pointer', letterSpacing: '0.04em', transition: 'all 130ms', flexShrink: 0,
          fontFamily: v3.font.ui,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(90,158,160,0.60)'; e.currentTarget.style.color = v3.status.success }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(90,158,160,0.22)'; e.currentTarget.style.color = 'rgba(90,158,160,0.55)' }}
      >Cleared</button>
      <button
        onClick={e => { e.stopPropagation(); dismiss.mutate() }}
        disabled={clear.isPending || dismiss.isPending}
        title="Dismiss — not following up"
        style={{
          padding: '5px 9px', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: '3px',
          fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.38)',
          cursor: 'pointer', letterSpacing: '0.04em', transition: 'all 130ms', flexShrink: 0,
          fontFamily: v3.font.ui,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.20)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.38)' }}
      >Dismiss</button>
      <LogBtn onClick={() => open(visit.accounts ? { id: visit.account_id, name: visit.accounts.name } : undefined)} />
    </div>
  )
}

// ── Overdue row ───────────────────────────────────────────────────────────────

function OverdueRow({ account, gradeResult }: { account: any; gradeResult?: GradeResult }) {
  const { open } = useOpenLogVisit()
  const isVeryOverdue = (account.overdueDays ?? 0) >= 14

  return (
    <div className="v3-row-hover" style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto auto',
      alignItems: 'center', gap: 10, padding: '13px 8px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <Link href={`/v3/territory/${account.id}`} style={{ textDecoration: 'none', minWidth: 0, display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{
          width: 2, height: 26, flexShrink: 0, borderRadius: 1,
          background: isVeryOverdue ? v3.status.danger : `${v3.status.warning}60`,
        }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {account.name}
          </div>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>
            every {account.visit_frequency_days}d
          </div>
        </div>
      </Link>
      {gradeResult
        ? <GradeBadge grade={gradeResult.grade} size="sm" showMomentum momentum={gradeResult.momentum} tooltip />
        : <div style={{ width: 22 }} />
      }
      <span className="v3-mono" style={{ fontSize: '14px', color: isVeryOverdue ? v3.status.danger : v3.status.warning, whiteSpace: 'nowrap' }}>
        {account.neverVisited ? 'new' : `+${account.overdueDays}d`}
      </span>
      <LogBtn onClick={() => open({ id: account.id, name: account.name })} />
    </div>
  )
}

// ── Coverage bar ──────────────────────────────────────────────────────────────

function CoverageBar({ visited, total, pct }: { visited: number; total: number; pct: number }) {
  const color = pct >= 80 ? v3.status.success : pct >= 50 ? '#c8a870' : v3.status.danger
  return (
    <div style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.22em' }}>
          Coverage &middot; {monthLabel()}
        </span>
        <span className="v3-mono" style={{ fontSize: '14px', fontWeight: 700, color }}>
          {pct}%{' '}
          <span style={{ fontSize: '14px', fontWeight: 400, color: 'rgba(255,255,255,0.38)' }}>({visited}/{total})</span>
        </span>
      </div>
      <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden' }}>
        <div className="v3-bar-fill" style={{ height: '100%', borderRadius: 1, background: color, width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── "All done" state ──────────────────────────────────────────────────────────

function AllClear({ visits }: { visits: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '28px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(90,158,160,0.08)', border: '1px solid rgba(58,158,116,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <CheckCircle2 size={18} color={v3.status.success} />
      </div>
      <div>
        <div style={{ fontSize: '17px', fontWeight: 600, color: v3.status.success, letterSpacing: '-0.02em' }}>Queue clear.</div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.38)', marginTop: 3 }}>
          {visits > 0 ? `${visits} visit${visits !== 1 ? 's' : ''} logged today.` : 'Nothing pending.'}
        </div>
      </div>
    </div>
  )
}

// ── Goal tracker ──────────────────────────────────────────────────────────────

function GoalWidget({ todayCount, mtdCount, daily, monthly, setDaily, setMonthly }: {
  todayCount: number; mtdCount: number
  daily: number; monthly: number
  setDaily: (n: number) => void; setMonthly: (n: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftDaily,   setDraftDaily]   = useState(String(daily))
  const [draftMonthly, setDraftMonthly] = useState(String(monthly))

  function openEdit() {
    setDraftDaily(String(daily))
    setDraftMonthly(String(monthly))
    setEditing(true)
  }

  function saveEdit() {
    const d = parseInt(draftDaily,   10)
    const m = parseInt(draftMonthly, 10)
    if (d > 0) setDaily(d)
    if (m > 0) setMonthly(m)
    setEditing(false)
  }

  const _dayPct  = Math.min((todayCount / daily)   * 100, 100)
  const mtdPct  = Math.min((mtdCount   / monthly) * 100, 100)
  const dayDone = todayCount >= daily

  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth  = now.getDate()
  const paced       = Math.round((monthly / daysInMonth) * dayOfMonth)
  const earlyAndZero = mtdCount === 0 && now.getHours() < 11
  const paceLabel   = earlyAndZero ? 'Get out there' : mtdCount >= paced + 5 ? 'Ahead of pace' : mtdCount >= paced - 3 ? 'On pace' : 'Behind pace'
  const paceColor   = earlyAndZero ? 'rgba(255,255,255,0.38)' : mtdCount >= paced + 5 ? v3.status.success : mtdCount >= paced - 3 ? '#c8a870' : v3.status.danger

  return (
    <div>
      <SectionLabel
        label="Goals"
        action={
          editing
            ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={saveEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: v3.status.success, padding: 2, display: 'flex' }}>
                  <Check size={13} />
                </button>
                <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: v3.text.muted, padding: 2, display: 'flex' }}>
                  <X size={13} />
                </button>
              </div>
            )
            : (
              <button onClick={openEdit} title="Set goals" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.38)', padding: 2, display: 'flex', transition: 'color 120ms' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = v3.amberLight}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.38)'}
              >
                <Pencil size={11} />
              </button>
            )
        }
      />

      {editing ? (
        <div style={{ marginTop: 14, display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.18em', display: 'block', marginBottom: 6 }}>Daily target</label>
            <input
              type="number" min={1} max={50} value={draftDaily}
              onChange={e => setDraftDaily(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdit()}
              autoFocus
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${v3.amber}55`, borderRadius: v3.radius.md, color: v3.text.primary, fontSize: '22px', fontWeight: 700, padding: '8px 12px', outline: 'none', textAlign: 'center', fontFamily: v3.font.mono }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.18em', display: 'block', marginBottom: 6 }}>Monthly target</label>
            <input
              type="number" min={1} max={500} value={draftMonthly}
              onChange={e => setDraftMonthly(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdit()}
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${v3.amber}55`, borderRadius: v3.radius.md, color: v3.text.primary, fontSize: '22px', fontWeight: 700, padding: '8px 12px', outline: 'none', textAlign: 'center', fontFamily: v3.font.mono }}
            />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {/* Today — ring */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24 }}>
            <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
              <ProgressRing value={todayCount} total={daily} size={72} strokeWidth={5}
                color={dayDone ? v3.status.success : 'rgba(90,158,160,0.85)'} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="v3-mono" style={{
                  fontSize: '20px', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1,
                  color: dayDone ? v3.status.success : v3.text.primary,
                }}>{todayCount}</span>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.30)', letterSpacing: '0.04em', marginTop: 2 }}>/{daily}</span>
              </div>
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.20em', display: 'block', marginBottom: 6 }}>Today</span>
              {dayDone
                ? <div style={{ fontSize: '13px', color: v3.status.success, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <CheckCircle2 size={11} /> Daily goal reached!
                  </div>
                : <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.40)' }}>
                    {daily - todayCount} more to go
                  </div>
              }
            </div>
          </div>
          {/* Month */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.20em' }}>Month</span>
              <span className="v3-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
                {mtdCount} / {monthly}
              </span>
            </div>
            <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden' }}>
              <div className="v3-bar-fill" style={{ height: '100%', borderRadius: 1, width: `${mtdPct}%`, background: 'rgba(255,255,255,0.42)' }} />
            </div>
            <div style={{ marginTop: 6, fontSize: '14px', color: paceColor }}>{paceLabel}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Task Modal ────────────────────────────────────────────────────────────

function AddTaskModal({ onClose }: { onClose: () => void }) {
  const toast = useV3Toast()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [dueDate, setDueDate] = useState('')

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      await createTask({ title: title.trim(), priority, due_date: dueDate || undefined, user_id: user?.id })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'tasks', 'mine'] })
      toast.show('Task added')
      onClose()
    },
    onError: (e: any) => toast.show(e?.message ?? 'Failed to create task', 'error'),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 400, background: v3.bg.elevated, borderRadius: '12px', boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Add Task</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 2 }}><X size={15} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            value={title} onChange={e => setTitle(e.target.value)} autoFocus
            onKeyDown={e => e.key === 'Enter' && title.trim() && save.mutate()}
            placeholder="What needs to be done?"
            style={{
              width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)', borderRadius: '6px',
              color: v3.text.primary, fontSize: '14px', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {(['low', 'medium', 'high'] as const).map(p => {
              const c = p === 'high' ? v3.status.danger : p === 'medium' ? v3.status.warning : 'rgba(255,255,255,0.25)'
              return (
                <button key={p} type="button" onClick={() => setPriority(p)} style={{
                  flex: 1, padding: '6px 8px', borderRadius: '4px', fontSize: '14px', fontWeight: 700,
                  border: `1px solid ${priority === p ? c + '60' : 'rgba(255,255,255,0.08)'}`,
                  background: priority === p ? c + '14' : 'transparent',
                  color: priority === p ? c : 'rgba(255,255,255,0.35)', cursor: 'pointer', textTransform: 'capitalize',
                }}>{p}</button>
              )
            })}
          </div>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '6px', color: v3.text.secondary, fontSize: '14px', outline: 'none', colorScheme: 'dark' } as any} />
        </div>
        <button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}
          style={{ marginTop: 16, width: '100%', padding: '11px', background: save.isPending ? v3.bg.sheet : v3.amber, color: '#000', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {save.isPending ? 'Adding…' : 'Add Task'}
        </button>
      </div>
    </div>
  )
}

// ── Task list (with inline complete) ─────────────────────────────────────────

function TaskList({ tasks }: { tasks: any[] }) {
  const toast = useV3Toast()
  const qc = useQueryClient()
  const [showAddTask, setShowAddTask] = useState(false)

  const complete = useMutation({
    mutationFn: (id: string) => completeTask(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['v3', 'tasks', 'mine'] }); toast.show('Task done') },
  })

  return (
    <div>
      <SectionLabel label="Tasks" count={tasks.length} href="/v3/planner" action={
        <button onClick={() => setShowAddTask(true)} style={{
          display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
          background: 'rgba(196,164,110,0.07)', border: `1px solid rgba(196,164,110,0.20)`,
          borderRadius: '3px', fontSize: '14px', fontWeight: 700, color: 'rgba(196,164,110,0.60)',
          cursor: 'pointer', letterSpacing: '0.04em', fontFamily: v3.font.ui,
        }}
          onMouseEnter={e => { e.currentTarget.style.color = v3.amberLight; e.currentTarget.style.borderColor = 'rgba(196,164,110,0.40)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(196,164,110,0.60)'; e.currentTarget.style.borderColor = 'rgba(196,164,110,0.20)' }}>
          <Plus size={9} />Add
        </button>
      } />
      <div style={{ marginTop: 2 }}>
        {tasks.slice(0, 5).map((t: any) => {
          const isOverdue  = t.due_date && new Date(t.due_date) < new Date()
          const isDueToday = t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()
          const tagColor   = isOverdue ? v3.status.danger : isDueToday ? v3.status.warning : 'rgba(255,255,255,0.38)'
          const isPending  = complete.isPending && complete.variables === t.id
          return (
            <div key={t.id} className="v3-row-hover" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: isPending ? 0.4 : 1, transition: 'opacity 200ms' }}>
              <button
                onClick={() => complete.mutate(t.id)}
                disabled={complete.isPending}
                title="Mark complete"
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.28)', borderRadius: '3px', width: 14, height: 14, marginTop: 2, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all 130ms' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = v3.status.success; e.currentTarget.style.background = `${v3.status.success}15` }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; e.currentTarget.style.background = 'none' }}
              >
                {isPending && <Check size={8} color={v3.status.success} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.80)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                {(t.due_date || t.accounts?.name) && (
                  <div style={{ fontSize: '14px', color: tagColor, marginTop: 2 }}>
                    {t.accounts?.name && <span>{t.accounts.name}</span>}
                    {t.accounts?.name && t.due_date && ' · '}
                    {t.due_date && (isOverdue ? 'overdue' : isDueToday ? 'due today' : new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}
                  </div>
                )}
              </div>
              {t.priority === 'high' && <div style={{ width: 4, height: 4, borderRadius: '50%', background: v3.status.danger, flexShrink: 0, marginTop: 4 }} />}
            </div>
          )
        })}
        {tasks.length > 5 && (
          <Link href="/v3/planner" style={{ display: 'block', paddingTop: 8, fontSize: '14px', color: 'rgba(196,164,110,0.50)', textDecoration: 'none' }}>
            +{tasks.length - 5} more
          </Link>
        )}
      </div>
      {showAddTask && <AddTaskModal onClose={() => setShowAddTask(false)} />}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const { data: profile }                                      = useV3Profile()
  const { data: allRecentVisits = [], isLoading: visitsLoading } = useV3RecentVisits(30)
  const { data: followUps = [],       isLoading: fuLoading }   = useV3FollowUps()
  const { data: overdue = [],         isLoading: overdueLoading } = useV3OverdueQuery()
  const { data: clients = [] }                                 = useV3Clients()
  const { data: coverage }                                     = useV3TerritoryCoverage()
  const { data: commissionMTD = 0 }                            = useV3CommissionMTD()
  const { data: tasks = [] }                                   = useV3MyTasks()
  const { data: atRisk = [] }                                  = useV3AtRiskPlacements()
  const { data: todayStops = [] }                              = useV3TodayStops()
  const { data: winRate }                                      = useV3WinRate()
  const { data: potential }                                    = useV3PotentialToday()
  const { data: allOrders = [] }                               = useV3Orders()
  const { data: allPlacements = [] }                           = useV3Placements()
  const { data: allAccounts = [] }                             = useV3Accounts()
  const goals = useGoals()

  const TODAY_STR       = useMemo(todayDateStr,  [])
  const MONTH_START_STR = useMemo(monthStartStr, [])

  const myUserId = (profile as any)?.id

  // Today's visits — current user's only, deduplicated per account
  const todayVisits = useMemo(() => {
    const seen = new Set<string>()
    return allRecentVisits.filter(v => {
      const mtDate = new Date(v.visited_at).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
      if (mtDate !== TODAY_STR) return false
      if (myUserId && v.user_id !== myUserId) return false
      const key = `${v.account_id}|${TODAY_STR}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })
  }, [allRecentVisits, TODAY_STR, myUserId])

  // MTD visits — current user's only, from calendar month start
  const mtdVisits = useMemo(() => {
    return allRecentVisits.filter(v => {
      const mtDate = new Date(v.visited_at).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
      return mtDate >= MONTH_START_STR && (!myUserId || v.user_id === myUserId)
    })
  }, [allRecentVisits, MONTH_START_STR, myUserId])

  const gradeMap = useMemo(
    () => buildGradeMap(allAccounts as any[], allOrders as any[], allRecentVisits as any[], allPlacements as any[]),
    [allAccounts, allOrders, allRecentVisits, allPlacements],
  )

  const dedupedFollowUps = useMemo(() => {
    const seen = new Set<string>()
    const deduped = followUps.filter(f => { if (seen.has(f.account_id)) return false; seen.add(f.account_id); return true })
    return deduped.sort((a, b) => {
      const ga = gradeOrder(gradeMap[a.account_id]?.grade ?? 'D')
      const gb = gradeOrder(gradeMap[b.account_id]?.grade ?? 'D')
      if (ga !== gb) return ga - gb
      const da = Math.floor((Date.now() - new Date(a.visited_at).getTime()) / 86400000)
      const db = Math.floor((Date.now() - new Date(b.visited_at).getTime()) / 86400000)
      return db - da
    })
  }, [followUps, gradeMap])

  const sortedOverdue = useMemo(() => {
    return [...(overdue as any[])].sort((a, b) => {
      const ga = gradeOrder(gradeMap[a.id]?.grade ?? 'D')
      const gb = gradeOrder(gradeMap[b.id]?.grade ?? 'D')
      if (ga !== gb) return ga - gb
      return (b.overdueDays ?? 0) - (a.overdueDays ?? 0)
    })
  }, [overdue, gradeMap])

  const name = profile?.name?.split(' ')[0] || profile?.full_name?.split(' ')[0] || 'there'
  const fuCount      = dedupedFollowUps.length
  const overdueCount = sortedOverdue.length
  const queueClear   = !fuLoading && !overdueLoading && fuCount === 0 && overdueCount === 0

  const visitColor = todayVisits.length > 0 ? '#5a9ea0' : 'rgba(255,255,255,0.10)'
  const fuColor    = fuCount > 0 ? '#c8a46e' : 'rgba(255,255,255,0.10)'
  const odColor    = overdueCount > 0 ? '#bf7850' : 'rgba(255,255,255,0.10)'

  const LIST_CAP = 8
  const [showAllFU, setShowAllFU]       = useState(false)
  const [showAllOverdue, setShowAllOverdue] = useState(false)

  return (
    <div style={{ padding: '20px 28px 0', maxWidth: 1600, margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="v3-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12, flexShrink: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.50)', letterSpacing: '0.18em', marginBottom: 12, textTransform: 'uppercase', fontFamily: v3.font.ui }}>
          {todayLabel()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '30px', fontWeight: 700, color: v3.text.primary, letterSpacing: '-0.04em', margin: 0, lineHeight: 1 }}>
            {greeting()}, {name}.
          </h1>
          {winRate?.hotHand && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '12px', fontWeight: 700, color: v3.amberLight,
              background: v3.amberDim, padding: '3px 10px',
              borderRadius: '99px', border: `1px solid rgba(196,164,110,0.22)`,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              <Zap size={10} color={v3.amber} />
              Hot Hand · {winRate.wins} wins this week
            </span>
          )}
          {potential && potential.stops > 0 && potential.potential > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '12px', fontWeight: 600, color: 'rgba(90,158,160,0.85)',
              background: 'rgba(90,158,160,0.07)', padding: '3px 10px',
              borderRadius: '99px', border: '1px solid rgba(90,158,160,0.18)',
              letterSpacing: '0.02em',
            }}>
              <MapPin size={10} color="rgba(90,158,160,0.85)" />
              ${potential.potential.toLocaleString()} potential · {potential.stops} stops
            </span>
          )}
        </div>
      </div>

      {/* ── Stat strip ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', marginBottom: 8, gap: 0, alignItems: 'flex-start', flexShrink: 0 }}>
        <Stat
          label="Visits Today"
          value={visitsLoading ? '—' : todayVisits.length}
          color={visitColor}
          glow={todayVisits.length > 0 ? 'v3-glow-green' : undefined}
          note={
            !visitsLoading
              ? todayVisits.length >= goals.daily
                ? 'Goal reached'
                : `goal ${goals.daily}`
              : undefined
          }
        >
          {!visitsLoading && (
            <div style={{ marginTop: 10, height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden' }}>
              <div className="v3-bar-fill" style={{
                height: '100%', borderRadius: 1,
                background: todayVisits.length > 0 ? '#5a9ea0' : 'transparent',
                width: `${Math.min((todayVisits.length / goals.daily) * 100, 100)}%`,
              }} />
            </div>
          )}
        </Stat>

        <div style={{ width: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 24px 0', alignSelf: 'stretch' }} />

        <Stat
          label={`${monthLabel()} Visits`}
          value={visitsLoading ? '—' : mtdVisits.length}
          color={mtdVisits.length > 0 ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.10)'}
        >
          {winRate?.rate != null && winRate.recent >= 5 && (
            <div style={{ marginTop: 10, fontSize: '12px', color: winRate.rate >= 50 ? '#5a9ea0' : 'rgba(255,255,255,0.40)', display: 'flex', alignItems: 'center', gap: 3, fontFamily: v3.font.ui }}>
              {winRate.rate}% win rate · {winRate.recent} visits
            </div>
          )}
        </Stat>

        <div style={{ width: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 24px 0', alignSelf: 'stretch' }} />

        <Stat
          label="Follow-Ups"
          value={fuLoading ? '—' : fuCount}
          color={fuColor}
          glow={fuCount > 0 ? 'v3-glow-warn' : undefined}
        />

        <div style={{ width: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 24px 0', alignSelf: 'stretch' }} />

        <Stat
          label="Overdue"
          value={overdueLoading ? '—' : overdueCount}
          color={odColor}
          glow={overdueCount > 0 ? 'v3-glow-red' : undefined}
        />

        {commissionMTD > 0 && (
          <>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 24px 0', alignSelf: 'stretch' }} />
            <Stat
              label="Commission MTD"
              value={fmtCurrency(commissionMTD)}
              color="#4aae84"
              glow="v3-glow-green"
            />
          </>
        )}
      </div>

      {/* ── Coverage bar ───────────────────────────────────────────────────── */}
      {coverage && coverage.total > 0 && (
        <div style={{ flexShrink: 0, marginBottom: 8 }}>
          <CoverageBar visited={coverage.visited} total={coverage.total} pct={coverage.pct} />
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      {queueClear && !visitsLoading && !fuLoading && !overdueLoading
        ? (
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignContent: 'start' }}>
            <AllClear visits={todayVisits.length} />
            <GoalWidget todayCount={todayVisits.length} mtdCount={mtdVisits.length} {...goals} />
          </div>
        )
        : (
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 1fr', gap: 24, overflow: 'hidden' }}>

            {/* ── Follow-Ups ──────────────────────────────────────────────── */}
            <div style={{ overflowY: 'auto', height: '100%', paddingBottom: 20, paddingRight: 4 }}>
              <SectionLabel label="Follow-Ups" count={fuCount} countColor="#c48844" href="/v3/territory" />
              {fuLoading
                ? <div style={{ padding: '24px 0', color: 'rgba(255,255,255,0.55)', fontSize: '14px' }}>Loading…</div>
                : fuCount === 0
                ? <div style={{ padding: '24px 0', color: 'rgba(255,255,255,0.50)', fontSize: '14px' }}>Queue clear</div>
                : (showAllFU ? dedupedFollowUps : dedupedFollowUps.slice(0, LIST_CAP)).map(f => <FollowUpRow key={f.id} visit={f} gradeResult={gradeMap[f.account_id]} />)
              }
              {fuCount > LIST_CAP && (
                <button onClick={() => setShowAllFU(v => !v)} style={{
                  display: 'flex', alignItems: 'center', gap: 3, paddingTop: 12,
                  fontSize: '13px', color: 'rgba(196,164,110,0.50)', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0 0', fontFamily: v3.font.ui,
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = v3.amberLight}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(196,164,110,0.50)'}
                >
                  {showAllFU ? 'Show less' : `+${fuCount - LIST_CAP} more`} <ChevronRight size={11} />
                </button>
              )}
            </div>

            {/* ── Overdue ─────────────────────────────────────────────────── */}
            <div style={{ overflowY: 'auto', height: '100%', paddingBottom: 20, paddingRight: 4 }}>
              <SectionLabel label="Overdue" count={overdueCount} countColor="#c46868" href="/v3/territory" />
              {overdueLoading
                ? <div style={{ padding: '24px 0', color: 'rgba(255,255,255,0.55)', fontSize: '14px' }}>Loading…</div>
                : overdueCount === 0
                ? <div style={{ padding: '24px 0', color: 'rgba(255,255,255,0.50)', fontSize: '14px' }}>All on schedule</div>
                : (showAllOverdue ? sortedOverdue : sortedOverdue.slice(0, LIST_CAP)).map((a: any) => <OverdueRow key={a.id} account={a} gradeResult={gradeMap[a.id]} />)
              }
              {overdueCount > LIST_CAP && (
                <button onClick={() => setShowAllOverdue(v => !v)} style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: '13px', color: 'rgba(196,164,110,0.50)', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0 0', fontFamily: v3.font.ui,
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = v3.amberLight}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(196,164,110,0.50)'}
                >
                  {showAllOverdue ? 'Show less' : `+${sortedOverdue.length - LIST_CAP} more`} <ChevronRight size={11} />
                </button>
              )}
            </div>

            {/* ── Right column ────────────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto', height: '100%', paddingBottom: 20, paddingRight: 4 }}>

              {/* Today's route */}
              {todayStops.length > 0 && (
                <div>
                  <SectionLabel label="Today's Route" count={todayStops.length} href="/v3/planner" />
                  <div style={{ marginTop: 2 }}>
                    {todayStops.map((stop: any, i: number) => {
                      const visited = todayVisits.some(v => v.account_id === stop.account_id)
                      return (
                        <div key={stop.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 8px', borderBottom: i < todayStops.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          opacity: visited ? 0.45 : 1,
                        }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                            background: visited ? 'rgba(90,158,160,0.20)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${visited ? '#5a9ea0' : 'rgba(255,255,255,0.12)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {visited && <Check size={8} color="#5a9ea0" />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: visited ? 'rgba(255,255,255,0.40)' : v3.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {stop.accounts?.name ?? stop.title ?? 'Stop'}
                            </div>
                            {stop.notes && !visited && (
                              <div style={{ fontSize: '11px', color: v3.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stop.notes}</div>
                            )}
                          </div>
                          {!visited && (
                            <Link href={`/v3/planner`} style={{ textDecoration: 'none' }}>
                              <span style={{
                                fontSize: '9px', fontWeight: 800, letterSpacing: '0.08em',
                                textTransform: 'uppercase', color: v3.amber,
                                background: v3.amberDim, border: `1px solid rgba(196,164,110,0.20)`,
                                padding: '2px 7px', borderRadius: v3.radius.sm,
                              }}>Brief</span>
                            </Link>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <GoalWidget todayCount={todayVisits.length} mtdCount={mtdVisits.length} {...goals} />

              {/* At-risk placements */}
              {atRisk.length > 0 && (
                <div>
                  <SectionLabel label="Needs Attention" count={atRisk.length} countColor={v3.amber} />
                  <div style={{ marginTop: 2 }}>
                    {atRisk.slice(0, 5).map((p: any) => {
                      const ageDays = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000)
                      return (
                        <Link key={p.id} href={`/v3/territory/${p.account_id}`} style={{ textDecoration: 'none' }}>
                          <div className="v3-row-hover" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ width: 2, height: 26, flexShrink: 0, borderRadius: 1, background: `${v3.amber}70` }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.80)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.product_name}</div>
                              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>{p.accounts?.name ?? '—'}</div>
                            </div>
                            <span className="v3-mono" style={{ fontSize: '14px', color: v3.amber, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {p.status} {ageDays}d
                            </span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Open tasks */}
              {tasks.length > 0 && (
                <TaskList tasks={tasks} />
              )}

              {/* Logged today */}
              {todayVisits.length > 0 && (
                <div>
                  <SectionLabel label="Logged Today" count={todayVisits.length} countColor="#4aae84" />
                  <div style={{ marginTop: 2 }}>
                    {todayVisits.slice(0, 6).map(v => {
                      const cl = clients.find(c => c.slug === v.client_slug)
                      return (
                        <div key={v.id} className="v3-row-hover" style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#5a9ea0', flexShrink: 0, opacity: 0.7 }} />
                          <Link href={`/v3/territory/${(v as any).account_id}`} style={{ flex: 1, textDecoration: 'none', minWidth: 0 }}>
                            <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                              {(v as any).accounts?.name ?? '—'}
                            </span>
                          </Link>
                          {cl && <span style={{ fontSize: '14px', color: cl.color ? cl.color + 'bb' : 'rgba(196,164,110,0.50)', fontWeight: 600, flexShrink: 0 }}>{cl.name.split(' ')[0]}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Brand quick-nav */}
              {clients.length > 0 && (
                <div>
                  <SectionLabel label="Brands" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 10 }}>
                    {clients.map(c => {
                      const logo = clientLogoUrl(c)
                      const ac = c.color || v3.amber
                      return (
                        <Link key={c.slug} href={`/v3/brands/${c.slug}`} style={{ textDecoration: 'none' }}>
                          <div
                            style={{
                              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                              background: 'transparent', border: '1px solid rgba(255,255,255,0.05)',
                              borderRadius: v3.radius.sm, transition: 'all 140ms', cursor: 'pointer',
                            }}
                            onMouseEnter={e => {
                              const el = e.currentTarget as HTMLElement
                              el.style.borderColor = ac + '35'
                              el.style.background = ac + '08'
                            }}
                            onMouseLeave={e => {
                              const el = e.currentTarget as HTMLElement
                              el.style.borderColor = 'rgba(255,255,255,0.05)'
                              el.style.background = 'transparent'
                            }}
                          >
                            {logo
                              ? <img src={logo} alt="" style={{ width: 15, height: 15, objectFit: 'contain', opacity: 0.9 }} />
                              : <div style={{ width: 15, height: 15, borderRadius: '2px', background: ac + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: 900, color: ac + 'bb', flexShrink: 0 }}>{c.name[0]}</div>
                            }
                            <span style={{ fontSize: '14px', fontWeight: 400, color: 'rgba(255,255,255,0.40)', flex: 1, letterSpacing: '0.01em' }}>{c.name}</span>
                            <ChevronRight size={10} color="rgba(255,255,255,0.30)" />
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>
        )
      }

    </div>
  )
}
