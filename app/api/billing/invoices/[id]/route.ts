import { getAuthUserFromRequest, getSupabaseAdmin } from '../../../../lib/supabase-server'

// PATCH /api/billing/invoices/[id] — update draft invoice (owner/admin only)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUserFromRequest(req)
  if (!user || !['owner', 'admin'].includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = getSupabaseAdmin()
  const { data: invoice } = await sb.from('client_invoices').select('id, status').eq('id', params.id).single()
  if (!invoice) return Response.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status === 'paid' || invoice.status === 'void') {
    return Response.json({ error: `Cannot edit a ${invoice.status} invoice` }, { status: 409 })
  }

  const body = await req.json()
  const allowed: Record<string, any> = {}
  for (const k of ['retainer_amount', 'commission_amount', 'admin_notes', 'due_date', 'status']) {
    if (k in body) allowed[k] = body[k]
  }
  allowed.updated_at = new Date().toISOString()

  const { data, error } = await sb.from('client_invoices').update(allowed).eq('id', params.id).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Replace line items if provided
  if (body.line_items !== undefined) {
    await sb.from('client_invoice_line_items').delete().eq('invoice_id', params.id)
    if (body.line_items?.length) {
      const items = body.line_items.map((li: any) => ({
        invoice_id: params.id,
        description: li.description,
        amount: li.amount,
        type: li.type || 'other',
      }))
      await sb.from('client_invoice_line_items').insert(items)
    }
  }

  return Response.json(data)
}

// DELETE /api/billing/invoices/[id] — void an invoice
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUserFromRequest(req)
  if (!user || !['owner', 'admin'].includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = getSupabaseAdmin()
  const { data: invoice } = await sb.from('client_invoices').select('id, status, stripe_invoice_id').eq('id', params.id).single()
  if (!invoice) return Response.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status === 'paid') return Response.json({ error: 'Cannot void a paid invoice' }, { status: 409 })

  // If already sent to Stripe, void it there too
  if (invoice.stripe_invoice_id && invoice.status === 'sent') {
    try {
      const { stripe } = await import('../../../../lib/stripe')
      await stripe.invoices.voidInvoice(invoice.stripe_invoice_id)
    } catch {
      // non-fatal — still mark void in our DB
    }
  }

  // Release any linked depletions so they can be included in a future invoice
  await sb.from('billing_depletions').update({ invoice_id: null }).eq('invoice_id', params.id)

  const { error } = await sb.from('client_invoices').update({ status: 'void', updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
