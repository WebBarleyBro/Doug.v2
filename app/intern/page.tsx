'use client'
import { useState, useEffect } from 'react'
import { CheckSquare, ExternalLink, BookOpen, FolderOpen, Check } from 'lucide-react'
import LayoutShell from '../layout-shell'
import { getTasks } from '../lib/data'
import { getSupabase } from '../lib/supabase'
import { t, card } from '../lib/theme'
import { formatShortDateMT } from '../lib/formatters'

const RESOURCES = [
  { label: 'Brand Resources', href: '/intern/resources', icon: '📦' },
  { label: 'Campaigns', href: '/marketing', icon: '📣' },
]

export default function InternPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [doneThisWeek, setDoneThisWeek] = useState<number | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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
      setProfile(p)
      try {
        const [openTasks, completedTasks] = await Promise.all([
          getTasks({ userId: user.id, completed: false }),
          getTasks({ userId: user.id, completed: true }),
        ])
        setTasks(openTasks)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        setDoneThisWeek(completedTasks.filter((t: any) => t.completed_at && new Date(t.completed_at) >= weekAgo).length)
      } catch { /* RLS may block — show empty state */ }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function complete(id: string) {
    const sb = getSupabase()
    await sb.from('tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const openTasks = tasks.filter(t => !t.completed)
  const overdue = openTasks.filter(t => t.due_date && new Date(t.due_date) < new Date())

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>
            {profile?.name ? `Hey, ${profile.name.split(' ')[0]}` : 'Intern Dashboard'}
          </h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Your work hub — tasks assigned to you, campaigns to support, and brand resources</p>
        </div>

        {/* Task summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '28px' }}>
          {[
            { label: 'Open Tasks', value: openTasks.length, color: openTasks.length > 0 ? t.gold : '#3dba78' },
            { label: 'Overdue', value: overdue.length, color: overdue.length > 0 ? '#e05252' : '#3dba78' },
            { label: 'Done This Week', value: doneThisWeek ?? '—', color: doneThisWeek != null && doneThisWeek > 0 ? '#3dba78' : t.text.muted },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding: '16px 18px' }}>
              <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tasks */}
        <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckSquare size={16} /> Your Tasks
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px' }}>
          {openTasks.length === 0 ? (
            <div style={{ color: t.text.muted, fontSize: '14px', padding: '24px 0', textAlign: 'center' }}>All caught up! No open tasks.</div>
          ) : openTasks.map(task => {
            const isOverdue = task.due_date && new Date(task.due_date) < new Date()
            return (
              <div key={task.id} style={{ ...card, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px', borderLeft: `3px solid ${isOverdue ? '#e05252' : t.border.default}` }}>
                <button onClick={() => complete(task.id)} style={{ marginTop: '2px', width: 22, height: 22, borderRadius: '6px', border: `1.5px solid ${t.border.hover}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Check size={12} color={t.text.muted} />
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: t.text.primary }}>{task.title}</div>
                  {task.description && <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>{task.description}</div>}
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

        {/* Resources */}
        <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={16} /> Resources
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
          {RESOURCES.map(r => (
            <a key={r.label} href={r.href} style={{ ...card, padding: '14px 16px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <span style={{ fontSize: '18px' }}>{r.icon}</span>
              <span style={{ fontSize: '13px', fontWeight: '500', color: t.text.primary, flex: 1 }}>{r.label}</span>
              <ExternalLink size={12} color={t.text.muted} />
            </a>
          ))}
        </div>
      </div>
    </LayoutShell>
  )
}
