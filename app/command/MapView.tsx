'use client'
import { useEffect, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import { t } from '../lib/theme'
import { relativeTimeStr } from '../lib/formatters'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

type MapBounds = { north: number; south: number; east: number; west: number }

export type MapPin = {
  id: string
  name: string
  accountType: string
  lat: number
  lng: number
  color: string
  lastOrderDate: string | null
  revenue: number
}

export default function MapView({
  pins, totalAccounts, ungeocodedCount, onGeocodeRequest, onBoundsChange,
}: {
  pins: MapPin[]
  totalAccounts: number
  ungeocodedCount: number
  onGeocodeRequest: () => void
  onBoundsChange?: (bounds: MapBounds) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const hasFitRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [popup, setPopup] = useState<{ name: string; type: string; rev: number; date: string | null; id: string } | null>(null)
  const pinsRef = useRef(pins)
  pinsRef.current = pins
  const onBoundsChangeRef = useRef(onBoundsChange)
  onBoundsChangeRef.current = onBoundsChange

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !TOKEN) return
    let map: any

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = TOKEN
      map = new mapboxgl.Map({
        container: containerRef.current!,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-104.9903, 39.7392],
        zoom: 9,
        attributionControl: false,
      })
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

      map.on('load', () => {
        mapRef.current = map

        // Source + layers for account pins
        map.addSource('accounts', {
          type: 'geojson',
          data: buildGeoJSON(pinsRef.current),
        })
        map.addLayer({
          id: 'accounts-glow',
          type: 'circle',
          source: 'accounts',
          paint: {
            'circle-radius': 14,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.12,
            'circle-blur': 1,
          },
        })
        map.addLayer({
          id: 'accounts-dot',
          type: 'circle',
          source: 'accounts',
          paint: {
            'circle-radius': 5,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#0f0e0c',
          },
        })

        map.on('click', 'accounts-dot', (e: any) => {
          const f = e.features?.[0]
          if (!f) return
          setPopup({
            id: f.properties.id,
            name: f.properties.name,
            type: f.properties.accountType,
            rev: f.properties.revenue,
            date: f.properties.lastOrderDate || null,
          })
        })
        map.on('mouseenter', 'accounts-dot', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'accounts-dot', () => { map.getCanvas().style.cursor = '' })

        // Emit bounds on pan/zoom (debounced)
        let boundsTimer: ReturnType<typeof setTimeout> | null = null
        const emitBounds = () => {
          if (boundsTimer) clearTimeout(boundsTimer)
          boundsTimer = setTimeout(() => {
            const b = map.getBounds()
            onBoundsChangeRef.current?.({
              north: b.getNorth(), south: b.getSouth(),
              east: b.getEast(), west: b.getWest(),
            })
          }, 300)
        }
        map.on('moveend', emitBounds)
        emitBounds() // emit initial bounds

        setReady(true)
      })
    })

    return () => { map?.remove(); mapRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update pins when data changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('accounts')
    if (src) src.setData(buildGeoJSON(pins))

    // Auto-fit only once on first non-empty load — never after user pans/zooms
    if (!hasFitRef.current && pins.length > 0) {
      hasFitRef.current = true
      const lngs = pins.map(p => p.lng)
      const lats = pins.map(p => p.lat)
      map.fitBounds(
        [[Math.min(...lngs) - 0.05, Math.min(...lats) - 0.05], [Math.max(...lngs) + 0.05, Math.max(...lats) + 0.05]],
        { padding: 40, maxZoom: 13, duration: 600 }
      )
    }
  }, [pins, ready])

  function relAge(s: string | null): string {
    return relativeTimeStr(s) ?? '—'
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden', minHeight: '340px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Labels */}
      <div style={{ position: 'absolute', top: '10px', left: '12px', fontSize: '8px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', fontWeight: '700', textTransform: 'uppercase', pointerEvents: 'none' }}>
        Territory Coverage
      </div>
      <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontWeight: '700', pointerEvents: 'none' }}>
        {pins.length} / {totalAccounts} mapped
      </div>

      {/* Geocode banner */}
      {ungeocodedCount > 0 && (
        <div style={{
          position: 'absolute', bottom: '12px', left: '12px',
          padding: '8px 12px', borderRadius: '8px',
          background: 'rgba(15,14,12,0.92)', backdropFilter: 'blur(8px)',
          border: `1px solid ${t.goldBorder}`,
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <div>
            <div style={{ fontSize: '9px', color: t.gold, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {ungeocodedCount} accounts not mapped
            </div>
            <div style={{ fontSize: '9px', color: t.text.muted, opacity: 0.6 }}>Need geocoding to show on map</div>
          </div>
          <button onClick={onGeocodeRequest} style={{
            padding: '5px 10px', borderRadius: '6px', border: `1px solid ${t.goldBorder}`,
            background: t.goldDim, color: t.gold, fontSize: '10px', fontWeight: '700',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            Map them
          </button>
        </div>
      )}

      {/* Account popup */}
      {popup && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          padding: '14px 16px', borderRadius: '10px',
          background: 'rgba(15,14,12,0.96)', backdropFilter: 'blur(12px)',
          border: `1px solid rgba(255,255,255,0.1)`,
          minWidth: '200px', zIndex: 10,
        }}>
          <button onClick={() => setPopup(null)} style={{ position: 'absolute', top: '8px', right: '10px', background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>×</button>
          <div style={{ fontSize: '13px', fontWeight: '800', color: t.text.primary, marginBottom: '4px' }}>{popup.name}</div>
          <div style={{ fontSize: '10px', color: t.text.muted, marginBottom: '10px' }}>
            {popup.type === 'on_premise' ? 'On-Premise' : popup.type === 'off_premise' ? 'Off-Premise' : ''}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '8px', color: t.text.muted, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>Last Order</div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: t.gold, fontFamily: 'monospace' }}>{relAge(popup.date)}</div>
            </div>
            {popup.rev > 0 && (
              <div>
                <div style={{ fontSize: '8px', color: t.text.muted, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>All-time Revenue</div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: t.status.success, fontFamily: 'monospace' }}>${popup.rev.toLocaleString()}</div>
              </div>
            )}
          </div>
          <a href={`/accounts/${popup.id}`} style={{
            display: 'block', textAlign: 'center', padding: '7px',
            borderRadius: '7px', background: t.goldDim, border: `1px solid ${t.goldBorder}`,
            color: t.gold, fontSize: '11px', fontWeight: '700', textDecoration: 'none',
          }}>Open Account →</a>
        </div>
      )}
    </div>
  )
}

function buildGeoJSON(pins: MapPin[]) {
  return {
    type: 'FeatureCollection' as const,
    features: pins.map(p => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name, accountType: p.accountType, color: p.color, revenue: p.revenue, lastOrderDate: p.lastOrderDate },
    })),
  }
}
