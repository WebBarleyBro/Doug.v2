// Nightly snapshot job for the Concentric Growth Model.
// Vercel invokes this at 10:00 UTC (3:00 AM MST / 4:00 AM MDT) via vercel.json.
// Vercel sends Authorization: Bearer <CRON_SECRET> automatically.
// Set CRON_SECRET in Vercel environment variables.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../lib/supabase-server'
import { computeZoneMetrics, upsertZoneSnapshot } from '../../../lib/concentric/compute'
import { matchesGeoTerms } from '../../../lib/concentric/geo'

export const maxDuration = 300 // allow up to 5 min for larger zone counts (Pro plan)

// Sync CRM activity accounts into zone_target_accounts so the reach denominator
// (target_set_size) includes every account the team is actually working — not just
// ones manually added as targets. Runs before each compute so the snapshot is accurate.
async function syncZoneActivityAccounts(
  zoneId: string,
  clientSlug: string,
  geoTerms: string[],
): Promise<number> {
  if (geoTerms.length === 0) return 0
  const sb = getSupabaseAdmin()

  // All accounts — needed to geo-filter
  const { data: accounts } = await sb
    .from('accounts')
    .select('id, address')
    .limit(2000)

  if (!accounts?.length) return 0

  const geoAccountIds = accounts
    .filter(a => matchesGeoTerms(a.address ?? '', geoTerms))
    .map(a => a.id)

  if (geoAccountIds.length === 0) return 0

  // Find which of those have any CRM activity for this client
  const [vRes, pRes, oRes] = await Promise.all([
    sb.from('visits').select('account_id').eq('client_slug', clientSlug).in('account_id', geoAccountIds),
    sb.from('placements').select('account_id').eq('client_slug', clientSlug).in('account_id', geoAccountIds).is('lost_at', null),
    sb.from('purchase_orders').select('account_id').eq('client_slug', clientSlug).in('account_id', geoAccountIds).in('status', ['sent', 'fulfilled']),
  ])

  const activityIds = new Set([
    ...(vRes.data ?? []).map(r => r.account_id),
    ...(pRes.data ?? []).map(r => r.account_id),
    ...(oRes.data ?? []).map(r => r.account_id),
  ].filter(Boolean) as string[])

  if (activityIds.size === 0) return 0

  // Only insert accounts that don't already have an active target row
  const { data: existing } = await sb
    .from('zone_target_accounts')
    .select('account_id')
    .eq('zone_id', zoneId)
    .is('removed_at', null)

  const existingIds = new Set((existing ?? []).map(t => t.account_id))
  const toAdd = [...activityIds].filter(id => !existingIds.has(id))

  if (toAdd.length === 0) return 0

  await sb.from('zone_target_accounts').insert(
    toAdd.map(account_id => ({ zone_id: zoneId, account_id })),
  )

  return toAdd.length
}

export async function GET(req: Request) {
  // Verify the request is from Vercel cron (or a trusted manual trigger)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  // Fetch all zones with their market geo data
  const { data: zones, error: zonesErr } = await sb
    .from('zones')
    .select('id, name, client_slug, markets(name, cities, counties, states, zip_codes)')
    .order('created_at')

  if (zonesErr) {
    console.error('growth-snapshots cron: failed to fetch zones', zonesErr)
    return NextResponse.json({ error: zonesErr.message }, { status: 500 })
  }

  const results: { zoneId: string; label: string; ok: boolean; synced?: number; error?: string }[] = []

  // Process zones sequentially to keep DB load steady
  for (const zone of zones || []) {
    const market = (zone as any).markets
    const label = `${zone.client_slug ?? '?'} / ${market?.name ?? '?'} / ${zone.name}`
    try {
      // Step 1: Sync activity accounts into target set so reach denominator is complete
      let synced = 0
      if (zone.client_slug && market) {
        const geoTerms = [
          ...(market.cities ?? []),
          ...(market.counties ?? []),
          ...(market.states ?? []),
          ...(market.zip_codes ?? []),
        ].map((g: string) => g.toLowerCase().trim()).filter(Boolean)

        synced = await syncZoneActivityAccounts(zone.id, zone.client_slug, geoTerms)
      }

      // Step 2: Compute metrics against the now-complete target set
      const metrics = await computeZoneMetrics(zone.id)
      await upsertZoneSnapshot(zone.id, metrics)
      results.push({ zoneId: zone.id, label, ok: true, synced })
    } catch (err: any) {
      console.error(`growth-snapshots cron: zone ${zone.id} (${label}) failed`, err)
      results.push({ zoneId: zone.id, label, ok: false, error: err.message })
    }
  }

  const succeeded = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  const totalSynced = results.reduce((sum, r) => sum + (r.synced ?? 0), 0)

  console.log(`growth-snapshots cron: ${succeeded} succeeded, ${failed} failed, ${totalSynced} accounts synced`)

  return NextResponse.json({
    date: new Date().toISOString().split('T')[0],
    zones_processed: results.length,
    succeeded,
    failed,
    accounts_synced: totalSynced,
    results,
  })
}
