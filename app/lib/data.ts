'use client'
import { getSupabase } from './supabase'
import { cached, invalidate, invalidatePrefix } from './cache'
import { startOfMonthMT, endOfMonthMT, nDaysAgoMT, todayMT, daysAgoMT } from './formatters'
import type {
  Account, Client, Visit, Placement, PurchaseOrder, POLineItem,
  Contact, Task, Event, Campaign, CampaignMilestone, Product,
  StateRegistration, CompetitiveSighting, DepletionEntry,
  TastingConsumer, AgencyPipeline, DateRange, UserProfile,
  PlacementStatus, VisitStatus, TaskPriority,
} from './types'

// ─── Clients ──────────────────────────────────────────────────────────────

export function getClients(): Promise<Client[]> {
  return cached('clients', 5 * 60_000, async () => {
    const sb = getSupabase()
    const { data, error } = await sb.from('clients').select('*').eq('active', true).order('name')
    if (error) throw error
    return data || []
  })
}

export async function getClient(slug: string): Promise<Client | null> {
  const sb = getSupabase()
  const { data } = await sb
    .from('clients')
    .select('*')
    .eq('slug', slug)
    .single()
  return data
}

export async function updateClient(id: string, updates: Partial<Client>) {
  const sb = getSupabase()
  const { error } = await sb.from('clients').update(updates).eq('id', id)
  if (error) throw error
  invalidate('clients')
  invalidatePrefix('dashboard-stats')
}

export function getClientSettings(): Promise<Record<string, any>> {
  return cached('client-settings', 5 * 60_000, async () => {
    const sb = getSupabase()
    const { data } = await sb.from('client_settings').select('*')
    const map: Record<string, any> = {}
    for (const row of data || []) map[row.client_slug] = row
    return map
  })
}

// ─── Accounts ─────────────────────────────────────────────────────────────

export function getAccounts(filters?: {
  search?: string
  type?: string
  clientSlug?: string
  limit?: number
}): Promise<Account[]> {
  // Cache the full unfiltered list; apply in-memory filters on top
  return cached('accounts:all', 3 * 60_000, async () => {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('accounts')
      .select('*, account_clients(client_slug)')
      .order('name')
      .limit(1000)
    if (error) throw error
    return data || []
  }).then(all => {
    let accounts = all
    if (filters?.search) {
      const q = filters.search.toLowerCase()
      accounts = accounts.filter((a: any) =>
        a.name?.toLowerCase().includes(q) || a.address?.toLowerCase().includes(q)
      )
    }
    if (filters?.type && filters.type !== 'all') {
      accounts = accounts.filter((a: any) => a.account_type === filters.type)
    }
    if (filters?.clientSlug) {
      accounts = accounts.filter((a: any) =>
        a.account_clients?.some((ac: any) => ac.client_slug === filters.clientSlug)
      )
    }
    if (filters?.limit) accounts = accounts.slice(0, filters.limit)
    return accounts
  })
}

export async function getAccount(id: string): Promise<Account | null> {
  const sb = getSupabase()
  const { data } = await sb
    .from('accounts')
    .select('*, account_clients(client_slug), contacts(*)')
    .eq('id', id)
    .single()
  return data
}

export async function createAccount(account: {
  name: string
  address?: string
  phone?: string
  account_type: string
  visit_frequency_days?: number
  client_slugs?: string[]
  notes?: string
  website?: string
  instagram?: string
  best_days?: string[]
  best_time?: string
  priority?: string
}): Promise<Account> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('accounts')
    .insert({
      name: account.name,
      address: account.address,
      phone: account.phone,
      account_type: account.account_type,
      visit_frequency_days: account.visit_frequency_days || 21,
      notes: account.notes || null,
      website: account.website || null,
      instagram: account.instagram || null,
      best_days: account.best_days?.length ? account.best_days : [],
      best_time: account.best_time || 'anytime',
      priority: account.priority || 'B',
    })
    .select()
    .single()
  if (error) throw error

  if (account.client_slugs?.length) {
    await sb.from('account_clients').insert(
      account.client_slugs.map(slug => ({ account_id: data.id, client_slug: slug }))
    )
  }

  return data
}

export async function updateAccount(id: string, updates: Partial<Account>) {
  const sb = getSupabase()
  const { error } = await sb.from('accounts').update(updates).eq('id', id)
  if (error) throw error
  invalidate('accounts:all')
  invalidate('overdue-accounts')
}

export async function deleteAccount(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('accounts').delete().eq('id', id)
  if (error) throw error
  invalidate('accounts:all')
  invalidate('overdue-accounts')
  invalidatePrefix('dashboard-stats')
}

export async function updateAccountClients(accountId: string, clientSlugs: string[]): Promise<void> {
  const sb = getSupabase()
  await sb.from('account_clients').delete().eq('account_id', accountId)
  if (clientSlugs.length > 0) {
    await sb.from('account_clients').insert(
      clientSlugs.map(slug => ({ account_id: accountId, client_slug: slug }))
    )
  }
  invalidate('accounts:all')
}

export function getOverdueAccounts(): Promise<Account[]> {
  return cached('overdue-accounts', 2 * 60_000, async () => {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('accounts')
      .select('id, name, address, account_type, visit_frequency_days, last_visited, account_clients(client_slug)')
      .not('visit_frequency_days', 'is', null)
      .order('last_visited', { ascending: true, nullsFirst: true })
      .limit(100)
    if (error) throw error
    return (data || []).filter((a: any) => {
      if (!a.last_visited) return false  // never visited — not overdue, just unvisited
      const days = daysAgoMT(a.last_visited)
      const freq = a.visit_frequency_days || 21
      return days !== null && days >= freq
    }).slice(0, 20)
  })
}

// ─── Visits ───────────────────────────────────────────────────────────────

export async function getVisits(filters?: {
  accountId?: string
  clientSlug?: string
  userId?: string
  since?: string
  limit?: number
}): Promise<Visit[]> {
  const sb = getSupabase()
  let q = sb
    .from('visits')
    .select('*, accounts(id, name, address, account_type)')
    .order('visited_at', { ascending: false })

  if (filters?.accountId) q = q.eq('account_id', filters.accountId)
  if (filters?.clientSlug) q = q.eq('client_slug', filters.clientSlug)
  if (filters?.userId) q = q.eq('user_id', filters.userId)
  if (filters?.since) q = q.gte('visited_at', filters.since)
  q = q.limit(filters?.limit ?? 200)

  const { data, error } = await q
  if (error) throw error
  const visits = data || []

  // Enrich with user names via separate query (no FK between visits.user_id and user_profiles yet)
  if (visits.length > 0) {
    const userIds = [...new Set(visits.map((v: any) => v.user_id).filter(Boolean))]
    if (userIds.length > 0) {
      const { data: profiles } = await sb.from('user_profiles').select('id, name').in('id', userIds)
      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]))
      visits.forEach((v: any) => { v.user_profiles = profileMap[v.user_id] || null })
    }
  }

  return visits
}

