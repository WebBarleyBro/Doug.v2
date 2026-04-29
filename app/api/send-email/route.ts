import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseAdmin } from '../../lib/supabase-server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    // Auth check via session cookie
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll() } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    if (profile?.role === 'portal') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const payload = await request.json()
    const { to, subject, replyTo, html, orderId } = payload
    const text: string = payload.text || payload.body || ''
    const toArray: string[] = Array.isArray(to)
      ? to
      : String(to).split(',').map((e: string) => e.trim()).filter(Boolean)

    const { data, error } = await resend.emails.send({
      from: 'orders@barley-bros.com',
      to: toArray,
      replyTo: replyTo || 'info@barley-bros.com',
      subject,
      text,
      ...(html ? { html } : {}),
    })

    if (error) return NextResponse.json({ error }, { status: 400 })

    // If this is a distributor inquiry, stamp contacted + create a 3-day follow-up task
    if (orderId) {
      const admin = getSupabaseAdmin()
      const now = new Date().toISOString()

      await admin
        .from('purchase_orders')
        .update({ distributor_status: 'contacted', distributor_contacted_at: now })
        .eq('id', orderId)

      const due = new Date()
      due.setDate(due.getDate() + 3)
      await admin.from('tasks').insert({
        user_id: user.id,
        assigned_to: user.id,
        title: 'Follow up on distributor inquiry',
        description: `Check on inquiry sent to ${toArray.join(', ')}`,
        due_date: due.toISOString().slice(0, 10),
        priority: 'medium',
        completed: false,
      })
    }

    return NextResponse.json({ success: true, id: (data as any)?.id })
  } catch (err: any) {
    console.error('send-email error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
