// One builder for every order and order-inquiry email, used by both the create
// flow and re-send on the Orders page. Keeps branding, wording, numbers and
// escaping identical no matter where an email is sent from.

export const FIRM_EMAIL = {
  name: 'Western Peak',
  city: 'Fort Collins, Colorado',
  site: 'westernpeak.org',
  // Replies to order emails go to both of these (set on the server, see /api/send-email).
  replyTo: ['sara@westernpeak.org', 'chase@westernpeak.org'],
}

export interface OrderEmailLine {
  name: string
  cases: number
  bottles: number
  casePrice: number | null
  bottlePrice: number | null
  total: number
}

export interface OrderEmailInput {
  poNumber: string
  brandName: string
  dateISO: string              // the order's date; shown in Mountain Time
  isInquiry: boolean
  deliverToName: string
  deliverToAddress?: string | null
  deliverToPhone?: string | null
  lines: OrderEmailLine[]
  discount: number
  notes?: string | null
}

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatOrderDateMT(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00Z') : new Date(iso)
  return d.toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'long', day: 'numeric', year: 'numeric' })
}

export function quantityLabel(l: { cases: number; bottles: number }): string {
  return [
    l.cases > 0 ? `${l.cases} case${l.cases === 1 ? '' : 's'}` : '',
    l.bottles > 0 ? `${l.bottles} bottle${l.bottles === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' + ') || '—'
}

function priceLabel(l: OrderEmailLine): string {
  const parts = [
    l.cases > 0 && l.casePrice ? `${money(l.casePrice)}/case` : '',
    l.bottles > 0 && l.bottlePrice ? `${money(l.bottlePrice)}/bottle` : '',
  ].filter(Boolean)
  return parts.join(' · ') || '—'
}

export function buildOrderEmail(o: OrderEmailInput): { subject: string; text: string; html: string } {
  const gross = Math.round(o.lines.reduce((s, l) => s + l.total, 0) * 100) / 100
  const discount = Math.max(0, Number(o.discount) || 0)
  const total = Math.round((gross - discount) * 100) / 100
  const kind = o.isInquiry ? 'Order Inquiry' : 'Purchase Order'
  const date = formatOrderDateMT(o.dateISO)
  const ask = o.isInquiry
    ? 'Please process this order inquiry and confirm pricing and availability.'
    : 'Please process this order at your earliest convenience.'

  const subject = `${o.isInquiry ? 'Order Inquiry' : 'PO'} ${o.poNumber} – ${o.deliverToName} (${o.brandName})`

  const text = [
    `${kind} ${o.poNumber}`,
    `${o.brandName} · ${date}`,
    '',
    `Deliver to: ${o.deliverToName}`,
    o.deliverToAddress ? `Address: ${o.deliverToAddress}` : null,
    o.deliverToPhone ? `Phone: ${o.deliverToPhone}` : null,
    '',
    ...o.lines.map(l => `• ${l.name} — ${quantityLabel(l)} — ${money(l.total)}`),
    '',
    discount > 0 ? `Subtotal: ${money(gross)}` : null,
    discount > 0 ? `Discount: −${money(discount)}` : null,
    `Total: ${money(total)}`,
    o.notes ? `\nNotes: ${o.notes}` : null,
    '',
    ask,
    '',
    `${FIRM_EMAIL.name} · ${FIRM_EMAIL.city} · ${FIRM_EMAIL.site}`,
    `Reply to this email to reach ${FIRM_EMAIL.replyTo.join(' and ')}.`,
  ].filter(l => l !== null).join('\n')

  const cell = 'padding:10px 0;border-bottom:1px solid #e8e6e2;font-size:14px;color:#1a1a18;vertical-align:top'
  const th = 'padding:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888888;border-bottom:2px solid #1a1a18'
  const rows = o.lines.map(l => `
        <tr>
          <td style="${cell}">${escapeHtml(l.name)}<div style="font-size:12px;color:#777777;margin-top:2px">${escapeHtml(priceLabel(l))}</div></td>
          <td style="${cell};text-align:right;padding-left:12px">${escapeHtml(quantityLabel(l))}</td>
          <td style="${cell};text-align:right;white-space:nowrap;padding-left:12px;font-weight:700">${money(l.total)}</td>
        </tr>`).join('')
  const discountRows = discount > 0 ? `
        <tr>
          <td colspan="2" style="padding:10px 0 2px;font-size:13px;color:#666666">Subtotal</td>
          <td style="padding:10px 0 2px;font-size:13px;color:#666666;text-align:right">${money(gross)}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:2px 0 0;font-size:13px;color:#666666">Discount</td>
          <td style="padding:2px 0 0;font-size:13px;color:#666666;text-align:right">−${money(discount)}</td>
        </tr>` : ''
  const notesHtml = o.notes ? `
  <tr><td style="padding:0 32px 20px" class="wp-pad">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f5f2">
      <tr><td style="padding:14px 16px;font-size:13px;color:#444444;line-height:1.6"><strong style="color:#1a1a18">Notes</strong><br>${escapeHtml(o.notes).replace(/\n/g, '<br>')}</td></tr>
    </table>
  </td></tr>` : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(`${kind} ${o.poNumber}`)}</title>
<style>
  @media (max-width:620px){ .wp-pad{padding-left:18px!important;padding-right:18px!important} }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f0ede8;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(`${kind} ${o.poNumber} for ${o.deliverToName} · ${money(total)}`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0ede8">
<tr><td align="center" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #dedad4">
  <tr><td class="wp-pad" style="padding:28px 32px 22px;border-bottom:1px solid #e8e6e2">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#1a1a18">${FIRM_EMAIL.name}</div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#b4532a;margin-top:18px">${kind}</div>
    <div style="font-size:26px;font-weight:700;color:#1a1a18;margin-top:4px;letter-spacing:-0.02em">${escapeHtml(o.poNumber)}</div>
    <div style="font-size:13px;color:#777777;margin-top:6px">${escapeHtml(o.brandName)} &nbsp;·&nbsp; ${escapeHtml(date)}</div>
  </td></tr>
  <tr><td class="wp-pad" style="padding:18px 32px;border-bottom:1px solid #e8e6e2;background-color:#faf8f5">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#999999;margin-bottom:6px">Deliver to</div>
    <div style="font-size:15px;font-weight:700;color:#1a1a18">${escapeHtml(o.deliverToName)}</div>
    ${o.deliverToAddress ? `<div style="font-size:13px;color:#555555;margin-top:3px">${escapeHtml(o.deliverToAddress)}</div>` : ''}
    ${o.deliverToPhone ? `<div style="font-size:13px;color:#555555;margin-top:2px">${escapeHtml(o.deliverToPhone)}</div>` : ''}
  </td></tr>
  <tr><td class="wp-pad" style="padding:20px 32px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <th align="left" style="${th};text-align:left">Product</th>
        <th align="right" style="${th};text-align:right;padding-left:12px">Qty</th>
        <th align="right" style="${th};text-align:right;padding-left:12px">Total</th>
      </tr>
      ${rows}
      ${discountRows}
      <tr>
        <td colspan="2" style="padding:12px 0 0;font-size:16px;font-weight:700;color:#1a1a18">Total</td>
        <td style="padding:12px 0 0;text-align:right;font-size:20px;font-weight:700;color:#1a1a18;white-space:nowrap">${money(total)}</td>
      </tr>
    </table>
  </td></tr>
  ${notesHtml}
  <tr><td class="wp-pad" style="padding:0 32px 26px">
    <p style="font-size:14px;color:#444444;line-height:1.6;margin:0">${ask}</p>
  </td></tr>
  <tr><td class="wp-pad" style="padding:16px 32px;border-top:1px solid #e8e6e2;background-color:#faf8f5;font-size:12px;color:#888888;line-height:1.6">
    ${FIRM_EMAIL.name} &nbsp;·&nbsp; ${FIRM_EMAIL.city} &nbsp;·&nbsp; <a href="https://${FIRM_EMAIL.site}" style="color:#888888">${FIRM_EMAIL.site}</a><br>
    Reply to this email to reach our team.
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`

  return { subject, text, html }
}
