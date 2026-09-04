'use client'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ChevronRight, ArrowRight, Calendar, DollarSign, User, X } from 'lucide-react'
import { v3, v3input, v3label, v3btnPrimary, v3btnSecondary } from '../lib/theme'
import { useV3Toast } from '../lib/context'
import { getSupabase } from '../../lib/supabase'

// ── Pipeline stages ───────────────────────────────────────────────────────────
// Mirrors migration 062. Each stage has a color, label, and a one-line
// description of what "done" means (exit criteria — key to good BD process).

const STAGES = [
  {
    key:      'identified',
    label:    'Identified',
    color:    'rgba(255,255,255,0.25)',
    exit:     'Fits WP profile: category, territory, brand story, size',
  },
  {
    key:      'outreach_sent',
    label:    'Outreach Sent',
    color:    '#6878b4',
    exit:     'Email / DM / warm intro sent; awaiting response',
  },
  {
    key:      'call_scheduled',
    label:    'Call Scheduled',
    color:    '#a08440',
    exit:     'Intro call or meeting confirmed on calendar',
  },
  {
    key:      'pitch_done',
    label:    'Pitch Done',
    color:    '#c4a46e',
    exit:     'Presented WP value prop, territory, and comp model',
  },
  {
    key:      'terms_discussion',
    label:    'Terms',
    color:    '#5a9ea0',
    exit:     'Commission rate, territory, and scope agreed in principle',
  },
  {
    key:      'contract_sent',
    label:    'Contract Sent',
    color:    '#7ab4a0',
    exit:     'Agreement drafted and sent; awaiting signature',
  },
  {
    key:      'won',
    label:    'Won',
    color:    '#5a9ea0',
    exit:     'Signed. Brand is now a client.',
  },
  {
    key:      'lost',
    label:    'Lost',
    color:    '#bf7850',
    exit:     '',
  },
  {
    key:      'paused',
    label:    'Paused',
    color:    'rgba(255,255,255,0.20)',
    exit:     'Timing not right — resurface later',
  },
] as const

type Stage = typeof STAGES[number]['key']

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s])) as Record<Stage, typeof STAGES[number]>

// Active stages shown in the kanban (won/lost/paused shown separately)
const KANBAN_STAGES: Stage[] = ['identified', 'outreach_sent', 'call_scheduled', 'pitch_done', 'terms_discussion', 'contract_sent']

// ── Data ──────────────────────────────────────────────────────────────────────

function usePipeline() {
  return useQuery({
    queryKey: ['v3', 'pipeline'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('agency_pipeline')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as any[]
    },
    staleTime: 2 * 60_000,
  })
}

// ── AddProspectModal ──────────────────────────────────────────────────────────

