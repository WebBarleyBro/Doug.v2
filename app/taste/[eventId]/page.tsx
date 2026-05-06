'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Star, Check, ChevronRight, ChevronLeft, Plus, X } from 'lucide-react'
import { saveTastingConsumer } from '../../lib/data'
import { t, inputStyle } from '../../lib/theme'

const RESET_DELAY = 5000
const RATING_LABELS = ['', 'Not for me', 'It was okay', 'Pretty good', 'Really enjoyed it', 'Absolutely loved it!']

type Step = 'products' | 'rate' | 'contact' | 'done'
type SelectedProduct = { brandSlug: string; brandName: string; brandColor: string; clientId: string; productName: string }

function BrandLogo({ brand, size = 56 }: { brand: any; size?: number }) {
  const color = brand.color || '#c9a84c'
  if (brand.logo_url) {
    return <img src={brand.logo_url} alt={brand.name} style={{ width: size, height: size, borderRadius: size * 0.18, objectFit: 'cover' }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.18, backgroundColor: color + '25', border: `2px solid ${color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 800, color, flexShrink: 0 }}>
      {brand.name.charAt(0)}
    </div>
  )
}

export default function TastingKiosk() {
  const { eventId } = useParams() as { eventId: string }
  const [event, setEvent] = useState<any>(null)
  const [brands, setBrands] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState<Step>('products')
  const [selected, setSelected] = useState<SelectedProduct[]>([])
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
      .then(({ event, brands }) => {
        if (event) setEvent(event)
        if (brands?.length) setBrands(brands)
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
      setCountdown(c => { if (c <= 1) { clearInterval(countdownTimer.current!); return 0 } return c - 1 })
    }, 1000)
    resetTimer.current = setTimeout(doReset, RESET_DELAY)
    return () => { if (resetTimer.current) clearTimeout(resetTimer.current); if (countdownTimer.current) clearInterval(countdownTimer.current) }
  }, [step])

  function toggleProduct(p: SelectedProduct) {
    setSelected(s => s.some(x => x.brandSlug === p.brandSlug && x.productName === p.productName)
      ? s.filter(x => !(x.brandSlug === p.brandSlug && x.productName === p.productName))
      : [...s, p])
  }

  function isSelected(brandSlug: string, productName: string) {
    return selected.some(x => x.brandSlug === brandSlug && x.productName === productName)
  }

  function addCustom() {
    const name = customInput.trim()
    if (!name) return
    const fallbackBrand = brands[0]
    const p: SelectedProduct = {
      brandSlug: fallbackBrand?.slug || 'custom',
      brandName: fallbackBrand?.name || 'Other',
      brandColor: fallbackBrand?.color || t.gold,
      clientId: fallbackBrand?.id || '',
      productName: name,
    }
    if (!selected.some(x => x.productName === name)) setSelected(s => [...s, p])
    setCustomInput('')
  }

  function key(p: SelectedProduct) { return `${p.brandSlug}::${p.productName}` }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const rated = selected.filter(p => (ratings[key(p)]?.rating ?? 0) > 0)
      const entries = rated.length > 0 ? rated : selected
      if (entries.length === 0) {
        await saveTastingConsumer({
          event_id: eventId,
          first_name: contact.first_name || undefined, email: contact.email || undefined,
          notes: contact.notes || undefined,
          opted_in_marketing: contact.email ? contact.opted_in : false,
          captured_at: new Date().toISOString(),
        })
      } else {
        await Promise.all(entries.map(p => {
          const r = ratings[key(p)]
          return saveTastingConsumer({
            event_id: eventId, client_id: p.clientId || undefined,
            first_name: contact.first_name || undefined, email: contact.email || undefined,
            product_rated: p.productName,
            rating: r?.rating || undefined,
            would_buy: r?.would_buy ?? undefined,
            notes: contact.notes || undefined,
            opted_in_marketing: contact.email ? contact.opted_in : false,
            captured_at: new Date().toISOString(),
          })
        }))
      }
      setStep('done')
    } catch { }
    finally { setSubmitting(false) }
  }

  const primaryColor = brands[0]?.color || t.gold
  const currentItem = selected[rateIdx]
  const currentKey = currentItem ? key(currentItem) : ''
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
        <p style={{ fontSize: 14, color: t.text.muted }}>This tasting link may have expired or been removed.</p>
      </div>
    </div>
  )

  // ── Shared header ────────────────────────────────────────────────────────
  const Header = () => (
    <div style={{ backgroundColor: '#1a1916', borderBottom: `1px solid ${t.border.default}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {brands.map((b, i) => (
          <div key={b.slug} style={{ marginLeft: i > 0 ? -10 : 0, zIndex: brands.length - i }}>
            <BrandLogo brand={b} size={36} />
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text.primary }}>
          {brands.length > 1 ? brands.map(b => b.name).join(' · ') : (brands[0]?.name || 'Tasting')}
        </div>
        {event.title && <div style={{ fontSize: 12, color: t.text.muted }}>{event.title}</div>}
      </div>
    </div>
  )

  // ── DONE ─────────────────────────────────────────────────────────────────
  if (step === 'done') return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }}>
      <Header />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 66px)', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', backgroundColor: primaryColor + '20', border: `2px solid ${primaryColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Check size={44} color={primaryColor} strokeWidth={2.5} />
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.02em', marginBottom: 10 }}>
            {contact.first_name ? `Thanks, ${contact.first_name}!` : 'Thank you!'}
          </h2>
          <p style={{ fontSize: 15, color: t.text.secondary, lineHeight: 1.6, marginBottom: 8 }}>
            Your feedback helps us craft better spirits.
          </p>
          {contact.opted_in && contact.email && (
            <p style={{ fontSize: 13, color: primaryColor, marginBottom: 16, fontWeight: 500 }}>You're on the list — good things coming.</p>
          )}
          <p style={{ fontSize: 13, color: t.text.muted, marginBottom: 28 }}>Next person in {countdown}s…</p>
          <button onClick={doReset} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 14, fontSize: 16, fontWeight: 700, background: primaryColor, color: '#0f0f0d', border: 'none', cursor: 'pointer', margin: '0 auto' }}>
            Next Person <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )

  // ── CONTACT ───────────────────────────────────────────────────────────────
  if (step === 'contact') return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }}>
      <Header />
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '36px 24px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: t.text.muted, textTransform: 'uppercase', marginBottom: 6 }}>
          Step 3 of 3
        </p>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.02em', marginBottom: 6 }}>Almost done</h2>
        <p style={{ fontSize: 14, color: t.text.secondary, marginBottom: 24 }}>Leave your info to hear about new releases — totally optional.</p>

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
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', width: '100%', marginBottom: 16, border: `1.5px solid ${contact.opted_in ? primaryColor : t.border.default}`, borderRadius: 10, backgroundColor: contact.opted_in ? primaryColor + '15' : 'transparent', color: contact.opted_in ? primaryColor : t.text.muted, cursor: 'pointer', fontSize: 14, transition: 'all 150ms ease' }}>
            <div style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${contact.opted_in ? primaryColor : t.border.hover}`, backgroundColor: contact.opted_in ? primaryColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {contact.opted_in && <Check size={12} color="#0f0f0d" strokeWidth={3} />}
            </div>
            Yes, keep me updated on new releases
          </button>
        )}

        <textarea placeholder="Any other thoughts? (optional)" value={contact.notes}
          onChange={e => setContact(c => ({ ...c, notes: e.target.value }))} rows={3}
          style={{ ...inputStyle, resize: 'none', borderRadius: 10, fontSize: 15, lineHeight: 1.5, marginBottom: 20 }} />

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: '18px', borderRadius: 14, fontSize: 18, fontWeight: 700, background: primaryColor, color: '#0f0f0d', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', marginBottom: 12, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Submitting…' : 'Submit Feedback'}
        </button>
        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 500, background: 'transparent', color: t.text.muted, border: `1px solid ${t.border.default}`, cursor: 'pointer' }}>
          Skip & Submit
        </button>
      </div>
    </div>
  )

  // ── RATE ──────────────────────────────────────────────────────────────────
  if (step === 'rate') {
    const accent = currentItem?.brandColor || primaryColor
    return (
      <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }}>
        <Header />
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '36px 24px' }}>
          {/* Progress dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 32 }}>
            {selected.map((p, i) => (
              <div key={key(p)} style={{ width: i === rateIdx ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i === rateIdx ? accent : (ratings[key(p)]?.rating > 0 ? accent + '55' : t.border.default), transition: 'all 200ms ease' }} />
            ))}
          </div>

          {/* Brand + product context */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <BrandLogo brand={{ name: currentItem.brandName, color: currentItem.brandColor, logo_url: brands.find(b => b.slug === currentItem.brandSlug)?.logo_url }} size={44} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: t.text.muted, textTransform: 'uppercase' }}>
                {currentItem.brandName} · {rateIdx + 1} of {selected.length}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{currentItem.productName}</div>
            </div>
          </div>

          {/* Stars */}
          <div style={{ textAlign: 'center', margin: '28px 0' }}>
            <p style={{ fontSize: 13, color: t.text.secondary, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>How did you enjoy it?</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button"
                  onClick={() => setRatings(r => ({ ...r, [currentKey]: { ...r[currentKey], rating: n, would_buy: r[currentKey]?.would_buy ?? null } }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, transform: currentRating.rating >= n ? 'scale(1.15)' : 'scale(1)', transition: 'transform 120ms ease' }}>
                  <Star size={56} fill={currentRating.rating >= n ? accent : 'transparent'} color={currentRating.rating >= n ? accent : t.border.hover} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            {currentRating.rating > 0 && (
              <p style={{ fontSize: 16, color: accent, marginTop: 12, fontWeight: 700 }}>{RATING_LABELS[currentRating.rating]}</p>
            )}
          </div>

          {/* Would buy */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 13, color: t.text.secondary, marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Would you buy this?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {([{ label: '👍  Yes!', value: true }, { label: '🤔  Maybe', value: null as null }, { label: '👎  Not for me', value: false }]).map(opt => {
                const isActive = opt.value === true ? currentRating.would_buy === true
                  : opt.value === false ? currentRating.would_buy === false
                    : currentRating.would_buy === null && ratings[currentKey] !== undefined
                return (
                  <button key={String(opt.value)} type="button"
                    onClick={() => setRatings(r => ({ ...r, [currentKey]: { ...r[currentKey], would_buy: opt.value, rating: r[currentKey]?.rating ?? 0 } }))}
                    style={{ flex: 1, padding: '16px 8px', borderRadius: 12, fontSize: 14, cursor: 'pointer', fontWeight: 600, border: `2px solid ${isActive ? accent : t.border.default}`, backgroundColor: isActive ? accent + '20' : t.bg.card, color: isActive ? accent : t.text.secondary, transition: 'all 120ms ease' }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => rateIdx > 0 ? setRateIdx(i => i - 1) : setStep('products')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '16px 20px', borderRadius: 12, fontSize: 15, fontWeight: 600, background: 'transparent', color: t.text.secondary, border: `1.5px solid ${t.border.default}`, cursor: 'pointer', flexShrink: 0 }}>
              <ChevronLeft size={16} /> Back
            </button>
            <button
              onClick={() => rateIdx < selected.length - 1 ? setRateIdx(i => i + 1) : setStep('contact')}
              disabled={currentRating.rating === 0}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '16px 20px', borderRadius: 12, fontSize: 15, fontWeight: 700, background: currentRating.rating > 0 ? accent : t.border.default, color: currentRating.rating > 0 ? '#0f0f0d' : t.text.muted, border: 'none', cursor: currentRating.rating > 0 ? 'pointer' : 'not-allowed', transition: 'all 150ms ease' }}>
              {rateIdx < selected.length - 1 ? <>Next <ChevronRight size={16} /></> : <>Almost done <ChevronRight size={16} /></>}
            </button>
          </div>
          <p style={{ fontSize: 12, color: t.text.muted, textAlign: 'center', marginTop: 12 }}>Tap a star to continue</p>
        </div>
      </div>
    )
  }

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  const hasCatalog = brands.some(b => b.products?.length > 0)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }}>
      <Header />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: t.text.muted, textTransform: 'uppercase', marginBottom: 6 }}>Step 1 of 3</p>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: t.text.primary, letterSpacing: '-0.02em', marginBottom: 4 }}>What did you try today?</h2>
          <p style={{ fontSize: 14, color: t.text.secondary }}>Tap each product you tasted — you'll rate them next.</p>
        </div>

        {hasCatalog ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 28 }}>
            {brands.map(brand => {
              const accent = brand.color || t.gold
              const brandSelected = selected.filter(p => p.brandSlug === brand.slug)
              return (
                <div key={brand.slug}>
                  {/* Brand header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${t.border.subtle}` }}>
                    <BrandLogo brand={brand} size={48} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: t.text.primary }}>{brand.name}</div>
                      {brand.products?.length > 0 && (
                        <div style={{ fontSize: 12, color: t.text.muted }}>{brand.products.length} product{brand.products.length > 1 ? 's' : ''} available</div>
                      )}
                    </div>
                    {brandSelected.length > 0 && (
                      <div style={{ padding: '4px 10px', borderRadius: 20, backgroundColor: accent + '20', border: `1px solid ${accent}40`, fontSize: 12, fontWeight: 700, color: accent }}>
                        {brandSelected.length} selected
                      </div>
                    )}
                  </div>

                  {/* Products */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                    {brand.products?.map((p: any) => {
                      const active = isSelected(brand.slug, p.name)
                      return (
                        <button key={p.id} type="button"
                          onClick={() => toggleProduct({ brandSlug: brand.slug, brandName: brand.name, brandColor: accent, clientId: brand.id, productName: p.name })}
                          style={{ textAlign: 'left', padding: '14px 16px', borderRadius: 14, border: `2px solid ${active ? accent : t.border.default}`, backgroundColor: active ? accent + '15' : t.bg.card, cursor: 'pointer', transition: 'all 150ms ease', position: 'relative', minHeight: 72 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, paddingRight: 8 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: active ? accent : t.text.primary, lineHeight: 1.3, marginBottom: p.category ? 4 : 0 }}>{p.name}</div>
                              {p.category && <div style={{ fontSize: 11, color: t.text.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.category}</div>}
                            </div>
                            <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${active ? accent : t.border.default}`, backgroundColor: active ? accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 150ms ease' }}>
                              {active && <Check size={13} color="#0f0f0d" strokeWidth={3} />}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* No catalog — free text */
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 14, color: t.text.secondary, marginBottom: 12 }}>Enter each product you tried:</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="text" value={customInput} onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
                placeholder="e.g. Bourbon, Rye Whiskey, Gin…"
                style={{ ...inputStyle, flex: 1, borderRadius: 10, fontSize: 15 }} />
              <button type="button" onClick={addCustom} disabled={!customInput.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: customInput.trim() ? primaryColor : t.border.default, color: customInput.trim() ? '#0f0f0d' : t.text.muted, border: 'none', cursor: customInput.trim() ? 'pointer' : 'not-allowed' }}>
                <Plus size={16} /> Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {selected.map(p => (
                <div key={key(p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, backgroundColor: primaryColor + '20', border: `1px solid ${primaryColor}40`, fontSize: 14, color: primaryColor, fontWeight: 600 }}>
                  {p.productName}
                  <button type="button" onClick={() => setSelected(s => s.filter(x => key(x) !== key(p)))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: primaryColor }}>
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add unlisted product (when catalog exists) */}
        {hasCatalog && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 13, color: t.text.muted, marginBottom: 8 }}>Tried something not listed?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={customInput} onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
                placeholder="Product name…" style={{ ...inputStyle, flex: 1, borderRadius: 10, fontSize: 15 }} />
              <button type="button" onClick={addCustom} disabled={!customInput.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: customInput.trim() ? primaryColor : t.border.default, color: customInput.trim() ? '#0f0f0d' : t.text.muted, border: 'none', cursor: customInput.trim() ? 'pointer' : 'not-allowed' }}>
                <Plus size={16} /> Add
              </button>
            </div>
            {selected.filter(p => !brands.some(b => b.products?.some((x: any) => x.name === p.productName && b.slug === p.brandSlug))).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {selected.filter(p => !brands.some(b => b.products?.some((x: any) => x.name === p.productName && b.slug === p.brandSlug))).map(p => (
                  <div key={key(p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, backgroundColor: primaryColor + '20', border: `1px solid ${primaryColor}40`, fontSize: 13, color: primaryColor, fontWeight: 600 }}>
                    {p.productName}
                    <button type="button" onClick={() => setSelected(s => s.filter(x => key(x) !== key(p)))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: primaryColor }}>
                      <X size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => { setRateIdx(0); setStep('rate') }}
          disabled={selected.length === 0}
          style={{ width: '100%', padding: '18px', borderRadius: 14, fontSize: 17, fontWeight: 700, background: selected.length > 0 ? primaryColor : t.border.default, color: selected.length > 0 ? '#0f0f0d' : t.text.muted, border: 'none', cursor: selected.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 150ms ease' }}>
          {selected.length > 0
            ? <>Rate {selected.length} product{selected.length > 1 ? 's' : ''} <ChevronRight size={18} /></>
            : 'Select at least one product to continue'}
        </button>
      </div>
    </div>
  )
}
