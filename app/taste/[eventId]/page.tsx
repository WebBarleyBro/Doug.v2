'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Star, Check } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'
import { saveTastingConsumer } from '../../lib/data'
import { t, inputStyle } from '../../lib/theme'
import type { Client } from '../../lib/types'

export default function TastingCapturePage() {
  const { eventId } = useParams() as { eventId: string }
  const [event, setEvent] = useState<any>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    first_name: '',
    email: '',
    product_rated: '',
    rating: 0,
    would_buy: null as boolean | null,
    notes: '',
    opted_in_marketing: false,
  })

  useEffect(() => {
    const sb = getSupabase()
    sb.from('events').select('*, accounts(name)').eq('id', eventId).single()
      .then(async ({ data }) => {
        if (data) {
          setEvent(data)
          if (data.client_slug) {
            const { data: cl } = await sb.from('clients').select('*').eq('slug', data.client_slug).single()
            if (cl) setClient(cl)
          }
        }
        setLoading(false)
      })
  }, [eventId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.rating) return
    setSubmitting(true)
    try {
      await saveTastingConsumer({
        event_id: eventId,
        client_id: client?.id,
        first_name: form.first_name || undefined,
        email: form.email || undefined,
        product_rated: form.product_rated || undefined,
        rating: form.rating,
        would_buy: form.would_buy ?? undefined,
        notes: form.notes || undefined,
        opted_in_marketing: form.opted_in_marketing,
        captured_at: new Date().toISOString(),
      })
      setSubmitted(true)
    } catch { }
    finally { setSubmitting(false) }
  }

  const accentColor = client?.color || t.gold

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${t.gold}`, borderTop: `3px solid transparent`, animation: 'spin 700ms linear infinite' }} />
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: accentColor + '20', border: `2px solid ${accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Check size={36} color={accentColor} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em', marginBottom: '8px' }}>
            Thank you!
          </h2>
          <p style={{ fontSize: '14px', color: t.text.secondary, lineHeight: 1.6 }}>
            Your feedback helps {client?.name || 'the brand'} craft better spirits. We really appreciate it!
          </p>
          {form.opted_in_marketing && (
            <p style={{ fontSize: '12px', color: t.text.muted, marginTop: '12px' }}>
              You're subscribed to updates — we'll only send the good stuff.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, color: t.text.primary, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', WebkitFontSmoothing: 'antialiased' }}>
      {/* Brand header */}
      <div style={{ backgroundColor: accentColor + '15', borderBottom: `1px solid ${accentColor}30`, padding: '20px 24px', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '12px', backgroundColor: accentColor + '20', border: `2px solid ${accentColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: '20px', fontWeight: '800', color: accentColor }}>
          {client?.name?.charAt(0) || '🥃'}
        </div>
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.01em' }}>
          {client?.name || 'Tasting Feedback'}
        </h1>
        {event && <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '4px' }}>{event.title}{event.accounts?.name ? ` · ${event.accounts.name}` : ''}</p>}
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: '420px', margin: '0 auto', padding: '28px 20px' }}>
        {/* Star rating */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <p style={{ fontSize: '14px', color: t.text.secondary, marginBottom: '14px' }}>How did you enjoy the spirit?</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => setForm(f => ({ ...f, rating: n }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', transition: 'transform 150ms ease', transform: form.rating >= n ? 'scale(1.1)' : 'scale(1)' }}>
                <Star size={36} fill={form.rating >= n ? accentColor : 'transparent'} color={form.rating >= n ? accentColor : t.text.muted} />
              </button>
            ))}
          </div>
          {form.rating > 0 && (
            <p style={{ fontSize: '13px', color: accentColor, marginTop: '8px', fontWeight: '600' }}>
              {['', 'Not for me', 'It was okay', 'Pretty good', 'Really enjoyed it', 'Absolutely loved it!'][form.rating]}
            </p>
          )}
        </div>

        {/* Would buy */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', color: t.text.secondary, marginBottom: '10px', fontWeight: '500' }}>Would you buy this?</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[{ label: 'Yes!', value: true }, { label: 'Maybe', value: null }, { label: 'Not for me', value: false }].map(opt => (
              <button key={String(opt.value)} type="button" onClick={() => setForm(f => ({ ...f, would_buy: opt.value }))} style={{
                flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500',
                border: `1px solid ${form.would_buy === opt.value ? accentColor : t.border.default}`,
                backgroundColor: form.would_buy === opt.value ? accentColor + '20' : 'transparent',
                color: form.would_buy === opt.value ? accentColor : t.text.secondary,
                transition: 'all 150ms ease',
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Optional fields */}
        <div style={{ marginBottom: '14px' }}>
          <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Any comments? What did you taste?" style={{ ...inputStyle, borderRadius: '10px' }} />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <input type="text" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
            placeholder="First name (optional)" style={{ ...inputStyle, borderRadius: '10px' }} />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Email (optional)" style={{ ...inputStyle, borderRadius: '10px' }} />
        </div>

        {/* Opt-in */}
        {form.email && (
          <button type="button" onClick={() => setForm(f => ({ ...f, opted_in_marketing: !f.opted_in_marketing }))} style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', width: '100%',
            border: `1px solid ${form.opted_in_marketing ? accentColor : t.border.default}`,
            borderRadius: '8px', backgroundColor: form.opted_in_marketing ? accentColor + '15' : 'transparent',
            color: form.opted_in_marketing ? accentColor : t.text.muted,
            cursor: 'pointer', fontSize: '13px', marginBottom: '16px', transition: 'all 150ms ease',
          }}>
            <div style={{ width: 18, height: 18, borderRadius: '4px', border: `1.5px solid ${form.opted_in_marketing ? accentColor : t.border.hover}`, backgroundColor: form.opted_in_marketing ? accentColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {form.opted_in_marketing && <Check size={11} color="#0f0f0d" strokeWidth={3} />}
            </div>
            Keep me updated on new releases
          </button>
        )}

        <button type="submit" disabled={!form.rating || submitting} style={{
          width: '100%', padding: '14px', borderRadius: '12px', fontSize: '16px', fontWeight: '700',
          background: form.rating ? `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%)` : t.status.neutralBg,
          color: form.rating ? '#0f0f0d' : t.text.muted,
          border: 'none', cursor: form.rating ? 'pointer' : 'not-allowed',
          transition: 'all 150ms ease',
          letterSpacing: '-0.01em',
        }}>
          {submitting ? 'Submitting...' : 'Submit Feedback'}
        </button>
      </form>
    </div>
  )
}