function AddProspectModal({ onClose }: { onClose: () => void }) {
  const qc    = useQueryClient()
  const toast = useV3Toast()

  const [brandName,  setBrandName]  = useState('')
  const [contact,    setContact]    = useState('')
  const [email,      setEmail]      = useState('')
  const [phone,      setPhone]      = useState('')
  const [category,   setCategory]   = useState('')
  const [territory,  setTerritory]  = useState('')
  const [source,     setSource]     = useState('')
  const [priority,   setPriority]   = useState<'high' | 'medium' | 'low'>('medium')
  const [estValue,   setEstValue]   = useState('')
  const [notes,      setNotes]      = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextDate,   setNextDate]   = useState('')
  const [saving,     setSaving]     = useState(false)

  async function handleSave() {
    if (!brandName.trim()) { toast.show('Brand name required', 'error'); return }
    setSaving(true)
    try {
      const sb = getSupabase()
      const { error } = await sb.from('agency_pipeline').insert({
        brand_name:       brandName.trim(),
        contact_name:     contact.trim() || null,
        contact_email:    email.trim() || null,
        contact_phone:    phone.trim() || null,
        spirit_category:  category.trim() || null,
        territory:        territory.trim() || null,
        source:           source.trim() || null,
        priority,
        estimated_value:  estValue ? parseFloat(estValue) : null,
        notes:            notes.trim() || null,
        next_action:      nextAction.trim() || null,
        next_action_date: nextDate || null,
        stage:            'identified',
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['v3', 'pipeline'] })
      toast.show('Prospect added')
      onClose()
    } catch (err: any) {
      console.error('pipeline.add', err)
      toast.show('Failed to add prospect', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: v3.bg.overlay, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 0' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 520, background: v3.bg.sheet, borderRadius: 12, padding: '24px 20px 32px', margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: v3.type.lg, fontWeight: 700, color: v3.text.primary, fontFamily: v3.font.ui }}>Add Prospect</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4 }}><X size={16} /></button>
        </div>

        <div><label style={v3label}>Brand Name *</label><input style={v3input} value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="e.g. High Desert Distillery" autoFocus /></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={v3label}>Spirit Category</label><input style={v3input} value={category} onChange={e => setCategory(e.target.value)} placeholder="Whiskey, Gin, Mezcal…" /></div>
          <div><label style={v3label}>Territory</label><input style={v3input} value={territory} onChange={e => setTerritory(e.target.value)} placeholder="CO, Front Range…" /></div>
        </div>

        <div><label style={v3label}>Contact Name</label><input style={v3input} value={contact} onChange={e => setContact(e.target.value)} placeholder="Founder or brand rep" /></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={v3label}>Email</label><input style={v3input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="brand@email.com" /></div>
          <div><label style={v3label}>Phone</label><input style={v3input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={v3label}>Priority</label>
            <select style={{ ...v3input, paddingRight: 8 }} value={priority} onChange={e => setPriority(e.target.value as any)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div><label style={v3label}>Est. Annual Value</label><input style={v3input} type="number" value={estValue} onChange={e => setEstValue(e.target.value)} placeholder="$0" /></div>
          <div><label style={v3label}>Source</label><input style={v3input} value={source} onChange={e => setSource(e.target.value)} placeholder="Referral, cold…" /></div>
        </div>

        <div><label style={v3label}>Notes</label><textarea style={{ ...v3input, height: 70, resize: 'vertical' } as any} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Brand positioning, why they're a fit…" /></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={v3label}>Next Action</label><input style={v3input} value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="Send intro email, follow up…" /></div>
          <div><label style={v3label}>Due Date</label><input style={{ ...v3input, colorScheme: 'dark' }} type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} /></div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{ ...v3btnSecondary, flex: 1 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ ...v3btnPrimary, flex: 2, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Adding…' : 'Add to Pipeline'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ProspectDetailModal ───────────────────────────────────────────────────────

function ProspectDetailModal({ prospect, onClose }: { prospect: any; onClose: () => void }) {
  const qc    = useQueryClient()
  const toast = useV3Toast()
  const [advancing, setAdvancing] = useState(false)
  const [editNotes, setEditNotes] = useState(false)
  const [notes,     setNotes]     = useState(prospect.notes ?? '')
  const [nextAction, setNextAction] = useState(prospect.next_action ?? '')
  const [nextDate,   setNextDate]   = useState(prospect.next_action_date ?? '')

  const stageIdx      = KANBAN_STAGES.indexOf(prospect.stage)
  const nextStageKey  = KANBAN_STAGES[stageIdx + 1] as Stage | undefined
  const nextStageInfo = nextStageKey ? STAGE_MAP[nextStageKey] : null
  const stageInfo     = STAGE_MAP[prospect.stage as Stage] ?? { label: prospect.stage, color: v3.text.muted, exit: '' }

  async function advanceStage() {
    if (!nextStageKey) return
    setAdvancing(true)
    try {
      const sb = getSupabase()
      const { error } = await sb.from('agency_pipeline').update({ stage: nextStageKey, updated_at: new Date().toISOString() }).eq('id', prospect.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['v3', 'pipeline'] })
      toast.show(`Moved to ${STAGE_MAP[nextStageKey].label}`)
      onClose()
    } catch (err: any) {
      console.error('pipeline.advance', err)
      toast.show('Failed to advance', 'error')
    } finally {
      setAdvancing(false)
    }
  }

  async function updateStatus(stage: Stage) {
    const sb = getSupabase()
    const { error } = await sb.from('agency_pipeline').update({ stage, updated_at: new Date().toISOString() }).eq('id', prospect.id)
    if (error) { toast.show('Failed', 'error'); return }
    qc.invalidateQueries({ queryKey: ['v3', 'pipeline'] })
    toast.show(`Marked as ${STAGE_MAP[stage].label}`)
    onClose()
  }

  async function saveNotes() {
    const sb = getSupabase()
    const { error } = await sb.from('agency_pipeline').update({ notes, next_action: nextAction, next_action_date: nextDate || null, updated_at: new Date().toISOString() }).eq('id', prospect.id)
    if (error) { toast.show('Failed to save', 'error'); return }
    qc.invalidateQueries({ queryKey: ['v3', 'pipeline'] })
    toast.show('Saved')
    setEditNotes(false)
  }

  async function handleDelete() {
    if (!confirm(`Remove "${prospect.brand_name}" from the pipeline?`)) return
    const sb = getSupabase()
    const { error } = await sb.from('agency_pipeline').delete().eq('id', prospect.id)
    if (error) { toast.show('Failed to delete', 'error'); return }
    qc.invalidateQueries({ queryKey: ['v3', 'pipeline'] })
    toast.show('Removed from pipeline')
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: v3.bg.overlay, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 520, background: v3.bg.sheet, borderRadius: '12px 12px 0 0', padding: '20px 20px 36px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: v3.type.xl, fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 4 }}>{prospect.brand_name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: stageInfo.color, background: stageInfo.color + '18', padding: '2px 8px', borderRadius: v3.radius.sm, border: `1px solid ${stageInfo.color}28`, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: v3.font.ui }}>
                {stageInfo.label}
              </span>
              {prospect.spirit_category && <span style={{ fontSize: v3.type.xs, color: v3.text.muted }}>{prospect.spirit_category}</span>}
              {prospect.priority && (
                <span style={{ fontSize: 9, fontWeight: 700, color: prospect.priority === 'high' ? v3.status.danger : prospect.priority === 'medium' ? v3.amber : v3.text.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {prospect.priority.toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4, flexShrink: 0 }}><X size={16} /></button>
        </div>

        {/* Contact info */}
        {(prospect.contact_name || prospect.contact_email || prospect.contact_phone) && (
          <div style={{ background: v3.bg.card, borderRadius: v3.radius.md, padding: '10px 14px', border: `1px solid ${v3.border.subtle}` }}>
            <div style={{ fontSize: v3.type.xs, fontWeight: 700, color: v3.text.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Contact</div>
            {prospect.contact_name  && <div style={{ fontSize: v3.type.base, fontWeight: 600, color: v3.text.primary, marginBottom: 4 }}>{prospect.contact_name}</div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {prospect.contact_email && <a href={`mailto:${prospect.contact_email}`} style={{ fontSize: v3.type.sm, color: v3.text.link, textDecoration: 'none' }}>{prospect.contact_email}</a>}
              {prospect.contact_phone && <a href={`tel:${prospect.contact_phone}`} style={{ fontSize: v3.type.sm, color: v3.text.link, textDecoration: 'none' }}>{prospect.contact_phone}</a>}
            </div>
          </div>
        )}

        {/* Value + territory */}
        {(prospect.estimated_value || prospect.territory || prospect.source) && (
          <div style={{ display: 'flex', gap: 8 }}>
            {prospect.estimated_value && (
              <div style={{ flex: 1, background: v3.bg.card, borderRadius: v3.radius.md, padding: '10px 12px', border: `1px solid ${v3.border.subtle}`, textAlign: 'center' }}>
                <div style={{ fontSize: v3.type.lg, fontWeight: 800, color: v3.text.primary, fontFamily: v3.font.mono }}>${Number(prospect.estimated_value).toLocaleString()}</div>
                <div style={{ fontSize: v3.type.xs, color: v3.text.muted, fontWeight: 600 }}>Est. Annual</div>
              </div>
            )}
            {prospect.territory && (
              <div style={{ flex: 1, background: v3.bg.card, borderRadius: v3.radius.md, padding: '10px 12px', border: `1px solid ${v3.border.subtle}`, textAlign: 'center' }}>
                <div style={{ fontSize: v3.type.base, fontWeight: 700, color: v3.text.primary }}>{prospect.territory}</div>
                <div style={{ fontSize: v3.type.xs, color: v3.text.muted, fontWeight: 600 }}>Territory</div>
              </div>
            )}
            {prospect.source && (
              <div style={{ flex: 1, background: v3.bg.card, borderRadius: v3.radius.md, padding: '10px 12px', border: `1px solid ${v3.border.subtle}`, textAlign: 'center' }}>
                <div style={{ fontSize: v3.type.base, fontWeight: 700, color: v3.text.primary }}>{prospect.source}</div>
                <div style={{ fontSize: v3.type.xs, color: v3.text.muted, fontWeight: 600 }}>Source</div>
              </div>
            )}
          </div>
        )}

        {/* Stage exit criteria */}
        {stageInfo.exit && (
          <div style={{ background: stageInfo.color + '10', border: `1px solid ${stageInfo.color}22`, borderRadius: v3.radius.md, padding: '10px 14px' }}>
            <div style={{ fontSize: v3.type.xs, fontWeight: 700, color: stageInfo.color, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>To advance from this stage</div>
            <p style={{ margin: 0, fontSize: v3.type.sm, color: v3.text.secondary, lineHeight: 1.5 }}>{stageInfo.exit}</p>
          </div>
        )}

        {/* Next action */}
        {editNotes ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><label style={v3label}>Next Action</label><input style={v3input} value={nextAction} onChange={e => setNextAction(e.target.value)} /></div>
            <div><label style={v3label}>Due</label><input style={{ ...v3input, colorScheme: 'dark' }} type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} /></div>
            <div><label style={v3label}>Notes</label><textarea style={{ ...v3input, height: 80, resize: 'vertical' } as any} value={notes} onChange={e => setNotes(e.target.value)} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditNotes(false)} style={{ ...v3btnSecondary, flex: 1 }}>Cancel</button>
              <button onClick={saveNotes} style={{ ...v3btnPrimary, flex: 2 }}>Save</button>
            </div>
          </div>
        ) : (
          <div style={{ background: v3.bg.card, borderRadius: v3.radius.md, border: `1px solid ${v3.border.subtle}`, padding: '10px 14px', cursor: 'pointer' }} onClick={() => setEditNotes(true)}>
            {prospect.next_action ? (
              <>
                <div style={{ fontSize: v3.type.xs, fontWeight: 700, color: v3.amber, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Next Action</div>
                <div style={{ fontSize: v3.type.sm, color: v3.text.primary, marginBottom: prospect.next_action_date ? 4 : 0 }}>{prospect.next_action}</div>
                {prospect.next_action_date && <div style={{ fontSize: v3.type.xs, color: v3.text.muted }}>Due {prospect.next_action_date}</div>}
              </>
            ) : (
              <span style={{ fontSize: v3.type.sm, color: v3.text.muted }}>+ Add next action</span>
            )}
            {prospect.notes && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${v3.border.subtle}` }}>
                <p style={{ margin: 0, fontSize: v3.type.sm, color: v3.text.secondary, lineHeight: 1.5 }}>{prospect.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Advance / status actions */}
        {KANBAN_STAGES.includes(prospect.stage as any) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nextStageInfo && (
              <button onClick={advanceStage} disabled={advancing}
                style={{ ...v3btnPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: advancing ? 0.6 : 1 }}>
                <ArrowRight size={14} />
                Move to {nextStageInfo.label}
              </button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => updateStatus('won')}    style={{ ...v3btnSecondary, flex: 1, color: v3.status.success, borderColor: v3.status.success + '44', fontSize: 12 }}>Won ✓</button>
              <button onClick={() => updateStatus('paused')} style={{ ...v3btnSecondary, flex: 1, fontSize: 12 }}>Pause</button>
              <button onClick={() => updateStatus('lost')}   style={{ ...v3btnSecondary, flex: 1, color: v3.status.danger, borderColor: v3.status.danger + '44', fontSize: 12 }}>Lost</button>
            </div>
          </div>
        )}

        <button onClick={handleDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: v3.text.muted, fontSize: v3.type.sm, padding: '4px 0', textAlign: 'left', fontFamily: v3.font.ui }}>
          Remove from pipeline
        </button>
      </div>
    </div>
  )
}

// ── Prospect card ─────────────────────────────────────────────────────────────

function ProspectCard({ prospect, onClick }: { prospect: any; onClick: () => void }) {
  const stageInfo = STAGE_MAP[prospect.stage as Stage]

  const priorityColor = prospect.priority === 'high' ? v3.status.danger
    : prospect.priority === 'medium' ? v3.amber
    : v3.text.muted

  return (
    <div
      onClick={onClick}
      style={{
        background: v3.bg.card, border: `1px solid ${v3.border.subtle}`,
        borderRadius: v3.radius.md, padding: '12px 14px', cursor: 'pointer',
        transition: 'border-color 120ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = v3.border.default)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = v3.border.subtle)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: v3.type.base, fontWeight: 700, color: v3.text.primary, lineHeight: 1.3 }}>{prospect.brand_name}</span>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: priorityColor, flexShrink: 0, marginTop: 3 }} />
      </div>

      {prospect.spirit_category && (
        <div style={{ fontSize: v3.type.xs, color: v3.text.muted, marginBottom: 6 }}>{prospect.spirit_category}{prospect.territory ? ` · ${prospect.territory}` : ''}</div>
      )}

      {prospect.next_action && (
        <div style={{ fontSize: v3.type.sm, color: v3.text.secondary, lineHeight: 1.4, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {prospect.next_action}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {prospect.next_action_date ? (
          <span style={{ fontSize: v3.type.xs, color: v3.text.muted }}>{prospect.next_action_date}</span>
        ) : (
          <span style={{ fontSize: v3.type.xs, color: 'rgba(255,255,255,0.15)' }}>No due date</span>
        )}
        {prospect.estimated_value && (
          <span style={{ fontSize: v3.type.xs, color: v3.text.muted, fontFamily: v3.font.mono }}>${Number(prospect.estimated_value).toLocaleString()}</span>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProspectsPage() {
  const { data: all = [], isLoading } = usePipeline()
  const [showAdd,    setShowAdd]    = useState(false)
  const [selected,   setSelected]   = useState<any | null>(null)
  const [view,       setView]       = useState<'pipeline' | 'won' | 'lost'>('pipeline')

  const byStage = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const s of KANBAN_STAGES) map[s] = []
    for (const p of all) {
      if (KANBAN_STAGES.includes(p.stage)) map[p.stage].push(p)
    }
    return map
  }, [all])

  const won   = useMemo(() => all.filter(p => p.stage === 'won'),    [all])
  const lost  = useMemo(() => all.filter(p => p.stage === 'lost'),   [all])
  const paused = useMemo(() => all.filter(p => p.stage === 'paused'), [all])

  const totalPipelineValue = useMemo(() =>
    KANBAN_STAGES.flatMap(s => byStage[s] ?? [])
      .reduce((s, p) => s + (Number(p.estimated_value) || 0), 0),
    [byStage]
  )

  const openCount = KANBAN_STAGES.reduce((s, k) => s + (byStage[k]?.length ?? 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: v3.bg.page, fontFamily: v3.font.ui }}>

      {/* ── Header ── */}
      <div style={{ padding: '16px 16px 0', borderBottom: `1px solid ${v3.border.subtle}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: v3.type.xl, fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Prospects</h1>
            <p style={{ margin: '3px 0 0', fontSize: v3.type.sm, color: v3.text.muted }}>New brand clients for Western Peak</p>
          </div>
          <button onClick={() => setShowAdd(true)} style={{ ...v3btnPrimary, display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 12 }}>
            <Plus size={13} /> Add
          </button>
        </div>

        {/* KPI row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: v3.type.lg, fontWeight: 800, color: v3.text.primary, fontFamily: v3.font.mono, letterSpacing: '-0.02em' }}>{openCount}</div>
            <div style={{ fontSize: v3.type.xs, color: v3.text.muted, fontWeight: 600, letterSpacing: '0.06em' }}>OPEN</div>
          </div>
          <div style={{ width: 1, background: v3.border.subtle }} />
          <div>
            <div style={{ fontSize: v3.type.lg, fontWeight: 800, color: v3.text.primary, fontFamily: v3.font.mono, letterSpacing: '-0.02em' }}>
              {totalPipelineValue > 0 ? `$${(totalPipelineValue / 1000).toFixed(0)}k` : '—'}
            </div>
            <div style={{ fontSize: v3.type.xs, color: v3.text.muted, fontWeight: 600, letterSpacing: '0.06em' }}>PIPELINE VALUE</div>
          </div>
          <div style={{ width: 1, background: v3.border.subtle }} />
          <div>
            <div style={{ fontSize: v3.type.lg, fontWeight: 800, color: v3.status.success, fontFamily: v3.font.mono, letterSpacing: '-0.02em' }}>{won.length}</div>
            <div style={{ fontSize: v3.type.xs, color: v3.text.muted, fontWeight: 600, letterSpacing: '0.06em' }}>WON</div>
          </div>
        </div>

        {/* View tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {([['pipeline', 'Pipeline'], ['won', `Won (${won.length})`], ['lost', `Lost (${lost.length})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', fontSize: v3.type.sm, fontWeight: view === k ? 700 : 500, color: view === k ? v3.amber : v3.text.muted, borderBottom: `2px solid ${view === k ? v3.amber : 'transparent'}`, fontFamily: v3.font.ui, transition: 'color 100ms' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pipeline view ── */}
      {view === 'pipeline' && (
        <div style={{ overflowX: 'auto', padding: '16px 0 120px' }}>
          <div style={{ display: 'flex', gap: 12, padding: '0 16px', minWidth: 'max-content' }}>
            {KANBAN_STAGES.map(stageKey => {
              const stageInfo = STAGE_MAP[stageKey]
              const cards     = byStage[stageKey] ?? []
              return (
                <div key={stageKey} style={{ width: 220, flexShrink: 0 }}>
                  {/* Column header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: stageInfo.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: v3.text.secondary, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: v3.font.ui }}>
                        {stageInfo.label}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: v3.text.muted, fontFamily: v3.font.mono }}>{cards.length}</span>
                  </div>

                  {/* Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
                    {cards.map(p => (
                      <ProspectCard key={p.id} prospect={p} onClick={() => setSelected(p)} />
                    ))}
                    {cards.length === 0 && (
                      <div style={{ border: `1px dashed ${v3.border.subtle}`, borderRadius: v3.radius.md, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: v3.type.xs, color: 'rgba(255,255,255,0.15)' }}>Empty</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Paused section */}
          {paused.length > 0 && (
            <div style={{ padding: '24px 16px 0' }}>
              <div style={{ fontSize: v3.type.xs, fontWeight: 700, color: v3.text.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Paused ({paused.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {paused.map(p => (
                  <div key={p.id}
                    onClick={() => setSelected(p)}
                    style={{ background: v3.bg.card, border: `1px solid ${v3.border.subtle}`, borderRadius: v3.radius.md, padding: '8px 12px', cursor: 'pointer', opacity: 0.6 }}>
                    <span style={{ fontSize: v3.type.sm, color: v3.text.secondary }}>{p.brand_name}</span>
                    {p.paused_until && <span style={{ fontSize: v3.type.xs, color: v3.text.muted }}> · resurface {p.paused_until}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Won view ── */}
      {view === 'won' && (
        <div style={{ padding: '16px 16px 120px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {won.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: v3.text.muted }}>No won deals yet</div>
          ) : won.map(p => (
            <ProspectCard key={p.id} prospect={p} onClick={() => setSelected(p)} />
          ))}
        </div>
      )}

      {/* ── Lost view ── */}
      {view === 'lost' && (
        <div style={{ padding: '16px 16px 120px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lost.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: v3.text.muted }}>No lost deals yet</div>
          ) : lost.map(p => (
            <ProspectCard key={p.id} prospect={p} onClick={() => setSelected(p)} />
          ))}
        </div>
      )}

      {showAdd   && <AddProspectModal   onClose={() => setShowAdd(false)} />}
      {selected  && <ProspectDetailModal prospect={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
