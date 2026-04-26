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
