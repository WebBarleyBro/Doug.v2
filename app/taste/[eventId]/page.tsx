'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Star, Check, ChevronRight, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { saveTastingConsumer } from '../../lib/data'
import { t, inputStyle } from '../../lib/theme'

const RESET_DELAY = 5000
const RATING_LABELS = ['', 'Not for me', 'It was okay', 'Pretty good', 'Really enjoyed it', 'Absolutely loved it!']

type Step = 'select' | 'rate' | 'contact' | 'done'
type Item = {
  brandSlug: string
  brandName: string
  brandColor: string
  clientId: string
  productName?: string  // undefined = brand in general
}

function itemKey(i: Item) { return `${i.brandSlug}::${i.productName ?? ''}` }

function BrandLogo({ brand, size = 72 }: { brand: any; size?: number }) {
  const color = brand.color || '#c9a84c'
  if (brand.logo_url) {
    return <img src={brand.logo_url} alt={brand.name} style={{ width: size, height: size, borderRadius: size * 0.2, objectFit: 'cover', display: 'block' }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.2, backgroundColor: color + '22', border: `2px solid ${color}45`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 800, color }}>
      {brand.name.charAt(0)}
    </div>
  )
}

export default function TastingKiosk() {
  const { eventId } = useParams() as { eventId: string }
  const [event, setEvent] = useState<any>(null)
  const [brands, setBrands] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState<Step>('select')
  const [selected, setSelected] = useState<Item[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
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
      .then(({ event, brands }) => {
        if (event) setEvent(event)
        if (brands?.length) setBrands(brands)
      })
      .finally(() => setLoading(false))
  }, [eventId])

  function doReset() {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    setStep('select')
    setSelected([])
    setExpanded(null)
    setRatings({})
    setRateIdx(0)
    setContact({ first_name: '', email: '', notes: '', opted_in: false })
    setCountdown(RESET_DELAY / 1000)
  }

  useEffect(() => {
    if (step !== 'done') return
    setCountdown(RESET_DELAY / 1000)
    countdownTimer.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(countdownTimer.current!); return 0 } return c - 1 })
    }, 1000)
    resetTimer.current = setTimeout(doReset, RESET_DELAY)
    return () => { if (resetTimer.current) clearTimeout(resetTimer.current); if (countdownTimer.current) clearInterval(countdownTimer.current) }
  }, [step])

  function toggleBrand(brand: any) {
    const isSel = selected.some(s => s.brandSlug === brand.slug)
    if (isSel) {
      setSelected(s => s.filter(x => x.brandSlug !== brand.slug))
      if (expanded === brand.slug) setExpanded(null)
    } else {
      setSelected(s => [...s, { brandSlug: brand.slug, brandName: brand.name, brandColor: brand.color || t.gold, clientId: brand.id }])
    }
  }

  function toggleProduct(brand: any, p: any) {
    const isProductSel = selected.some(x => x.brandSlug === brand.slug && x.productName === p.name)
    const accent = brand.color || t.gold
    if (isProductSel) {
      const remaining = selected.filter(x => x.brandSlug === brand.slug && x.productName)
      if (remaining.length === 1) {
        // last product deselected — go back to brand-general
        setSelected(s => [...s.filter(x => x.brandSlug !== brand.slug), { brandSlug: brand.slug, brandName: brand.name, brandColor: accent, clientId: brand.id }])
      } else {
        setSelected(s => s.filter(x => !(x.brandSlug === brand.slug && x.productName === p.name)))
      }
    } else {
      // add product, remove brand-general if it exists
      setSelected(s => [
        ...s.filter(x => !(x.brandSlug === brand.slug && !x.productName)),
        { brandSlug: brand.slug, brandName: brand.name, brandColor: accent, clientId: brand.id, productName: p.name },
      ])
    }
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      await Promise.all(selected.map(item => {
        const r = ratings[itemKey(item)]
        return saveTastingConsumer({
          event_id: eventId, client_id: item.clientId || undefined,
          first_name: contact.first_name || undefined,
          email: contact.email || undefined,
          product_rated: item.productName || undefined,
          rating: r?.rating || undefined,
          would_buy: r?.would_buy ?? undefined,
          notes: contact.notes || undefined,
          opted_in_marketing: contact.email ? contact.opted_in : false,
          captured_at: new Date().toISOString(),
        })
      }))
      setStep('done')
    } catch { }
    finally { setSubmitting(false) }
  }

  const primaryColor = brands[0]?.color || t.gold
  const current = selected[rateIdx]
  const currentKey = current ? itemKey(current) : ''
  const currentRating = ratings[currentKey] ?? { rating: 0, would_buy: null }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${primaryColor}`, borderTop: '3px solid transparent', animation: 'spin 700ms linear infinite' }} />
    </div>
  )

  if (!event) return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🍸</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: t.text.primary, marginBottom: 8 }}>Event not found</h2>
        <p style={{ fontSize: 14, color: t.text.muted }}>This tasting link may have expired.</p>
      </div>
    </div>
  )

  // ── DONE ─────────────────────────────────────────────────────────────────
  if (step === 'done') return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', backgroundColor: primaryColor + '20', border: `2px solid ${primaryColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <Check size={48} color={primaryColor} strokeWidth={2.5} />
        </div>
        <h2 style={{ fontSize: 30, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.02em', marginBottom: 10 }}>
          {contact.first_name ? `Thanks, ${contact.first_name}!` : 'Thank you!'}
        </h2>
        <p style={{ fontSize: 15, color: t.text.secondary, lineHeight: 1.6, marginBottom: contact.opted_in ? 8 : 28 }}>
          Your feedback means a lot.
        </p>
        {contact.opted_in && contact.email && (
          <p style={{ fontSize: 13, color: primaryColor, marginBottom: 28, fontWeight: 600 }}>You're on the list — good things coming.</p>
        )}
        <p style={{ fontSize: 12, color: t.text.muted, marginBottom: 20 }}>Resetting in {countdown}s</p>
        <button onClick={doReset} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 36px', borderRadius: 14, fontSize: 16, fontWeight: 700, background: primaryColor, color: '#0f0f0d', border: 'none', cursor: 'pointer', margin: '0 auto' }}>
          Next Person <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )

  // ── CONTACT ───────────────────────────────────────────────────────────────
  if (step === 'contact') return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 28px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.02em', marginBottom: 6 }}>One more thing</h2>
        <p style={{ fontSize: 14, color: t.text.secondary, marginBottom: 28 }}>Want to hear about new releases? Drop your info — totally optional.</p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input type="text" placeholder="First name" value={contact.first_name}
            onChange={e => setContact(c => ({ ...c, first_name: e.target.value }))}
            style={{ ...inputStyle, flex: 1, borderRadius: 10, fontSize: 15, padding: '14px' }} />
          <input type="email" placeholder="Email" value={contact.email}
            onChange={e => setContact(c => ({ ...c, email: e.target.value }))}
            style={{ ...inputStyle, flex: 2, borderRadius: 10, fontSize: 15, padding: '14px' }} />
        </div>

        {contact.email && (
          <button type="button" onClick={() => setContact(c => ({ ...c, opted_in: !c.opted_in }))}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', width: '100%', marginBottom: 16, border: `1.5px solid ${contact.opted_in ? primaryColor : t.border.default}`, borderRadius: 10, backgroundColor: contact.opted_in ? primaryColor + '15' : 'transparent', color: contact.opted_in ? primaryColor : t.text.muted, cursor: 'pointer', fontSize: 14, transition: 'all 150ms ease' }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, border: `1.5px solid ${contact.opted_in ? primaryColor : t.border.hover}`, backgroundColor: contact.opted_in ? primaryColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {contact.opted_in && <Check size={13} color="#0f0f0d" strokeWidth={3} />}
            </div>
            Yes, keep me updated on new releases
          </button>
        )}

        <textarea placeholder="Any other thoughts? (optional)" value={contact.notes}
          onChange={e => setContact(c => ({ ...c, notes: e.target.value }))} rows={3}
          style={{ ...inputStyle, resize: 'none', borderRadius: 10, fontSize: 15, lineHeight: 1.5, padding: '14px', marginBottom: 24 }} />

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: '18px', borderRadius: 14, fontSize: 17, fontWeight: 700, background: primaryColor, color: '#0f0f0d', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', marginBottom: 12, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Submitting…' : 'Submit Feedback'}
        </button>
        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: '13px', borderRadius: 10, fontSize: 14, fontWeight: 500, background: 'transparent', color: t.text.muted, border: `1px solid ${t.border.default}`, cursor: 'pointer' }}>
          Skip & Submit
        </button>
      </div>
    </div>
  )

  // ── RATE ──────────────────────────────────────────────────────────────────
  if (step === 'rate') {
    const accent = current?.brandColor || primaryColor
    const brand = brands.find(b => b.slug === current?.brandSlug)
    return (
      <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 28px' }}>
          {/* Progress dots */}
          {selected.length > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 36 }}>
              {selected.map((p, i) => (
                <div key={itemKey(p)} style={{ height: 6, width: i === rateIdx ? 28 : 6, borderRadius: 3, backgroundColor: i === rateIdx ? accent : (ratings[itemKey(p)]?.rating > 0 ? accent + '50' : t.border.default), transition: 'all 220ms ease' }} />
              ))}
            </div>
          )}

          {/* Brand + product */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36 }}>
            <BrandLogo brand={brand || { name: current?.brandName, color: accent }} size={56} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{current?.brandName}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                {current?.productName || 'Overall impression'}
              </div>
            </div>
          </div>

          {/* Stars */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button"
                  onClick={() => setRatings(r => ({ ...r, [currentKey]: { rating: n, would_buy: r[currentKey]?.would_buy ?? null } }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', transform: currentRating.rating >= n ? 'scale(1.12)' : 'scale(1)', transition: 'transform 120ms ease' }}>
                  <Star size={58} fill={currentRating.rating >= n ? accent : 'transparent'} color={currentRating.rating >= n ? accent : t.border.hover} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            {currentRating.rating > 0 && (
              <div style={{ fontSize: 15, color: accent, fontWeight: 700 }}>{RATING_LABELS[currentRating.rating]}</div>
            )}
          </div>

          {/* Would buy */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 13, color: t.text.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, textAlign: 'center' }}>Would you buy this?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([{ label: '👍  Yes!', v: true }, { label: '🤔  Maybe', v: null as null }, { label: '👎  No', v: false }]).map(opt => {
                const isA = opt.v === true ? currentRating.would_buy === true : opt.v === false ? currentRating.would_buy === false : (currentRating.would_buy === null && ratings[currentKey] !== undefined)
                return (
                  <button key={String(opt.v)} type="button"
                    onClick={() => setRatings(r => ({ ...r, [currentKey]: { rating: r[currentKey]?.rating ?? 0, would_buy: opt.v } }))}
                    style={{ flex: 1, padding: '15px 6px', borderRadius: 12, fontSize: 14, cursor: 'pointer', fontWeight: 600, border: `2px solid ${isA ? accent : t.border.default}`, backgroundColor: isA ? accent + '20' : t.bg.card, color: isA ? accent : t.text.secondary, transition: 'all 120ms ease' }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Nav */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => rateIdx > 0 ? setRateIdx(i => i - 1) : setStep('select')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '16px 20px', borderRadius: 12, fontSize: 15, fontWeight: 600, background: 'transparent', color: t.text.secondary, border: `1.5px solid ${t.border.default}`, cursor: 'pointer', flexShrink: 0 }}>
              <ChevronLeft size={16} /> Back
            </button>
            <button
              onClick={() => rateIdx < selected.length - 1 ? setRateIdx(i => i + 1) : setStep('contact')}
              disabled={currentRating.rating === 0}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px', borderRadius: 12, fontSize: 15, fontWeight: 700, background: currentRating.rating > 0 ? accent : t.border.default, color: currentRating.rating > 0 ? '#0f0f0d' : t.text.muted, border: 'none', cursor: currentRating.rating > 0 ? 'pointer' : 'not-allowed', transition: 'all 150ms ease' }}>
              {rateIdx < selected.length - 1 ? <>Next <ChevronRight size={16} /></> : <>Finish <ChevronRight size={16} /></>}
            </button>
          </div>
          {currentRating.rating === 0 && <p style={{ fontSize: 12, color: t.text.muted, textAlign: 'center', marginTop: 10 }}>Tap a star to continue</p>}
        </div>
      </div>
    )
  }

  // ── SELECT ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 28px 32px' }}>

        <h1 style={{ fontSize: 30, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.02em', marginBottom: 6 }}>
          What did you try?
        </h1>
        <p style={{ fontSize: 15, color: t.text.muted, marginBottom: 32 }}>
          Tap a logo to select a brand.
        </p>

        {/* Brand tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(brands.length, 3)}, 1fr)`, gap: 16, marginBottom: 32 }}>
          {brands.map(brand => {
            const accent = brand.color || t.gold
            const isSel = selected.some(s => s.brandSlug === brand.slug)
            const isExp = expanded === brand.slug
            const brandItems = selected.filter(s => s.brandSlug === brand.slug)
            const hasProducts = brand.products?.length > 0

            return (
              <div key={brand.slug} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* Tile */}
                <button
                  type="button"
                  onClick={() => toggleBrand(brand)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                    padding: '28px 16px 20px',
                    borderRadius: 20,
                    border: `2px solid ${isSel ? accent : t.border.default}`,
                    backgroundColor: isSel ? accent + '10' : t.bg.card,
                    cursor: 'pointer',
                    transition: 'all 200ms ease',
                    position: 'relative',
                    boxShadow: isSel ? `0 0 0 1px ${accent}30, 0 4px 24px ${accent}18` : 'none',
                  }}
                >
                  {isSel && (
                    <div style={{ position: 'absolute', top: 12, right: 12, width: 26, height: 26, borderRadius: '50%', backgroundColor: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 8px ${accent}50` }}>
                      <Check size={14} color="#0f0f0d" strokeWidth={3} />
                    </div>
                  )}
                  <BrandLogo brand={brand} size={80} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: isSel ? accent : t.text.primary, textAlign: 'center', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
                    {brand.name}
                  </div>
                </button>

                {/* Products toggle — only when brand is selected */}
                {isSel && hasProducts && (
                  <button
                    type="button"
                    onClick={() => setExpanded(isExp ? null : brand.slug)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px', fontSize: 12, fontWeight: 700, color: accent, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.02em', textTransform: 'uppercase' }}
                  >
                    {isExp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {brandItems.some(x => x.productName)
                      ? `${brandItems.length} product${brandItems.length > 1 ? 's' : ''}`
                      : `${brand.products.length} products`}
                  </button>
                )}

                {/* Product pills */}
                {isExp && hasProducts && (
                  <div style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.subtle}`, borderRadius: 14, padding: '14px 12px', display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 4 }}>
                    {brand.products.map((p: any) => {
                      const pSel = selected.some(x => x.brandSlug === brand.slug && x.productName === p.name)
                      return (
                        <button key={p.id} type="button"
                          onClick={() => toggleProduct(brand, p)}
                          style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, border: `1.5px solid ${pSel ? accent : t.border.default}`, backgroundColor: pSel ? accent + '20' : 'transparent', color: pSel ? accent : t.text.secondary, cursor: 'pointer', transition: 'all 120ms ease', whiteSpace: 'nowrap' }}>
                          {pSel && '✓ '}{p.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* CTA */}
        <button
          onClick={() => { setRateIdx(0); setStep('rate') }}
          disabled={selected.length === 0}
          style={{
            width: '100%', padding: '20px', borderRadius: 16, fontSize: 18, fontWeight: 700,
            background: selected.length > 0 ? primaryColor : t.border.default,
            color: selected.length > 0 ? '#0f0f0d' : t.text.muted,
            border: 'none', cursor: selected.length > 0 ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            transition: 'all 200ms ease',
            boxShadow: selected.length > 0 ? `0 4px 20px ${primaryColor}40` : 'none',
          }}>
          {selected.length > 0
            ? <>Rate {selected.length} {selected.length === 1 ? 'selection' : 'selections'} <ChevronRight size={20} /></>
            : 'Tap a brand to get started'}
        </button>
      </div>
    </div>
  )
}
