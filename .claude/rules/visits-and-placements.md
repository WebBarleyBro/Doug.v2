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

## Placement Status Flow
```
committed → ordered → on_shelf → reordering
                ↘ lost_at (not a status — it's a timestamp; set on any transition to "lost")
```
- Never add a `lost` status value — loss is tracked via `lost_at` + `lost_reason` columns
- Advance with `updatePlacement(id, { status: 'next' })`
- Mark lost with `markPlacementLost(id, reason)` which sets `lost_at = now()`

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