export async function logVisit(visit: {
  account_id: string
  user_id: string
  client_slugs: string[]
  visited_at: string
  status: VisitStatus
  notes?: string
  client_notes?: Record<string, string>
  tasting_notes?: string
  feedback?: string
  photo_urls?: string[]
  competitive_sightings?: { brand_name: string; product_name?: string; placement_type?: string }[]
  create_followup?: boolean
  followup_note?: string
}): Promise<void> {
  const sb = getSupabase()

  // Resolve client slugs — fall back to account_clients if none selected
  let slugs = (visit.client_slugs || []).filter(Boolean)
  if (slugs.length === 0) {
    const { data: ac } = await sb
      .from('account_clients')
      .select('client_slug')
      .eq('account_id', visit.account_id)
    slugs = (ac || []).map((r: any) => r.client_slug).filter(Boolean)
  }

  const slugsToInsert = slugs.length > 0 ? slugs : [null]

  // Insert one visit row per client slug, using per-client notes when provided
  const visitRows = slugsToInsert.map(slug => ({
    account_id: visit.account_id,
    user_id: visit.user_id,
    client_slug: slug,
    visited_at: visit.visited_at,
    status: visit.status,
    notes: (slug && visit.client_notes?.[slug]) || visit.notes || null,
    tasting_notes: visit.tasting_notes || null,
    feedback: visit.feedback || null,
    photo_urls: visit.photo_urls || [],
  }))

  const { data: insertedVisits, error } = await sb
    .from('visits')
    .insert(visitRows)
    .select()
  if (error) throw error

  // Update account last_visited
  await sb
    .from('accounts')
    .update({ last_visited: visit.visited_at })
    .eq('id', visit.account_id)

  // Invalidate stale caches
  invalidate('overdue-accounts')
  invalidate('accounts:all')
  invalidate('followup-visits')
  invalidatePrefix('dashboard-stats')
  invalidatePrefix('today-schedule')
  for (const slug of slugsToInsert) {
    if (slug) invalidate(`visits:${slug}`)
  }

  // Save competitive sightings if any
  if (visit.competitive_sightings?.length && insertedVisits?.[0]) {
    const sightings = visit.competitive_sightings.map(s => ({
      account_id: visit.account_id,
      visit_id: insertedVisits[0].id,
      brand_name: s.brand_name,
      product_name: s.product_name || null,
      placement_type: s.placement_type || null,
      sighted_at: visit.visited_at,
    }))
    await sb.from('competitive_sightings').insert(sightings)
  }

  // Create follow-up task if requested
  if (visit.create_followup) {
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 3)
    await sb.from('tasks').insert({
      user_id: visit.user_id,
      title: visit.followup_note || 'Follow up on recent visit',
      account_id: visit.account_id,
      client_slug: slugsToInsert[0] || null,
      priority: 'high',
      due_date: dueDate.toISOString().split('T')[0],
      completed: false,
    })
  }
}

export async function updateVisit(id: string, updates: Partial<Visit> & { client_slug?: string }) {
  const sb = getSupabase()
  const { error } = await sb.from('visits').update(updates).eq('id', id)
  if (error) throw error
  invalidate('followup-visits')
  invalidatePrefix('dashboard-stats')
  if (updates.client_slug) invalidate(`visits:${updates.client_slug}`)
}

export async function deleteVisit(id: string, clientSlug?: string) {
  const sb = getSupabase()
  const { error } = await sb.from('visits').delete().eq('id', id)
  if (error) throw error
  invalidate('followup-visits')
  invalidate('accounts:all')
  invalidatePrefix('dashboard-stats')
  if (clientSlug) invalidate(`visits:${clientSlug}`)
}

export function getFollowUpVisits(): Promise<Visit[]> {
  return cached('followup-visits', 60_000, async () => {
    const sb = getSupabase()
    const since = nDaysAgoMT(90)
    const { data, error } = await sb
      .from('visits')
      .select('*, accounts(id, name, address, account_type, visit_frequency_days)')
      .in('status', ['Will Order Soon', 'Needs Follow Up'])
      .gte('visited_at', since)
      .order('visited_at', { ascending: true })
      .limit(50)
    if (error) throw error
    const visits = data || []
    if (visits.length > 0) {
      const userIds = [...new Set(visits.map((v: any) => v.user_id).filter(Boolean))]
      if (userIds.length > 0) {
        const { data: profiles } = await sb.from('user_profiles').select('id, name').in('id', userIds)
        const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]))
        visits.forEach((v: any) => { v.user_profiles = profileMap[v.user_id] || null })
      }
    }
    return visits
  })
}

// ─── Placements ───────────────────────────────────────────────────────────

export async function getPlacements(filters?: {
  accountId?: string
  clientSlug?: string
  status?: PlacementStatus
  includeActive?: boolean
}): Promise<Placement[]> {
  const sb = getSupabase()
  let q = sb
    .from('placements')
    .select('*, accounts(id, name, address)')
    .is('lost_at', null)
    .order('created_at', { ascending: false })

  if (filters?.accountId) q = q.eq('account_id', filters.accountId)
  if (filters?.clientSlug) q = q.eq('client_slug', filters.clientSlug)
  if (filters?.status) q = q.eq('status', filters.status)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createPlacement(placement: Partial<Placement>): Promise<Placement> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('placements')
    .insert(placement)
    .select()
    .single()
  if (error) throw error
  invalidate('accounts:all')
  invalidatePrefix('dashboard-stats')
  if (placement.client_slug) invalidate(`placements:${placement.client_slug}`)
  return data
}

export async function updatePlacement(id: string, updates: Partial<Placement> & { client_slug?: string }) {
  const sb = getSupabase()
  const { error } = await sb.from('placements').update(updates).eq('id', id)
  if (error) throw error
  invalidate('accounts:all')
  invalidatePrefix('dashboard-stats')
  if (updates.client_slug) invalidate(`placements:${updates.client_slug}`)
}

