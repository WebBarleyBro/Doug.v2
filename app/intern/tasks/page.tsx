'use client'
import { useState, useEffect } from 'react'
import { CheckSquare, Check, AlertCircle } from 'lucide-react'
import LayoutShell from '../../layout-shell'
import { claimTask as claimTaskHelper, completeTask as completeTaskHelper, getTasks, getUnclaimedTasks } from '../../lib/data'
import { getSupabase } from '../../lib/supabase'
import { t, card } from '../../lib/theme'
import { formatShortDateMT, nDaysAgoMT } from '../../lib/formatters'
import type { Task } from '../../lib/types'

const PRIORITY_DOT: Record<string, string> = {
  high:   '#e05252',
  urgent: '#e05252',
  medium: '#e89a2e',
  low:    '#3dba78',
}

function priorityDot(priority: string) {
  return PRIORITY_DOT[priority] || t.text.muted
}

export default function InternTasksPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [unclaimedTasks, setUnclaimedTasks] = useState<Task[]>([])
  const [completedTasks, setCompletedTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(uid: string) {
    const sevenDaysAgo = nDaysAgoMT(7)

    // My assigned tasks (assigned_to = user id), incomplete
    const mine = await getTasks({ userId: uid, completed: false })
    // Filter to only tasks assigned to this user (not just created by)
    const myOpen = mine.filter((tk: Task) => tk.assigned_to === uid || tk.user_id === uid)

    // Unclaimed tasks (assigned_to IS NULL), incomplete
    const unclaimed = await getUnclaimedTasks(30)

    // Completed tasks last 7 days
    const sb = getSupabase()
    const { data: done } = await sb
      .from('tasks')
      .select('*')
      .or(`user_id.eq.${uid},assigned_to.eq.${uid}`)
      .eq('completed', true)
      .gte('completed_at', sevenDaysAgo)
      .order('completed_at', { ascending: false })
      .limit(20)

    setMyTasks(myOpen)
    setUnclaimedTasks(unclaimed || [])
    setCompletedTasks(done || [])
    setLoading(false)
  }

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      try { await load(user.id) } catch (err: any) { setError(err.message || 'Failed to load tasks'); setLoading(false) }
    }).catch((err: any) => { setError(err.message || 'Auth error'); setLoading(false) })
  }, [])

  async function completeTask(taskId: string) {
    await completeTaskHelper(taskId)
    if (userId) load(userId)
  }

  async function claim(taskId: string) {
    if (!userId) return
    await claimTaskHelper(taskId, userId)
    load(userId)
  }

  if (loading) return <LayoutShell><div className="page-wrap" style={{ padding: '32px 48px', color: t.text.muted, fontSize: '14px' }}>Loading tasks...</div></LayoutShell>
  if (error && myTasks.length === 0 && unclaimedTasks.length === 0) return (
    <LayoutShell><div className="page-wrap" style={{ padding: '32px 48px', color: t.status.danger, fontSize: '14px' }}>{error}</div></LayoutShell>
  )

  return (
    <LayoutShell>
      <div className="page-wrap" style={{ padding: '32px 48px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>
            Tasks
          </h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Tasks assigned to you by the team. Claim available tasks to pick up extra work.</p>
        </div>

        {/* My open tasks */}
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckSquare size={14} /> My Tasks ({myTasks.length})
          </h2>
          {myTasks.length === 0 ? (
            <div style={{ ...card, padding: '24px', textAlign: 'center', color: t.text.muted, fontSize: '14px' }}>
              No open tasks assigned to you.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {myTasks.map(task => {
                const isOverdue = task.due_date && new Date(task.due_date) < new Date()
                return (
                  <div key={task.id} style={{ ...card, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px', borderLeft: `3px solid ${isOverdue ? '#e05252' : t.border.default}` }}>
                    <button
                      onClick={() => completeTask(task.id)}
                      title="Mark complete"
                      style={{ marginTop: '2px', width: 22, height: 22, borderRadius: '6px', border: `1.5px solid ${t.border.hover}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      <Check size={12} color={t.text.muted} />
                    </button>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: priorityDot(task.priority), flexShrink: 0, marginTop: '6px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: t.text.primary }}>{task.title}</div>
                      {(task.accounts as any)?.name && (
                        <div style={{ fontSize: '12px', color: t.text.secondary, marginTop: '2px' }}>
                          {(task.accounts as any).name}
                        </div>
                      )}
                    </div>
                    {task.due_date && (
                      <div style={{ fontSize: '11px', color: isOverdue ? '#e05252' : t.text.muted, flexShrink: 0 }}>
                        {isOverdue ? 'Overdue · ' : ''}{formatShortDateMT(task.due_date)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Unclaimed team tasks */}
        {unclaimedTasks.length > 0 && (
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              Team Tasks — Available to Claim ({unclaimedTasks.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {unclaimedTasks.map(task => {
                const isOverdue = task.due_date && new Date(task.due_date) < new Date()
                return (
                  <div key={task.id} style={{ ...card, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: priorityDot(task.priority), flexShrink: 0, marginTop: '6px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: t.text.primary }}>{task.title}</div>
                      {(task.accounts as any)?.name && (
                        <div style={{ fontSize: '12px', color: t.text.secondary, marginTop: '2px' }}>
                          {(task.accounts as any).name}
                        </div>
                      )}
                    </div>
                    {task.due_date && (
                      <div style={{ fontSize: '11px', color: isOverdue ? '#e05252' : t.text.muted, flexShrink: 0 }}>
                        {formatShortDateMT(task.due_date)}
                      </div>
                    )}
                    <button
                      onClick={() => claim(task.id)}
                      style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: `1px solid ${t.border.hover}`, background: 'none', color: t.text.secondary, cursor: 'pointer', flexShrink: 0 }}
                    >
                      Claim
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Completed this week */}
        {completedTasks.length > 0 && (
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              Completed — Last 7 Days ({completedTasks.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {completedTasks.map(task => (
                <div key={task.id} style={{ ...card, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '12px', opacity: 0.6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '6px', backgroundColor: t.status.successBg, border: `1.5px solid ${t.status.success}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={11} color={t.status.success} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: t.text.secondary, textDecoration: 'line-through' }}>{task.title}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: t.text.muted }}>
                    {task.completed_at ? formatShortDateMT(task.completed_at) : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {error && myTasks.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: t.status.danger, fontSize: '12px', marginBottom: '16px' }}>
            <AlertCircle size={13} />{error}
          </div>
        )}

        <div style={{ ...card, padding: '16px 20px', backgroundColor: t.bg.elevated, borderLeft: `3px solid ${t.status.info}` }}>
          <div style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.5 }}>
            Need something added to the task list? Message your manager and they&apos;ll assign it to you here.
          </div>
        </div>
      </div>
    </LayoutShell>
  )
}
