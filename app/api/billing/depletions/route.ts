import { getAuthUserFromRequest, getSupabaseAdmin } from '../../../lib/supabase-server'

// GET /api/billing/depletions?client_slug=X&month=YYYY-MM
export async function GET(req: Request) {
  try {
    const user = await getAuthUserFromRequest(req)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const clientSlug = url.searchParams.get('client_slug')
    const month = url.searchParams.get('month')

    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return Response.json({ error: 'month must be YYYY-MM format' }, { status: 400 })
    }

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

    const { data, error } = await q.limit(200)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json(data)
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

// POST /api/billing/depletions — submit depletion report
export async function POST(req: Request) {
  try {
    const user = await getAuthUserFromRequest(req)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { client_slug, product_name, period_month, cases_sold, sale_value, notes } = body

    if (!client_slug || !product_name?.trim() || !period_month) {
      return Response.json({ error: 'client_slug, product_name, and period_month are required' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(period_month)) {
      return Response.json({ error: 'period_month must be YYYY-MM format' }, { status: 400 })
    }

    if (user.role === 'portal' && user.client_slug !== client_slug) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const casesNum = Math.max(0, Number(cases_sold) || 0)
    const saleNum = Math.max(0, Number(sale_value) || 0)

    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from('billing_depletions').insert({
      client_slug,
      product_name: product_name.trim(),
      period_month,
      cases_sold: casesNum,
      sale_value: saleNum,
      notes: notes?.trim() || null,
      submitted_by: user.id,
      submitted_by_portal: user.role === 'portal',
    }).select().single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json(data, { status: 201 })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