export async function advancePlacementStatus(id: string, current: PlacementStatus) {
  const next: Record<string, PlacementStatus> = {
    committed: 'ordered',
    ordered: 'on_shelf',
    on_shelf: 'reordering',
  }
  if (!next[current]) return
  await updatePlacement(id, { status: next[current] })
}

export async function revertPlacementStatus(id: string, current: PlacementStatus) {
  const prev: Record<string, PlacementStatus> = {
    ordered: 'committed',
    on_shelf: 'ordered',
    reordering: 'on_shelf',
  }
  if (!prev[current]) return
  await updatePlacement(id, { status: prev[current] })
}

export async function markPlacementLost(id: string, reason: string, clientSlug?: string) {
  const sb = getSupabase()
  await sb.from('placements').update({
    lost_at: new Date().toISOString(),
    lost_reason: reason,
  }).eq('id', id)
  invalidate('accounts:all')
  invalidatePrefix('dashboard-stats')
  if (clientSlug) invalidate(`placements:${clientSlug}`)
}

// ─── Orders ───────────────────────────────────────────────────────────────

export async function getNextOrderNumber(prefix: 'PO' | 'OI'): Promise<string> {
  const sb = getSupabase()
  const { data } = await sb
    .from('purchase_orders')
    .select('po_number')
    .like('po_number', `${prefix}-%`)
    .order('created_at', { ascending: false })
    .limit(200)
  const defaults = prefix === 'PO' ? 38 : 0
  let max = defaults
  for (const row of data || []) {
    const match = row.po_number?.match(new RegExp(`^${prefix}-(\\d+)$`))
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > max) max = n
    }
  }
  return `${prefix}-${String(max + 1).padStart(6, '0')}`
}

export async function getOrders(filters?: {
  clientSlug?: string
  accountId?: string
  status?: string
  since?: string
  limit?: number
}): Promise<PurchaseOrder[]> {
  const sb = getSupabase()
  let q = sb
    .from('purchase_orders')
    .select('*, po_line_items(*)')
    .order('created_at', { ascending: false })

  if (filters?.clientSlug) q = q.eq('client_slug', filters.clientSlug)
  if (filters?.accountId) q = q.eq('account_id', filters.accountId)
  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.since) q = q.gte('created_at', filters.since)
  if (filters?.limit) q = q.limit(filters.limit)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createOrder(order: {
  client_slug: string
  client_name: string
  account_id?: string
  deliver_to_name: string
  deliver_to_address?: string
  deliver_to_phone?: string
  po_number: string
  notes?: string
  line_items: { product_name: string; quantity: number; price: number; cases?: number; bottles?: number; bottle_price?: number }[]
  commission_rate: number
  order_type?: 'direct' | 'distributor'
  distributor_email?: string
  distributor_rep_name?: string
}): Promise<PurchaseOrder> {
  const sb = getSupabase()
  const resolveLineTotal = (li: typeof order.line_items[0]) => {
    const cases = li.cases || 0
    const bottles = li.bottles || 0
    if (cases + bottles > 0) return cases * li.price + bottles * (li.bottle_price || 0)
    return li.quantity * li.price
  }
  const total = order.line_items.reduce((sum, li) => sum + resolveLineTotal(li), 0)
  const commission = total * order.commission_rate

  const { data: po, error } = await sb
    .from('purchase_orders')
    .insert({
      client_slug: order.client_slug,
      client_name: order.client_name,
      account_id: order.account_id || null,
      deliver_to_name: order.deliver_to_name,
      deliver_to_address: order.deliver_to_address,
      deliver_to_phone: order.deliver_to_phone || null,
      po_number: order.po_number,
      order_type: order.order_type || 'direct',
      status: 'draft',
      total: total,
      total_amount: total,
      commission_amount: commission,
      follow_up_status: 'not_started',
      notes: order.notes,
      distributor_email: order.distributor_email || null,
      distributor_rep_name: order.distributor_rep_name || null,
    })
    .select()
    .single()
  if (error) throw error

  if (order.line_items.length) {
    await sb.from('po_line_items').insert(
      order.line_items.map(li => ({
        po_id: po.id,
        product_name: li.product_name,
        quantity: li.quantity,
        price: li.price,
        total: resolveLineTotal(li),
      }))
    )
  }

  invalidatePrefix('dashboard-stats')
  invalidate(`orders:${order.client_slug}`)
  return po
}

export async function updateOrder(id: string, updates: Partial<PurchaseOrder> & { client_slug?: string }) {
  const sb = getSupabase()
  const { error } = await sb.from('purchase_orders').update(updates).eq('id', id)
  if (error) throw error
  invalidatePrefix('dashboard-stats')
  if (updates.client_slug) invalidate(`orders:${updates.client_slug}`)
}

export async function deleteOrder(id: string, clientSlug?: string) {
  const sb = getSupabase()
  await sb.from('po_line_items').delete().eq('po_id', id)
  await sb.from('purchase_orders').delete().eq('id', id)
  invalidatePrefix('dashboard-stats')
  if (clientSlug) invalidate(`orders:${clientSlug}`)
}

// ─── Contacts ─────────────────────────────────────────────────────────────

export async function getDistributorReps(clientSlug: string): Promise<Contact[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('contacts')
    .select('*')
    .eq('client_slug', clientSlug)
    .eq('role', 'Distributor Rep')
    .order('name')
  if (error) throw error
  return data || []
}

export async function getDistributorContacts(): Promise<Contact[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('contacts')
    .select('*')
    .eq('category', 'distributor')
    .order('name')
  if (error) throw error
  return data || []
}

