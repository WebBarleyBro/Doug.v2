import { getAuthUserFromRequest, getSupabaseAdmin } from '../../../lib/supabase-server'

// GET  /api/billing/invoices?client_slug=X  — list invoices (internal) or own (portal)
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

  const sb = getSupabaseAdmin()

  // Check for duplicate invoice for same client + month
  const { data: existing } = await sb
    .from('client_invoices')
    .select('id, status')
    .eq('client_slug', client_slug)
    .eq('period_month', period_month)
    .not('status', 'eq', 'void')
    .single()
  if (existing) {
    return Response.json({ error: `Invoice for ${period_month} already exists (status: ${existing.status})`, existing_id: existing.id }, { status: 409 })
  }

  const { data: invoice, error } = await sb.from('client_invoices').insert({
    client_slug,
    period_month,
    status: 'draft',
    retainer_amount: retainer_amount ?? 0,
    commission_amount: commission_amount ?? 0,
    admin_notes: admin_notes || null,
    due_date: due_date || null,
  }).select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Insert line items
  if (line_items?.length) {
    const items = line_items.map((li: any) => ({
      invoice_id: invoice.id,
      description: li.description,
      amount: li.amount,
      type: li.type || 'other',
    }))
    const { error: liErr } = await sb.from('client_invoice_line_items').insert(items)
    if (liErr) return Response.json({ error: liErr.message }, { status: 500 })
  }

  // Mark any pending depletions for this client/month as linked to this invoice
  if (commission_amount > 0) {
    await sb.from('billing_depletions')
      .update({ invoice_id: invoice.id })
      .eq('client_slug', client_slug)
      .eq('period_month', period_month)
      .is('invoice_id', null)
  }

  return Response.json(invoice, { status: 201 })
}
