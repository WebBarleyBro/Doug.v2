'use client'
// Mapbox map of the brand's accounts (distributors excluded). Marker styles follow
// the spec: active accounts (ordered in the last 90 days) are the brightest, accounts
// visited in the period but not active are dimmer, accounts visited earlier are faintest,
// and any account that ordered in the period gets a pulsing ring. Clicking a
// marker opens the account drawer.

import React, { useEffect, useRef, useState } from 'react'
import type { MapAccount } from './portal-metrics'
import { C, FS, FM, Tip } from './portal-ui'
import { money, fmtShortYear } from './portal-metrics'

type MapboxModule = typeof import('mapbox-gl')

export default function PortalMap({ accounts, onSelect, token }: { accounts: MapAccount[]; onSelect: (id: string) => void; token: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('mapbox-gl').Map | null>(null)
  const mbRef = useRef<MapboxModule | null>(null)
  const markersRef = useRef<import('mapbox-gl').Marker[]>([])
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState<{ a: MapAccount; x: number; y: number } | null>(null)
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) return
    let cancelled = false
    import('mapbox-gl').then(mod => {
      if (cancelled || !containerRef.current || mapRef.current) return
      const mb = (mod.default || mod) as MapboxModule
      mbRef.current = mb
      ;(mb as unknown as { accessToken: string }).accessToken = token
      const map = new mb.Map({
        container: containerRef.current, style: 'mapbox://styles/mapbox/dark-v11',
        center: [-105.08, 40.45], zoom: 8, attributionControl: false, cooperativeGestures: true,
      })
      map.addControl(new mb.NavigationControl({ showCompass: false }), 'bottom-right')
      map.on('load', () => { if (!cancelled) setReady(true) })
      mapRef.current = map
    }).catch(e => console.error('portal.map', e))
    return () => {
      cancelled = true
      markersRef.current.forEach(m => m.remove()); markersRef.current = []
      mapRef.current?.remove(); mapRef.current = null; setReady(false)
    }
  }, [token])

  useEffect(() => {
    const map = mapRef.current, mb = mbRef.current
    if (!ready || !map || !mb) return
    markersRef.current.forEach(m => m.remove()); markersRef.current = []
    const bounds = new mb.LngLatBounds()
    for (const a of accounts) {
      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute('aria-label', a.name)
      el.style.cssText = 'width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:none;border:0;padding:0'
      const dot = document.createElement('span')
      dot.className = `pt-pin ${a.active ? 'placed' : a.visitedInPeriod ? 'visited' : 'earlier'}${a.orderedInPeriod ? ' ordered' : ''}`
      el.appendChild(dot)
      el.addEventListener('mouseenter', (e: MouseEvent) => setHover({ a, x: e.clientX, y: e.clientY }))
      el.addEventListener('mousemove', (e: MouseEvent) => setHover({ a, x: e.clientX, y: e.clientY }))
      el.addEventListener('mouseleave', () => setHover(null))
      el.addEventListener('click', () => { setHover(null); selectRef.current(a.id) })
      const marker = new mb.Marker({ element: el, anchor: 'center' }).setLngLat([a.lng, a.lat]).addTo(map)
      markersRef.current.push(marker)
      bounds.extend([a.lng, a.lat])
    }
    if (accounts.length) map.fitBounds(bounds, { padding: 40, maxZoom: 12.5, duration: 0 })
  }, [ready, accounts])

  return (
    <>
      <div ref={containerRef} style={{ height: 320, borderRadius: 10, overflow: 'hidden', background: C.raised, fontFamily: FS }} />
      {hover && (
        <Tip x={hover.x} y={hover.y}>
          <b>{hover.a.name}</b> <span style={{ color: C.mute }}>· {hover.a.type === 'off_premise' ? 'Retail' : 'On-premise'}</span><br />
          <span style={{ fontFamily: FM, color: C.ink2 }}>Last visit {hover.a.lastVisit ? fmtShortYear(hover.a.lastVisit) : '—'}</span><br />
          <span style={{ fontFamily: FM, color: C.ink2 }}>{hover.a.productsActive} product{hover.a.productsActive === 1 ? '' : 's'} active · {money(hover.a.periodValue)} ordered</span>
        </Tip>
      )}
    </>
  )
}
