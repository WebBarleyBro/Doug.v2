// Scheduled brand reports. Vercel Cron calls this at 9am Mountain Time on the 1st of
// every month (see vercel.json). Each brand switched on in report_settings (Brand
// reports page) gets last month's one-page report, plus last quarter's on Jan 1,
// Apr 1, Jul 1 and Oct 1. Each PDF is saved to storage (client-files/reports/{slug}/),
// which is also how a report is never sent twice: if the file exists it is skipped.
//
// Manual use, signed in as an owner or admin (Bearer token):
//   ?mode=dry                 what would be sent (default); sends nothing
//   ?mode=pdf&slug=…          one brand's PDF (monthly, or quarterly with &quarter=)
//   ?mode=test&slug=…         email the report to you only; nothing saved
//   ?mode=send&slug=…         send now to the brand's recipients (even if switched off)
//   ?mode=history             list reports already sent, per brand
//   ?month=2026-10            the month (default: last month)
//   ?quarter=q3-2026          the quarter (default: last quarter, only when one just ended)
//   ?force=1                  send even if this report was already sent

import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { getAuthUserFromRequest, getSupabaseAdmin } from '../../../lib/supabase-server'
import { buildMonthlyPdfData, buildQuarterlyPdfData, fmtMonthLong } from '../../../portal/[slug]/portal-metrics'
import { MonthlyReportPDF, QuarterlyReportPDF } from '../../../portal/[slug]/PortalReportPDF'
import {
  type BrandRow, REPORT_FROM, REPORT_REPLY_TO,
  loadReportSource, loadReportSettings, recipientsFor, periodsEndedBefore, hasActivity, portalLink, buildReportEmail,
} from '../../../lib/reports-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const resend = new Resend(process.env.RESEND_API_KEY)
const BUCKET = 'client-files'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const fail = (status: number, code: string, error: string, extra?: object) => NextResponse.json({ error, code, ...extra }, { status })

