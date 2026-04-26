---
rules:
  - path: "app/lib/validators.ts"
  - path: "app/**/*.tsx"
---

# Validation & Error Handling

## Validator Pattern
Use `validateVisit()` / `validatePlacement()` from lib/validators.ts before every DB write.
They return `{ valid: boolean, errors: ValidationError[] }` — never throw.

```typescript
const result = validateVisit({ account_id, visited_at, status, client_slugs })
if (!result.valid) {
  // result.errors[0].field  → which field failed
  // result.errors[0].message → what to show the user
  return
}
await logVisit(...)
```

## What to Validate
- **Visits**: date not in future, account exists, status is valid enum, ≥1 brand
- **Orders**: ≥1 line item, total ≥ 0, account exists
- **Accounts**: name required, visit_frequency_days ≥ 1,
  best_days only contains valid day names (Monday–Sunday)
- **Placements**: account + brand + product required, status is valid enum

## Error Logging
Log unexpected errors to console; never swallow them silently:
```typescript
try {
  await createPlacement(...)
} catch (err: any) {
  console.error('placement.create', err)
  // show user-facing toast
}
```

## API Error Shape
All API routes return the same error shape:
```typescript
return NextResponse.json(
  { error: err.message, code: 'INTERNAL_ERROR' },
  { status: 500 }
)
```

## Never Silently Default
- Missing commission rate → throw, don't return 0
- Missing account → throw, don't return null
- Invalid status → throw, don't coerce to a default
