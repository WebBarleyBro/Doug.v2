// Scheduled brand reports. Vercel Cron calls this at 9am Mountain Time on the 1st of
// every month (see vercel.json). It emails each active brand last month's one-page
// report, plus last quarter's on Jan 1, Apr 1, Jul 1 and Oct 1. Each PDF is saved
// to storage (client-files/reports/{slug}/…), which is also how a report is never
// sent twice: if the file already exists the brand is skipped.
//
// Manual use, signed in as an owner or admin (Bearer token):
//   ?mode=dry                 list what would be sent, send nothing
//   ?mode=pdf&slug=…          download one brand's PDF (monthly, or quarterly with &quarter=)
//   ?mode=test                send every report to you only; nothing saved
//   ?month=2026-10            pick the month (default: last month)
//   ?quarter=q3-2026          pick the quarter (default: last quarter, only on quarter ends)
//   ?slug=noco-distillery     one brand only
//   ?force=1                  send even if this report was already sent

import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { getAuthUserFromRequest, getSupabaseAdmin } from '../../../lib/supabase-server'
import { buildMonthlyPdfData, buildQuarterlyPdfData } from '../../../portal/[slug]/portal-metrics'
import { MonthlyReportPDF, QuarterlyReportPDF } from '../../../portal/[slug]/PortalReportPDF'
import {
  type BrandRow, REPORT_FROM, REPORT_REPLY_TO,
  loadReportSource, recipientsFor, periodsEndedBefore, hasActivity, portalLink, buildReportEmail,
} from '../../../lib/reports-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const resend = new Resend(process.env.RESEND_API_KEY)
const BUCKET = 'client-files'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Job = { client: BrandRow; kind: 'monthly' | 'quarterly'; label: string; filename: string; hash: string; month?: string; quarter?: { year: number; q: number } }

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const isCron = !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  let callerEmail: string | null = null
  if (!isCron) {
    const user = await getAuthUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    if (!['owner', 'admin'].includes(user.role)) return NextResponse.json({ error: 'Owners and admins only', code: 'FORBIDDEN' }, { status: 403 })
    callerEmail = user.email || null
  }
  const mode = isCron ? 'send' : (url.searchParams.get('mode') || 'dry')
  if (!['dry', 'pdf', 'test', 'send'].includes(mode)) return NextResponse.json({ error: 'Unknown mode', code: 'BAD_REQUEST' }, { status: 400 })
  const force = !isCron && url.searchParams.get('force') === '1'

  const nowMs = Date.now()
  const ended = periodsEndedBefore(nowMs)
  const monthKey = url.searchParams.get('month') || ended.monthKey
  const qParam = url.searchParams.get('quarter')?.match(/^q([1-4])-(\d{4})$/i)
  const quarter = qParam ? { q: Number(qParam[1]), year: Number(qParam[2]) } : (url.searchParams.get('month') ? null : ended.quarter)
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return NextResponse.json({ error: 'month must be YYYY-MM', code: 'BAD_REQUEST' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const slugFilter = url.searchParams.get('slug')
  let q = admin.from('clients').select('id, slug, name, active, contact_email').eq('active', true)
  if (slugFilter) q = q.eq('slug', slugFilter)
  const { data: clients, error: cErr } = await q
  if (cErr) return NextResponse.json({ error: cErr.message, code: 'INTERNAL_ERROR' }, { status: 500 })

  const jobs: Job[] = []
  for (const client of (clients || []) as BrandRow[]) {
    const [y, m] = monthKey.split('-')
    const monthName = new Date(Number(y), Number(m) - 1, 15).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!(mode === 'pdf' && qParam)) jobs.push({ client, kind: 'monthly', label: monthName, filename: `${client.slug}-${monthKey}.pdf`, hash: `#${monthKey}`, month: monthKey })
    if (quarter) jobs.push({ client, kind: 'quarterly', label: `Q${quarter.q} ${quarter.year}`, filename: `${client.slug}-Q${quarter.q}-${quarter.year}.pdf`, hash: `#q${quarter.q}-${quarter.year}`, quarter })
  }

  const preparedOn = new Date(nowMs).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric' })
  const results: Record<string, unknown>[] = []
  const sourceCache = new Map<string, Awaited<ReturnType<typeof loadReportSource>>>()

  for (const job of jobs) {
    const { client } = job
    const r: Record<string, unknown> = { brand: client.slug, report: job.label, kind: job.kind }
    try {
      if (!sourceCache.has(client.slug)) sourceCache.set(client.slug, await loadReportSource(admin, client, nowMs))
      const src = sourceCache.get(client.slug)!
      const data = job.kind === 'monthly' ? buildMonthlyPdfData(src, job.month!) : buildQuarterlyPdfData(src, job.quarter!.year, job.quarter!.q)
      const figures = 'weeks' in data
        ? { accounts: data.accountsWorked.current, orders: data.orders.current, value: data.value.current }
        : { accounts: data.totals.accountsWorked, orders: data.totals.orders, value: data.totals.value }
      r.figures = figures
      if (!hasActivity(data)) { r.status = 'skipped: no visits or orders in this period'; results.push(r); continue }

      const doc = job.kind === 'monthly'
        ? React.createElement(MonthlyReportPDF, { data: data as never, clientName: client.name, preparedOn })
        : React.createElement(QuarterlyReportPDF, { data: data as never, clientName: client.name, preparedOn })
      const pdf = await renderToBuffer(doc as never)

      if (mode === 'pdf') {
        return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${job.filename}"` } })
      }

      const path = `reports/${client.slug}/${job.filename}`
      const { data: existing } = await admin.storage.from(BUCKET).list(`reports/${client.slug}`, { search: job.filename })
      const alreadySent = (existing || []).some(f => f.name === job.filename)
      const recipients = mode === 'test' ? (callerEmail ? [callerEmail] : []) : await recipientsFor(admin, client)
      r.recipients = recipients
      if (alreadySent && !force && mode !== 'test') { r.status = 'skipped: already sent'; results.push(r); continue }
      if (!recipients.length) { r.status = 'skipped: no recipient email on file'; results.push(r); continue }
      if (mode === 'dry') { r.status = 'would send'; results.push(r); continue }

      const email = buildReportEmail({ brandName: client.name, periodLabel: job.label, kind: job.kind, figures, link: portalLink(client.slug, job.hash) })
      const { error: sendErr } = await resend.emails.send({
        from: REPORT_FROM,
        to: recipients,
        ...(mode === 'send' ? { bcc: REPORT_REPLY_TO } : {}),
        replyTo: REPORT_REPLY_TO,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: [{ filename: job.filename, content: Buffer.from(pdf) }],
      })
      if (sendErr) { console.error('reports.send', client.slug, sendErr); r.status = `failed: ${sendErr.message}`; results.push(r); continue }

      if (mode === 'send') {
        const { error: upErr } = await admin.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true })
        if (upErr) console.error('reports.archive', client.slug, upErr)
        r.archived = !upErr
      }
      r.status = mode === 'test' ? 'sent to you only' : 'sent'
      results.push(r)
      await sleep(600)   // stay well under Resend's rate limit
    } catch (e: unknown) {
      console.error('reports.job', client.slug, job.label, e)
      r.status = `failed: ${e instanceof Error ? e.message : String(e)}`
      results.push(r)
    }
  }

  if (mode === 'pdf') return NextResponse.json({ error: 'No report to show for that brand and period', code: 'NOT_FOUND', results }, { status: 404 })
  console.log('reports.run', JSON.stringify({ mode, monthKey, quarter, results }))
  return NextResponse.json({ mode, month: monthKey, quarter: quarter ? `Q${quarter.q} ${quarter.year}` : null, results })
}

