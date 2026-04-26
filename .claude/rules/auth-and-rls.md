---
rules:
  - path: "middleware.ts"
  - path: "app/lib/supabase-server.ts"
  - path: "app/api/**/*.ts"
---

# Auth & RLS Rules

## User Roles (stored in user_profiles.role)
- `owner` → Full access
- `admin` → Staff, can manage reps and clients
- `rep` → Field rep, sees own + team data
- `intern` → Task/asset workflow only
- `portal` → Brand client, read-only portal scoped to their client_slug

## Middleware
- `/login`, `/portal`, `/taste`, `/_next`, `/api`, and static files are public paths
- All other routes require an authenticated session
- Auth is validated via `supabase.auth.getUser()` (not `getSession()`)

## API Route Auth Pattern
Every API route that touches data must verify the user:
```typescript
import { getAuthUserFromRequest } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const { user, profile } = await getAuthUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // use profile.role and profile.client_slug for authz
}
```

## RLS Policy Helpers (defined in migration 031)
All policies use these two SECURITY DEFINER functions — do not inline user_profiles
subqueries directly into policies (causes recursion):
- `get_my_role()` → returns the calling user's role
- `get_my_client_slug()` → returns the calling user's client_slug

## Service Role Client
`getSupabaseAdmin()` from lib/supabase-server.ts bypasses RLS entirely.
Only use it in server-side API routes, never in client components or data.ts.

## No Billing Auth
Billing is handled externally — there are no invoice/payment auth patterns needed.
