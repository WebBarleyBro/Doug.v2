'use client'
import { useState, useEffect } from 'react'
import { Users, ClipboardList, Plus, X, Check } from 'lucide-react'
import LayoutShell from '../layout-shell'
import { getTasks, createTask } from '../lib/data'
import { getSupabase } from '../lib/supabase'
import { t, card, btnPrimary, btnSecondary, inputStyle, labelStyle, selectStyle, badge } from '../lib/theme'
import { formatShortDateMT } from '../lib/formatters'

export default function InternHubPage() {
  const [interns, setInterns] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAssign, setShowAssign] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', assigned_to: '', due_date: '', priority: 'medium' })
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const sb = getSupabase()
    Promise.all([
      sb.from('user_profiles').select('*').eq('role', 'intern'),
      getTasks(),
    ]).then(([{ data: internData }, taskData]) => {
      setInterns(internData || [])
      setTasks(taskData.filter(t => t.assigned_to && internData?.find((i: any) => i.id === t.assigned_to)))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function handleAssign() {
    if (!form.title || !form.assigned_to) return
    await createTask({
      title: form.title,
      description: form.description || undefined,
      assigned_to: form.assigned_to,
      due_date: form.due_date || undefined,
      priority: form.priority as any,
    })
    const sb = getSupabase()
    const allTasks = await getTasks()
    const { data: internData } = await sb.from('user_profiles').select('*').eq('role', 'intern')
    setTasks(allTasks.filter(t => t.assigned_to && internData?.find((i: any) => i.id === t.assigned_to)))
    setShowAssign(false)
    setForm({ title: '', description: '', assigned_to: '', due_date: '', priority: 'medium' })
  }

  async function completeTask(id: string) {
    const sb = getSupabase()
    await sb.from('tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Intern Hub</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Manage intern assignments and tasks</p>
          </div>
          <button onClick={() => setShowAssign(true)} style={btnPrimary}><Plus size={16} /> Assign Task</button>
        </div>

        {/* Intern cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px', marginBottom: '28px' }}>
          {interns.map(intern => {
            const internTasks = tasks.filter(t => t.assigned_to === intern.id)
            const open = internTasks.filter(t => !t.completed).length
            return (
              <div key={intern.id} style={{ ...card, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '10px', backgroundColor: t.gold + '20', border: `1px solid ${t.gold}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: t.gold }}>
                    {intern.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{intern.name}</div>
                    <div style={{ fontSize: '11px', color: t.text.muted }}>{intern.full_name || intern.email || 'Intern'}</div>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: t.text.secondary }}>
                  <span style={{ fontWeight: '600', color: open > 0 ? t.gold : t.text.muted }}>{open}</span> open task{open !== 1 ? 's' : ''}
                </div>
              </div>
            )
          })}
          {interns.length === 0 && !loading && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', color: t.text.muted, fontSize: '14px' }}>
              No interns found. Invite them from Supabase auth with role = intern.
            </div>
          )}
        </div>

        {/* Task list */}
        <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardList size={16} /> Open Intern Tasks
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tasks.filter(t => !t.completed).length === 0 ? (
            <div style={{ color: t.text.muted, fontSize: '13px', padding: '20px 0' }}>No open tasks assigned to interns</div>
          ) : tasks.filter(tk => !tk.completed).map(task => {
            const intern = interns.find(i => i.id === task.assigned_to)
            return (
              <div key={task.id} style={{ ...card, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => completeTask(task.id)} style={{ width: 22, height: 22, borderRadius: '6px', border: `1.5px solid ${t.border.hover}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Check size={12} color={t.text.muted} />
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: t.text.primary }}>{task.title}</div>
                  {task.description && <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>{task.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                  {intern && <span style={{ fontSize: '11px', color: t.text.secondary }}>{intern.name}</span>}
                  {task.due_date && <span style={{ fontSize: '11px', color: t.text.muted }}>{formatShortDateMT(task.due_date)}</span>}
                  {task.priority && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '6px', backgroundColor: task.priority === 'high' ? '#e0525220' : t.bg.elevated, color: task.priority === 'high' ? '#e05252' : t.text.muted, fontWeight: '600', textTransform: 'uppercase' }}>{task.priority}</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Assign Task Modal */}
        {showAssign && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '440px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '600', color: t.text.primary }}>Assign Task</h3>
                <button onClick={() => setShowAssign(false)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div><label style={labelStyle}>Task Title</label><input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What needs to be done?" style={inputStyle} /></div>
                <div><label style={labelStyle}>Assign To</label>
                  <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} style={selectStyle}>
                    <option value="">Select intern...</option>
                    {interns.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                  <div><label style={labelStyle}>Due Date</label><input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Priority</label>
                    <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={selectStyle}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div><label style={labelStyle}>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'none' }} /></div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setShowAssign(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleAssign} disabled={!form.title || !form.assigned_to} style={{ ...btnPrimary, opacity: (!form.title || !form.assigned_to) ? 0.6 : 1 }}>Assign</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
