'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Star, Pencil, Trash2, X, Search } from 'lucide-react'
import LayoutShell, { useToast } from '../../../layout-shell'
import ConfirmModal from '../../../components/ConfirmModal'
import { t, card, inputStyle, labelStyle, btnPrimary, btnSecondary } from '../../../lib/theme'
import { getClients } from '../../../lib/data'
import { getMarket, updateMarket, deleteMarket, getZones, deleteZone, getLatestSnapshotsByZone } from '../../../lib/concentric/data'
import { healthColor, channelLabel } from '../../_components'
import type { Market, Zone, ZoneMetricSnapshot } from '../../../lib/concentric/types'
import type { Client } from '../../../lib/types'

function TagInput({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  function add() {
    const val = draft.trim()
    if (val && !values.includes(val)) onChange([...values, val])
    setDraft('')
  }
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', padding: '6px 8px', borderRadius: '7px', border: `1px solid ${t.border.default}`, backgroundColor: t.bg.input, minHeight: '38px' }}>
        {values.map(v => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '4px', fontSize: '11px', backgroundColor: t.goldDim, color: t.gold, border: `1px solid ${t.goldBorder}` }}>
            {v}
            <button type="button" onClick={() => onChange(values.filter(x => x !== v))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: t.gold, display: 'flex', alignItems: 'center' }}>
              <X size={10} />
            </button>
          </span>
        ))}
        <input type="text" value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          onBlur={add} placeholder={values.length === 0 ? 'Add…' : '+'}
          style={{ flex: 1, minWidth: '60px', background: 'none', border: 'none', outline: 'none', fontSize: '12px', color: t.text.primary }} />
      </div>
    </div>
  )
}

