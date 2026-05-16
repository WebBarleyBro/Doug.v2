import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUserFromRequest, getSupabaseAdmin } from '../../lib/supabase-server'

const resend = new Resend(process.env.RESEND_API_KEY)

// In-memory rate limiter: 10 emails per user per hour
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT = 10
const WINDOW_MS = 60 * 60 * 1000

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getAuthUserFromRequest(request)
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role === 'portal') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!checkRateLimit(profile.id)) {
      return NextResponse.json({ error: 'Rate limit exceeded — max 10 emails per hour' }, { status: 429 })
    }

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
        user_id: profile.id,
        assigned_to: profile.id,
        title: 'Follow up on order inquiry',
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
