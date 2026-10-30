// Server-only helpers for the scheduled brand reports (see /api/reports/send).
// Loads the same rows the portal reads, works out who receives each brand's
// report, and builds the cover email. Numbers come from portal-metrics.ts, so a
// report always matches the portal and the Download report button.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PdfSource, MonthlyPdfData, QuarterlyPdfData } from '../portal/[slug]/portal-metrics'
import { money, addMonths, mtDayKey, quarterOf } from '../portal/[slug]/portal-metrics'
import { escapeHtml } from './order-email'

export const REPORT_FROM = process.env.REPORTS_FROM || 'Western Peak <reports@westernpeak.org>'
export const REPORT_REPLY_TO = ['sara@westernpeak.org', 'chase@westernpeak.org']
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

export interface BrandRow {
  id: string
  slug: string
  name: string
  active: boolean
  contact_email?: string | null
}

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

/** Everything a brand's report needs, read with the service-role client. */
export async function loadReportSource(admin: SupabaseClient, client: BrandRow, nowMs: number): Promise<PdfSource> {
  const slug = client.slug
  const [visits, orders, eventsRes, consumersRes] = await Promise.all([
    fetchAll<any>((f, t) => admin.from('visits')
      .select('id, visited_at, status, notes, account_id, user_id, accounts(id, name, address, account_type)')
      .eq('client_slug', slug).order('visited_at', { ascending: false }).range(f, t)),
    fetchAll<any>((f, t) => admin.from('purchase_orders')
      .select('id, po_number, deliver_to_name, total_amount, status, order_type, created_at, sent_at, account_id, accounts(id, name), po_line_items(*)')
      .eq('client_slug', slug).order('created_at', { ascending: false }).range(f, t)),
    admin.from('events').select('id, title, event_type, start_time, status, account_id, accounts(name)')
      .or(`client_slug.eq.${slug},client_slugs.cs.{${slug}}`),
    admin.from('tasting_consumers').select('event_id').eq('client_id', client.id),
  ])
  const ids = [...new Set([...visits.map(v => v.account_id), ...orders.map(o => o.account_id)].filter(Boolean))] as string[]
  const accounts: any[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin.from('accounts').select('*').in('id', ids.slice(i, i + 100))
    if (error) throw new Error(error.message)
    accounts.push(...(data || []))
  }
  const tastingConsumers: Record<string, number> = {}
  for (const r of (consumersRes.data || []) as { event_id: string | null }[]) if (r.event_id) tastingConsumers[r.event_id] = (tastingConsumers[r.event_id] || 0) + 1
  return { visits, orders, events: (eventsRes.data || []) as any[], accounts, tastingConsumers, nowMs }
}

export interface ReportSettings {
  client_slug: string
  monthly_enabled: boolean
  quarterly_enabled: boolean
  include_portal_logins: boolean
  extra_recipients: string[]
  excluded_recipients: string[]
}

/** All brands' report settings, or null when migration 071 has not been run. */
export async function loadReportSettings(admin: SupabaseClient): Promise<Record<string, ReportSettings> | null> {
  const { data, error } = await admin.from('report_settings').select('*')
  if (error) return null
  return Object.fromEntries((data || []).map((r: ReportSettings) => [r.client_slug, r]))
}

/**
 * Who receives a brand's report: its contact email(s) and, if enabled, every portal
 * login for the brand; minus anyone removed by hand; plus anyone added by hand.
 */
export async function recipientsFor(admin: SupabaseClient, client: BrandRow, settings?: ReportSettings | null): Promise<{ contacts: string[]; logins: string[]; extra: string[]; excluded: string[]; final: string[] }> {
  const split = (s?: string | null) => String(s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean)
  const { data: cs } = await admin.from('client_settings').select('primary_contact_email').eq('client_slug', client.slug).maybeSingle()
  const contacts = [...split(cs?.primary_contact_email), ...split(client.contact_email)]
  const logins: string[] = []
  const { data: profiles } = await admin.from('user_profiles').select('id').eq('role', 'portal').eq('client_slug', client.slug)
  for (const p of profiles || []) {
    const { data } = await admin.auth.admin.getUserById(p.id)
    if (data?.user?.email) logins.push(data.user.email)
  }
  const extra = (settings?.extra_recipients || []).filter(e => EMAIL_RE.test(e))
  const excluded = new Set((settings?.excluded_recipients || []).map(e => e.toLowerCase()))
  const pool = [...contacts, ...(settings?.include_portal_logins === false ? [] : logins), ...extra]
  const seen = new Set<string>()
  const final = pool.filter(e => {
    const k = e.toLowerCase()
    if (!EMAIL_RE.test(e) || excluded.has(k) || seen.has(k)) return false
    seen.add(k); return true
  })
  const dedupe = (l: string[]) => [...new Map(l.map(e => [e.toLowerCase(), e])).values()]
  return { contacts: dedupe(contacts), logins: dedupe(logins), extra: dedupe(extra), excluded: [...excluded], final }
}

