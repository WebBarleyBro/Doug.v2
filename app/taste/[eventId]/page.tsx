'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Star, Check, ChevronRight, ChevronLeft, Plus, X } from 'lucide-react'
import { saveTastingConsumer } from '../../lib/data'
import { t, inputStyle } from '../../lib/theme'

const RESET_DELAY = 5000
const RATING_LABELS = ['', 'Not for me', 'It was okay', 'Pretty good', 'Really enjoyed it', 'Absolutely loved it!']
type Step = 'products' | 'rate' | 'contact' | 'done'

export default function TastingKiosk() {
  const { eventId } = useParams() as { eventId: string }
  const [event, setEvent] = useState<any>(null)
  const [client, setClient] = useState<any>(null)
  const [catalog, setCatalog] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState<Step>('products')
  const [selected, setSelected] = useState<string[]>([])
  const [customInput, setCustomInput] = useState('')
  const [ratings, setRatings] = useState<Record<string, { rating: number; would_buy: boolean | null }>>({})
  const [rateIdx, setRateIdx] = useState(0)
  const [contact, setContact] = useState({ first_name: '', email: '', notes: '', opted_in: false })
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(RESET_DELAY / 1000)

  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch(`/api/tasting/${eventId}`)
      .then(r => r.json())
      .then(({ event, client, products }) => {
        if (event) setEvent(event)
        if (client) setClient(client)
        if (products?.length) setCatalog(products)
      })
      .finally(() => setLoading(false))
  }, [eventId])

  function doReset() {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    setStep('products')
    setSelected([])
    setCustomInput('')
    setRatings({})
    setRateIdx(0)
    setContact({ first_name: '', email: '', notes: '', opted_in: false })
    setCountdown(RESET_DELAY / 1000)
  }

  useEffect(() => {
    if (step !== 'done') return
    setCountdown(RESET_DELAY / 1000)
    countdownTimer.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(countdownTimer.current!); return 0 }
        return c - 1
      })
    }, 1000)
    resetTimer.current = setTimeout(doReset, RESET_DELAY)
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
      if (countdownTimer.current) clearInterval(countdownTimer.current)
    }
  }, [step])

  function toggleProduct(name: string) {
    setSelected(s => s.includes(name) ? s.filter(p => p !== name) : [...s, name])
  }

  function addCustom() {
    const name = customInput.trim()
    if (!name || selected.includes(name)) { setCustomInput(''); return }
    setSelected(s => [...s, name])
    setCustomInput('')
  }

  function setRating(product: string, rating: number) {
    setRatings(r => ({ ...r, [product]: { ...r[product], rating, would_buy: r[product]?.would_buy ?? null } }))
  }

  function setWouldBuy(product: string, val: boolean | null) {
    setRatings(r => ({ ...r, [product]: { ...r[product], would_buy: val, rating: r[product]?.rating ?? 0 } }))
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const entries = Object.entries(ratings).filter(([, r]) => r.rating > 0)
      if (entries.length === 0) {
        await saveTastingConsumer({
          event_id: eventId, client_id: client?.id,
          first_name: contact.first_name || undefined,
          email: contact.email || undefined,
          notes: contact.notes || undefined,
          opted_in_marketing: contact.email ? contact.opted_in : false,
          captured_at: new Date().toISOString(),
        })
      } else {
        await Promise.all(entries.map(([product, r]) =>
          saveTastingConsumer({
            event_id: eventId, client_id: client?.id,
            first_name: contact.first_name || undefined,
            email: contact.email || undefined,
            product_rated: product,
            rating: r.rating,
            would_buy: r.would_buy ?? undefined,
            notes: contact.notes || undefined,
            opted_in_marketing: contact.email ? contact.opted_in : false,
            captured_at: new Date().toISOString(),
          })
        ))
      }
      setStep('done')
    } catch { }
    finally { setSubmitting(false) }
  }

  const accent = client?.color || t.gold
  const currentProduct = selected[rateIdx]
  const currentRating = currentProduct ? (ratings[currentProduct] ?? { rating: 0, would_buy: null }) : null
  const allRated = selected.length > 0 && selected.every(p => (ratings[p]?.rating ?? 0) > 0)

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${accent}`, borderTop: '3px solid transparent', animation: 'spin 700ms linear infinite' }} />
    </div>
  )

  if (!event) return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🍸</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: t.text.primary, marginBottom: 8 }}>Event not found</h2>
        <p style={{ fontSize: 14, color: t.text.muted }}>This tasting link may have expired or been removed.</p>
      </div>
    </div>
  )

  // ── Shared brand header ──────────────────────────────────────────────────
  const BrandHeader = () => (
    <div style={{ backgroundColor: accent + '12', borderBottom: `1px solid ${accent}25`, padding: '18px 24px', textAlign: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: accent + '20', border: `2px solid ${accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: 20, fontWeight: 800, color: accent }}>
        {client?.name?.charAt(0) || '🥃'}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: t.text.primary }}>{client?.name || 'Tasting Feedback'}</div>
      {event.title && <div style={{ fontSize: 12, color: t.text.muted, marginTop: 2 }}>{event.title}{event.accounts?.name ? ` · ${event.accounts.name}` : ''}</div>}
    </div>
  )

  // ── DONE ─────────────────────────────────────────────────────────────────
  if (step === 'done') return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }}>
      <BrandHeader />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 100px)', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', backgroundColor: accent + '20', border: `2px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Check size={44} color={accent} strokeWidth={2.5} />
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.02em', marginBottom: 10 }}>
            {contact.first_name ? `Thanks, ${contact.first_name}!` : 'Thank you!'}
          </h2>
          <p style={{ fontSize: 15, color: t.text.secondary, lineHeight: 1.6, marginBottom: 8 }}>
            Your feedback helps {client?.name || 'the team'} craft better spirits.
          </p>
          {contact.opted_in && contact.email && (
            <p style={{ fontSize: 13, color: accent, marginBottom: 16, fontWeight: 500 }}>
              You're on the list — we'll only send the good stuff.
            </p>
          )}
          <p style={{ fontSize: 13, color: t.text.muted, marginBottom: 28 }}>Next person in {countdown}s…</p>
          <button onClick={doReset} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 14, fontSize: 16, fontWeight: 700, background: accent, color: '#0f0f0d', border: 'none', cursor: 'pointer', margin: '0 auto' }}>
            Next Person <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )

  // ── CONTACT ───────────────────────────────────────────────────────────────
  if (step === 'contact') return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }}>
      <BrandHeader />
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '36px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: t.text.muted, textTransform: 'uppercase', marginBottom: 6 }}>Step 3 of 3</p>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.02em', marginBottom: 6 }}>Almost done</h2>
          <p style={{ fontSize: 14, color: t.text.secondary }}>Leave your info to hear about new releases — totally optional.</p>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input type="text" placeholder="First name" value={contact.first_name}
            onChange={e => setContact(c => ({ ...c, first_name: e.target.value }))}
            style={{ ...inputStyle, flex: 1, borderRadius: 10, fontSize: 15 }} />
          <input type="email" placeholder="Email address" value={contact.email}
            onChange={e => setContact(c => ({ ...c, email: e.target.value }))}
            style={{ ...inputStyle, flex: 2, borderRadius: 10, fontSize: 15 }} />
        </div>

        {contact.email && (
          <button type="button" onClick={() => setContact(c => ({ ...c, opted_in: !c.opted_in }))}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', width: '100%', marginBottom: 16, border: `1.5px solid ${contact.opted_in ? accent : t.border.default}`, borderRadius: 10, backgroundColor: contact.opted_in ? accent + '15' : 'transparent', color: contact.opted_in ? accent : t.text.muted, cursor: 'pointer', fontSize: 14, transition: 'all 150ms ease' }}>
            <div style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${contact.opted_in ? accent : t.border.hover}`, backgroundColor: contact.opted_in ? accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {contact.opted_in && <Check size={12} color="#0f0f0d" strokeWidth={3} />}
            </div>
            Yes, keep me updated on new releases
          </button>
        )}

        <textarea placeholder="Any other thoughts? (optional)" value={contact.notes}
          onChange={e => setContact(c => ({ ...c, notes: e.target.value }))} rows={3}
          style={{ ...inputStyle, resize: 'none', borderRadius: 10, fontSize: 15, lineHeight: 1.5, marginBottom: 20 }} />

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: '18px', borderRadius: 14, fontSize: 18, fontWeight: 700, background: accent, color: '#0f0f0d', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', marginBottom: 12, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Submitting…' : 'Submit Feedback'}
        </button>
        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 500, background: 'transparent', color: t.text.muted, border: `1px solid ${t.border.default}`, cursor: 'pointer' }}>
          Skip & Submit (no contact info)
        </button>
      </div>
    </div>
  )

  // ── RATE ──────────────────────────────────────────────────────────────────
  if (step === 'rate') return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }}>
      <BrandHeader />
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '36px 24px' }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
          {selected.map((_, i) => (
            <div key={i} style={{ width: i === rateIdx ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i === rateIdx ? accent : (ratings[selected[i]]?.rating > 0 ? accent + '60' : t.border.default), transition: 'all 200ms ease' }} />
          ))}
        </div>

        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: t.text.muted, textTransform: 'uppercase', marginBottom: 6 }}>
            Product {rateIdx + 1} of {selected.length}
          </p>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.02em' }}>{currentProduct}</h2>
        </div>

        {/* Stars */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <p style={{ fontSize: 14, color: t.text.secondary, marginBottom: 16 }}>How did you enjoy it?</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => setRating(currentProduct, n)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, transform: (currentRating?.rating ?? 0) >= n ? 'scale(1.15)' : 'scale(1)', transition: 'transform 120ms ease' }}>
                <Star size={52} fill={(currentRating?.rating ?? 0) >= n ? accent : 'transparent'} color={(currentRating?.rating ?? 0) >= n ? accent : t.border.hover} strokeWidth={1.5} />
              </button>
            ))}
          </div>
          {(currentRating?.rating ?? 0) > 0 && (
            <p style={{ fontSize: 15, color: accent, marginTop: 10, fontWeight: 600 }}>
              {RATING_LABELS[currentRating!.rating]}
            </p>
          )}
        </div>

        {/* Would buy */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 14, color: t.text.secondary, marginBottom: 12, fontWeight: 500 }}>Would you buy this?</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {([{ label: '👍 Yes!', value: true }, { label: '🤔 Maybe', value: null }, { label: '👎 Not for me', value: false }] as const).map(opt => {
              const active = currentRating?.would_buy === opt.value && (opt.value !== null || currentRating?.would_buy === null && ratings[currentProduct]?.would_buy !== undefined)
              // cleaner active check
              const isActive = opt.value === true ? currentRating?.would_buy === true
                : opt.value === false ? currentRating?.would_buy === false
                  : currentRating?.would_buy === null && ratings[currentProduct] !== undefined
              return (
                <button key={String(opt.value)} type="button" onClick={() => setWouldBuy(currentProduct, opt.value)}
                  style={{ flex: 1, padding: '14px 8px', borderRadius: 12, fontSize: 14, cursor: 'pointer', fontWeight: 600, border: `1.5px solid ${isActive ? accent : t.border.default}`, backgroundColor: isActive ? accent + '20' : 'transparent', color: isActive ? accent : t.text.secondary, transition: 'all 120ms ease' }}>
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => rateIdx > 0 ? setRateIdx(i => i - 1) : setStep('products')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 20px', borderRadius: 12, fontSize: 15, fontWeight: 600, background: 'transparent', color: t.text.secondary, border: `1.5px solid ${t.border.default}`, cursor: 'pointer', flexShrink: 0 }}>
            <ChevronLeft size={16} /> Back
          </button>
          <button
            onClick={() => rateIdx < selected.length - 1 ? setRateIdx(i => i + 1) : setStep('contact')}
            disabled={!currentRating || currentRating.rating === 0}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 20px', borderRadius: 12, fontSize: 15, fontWeight: 700, background: (currentRating?.rating ?? 0) > 0 ? accent : t.border.default, color: (currentRating?.rating ?? 0) > 0 ? '#0f0f0d' : t.text.muted, border: 'none', cursor: (currentRating?.rating ?? 0) > 0 ? 'pointer' : 'not-allowed', transition: 'all 150ms ease' }}>
            {rateIdx < selected.length - 1 ? <>Next <ChevronRight size={16} /></> : <>Almost done <ChevronRight size={16} /></>}
          </button>
        </div>
        <p style={{ fontSize: 12, color: t.text.muted, textAlign: 'center', marginTop: 12 }}>A star rating is required to continue</p>
      </div>
    </div>
  )

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  const hasCatalog = catalog.length > 0
  return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }}>
      <BrandHeader />
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '36px 24px' }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: t.text.muted, textTransform: 'uppercase', marginBottom: 6 }}>Step 1 of 3</p>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.02em', marginBottom: 6 }}>What did you taste today?</h2>
          <p style={{ fontSize: 14, color: t.text.secondary }}>Tap everything you tried — you'll rate each one next.</p>
        </div>

        {hasCatalog ? (
          <>
            {/* Select all */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button type="button"
                onClick={() => selected.length === catalog.length ? setSelected([]) : setSelected(catalog.map(p => p.name))}
                style={{ fontSize: 13, color: accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '4px 0' }}>
                {selected.length === catalog.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            {/* Product grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
              {catalog.map(p => {
                const active = selected.includes(p.name)
                return (
                  <button key={p.id} type="button" onClick={() => toggleProduct(p.name)}
                    style={{ textAlign: 'left', padding: '16px 18px', borderRadius: 14, border: `2px solid ${active ? accent : t.border.default}`, backgroundColor: active ? accent + '12' : t.bg.card, cursor: 'pointer', transition: 'all 150ms ease', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: active ? accent : t.text.primary, lineHeight: 1.3, marginBottom: p.category ? 6 : 0 }}>{p.name}</div>
                        {p.category && <div style={{ fontSize: 11, fontWeight: 600, color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.category}</div>}
                      </div>
                      <div style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${active ? accent : t.border.default}`, backgroundColor: active ? accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 150ms ease' }}>
                        {active && <Check size={14} color="#0f0f0d" strokeWidth={3} />}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Add unlisted product */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 13, color: t.text.muted, marginBottom: 8 }}>Tried something not listed?</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={customInput} onChange={e => setCustomInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustom()}
                  placeholder="Product name..." style={{ ...inputStyle, flex: 1, borderRadius: 10, fontSize: 15 }} />
                <button type="button" onClick={addCustom} disabled={!customInput.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: customInput.trim() ? accent : t.border.default, color: customInput.trim() ? '#0f0f0d' : t.text.muted, border: 'none', cursor: customInput.trim() ? 'pointer' : 'not-allowed' }}>
                  <Plus size={16} /> Add
                </button>
              </div>
              {/* Show custom-added chips (not in catalog) */}
              {selected.filter(s => !catalog.find((p: any) => p.name === s)).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {selected.filter(s => !catalog.find((p: any) => p.name === s)).map(name => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, backgroundColor: accent + '20', border: `1px solid ${accent}40`, fontSize: 13, color: accent, fontWeight: 600 }}>
                      {name}
                      <button type="button" onClick={() => setSelected(s => s.filter(p => p !== name))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: accent }}>
                        <X size={13} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* No catalog — free text only */
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input type="text" value={customInput} onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
                placeholder="e.g. Bourbon, Gin, Rye Whiskey..." style={{ ...inputStyle, flex: 1, borderRadius: 10, fontSize: 15 }} />
              <button type="button" onClick={addCustom} disabled={!customInput.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: customInput.trim() ? accent : t.border.default, color: customInput.trim() ? '#0f0f0d' : t.text.muted, border: 'none', cursor: customInput.trim() ? 'pointer' : 'not-allowed' }}>
                <Plus size={16} /> Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {selected.map(name => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, backgroundColor: accent + '20', border: `1px solid ${accent}40`, fontSize: 14, color: accent, fontWeight: 600 }}>
                  {name}
                  <button type="button" onClick={() => setSelected(s => s.filter(p => p !== name))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: accent }}>
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => { setRateIdx(0); setStep('rate') }}
          disabled={selected.length === 0}
          style={{ width: '100%', padding: '18px', borderRadius: 14, fontSize: 17, fontWeight: 700, background: selected.length > 0 ? accent : t.border.default, color: selected.length > 0 ? '#0f0f0d' : t.text.muted, border: 'none', cursor: selected.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 150ms ease' }}>
          {selected.length > 0
            ? <>Rate {selected.length} product{selected.length > 1 ? 's' : ''} <ChevronRight size={18} /></>
            : 'Select at least one product'}
        </button>
      </div>
    </div>
  )
}
