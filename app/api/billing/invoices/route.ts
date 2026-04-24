import { getAuthUserFromRequest, getSupabaseAdmin } from '../../../lib/supabase-server'

// GET  /api/billing/invoices?client_slug=X  — list invoices
export async function GET(req: Request) {
  const user = await getAuthUserFromRequest(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const clientSlug = url.searchParams.get('client_slug')
  const sb = getSupabaseAdmin()

  let q = sb
    .from('client_invoices')
    .select('*, client_invoice_line_items(*)')
    .order('created_at', { ascending: false })

  if (user.role === 'portal') {
    if (!user.client_slug) return Response.json({ error: 'Forbidden' }, { status: 403 })
    q = q.eq('client_slug', user.client_slug)
  } else if (!['owner', 'admin', 'rep'].includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  } else if (clientSlug) {
    q = q.eq('client_slug', clientSlug)
  }

  const { data, error } = await q.limit(50)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

// POST /api/billing/invoices — create a draft invoice (owner/admin only)
export async function POST(req: Request) {
  const user = await getAuthUserFromRequest(req)
  if (!user || !['owner', 'admin'].includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { client_slug, period_month, retainer_amount, commission_amount, admin_notes, due_date, line_items } = body

  if (!client_slug || !period_month) {
    return Response.json({ error: 'client_slug and period_month are required' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}$/.test(period_month)) {
    return Response.json({ error: 'period_month must be YYYY-MM format' }, { status: 400 })
  }
  const retainer = Math.max(0, Number(retainer_amount) || 0)
  const commission = Math.max(0, Number(commission_amount) || 0)

  const sb = getSupabaseAdmin()

  // Duplicate check
  const { data: existing } = await sb
    .from('client_invoices')
    .select('id, status')
    .eq('client_slug', client_slug)
    .eq('period_month', period_month)
    .not('status', 'eq', 'void')
    .maybeSingle()
  if (existing) {
    return Response.json(
      { error: `Invoice for ${period_month} already exists (status: ${existing.status})`, existing_id: existing.id },
      { status: 409 },
    )
  }

  const { data: invoice, error } = await sb.from('client_invoices').insert({
    client_slug,
    period_month,
    status: 'draft',
    retainer_amount: retainer,
    commission_amount: commission,
    admin_notes: admin_notes || null,
    due_date: due_date || null,
  }).select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Insert line items — if this fails, clean up the invoice
  if (line_items?.length) {
    const items = line_items.map((li: any) => ({
      invoice_id: invoice.id,
      description: String(li.description || '').trim(),
      amount: Math.max(0, Number(li.amount) || 0),
      type: ['retainer', 'commission', 'other'].includes(li.type) ? li.type : 'other',
    })).filter((li: any) => li.description)

    const { error: liErr } = await sb.from('client_invoice_line_items').insert(items)
    if (liErr) {
      // Roll back the invoice
      await sb.from('client_invoices').delete().eq('id', invoice.id)
      return Response.json({ error: 'Failed to save line items' }, { status: 500 })
    }
  }

  // Link pending depletions for this client/month
  if (commission > 0) {
    await sb.from('billing_depletions')
      .update({ invoice_id: invoice.id })
      .eq('client_slug', client_slug)
      .eq('period_month', period_month)
      .is('invoice_id', null)
  }

  return Response.json(invoice, { status: 201 })
}
