---
rules:
  - path: "app/**/*.tsx"
    if: "logVisit|createPlacement|VisitLogModal"
---

# Visits & Placements Rules

## Visit Logging
- **One visit per account per day** (dedup by visited_at + account_id + user_id)
- **Multi-brand support**: One API call creates N visits (one per brand)
- **Status enum**: 7 statuses defined in lib/types.ts (Will Order Soon, Just Ordered, etc.)
- **Deduplication**: On dashboard, group by `(account_id, visited_at, user_id)` → one row

**Example: Rep visits "NoCo Bar" with 2 brands**
```typescript
await logVisit({
  account_id: 'acc-123',
  client_slugs: ['noco-distillery', 'por-lo-bueno'],
  status: 'Will Order Soon', // same for both
  notes: 'Great energy, interested in feature',
})
// Creates 2 rows in visits table (one per brand)
// But displays as 1 visit on dashboard
```

## Placement Status Flow
```
committed → ordered → on_shelf → reordering
                ↘ lost_at (not a status — it's a timestamp; set on any transition to "lost")
```
- **committed**: Agreement, no order yet
- **ordered**: PO sent/received
- **on_shelf**: Product visible at venue
- **reordering**: Repeat orders (ongoing)
- Never add a `lost` status value — loss is tracked via `lost_at` + `lost_reason` columns
- Advance with `updatePlacement(id, { status: 'next' })`
- Mark lost with `markPlacementLost(id, reason)` which sets `lost_at = now()`

## Validation
- Visit date cannot be in the future
- Account must exist before logging a visit
- Status must be one of the 7 enums in lib/types.ts
- Use `validateVisit()` from lib/validators.ts before every submit

## Call Pattern
```typescript
import { logVisit, createPlacement } from '@/lib/data'
import { validateVisit } from '@/lib/validators'

const result = validateVisit({ account_id, visited_at, status, client_slugs })
if (!result.valid) return // show result.errors to user

await logVisit(...)
```
