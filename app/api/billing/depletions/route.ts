import { getAuthUserFromRequest, getSupabaseAdmin } from '../../../lib/supabase-server'

// GET /api/billing/depletions?client_slug=X&month=YYYY-MM
export async function GET(req: Request) {
  const user = await getAuthUserFromRequest(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const clientSlug = url.searchParams.get('client_slug')
  const month = url.searchParams.get('month')
  const sb = getSupabaseAdmin()

  let q = sb
    .from('billing_depletions')
    .select('*')
    .order('created_at', { ascending: false })

  if (user.role === 'portal') {
    if (!user.client_slug) return Response.json({ error: 'Forbidden' }, { status: 403 })
    q = q.eq('client_slug', user.client_slug)
  } else if (!['owner', 'admin', 'rep'].includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  } else if (clientSlug) {
    q = q.eq('client_slug', clientSlug)
  }

  if (month) q = q.eq('period_month', month)

  const { data, error } = await q.limit(100)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

// POST /api/billing/depletions — submit depletion report
export async function POST(req: Request) {
  const user = await getAuthUserFromRequest(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { client_slug, product_name, period_month, cases_sold, sale_value, notes } = body

  if (!client_slug || !product_name || !period_month) {
    return Response.json({ error: 'client_slug, product_name, and period_month are required' }, { status: 400 })
  }

  // Portal users can only submit for their own client
  if (user.role === 'portal' && user.client_slug !== client_slug) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('billing_depletions').insert({
    client_slug,
    product_name,
    period_month,
    cases_sold: cases_sold ?? 0,
    sale_value: sale_value ?? 0,
    notes: notes || null,
    submitted_by: user.id,
    submitted_by_portal: user.role === 'portal',
  }).select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
