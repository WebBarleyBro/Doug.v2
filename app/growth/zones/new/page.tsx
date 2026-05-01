'use client'
import { useState, useEffect, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import LayoutShell from '../../../layout-shell'
import { t, inputStyle, labelStyle, selectStyle, btnPrimary, btnSecondary } from '../../../lib/theme'
import { getMarkets, createZone } from '../../../lib/concentric/data'
import { getClients } from '../../../lib/data'
import type { Market } from '../../../lib/concentric/types'
import type { Client } from '../../../lib/types'

const CHANNEL_OPTIONS = [
  { value: 'on_premise', label: 'On-Premise' },
  { value: 'off_premise', label: 'Off-Premise' },
  { value: 'both', label: 'Both' },
]

function channelDefaultName(channel: string) {
  if (channel === 'on_premise') return 'On-Premise'
  if (channel === 'off_premise') return 'Off-Premise'
  return 'On & Off-Premise'
}

function NewZoneContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultMarket = searchParams.get('market') ?? ''
  const defaultClient = searchParams.get('client') ?? ''

  const [markets, setMarkets] = useState<Market[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState(defaultClient)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nameAutoFilled, setNameAutoFilled] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [form, setForm] = useState({
    market_id: defaultMarket,
    name: channelDefaultName('on_premise'),
    channel: 'on_premise',
    phase: 1,
    velocity_target: '',
    reach_threshold: '',
    retention_threshold: '',
    projected_monthly_cases: '',
    notes: '',
  })

  useEffect(() => {
    Promise.all([getMarkets(), getClients()]).then(([allMarkets, allClients]) => {
      setMarkets(allMarkets)
      setClients(allClients)
      if (!defaultMarket && defaultClient) {
        const clientMarkets = allMarkets.filter(m => m.client_slug === defaultClient)
        if (clientMarkets.length === 1) {
          setForm(f => ({ ...f, market_id: clientMarkets[0].id }))
        }
      }
    }).catch(() => {})
  }, [defaultMarket, defaultClient])

  function handleClientSelect(slug: string) {
    setSelectedClient(slug)
    // Clear territory selection if it doesn't belong to the new client
    const currentMarket = markets.find(m => m.id === form.market_id)
    if (currentMarket && currentMarket.client_slug !== slug) {
      setForm(f => ({ ...f, market_id: '' }))
    }
  }

  const visibleMarkets = selectedClient
    ? markets.filter(m => m.client_slug === selectedClient)
    : markets

  const selectedMarket = markets.find(m => m.id === form.market_id)

  function handleChannelChange(channel: string) {
    setForm(f => ({
      ...f,
      channel,
      name: nameAutoFilled ? channelDefaultName(channel) : f.name,
    }))
  }

  function handleNameChange(val: string) {
    setNameAutoFilled(val === channelDefaultName(form.channel) || val === '')
    setForm(f => ({ ...f, name: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.market_id) { setError('Select a territory.'); return }
    if (!form.name.trim()) { setError('Name is required.'); return }
    if (!form.velocity_target || Number(form.velocity_target) <= 0) {
      setError('Velocity Target is required and must be greater than 0.'); return
    }

    setSaving(true)
    try {
      const zone = await createZone({
        market_id: form.market_id,
        name: form.name.trim(),
        channel: form.channel,
        velocity_target: Number(form.velocity_target),
        reach_threshold: form.reach_threshold !== '' ? Number(form.reach_threshold) : null,
        retention_threshold: form.retention_threshold !== '' ? Number(form.retention_threshold) : null,
        projected_monthly_cases: form.projected_monthly_cases !== '' ? Number(form.projected_monthly_cases) : null,
        notes: form.notes || undefined,
      })
      router.push(`/growth/zones/${zone.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create focus area.')
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

        <h1 style={{ fontSize: '20px', fontWeight: '800', color: t.text.primary, marginBottom: '4px' }}>New Focus Area</h1>
        <p style={{ fontSize: '13px', color: t.text.muted, marginBottom: '28px' }}>
          A focus area tracks performance in a specific channel within a territory.
          After creating it, you'll build out the target account set.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Step 1: Client */}
          <div>
            <label style={{ ...labelStyle, fontSize: '11px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Client Brand *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px', marginTop: '6px' }}>
              {clients.map(c => {
                const selected = selectedClient === c.slug
                const color = (c as any).color || t.gold
                return (
                  <button key={c.slug} type="button" onClick={() => handleClientSelect(c.slug)}
                    style={{
                      padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                      border: `2px solid ${selected ? color : t.border.default}`,
                      backgroundColor: selected ? color + '15' : t.bg.input,
                      transition: 'all 120ms ease',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: selected ? '700' : '500', color: selected ? color : t.text.primary }}>
                        {c.name}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Step 2: Territory */}
          <div>
            <label style={labelStyle}>Territory *</label>
            <select value={form.market_id} onChange={e => setForm(f => ({ ...f, market_id: e.target.value }))} style={selectStyle} required>
              <option value="">{selectedClient ? 'Select territory…' : 'Select a client first…'}</option>
              {visibleMarkets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {visibleMarkets.length === 0 && selectedClient && markets.length > 0 && (
              <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '4px' }}>
                No territories for this client yet.{' '}
                <Link href={`/growth/markets/new`} style={{ color: t.gold }}>Create one first →</Link>
              </div>
            )}
          </div>

          {/* Channel */}
          <div>
            <label style={labelStyle}>Channel *</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {CHANNEL_OPTIONS.map(o => (
                <button key={o.value} type="button" onClick={() => handleChannelChange(o.value)}
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

          {/* Velocity target — required */}
          <div>
            <label style={labelStyle}>Velocity Target (cases/acct/month) *</label>
            <input type="number" min="0.1" step="0.1" value={form.velocity_target}
              onChange={e => setForm(f => ({ ...f, velocity_target: e.target.value }))}
              placeholder="e.g. 3.5" style={inputStyle} />
            <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '3px' }}>
              Use top-quartile performance from your existing accounts as a benchmark.
            </div>
          </div>

          {/* Advanced toggle */}
          <button type="button" onClick={() => setShowAdvanced(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none',
            cursor: 'pointer', color: t.text.muted, fontSize: '12px', padding: 0, alignSelf: 'flex-start',
          }}>
            <span style={{ fontSize: '10px' }}>{showAdvanced ? '▼' : '▶'}</span>
            {showAdvanced ? 'Hide' : 'Show'} advanced options
            <span style={{ fontSize: '11px', color: t.border.hover }}>— name, phase, thresholds, notes</span>
          </button>

          {showAdvanced && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>
                    Name
                    <span style={{ color: t.text.muted, fontWeight: '400', marginLeft: '4px' }}>— auto-filled</span>
                  </label>
                  <input type="text" value={form.name} onChange={e => handleNameChange(e.target.value)}
                    placeholder="e.g. On-Premise" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phase</label>
                  <input type="number" min="1" value={form.phase}
                    onChange={e => setForm(f => ({ ...f, phase: Number(e.target.value) }))}
                    style={inputStyle} />
                  <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '3px' }}>Phase 1 = beachhead</div>
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

              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
                  placeholder="Strategy, context, anything useful…" />
              </div>
            </>
          )}

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => router.back()} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create Focus Area'}
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
