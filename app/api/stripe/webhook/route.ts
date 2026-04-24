import { getStripe } from '../../../lib/stripe'
import { getSupabaseAdmin } from '../../../lib/supabase-server'

// Stripe sends raw bodies — must use req.text(), not req.json()
export async function POST(req: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const stripe = getStripe()
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!sig) return Response.json({ error: 'Missing stripe-signature' }, { status: 400 })

  let event: any
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    return Response.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  switch (event.type) {
    case 'invoice.paid': {
      const inv = event.data.object
      const invoiceId = inv.metadata?.invoice_id
      if (!invoiceId) break
      await sb.from('client_invoices').update({
        status: 'paid',
        paid_at: inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
          : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', invoiceId)
      break
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object
      const invoiceId = inv.metadata?.invoice_id
      if (!invoiceId) break
      await sb.from('client_invoices').update({
        status: 'overdue',
        updated_at: new Date().toISOString(),
      }).eq('id', invoiceId)
      break
    }

    case 'invoice.voided':
    case 'invoice.marked_uncollectible': {
      const inv = event.data.object
      const invoiceId = inv.metadata?.invoice_id
      if (!invoiceId) break
      await sb.from('client_invoices').update({
        status: 'void',
        updated_at: new Date().toISOString(),
      }).eq('id', invoiceId)
      // Release linked depletions so they can be re-invoiced
      await sb.from('billing_depletions').update({ invoice_id: null }).eq('invoice_id', invoiceId)
      break
    }
  }

  return Response.json({ received: true })
}
