import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseAdmin } from '../../lib/supabase-server'

export const maxDuration = 60

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; source: string } | { error: string }> {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  if (mapboxToken) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxToken}&country=US&limit=1&types=address,place`
      const res  = await fetch(url)
      const json = await res.json()
      const feature = json.features?.[0]
      if (feature?.center) {
        const [lng, lat] = feature.center
        return { lat, lng, source: 'mapbox' }
      }
      if (json.message) return { error: `Mapbox: ${json.message}` }
      return { error: `Mapbox: no results (${json.features?.length ?? 0} features returned)` }
    } catch (e: any) {
      return { error: `Mapbox exception: ${e.message}` }
    }
  }

  // Nominatim fallback
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'BarleyBrosCRM/1.0 (sara@barley-bros.com)' },
    })
    if (!res.ok) return { error: `Nominatim HTTP ${res.status}` }
    const results = await res.json()
    if (results?.[0]?.lat && results?.[0]?.lon) {
      return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), source: 'nominatim' }
    }
    return { error: `Nominatim: no results for "${address}"` }
  } catch (e: any) {
    return { error: `Nominatim exception: ${e.message}` }
  }
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (!['owner', 'admin'].includes(profile?.role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const hasMapbox = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  const admin = getSupabaseAdmin()
  const { data: accounts, error } = await admin
    .from('accounts')
    .select('id, name, address')
    .not('address', 'is', null)
    .neq('address', '')
    .or('lat.is.null,lng.is.null')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!accounts?.length) return NextResponse.json({ updated: 0, total: 0, message: 'All accounts already geocoded' })

  let updated = 0
  let failed  = 0
  const failures: string[] = []

  for (const acct of accounts) {
    const result = await geocodeAddress(acct.address)
    if ('error' in result) {
      failed++
      failures.push(`${acct.name} [${acct.address}] → ${result.error}`)
      console.error('[geocode]', acct.name, result.error)
    } else {
      await admin.from('accounts').update({ lat: result.lat, lng: result.lng }).eq('id', acct.id)
      updated++
      console.log('[geocode] OK', acct.name, result.source, result.lat, result.lng)
    }
    await new Promise(r => setTimeout(r, 250))
  }

  return NextResponse.json({
    total: accounts.length,
    updated,
    failed,
    failures,
    hasMapbox,
  })
}
