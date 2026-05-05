'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Star, Check, ChevronRight } from 'lucide-react'
import { saveTastingConsumer } from '../../lib/data'
import { t, inputStyle } from '../../lib/theme'

const RESET_DELAY = 4000

export default function TastingCapturePage() {
  const { eventId } = useParams() as { eventId: string }
  const [event, setEvent] = useState<any>(null)
  const [client, setClient] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(RESET_DELAY / 1000)
  const [form, setForm] = useState({
    first_name: '',
    email: '',
    product_rated: '',
    rating: 0,
    would_buy: null as boolean | null,
    notes: '',
    opted_in_marketing: false,
  })
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch(`/api/tasting/${eventId}`)
      .then(r => r.json())
      .then(({ event, client }) => {
        if (event) setEvent(event)
        if (client) setClient(client)
      })
      .finally(() => setLoading(false))
  }, [eventId])

  function resetForm() {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    setSubmitted(false)
    setCountdown(RESET_DELAY / 1000)
    setForm({ first_name: '', email: '', product_rated: '', rating: 0, would_buy: null, notes: '', opted_in_marketing: false })
  }

  useEffect(() => {
    if (!submitted) return
    setCountdown(RESET_DELAY / 1000)
    countdownTimerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
    resetTimerRef.current = setTimeout(resetForm, RESET_DELAY)
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [submitted])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.rating || submitting) return
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
        opted_in_marketing: form.email ? form.opted_in_marketing : false,
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

  if (!event) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🍸</div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: t.text.primary, marginBottom: '8px' }}>Event not found</h2>
          <p style={{ fontSize: '14px', color: t.text.muted }}>This tasting link may have expired or been removed.</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '340px' }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', backgroundColor: accentColor + '20', border: `2px solid ${accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Check size={44} color={accentColor} strokeWidth={2.5} />
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em', marginBottom: '10px' }}>
            {form.first_name ? `Thanks, ${form.first_name}!` : 'Thank you!'}
          </h2>
          <p style={{ fontSize: '15px', color: t.text.secondary, lineHeight: 1.6, marginBottom: '8px' }}>
            Your feedback helps {client?.name || 'the brand'} craft better spirits.
          </p>
          {form.opted_in_marketing && (
            <p style={{ fontSize: '13px', color: accentColor, marginBottom: '8px', fontWeight: '500' }}>
              You're on the list — we'll only send the good stuff.
            </p>
          )}
          <p style={{ fontSize: '12px', color: t.text.muted, marginBottom: '28px' }}>
            Next person in {countdown}s…
          </p>
          <button
            onClick={resetForm}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 28px', borderRadius: '12px', fontSize: '16px', fontWeight: '700', background: accentColor, color: '#0f0f0d', border: 'none', cursor: 'pointer', margin: '0 auto' }}
          >
            Next Person <ChevronRight size={18} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, color: t.text.primary, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', WebkitFontSmoothing: 'antialiased' }}>
      {/* Brand header */}
      <div style={{ backgroundColor: accentColor + '15', borderBottom: `1px solid ${accentColor}30`, padding: '20px 24px', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '12px', backgroundColor: accentColor + '20', border: `2px solid ${accentColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: '22px', fontWeight: '800', color: accentColor }}>
          {client?.name?.charAt(0) || '🥃'}
        </div>
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.01em' }}>
          {client?.name || 'Tasting Feedback'}
        </h1>
        {event && <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '4px' }}>{event.title}{event.accounts?.name ? ` · ${event.accounts.name}` : ''}</p>}
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: '480px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Star rating — required */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ fontSize: '16px', fontWeight: '600', color: t.text.primary, marginBottom: '18px' }}>How did you enjoy it?</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => setForm(f => ({ ...f, rating: n }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', transition: 'transform 120ms ease', transform: form.rating >= n ? 'scale(1.15)' : 'scale(1)' }}>
                <Star size={44} fill={form.rating >= n ? accentColor : 'transparent'} color={form.rating >= n ? accentColor : t.border.hover} strokeWidth={1.5} />
              </button>
            ))}
          </div>
          {form.rating > 0 && (
            <p style={{ fontSize: '14px', color: accentColor, marginTop: '10px', fontWeight: '600' }}>
              {['', 'Not for me', 'It was okay', 'Pretty good', 'Really enjoyed it', 'Absolutely loved it!'][form.rating]}
            </p>
          )}
        </div>

        {/* Would buy */}
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '14px', color: t.text.secondary, marginBottom: '10px', fontWeight: '500' }}>Would you buy this?</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([{ label: 'Yes!', value: true }, { label: 'Maybe', value: null }, { label: 'Not for me', value: false }] as const).map(opt => (
              <button key={String(opt.value)} type="button" onClick={() => setForm(f => ({ ...f, would_buy: opt.value }))} style={{
                flex: 1, padding: '12px 8px', borderRadius: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '500',
                border: `1.5px solid ${form.would_buy === opt.value ? accentColor : t.border.default}`,
                backgroundColor: form.would_buy === opt.value ? accentColor + '20' : 'transparent',
                color: form.would_buy === opt.value ? accentColor : t.text.secondary,
                transition: 'all 120ms ease',
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '24px' }}>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Any tasting notes or comments? (optional)" rows={3}
            style={{ ...inputStyle, resize: 'none', borderRadius: '10px', fontSize: '15px', lineHeight: 1.5 }} />
        </div>

        {/* Submit */}
        <button type="submit" disabled={!form.rating || submitting} style={{
          width: '100%', padding: '16px', borderRadius: '14px', fontSize: '17px', fontWeight: '700',
          background: form.rating ? `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%)` : t.status.neutralBg,
          color: form.rating ? '#0f0f0d' : t.text.muted,
          border: 'none', cursor: form.rating ? 'pointer' : 'not-allowed',
          transition: 'all 150ms ease',
          letterSpacing: '-0.01em',
          marginBottom: '28px',
        }}>
          {submitting ? 'Submitting…' : 'Submit Feedback'}
        </button>

        {/* Optional contact section — visually secondary */}
        <div style={{ borderTop: `1px solid ${t.border.subtle}`, paddingTop: '24px' }}>
          <p style={{ fontSize: '13px', color: t.text.muted, marginBottom: '14px', textAlign: 'center' }}>
            Want to hear about new releases? Leave your info — totally optional.
          </p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input type="text" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
              placeholder="First name" style={{ ...inputStyle, flex: 1, borderRadius: '10px' }} />
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="Email" style={{ ...inputStyle, flex: 2, borderRadius: '10px' }} />
          </div>
          {form.email && (
            <button type="button" onClick={() => setForm(f => ({ ...f, opted_in_marketing: !f.opted_in_marketing }))} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', width: '100%',
              border: `1px solid ${form.opted_in_marketing ? accentColor : t.border.default}`,
              borderRadius: '8px', backgroundColor: form.opted_in_marketing ? accentColor + '15' : 'transparent',
              color: form.opted_in_marketing ? accentColor : t.text.muted,
              cursor: 'pointer', fontSize: '13px', transition: 'all 150ms ease',
            }}>
              <div style={{ width: 18, height: 18, borderRadius: '4px', border: `1.5px solid ${form.opted_in_marketing ? accentColor : t.border.hover}`, backgroundColor: form.opted_in_marketing ? accentColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {form.opted_in_marketing && <Check size={11} color="#0f0f0d" strokeWidth={3} />}
              </div>
              Yes, keep me updated on new releases
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
