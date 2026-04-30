'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, X, Plus } from 'lucide-react'
import LayoutShell from '../../../layout-shell'
import { t, inputStyle, labelStyle, selectStyle, btnPrimary, btnSecondary } from '../../../lib/theme'
import { getClients } from '../../../lib/data'
import { createMarket } from '../../../lib/concentric/data'
import type { Client } from '../../../lib/types'

function TagInput({
  label, values, onChange,
}: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')

  function add() {
    const val = draft.trim()
    if (val && !values.includes(val)) onChange([...values, val])
    setDraft('')
  }

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center',
        padding: '8px', borderRadius: '8px', border: `1px solid ${t.border.default}`,
        backgroundColor: t.bg.input, minHeight: '42px',
      }}>
        {values.map(v => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 8px', borderRadius: '5px', fontSize: '12px',
            backgroundColor: t.goldDim, color: t.gold, border: `1px solid ${t.goldBorder}`,
          }}>
            {v}
            <button type="button" onClick={() => onChange(values.filter(x => x !== v))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: t.gold, display: 'flex', alignItems: 'center' }}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          onBlur={add}
          placeholder={values.length === 0 ? `Add ${label.toLowerCase()}…` : '+'}
          style={{
            flex: 1, minWidth: '80px', background: 'none', border: 'none', outline: 'none',
            fontSize: '13px', color: t.text.primary,
          }}
        />
      </div>
      <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '3px' }}>Press Enter or comma to add</div>
    </div>
  )
}

export default function NewMarketPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    client_slug: '',
    priority: false,
    cities: [] as string[],
    counties: [] as string[],
    states: [] as string[],
    zip_codes: [] as string[],
    default_reach_threshold: 55,
    default_retention_threshold: 65,
    notes: '',
  })

  useEffect(() => { getClients().then(setClients).catch(() => {}) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Name is required.'); return }
    if (!form.client_slug) { setError('Client is required.'); return }

    setSaving(true)
    try {
      const market = await createMarket({
        name: form.name.trim(),
        client_slug: form.client_slug,
        priority: form.priority,
        cities: form.cities,
        counties: form.counties,
        states: form.states,
        zip_codes: form.zip_codes,
        default_reach_threshold: form.default_reach_threshold,
        default_retention_threshold: form.default_retention_threshold,
        notes: form.notes || undefined,
      })
      router.push(`/growth/markets/${market.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create market.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <LayoutShell>
      <div style={{ padding: '28px 40px', maxWidth: '640px', margin: '0 auto' }}>

        <button onClick={() => router.back()} style={{
          display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '20px',
          background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', fontSize: '13px',
        }}>
          <ChevronLeft size={15} /> Back
        </button>

        <h1 style={{ fontSize: '20px', fontWeight: '800', color: t.text.primary, marginBottom: '24px' }}>New Market</h1>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Market Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Northern Colorado" style={inputStyle} required />
            </div>

            <div>
              <label style={labelStyle}>Client *</label>
              <select value={form.client_slug} onChange={e => setForm(f => ({ ...f, client_slug: e.target.value }))} style={selectStyle} required>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '22px' }}>
              <button type="button" onClick={() => setForm(f => ({ ...f, priority: !f.priority }))} style={{
                width: 20, height: 20, borderRadius: '4px', cursor: 'pointer',
                border: `2px solid ${form.priority ? t.gold : t.border.default}`,
                backgroundColor: form.priority ? t.gold : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {form.priority && <span style={{ color: '#0f0e0c', fontSize: '12px', fontWeight: '800' }}>✓</span>}
              </button>
              <label style={{ fontSize: '13px', color: t.text.secondary, cursor: 'pointer' }}
                onClick={() => setForm(f => ({ ...f, priority: !f.priority }))}>
                Priority market ★
              </label>
            </div>
          </div>

          {/* Geography */}
          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: t.bg.input, border: `1px solid ${t.border.default}` }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>
              Geographic Definition
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <TagInput label="Cities" values={form.cities} onChange={v => setForm(f => ({ ...f, cities: v }))} />
              <TagInput label="Counties" values={form.counties} onChange={v => setForm(f => ({ ...f, counties: v }))} />
              <TagInput label="States" values={form.states} onChange={v => setForm(f => ({ ...f, states: v }))} />
              <TagInput label="Zip Codes" values={form.zip_codes} onChange={v => setForm(f => ({ ...f, zip_codes: v }))} />
            </div>
          </div>

          {/* Default thresholds */}
          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: t.bg.input, border: `1px solid ${t.border.default}` }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>
              Default Thresholds (zones inherit these unless overridden)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Reach Target (%)</label>
                <input type="number" min="0" max="100" value={form.default_reach_threshold}
                  onChange={e => setForm(f => ({ ...f, default_reach_threshold: Number(e.target.value) }))}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Retention Target (%)</label>
                <input type="number" min="0" max="100" value={form.default_retention_threshold}
                  onChange={e => setForm(f => ({ ...f, default_retention_threshold: Number(e.target.value) }))}
                  style={inputStyle} />
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
              placeholder="Context, strategy, anything useful…" />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button type="button" onClick={() => router.back()} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create Market'}
            </button>
          </div>
        </form>
      </div>
    </LayoutShell>
  )
}
