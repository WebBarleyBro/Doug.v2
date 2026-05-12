import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    // Verify the caller is authenticated (any role — including portal)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll() } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const {
      client_name,
      suggestion_type,
      name,
      address,
      reason,
      notes,
      submitted_by,
      contact_name,
      contact_role,
      contact_email,
      contact_phone,
    } = await request.json()

    const typeLabel = suggestion_type === 'account' ? 'Account' : 'Industry Contact'

    const lines = [
      `${client_name} submitted a new suggestion via their brand portal.`,
      ``,
      `Type: ${typeLabel}`,
      `Name: ${name}`,
      address ? `Address / Location: ${address}` : null,
      reason ? `Reason: ${reason}` : null,
      notes ? `Notes: ${notes}` : null,
    ]

    if (contact_name) {
      lines.push(``, `Key Contact:`)
      lines.push(`  Name: ${contact_name}`)
      if (contact_role) lines.push(`  Role: ${contact_role}`)
      if (contact_email) lines.push(`  Email: ${contact_email}`)
      if (contact_phone) lines.push(`  Phone: ${contact_phone}`)
    }

    lines.push(``, `Submitted by: ${submitted_by || user.email || 'Portal user'}`)
    lines.push(``, `Review suggestions in the CRM under Accounts → Suggestions.`)

    const text = lines.filter(l => l !== null).join('\n')

    await resend.emails.send({
      from: 'portal@barley-bros.com',
      to: ['sara@barley-bros.com'],
      subject: `[${client_name}] New ${typeLabel}: ${name}`,
      text,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('client-suggestion-notify error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
