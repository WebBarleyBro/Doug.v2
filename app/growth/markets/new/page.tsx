'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, X, Plus, Search } from 'lucide-react'
import LayoutShell from '../../../layout-shell'
import { t, inputStyle, labelStyle, btnPrimary, btnSecondary } from '../../../lib/theme'
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
        backgroundColor: t.bg.input, minHeight: '38px',
      }}>
        {values.map(v => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '2px 7px', borderRadius: '4px', fontSize: '12px',
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
          type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          onBlur={add}
          placeholder={values.length === 0 ? `Add ${label.toLowerCase()}…` : '+'}
          style={{ flex: 1, minWidth: '80px', background: 'none', border: 'none', outline: 'none', fontSize: '13px', color: t.text.primary }}
        />
      </div>
    </div>
  )
}

export default function NewMarketPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const geoInputRef = useRef<HTMLInputElement>(null)
  const acRef = useRef<any>(null)

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

  useEffect(() => {
    if (typeof window === 'undefined') return

    function initAc() {
      if (!geoInputRef.current || acRef.current) return
      acRef.current = new (window as any).google.maps.places.Autocomplete(geoInputRef.current, {
        types: ['(regions)'],
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'name'],
      })
      acRef.current.addListener('place_changed', () => {
        const place = acRef.current.getPlace()
        const components: any[] = place.address_components ?? []
        const get = (type: string) => components.find((c: any) => c.types.includes(type))

        const city = get('locality')?.long_name ?? get('sublocality_level_1')?.long_name ?? ''
        const countyRaw = get('administrative_area_level_2')?.long_name ?? ''
        const county = countyRaw.replace(/ County$/, '').replace(/ Parish$/, '')
        const state = get('administrative_area_level_1')?.short_name ?? ''
        const zip = get('postal_code')?.long_name ?? ''
        const placeName: string = place.name ?? ''

        setForm(f => ({
          ...f,
          name: f.name || placeName,
          cities: city && !f.cities.includes(city) ? [...f.cities, city] : f.cities,
          counties: county && !f.counties.includes(county) ? [...f.counties, county] : f.counties,
          states: state && !f.states.includes(state) ? [...f.states, state] : f.states,
          zip_codes: zip && !f.zip_codes.includes(zip) ? [...f.zip_codes, zip] : f.zip_codes,
        }))
      })
    }

    if ((window as any).google?.maps?.places) {
      initAc()
      return
    }

    if (!document.getElementById('google-maps-script')) {
      const script = document.createElement('script')
      script.id = 'google-maps-script'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`
      script.async = true
      document.head.appendChild(script)
    }

    const poll = setInterval(() => {
      if ((window as any).google?.maps?.places) {
        clearInterval(poll)
        initAc()
      }
    }, 150)

    return () => { clearInterval(poll); acRef.current = null }
  }, [])

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
      setError(err.message || 'Failed to create territory.')
    } finally {
      setSaving(false)
    }
  }

  const hasGeo = form.cities.length > 0 || form.counties.length > 0 || form.states.length > 0 || form.zip_codes.length > 0

  return (
    <LayoutShell>
      <div style={{ padding: '28px 40px', maxWidth: '640px', margin: '0 auto' }}>

        <button onClick={() => router.back()} style={{
          display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '20px',
          background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', fontSize: '13px',
        }}>
          <ChevronLeft size={15} /> Back
        </button>

        <h1 style={{ fontSize: '20px', fontWeight: '800', color: t.text.primary, marginBottom: '4px' }}>New Territory</h1>
        <p style={{ fontSize: '13px', color: t.text.muted, marginBottom: '24px' }}>
          A territory is a geographic area owned by one client. Focus areas live inside it.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Step 1: Pick a client */}
          <div>
            <label style={{ ...labelStyle, fontSize: '11px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Client Brand *
            </label>
            <p style={{ fontSize: '11px', color: t.text.muted, marginBottom: '10px', marginTop: '2px' }}>
              This territory will belong to this client permanently.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
              {clients.map(c => {
                const selected = form.client_slug === c.slug
                const color = (c as any).color || t.gold
                return (
                  <button key={c.slug} type="button" onClick={() => setForm(f => ({ ...f, client_slug: c.slug }))}
                    style={{
                      padding: '12px 14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                      border: `2px solid ${selected ? color : t.border.default}`,
                      backgroundColor: selected ? color + '15' : t.bg.input,
                      transition: 'all 120ms ease',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', fontWeight: selected ? '700' : '500', color: selected ? color : t.text.primary }}>
                        {c.name}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Step 2: Location search */}
          <div>
            <label style={{ ...labelStyle, fontSize: '11px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Location
            </label>
            <p style={{ fontSize: '11px', color: t.text.muted, marginBottom: '8px', marginTop: '2px' }}>
              Search a city, county, or region — auto-populates the geographic definition below.
            </p>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{
                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                color: t.text.muted, pointerEvents: 'none',
              }} />
              <input
                ref={geoInputRef}
                type="text"
                placeholder="e.g. Fort Collins, CO or Larimer County…"
                style={{ ...inputStyle, paddingLeft: '34px' }}
              />
            </div>

            {hasGeo && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <TagInput label="Cities" values={form.cities} onChange={v => setForm(f => ({ ...f, cities: v }))} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <TagInput label="Counties" values={form.counties} onChange={v => setForm(f => ({ ...f, counties: v }))} />
                  <TagInput label="States" values={form.states} onChange={v => setForm(f => ({ ...f, states: v }))} />
                </div>
                <TagInput label="Zip Codes" values={form.zip_codes} onChange={v => setForm(f => ({ ...f, zip_codes: v }))} />
              </div>
            )}
          </div>

          {/* Step 3: Name + priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Territory Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Northern Colorado" style={inputStyle} required />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: '2px' }}>
              <button type="button" onClick={() => setForm(f => ({ ...f, priority: !f.priority }))} style={{
                width: 20, height: 20, borderRadius: '4px', cursor: 'pointer',
                border: `2px solid ${form.priority ? t.gold : t.border.default}`,
                backgroundColor: form.priority ? t.gold : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {form.priority && <span style={{ color: '#0f0e0c', fontSize: '12px', fontWeight: '800' }}>✓</span>}
              </button>
              <span style={{ fontSize: '12px', color: t.text.secondary, cursor: 'pointer', whiteSpace: 'nowrap' }}
                onClick={() => setForm(f => ({ ...f, priority: !f.priority }))}>Priority ★</span>
            </div>
          </div>

          {/* Advanced toggle */}
          <button type="button" onClick={() => setShowAdvanced(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none',
            cursor: 'pointer', color: t.text.muted, fontSize: '12px', padding: 0, alignSelf: 'flex-start',
          }}>
            <span style={{ fontSize: '10px' }}>{showAdvanced ? '▼' : '▶'}</span>
            {showAdvanced ? 'Hide' : 'Show'} advanced options
            <span style={{ fontSize: '11px', color: t.border.hover }}>— manual geo, thresholds, notes</span>
          </button>

          {showAdvanced && (
            <>
              {/* Manual geo entry */}
              {!hasGeo && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
                    Geographic Definition
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <TagInput label="Cities" values={form.cities} onChange={v => setForm(f => ({ ...f, cities: v }))} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <TagInput label="Counties" values={form.counties} onChange={v => setForm(f => ({ ...f, counties: v }))} />
                      <TagInput label="States" values={form.states} onChange={v => setForm(f => ({ ...f, states: v }))} />
                    </div>
                    <TagInput label="Zip Codes" values={form.zip_codes} onChange={v => setForm(f => ({ ...f, zip_codes: v }))} />
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
                  Default Thresholds <span style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>— focus areas inherit these unless overridden</span>
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
            </>
          )}

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button type="button" onClick={() => router.back()} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create Territory'}
            </button>
          </div>
        </form>
      </div>
    </LayoutShell>
  )
}
