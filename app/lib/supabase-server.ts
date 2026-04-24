import { createClient } from '@supabase/supabase-js'

// Server-side Supabase admin client — uses service role, bypasses RLS where needed for auth checks
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — add them to Vercel Environment Variables')
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface AuthedUser {
  id: string
  email?: string
  role: string
  client_slug?: string
  name?: string
}

export async function getAuthUserFromRequest(req: Request): Promise<AuthedUser | null> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const sb = getAdmin()
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await sb.from('user_profiles').select('role, client_slug, name').eq('id', user.id).single()
  if (!profile) return null
  return { id: user.id, email: user.email, role: profile.role, client_slug: profile.client_slug, name: profile.name }
}

export function getSupabaseAdmin() {
  return getAdmin()
}
