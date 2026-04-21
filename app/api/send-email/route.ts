import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const { to, subject, replyTo, html } = payload
    // Accept either 'text' or 'body' field
    const text: string = payload.text || payload.body || ''
    const toArray: string[] = Array.isArray(to) ? to : String(to).split(',').map((e: string) => e.trim()).filter(Boolean)
    const { data, error } = await resend.emails.send({
      from: 'orders@barley-bros.com',
      to: toArray,
      replyTo: replyTo || 'info@barley-bros.com',
      subject,
      text,
      ...(html ? { html } : {}),
    })
    if (error) return Response.json({ error }, { status: 400 })
    return Response.json({ success: true, id: (data as any)?.id })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
