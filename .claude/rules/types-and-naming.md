---
rules:
  - path: "**/*.ts"
  - path: "**/*.tsx"
---

# Type Safety & Naming

## Types
- Import from lib/types.ts — never redefine inline
- No `any`; use `unknown` and narrow, or add a proper interface to types.ts
- Dates are always `string` in app code (ISO format); format with lib/formatters.ts

```typescript
import type { Visit, Placement, PurchaseOrder, Client } from '@/lib/types'
```

## Naming Conventions
| Thing | Convention | Example |
|---|---|---|
| Variables | camelCase | `accountName`, `visitStatus` |
| Constants | UPPER_SNAKE | `VISIT_STATUSES`, `MAX_STOPS` |
| Functions | camelCase, verb-first | `createPlacement`, `validateVisit` |
| Components | PascalCase | `VisitLogModal`, `AddAccountModal` |
| DB tables | snake_case | `purchase_orders`, `planner_stops` |
| IDs | `id` or `{entity}_id` | `placement_id`, `client_id` |

## Dates
- Store as `TIMESTAMPTZ` (UTC) or `DATE` in Postgres
- Always type as `string` in TypeScript
- Never store as a number (milliseconds)
- Display with `formatShortDateMT()` from lib/formatters.ts — never raw `.toLocaleDateString()`

## Styling
- Inline `React.CSSProperties` using theme vars from lib/theme.ts
- No CSS files, no Tailwind classes, no styled-components
- All spacing/colors come from the `t` object (`t.text.primary`, `t.border.default`, etc.)
