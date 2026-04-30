'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LayoutShell from '../../../layout-shell'
import { t, inputStyle, labelStyle, selectStyle, btnPrimary, btnSecondary } from '../../../lib/theme'
import { getMarkets, createZone } from '../../../lib/concentric/data'
import type { Market } from '../../../lib/concentric/types'

const CHANNEL_OPTIONS = [
  { value: 'on_premise', label: 'On-Premise' },
  { value: 'off_premise', label: 'Off-Premise' },
  { value: 'both', label: 'Both' },
]
const POSTURE_OPTIONS = [
  { value: 'opportunistic', label: 'Opportunistic — no plan yet, will respond to inbound' },
  { value: 'active', label: 'Active — proactively working new accounts and education' },
  { value: 'maintaining', label: 'Maintaining — defending position with steady effort' },
  { value: 'monitoring', label: 'Monitoring — reactive only' },
]

function NewZoneContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultMarket = searchParams.get('market') ?? ''

  const [markets, setMarkets] = useState<Market[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    market_id: defaultMarket,
    name: '',
    channel: 'on_premise',
    phase: 1,
    posture: 'opportunistic',
    velocity_target: '',
    reach_threshold: '',
    retention_threshold: '',
    projected_monthly_cases: '',
    notes: '',
  })

  useEffect(() => { getMarkets().then(setMarkets).catch(() => {}) }, [])

  const selectedMarket = markets.find(m => m.id === form.market_id)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.market_id) { setError('Select a market.'); return }
    if (!form.name.trim()) { setError('Zone name is required.'); return }
    if (!form.velocity_target || Number(form.velocity_target) <= 0) {
      setError('Velocity Target is required and must be greater than 0.'); return
    }

    setSaving(true)
    try {
      const zone = await createZone({
        market_id: form.market_id,
        name: form.name.trim(),
        channel: form.channel,
        phase: form.phase,
        posture: form.posture,
        velocity_target: Number(form.velocity_target),
        reach_threshold: form.reach_threshold !== '' ? Number(form.reach_threshold) : null,
        retention_threshold: form.retention_threshold !== '' ? Number(form.retention_threshold) : null,
        projected_monthly_cases: form.projected_monthly_cases !== '' ? Number(form.projected_monthly_cases) : null,
        notes: form.notes || undefined,
      })
      router.push(`/growth/zones/${zone.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create zone.')
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
          ‹ Back
        </button>

        <h1 style={{ fontSize: '20px', fontWeight: '800', color: t.text.primary, marginBottom: '4px' }}>New Zone</h1>
        <p style={{ fontSize: '13px', color: t.text.muted, marginBottom: '28px' }}>
          After creating the zone, you'll populate the Target Set.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          <div>
            <label style={labelStyle}>Market *</label>
            <select value={form.market_id} onChange={e => setForm(f => ({ ...f, market_id: e.target.value }))} style={selectStyle} required>
              <option value="">Select market…</option>
              {markets.map(m => <option key={m.id} value={m.id}>{m.name} ({m.client_slug})</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Zone Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. On-Premise" style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Phase *</label>
              <input type="number" min="1" value={form.phase}
                onChange={e => setForm(f => ({ ...f, phase: Number(e.target.value) }))}
                style={inputStyle} />
              <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '3px' }}>Phase 1 = beachhead</div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Channel *</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {CHANNEL_OPTIONS.map(o => (
                <button key={o.value} type="button" onClick={() => setForm(f => ({ ...f, channel: o.value }))}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                    border: `1px solid ${form.channel === o.value ? t.gold : t.border.default}`,
                    backgroundColor: form.channel === o.value ? t.goldDim : 'transparent',
                    color: form.channel === o.value ? t.gold : t.text.secondary,
                    fontWeight: form.channel === o.value ? '600' : '400',
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Posture</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {POSTURE_OPTIONS.map(o => (
                <button key={o.value} type="button" onClick={() => setForm(f => ({ ...f, posture: o.value }))}
                  style={{
                    padding: '9px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', textAlign: 'left',
                    border: `1px solid ${form.posture === o.value ? t.gold : t.border.default}`,
                    backgroundColor: form.posture === o.value ? t.goldDim : 'transparent',
                    color: form.posture === o.value ? t.gold : t.text.secondary,
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Velocity Target — required */}
          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: t.bg.input, border: `1px solid ${t.border.default}` }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>
              Performance Targets
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Velocity Target (cases/active account/month) *</label>
                <input type="number" min="0.1" step="0.1" value={form.velocity_target}
                  onChange={e => setForm(f => ({ ...f, velocity_target: e.target.value }))}
                  placeholder="e.g. 3.5" style={inputStyle} />
                <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '3px' }}>
                  Set from top-quartile of current account performance — see methodology guide.
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>
                    Reach Target (%)
                    {selectedMarket && <span style={{ color: t.text.muted, fontWeight: '400' }}> — inherits {selectedMarket.default_reach_threshold}%</span>}
                  </label>
                  <input type="number" min="0" max="100" value={form.reach_threshold}
                    onChange={e => setForm(f => ({ ...f, reach_threshold: e.target.value }))}
                    placeholder={selectedMarket ? `${selectedMarket.default_reach_threshold}` : '55'}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>
                    Retention Target (%)
                    {selectedMarket && <span style={{ color: t.text.muted, fontWeight: '400' }}> — inherits {selectedMarket.default_retention_threshold}%</span>}
                  </label>
                  <input type="number" min="0" max="100" value={form.retention_threshold}
                    onChange={e => setForm(f => ({ ...f, retention_threshold: e.target.value }))}
                    placeholder={selectedMarket ? `${selectedMarket.default_retention_threshold}` : '65'}
                    style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Projected Monthly Cases (optional)</label>
                <input type="number" min="0" value={form.projected_monthly_cases}
                  onChange={e => setForm(f => ({ ...f, projected_monthly_cases: e.target.value }))}
                  placeholder="Used for Supply Headroom calculation" style={inputStyle} />
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
              placeholder="Strategy, context, anything useful…" />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => router.back()} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create Zone'}
            </button>
          </div>
        </form>
      </div>
    </LayoutShell>
  )
}

export default function NewZonePage() {
  return <Suspense><NewZoneContent /></Suspense>
}
