import type { VisitStatus, PlacementStatus, PlacementType } from './types'

const VISIT_STATUSES: VisitStatus[] = [
  'Will Order Soon',
  'Just Ordered',
  'Needs Follow Up',
  'Not Interested',
  'Menu Feature Won',
  'New Placement',
  'General Check-In',
]

const PLACEMENT_STATUSES: PlacementStatus[] = [
  'committed',
  'ordered',
  'on_shelf',
  'reordering',
]

const PLACEMENT_TYPES: PlacementType[] = [
  'well',
  'shelf',
  'menu',
  'cocktail',
  'retail',
  'seasonal',
]

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

function ok(): ValidationResult {
  return { valid: true, errors: [] }
}

function fail(errors: ValidationError[]): ValidationResult {
  return { valid: false, errors }
}

// ─── Visit ────────────────────────────────────────────────────────────────────

export interface ValidateVisitInput {
  account_id?: string
  visited_at?: string
  status?: string
  client_slugs?: string[]
}

export function validateVisit(input: ValidateVisitInput): ValidationResult {
  const errors: ValidationError[] = []

  if (!input.account_id?.trim()) {
    errors.push({ field: 'account_id', message: 'Account is required' })
  }

  if (!input.visited_at) {
    errors.push({ field: 'visited_at', message: 'Visit date is required' })
  } else if (isNaN(Date.parse(input.visited_at))) {
    errors.push({ field: 'visited_at', message: 'Visit date is invalid' })
  }

  if (!input.status) {
    errors.push({ field: 'status', message: 'Status is required' })
  } else if (!VISIT_STATUSES.includes(input.status as VisitStatus)) {
    errors.push({ field: 'status', message: `Invalid status: ${input.status}` })
  }

  if (!input.client_slugs || input.client_slugs.length === 0) {
    errors.push({ field: 'client_slugs', message: 'At least one brand is required' })
  }

  return errors.length ? fail(errors) : ok()
}

// ─── Placement ────────────────────────────────────────────────────────────────

export interface ValidatePlacementInput {
  account_id?: string
  client_slug?: string
  product_name?: string
  placement_type?: string
  status?: string
  price_point?: number
}

export function validatePlacement(input: ValidatePlacementInput): ValidationResult {
  const errors: ValidationError[] = []

  if (!input.account_id?.trim()) {
    errors.push({ field: 'account_id', message: 'Account is required' })
  }

  if (!input.client_slug?.trim()) {
    errors.push({ field: 'client_slug', message: 'Brand is required' })
  }

  if (!input.product_name?.trim()) {
    errors.push({ field: 'product_name', message: 'Product name is required' })
  }

  if (!input.placement_type) {
    errors.push({ field: 'placement_type', message: 'Placement type is required' })
  } else if (!PLACEMENT_TYPES.includes(input.placement_type as PlacementType)) {
    errors.push({ field: 'placement_type', message: `Invalid placement type: ${input.placement_type}` })
  }

  if (input.status && !PLACEMENT_STATUSES.includes(input.status as PlacementStatus)) {
    errors.push({ field: 'status', message: `Invalid status: ${input.status}` })
  }

  if (input.price_point !== undefined && (isNaN(input.price_point) || input.price_point < 0)) {
    errors.push({ field: 'price_point', message: 'Price must be a positive number' })
  }

  return errors.length ? fail(errors) : ok()
}
