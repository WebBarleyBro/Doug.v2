import type { VisitStatus, PlacementStatus, PlacementType, TaskPriority, EventType, PipelineStage } from './types'

export const VISIT_STATUSES: VisitStatus[] = [
  'Will Order Soon',
  'Just Ordered',
  'New Placement',
  'Menu Feature Won',
  'Needs Follow Up',
  'Not Interested',
  'General Check-In',
]

export const PLACEMENT_STATUSES: PlacementStatus[] = [
  'committed',
  'ordered',
  'on_shelf',
  'reordering',
]

export const PLACEMENT_STATUS_LABELS: Record<PlacementStatus, string> = {
  committed: 'Committed',
  ordered: 'Ordered',
  on_shelf: 'On Shelf',
  reordering: 'Reordering',
}

export const PLACEMENT_NEXT_STATUS: Record<PlacementStatus, PlacementStatus | null> = {
  committed: 'ordered',
  ordered: 'on_shelf',
  on_shelf: 'reordering',
  reordering: null,
}

export const PLACEMENT_TYPES: PlacementType[] = [
  'well', 'shelf', 'menu', 'cocktail', 'retail', 'seasonal',
]

export const PLACEMENT_TYPE_LABELS: Record<PlacementType, string> = {
  well: 'Well',
  shelf: 'Back Bar / Shelf',
  menu: 'Menu',
  cocktail: 'Cocktail',
  retail: 'Retail',
  seasonal: 'Seasonal',
}

export const TASK_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low']

export const EVENT_TYPES: EventType[] = [
  'tasting', 'brand_dinner', 'meeting', 'planned_stop', 'milestone', 'training', 'other',
]

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  tasting: 'Tasting Event',
  brand_dinner: 'Brand Dinner',
  meeting: 'Meeting',
  planned_stop: 'Planned Stop',
  milestone: 'Milestone',
  training: 'Training',
  other: 'Other',
}

export const PIPELINE_STAGES: PipelineStage[] = [
  'prospect', 'contacted', 'meeting_scheduled', 'proposal_sent', 'negotiating', 'won', 'lost',
]

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  meeting_scheduled: 'Meeting Scheduled',
  proposal_sent: 'Proposal Sent',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
}

export const SPIRIT_CATEGORIES = [
  'Bourbon / Whiskey', 'Vodka', 'Gin', 'Rum', 'Tequila / Mezcal',
  'Brandy / Cognac', 'Liqueur', 'Amaro', 'Ready-to-Drink', 'Other',
]

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

export const FOLLOW_UP_STATUSES = ['not_started', 'contacted', 'waiting', 'closed'] as const

export const ACCOUNT_TYPES = [
  { value: 'on_premise', label: 'On-Premise (Bar / Restaurant)' },
  { value: 'off_premise', label: 'Off-Premise (Liquor Store / Grocery)' },
]

export const OVERDUE_THRESHOLDS = {
  green: 14,   // visited within 14 days
  yellow: 30,  // visited 14-30 days ago
  // red: 30+ days or never visited
}

// ─── Client Logo Fallbacks ─────────────────────────────────────────────────
// Used when logo_url is null in DB (migration 008 populates these permanently)

export const LOGO_FALLBACKS: Record<string, string> = {
  'noco-distillery':        'https://res.cloudinary.com/dhg83nxda/image/upload/v1769094617/NoCo_Distillery_Logo_ynk7uk_e_background_removal_f_png_l1rwrn.png',
  'por-lo-bueno':           'https://res.cloudinary.com/dhg83nxda/image/upload/v1769093535/PLB_Logo_Mezcal_Logo_Skull_Cream_80_gnaxj4.webp',
  'sol-2-noches':           'https://res.cloudinary.com/dhg83nxda/image/upload/v1769094474/Round_S2N_R_logo-03_1_2_1_hitn0a.png',
  'rocky-mountain-moonshine':'https://res.cloudinary.com/dhg83nxda/image/upload/v1769094769/8da5b56cb_RockyMountainMoonshine_mlogku.png',
}

export function clientLogoUrl(client: { slug: string; logo_url?: string | null }): string | null {
  return client.logo_url || LOGO_FALLBACKS[client.slug] || null
}
