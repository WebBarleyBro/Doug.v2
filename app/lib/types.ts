// Core entity types — all derived from Supabase schema

export type UserRole = 'owner' | 'rep' | 'intern' | 'portal'

export interface UserProfile {
  id: string
  email: string
  name: string
  role: UserRole
  avatar_url?: string
  client_slug?: string // for portal users
}

// ─── Clients (brands) ──────────────────────────────────────────────────────

export interface Client {
  id: string
  name: string
  slug: string
  commission_rate: number
  color: string
  logo_url?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  address?: string
  territory?: string
  distributor_name?: string
  distributor_rep_id?: string
  order_type: 'direct' | 'distributor'
  since_date?: string
  active: boolean
  notes?: string
  category?: string
  state?: string
  created_at: string
}

// ─── Accounts (venues) ────────────────────────────────────────────────────

export type AccountType = 'on_premise' | 'off_premise'

export interface Account {
  id: string
  name: string
  address?: string
  phone?: string
  account_type: AccountType
  visit_frequency_days: number
  last_visited?: string
  notes?: string
  created_at: string
  // joined
  account_clients?: AccountClient[]
  contacts?: Contact[]
}

export interface AccountClient {
  account_id: string
  client_slug: string
}

export interface Contact {
  id: string
  account_id?: string
  client_slug?: string
  name: string
  role?: string
  category?: string
  email?: string
  phone?: string
  notes?: string
  is_decision_maker?: boolean
  created_at: string
  // joined
  accounts?: { id: string; name: string }
}

// ─── Visits ───────────────────────────────────────────────────────────────

export type VisitStatus =
  | 'Will Order Soon'
  | 'Just Ordered'
  | 'Needs Follow Up'
  | 'Not Interested'
  | 'Menu Feature Won'
  | 'New Placement'
  | 'General Check-In'

export interface Visit {
  id: string
  account_id: string
  user_id: string
  client_slug?: string
  client_id?: string
  visited_at: string
  status: VisitStatus
  notes?: string
  tasting_notes?: string
  feedback?: string
  photo_urls?: string[]
  created_at: string
  // joined
  accounts?: Pick<Account, 'id' | 'name' | 'address' | 'account_type'>
  user_profiles?: Pick<UserProfile, 'id' | 'name'>
}

// ─── Placements ───────────────────────────────────────────────────────────

export type PlacementType = 'well' | 'shelf' | 'menu' | 'cocktail' | 'retail' | 'seasonal'
export type PlacementStatus = 'committed' | 'ordered' | 'on_shelf' | 'reordering'

export interface Placement {
  id: string
  account_id: string
  client_slug?: string
  client_id?: string
  product_name: string
  placement_type: PlacementType
  status: PlacementStatus
  shelf_date?: string
  price_point?: number
  lost_at?: string
  lost_reason?: string
  created_at: string
  // joined
  accounts?: Pick<Account, 'id' | 'name' | 'address'>
}

// ─── Orders ───────────────────────────────────────────────────────────────

export type OrderStatus = 'draft' | 'sent' | 'fulfilled' | 'cancelled'
export type FollowUpStatus = 'not_started' | 'contacted' | 'waiting' | 'closed'

export interface PurchaseOrder {
  id: string
  client_slug?: string
  client_id?: string
  client_name?: string
  account_id?: string
  deliver_to_name: string
  deliver_to_address?: string
  deliver_to_phone?: string
  po_number: string
  order_type?: 'direct' | 'distributor'
  status: OrderStatus
  total_amount: number
  commission_amount: number
  follow_up_status: FollowUpStatus
  distributor_email?: string
  distributor_rep_name?: string
  email_draft?: string
  email_sent?: boolean
  last_resent_at?: string
  last_resent_to?: string
  notes?: string
  created_at: string
  sent_at?: string
  // joined
  po_line_items?: POLineItem[]
  accounts?: { id: string; name: string }
}

export interface POLineItem {
  id: string
  po_id: string
  product_name: string
  quantity: number
  price: number
  total: number
}


