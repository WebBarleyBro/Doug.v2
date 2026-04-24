import { getAuthUserFromRequest, getSupabaseAdmin } from '../../../../../lib/supabase-server'
import { getStripe } from '../../../../../lib/stripe'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: invoiceId } = await params

    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json({ error: 'Stripe is not configured — add STRIPE_SECRET_KEY to environment variables' }, { status: 503 })
    }

    const stripe = getStripe()
    const user = await getAuthUserFromRequest(req)
    if (!user || !['owner', 'admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sb = getSupabaseAdmin()

    const { data: invoice, error: invErr } = await sb
      .from('client_invoices')
      .select('*, client_invoice_line_items(*)')
      .eq('id', invoiceId)
      .single()
    if (invErr || !invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 })
    if (invoice.status === 'paid') return Response.json({ error: 'Invoice is already paid' }, { status: 409 })
    if (invoice.status === 'void') return Response.json({ error: 'Invoice has been voided' }, { status: 409 })

    const { data: client, error: clientErr } = await sb
      .from('clients')
      .select('id, name, contact_email, stripe_customer_id')
      .eq('slug', invoice.client_slug)
      .single()
    if (clientErr || !client) return Response.json({ error: 'Client not found' }, { status: 404 })
    if (!client.contact_email) {
      return Response.json({ error: `${invoice.client_slug} has no contact email — add one in the client record before sending` }, { status: 422 })
    }

    // Ensure Stripe Customer exists
    let stripeCustomerId: string = client.stripe_customer_id || ''
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: client.name,
        email: client.contact_email,
        metadata: { client_slug: invoice.client_slug, barley_client_id: client.id },
      })
      stripeCustomerId = customer.id
      await sb.from('clients').update({ stripe_customer_id: stripeCustomerId }).eq('id', client.id)
    }

    // Build line items
    const lineItems: { description: string; amount: number }[] =
      invoice.client_invoice_line_items?.length
        ? invoice.client_invoice_line_items.map((li: any) => ({ description: li.description, amount: li.amount }))
        : [
            ...(invoice.retainer_amount > 0 ? [{ description: `Monthly retainer — ${invoice.period_month}`, amount: invoice.retainer_amount }] : []),
            ...(invoice.commission_amount > 0 ? [{ description: `Commission earned — ${invoice.period_month}`, amount: invoice.commission_amount }] : []),
          ]

    if (!lineItems.length) {
      return Response.json({ error: 'Invoice has no amounts — add a retainer or commission before sending' }, { status: 422 })
    }

    let stripeInvoice: any

    if (invoice.stripe_invoice_id) {
      stripeInvoice = await stripe.invoices.retrieve(invoice.stripe_invoice_id)
      if (stripeInvoice.status === 'draft') {
        stripeInvoice = await stripe.invoices.finalizeInvoice(invoice.stripe_invoice_id, { auto_advance: false })
        await stripe.invoices.sendInvoice(invoice.stripe_invoice_id)
      }
    } else {
      let daysUntilDue = 14
      if (invoice.due_date) {
        const dueMs = new Date(invoice.due_date).getTime()
        if (!isNaN(dueMs)) {
          daysUntilDue = Math.max(1, Math.ceil((dueMs - Date.now()) / 86400000))
        }
      }

      stripeInvoice = await stripe.invoices.create({
        customer: stripeCustomerId,
        collection_method: 'send_invoice',
        days_until_due: daysUntilDue,
        metadata: { invoice_id: invoice.id, period_month: invoice.period_month, client_slug: invoice.client_slug },
        ...(invoice.admin_notes ? { description: invoice.admin_notes } : {}),
      })

      try {
        for (const li of lineItems) {
          await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            invoice: stripeInvoice.id,
            description: li.description,
            amount: Math.round(li.amount * 100),
            currency: 'usd',
          })
        }
      } catch (itemErr: any) {
        await stripe.invoices.del(stripeInvoice.id).catch(() => {})
        return Response.json({ error: `Failed to add line items: ${itemErr.message}` }, { status: 500 })
      }

      stripeInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id, { auto_advance: false })
      await stripe.invoices.sendInvoice(stripeInvoice.id)
      stripeInvoice = await stripe.invoices.retrieve(stripeInvoice.id)
    }

    const { data: updated, error: updateErr } = await sb.from('client_invoices').update({
      stripe_invoice_id: stripeInvoice.id,
      stripe_invoice_url: stripeInvoice.hosted_invoice_url,
      stripe_pdf_url: stripeInvoice.invoice_pdf,
      status: 'sent',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', invoice.id).select().single()

    if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 })
    return Response.json(updated)
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
