'use client'
import { getSupabase } from './supabase'
import { cached, invalidate } from './cache'
import { startOfMonthMT, endOfMonthMT, nDaysAgoMT, todayMT } from './formatters'
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
    const today = new Date()
    return (data || []).filter((a: any) => {
      if (!a.last_visited) return false
      const lastVisit = new Date(a.last_visited)
      const daysSince = Math.floor((today.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
      const freq = a.visit_frequency_days || 21
      return daysSince >= freq
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
    .select('*, accounts(id, name, address, account_type), user_profiles(id, name)')
    .order('visited_at', { ascending: false })

  if (filters?.accountId) q = q.eq('account_id', filters.accountId)
  if (filters?.clientSlug) q = q.eq('client_slug', filters.clientSlug)
  if (filters?.userId) q = q.eq('user_id', filters.userId)
  if (filters?.since) q = q.gte('visited_at', filters.since)
  q = q.limit(filters?.limit ?? 200)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function logVisit(visit: {
  account_id: string
  user_id: string
  client_slugs: string[]
  visited_at: string
  status: VisitStatus
  notes?: string
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

  // Insert one visit row per client slug
  const visitRows = slugsToInsert.map(slug => ({
    account_id: visit.account_id,
    user_id: visit.user_id,
    client_slug: slug,
    visited_at: visit.visited_at,
    status: visit.status,
    notes: visit.notes || null,
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

export async function updateVisit(id: string, updates: Partial<Visit>) {
  const sb = getSupabase()
  const { error } = await sb.from('visits').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteVisit(id: string) {
  const sb = getSupabase()
  const { error } = await sb.from('visits').delete().eq('id', id)
  if (error) throw error
}

export function getFollowUpVisits(): Promise<Visit[]> {
  return cached('followup-visits', 60_000, async () => {
    const sb = getSupabase()
    const since = nDaysAgoMT(90)
    const { data, error } = await sb
      .from('visits')
      .select('*, accounts(id, name, address, account_type), user_profiles(id, name)')
      .in('status', ['Will Order Soon', 'Needs Follow Up'])
      .gte('visited_at', since)
      .order('visited_at', { ascending: true })
      .limit(50)
    if (error) throw error
    return data || []
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
  return data
}

export async function updatePlacement(id: string, updates: Partial<Placement>) {
  const sb = getSupabase()
  const { error } = await sb.from('placements').update(updates).eq('id', id)
  if (error) throw error
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

export async function markPlacementLost(id: string, reason: string) {
  const sb = getSupabase()
  await sb.from('placements').update({
    lost_at: new Date().toISOString(),
    lost_reason: reason,
  }).eq('id', id)
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
  account_id?: string
  deliver_to_name: string
  deliver_to_address?: string
  deliver_to_phone?: string
  po_number: string
  notes?: string
  line_items: { product_name: string; quantity: number; price: number }[]
  commission_rate: number
  order_type?: 'direct' | 'distributor'
  distributor_email?: string
  distributor_rep_name?: string
}): Promise<PurchaseOrder> {
  const sb = getSupabase()
  const total = order.line_items.reduce((sum, li) => sum + li.quantity * li.price, 0)
  const commission = total * order.commission_rate

  const { data: po, error } = await sb
    .from('purchase_orders')
    .insert({
      client_slug: order.client_slug,
      account_id: order.account_id || null,
      deliver_to_name: order.deliver_to_name,
      deliver_to_address: order.deliver_to_address,
      deliver_to_phone: order.deliver_to_phone || null,
      po_number: order.po_number,
      order_type: order.order_type || 'direct',
      status: 'draft',
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
        total: li.quantity * li.price,
      }))
    )
  }

  return po
}

export async function updateOrder(id: string, updates: Partial<PurchaseOrder>) {
  const sb = getSupabase()
  const { error } = await sb.from('purchase_orders').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteOrder(id: string) {
  const sb = getSupabase()
  await sb.from('po_line_items').delete().eq('po_id', id)
  await sb.from('purchase_orders').delete().eq('id', id)
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
  await sb.from('tasks').update({
    completed: true,
    completed_at: new Date().toISOString(),
  }).eq('id', id)
}

export async function unCompleteTask(id: string) {
  const sb = getSupabase()
  await sb.from('tasks').update({ completed: false, completed_at: null }).eq('id', id)
}

export async function deleteTask(id: string) {
  const sb = getSupabase()
  await sb.from('tasks').delete().eq('id', id)
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
  return data || []
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

    // Use getOrders() — same function that powers the orders page (proven to return commission_amount)
    const [allOrders, clients] = await Promise.all([getOrders(), getClients()])

    const rateMap = Object.fromEntries(clients.map(c => [c.slug, c.commission_rate || 0]))

    function resolveComm(o: any): number {
      const stored = Number(o.commission_amount) || 0
      if (stored > 0) return stored
      // fallback: compute from line items
      const lineTotal = (o.po_line_items || []).reduce((s: number, li: any) => {
        const t = Number(li.total || 0) || Number(li.unit_price || li.price || 0) * (Number(li.cases || 0) + Number(li.bottles || 0) + Number(li.quantity || 0) || 1)
        return s + t
      }, 0)
      const base = Number(o.total_amount) || lineTotal
      return base * (rateMap[o.client_slug] || 0)
    }

    const thisMonth = new Date().toISOString().slice(0, 7) // "2026-04"
    const commissionThisMonth = allOrders
      .filter(o => (o.created_at || '').slice(0, 7) === thisMonth)
      .reduce((s, o) => s + resolveComm(o), 0)

    return {
      teamVisits: teamVisits.count || 0,
      myVisits: myVisits.count || 0,
      activePlacements: activePlacements.count || 0,
      openTasks: openTasks.count || 0,
      commissionThisMonth,
      commissionYTD: allOrders
        .filter(o => (o.created_at || '').startsWith(thisMonth.slice(0, 4)))
        .reduce((s, o) => s + resolveComm(o), 0),
    }
  })
}

export function getTodaySchedule(userId: string) {
  return cached(`today-schedule:${userId}`, 30_000, async () => {
    const sb = getSupabase()
    const today = todayMT()
    const todayStart = today + 'T00:00:00.000Z'
    const todayEnd = today + 'T23:59:59.999Z'

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
  const [profiles, visits, placements] = await Promise.all([
    sb.from('user_profiles').select('id, name').in('role', ['owner', 'rep']),
    sb.from('visits').select('user_id').gte('visited_at', since),
    sb.from('placements').select('id').gte('created_at', since),
  ])
  return {
    profiles: profiles.data || [],
    visits: visits.data || [],
  }
}

export async function getPlacementFunnel(range: DateRange) {
  const sb = getSupabase()
  const [totalVisits, placements, onShelf] = await Promise.all([
    sb.from('visits').select('id', { count: 'exact', head: true })
      .gte('visited_at', range.start.toISOString())
      .lte('visited_at', range.end.toISOString()),
    sb.from('placements').select('id', { count: 'exact', head: true })
      .gte('created_at', range.start.toISOString())
      .lte('created_at', range.end.toISOString()),
    sb.from('placements').select('id', { count: 'exact', head: true })
      .eq('status', 'on_shelf')
      .is('lost_at', null),
  ])
  return {
    totalVisits: totalVisits.count || 0,
    placementsCreated: placements.count || 0,
    activeOnShelf: onShelf.count || 0,
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
      .select('*, accounts(id, name, address), user_profiles(name)')
      .eq('client_slug', clientSlug)
      .gte('visited_at', weekStart).lte('visited_at', weekEnd),
    // Visits by account (fallback for null client_slug)
    accountIds.length > 0
      ? sb.from('visits')
          .select('*, accounts(id, name, address), user_profiles(name)')
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
  const monthStart = startOfMonthMT()

  const [client, visits, placements, orders, events, registrations] = await Promise.all([
    getClient(clientSlug),
    sb.from('visits')
      .select('*, accounts(name, address)')
      .eq('client_slug', clientSlug)
      .order('visited_at', { ascending: false })
      .limit(50),
    sb.from('placements')
      .select('*, accounts(name, address)')
      .eq('client_slug', clientSlug)
      .is('lost_at', null)
      .order('created_at', { ascending: false }),
    sb.from('purchase_orders')
      .select('*')
      .eq('client_slug', clientSlug)
      .gte('created_at', monthStart)
      .order('created_at', { ascending: false }),
    sb.from('events')
      .select('*, accounts(name)')
      .eq('client_slug', clientSlug)
      .gte('start_time', monthStart),
    sb.from('state_registrations')
      .select('*')
      .eq('client_id', clientSlug),
  ])

  return {
    client,
    visits: visits.data || [],
    placements: placements.data || [],
    orders: orders.data || [],
    events: events.data || [],
    registrations: registrations.data || [],
  }
}

// ─── Search ───────────────────────────────────────────────────────────────

export async function globalSearch(query: string) {
  if (!query || query.length < 2) return { accounts: [], contacts: [], clients: [] }
  const sb = getSupabase()
  const q = `%${query}%`

  const [accounts, contacts, clients] = await Promise.all([
    sb.from('accounts').select('id, name, address, account_type').ilike('name', q).limit(5),
    sb.from('contacts').select('id, name, role, accounts(id, name)').ilike('name', q).limit(5),
    sb.from('clients').select('id, name, slug, color, logo_url').ilike('name', q).limit(3),
  ])

  return {
    accounts: accounts.data || [],
    contacts: contacts.data || [],
    clients: clients.data || [],
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
