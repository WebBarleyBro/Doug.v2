'use client'
import { useState, useEffect, useRef } from 'react'
import { Upload, AlertCircle, CheckCircle, X } from 'lucide-react'
import LayoutShell from '../../layout-shell'
import { getSupabase } from '../../lib/supabase'
import { t, card, btnPrimary, inputStyle, labelStyle, selectStyle } from '../../lib/theme'
import { formatShortDateMT } from '../../lib/formatters'

type AssetType = 'Social Media Graphic' | 'Video' | 'Copy/Caption' | 'Blog Post' | 'Email Draft' | 'Photo' | 'Other'
type AssetStatus = 'pending' | 'approved' | 'changes_requested'

interface InternAsset {
  id: string
  title: string
  asset_type: AssetType
  project_id?: string
  file_url?: string
  notes?: string
  status: AssetStatus
  feedback?: string
  submitted_by?: string
  created_at: string
}

interface InternProject {
  id: string
  title: string
}

const ASSET_TYPES: AssetType[] = [
  'Social Media Graphic', 'Video', 'Copy/Caption',
  'Blog Post', 'Email Draft', 'Photo', 'Other',
]

const STATUS_STYLE: Record<AssetStatus, { label: string; color: string; bg: string }> = {
  pending:           { label: 'Pending Review', color: t.status.warning, bg: t.status.warningBg },
  approved:          { label: 'Approved',        color: t.status.success, bg: t.status.successBg },
  changes_requested: { label: 'Changes Needed',  color: t.status.danger,  bg: t.status.dangerBg  },
}

export default function InternAssetsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [assets, setAssets] = useState<InternAsset[]>([])
  const [projects, setProjects] = useState<InternProject[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    title: '',
    asset_type: 'Social Media Graphic' as AssetType,
    project_id: '',
    notes: '',
  })
  const [file, setFile] = useState<File | null>(null)

  async function loadAssets(uid: string) {
    const sb = getSupabase()
    const { data } = await sb
      .from('intern_assets')
      .select('*')
      .eq('submitted_by', uid)
      .order('created_at', { ascending: false })
    setAssets((data || []) as InternAsset[])
    setLoading(false)
  }

  async function loadProjects(uid: string) {
    const sb = getSupabase()
    const { data } = await sb
      .from('intern_projects')
      .select('id, title')
      .eq('assigned_to', uid)
      .order('created_at', { ascending: false })
    setProjects((data || []) as InternProject[])
  }

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      await Promise.all([loadAssets(user.id), loadProjects(user.id)])
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (!form.title.trim()) { setError('Please enter a title'); return }
    if (!file) { setError('Please select a file to upload'); return }
    if (!userId) return

    setUploading(true)
    try {
      const sb = getSupabase()

      // Upload file to intern-assets bucket
      const ext = file.name.split('.').pop() || 'bin'
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { data: uploadData, error: uploadErr } = await sb.storage
        .from('intern-assets')
        .upload(path, file, { upsert: false })

      if (uploadErr) throw new Error(uploadErr.message)

      const { data: { publicUrl } } = sb.storage.from('intern-assets').getPublicUrl(path)

      // Insert row into intern_assets
      const { error: insertErr } = await sb.from('intern_assets').insert({
        title: form.title.trim(),
        asset_type: form.asset_type,
        project_id: form.project_id || null,
        file_url: publicUrl,
        notes: form.notes || null,
        status: 'pending',
        submitted_by: userId,
      })

      if (insertErr) throw new Error(insertErr.message)

      setSuccess(true)
      setForm({ title: '', asset_type: 'Social Media Graphic', project_id: '', notes: '' })
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await loadAssets(userId)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Upload size={20} /> Assets
          </h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Upload your work and track review status</p>
        </div>

        {/* Upload form */}
        <div style={{ ...card, marginBottom: '32px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary, marginBottom: '18px' }}>Submit New Asset</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. July Instagram Post — NoCo"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Asset Type *</label>
                <select value={form.asset_type} onChange={e => setForm(f => ({ ...f, asset_type: e.target.value as AssetType }))} style={selectStyle}>
                  {ASSET_TYPES.map(at => <option key={at} value={at}>{at}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Project (optional)</label>
                <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} style={selectStyle}>
                  <option value="">No project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>File *</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  style={{ ...inputStyle, padding: '8px 12px', cursor: 'pointer' }}
                />
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Context, references, or instructions for the reviewer..."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
              />
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: t.status.dangerBg, borderRadius: '8px', color: t.status.danger, fontSize: '13px', marginBottom: '14px' }}>
                <AlertCircle size={14} />{error}
              </div>
            )}
            {success && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: t.status.successBg, borderRadius: '8px', color: t.status.success, fontSize: '13px', marginBottom: '14px' }}>
                <CheckCircle size={14} />Asset submitted for review!
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={uploading} style={{ ...btnPrimary, opacity: uploading ? 0.6 : 1 }}>
                <Upload size={14} />{uploading ? 'Uploading...' : 'Submit Asset'}
              </button>
            </div>
          </form>
        </div>

        {/* Submitted assets list */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            Submitted Assets ({assets.length})
          </h2>
          {loading ? (
            <div style={{ color: t.text.muted, fontSize: '14px' }}>Loading...</div>
          ) : assets.length === 0 ? (
            <div style={{ ...card, padding: '32px', textAlign: 'center', color: t.text.muted, fontSize: '14px' }}>
              No assets submitted yet. Use the form above to submit your first one.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {assets.map(asset => {
                const s = STATUS_STYLE[asset.status] || STATUS_STYLE.pending
                return (
                  <div key={asset.id} style={{ ...card, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{asset.title}</div>
                          <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '12px', backgroundColor: s.bg, color: s.color }}>{s.label}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: t.text.muted }}>
                          {asset.asset_type} · Submitted {formatShortDateMT(asset.created_at)}
                        </div>
                        {asset.notes && (
                          <div style={{ fontSize: '12px', color: t.text.secondary, marginTop: '4px' }}>{asset.notes}</div>
                        )}
                        {asset.status === 'changes_requested' && asset.feedback && (
                          <div style={{ marginTop: '10px', padding: '10px 14px', backgroundColor: t.status.dangerBg, borderRadius: '8px', borderLeft: `3px solid ${t.status.danger}` }}>
                            <div style={{ fontSize: '10px', fontWeight: '700', color: t.status.danger, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Feedback</div>
                            <div style={{ fontSize: '13px', color: t.text.secondary }}>{asset.feedback}</div>
                          </div>
                        )}
                      </div>
                      {asset.file_url && (
                        <a href={asset.file_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: t.gold, textDecoration: 'none', flexShrink: 0, padding: '4px 10px', borderRadius: '6px', border: `1px solid ${t.goldBorder}` }}>
                          View File
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </LayoutShell>
  )
}
