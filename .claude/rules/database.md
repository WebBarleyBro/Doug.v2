---
rules:
  - path: "migrations/*.sql"
---

# Database Rules

## Migration Pattern
1. **Filename**: `NNN_descriptive_name.sql` — next is 032
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
