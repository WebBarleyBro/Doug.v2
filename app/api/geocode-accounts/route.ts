import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseAdmin } from '../../lib/supabase-server'

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

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  if (!apiKey) return NextResponse.json({ error: 'Google Maps key not configured' }, { status: 500 })

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
  let failed = 0
  const failures: string[] = []

  for (const acct of accounts) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(acct.address)}&key=${apiKey}`
      const res = await fetch(url)
      const json = await res.json()

      if (json.status === 'OK' && json.results?.[0]?.geometry?.location) {
        const { lat, lng } = json.results[0].geometry.location
        await admin.from('accounts').update({ lat, lng }).eq('id', acct.id)
        updated++
      } else {
        failed++
        failures.push(`${acct.name}: ${json.status}`)
      }
    } catch (e: any) {
      failed++
      failures.push(`${acct.name}: ${e.message}`)
    }
  }

  return NextResponse.json({ total: accounts.length, updated, failed, failures: failures.slice(0, 10) })
}
