---
rules:
  - path: "migrations/*.sql"
---

# Database Rules

## Migration Pattern
1. **Filename**: `NNN_descriptive_name.sql` — next is 033
2. **Structure**:
   ```sql
   -- Clear comment explaining what this fixes
   ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...;
   -- Backfill with defensive COALESCE
   UPDATE table_name SET col = COALESCE(new_val, fallback) WHERE condition;
   -- Add indexes
   CREATE INDEX IF NOT EXISTS idx_name ON table(col);
   ```

## Hard Rules
- Never DROP a column — add new ones and migrate data
- Always use `IF NOT EXISTS` / `IF EXISTS` to make migrations re-runnable
- RLS: every new table needs `ENABLE ROW LEVEL SECURITY` + policies using `get_my_role()` and `get_my_client_slug()` helpers (defined in migration 031)
- No raw data mutations without a WHERE clause
- Run in: Supabase Dashboard → SQL Editor

## Indexes for Performance
- Visits: `(account_id, visited_at DESC)`
- Placements: `(client_slug, status, updated_at DESC)`
- Orders: `(client_slug, status, created_at DESC)`
- Contacts: `(account_id, category)`
- Planner: `(user_id, plan_date)`

## CHECK Constraints
Add CHECK constraints for enums:
```sql
ALTER TABLE placements ADD CONSTRAINT check_status
  CHECK (status IN ('committed', 'ordered', 'on_shelf', 'reordering'));
```

## Dates in DB
- **Timestamps**: `TIMESTAMPTZ DEFAULT NOW()` (UTC stored)
- **Date-only**: `DATE` type (no TZ; treated as noon UTC in app)
- **App layer**: Always convert to MT using formatters.ts before display
