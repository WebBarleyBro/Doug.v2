'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Star, Check, ChevronRight, ChevronLeft } from 'lucide-react'
import { saveTastingConsumer } from '../../lib/data'

// ─── Design tokens (standalone — no app shell) ────────────────────────────
const BG       = '#0a0908'
const CARD     = '#141210'
const BORDER   = '#252219'
const MUTED    = '#6a6054'
const SEC      = '#a89e8c'
const PRIMARY  = '#f0e8d8'
const SPRING   = 'cubic-bezier(0.34, 1.4, 0.64, 1)'

const RATING_LABELS = ['', 'Not for me', 'It was okay', 'Pretty good', 'Really enjoyed it', 'Absolutely loved it!']

type Step = 'select' | 'rate' | 'contact' | 'done'
type Item = { brandSlug: string; brandName: string; brandColor: string; clientId: string; productName?: string }
function key(i: Item) { return `${i.brandSlug}::${i.productName ?? ''}` }

// ─── Brand logo ───────────────────────────────────────────────────────────
function Logo({ brand, size }: { brand: any; size: number }) {
  const c = brand.color || '#c9a84c'
  if (brand.logo_url) return <img src={brand.logo_url} alt={brand.name} style={{ width: size, height: size, borderRadius: size * 0.22, objectFit: 'cover', display: 'block' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.22, background: `radial-gradient(circle at 30% 30%, ${c}30, ${c}10)`, border: `1.5px solid ${c}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 900, color: c, letterSpacing: '-0.02em' }}>
      {brand.name.charAt(0)}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────
export default function TastingKiosk() {
  const { eventId } = useParams() as { eventId: string }
  const [event, setEvent]   = useState<any>(null)
  const [brands, setBrands] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [step, setStep]       = useState<Step>('select')
  const [selected, setSelected] = useState<Item[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [ratings, setRatings]   = useState<Record<string, { rating: number; would_buy: boolean | null }>>({})
  const [rateIdx, setRateIdx]   = useState(0)
  const [contact, setContact]   = useState({ first_name: '', email: '', notes: '', opted_in: false })
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown]   = useState(5)

  const resetRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cdRef       = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch(`/api/tasting/${eventId}`)
      .then(r => r.json())
      .then(({ event, brands }) => { if (event) setEvent(event); if (brands?.length) setBrands(brands) })
      .finally(() => setLoading(false))
  }, [eventId])

  function doReset() {
    if (resetRef.current) clearTimeout(resetRef.current)
    if (cdRef.current) clearInterval(cdRef.current)
    setStep('select'); setSelected([]); setExpanded(null)
    setRatings({}); setRateIdx(0)
    setContact({ first_name: '', email: '', notes: '', opted_in: false }); setCountdown(5)
  }

  useEffect(() => {
    if (step !== 'done') return
    setCountdown(5)
    cdRef.current = setInterval(() => setCountdown(c => { if (c <= 1) { clearInterval(cdRef.current!); return 0 } return c - 1 }), 1000)
    resetRef.current = setTimeout(doReset, 5000)
    return () => { if (resetRef.current) clearTimeout(resetRef.current); if (cdRef.current) clearInterval(cdRef.current) }
  }, [step])

  function toggleBrand(brand: any) {
    const isSel = selected.some(s => s.brandSlug === brand.slug)
    if (isSel) { setSelected(s => s.filter(x => x.brandSlug !== brand.slug)); if (expanded === brand.slug) setExpanded(null) }
    else setSelected(s => [...s, { brandSlug: brand.slug, brandName: brand.name, brandColor: brand.color || '#c9a84c', clientId: brand.id }])
  }

  function toggleProduct(brand: any, p: any) {
    const ac = brand.color || '#c9a84c'
    const pSel = selected.some(x => x.brandSlug === brand.slug && x.productName === p.name)
    if (pSel) {
      const rest = selected.filter(x => x.brandSlug === brand.slug && x.productName && x.productName !== p.name)
      if (rest.length === 0) setSelected(s => [...s.filter(x => x.brandSlug !== brand.slug), { brandSlug: brand.slug, brandName: brand.name, brandColor: ac, clientId: brand.id }])
      else setSelected(s => s.filter(x => !(x.brandSlug === brand.slug && x.productName === p.name)))
    } else {
      setSelected(s => [...s.filter(x => !(x.brandSlug === brand.slug && !x.productName)), { brandSlug: brand.slug, brandName: brand.name, brandColor: ac, clientId: brand.id, productName: p.name }])
    }
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      await Promise.all(selected.map(item => {
        const r = ratings[key(item)]
        return saveTastingConsumer({ event_id: eventId, client_id: item.clientId || undefined, first_name: contact.first_name || undefined, email: contact.email || undefined, product_rated: item.productName || undefined, rating: r?.rating || undefined, would_buy: r?.would_buy ?? undefined, notes: contact.notes || undefined, opted_in_marketing: contact.email ? contact.opted_in : false, captured_at: new Date().toISOString() })
      }))
      setStep('done')
    } catch { } finally { setSubmitting(false) }
  }

  const accent  = brands[0]?.color || '#c9a84c'
  const cur     = selected[rateIdx]
  const curKey  = cur ? key(cur) : ''
  const curR    = ratings[curKey] ?? { rating: 0, would_buy: null }
  const curBrand = brands.find(b => b.slug === cur?.brandSlug)

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: `2.5px solid ${accent}`, borderTop: '2.5px solid transparent', animation: 'spin 600ms linear infinite' }} />
    </div>
  )

  if (!event) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,sans-serif' }}>
      <div style={{ textAlign: 'center', color: SEC }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🍸</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: PRIMARY, marginBottom: 6 }}>Event not found</div>
        <div style={{ fontSize: 14 }}>This tasting link may have expired.</div>
      </div>
    </div>
  )

  const page: React.CSSProperties = { minHeight: '100vh', background: BG, color: PRIMARY, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', WebkitFontSmoothing: 'antialiased' }

  // ── DONE ───────────────────────────────────────────────────────────────
  if (step === 'done') return (
    <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle, ${accent}30, ${accent}08)`, border: `2px solid ${accent}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', boxShadow: `0 0 40px ${accent}30` }}>
          <Check size={48} color={accent} strokeWidth={2} />
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 10 }}>
          {contact.first_name ? `Thanks, ${contact.first_name}!` : 'Thank you!'}
        </div>
        <div style={{ fontSize: 16, color: SEC, lineHeight: 1.6, marginBottom: contact.opted_in ? 10 : 32 }}>Your feedback helps craft better spirits.</div>
        {contact.opted_in && <div style={{ fontSize: 13, color: accent, fontWeight: 600, marginBottom: 32 }}>You're on the list — good things coming.</div>}
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>Resetting in {countdown}s</div>
        <button onClick={doReset} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 36px', borderRadius: 50, fontSize: 16, fontWeight: 700, background: accent, color: '#0a0908', border: 'none', cursor: 'pointer', boxShadow: `0 4px 24px ${accent}45` }}>
          Next Person <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )

  // ── CONTACT ────────────────────────────────────────────────────────────
  if (step === 'contact') return (
    <div style={page}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '52px 28px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: accent, textTransform: 'uppercase', marginBottom: 10 }}>Optional</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>Want to stay in the loop?</div>
        <div style={{ fontSize: 15, color: SEC, marginBottom: 36, lineHeight: 1.6 }}>New releases, events, the good stuff. Drop your info — no spam, ever.</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {[{ placeholder: 'First name', key: 'first_name', type: 'text', flex: 1 }, { placeholder: 'Email address', key: 'email', type: 'email', flex: 2 }].map(f => (
            <input key={f.key} type={f.type} placeholder={f.placeholder} value={(contact as any)[f.key]}
              onChange={e => setContact(c => ({ ...c, [f.key]: e.target.value }))}
              style={{ flex: f.flex, padding: '16px', borderRadius: 14, border: `1.5px solid ${BORDER}`, background: CARD, color: PRIMARY, fontSize: 15, outline: 'none' }} />
          ))}
        </div>

        {contact.email && (
          <button type="button" onClick={() => setContact(c => ({ ...c, opted_in: !c.opted_in }))}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', width: '100%', marginBottom: 12, border: `1.5px solid ${contact.opted_in ? accent : BORDER}`, borderRadius: 14, background: contact.opted_in ? accent + '12' : 'transparent', color: contact.opted_in ? accent : SEC, cursor: 'pointer', fontSize: 14, fontWeight: 600, transition: `all 200ms ${SPRING}` }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${contact.opted_in ? accent : MUTED}`, background: contact.opted_in ? accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: `all 200ms ${SPRING}` }}>
              {contact.opted_in && <Check size={13} color="#0a0908" strokeWidth={3} />}
            </div>
            Yes, keep me updated on new releases
          </button>
        )}

        <textarea placeholder="Any other thoughts? (optional)" value={contact.notes}
          onChange={e => setContact(c => ({ ...c, notes: e.target.value }))} rows={3}
          style={{ width: '100%', padding: '16px', borderRadius: 14, border: `1.5px solid ${BORDER}`, background: CARD, color: PRIMARY, fontSize: 15, resize: 'none', lineHeight: 1.6, outline: 'none', boxSizing: 'border-box', marginBottom: 24 }} />

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: '20px', borderRadius: 16, fontSize: 17, fontWeight: 800, background: accent, color: '#0a0908', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', marginBottom: 10, opacity: submitting ? 0.7 : 1, letterSpacing: '-0.01em', boxShadow: `0 4px 28px ${accent}40` }}>
          {submitting ? 'Submitting…' : 'Submit Feedback'}
        </button>
        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'transparent', color: MUTED, border: `1px solid ${BORDER}`, cursor: 'pointer' }}>
          Skip & Submit
        </button>
      </div>
    </div>
  )

  // ── RATE ───────────────────────────────────────────────────────────────
  if (step === 'rate') {
    const ac = cur?.brandColor || accent
    return (
      <div style={page}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 28px' }}>

          {/* Progress */}
          {selected.length > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 40 }}>
              {selected.map((p, i) => (
                <div key={key(p)} style={{ height: 5, width: i === rateIdx ? 32 : 5, borderRadius: 3, background: i === rateIdx ? ac : (ratings[key(p)]?.rating > 0 ? ac + '55' : BORDER), transition: `all 300ms ${SPRING}` }} />
              ))}
            </div>
          )}

          {/* Brand + product hero */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '24px', borderRadius: 20, background: `linear-gradient(135deg, ${ac}12 0%, ${CARD} 100%)`, border: `1px solid ${ac}25`, marginBottom: 36 }}>
            <Logo brand={curBrand || { name: cur?.brandName, color: ac }} size={64} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: ac, textTransform: 'uppercase', marginBottom: 4 }}>{cur?.brandName}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {cur?.productName || 'Overall impression'}
              </div>
            </div>
          </div>

          {/* Stars */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: MUTED, textTransform: 'uppercase', marginBottom: 18 }}>How did you enjoy it?</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(n => {
                const lit = curR.rating >= n
                return (
                  <button key={n} type="button"
                    onClick={() => setRatings(r => ({ ...r, [curKey]: { rating: n, would_buy: r[curKey]?.would_buy ?? null } }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', transform: lit ? 'scale(1.18)' : 'scale(1)', transition: `transform 220ms ${SPRING}`, filter: lit ? `drop-shadow(0 0 8px ${ac}80)` : 'none' }}>
                    <Star size={60} fill={lit ? ac : 'transparent'} color={lit ? ac : BORDER} strokeWidth={1.5} />
                  </button>
                )
              })}
            </div>
            {curR.rating > 0 && (
              <div style={{ fontSize: 16, color: ac, fontWeight: 700, marginTop: 14, letterSpacing: '-0.01em', transition: 'all 200ms ease' }}>
                {RATING_LABELS[curR.rating]}
              </div>
            )}
          </div>

          {/* Would buy */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: MUTED, textTransform: 'uppercase', marginBottom: 12, textAlign: 'center' }}>Would you buy this?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[{ label: '👍   Yes, I'd buy it', v: true }, { label: '🤔   Maybe', v: null as null }, { label: '👎   Not for me', v: false }].map(opt => {
                const isA = opt.v === true ? curR.would_buy === true : opt.v === false ? curR.would_buy === false : (curR.would_buy === null && ratings[curKey] !== undefined)
                return (
                  <button key={String(opt.v)} type="button"
                    onClick={() => setRatings(r => ({ ...r, [curKey]: { rating: r[curKey]?.rating ?? 0, would_buy: opt.v } }))}
                    style={{ width: '100%', padding: '16px 20px', borderRadius: 14, fontSize: 15, cursor: 'pointer', fontWeight: 600, textAlign: 'left', border: `1.5px solid ${isA ? ac : BORDER}`, background: isA ? `linear-gradient(90deg, ${ac}20, ${ac}08)` : CARD, color: isA ? ac : SEC, transition: `all 180ms ${SPRING}`, boxShadow: isA ? `0 0 0 1px ${ac}30` : 'none', transform: isA ? 'scale(1.01)' : 'scale(1)' }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Nav */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => rateIdx > 0 ? setRateIdx(i => i - 1) : setStep('select')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '16px 22px', borderRadius: 14, fontSize: 15, fontWeight: 700, background: CARD, color: SEC, border: `1px solid ${BORDER}`, cursor: 'pointer', flexShrink: 0 }}>
              <ChevronLeft size={16} /> Back
            </button>
            <button onClick={() => rateIdx < selected.length - 1 ? setRateIdx(i => i + 1) : setStep('contact')}
              disabled={curR.rating === 0}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 800, background: curR.rating > 0 ? ac : BORDER, color: curR.rating > 0 ? '#0a0908' : MUTED, border: 'none', cursor: curR.rating > 0 ? 'pointer' : 'not-allowed', transition: `all 220ms ${SPRING}`, boxShadow: curR.rating > 0 ? `0 4px 20px ${ac}40` : 'none', letterSpacing: '-0.01em' }}>
              {rateIdx < selected.length - 1 ? <>Next <ChevronRight size={16} /></> : <>Finish <ChevronRight size={16} /></>}
            </button>
          </div>
          {curR.rating === 0 && <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 12 }}>Tap a star to continue</div>}
        </div>
      </div>
    )
  }

  // ── SELECT ────────────────────────────────────────────────────────────
  const cols = Math.min(brands.length, 3)

  return (
    <div style={page}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 28px 36px' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          {event.title && <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>{event.title}</div>}
          <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 10 }}>What did you<br />try today?</div>
          <div style={{ fontSize: 15, color: SEC }}>Tap a brand — then choose specific products if you'd like.</div>
        </div>

        {/* Brand grid */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, marginBottom: 28 }}>
          {brands.map(brand => {
            const ac = brand.color || '#c9a84c'
            const isSel = selected.some(s => s.brandSlug === brand.slug)
            const isExp = expanded === brand.slug
            const brandItems = selected.filter(s => s.brandSlug === brand.slug)
            const hasProds = brand.products?.length > 0

            return (
              <div key={brand.slug} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Tile */}
                <button type="button" onClick={() => toggleBrand(brand)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 14, padding: '32px 16px 26px',
                    borderRadius: 22,
                    border: `2px solid ${isSel ? ac : BORDER}`,
                    background: isSel ? `radial-gradient(ellipse at 50% 0%, ${ac}18 0%, ${CARD} 70%)` : CARD,
                    cursor: 'pointer',
                    transition: `all 250ms ${SPRING}`,
                    position: 'relative',
                    transform: isSel ? 'scale(1.02)' : 'scale(1)',
                    boxShadow: isSel ? `0 0 0 1px ${ac}40, 0 8px 40px ${ac}20` : '0 2px 8px rgba(0,0,0,0.3)',
                    outline: 'none',
                  }}>
                  {/* Checkmark */}
                  {isSel && (
                    <div style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: '50%', background: ac, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 10px ${ac}60` }}>
                      <Check size={15} color="#0a0908" strokeWidth={3} />
                    </div>
                  )}
                  <Logo brand={brand} size={88} />
                  <div style={{ fontSize: 14, fontWeight: 800, color: isSel ? ac : PRIMARY, textAlign: 'center', letterSpacing: '-0.01em', lineHeight: 1.3, transition: `color 200ms ease` }}>
                    {brand.name}
                  </div>
                </button>

                {/* Products toggle */}
                {isSel && hasProds && (
                  <button type="button" onClick={() => setExpanded(isExp ? null : brand.slug)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', fontSize: 12, fontWeight: 700, color: isExp ? ac : SEC, background: 'none', border: `1px solid ${isExp ? ac + '40' : BORDER}`, borderRadius: 10, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', transition: `all 200ms ease` }}>
                    {brandItems.some(x => x.productName)
                      ? `${brandItems.filter(x => x.productName).length} product${brandItems.filter(x => x.productName).length > 1 ? 's' : ''} selected`
                      : `${brand.products.length} product${brand.products.length > 1 ? 's' : ''}`}
                    <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}>
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}

                {/* Product pills */}
                {isExp && hasProds && (
                  <div style={{ borderRadius: 16, border: `1px solid ${BORDER}`, background: '#111009', padding: '14px 12px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ width: '100%', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: MUTED, textTransform: 'uppercase', marginBottom: 2 }}>Tap to select specific products</div>
                    {brand.products.map((p: any) => {
                      const ac2 = brand.color || '#c9a84c'
                      const pSel = selected.some(x => x.brandSlug === brand.slug && x.productName === p.name)
                      return (
                        <button key={p.id} type="button" onClick={() => toggleProduct(brand, p)}
                          style={{ padding: '9px 16px', borderRadius: 50, fontSize: 13, fontWeight: 700, border: `1.5px solid ${pSel ? ac2 : BORDER}`, background: pSel ? `${ac2}22` : 'transparent', color: pSel ? ac2 : SEC, cursor: 'pointer', transition: `all 180ms ${SPRING}`, transform: pSel ? 'scale(1.04)' : 'scale(1)', boxShadow: pSel ? `0 0 0 1px ${ac2}30` : 'none', whiteSpace: 'nowrap' }}>
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
            width: '100%', padding: '22px', borderRadius: 18, fontSize: 18, fontWeight: 900,
            background: selected.length > 0 ? accent : CARD,
            color: selected.length > 0 ? '#0a0908' : MUTED,
            border: `1.5px solid ${selected.length > 0 ? accent : BORDER}`,
            cursor: selected.length > 0 ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            transition: `all 280ms ${SPRING}`,
            boxShadow: selected.length > 0 ? `0 6px 32px ${accent}40` : 'none',
            transform: selected.length > 0 ? 'scale(1.01)' : 'scale(1)',
            letterSpacing: '-0.02em',
          }}>
          {selected.length > 0
            ? <>Rate {selected.length} {selected.length === 1 ? 'selection' : 'selections'} <ChevronRight size={22} /></>
            : 'Tap a brand to get started'}
        </button>

        {selected.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: MUTED }}>
            {selected.map(s => s.productName || s.brandName).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
