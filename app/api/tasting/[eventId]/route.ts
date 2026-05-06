import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../lib/supabase-server'

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const sb = getSupabaseAdmin()

  const { data: event, error: eventErr } = await sb.from('events').select('*').eq('id', eventId).single()
  if (eventErr) console.error('tasting API: event fetch error', eventErr)
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let accountName: string | null = null
  if (event.account_id) {
    const { data: acct } = await sb.from('accounts').select('name').eq('id', event.account_id).single()
    accountName = acct?.name ?? null
  }

  let client = null
  let products: any[] = []
  if (event.client_slug) {
    const [{ data: cl }, { data: prods }] = await Promise.all([
      sb.from('clients').select('id, name, slug, color, logo_url').eq('slug', event.client_slug).single(),
      sb.from('products').select('id, name, category').eq('client_slug', event.client_slug).eq('active', true).order('name'),
    ])
    client = cl
    products = prods || []
  }

  return NextResponse.json({
    event: { ...event, accounts: accountName ? { name: accountName } : null },
    client,
    products,
  })
}
