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

  // Collect all brand slugs — prefer the array, fall back to single slug
  const rawSlugs: string[] = Array.isArray(event.client_slugs) && event.client_slugs.length > 0
    ? event.client_slugs
    : event.client_slug ? [event.client_slug] : []

  const brands: any[] = []
  for (const slug of rawSlugs) {
    const [{ data: cl }, { data: prods }] = await Promise.all([
      sb.from('clients').select('id, name, slug, color, logo_url').eq('slug', slug).single(),
      sb.from('products').select('id, name, category').eq('client_slug', slug).eq('active', true).order('name'),
    ])
    if (cl) brands.push({ ...cl, products: prods || [] })
  }

  // Legacy single-client field for backwards compat
  const client = brands[0] ?? null

  return NextResponse.json({
    event: { ...event, accounts: accountName ? { name: accountName } : null },
    client,
    brands,
  })
}