// ─── Tasks ───────────────────────────────────────────────────────────────

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  user_id?: string
  assigned_to?: string
  title: string
  description?: string
  priority: TaskPriority
  due_date?: string
  completed: boolean
  completed_at?: string
  account_id?: string
  client_slug?: string
  created_at: string
  // joined
  accounts?: Pick<Account, 'id' | 'name'>
}

// ─── Events ──────────────────────────────────────────────────────────────

export type EventType = 'tasting' | 'meeting' | 'planned_stop' | 'milestone' | 'training' | 'other'
export type EventStatus = 'planned' | 'completed' | 'cancelled'

export interface Event {
  id: string
  title: string
  account_id?: string
  client_slug?: string
  client_id?: string
  event_type: EventType
  start_time: string
  end_time?: string
  notes?: string
  status: EventStatus
  created_at: string
  // joined
  accounts?: Pick<Account, 'id' | 'name' | 'address'>
}

// ─── Campaigns ───────────────────────────────────────────────────────────

export type CampaignStatus = 'active' | 'completed' | 'paused' | 'draft'

export interface Campaign {
  id: string
  client_slug?: string
  client_id?: string
  name?: string
  title: string
  campaign_type?: string
  description?: string
  budget?: number
  start_date?: string
  end_date?: string
  status: CampaignStatus
  notes?: string
  created_at: string
  // joined
  campaign_milestones?: CampaignMilestone[]
  clients?: Pick<Client, 'id' | 'name' | 'color'>
}

export interface CampaignMilestone {
  id: string
  campaign_id: string
  title: string
  due_date?: string
  completed: boolean
  completed_at?: string
}

// ─── Products ────────────────────────────────────────────────────────────

export interface Product {
  id: string
  client_slug: string
  name: string
  category?: string
  sku?: string
  price?: number       // price per case
  active: boolean
}

// ─── New tables ──────────────────────────────────────────────────────────

export interface StateRegistration {
  id: string
  client_id: string
  state: string
  status: 'active' | 'pending' | 'expired' | 'not_registered'
  ttb_number?: string
  expiry_date?: string
  label_approval_status?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface CompetitiveSighting {
  id: string
  account_id: string
  visit_id?: string
  brand_name: string
  product_name?: string
  placement_type?: PlacementType
  notes?: string
  sighted_at: string
}

export interface DepletionEntry {
  id: string
  placement_id: string
  account_id: string
  client_id?: string
  period_month: string
  cases_sold: number
  notes?: string
  entered_by?: string
  created_at: string
}

export interface TastingConsumer {
  id: string
  event_id: string
  client_id?: string
  email?: string
  first_name?: string
  product_rated?: string
  rating?: number
  would_buy?: boolean
  notes?: string
  opted_in_marketing: boolean
  captured_at: string
}

export type PipelineStage = 'prospect' | 'contacted' | 'meeting_scheduled' | 'proposal_sent' | 'negotiating' | 'won' | 'lost'

export interface AgencyPipeline {
  id: string
  brand_name: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  spirit_category?: string
  stage: PipelineStage
  estimated_value?: number
  notes?: string
  next_action?: string
  next_action_date?: string
  lost_reason?: string
  created_at: string
  updated_at: string
}

// ─── Analytics types ────────────────────────────────────────────────────

export interface DateRange {
  start: Date
  end: Date
}

export interface VisitTrendPoint {
  week: string
  total: number
  [clientSlug: string]: number | string
}

export interface RepActivityRow {
  user_id: string
  name: string
  visits: number
  placements: number
  accounts_covered: number
  followups_completed: number
  followups_total: number
}

export interface BrandHealthScore {
  client: Client
  score: number
  visit_score: number
  placement_score: number
  order_score: number
  event_score: number
  trend: number
}

export interface CommissionForecast {
  client_slug: string
  active_placements: number
  avg_orders_per_placement_per_90d: number
  avg_order_value: number
  commission_rate: number
  forecast_90d: number
}
