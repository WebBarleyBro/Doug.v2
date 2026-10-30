import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUserFromRequest, getSupabaseAdmin } from '../../lib/supabase-server'
import { FIRM_EMAIL } from '../../lib/order-email'

const resend = new Resend(process.env.RESEND_API_KEY)

// westernpeak.org is verified in Resend; no mailbox is needed for the From address.
const FROM = process.env.ORDERS_FROM || 'Western Peak Orders <orders@westernpeak.org>'
// Replies always go to the team, never to whatever the browser sends.
const REPLY_TO = (process.env.ORDERS_REPLY_TO || FIRM_EMAIL.replyTo.join(',')).split(',').map(s => s.trim()).filter(Boolean)

const SENDER_ROLES = new Set(['owner', 'admin', 'rep'])
const MAX_RECIPIENTS = 5
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

// Best-effort limiter: 20 sends per user per hour. Serverless instances do not
// share memory, so this only catches bursts within one instance.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT = 20
const WINDOW_MS = 60 * 60 * 1000
function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now - entry.windowStart > WINDOW_MS) { rateLimitMap.set(userId, { count: 1, windowStart: now }); return true }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status })
}

// "YYYY-MM-DD" n days from today in Mountain Time.
function mtDatePlus(days: number): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
  const d = new Date(today + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getAuthUserFromRequest(request)
    if (!profile) return fail(401, 'UNAUTHORIZED', 'Please sign in again.')
    if (!SENDER_ROLES.has(profile.role)) return fail(403, 'FORBIDDEN', 'Your account is not allowed to send order emails.')

    const payload = await request.json().catch(() => null)
    if (!payload) return fail(400, 'BAD_REQUEST', 'Invalid request.')
    const { subject, html, orderId } = payload as { subject?: string; html?: string; orderId?: string }
    const text: string = payload.text || payload.body || ''
    const to: string[] = (Array.isArray(payload.to) ? payload.to : String(payload.to ?? '').split(/[,;]/))
      .map((e: string) => String(e).trim()).filter(Boolean)

    if (!to.length) return fail(400, 'NO_RECIPIENT', 'Enter at least one recipient email address.')
    const bad = to.filter(e => !EMAIL_RE.test(e))
    if (bad.length) return fail(400, 'BAD_RECIPIENT', `Not a valid email address: ${bad.join(', ')}`)
    if (to.length > MAX_RECIPIENTS) return fail(400, 'TOO_MANY_RECIPIENTS', `Send to at most ${MAX_RECIPIENTS} addresses at once.`)
    if (!subject?.trim() || (!text.trim() && !html?.trim())) return fail(400, 'EMPTY_MESSAGE', 'The email has no subject or body.')
    if (!checkRateLimit(profile.id)) return fail(429, 'RATE_LIMITED', `Limit reached: ${RATE_LIMIT} emails per hour. Try again later.`)

    // For a distributor inquiry, load the order first so we only touch a real inquiry.
    const admin = getSupabaseAdmin()
    let inquiry: { id: string; po_number: string | null; account_id: string | null; client_slug: string | null } | null = null
    if (orderId) {
      const { data, error } = await admin.from('purchase_orders')
        .select('id, po_number, account_id, client_slug, order_type').eq('id', orderId).single()
      if (error || !data) return fail(404, 'ORDER_NOT_FOUND', 'That order no longer exists.')
      if (data.order_type === 'distributor') inquiry = data
    }

    const { data, error } = await resend.emails.send({ from: FROM, to, replyTo: REPLY_TO, subject: subject.trim(), text, ...(html ? { html } : {}) })
    if (error) {
      console.error('send-email.resend', error)
      return fail(502, 'EMAIL_SEND_FAILED', error.message || 'The email service rejected this message.')
    }

    // Distributor inquiry: stamp contacted and make sure one open follow-up task exists.
    if (inquiry) {
      const now = new Date().toISOString()
      const { error: upErr } = await admin.from('purchase_orders')
        .update({ distributor_status: 'contacted', distributor_contacted_at: now }).eq('id', inquiry.id)
      if (upErr) console.error('send-email.stamp', upErr)

      const title = `Follow up on order inquiry ${inquiry.po_number || ''}`.trim()
      const { data: open } = await admin.from('tasks').select('id').eq('title', title).eq('completed', false).limit(1)
      if (!open?.length) {
        const { error: taskErr } = await admin.from('tasks').insert({
          user_id: profile.id,
          assigned_to: profile.id,
          title,
          description: `Check on the inquiry sent to ${to.join(', ')}`,
          due_date: mtDatePlus(3),
          priority: 'medium',
          completed: false,
          account_id: inquiry.account_id,
          client_slug: inquiry.client_slug,
        })
        if (taskErr) console.error('send-email.task', taskErr)
      }
    }

    return NextResponse.json({ success: true, id: (data as { id?: string } | null)?.id })
  } catch (err: unknown) {
    console.error('send-email', err)
    return fail(500, 'INTERNAL_ERROR', 'Something went wrong sending the email. Please try again.')
  }
}
