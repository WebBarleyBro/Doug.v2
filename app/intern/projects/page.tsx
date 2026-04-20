'use client'
import { useState, useEffect } from 'react'
import { FolderOpen, AlertCircle } from 'lucide-react'
import LayoutShell from '../../layout-shell'
import { getClients } from '../../lib/data'
import { getSupabase } from '../../lib/supabase'
import { t, card } from '../../lib/theme'
import { formatShortDateMT } from '../../lib/formatters'
import type { Client } from '../../lib/types'

type ProjectStatus = 'briefed' | 'in_progress' | 'in_review' | 'approved' | 'completed'

interface InternProject {
  id: string
  title: string
  description?: string
  status: ProjectStatus
  due_date?: string
  owner_feedback?: string
  assigned_to?: string
  client_slug?: string
  created_at: string
}

const STATUS_BADGE: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
  briefed:     { label: 'Briefed',      color: t.status.info,    bg: t.status.infoBg    },
  in_progress: { label: 'In Progress',  color: t.status.warning, bg: t.status.warningBg },
  in_review:   { label: 'In Review',    color: t.gold,           bg: t.goldDim          },
  approved:    { label: 'Approved',     color: t.status.success, bg: t.status.successBg },
  completed:   { label: 'Completed',    color: t.text.muted,     bg: t.status.neutralBg },
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.briefed
  return (
    <span style={{
      fontSize: '11px', fontWeight: '600', padding: '3px 9px', borderRadius: '20px',
      textTransform: 'uppercase', letterSpacing: '0.04em',
      backgroundColor: s.bg, color: s.color,
      display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

export default function InternProjectsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [projects, setProjects] = useState<InternProject[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState<string | null>(null)

  async function loadProjects(uid: string) {
    const sb = getSupabase()
    const { data, error: err } = await sb
      .from('intern_projects')
      .select('*')
      .eq('assigned_to', uid)
      .order('created_at', { ascending: false })

    if (err) {
      setError(err.message)
    } else {
      setProjects((data || []) as InternProject[])
    }
    setLoading(false)
  }

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      const [, cls] = await Promise.all([
        loadProjects(user.id),
        getClients(),
      ])
      setClients(cls)
    })
  }, [])

  async function submitForReview(projectId: string) {
    setSubmitting(projectId)
    const sb = getSupabase()
    await sb.from('intern_projects').update({ status: 'in_review' }).eq('id', projectId)
    if (userId) await loadProjects(userId)
    setSubmitting(null)
  }

  if (loading) {
    return (
      <LayoutShell>
        <div style={{ padding: '32px 48px', color: t.text.muted, fontSize: '14px' }}>Loading projects...</div>
      </LayoutShell>
    )
  }

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FolderOpen size={20} /> Projects
          </h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Projects assigned to you by the Barley Bros team</p>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: t.status.dangerBg, borderRadius: '8px', color: t.status.danger, fontSize: '13px', marginBottom: '20px' }}>
            <AlertCircle size={15} />{error}
          </div>
        )}

        {projects.length === 0 ? (
          <div style={{ ...card, padding: '48px', textAlign: 'center', color: t.text.muted }}>
            <FolderOpen size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
            <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '6px' }}>No projects yet</div>
            <div style={{ fontSize: '13px' }}>Projects will appear here when the team assigns them to you.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {projects.map(project => {
              const client = clients.find(c => c.slug === project.client_slug)
              const canSubmit = project.status === 'in_progress' || project.status === 'briefed'
              return (
                <div key={project.id} style={{ ...card, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: t.text.primary }}>{project.title}</div>
                        <StatusBadge status={project.status} />
                      </div>
                      {client && (
                        <div style={{ fontSize: '12px', color: client.color || t.gold, fontWeight: '600', marginBottom: '4px' }}>
                          {client.name}
                        </div>
                      )}
                      {project.description && (
                        <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.5, margin: 0 }}>{project.description}</p>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      {project.due_date && (
                        <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '8px' }}>
                          Due {formatShortDateMT(project.due_date)}
                        </div>
                      )}
                      {canSubmit && (
                        <button
                          onClick={() => submitForReview(project.id)}
                          disabled={submitting === project.id}
                          style={{
                            padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                            backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`,
                            color: t.gold, cursor: 'pointer', opacity: submitting === project.id ? 0.6 : 1,
                          }}
                        >
                          {submitting === project.id ? 'Submitting...' : 'Submit for Review'}
                        </button>
                      )}
                    </div>
                  </div>

                  {project.owner_feedback && (
                    <div style={{
                      marginTop: '12px', padding: '10px 14px',
                      backgroundColor: t.bg.elevated, borderRadius: '8px',
                      borderLeft: `3px solid ${t.gold}`,
                    }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: t.gold, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Team Feedback</div>
                      <div style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.5 }}>{project.owner_feedback}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
