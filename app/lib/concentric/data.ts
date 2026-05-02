// Concentric Growth Model — client-safe data access layer
// Uses the authenticated Supabase client (respects RLS).

import { getSupabase } from '../supabase'
import { cached, invalidatePrefix } from '../cache'
import type {
  Market, Zone, ZoneTargetAccount, ZoneMetricSnapshot, AccountProductQualification,
} from './types'

// ─── Markets ─────────────────────────────────────────────────────────────────

export function getMarkets(filters?: {
  clientSlug?: string
  search?: string
  priority?: boolean
}): Promise<Market[]> {
  const key = `markets:${JSON.stringify(filters ?? {})}`
  return cached(key, 2 * 60_000, async () => {
    const sb = getSupabase()
    let q = sb.from('markets').select('*').order('name')
    if (filters?.clientSlug) q = q.eq('client_slug', filters.clientSlug)
    if (filters?.priority)   q = q.eq('priority', true)
    if (filters?.search)     q = q.ilike('name', `%${filters.search}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Market[]
  })
}

export async function getMarket(id: string): Promise<(Market & { zones: Zone[] }) | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('markets')
    .select('*, zones(*)')
    .eq('id', id)
    .single()
  if (error) return null
  // Sort zones by phase then name
  if (data?.zones) {
    data.zones = data.zones.sort((a: any, b: any) =>
      a.phase !== b.phase ? a.phase - b.phase : a.name.localeCompare(b.name),
    )
  }
  return data as any
}

export async function createMarket(payload: {
  name: string
  client_slug?: string
  priority?: boolean
  cities?: string[]
  counties?: string[]
  states?: string[]
  zip_codes?: string[]
  default_reach_threshold?: number
  default_retention_threshold?: number
  notes?: string
}): Promise<Market> {
  const sb = getSupabase()
  const { data, error } = await sb.from('markets').insert(payload).select().single()
  if (error) throw error
  invalidatePrefix('markets:')
  return data as Market
}

export async function updateMarket(id: string, payload: Partial<Market>): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('markets')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  invalidatePrefix('markets:')
}

export async function deleteMarket(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('markets').delete().eq('id', id)
  if (error) throw error
  invalidatePrefix('markets:')
}

// ─── Zones ───────────────────────────────────────────────────────────────────

export function getZones(filters?: {
  marketId?: string
  clientSlug?: string
  posture?: string
  phase?: number
}): Promise<(Zone & { markets: Market })[]> {
  const key = `zones:${JSON.stringify(filters ?? {})}`
  return cached(key, 2 * 60_000, async () => {
    const sb = getSupabase()
    let q = sb.from('zones').select('*, markets(*)').order('phase').order('name')
    if (filters?.marketId)  q = q.eq('market_id', filters.marketId)
    if (filters?.clientSlug) q = q.eq('client_slug', filters.clientSlug)
    if (filters?.posture)   q = q.eq('posture', filters.posture)
    if (filters?.phase !== undefined) q = q.eq('phase', filters.phase)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as any[]
  })
}

// Fetch all zones with their markets in one call — used by the overview page
export async function getAllZones(): Promise<(Zone & { markets: Market })[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('zones')
    .select('*, markets(*)')
    .order('phase')
    .order('name')
  if (error) throw error
  return (data ?? []) as any[]
}

export async function getZone(id: string): Promise<(Zone & { markets: Market }) | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('zones')
    .select('*, markets(*)')
    .eq('id', id)
    .single()
  if (error) return null
  return data as any
}

export async function createZone(payload: {
  market_id: string
  client_slug: string
  name: string
  channel: string
  phase?: number
  posture?: string
  velocity_target: number
  reach_threshold?: number | null
  retention_threshold?: number | null
  projected_monthly_cases?: number | null
  notes?: string
}): Promise<Zone> {
  const sb = getSupabase()
  const { data, error } = await sb.from('zones').insert({ phase: 1, posture: 'active', ...payload }).select().single()
  if (error) throw error
  invalidatePrefix('zones:')
  return data as Zone
}

export async function updateZone(id: string, payload: Partial<Zone>): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('zones')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  invalidatePrefix('zones:')
}

export async function deleteZone(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('zones').delete().eq('id', id)
  if (error) throw error
  invalidatePrefix('zones:')
}

// ─── Target Set ───────────────────────────────────────────────────────────────

export async function getZoneTargetAccounts(
  zoneId: string,
): Promise<(ZoneTargetAccount & { accounts: any })[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('zone_target_accounts')
    .select('*, accounts(id, name, address, account_type, last_visited)')
    .eq('zone_id', zoneId)
    .is('removed_at', null)
    .order('added_at')
  if (error) throw error
  return (data ?? []) as any[]
}

// Returns zones (with markets) that a given account belongs to
export async function getAccountZones(
  accountId: string,
): Promise<(ZoneTargetAccount & { zones: Zone & { markets: Market } })[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('zone_target_accounts')
    .select('*, zones(*, markets(*))')
    .eq('account_id', accountId)
    .is('removed_at', null)
  if (error) throw error
  return (data ?? []) as any[]
}

export async function addAccountToZone(
  zoneId: string,
  accountId: string,
  addedBy?: string,
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('zone_target_accounts')
    .insert({ zone_id: zoneId, account_id: accountId, added_by: addedBy ?? null })
  if (error) throw error
}

export async function removeAccountFromZone(
  zoneId: string,
  accountId: string,
  removedBy?: string,
  reason?: string,
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('zone_target_accounts')
    .update({
      removed_at: new Date().toISOString(),
      removed_by: removedBy ?? null,
      removed_reason: reason ?? null,
    })
    .eq('zone_id', zoneId)
    .eq('account_id', accountId)
    .is('removed_at', null)
  if (error) throw error
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

export async function getLatestSnapshot(
  zoneId: string,
): Promise<ZoneMetricSnapshot | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('zone_metric_snapshots')
    .select('*')
    .eq('zone_id', zoneId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()
  if (error) return null
  return data as ZoneMetricSnapshot
}

// Returns snapshots for the last `days` days, oldest-first (for sparklines)
export async function getZoneSnapshots(
  zoneId: string,
  days = 90,
): Promise<ZoneMetricSnapshot[]> {
  const sb = getSupabase()
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
  const { data, error } = await sb
    .from('zone_metric_snapshots')
    .select('*')
    .eq('zone_id', zoneId)
    .gte('snapshot_date', cutoff)
    .order('snapshot_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as ZoneMetricSnapshot[]
}

// Bulk-fetch latest snapshot per zone — efficient for overview page
// Returns a map of zone_id → latest snapshot
export async function getLatestSnapshotsByZone(
  zoneIds: string[],
): Promise<Record<string, ZoneMetricSnapshot>> {
  if (zoneIds.length === 0) return {}
  const sb = getSupabase()
  // Fetch recent snapshots for all zones and keep only the latest per zone
  const { data, error } = await sb
    .from('zone_metric_snapshots')
    .select('zone_id, snapshot_date, health_score, activity_rate_pct, reach_pct, velocity, velocity_index, retention_pct, active_accounts, target_set_size, total_accounts, total_cases_90d, cases_prior_90d, volume_trend_pct, accounts_lost, computed_at')
    .in('zone_id', zoneIds)
    .order('snapshot_date', { ascending: false })
    .limit(zoneIds.length * 10)  // keep enough rows per zone to guarantee we get the latest
  if (error) throw error

  const map: Record<string, ZoneMetricSnapshot> = {}
  for (const row of data ?? []) {
    if (!map[row.zone_id]) map[row.zone_id] = row as any
  }
  return map
}

// ─── Product Qualifications ───────────────────────────────────────────────────

export async function getAccountQualifications(
  accountId: string,
  clientSlug?: string,
): Promise<AccountProductQualification[]> {
  const sb = getSupabase()
  let q = sb
    .from('account_product_qualifications')
    .select('*')
    .eq('account_id', accountId)
    .order('client_slug')
    .order('sku')
  if (clientSlug) q = q.eq('client_slug', clientSlug)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as AccountProductQualification[]
}

export async function setQualification(
  accountId: string,
  clientSlug: string,
  sku: string,
  qualified: boolean,
  reason?: string,
  updatedBy?: string,
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('account_product_qualifications').upsert(
    {
      account_id: accountId,
      client_slug: clientSlug,
      sku,
      qualified,
      reason: reason ?? null,
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'account_id,client_slug,sku' },
  )
  if (error) throw error
}
