---
rules:
  - path: "app/lib/commission.ts"
  - path: "app/finance/**/*.tsx"
---

# Commission Rules

## Calculation (Immutable)
```
commission_amount = total_amount × client.commission_rate
Eligible statuses: 'sent' | 'fulfilled'
```
- Draft, cancelled, and null-status orders earn $0 commission
- Never default to 0 silently — throw if commission_rate is missing for a client

## App-Layer Calculation
```typescript
export function getCommissionAmount(order, rateByClientSlug) {
  if (!isCommissionEligible(order.status)) return 0
  const rate = rateByClientSlug[order.client_slug]
  if (rate === undefined) throw new Error(`Missing commission rate for ${order.client_slug}`)
  return Math.round((order.total_amount || 0) * rate * 100) / 100
}
```

## Resolving Totals
Use `resolveTotal(order)` from lib/formatters.ts — it sums `po_line_items` if present,
falls back to `total_amount`. Never read `total_amount` directly in display code.

## Chart Data
Finance and analytics charts use `getOrders()` (includes `po_line_items`), NOT
`getCommissionTrend()`. The trend function lacks line items and will show $0 for most orders.

## Backfill Pattern (migrations only)
```sql
UPDATE purchase_orders po
SET commission_amount = ROUND(
  COALESCE(po.total_amount, 0) * COALESCE(c.commission_rate, 0), 2
)
FROM clients c
WHERE c.slug = po.client_slug
  AND (po.commission_amount IS NULL OR po.commission_amount = 0)
  AND COALESCE(po.total_amount, 0) > 0
  AND po.status IN ('sent', 'fulfilled');
```
