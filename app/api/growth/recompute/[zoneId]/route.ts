import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { computeZoneMetrics, upsertZoneSnapshot } from '../../../../lib/concentric/compute'

async function getAuthedUser(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profiles').select('role, client_slug').eq('id', user.id).single()
  if (!profile || !['owner', 'admin', 'rep'].includes(profile.role)) return null
  return { user, profile, supabase }
}

// GET: return live metrics without saving a snapshot
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  try {
    const { zoneId } = await params
    const cookieStore = await cookies()
    if (!await getAuthedUser(cookieStore)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const metrics = await computeZoneMetrics(zoneId)
    return NextResponse.json({ metrics })
  } catch (err: any) {
    console.error('growth.metrics.get', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: compute metrics and save snapshot for today
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  try {
    const cookieStore = await cookies()
    const auth = await getAuthedUser(cookieStore)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { zoneId } = await params
    if (!zoneId) return NextResponse.json({ error: 'Missing zoneId' }, { status: 400 })

    // Verify the caller owns or has access to this zone
    if (auth.profile.role === 'rep' && auth.profile.client_slug) {
      const { data: zone } = await auth.supabase
        .from('zones').select('client_slug').eq('id', zoneId).single()
      if (zone && zone.client_slug && zone.client_slug !== auth.profile.client_slug) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const metrics = await computeZoneMetrics(zoneId)
    await upsertZoneSnapshot(zoneId, metrics)

    return NextResponse.json({ ok: true, metrics })
  } catch (err: any) {
    console.error('growth.recompute', err)
    return NextResponse.json(
      { error: err.message || 'Internal error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
