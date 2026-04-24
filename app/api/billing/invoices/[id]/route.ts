import { getAuthUserFromRequest, getSupabaseAdmin } from '../../../../lib/supabase-server'

// PATCH /api/billing/invoices/[id] — update draft invoice (owner/admin only)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getAuthUserFromRequest(req)
    if (!user || !['owner', 'admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sb = getSupabaseAdmin()
    const { data: invoice } = await sb.from('client_invoices').select('id, status').eq('id', id).single()
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

    const { data, error } = await sb.from('client_invoices').update(allowed).eq('id', id).select().single()
    if (error) return Response.json({ error: error.message }, { status: 500 })

    if (body.line_items !== undefined) {
      await sb.from('client_invoice_line_items').delete().eq('invoice_id', id)
      if (body.line_items?.length) {
        const items = body.line_items.map((li: any) => ({
          invoice_id: id,
          description: li.description,
          amount: li.amount,
          type: li.type || 'other',
        }))
        await sb.from('client_invoice_line_items').insert(items)
      }
    }

    return Response.json(data)
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

// DELETE /api/billing/invoices/[id] — void an invoice
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getAuthUserFromRequest(req)
    if (!user || !['owner', 'admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sb = getSupabaseAdmin()
    const { data: invoice } = await sb.from('client_invoices').select('id, status, stripe_invoice_id').eq('id', id).single()
    if (!invoice) return Response.json({ error: 'Not found' }, { status: 404 })
    if (invoice.status === 'paid') return Response.json({ error: 'Cannot void a paid invoice' }, { status: 409 })

    if (invoice.stripe_invoice_id && invoice.status === 'sent') {
      try {
        const { getStripe } = await import('../../../../lib/stripe')
        await getStripe().invoices.voidInvoice(invoice.stripe_invoice_id)
      } catch {
        // non-fatal — still mark void in our DB
      }
    }

    await sb.from('billing_depletions').update({ invoice_id: null }).eq('invoice_id', id)

    const { error } = await sb.from('client_invoices').update({ status: 'void', updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
