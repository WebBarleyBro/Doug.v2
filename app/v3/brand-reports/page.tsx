'use client'
// Brand reports: see and control the monthly and quarterly reports that go out
// automatically on the 1st (see /api/reports/send). Owners and admins only.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Send, Eye, X, Plus, Check, RotateCcw } from 'lucide-react'
import { v3 } from '../lib/theme'
import { getSupabase } from '../../lib/supabase'
import { useV3Toast } from '../lib/context'

interface Recipients { contacts: string[]; logins: string[]; extra: string[]; excluded: string[]; final: string[] }
interface Row {
  brand: string; brandName: string; report: string; kind: 'monthly' | 'quarterly'; enabled: boolean; filename: string
  figures?: { accounts: number; orders: number; value: number }
  recipientDetail?: Recipients; recipients?: string[]; alreadySent?: boolean; status?: string
}
interface Settings { client_slug: string; monthly_enabled: boolean; quarterly_enabled: boolean; include_portal_logins: boolean; extra_recipients: string[]; excluded_recipients: string[] }
interface HistoryItem { name: string; label: string; url: string; sentAt: string | null }

const TZ = 'America/Denver'
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

function monthKeyMT(d = new Date()) { return d.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7) }
function addMonths(key: string, n: number) { const [y, m] = key.split('-').map(Number); const i = y * 12 + m - 1 + n; return `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}` }
function monthLabel(key: string) { return new Date(key + '-15T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }) }

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await getSupabase().auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

export default function BrandReportsPage() {
  const { show: toast } = useV3Toast()
  const current = monthKeyMT()
  const [month, setMonth] = useState(current)                       // the month the next automatic send covers
  const [rows, setRows] = useState<Row[]>([])
  const [meta, setMeta] = useState<{ configured: boolean; quarter: string | null; quarterKey: string | null } | null>(null)
  const [settings, setSettings] = useState<Record<string, Settings>>({})
  const [history, setHistory] = useState<Record<string, HistoryItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<Row | null>(null)

  // A month that closes a quarter also carries that quarter's report.
  const quarterParam = useMemo(() => {
    const m = Number(month.slice(5, 7))
    return m % 3 === 0 ? `q${m / 3}-${month.slice(0, 4)}` : null
  }, [month])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const h = await authHeader()
      const qs = `mode=dry&month=${month}${quarterParam ? `&quarter=${quarterParam}` : ''}`
      const [dryRes, histRes] = await Promise.all([fetch(`/api/reports/send?${qs}`, { headers: h }), fetch('/api/reports/send?mode=history', { headers: h })])
      const dry = await dryRes.json()
      if (!dryRes.ok) throw new Error(dry.error || 'Could not load reports')
      setRows(dry.results || []); setMeta({ configured: dry.configured, quarter: dry.quarter, quarterKey: dry.quarterKey })
      const hist = await histRes.json().catch(() => ({}))
      setHistory(hist.history || {})
      const { data: s } = await getSupabase().from('report_settings').select('*')
      setSettings(Object.fromEntries(((s || []) as Settings[]).map(r => [r.client_slug, r])))
    } catch (e) {
      console.error('brandReports.load', e)
      setError(e instanceof Error ? e.message : 'Could not load reports')
    } finally { setLoading(false) }
  }, [month, quarterParam])
  useEffect(() => { load() }, [load])

  const saveSettings = async (slug: string, patch: Partial<Settings>) => {
    const base: Settings = settings[slug] || { client_slug: slug, monthly_enabled: false, quarterly_enabled: false, include_portal_logins: true, extra_recipients: [], excluded_recipients: [] }
    const next = { ...base, ...patch }
    setSettings(s => ({ ...s, [slug]: next }))
    const { data: { user } } = await getSupabase().auth.getUser()
    const { error: e } = await getSupabase().from('report_settings').upsert({ ...next, updated_at: new Date().toISOString(), updated_by: user?.id })
    if (e) { console.error('brandReports.save', e); toast(e.message.includes('report_settings') ? 'Run migration 071 first' : e.message, 'error'); load(); return }
    load()
  }

  const call = async (row: Row, mode: 'test' | 'send' | 'pdf') => {
    const key = `${row.brand}-${row.kind}-${mode}`
    setBusy(key)
    try {
      const qs = row.kind === 'monthly'
        ? `month=${month}&only=month`
        : `quarter=${meta?.quarterKey || quarterParam}&only=quarter`
      const res = await fetch(`/api/reports/send?mode=${mode}&slug=${row.brand}&${qs}${mode === 'send' && row.alreadySent ? '&force=1' : ''}`, { headers: await authHeader() })
      if (mode === 'pdf') {
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Could not build the PDF') }
        const url = URL.createObjectURL(await res.blob())
        window.open(url, '_blank', 'noopener')
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
        return
      }
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')
      const status = j.results?.[0]?.status || 'done'
      toast(status === 'sent' ? `${row.brandName} ${row.report} sent` : status === 'test sent to you' ? 'Test sent to your email' : status, status.startsWith('failed') ? 'error' : undefined)
      load()
    } catch (e) {
      console.error('brandReports.call', e)
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    } finally { setBusy(null) }
  }

  const brands = useMemo(() => {
    const by = new Map<string, Row[]>()
    for (const r of rows) by.set(r.brand, [...(by.get(r.brand) || []), r])
    return [...by.entries()]
  }, [rows])

  const nextSend = useMemo(() => {
    const [y, m] = addMonths(current, 1).split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1, 15)).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' })
  }, [current])

  const card: React.CSSProperties = { background: v3.bg.card, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, padding: '18px 20px' }
  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: v3.radius.sm, border: `1px solid ${v3.border.strong}`, background: 'transparent', color: v3.text.secondary, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: v3.font.ui }
  const label: React.CSSProperties = { fontSize: '10.5px', fontWeight: 700, color: v3.text.muted, textTransform: 'uppercase', letterSpacing: '0.12em' }

  const Toggle = ({ on, onChange, text }: { on: boolean; onChange: (v: boolean) => void; text: string }) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      style={{ ...btn, borderColor: on ? v3.amber + '80' : v3.border.strong, color: on ? v3.text.primary : v3.text.muted, background: on ? v3.amberDim : 'transparent' }}>
      <span style={{ width: 26, height: 14, borderRadius: 8, background: on ? v3.amber : 'rgba(255,255,255,0.15)', position: 'relative', display: 'inline-block' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 10, height: 10, borderRadius: 5, background: on ? '#000' : 'rgba(255,255,255,0.7)', transition: 'left 120ms' }} />
      </span>
      {text}
    </button>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px clamp(16px,3vw,28px) 48px', fontFamily: v3.font.ui }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: 0 }}>Brand reports</h1>
          <div style={{ fontSize: '13px', color: v3.text.muted, marginTop: 4, maxWidth: 620, lineHeight: 1.5 }}>
            Sent automatically at 9am Mountain Time on the 1st of each month. Quarterly reports also go out on Jan 1, Apr 1, Jul 1 and Oct 1. You and Chase are copied on every send.
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>Report month</span>
          <select value={month} onChange={e => setMonth(e.target.value)}
            style={{ background: v3.bg.elevated, color: v3.text.primary, border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.sm, padding: '8px 10px', fontSize: '13px', fontFamily: v3.font.ui }}>
            {Array.from({ length: 12 }, (_, i) => addMonths(current, -i)).map(k => (
              <option key={k} value={k}>{monthLabel(k)}{k === current ? ' (sends ' + nextSend.split(',')[1]?.trim() + ')' : ''}</option>
            ))}
          </select>
        </label>
      </div>

      {month === current && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 14, fontSize: '13px', color: v3.text.secondary }}>
          Next automatic send: <b style={{ color: v3.text.primary }}>{nextSend}</b> · {monthLabel(current)} reports{meta?.quarter ? ` and ${meta.quarter}` : ''}. Numbers below are {monthLabel(current)} so far.
        </div>
      )}
      {meta && !meta.configured && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 14, fontSize: '13px', color: v3.status.warning, borderColor: v3.status.warning + '55' }}>
          Automatic sending is off until migration 071 (report settings) is run in Supabase. Previews and tests work now.
        </div>
      )}
      {error && <div style={{ ...card, color: v3.status.danger, marginBottom: 14 }}>{error}</div>}
      {loading && !rows.length && <div style={{ color: v3.text.muted, fontSize: '13px' }}>Loading…</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {brands.map(([slug, brandRows]) => {
          const s = settings[slug]
          const detail = brandRows[0]?.recipientDetail
          const excluded = new Set((s?.excluded_recipients || []).map(e => e.toLowerCase()))
          const auto = [...(detail?.contacts || []), ...(s?.include_portal_logins === false ? [] : detail?.logins || [])]
          const autoUnique = [...new Map(auto.map(e => [e.toLowerCase(), e])).values()]
          const hist = history[slug] || []
          return (
            <section key={slug} style={card} aria-label={brandRows[0].brandName}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: v3.text.primary }}>{brandRows[0].brandName}</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Toggle on={!!s?.monthly_enabled} onChange={v => saveSettings(slug, { monthly_enabled: v })} text="Monthly" />
                  <Toggle on={!!s?.quarterly_enabled} onChange={v => saveSettings(slug, { quarterly_enabled: v })} text="Quarterly" />
                </div>
              </div>

              {brandRows.map(r => {
                const st = r.status || ''
                const color = st === 'will send' ? v3.status.success : st === 'off' ? v3.text.muted : st.startsWith('already') ? v3.status.info : v3.status.warning
                return (
                  <div key={r.kind} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${v3.border.subtle}`, marginTop: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', color: v3.text.primary, fontWeight: 600 }}>{r.report} {r.kind === 'quarterly' ? 'quarterly report' : 'report'}</div>
                      <div style={{ fontSize: '12px', color: v3.text.muted, marginTop: 3, fontFamily: v3.font.mono }}>
                        {r.figures ? `${r.figures.accounts} accounts · ${r.figures.orders} orders · ${money(r.figures.value)}` : ''}
                      </div>
                      <div style={{ fontSize: '12px', color, marginTop: 3 }}>{st === 'will send' ? 'Will send automatically' : st === 'off' ? 'Switched off' : st}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button type="button" style={btn} disabled={!!busy} onClick={() => call(r, 'pdf')}><Eye size={13} /> Preview</button>
                      <button type="button" style={btn} disabled={!!busy} onClick={() => call(r, 'test')}><FileText size={13} /> {busy === `${r.brand}-${r.kind}-test` ? 'Sending…' : 'Send test to me'}</button>
                      <button type="button" style={{ ...btn, color: v3.text.primary, borderColor: v3.amber + '80' }} disabled={!!busy || !r.figures} onClick={() => setConfirm(r)}><Send size={13} /> Send now</button>
                    </div>
                  </div>
                )
              })}

              <div style={{ borderTop: `1px solid ${v3.border.subtle}`, marginTop: 12, paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={label}>Recipients</span>
                  <Toggle on={s?.include_portal_logins !== false} onChange={v => saveSettings(slug, { include_portal_logins: v })} text="Include portal logins" />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[...autoUnique, ...(s?.extra_recipients || [])].map(e => {
                    const isExtra = (s?.extra_recipients || []).includes(e)
                    const off = excluded.has(e.toLowerCase())
                    return (
                      <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 10px', borderRadius: 999, border: `1px solid ${v3.border.strong}`, fontSize: '12.5px', color: off ? v3.text.muted : v3.text.secondary, textDecoration: off ? 'line-through' : 'none' }}>
                        {e}{isExtra ? <span style={{ color: v3.text.muted }}> · added</span> : null}
                        {off
                          ? <button type="button" aria-label={`Add back ${e}`} title="Add back" onClick={() => saveSettings(slug, { excluded_recipients: (s?.excluded_recipients || []).filter(x => x.toLowerCase() !== e.toLowerCase()) })} style={{ background: 'none', border: 0, color: v3.text.muted, cursor: 'pointer', display: 'flex' }}><RotateCcw size={12} /></button>
                          : <button type="button" aria-label={`Remove ${e}`} title="Remove" onClick={() => isExtra
                              ? saveSettings(slug, { extra_recipients: (s?.extra_recipients || []).filter(x => x !== e) })
                              : saveSettings(slug, { excluded_recipients: [...(s?.excluded_recipients || []), e] })} style={{ background: 'none', border: 0, color: v3.text.muted, cursor: 'pointer', display: 'flex' }}><X size={12} /></button>}
                      </span>
                    )
                  })}
                  {!autoUnique.length && !(s?.extra_recipients || []).length && <span style={{ fontSize: '12.5px', color: v3.text.muted }}>No email on file for this brand.</span>}
                </div>
                <form onSubmit={e => { e.preventDefault(); const v = (adding[slug] || '').trim(); if (!EMAIL_RE.test(v)) { toast('Enter a valid email', 'error'); return } saveSettings(slug, { extra_recipients: [...new Set([...(s?.extra_recipients || []), v])] }); setAdding(a => ({ ...a, [slug]: '' })) }}
                  style={{ display: 'flex', gap: 6, marginTop: 8, maxWidth: 420 }}>
                  <input type="email" value={adding[slug] || ''} onChange={e => setAdding(a => ({ ...a, [slug]: e.target.value }))} placeholder="Add a recipient"
                    style={{ flex: 1, minWidth: 0, background: v3.bg.elevated, color: v3.text.primary, border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.sm, padding: '7px 10px', fontSize: '13px', fontFamily: v3.font.ui }} />
                  <button type="submit" style={btn}><Plus size={13} /> Add</button>
                </form>
              </div>

              {hist.length > 0 && (
                <div style={{ borderTop: `1px solid ${v3.border.subtle}`, marginTop: 12, paddingTop: 12 }}>
                  <div style={{ ...label, marginBottom: 8 }}>Sent</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {hist.map(h => (
                      <a key={h.name} href={h.url} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none' }}>
                        <Check size={12} /> {h.label}{h.sentAt ? <span style={{ color: v3.text.muted }}> · {new Date(h.sentAt).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}</span> : null}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>

      {confirm && (
        <div role="dialog" aria-modal="true" aria-label="Send report now" onMouseDown={e => { if (e.target === e.currentTarget) setConfirm(null) }}
          style={{ position: 'fixed', inset: 0, background: v3.bg.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <div style={{ ...card, maxWidth: 440, width: '100%', background: v3.bg.elevated }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: v3.text.primary }}>Send {confirm.brandName}’s {confirm.report} report now?</div>
            <div style={{ fontSize: '13px', color: v3.text.secondary, marginTop: 8, lineHeight: 1.6 }}>
              It goes to {(confirm.recipients || []).join(', ') || 'no one (no email on file)'}, with you and Chase copied.
              {confirm.alreadySent ? ' This report was already sent once; it will be sent again.' : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" style={btn} onClick={() => setConfirm(null)}>Cancel</button>
              <button type="button" style={{ ...btn, background: v3.amber, color: '#000', borderColor: v3.amber }} disabled={!(confirm.recipients || []).length}
                onClick={() => { const r = confirm; setConfirm(null); call(r, 'send') }}><Send size={13} /> Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