/** The periods that just ended: last month always, last quarter when that month closed one. */
export function periodsEndedBefore(nowMs: number): { monthKey: string; quarter: { year: number; q: number } | null } {
  const monthKey = addMonths(mtDayKey(nowMs).slice(0, 7), -1)
  const m = Number(monthKey.slice(5, 7))
  return { monthKey, quarter: m % 3 === 0 ? quarterOf(monthKey) : null }
}

export function hasActivity(d: MonthlyPdfData | QuarterlyPdfData): boolean {
  if ('weeks' in d) return d.orders.current > 0 || d.accountsWorked.current > 0
  return d.totals.orders > 0 || d.totals.accountsWorked > 0
}

export function portalLink(slug: string, hash: string): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  return base ? `${base.replace(/\/$/, '')}/portal/${slug}${hash}` : null
}

/** Short cover email; the PDF is attached. */
export function buildReportEmail(o: {
  brandName: string
  periodLabel: string          // "October 2026" / "Q3 2026"
  kind: 'monthly' | 'quarterly'
  figures: { accounts: number; orders: number; value: number }
  link: string | null
}): { subject: string; text: string; html: string } {
  const title = o.kind === 'monthly' ? `${o.periodLabel} brand report` : `${o.periodLabel} quarterly report`
  const subject = `${o.brandName} · ${title}`
  const lines = [
    `Accounts visited: ${o.figures.accounts}`,
    `Orders: ${o.figures.orders}`,
    `Order value: ${money(o.figures.value)}`,
  ]
  const text = [
    `Hi ${o.brandName} team,`,
    '',
    `Your ${title} from Western Peak is attached.`,
    '',
    ...lines,
    '',
    o.link ? `See the details any time in your portal: ${o.link}` : null,
    '',
    'Questions? Reply to this email or write to chase@westernpeak.org.',
    '',
    'Western Peak · Fort Collins, Colorado · westernpeak.org',
  ].filter(l => l !== null).join('\n')

  const cell = (k: string, v: string) => `
      <td style="padding:14px 16px;border:1px solid #e6e2dc;width:33%;vertical-align:top">
        <div style="font-size:12px;color:#777777">${k}</div>
        <div style="font-size:22px;font-weight:700;color:#1a1a18;margin-top:4px">${v}</div>
      </td>`
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light only"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f0ede8;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0ede8"><tr><td align="center" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #dedad4">
  <tr><td style="padding:26px 28px 18px;border-bottom:1px solid #e8e6e2">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#1a1a18">Western Peak</div>
    <div style="font-size:22px;font-weight:700;color:#1a1a18;margin-top:16px">${escapeHtml(o.brandName)}</div>
    <div style="font-size:14px;color:#777777;margin-top:4px">${escapeHtml(title)}</div>
  </td></tr>
  <tr><td style="padding:20px 28px">
    <p style="font-size:14px;color:#444444;line-height:1.6;margin:0 0 16px">Your ${escapeHtml(title)} is attached as a one-page PDF.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>
      ${cell('Accounts visited', String(o.figures.accounts))}${cell('Orders', String(o.figures.orders))}${cell('Order value', money(o.figures.value))}
    </tr></table>
    ${o.link ? `<p style="margin:20px 0 0"><a href="${escapeHtml(o.link)}" style="display:inline-block;background-color:#1a1a18;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 18px">Open your portal</a></p>` : ''}
  </td></tr>
  <tr><td style="padding:16px 28px;border-top:1px solid #e8e6e2;background-color:#faf8f5;font-size:12px;color:#888888;line-height:1.6">
    Questions? Reply to this email or write to <a href="mailto:chase@westernpeak.org" style="color:#888888">chase@westernpeak.org</a>.<br>
    Western Peak · Fort Collins, Colorado · <a href="https://westernpeak.org" style="color:#888888">westernpeak.org</a>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`
  return { subject, text, html }
}
