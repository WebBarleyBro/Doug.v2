import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { computeZoneMetrics, upsertZoneSnapshot } from '../../../../lib/concentric/compute'

export async function POST(
  _req: Request,
  { params }: { params: { zoneId: string } },
) {
  try {
    // Auth via session cookie (same pattern as other internal routes)
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || !['owner', 'admin', 'rep'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { zoneId } = params
    if (!zoneId) return NextResponse.json({ error: 'Missing zoneId' }, { status: 400 })

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
