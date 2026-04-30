// Nightly snapshot job for the Concentric Growth Model.
// Vercel invokes this at 10:00 UTC (3:00 AM MST / 4:00 AM MDT) via vercel.json.
// Vercel sends Authorization: Bearer <CRON_SECRET> automatically.
// Set CRON_SECRET in Vercel environment variables.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../lib/supabase-server'
import { computeZoneMetrics, upsertZoneSnapshot } from '../../../lib/concentric/compute'

export const maxDuration = 300 // allow up to 5 min for larger zone counts (Pro plan)

export async function GET(req: Request) {
  // Verify the request is from Vercel cron (or a trusted manual trigger)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  // Fetch all zone IDs — every zone gets a snapshot regardless of posture
  const { data: zones, error: zonesErr } = await sb
    .from('zones')
    .select('id, name, markets(name, client_slug)')
    .order('created_at')

  if (zonesErr) {
    console.error('growth-snapshots cron: failed to fetch zones', zonesErr)
    return NextResponse.json({ error: zonesErr.message }, { status: 500 })
  }

  const results: { zoneId: string; label: string; ok: boolean; error?: string }[] = []

  // Process zones sequentially to keep DB load steady
  for (const zone of zones || []) {
    const market = (zone as any).markets
    const label = `${market?.client_slug ?? '?'} / ${market?.name ?? '?'} / ${zone.name}`
    try {
      const metrics = await computeZoneMetrics(zone.id)
      await upsertZoneSnapshot(zone.id, metrics)
      results.push({ zoneId: zone.id, label, ok: true })
    } catch (err: any) {
      // Log and continue — one failing zone must not block the others
      console.error(`growth-snapshots cron: zone ${zone.id} (${label}) failed`, err)
      results.push({ zoneId: zone.id, label, ok: false, error: err.message })
    }
  }

  const succeeded = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  console.log(`growth-snapshots cron: ${succeeded} succeeded, ${failed} failed`)

  return NextResponse.json({
    date: new Date().toISOString().split('T')[0],
    zones_processed: results.length,
    succeeded,
    failed,
    results,
  })
}