export async function createDistributorRep(rep: { name: string; email: string; phone?: string; client_slug: string }): Promise<Contact> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('contacts')
    .insert({ ...rep, role: 'Distributor Rep', account_id: null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getContacts(filtersOrSlug?: { accountId?: string; search?: string } | string): Promise<Contact[]> {
  const sb = getSupabase()

  if (typeof filtersOrSlug === 'string') {
    // Called with a client_slug — get account IDs for this client, then fetch their contacts
    const { data: acData } = await sb
      .from('account_clients')
      .select('account_id')
      .eq('client_slug', filtersOrSlug)
    const accountIds = (acData || []).map((r: any) => r.account_id)
    if (accountIds.length === 0) return []
    const { data, error } = await sb
      .from('contacts')
      .select('*, accounts(id, name)')
      .in('account_id', accountIds)
      .order('name')
    if (error) throw error
    return data || []
  }

  let q = sb
    .from('contacts')
    .select('*, accounts(id, name)')
    .order('name')

  if (filtersOrSlug?.accountId) q = q.eq('account_id', filtersOrSlug.accountId)
  if (filtersOrSlug?.search) {
    q = q.or(`name.ilike.%${filtersOrSlug.search}%,email.ilike.%${filtersOrSlug.search}%`)
  }

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createContact(contact: Partial<Contact>): Promise<Contact> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('contacts')
    .insert(contact)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateContact(id: string, updates: Partial<Contact>) {
  const sb = getSupabase()
  const { error } = await sb.from('contacts').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteContact(id: string) {
  const sb = getSupabase()
  const { error } = await sb.from('contacts').delete().eq('id', id)
  if (error) throw error
}

// ─── Tasks ────────────────────────────────────────────────────────────────

export async function getTasks(filters?: {
  userId?: string
  completed?: boolean
  accountId?: string
}): Promise<Task[]> {
  const sb = getSupabase()
  let q = sb
    .from('tasks')
    .select('*, accounts(id, name)')
    .order('due_date', { ascending: true, nullsFirst: false })

  if (filters?.userId) {
    q = q.or(`user_id.eq.${filters.userId},assigned_to.eq.${filters.userId}`)
  }
  if (filters?.completed !== undefined) q = q.eq('completed', filters.completed)
  if (filters?.accountId) q = q.eq('account_id', filters.accountId)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createTask(task: {
  user_id?: string
  assigned_to?: string
  title: string
  description?: string
  priority?: TaskPriority
  due_date?: string
  account_id?: string
  client_slug?: string
}): Promise<Task> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('tasks')
    .insert({ ...task, completed: false })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function completeTask(id: string) {
  const sb = getSupabase()
  await sb.from('tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', id)
  invalidate('tasks:all')
}

export async function unCompleteTask(id: string) {
  const sb = getSupabase()
  await sb.from('tasks').update({ completed: false, completed_at: null }).eq('id', id)
  invalidate('tasks:all')
}

export async function deleteTask(id: string) {
  const sb = getSupabase()
  await sb.from('tasks').delete().eq('id', id)
  invalidate('tasks:all')
}

// ─── Events ───────────────────────────────────────────────────────────────

export async function getEvents(filters?: {
  clientSlug?: string
  since?: string
  until?: string
  accountId?: string
}): Promise<Event[]> {
  const sb = getSupabase()
  let q = sb
    .from('events')
    .select('*, accounts(id, name, address)')
    .order('start_time', { ascending: true })

  if (filters?.clientSlug) q = q.eq('client_slug', filters.clientSlug)
  if (filters?.since) q = q.gte('start_time', filters.since)
  if (filters?.until) q = q.lte('start_time', filters.until)
  if (filters?.accountId) q = q.eq('account_id', filters.accountId)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createEvent(event: Partial<Event>): Promise<Event> {
  const sb = getSupabase()
  const { data, error } = await sb.from('events').insert(event).select().single()
  if (error) throw error
  return data
}

export async function updateEvent(id: string, updates: Partial<Event>) {
  const sb = getSupabase()
  await sb.from('events').update(updates).eq('id', id)
}

export async function deleteEvent(id: string) {
  const sb = getSupabase()
  await sb.from('events').delete().eq('id', id)
}

// ─── Campaigns ────────────────────────────────────────────────────────────

export async function getCampaigns(clientSlug?: string): Promise<Campaign[]> {
  const sb = getSupabase()
  let q = sb
    .from('campaigns')
    .select('*, campaign_milestones(*), clients(id, name, color)')
    .order('created_at', { ascending: false })
  if (clientSlug) q = q.eq('client_slug', clientSlug)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function toggleMilestone(id: string, completed: boolean) {
  const sb = getSupabase()
  await sb.from('campaign_milestones').update({
    completed,
    completed_at: completed ? new Date().toISOString() : null,
  }).eq('id', id)
}

// ─── Products ─────────────────────────────────────────────────────────────

export async function getProducts(clientSlug: string): Promise<Product[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('products')
    .select('*')
    .eq('client_slug', clientSlug)
    .order('name')
  if (error) throw error
  // Normalize price across possible column names
  return (data || []).map((p: any) => {
    // unit_price = case price; bottle_price = per-bottle price (different columns)
    const casePrice = Number(p.price ?? p.price_per_case ?? p.case_price ?? p.unit_price ?? 0) || undefined
    const btlPrice = Number(p.bottle_price ?? p.price_per_bottle ?? 0) || undefined
    return {
      ...p,
      price: casePrice,
      bottle_price: btlPrice ?? (casePrice && p.case_count ? casePrice / p.case_count : undefined),
    }
  })
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product> {
  const sb = getSupabase()
  const { data, error } = await sb.from('products').insert(product).select().single()
  if (error) throw error
  return data
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('products').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteProduct(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('products').delete().eq('id', id)
  if (error) throw error
}

// ─── State Registrations ──────────────────────────────────────────────────

export async function getStateRegistrations(clientId?: string): Promise<StateRegistration[]> {
  const sb = getSupabase()
  let q = sb
    .from('state_registrations')
    .select('*')
    .order('state')
  if (clientId) q = q.eq('client_id', clientId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function upsertStateRegistration(reg: Partial<StateRegistration>) {
  const sb = getSupabase()
  const { error } = await sb
    .from('state_registrations')
    .upsert({ ...reg, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ─── Competitive Sightings ────────────────────────────────────────────────

export async function getCompetitiveSightings(accountId?: string): Promise<CompetitiveSighting[]> {
  const sb = getSupabase()
  let q = sb
    .from('competitive_sightings')
    .select('*')
    .order('sighted_at', { ascending: false })
  if (accountId) q = q.eq('account_id', accountId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ─── Agency Pipeline ──────────────────────────────────────────────────────

export async function getAgencyPipeline(): Promise<AgencyPipeline[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('agency_pipeline')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function upsertPipelineDeal(deal: Partial<AgencyPipeline>) {
  const sb = getSupabase()
  const { error } = await sb
    .from('agency_pipeline')
    .upsert({ ...deal, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function deletePipelineDeal(id: string) {
  const sb = getSupabase()
  await sb.from('agency_pipeline').delete().eq('id', id)
}

// ─── Tasting Consumers ────────────────────────────────────────────────────

export async function getTastingConsumers(eventId: string): Promise<TastingConsumer[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('tasting_consumers')
    .select('*')
    .eq('event_id', eventId)
    .order('captured_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function saveTastingConsumer(consumer: Partial<TastingConsumer>) {
  const sb = getSupabase()
  const { error } = await sb.from('tasting_consumers').insert(consumer)
  if (error) throw error
}

// ─── Depletion ────────────────────────────────────────────────────────────

export async function getDepletionEntries(placementId?: string): Promise<DepletionEntry[]> {
  const sb = getSupabase()
  let q = sb
    .from('depletion_entries')
    .select('*')
    .order('period_month', { ascending: false })
  if (placementId) q = q.eq('placement_id', placementId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveDepletionEntry(entry: Partial<DepletionEntry>) {
  const sb = getSupabase()
  const { error } = await sb.from('depletion_entries').insert(entry)
  if (error) throw error
}

// ─── Dashboard stats ──────────────────────────────────────────────────────

export function getDashboardStats(userId: string, isOwner: boolean) {
  return cached(`dashboard-stats:${userId}:${isOwner}`, 30_000, async () => {
    const sb = getSupabase()
    const monthStart = startOfMonthMT()
    const monthEnd = endOfMonthMT()

    const [teamVisits, myVisits, activePlacements, openTasks] = await Promise.all([
      isOwner
        ? sb.from('visits').select('id', { count: 'exact', head: true })
            .gte('visited_at', monthStart).lte('visited_at', monthEnd)
        : sb.from('visits').select('id', { count: 'exact', head: true })
            .eq('user_id', userId).gte('visited_at', monthStart).lte('visited_at', monthEnd),
      sb.from('visits').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('visited_at', monthStart).lte('visited_at', monthEnd),
      sb.from('placements').select('id', { count: 'exact', head: true }).is('lost_at', null),
      sb.from('tasks').select('id', { count: 'exact', head: true })
        .eq('completed', false)
        .or(`user_id.eq.${userId},assigned_to.eq.${userId}`),
    ])

    // Only count sent/fulfilled orders for commission — drafts and cancelled don't earn commission
    const [sentOrders, fulfilledOrders, clients] = await Promise.all([
      getOrders({ status: 'sent' }),
      getOrders({ status: 'fulfilled' }),
      getClients(),
    ])
    const billedOrders = [...sentOrders, ...fulfilledOrders]

    const rateMap = Object.fromEntries(clients.map(c => [c.slug, c.commission_rate || 0]))

    function resolveComm(o: any): number {
      const stored = Number(o.commission_amount) || 0
      if (stored > 0) return stored
      const lineTotal = (o.po_line_items || []).reduce((s: number, li: any) => {
        const t = Number(li.total || 0) || Number(li.unit_price || li.price || 0) * ((Number(li.cases || 0) + Number(li.bottles || 0) + Number(li.quantity || 0)) || 1)
        return s + t
      }, 0)
      const base = Number(o.total_amount) || lineTotal
      return base * (rateMap[o.client_slug] || 0)
    }

    const mtNow = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    const thisMonth = mtNow.slice(0, 7) // "2026-04"
    const commissionThisMonth = billedOrders
      .filter(o => (o.created_at || '').slice(0, 7) === thisMonth)
      .reduce((s, o) => s + resolveComm(o), 0)

    return {
      teamVisits: teamVisits.count || 0,
      myVisits: myVisits.count || 0,
      activePlacements: activePlacements.count || 0,
      openTasks: openTasks.count || 0,
      commissionThisMonth,
      commissionYTD: billedOrders
        .filter(o => (o.created_at || '').startsWith(thisMonth.slice(0, 4)))
        .reduce((s, o) => s + resolveComm(o), 0),
    }
  })
}

export function getVisitStreak(userId: string) {
  return cached(`visit-streak:${userId}`, 60_000, async () => {
    const sb = getSupabase()
    // Fetch last 60 days of visits for streak calculation
    const since = nDaysAgoMT(60)
    const { data: myVisits } = await sb.from('visits').select('visited_at, user_id')
      .eq('user_id', userId).gte('visited_at', since).order('visited_at', { ascending: false })
    const { data: teamVisits } = await sb.from('visits').select('visited_at, user_id')
      .gte('visited_at', nDaysAgoMT(7)).order('visited_at', { ascending: false })

    // Build set of unique MT calendar days user visited
    const visitedDays = new Set((myVisits || []).map((v: any) => {
      const d = v.visited_at
      // Handle Supabase timestamps without timezone info (treat as UTC)
      const date = d.length > 10 && !d.endsWith('Z') && !d.includes('+') && !d.includes('-', 10) ? new Date(d + 'Z') : new Date(d)
      return date.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    }))

    // Streak: consecutive days ending today (or yesterday)
    let streak = 0
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    let checkDay = today
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (visitedDays.has(checkDay)) {
        streak++
        const d = new Date(checkDay + 'T12:00:00Z')
        d.setDate(d.getDate() - 1)
        checkDay = d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
      } else {
        // Allow a one-day gap (if today has no visits yet, check yesterday)
        if (streak === 0 && checkDay === today) {
          const d = new Date(checkDay + 'T12:00:00Z')
          d.setDate(d.getDate() - 1)
          checkDay = d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
          if (visitedDays.has(checkDay)) continue
        }
        break
      }
    }

    // Best day of week (last 60 days)
    const dayCount: Record<number, number> = {}
    ;(myVisits || []).forEach((v: any) => {
      const d = v.visited_at
      const date = d.length > 10 && !d.endsWith('Z') && !d.includes('+') && !d.includes('-', 10) ? new Date(d + 'Z') : new Date(d)
      const dow = new Date(date.toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) + 'T12:00:00Z').getUTCDay()
      dayCount[dow] = (dayCount[dow] || 0) + 1
    })
    const bestDow = Object.entries(dayCount).sort(([, a], [, b]) => b - a)[0]
    const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const bestDay = bestDow ? dowNames[Number(bestDow[0])] : null

    return {
      streak,
      teamWeekVisits: (teamVisits || []).length,
      bestDay,
    }
  })
}

export function getTodaySchedule(userId: string) {
  return cached(`today-schedule:${userId}`, 30_000, async () => {
    const sb = getSupabase()
    const today = todayMT()
    const todayStart = nDaysAgoMT(0) // MT midnight of today
    const todayEnd = new Date(new Date(todayStart).getTime() + 86399000).toISOString()

    const [events, milestones, tasks] = await Promise.all([
      sb.from('events')
        .select('*, accounts(id, name, address)')
        .gte('start_time', todayStart)
        .lte('start_time', todayEnd)
        .order('start_time'),
      sb.from('campaign_milestones')
        .select('*, campaigns(title, client_slug)')
        .eq('due_date', today)
        .eq('completed', false),
      sb.from('tasks')
        .select('*, accounts(id, name)')
        .or(`user_id.eq.${userId},assigned_to.eq.${userId}`)
        .eq('completed', false)
        .eq('due_date', today),
    ])

    return {
      events: events.data || [],
      milestones: milestones.data || [],
      tasks: tasks.data || [],
    }
  })
}

// ─── Analytics ────────────────────────────────────────────────────────────

export async function getVisitTrend(range: DateRange) {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('visits')
    .select('visited_at, client_slug')
    .gte('visited_at', range.start.toISOString())
    .lte('visited_at', range.end.toISOString())
    .order('visited_at')
  if (error) throw error
  return data || []
}

export async function getCommissionTrend(months = 12) {
  const sb = getSupabase()
  const since = new Date()
  since.setMonth(since.getMonth() - months)
  const { data, error } = await sb
    .from('purchase_orders')
    .select('created_at, commission_amount, total_amount, client_slug')
    .in('status', ['sent', 'fulfilled'])
    .gte('created_at', since.toISOString())
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function getRepActivity(since: string) {
  const sb = getSupabase()
  const [profiles, visits] = await Promise.all([
    sb.from('user_profiles').select('id, name').in('role', ['owner', 'rep']),
    sb.from('visits').select('user_id').gte('visited_at', since),
  ])
  return {
    profiles: profiles.data || [],
    visits: visits.data || [],
  }
}

export async function getPlacementFunnel(range: DateRange) {
  const sb = getSupabase()
  const [totalVisits, placements, onShelf, uniqueAccs] = await Promise.all([
    sb.from('visits').select('id', { count: 'exact', head: true })
      .gte('visited_at', range.start.toISOString())
      .lte('visited_at', range.end.toISOString()),
    sb.from('placements').select('id', { count: 'exact', head: true })
      .gte('created_at', range.start.toISOString())
      .lte('created_at', range.end.toISOString()),
    sb.from('placements').select('id', { count: 'exact', head: true })
      .eq('status', 'on_shelf')
      .is('lost_at', null),
    sb.from('visits').select('account_id')
      .gte('visited_at', range.start.toISOString())
      .lte('visited_at', range.end.toISOString()),
  ])
  const uniqueAccounts = new Set((uniqueAccs.data || []).map((r: any) => r.account_id)).size
  return {
    totalVisits: totalVisits.count || 0,
    placementsCreated: placements.count || 0,
    activeOnShelf: onShelf.count || 0,
    uniqueAccounts,
  }
}

export async function getBrandHealthScore(clientSlug: string) {
  const sb = getSupabase()
  const thirtyDaysAgo = nDaysAgoMT(30)

  const [visits, placements, orders, events] = await Promise.all([
    sb.from('visits').select('id', { count: 'exact', head: true })
      .eq('client_slug', clientSlug).gte('visited_at', thirtyDaysAgo),
    sb.from('placements').select('id', { count: 'exact', head: true })
      .eq('client_slug', clientSlug).is('lost_at', null),
    sb.from('purchase_orders').select('id', { count: 'exact', head: true })
      .eq('client_slug', clientSlug).eq('status', 'sent')
      .gte('created_at', thirtyDaysAgo),
    sb.from('events').select('id', { count: 'exact', head: true })
      .eq('client_slug', clientSlug).gte('start_time', thirtyDaysAgo),
  ])

  const visit_score = Math.min(30, (visits.count || 0) * 3)
  const placement_score = Math.min(30, (placements.count || 0) * 2)
  const order_score = Math.min(20, (orders.count || 0) * 5)
  const event_score = Math.min(20, (events.count || 0) * 5)
  const total = visit_score + placement_score + order_score + event_score

  return { total, visit_score, placement_score, order_score, event_score }
}

// ─── Weekly Report Data ────────────────────────────────────────────────────

export async function getWeeklyReportData(clientSlug: string, weekStart: string, weekEnd: string) {
  const sb = getSupabase()

  // Get all accounts for this client
  const { data: acData } = await sb
    .from('account_clients')
    .select('account_id')
    .eq('client_slug', clientSlug)
  const accountIds = (acData || []).map((r: any) => r.account_id)

  const [bySlug, byAccount, placements, orders, events, followups] = await Promise.all([
    // Visits logged for this client directly
    sb.from('visits')
      .select('*, accounts(id, name, address)')
      .eq('client_slug', clientSlug)
      .gte('visited_at', weekStart).lte('visited_at', weekEnd),
    // Visits by account (fallback for null client_slug)
    accountIds.length > 0
      ? sb.from('visits')
          .select('*, accounts(id, name, address)')
          .in('account_id', accountIds)
          .is('client_slug', null)
          .gte('visited_at', weekStart).lte('visited_at', weekEnd)
      : Promise.resolve({ data: [] }),
    sb.from('placements')
      .select('*, accounts(name)')
      .eq('client_slug', clientSlug)
      .gte('created_at', weekStart).lte('created_at', weekEnd),
    sb.from('purchase_orders')
      .select('*')
      .eq('client_slug', clientSlug)
      .gte('created_at', weekStart).lte('created_at', weekEnd),
    sb.from('events')
      .select('*, accounts(name)')
      .eq('client_slug', clientSlug)
      .gte('start_time', weekStart).lte('start_time', weekEnd),
    sb.from('visits')
      .select('*, accounts(name)')
      .in('status', ['Will Order Soon', 'Needs Follow Up'])
      .eq('client_slug', clientSlug)
      .lte('visited_at', nDaysAgoMT(3)),
  ])

  // Deduplicate visits by account
  const combined = [...(bySlug.data || []), ...(byAccount.data || [])]
  const seen = new Set<string>()
  const visits = combined.filter((v: any) => {
    if (seen.has(v.id)) return false
    seen.add(v.id)
    return true
  })

  return {
    visits,
    placements: placements.data || [],
    orders: orders.data || [],
    events: events.data || [],
    followups: followups.data || [],
  }
}

// ─── Client portal data ───────────────────────────────────────────────────

export async function getPortalData(clientSlug: string) {
  const sb = getSupabase()
  const ninetyDaysAgo = nDaysAgoMT(90)

  const [clientRes, visitsRes, placementsRes, ordersRes, eventsRes, suggestionsRes, campaignsRes] = await Promise.all([
    getClient(clientSlug),
    sb.from('visits')
      .select('id, visited_at, status, notes, account_id, accounts(id, name, address, account_type)')
      .eq('client_slug', clientSlug)
      .gte('visited_at', ninetyDaysAgo)
      .order('visited_at', { ascending: false })
      .limit(150),
    sb.from('placements')
      .select('id, product_name, placement_type, status, price_point, created_at, updated_at, accounts(id, name, address)')
      .eq('client_slug', clientSlug)
      .is('lost_at', null)
      .order('created_at', { ascending: false }),
    sb.from('purchase_orders')
      .select('id, po_number, deliver_to_name, total_amount, status, order_type, created_at, distributor_email, distributor_rep_name, deliver_to_address')
      .eq('client_slug', clientSlug)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false }),
    sb.from('events')
      .select('id, title, event_type, start_time, accounts(name)')
      .eq('client_slug', clientSlug)
      .gte('start_time', ninetyDaysAgo)
      .order('start_time', { ascending: false }),
    sb.from('client_suggestions')
      .select('*')
      .eq('client_slug', clientSlug)
      .order('submitted_at', { ascending: false })
      .limit(20),
    sb.from('campaigns')
      .select('*, campaign_milestones(*)')
      .eq('client_slug', clientSlug)
      .in('status', ['active', 'paused', 'draft'])
      .order('created_at', { ascending: false }),
  ])

  const client = clientRes
  const visits = visitsRes.data || []
  const placements = placementsRes.data || []
  const orders = ordersRes.data || []
  const events = eventsRes.data || []
  const suggestions = (suggestionsRes.data || []) as any[]
  const campaigns = (campaignsRes.data || []) as any[]

  const distOrders = orders.filter((o: any) => o.order_type === 'distributor')
  const confirmedDist = distOrders.filter((o: any) => o.status === 'fulfilled')
  const pendingDist = distOrders.filter((o: any) => o.status === 'sent')

  const followUpVisits = visits.filter((v: any) => v.status === 'Will Order Soon' || v.status === 'Needs Follow Up')
  const funnel = {
    visits: visits.length,
    followUps: followUpVisits.length,
    inquiries: distOrders.length,
    confirmed: confirmedDist.length,
    pending: pendingDist.length,
  }

  const TZ = 'America/Denver'
  const visitTrend: { week: string; weekEnd: string; visits: number }[] = []
  // Compute today's date string in MT
  const todayMT = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const todayMTDate = new Date(todayMT + 'T12:00:00Z')
  // Find start of current week (Sunday) in MT
  const todayDOW = new Date(todayMT + 'T12:00:00Z').getUTCDay()
  const currentWeekSundayMT = new Date(todayMTDate)
  currentWeekSundayMT.setUTCDate(currentWeekSundayMT.getUTCDate() - todayDOW)

  for (let i = 11; i >= 0; i--) {
    const weekSunday = new Date(currentWeekSundayMT)
    weekSunday.setUTCDate(weekSunday.getUTCDate() - i * 7)
    const weekSaturday = new Date(weekSunday)
    weekSaturday.setUTCDate(weekSaturday.getUTCDate() + 6)
    const weekStartStr = weekSunday.toLocaleDateString('en-CA', { timeZone: TZ })
    const weekEndStr = weekSaturday.toLocaleDateString('en-CA', { timeZone: TZ })
    const count = visits.filter((v: any) => {
      const raw = v.visited_at
      const vd = raw.length > 10 && !raw.endsWith('Z') && !raw.includes('+') && !raw.includes('-', 10) ? raw + 'Z' : raw
      const ds = new Date(vd).toLocaleDateString('en-CA', { timeZone: TZ })
      return ds >= weekStartStr && ds <= weekEndStr
    }).length
    const label = new Date(weekStartStr + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    const endLabel = new Date(weekEndStr + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    visitTrend.push({ week: label, weekEnd: endLabel, visits: count })
  }

  return {
    client,
    visits,
    placements,
    orders,
    events,
    distOrders,
    suggestions,
    campaigns,
    funnel,
    visitTrend,
  }
}

export async function submitClientSuggestion(suggestion: {
  client_slug: string
  suggestion_type: 'account' | 'contact'
  name: string
  address?: string
  notes?: string
  reason: string
  reason_detail?: string
  submitted_by_name?: string
  submitted_by_email?: string
}) {
  const sb = getSupabase()
  const { data, error } = await sb.from('client_suggestions').insert(suggestion).select().single()
  if (error) throw error
  return data
}

export async function getClientSuggestions(status?: string) {
  const sb = getSupabase()
  let q = sb.from('client_suggestions').select('*').order('submitted_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q.limit(50)
  if (error) throw error
  return data || []
}

export async function acknowledgeClientSuggestion(id: string) {
  const sb = getSupabase()
  await sb.from('client_suggestions').update({ status: 'acknowledged' }).eq('id', id)
}

// ─── Planner Stops ───────────────────────────────────────────────────────

export interface PlannerStop {
  id: string
  user_id: string
  plan_date: string
  account_id?: string | null
  title: string
  subtitle?: string | null
  address?: string | null
  scheduled_time?: string | null
  stop_order: number
  completed: boolean
  stop_type: 'event' | 'account' | 'task'
  created_at: string
}

export async function getPlannerStops(userId: string, date: string): Promise<PlannerStop[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('planner_stops')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_date', date)
    .order('stop_order')
  if (error) throw error
  return data || []
}

export async function upsertPlannerStop(stop: Omit<PlannerStop, 'id' | 'created_at'> & { id?: string }) {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('planner_stops')
    .upsert(stop)
    .select()
    .single()
  if (error) throw error
  return data as PlannerStop
}

export async function updatePlannerStop(id: string, updates: Partial<PlannerStop>) {
  const sb = getSupabase()
  const { error } = await sb.from('planner_stops').update(updates).eq('id', id)
  if (error) throw error
}

export async function deletePlannerStop(id: string) {
  const sb = getSupabase()
  await sb.from('planner_stops').delete().eq('id', id)
}

export async function savePlannerOrder(stops: { id: string; stop_order: number }[]) {
  const sb = getSupabase()
  await Promise.all(stops.map(s => sb.from('planner_stops').update({ stop_order: s.stop_order }).eq('id', s.id)))
}

// ─── Search ───────────────────────────────────────────────────────────────

export async function globalSearch(query: string) {
  if (!query || query.length < 2) return { accounts: [], contacts: [], clients: [], placements: [], orders: [], visits: [] }
  const sb = getSupabase()
  const q = `%${query}%`

  const [accounts, contacts, clients, placements, orders, visits] = await Promise.all([
    sb.from('accounts').select('id, name, address, account_type').ilike('name', q).limit(5),
    sb.from('contacts').select('id, name, role, email, accounts(id, name)').or(`name.ilike.${q},email.ilike.${q},role.ilike.${q}`).limit(5),
    sb.from('clients').select('id, name, slug, color, logo_url').ilike('name', q).limit(3),
    sb.from('placements').select('id, product_name, client_slug, account_id, accounts(id, name)').ilike('product_name', q).is('lost_at', null).limit(5),
    sb.from('purchase_orders').select('id, po_number, deliver_to_name, client_slug').or(`po_number.ilike.${q},deliver_to_name.ilike.${q}`).limit(5),
    sb.from('visits').select('id, notes, account_id, accounts(id, name)').ilike('notes', q).order('visited_at', { ascending: false }).limit(5),
  ])

  return {
    accounts: accounts.data || [],
    contacts: contacts.data || [],
    clients: clients.data || [],
    placements: placements.data || [],
    orders: orders.data || [],
    visits: visits.data || [],
  }
}

// ─── Brand Assets ────────────────────────────────────────────────────────

export async function getBrandAssets(clientSlug: string) {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('brand_assets')
    .select('*')
    .eq('client_slug', clientSlug)
    .order('asset_type')
  if (error) throw error
  return data || []
}

// ─── Per-client filtered queries (for client detail page) ─────────────────

export function getVisitsForClient(clientSlug: string) {
  return cached(`visits:${clientSlug}`, 2 * 60_000, async () => {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('visits')
      .select('*, accounts(id, name, address)')
      .eq('client_slug', clientSlug)
      .order('visited_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return data || []
  })
}

export function getPlacementsForClient(clientSlug: string) {
  return cached(`placements:${clientSlug}`, 2 * 60_000, async () => {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('placements')
      .select('*, accounts(id, name)')
      .eq('client_slug', clientSlug)
      .is('lost_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  })
}

export function getOrdersForClient(clientSlug: string) {
  return cached(`orders:${clientSlug}`, 2 * 60_000, async () => {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('purchase_orders')
      .select('*, accounts(id, name), po_line_items(*)')
      .eq('client_slug', clientSlug)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  })
}

export function getEventsForClient(clientSlug: string) {
  return cached(`events:${clientSlug}`, 2 * 60_000, async () => {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('events')
      .select('*, accounts(id, name)')
      .eq('client_slug', clientSlug)
      .order('start_time', { ascending: false })
    if (error) throw error
    return data || []
  })
}

export function getTastingConsumersForClient(clientSlug: string) {
  return cached(`tastings:${clientSlug}`, 2 * 60_000, async () => {
    const sb = getSupabase()
    const { data: evData } = await sb
      .from('events')
      .select('id')
      .eq('client_slug', clientSlug)
      .eq('event_type', 'tasting')
    const eventIds = (evData || []).map((e: any) => e.id)
    if (eventIds.length === 0) return []
    const { data, error } = await sb
      .from('tasting_consumers')
      .select('*')
      .in('event_id', eventIds)
      .order('captured_at', { ascending: false })
    if (error) throw error
    return data || []
  })
}

export async function createCampaign(campaign: Partial<Campaign>): Promise<Campaign> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('campaigns')
    .insert(campaign)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function upsertPipelineStage(id: string, stage: string) {
  const sb = getSupabase()
  const { error } = await sb
    .from('agency_pipeline')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function createMilestone(campaignId: string, title: string, dueDate?: string) {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('campaign_milestones')
    .insert({ campaign_id: campaignId, title, due_date: dueDate || null, completed: false })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCampaign(id: string, updates: Partial<Campaign>) {
  const sb = getSupabase()
  const { error } = await sb
    .from('campaigns')
    .update(updates as any)
    .eq('id', id)
  if (error) throw error
}

// ─── Campaign Expenses ────────────────────────────────────────────────────

export async function getCampaignExpenses(campaignId: string) {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('campaign_expenses')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createCampaignExpense(expense: {
  campaign_id: string
  client_slug: string
  description: string
  category: string
  amount: number
  vendor?: string
  expense_date?: string
  notes?: string
  added_by?: string
}) {
  const sb = getSupabase()
  const { data, error } = await sb.from('campaign_expenses').insert(expense).select().single()
  if (error) throw error
  return data
}

export async function deleteCampaignExpense(id: string) {
  const sb = getSupabase()
  const { error } = await sb.from('campaign_expenses').delete().eq('id', id)
  if (error) throw error
}

// ─── Campaign Assets ──────────────────────────────────────────────────────

export async function getCampaignAssets(campaignId: string) {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('campaign_assets')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createCampaignAsset(asset: {
  campaign_id: string
  client_slug: string
  name: string
  file_url: string
  file_type?: string
  file_size?: number
  description?: string
  uploaded_by?: string
}) {
  const sb = getSupabase()
  const { data, error } = await sb.from('campaign_assets').insert(asset).select().single()
  if (error) throw error
  return data
}

export async function deleteCampaignAsset(id: string) {
  const sb = getSupabase()
  const { error } = await sb.from('campaign_assets').delete().eq('id', id)
  if (error) throw error
}

export async function getEmailList(clientSlug?: string): Promise<TastingConsumer[]> {
  const sb = getSupabase()
  let q = sb
    .from('tasting_consumers')
    .select('*')
    .eq('opted_in_marketing', true)
    .order('captured_at', { ascending: false })
  if (clientSlug) {
    // Join through events to filter by client
    const { data: events } = await sb
      .from('events')
      .select('id')
      .eq('client_slug', clientSlug)
    const eventIds = (events || []).map((e: any) => e.id)
    if (eventIds.length === 0) return []
    q = q.in('event_id', eventIds)
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}