export default function MarketDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const toast = useToast()

  const [market, setMarket] = useState<(Market & { zones: Zone[] }) | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, ZoneMetricSnapshot>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteMarketModal, setDeleteMarketModal] = useState(false)
  const [deleteZoneId, setDeleteZoneId] = useState<string | null>(null)

  const editGeoInputRef = useRef<HTMLInputElement>(null)
  const editAcRef = useRef<any>(null)

  const [editForm, setEditForm] = useState({
    name: '', priority: false, cities: [] as string[], counties: [] as string[],
    states: [] as string[], zip_codes: [] as string[],
    default_reach_threshold: 55, default_retention_threshold: 65, notes: '',
  })

  const load = useCallback(async () => {
    try {
      const [m, cls] = await Promise.all([getMarket(id), getClients()])
      if (!m) { router.push('/growth/markets'); return }
      const snaps = await getLatestSnapshotsByZone((m.zones || []).map(z => z.id))
      setMarket(m)
      setClients(cls)
      setSnapshots(snaps)
      setEditForm({
        name: m.name, priority: m.priority,
        cities: m.cities ?? [], counties: m.counties ?? [],
        states: m.states ?? [], zip_codes: m.zip_codes ?? [],
        default_reach_threshold: m.default_reach_threshold,
        default_retention_threshold: m.default_retention_threshold,
        notes: m.notes ?? '',
      })
    } catch (e) { console.error('market.detail', e) }
    finally { setLoading(false) }
  }, [id, router])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!editing || typeof window === 'undefined') return

    function initAc() {
      if (!editGeoInputRef.current || editAcRef.current) return
      editAcRef.current = new (window as any).google.maps.places.Autocomplete(editGeoInputRef.current, {
        types: ['(regions)'],
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'name'],
      })
      editAcRef.current.addListener('place_changed', () => {
        const place = editAcRef.current.getPlace()
        const components: any[] = place.address_components ?? []
        const get = (type: string) => components.find((c: any) => c.types.includes(type))

        const city = get('locality')?.long_name ?? get('sublocality_level_1')?.long_name ?? ''
        const countyRaw = get('administrative_area_level_2')?.long_name ?? ''
        const county = countyRaw.replace(/ County$/, '').replace(/ Parish$/, '')
        const state = get('administrative_area_level_1')?.short_name ?? ''
        const zip = get('postal_code')?.long_name ?? ''

        setEditForm(f => ({
          ...f,
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

    return () => { clearInterval(poll); editAcRef.current = null }
  }, [editing])

  async function handleSave() {
    if (!editForm.name.trim()) return
    setSaving(true)
    try {
      await updateMarket(id, editForm)
      toast('Territory updated')
      setEditing(false)
      load()
    } catch (err: any) { toast(err.message || 'Failed to save', 'error') }
    finally { setSaving(false) }
  }

  async function handleDeleteMarket() {
    try {
      await deleteMarket(id)
      toast('Territory deleted')
      router.push('/growth/markets')
    } catch (err: any) { toast(err.message || 'Failed to delete', 'error') }
  }

  async function handleDeleteZone(zoneId: string) {
    try {
      await deleteZone(zoneId)
      toast('Focus area deleted')
      load()
    } catch (err: any) { toast(err.message || 'Failed to delete', 'error') }
    finally { setDeleteZoneId(null) }
  }

  if (loading) return <LayoutShell><div style={{ padding: '48px', color: t.text.muted, textAlign: 'center' }}>Loading…</div></LayoutShell>
  if (!market) return null

  const client = clients.find(c => c.slug === market.client_slug)
  const clientColor = client?.color || t.gold
  const geoParts = [
    ...(market.cities ?? []),
    ...(market.counties?.map(c => `${c} County`) ?? []),
    ...(market.states ?? []),
    ...(market.zip_codes ?? []),
  ].filter(Boolean)
  const geoSummary = geoParts.slice(0, 4).join(', ') + (geoParts.length > 4 ? ` +${geoParts.length - 4} more` : '')

  return (
    <LayoutShell>
      <div style={{ padding: '0' }}>

        {/* Breadcrumb */}
        <div style={{ padding: '10px 40px', borderBottom: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: t.text.muted }}>
          <Link href="/growth" style={{ color: t.text.muted, textDecoration: 'none' }}>Growth</Link>
          {client && <>
            <span>›</span>
            <Link href={`/growth?client=${client.slug}`} style={{ color: clientColor, textDecoration: 'none', fontWeight: '600' }}>{client.name}</Link>
          </>}
          <span>›</span>
          <Link href="/growth/markets" style={{ color: t.text.muted, textDecoration: 'none' }}>Territories</Link>
          <span>›</span>
          <span style={{ color: t.text.secondary }}>{market.name}</span>
        </div>

        <div style={{ padding: '24px 40px' }}>
          {/* Header */}
          {!editing ? (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              marginBottom: '24px', paddingBottom: '20px',
              borderBottom: `1px solid ${t.border.subtle}`, borderLeft: `4px solid ${clientColor}`,
              paddingLeft: '16px', backgroundColor: clientColor + '06', borderRadius: '0 8px 8px 0', padding: '16px 16px 16px 16px',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  {client && (
                    <Link href={`/growth?client=${client.slug}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: clientColor, flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', fontWeight: '700', color: clientColor, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{client.name}</span>
                    </Link>
                  )}
                  <span style={{ fontSize: '11px', color: t.border.hover }}>›</span>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Territory</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  {market.priority && <Star size={16} color={t.gold} fill={t.gold} />}
                  <h1 style={{ fontSize: '22px', fontWeight: '800', color: t.text.primary, letterSpacing: '-0.02em', margin: 0 }}>{market.name}</h1>
                </div>
                {geoSummary ? (
                  <div style={{ fontSize: '12px', color: t.text.muted }}>{geoSummary}</div>
                ) : (
                  <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '12px', color: t.border.hover, fontStyle: 'italic', textAlign: 'left' }}>
                    No location defined — click Edit to add
                  </button>
                )}
                {market.notes && (
                  <div style={{ marginTop: '10px', fontSize: '13px', color: t.text.secondary, padding: '10px 14px', borderRadius: '8px', backgroundColor: t.bg.input, border: `1px solid ${t.border.subtle}`, maxWidth: '600px' }}>
                    {market.notes}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '7px', border: `1px solid ${t.border.default}`, backgroundColor: 'transparent', color: t.text.secondary, fontSize: '12px', cursor: 'pointer' }}>
                  <Pencil size={12} /> Edit
                </button>
                <button onClick={() => setDeleteMarketModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '7px', border: `1px solid rgba(232,85,64,0.3)`, backgroundColor: t.status.dangerBg, color: t.status.danger, fontSize: '12px', cursor: 'pointer' }}>
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          ) : (
            <div style={{ ...card, padding: '20px 24px', marginBottom: '24px', maxWidth: '700px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary, marginBottom: '18px' }}>Edit Territory</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: '2px' }}>
                    <button type="button" onClick={() => setEditForm(f => ({ ...f, priority: !f.priority }))} style={{ width: 18, height: 18, borderRadius: '3px', cursor: 'pointer', border: `2px solid ${editForm.priority ? t.gold : t.border.default}`, backgroundColor: editForm.priority ? t.gold : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {editForm.priority && <span style={{ color: '#0f0e0c', fontSize: '11px', fontWeight: '800' }}>✓</span>}
                    </button>
                    <span style={{ fontSize: '12px', color: t.text.secondary, cursor: 'pointer' }} onClick={() => setEditForm(f => ({ ...f, priority: !f.priority }))}>Priority ★</span>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Add Location</label>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: t.text.muted, pointerEvents: 'none' }} />
                    <input ref={editGeoInputRef} type="text"
                      placeholder="Search city, county, or region to add…"
                      style={{ ...inputStyle, paddingLeft: '30px', fontSize: '12px' }} />
                  </div>
                  <div style={{ fontSize: '10px', color: t.text.muted, marginTop: '3px' }}>Selecting a location appends to the geo tags below</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <TagInput label="Cities" values={editForm.cities} onChange={v => setEditForm(f => ({ ...f, cities: v }))} />
                  <TagInput label="Counties" values={editForm.counties} onChange={v => setEditForm(f => ({ ...f, counties: v }))} />
                  <TagInput label="States" values={editForm.states} onChange={v => setEditForm(f => ({ ...f, states: v }))} />
                  <TagInput label="Zip Codes" values={editForm.zip_codes} onChange={v => setEditForm(f => ({ ...f, zip_codes: v }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Default Reach Target (%)</label>
                    <input type="number" min="0" max="100" value={editForm.default_reach_threshold} onChange={e => setEditForm(f => ({ ...f, default_reach_threshold: Number(e.target.value) }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Default Retention Target (%)</label>
                    <input type="number" min="0" max="100" value={editForm.default_retention_threshold} onChange={e => setEditForm(f => ({ ...f, default_retention_threshold: Number(e.target.value) }))} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditing(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Focus Areas */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary, margin: 0 }}>Focus Areas</h2>
            <Link href={`/growth/zones/new?market=${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: '600', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, color: t.gold, textDecoration: 'none' }}>
              <Plus size={13} /> New Focus Area
            </Link>
          </div>

          {(market.zones || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', border: `2px dashed ${t.border.default}`, borderRadius: '12px' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.secondary, marginBottom: '8px' }}>No focus areas yet</div>
              <div style={{ fontSize: '13px', color: t.text.muted, marginBottom: '20px' }}>
                A focus area tracks on-premise or off-premise performance within this territory.
              </div>
              <Link href={`/growth/zones/new?market=${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', backgroundColor: t.gold, color: '#0f0e0c', textDecoration: 'none' }}>
                <Plus size={14} /> Create First Focus Area
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
              {(market.zones || []).map(z => {
                const snap = snapshots[z.id]
                const hs = snap?.health_score ?? null
                return (
                  <div key={z.id} style={{ ...card, padding: '16px 18px', position: 'relative', borderTop: `2px solid ${healthColor(hs)}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <Link href={`/growth/zones/${z.id}`} style={{ textDecoration: 'none' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: t.text.primary, marginBottom: '4px' }}>{z.name}</div>
                        </Link>
                        <span style={{ fontSize: '10px', color: t.text.muted }}>{channelLabel(z.channel)}</span>
                      </div>
                      {hs !== null && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '22px', fontWeight: '800', color: healthColor(hs), lineHeight: 1 }}>{Math.round(hs)}</div>
                          <div style={{ fontSize: '9px', color: t.text.muted }}>HEALTH</div>
                        </div>
                      )}
                    </div>
                    {snap && (
                      <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: t.text.muted }}>
                        <span>Reach <strong style={{ color: t.text.secondary }}>{Math.round(snap.reach_pct ?? 0)}%</strong></span>
                        <span>Targets <strong style={{ color: t.text.secondary }}>{snap.target_set_size ?? 0}</strong></span>
                        <span>Active <strong style={{ color: t.text.secondary }}>{snap.active_accounts ?? 0}</strong></span>
                      </div>
                    )}
                    <button onClick={() => setDeleteZoneId(z.id)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '2px', opacity: 0.4 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal isOpen={deleteMarketModal} title="Delete Territory"
        message={`Delete "${market.name}" and all its focus areas? This cannot be undone.`}
        confirmLabel="Delete Territory" onConfirm={handleDeleteMarket} onClose={() => setDeleteMarketModal(false)} />
      <ConfirmModal isOpen={!!deleteZoneId} title="Delete Focus Area"
        message="Delete this focus area and its target set? This cannot be undone."
        confirmLabel="Delete" onConfirm={() => deleteZoneId && handleDeleteZone(deleteZoneId)} onClose={() => setDeleteZoneId(null)} />
    </LayoutShell>
  )
}
