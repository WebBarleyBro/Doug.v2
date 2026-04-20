'use client'
import { useState, useEffect } from 'react'
import { CheckSquare, Check, Plus, AlertCircle } from 'lucide-react'
import LayoutShell from '../../layout-shell'
import { getTasks, createTask } from '../../lib/data'
import { getSupabase } from '../../lib/supabase'
import { t, card, btnPrimary, inputStyle, labelStyle, selectStyle } from '../../lib/theme'
import { formatShortDateMT, todayMT, nDaysAgoMT } from '../../lib/formatters'
import type { Task, TaskPriority } from '../../lib/types'

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
  const [addForm, setAddForm] = useState({ title: '', priority: 'medium' as TaskPriority, due_date: '' })
  const [saving, setSaving] = useState(false)

  async function load(uid: string) {
    const sb = getSupabase()
    const sevenDaysAgo = nDaysAgoMT(7)

    // My assigned tasks (assigned_to = user id), incomplete
    const mine = await getTasks({ userId: uid, completed: false })
    // Filter to only tasks assigned to this user (not just created by)
    const myOpen = mine.filter((tk: Task) => tk.assigned_to === uid || tk.user_id === uid)

    // Unclaimed tasks (assigned_to IS NULL), incomplete
    const { data: unclaimed } = await sb
      .from('tasks')
      .select('*, accounts(id, name)')
      .is('assigned_to', null)
      .eq('completed', false)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(30)

    // Completed tasks last 7 days
    const { data: done } = await sb
      .from('tasks')
      .select('*, accounts(id, name)')
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
      if (!user) return
      setUserId(user.id)
      await load(user.id)
    })
  }, [])

  async function completeTask(taskId: string) {
    const sb = getSupabase()
    await sb.from('tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', taskId)
    if (userId) load(userId)
  }

  async function claimTask(taskId: string) {
    if (!userId) return
    const sb = getSupabase()
    await sb.from('tasks').update({ assigned_to: userId }).eq('id', taskId)
    load(userId)
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.title.trim() || !userId) return
    setSaving(true)
    try {
      await createTask({
        user_id: userId,
        assigned_to: userId,
        title: addForm.title.trim(),
        priority: addForm.priority,
        due_date: addForm.due_date || undefined,
      })
      setAddForm({ title: '', priority: 'medium', due_date: '' })
      load(userId)
    } catch (err: any) {
      setError(err.message || 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <LayoutShell>
        <div style={{ padding: '32px 48px', color: t.text.muted, fontSize: '14px' }}>Loading tasks...</div>
      </LayoutShell>
    )
  }

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>
            Tasks
          </h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Your assigned tasks and team tasks you can claim</p>
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
                      onClick={() => claimTask(task.id)}
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

        {/* Quick add form */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            Add a Task
          </h2>
          <div style={{ ...card }}>
            <form onSubmit={handleAddTask}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'end' }}>
                <div>
                  <label style={labelStyle}>Task Title</label>
                  <input
                    type="text"
                    value={addForm.title}
                    onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="What needs to be done?"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Priority</label>
                  <select value={addForm.priority} onChange={e => setAddForm(f => ({ ...f, priority: e.target.value as TaskPriority }))} style={{ ...selectStyle, width: '120px' }}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Due Date</label>
                  <input
                    type="date"
                    value={addForm.due_date}
                    min={todayMT()}
                    onChange={e => setAddForm(f => ({ ...f, due_date: e.target.value }))}
                    style={{ ...inputStyle, width: '150px' }}
                  />
                </div>
              </div>
              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: t.status.danger, fontSize: '12px', marginTop: '10px' }}>
                  <AlertCircle size={13} />{error}
                </div>
              )}
              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" disabled={saving || !addForm.title.trim()} style={{ ...btnPrimary, opacity: saving || !addForm.title.trim() ? 0.6 : 1 }}>
                  <Plus size={14} /> {saving ? 'Adding...' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </LayoutShell>
  )
}
