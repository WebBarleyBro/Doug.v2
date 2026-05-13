import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../lib/supabase-server'

export async function GET(_req: NextRequest) {
  const admin = getSupabaseAdmin()

  const { data: sample } = await admin
    .from('accounts')
    .select('id, name, address, lat, lng')
    .order('name')
    .limit(200)

  const total = sample?.length ?? 0
  const withLat    = sample?.filter(a => a.lat != null) ?? []
  const withBoth   = sample?.filter(a => a.lat != null && a.lng != null) ?? []
  const nonZero    = withBoth.filter(a => a.lat !== 0 && a.lng !== 0)
  const withAddr   = sample?.filter(a => a.address && a.address.trim() !== '') ?? []
  const needsGeo   = withAddr.filter(a => a.lat == null || a.lng == null || a.lat === 0 || a.lng === 0)

  return NextResponse.json({
    total,
    with_lat_non_null: withLat.length,
    with_both_non_null: withBoth.length,
    with_valid_coords: nonZero.length,
    with_address: withAddr.length,
    needs_geocoding: needsGeo.length,
    sample_coords: withBoth.slice(0, 5).map(a => ({
      name: a.name,
      lat: a.lat,
      lng: a.lng,
      address: a.address,
    })),
    sample_needing: needsGeo.slice(0, 5).map(a => ({
      name: a.name,
      address: a.address,
      lat: a.lat,
      lng: a.lng,
    })),
  })
}
