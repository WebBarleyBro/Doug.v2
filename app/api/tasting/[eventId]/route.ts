import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../lib/supabase-server'

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const sb = getSupabaseAdmin()
  const { data: event } = await sb.from('events').select('*, accounts(name)').eq('id', eventId).single()
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let client = null
  if (event.client_slug) {
    const { data: cl } = await sb.from('clients').select('id, name, slug, color, logo_url').eq('slug', event.client_slug).single()
    client = cl
  }

  return NextResponse.json({ event, client })
}