type Job = { client: BrandRow; kind: 'monthly' | 'quarterly'; label: string; filename: string; hash: string; month?: string; quarter?: { year: number; q: number } }

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const isCron = !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  let callerEmail: string | null = null
  if (!isCron) {
    const user = await getAuthUserFromRequest(req)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Please sign in again.')
    if (!['owner', 'admin'].includes(user.role)) return fail(403, 'FORBIDDEN', 'Owners and admins only.')
    callerEmail = user.email || null
  }
  const mode = isCron ? 'send' : (url.searchParams.get('mode') || 'dry')
  if (!['dry', 'pdf', 'test', 'send', 'history'].includes(mode)) return fail(400, 'BAD_REQUEST', 'Unknown mode.')
  const slugFilter = url.searchParams.get('slug')
  if (!isCron && (mode === 'send' || mode === 'test' || mode === 'pdf') && !slugFilter) return fail(400, 'BAD_REQUEST', 'Pick a brand.')
  const force = !isCron && url.searchParams.get('force') === '1'

  const admin = getSupabaseAdmin()

  if (mode === 'history') {
    const { data: clients } = await admin.from('clients').select('slug').eq('active', true)
    const history: Record<string, { name: string; label: string; url: string; sentAt: string | null }[]> = {}
    for (const c of clients || []) {
      const { data: files } = await admin.storage.from(BUCKET).list(`reports/${c.slug}`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
      history[c.slug] = (files || []).filter(f => f.name.endsWith('.pdf')).map(f => {
        const m = f.name.match(/-(\d{4})-(\d{2})\.pdf$/i), q = f.name.match(/-Q([1-4])-(\d{4})\.pdf$/i)
        return {
          name: f.name,
          label: m ? fmtMonthLong(`${m[1]}-${m[2]}`) : q ? `Q${q[1]} ${q[2]}` : f.name,
          url: admin.storage.from(BUCKET).getPublicUrl(`reports/${c.slug}/${f.name}`).data.publicUrl,
          sentAt: f.created_at || null,
        }
      })
    }
    return NextResponse.json({ history })
  }

  // The scheduled send waits for migration 071 so nothing goes out before you have
  // seen the settings. Manual previews and tests still work.
  const settings = await loadReportSettings(admin)
  if (!settings && (isCron || mode === 'send')) return fail(503, 'NOT_CONFIGURED', 'Run migration 071 (report settings) first. Nothing was sent.')

  const nowMs = Date.now()
  const ended = periodsEndedBefore(nowMs)
  const monthKey = url.searchParams.get('month') || ended.monthKey
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return fail(400, 'BAD_REQUEST', 'month must be YYYY-MM.')
  const qParam = url.searchParams.get('quarter')?.match(/^q([1-4])-(\d{4})$/i)
  const quarter = qParam ? { q: Number(qParam[1]), year: Number(qParam[2]) } : (url.searchParams.get('month') ? null : ended.quarter)
  const onlyQuarter = !!qParam && (mode === 'pdf' || url.searchParams.get('only') === 'quarter')
  const onlyMonth = url.searchParams.get('only') === 'month'

  let q = admin.from('clients').select('id, slug, name, active, contact_email').eq('active', true).order('name')
  if (slugFilter) q = q.eq('slug', slugFilter)
  const { data: clients, error: cErr } = await q
  if (cErr) return fail(500, 'INTERNAL_ERROR', cErr.message)

  const jobs: Job[] = []
  for (const client of (clients || []) as BrandRow[]) {
    if (!onlyQuarter) jobs.push({ client, kind: 'monthly', label: fmtMonthLong(monthKey), filename: `${client.slug}-${monthKey}.pdf`, hash: `#${monthKey}`, month: monthKey })
    if (quarter && !onlyMonth) jobs.push({ client, kind: 'quarterly', label: `Q${quarter.q} ${quarter.year}`, filename: `${client.slug}-Q${quarter.q}-${quarter.year}.pdf`, hash: `#q${quarter.q}-${quarter.year}`, quarter })
  }

  const preparedOn = new Date(nowMs).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric' })
  const results: Record<string, unknown>[] = []
  const sourceCache = new Map<string, Awaited<ReturnType<typeof loadReportSource>>>()

  for (const job of jobs) {
    const { client } = job
    const setting = settings?.[client.slug] ?? null
    const enabled = !!setting && (job.kind === 'monthly' ? setting.monthly_enabled : setting.quarterly_enabled)
    const r: Record<string, unknown> = { brand: client.slug, brandName: client.name, report: job.label, kind: job.kind, enabled, filename: job.filename }
    try {
      if (!sourceCache.has(client.slug)) sourceCache.set(client.slug, await loadReportSource(admin, client, nowMs))
      const src = sourceCache.get(client.slug)!
      const data = job.kind === 'monthly' ? buildMonthlyPdfData(src, job.month!) : buildQuarterlyPdfData(src, job.quarter!.year, job.quarter!.q)
      const figures = 'weeks' in data
        ? { accounts: data.accountsWorked.current, orders: data.orders.current, value: data.value.current }
        : { accounts: data.totals.accountsWorked, orders: data.totals.orders, value: data.totals.value }
      r.figures = figures
      const active = hasActivity(data)

      const recips = await recipientsFor(admin, client, setting)
      r.recipientDetail = recips
      const recipients = mode === 'test' ? (callerEmail ? [callerEmail] : []) : recips.final
      r.recipients = recipients

      const path = `reports/${client.slug}/${job.filename}`
      const { data: existing } = await admin.storage.from(BUCKET).list(`reports/${client.slug}`, { search: job.filename })
      const alreadySent = (existing || []).some(f => f.name === job.filename)
      r.alreadySent = alreadySent

      // Scheduled (and bulk) sends respect the on/off switch; a "Send now" for one brand does not.
      const respectSwitch = isCron || !slugFilter
      if (mode !== 'pdf' && mode !== 'test') {
        if (respectSwitch && !enabled) { r.status = 'off'; results.push(r); continue }
        if (!active) { r.status = 'skipped: no visits or orders in this period'; results.push(r); continue }
        if (alreadySent && !force) { r.status = 'already sent'; results.push(r); continue }
        if (!recipients.length) { r.status = 'skipped: no recipient email on file'; results.push(r); continue }
        if (mode === 'dry') { r.status = 'will send'; results.push(r); continue }
      }

      const doc = job.kind === 'monthly'
        ? React.createElement(MonthlyReportPDF, { data: data as never, clientName: client.name, preparedOn })
        : React.createElement(QuarterlyReportPDF, { data: data as never, clientName: client.name, preparedOn })
      const pdf = await renderToBuffer(doc as never)

      if (mode === 'pdf') {
        return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${job.filename}"` } })
      }
      if (!recipients.length) { r.status = 'skipped: no email for you on file'; results.push(r); continue }

      const email = buildReportEmail({ brandName: client.name, periodLabel: job.label, kind: job.kind, figures, link: portalLink(client.slug, job.hash) })
      const { error: sendErr } = await resend.emails.send({
        from: REPORT_FROM,
        to: recipients,
        ...(mode === 'send' ? { bcc: REPORT_REPLY_TO } : {}),
        replyTo: REPORT_REPLY_TO,
        subject: mode === 'test' ? `[Test] ${email.subject}` : email.subject,
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
      r.status = mode === 'test' ? 'test sent to you' : 'sent'
      results.push(r)
      await sleep(600)   // stay well under Resend's rate limit
    } catch (e: unknown) {
      console.error('reports.job', client.slug, job.label, e)
      r.status = `failed: ${e instanceof Error ? e.message : String(e)}`
      results.push(r)
    }
  }

  if (mode === 'pdf') return fail(404, 'NOT_FOUND', 'No report for that brand and period.', { results })
  console.log('reports.run', JSON.stringify({ mode, cron: isCron, monthKey, quarter, results: results.map(r => ({ brand: r.brand, report: r.report, status: r.status })) }))
  return NextResponse.json({
    mode, configured: !!settings, month: monthKey, monthLabel: fmtMonthLong(monthKey),
    quarter: quarter ? `Q${quarter.q} ${quarter.year}` : null, quarterKey: quarter ? `q${quarter.q}-${quarter.year}` : null, results,
  })
}
