'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Star, Check, ChevronRight, ChevronLeft, X } from 'lucide-react'
import { saveTastingConsumer } from '../../lib/data'

const BG     = '#0a0908'
const CARD   = '#141210'
const BORDER = '#252219'
const MUTED  = '#6a6054'
const SEC    = '#a89e8c'
const CREAM  = '#f0e8d8'
const GOLD   = '#c9a84c'
const SPRING = 'cubic-bezier(0.34, 1.4, 0.64, 1)'

const RATING_LABELS = ['', 'Not for me', 'It was okay', 'Pretty good', 'Really enjoyed it', 'Absolutely loved it!']

type Step = 'select' | 'rate' | 'contact' | 'done'
type Item = { brandSlug: string; brandName: string; brandColor: string; clientId: string; productName?: string }
const itemKey = (i: Item) => `${i.brandSlug}::${i.productName ?? ''}`

function Logo({ brand, size }: { brand: any; size: number }) {
  const c = brand.color || GOLD
  if (brand.logo_url) return <img src={brand.logo_url} alt={brand.name} style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.2, background: `radial-gradient(circle at 35% 35%, ${c}35, ${c}10)`, border: `1.5px solid ${c}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 900, color: c }}>
      {brand.name.charAt(0)}
    </div>
  )
}

// ── Bottom sheet for product selection ──────────────────────────────────────
function ProductSheet({ brand, selected, onToggle, onClose }: { brand: any; selected: Item[]; onToggle: (b: any, p: any) => void; onClose: () => void }) {
  const ac = brand.color || GOLD
  const count = selected.filter(x => x.brandSlug === brand.slug && x.productName).length
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#161410', borderRadius: '24px 24px 0 0', maxHeight: '72vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 48px rgba(0,0,0,0.6)' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: BORDER }} />
        </div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px 20px' }}>
          <Logo brand={brand} size={48} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: CREAM, letterSpacing: '-0.02em' }}>{brand.name}</div>
            <div style={{ fontSize: 13, color: SEC }}>Which products did you try?</div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', background: '#252219', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: SEC, flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
        {/* Products */}
        <div style={{ overflowY: 'auto', padding: '0 20px', flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingBottom: 20 }}>
            {brand.products.map((p: any) => {
              const pSel = selected.some(x => x.brandSlug === brand.slug && x.productName === p.name)
              return (
                <button key={p.id} type="button" onClick={() => onToggle(brand, p)}
                  style={{ padding: '11px 18px', borderRadius: 50, fontSize: 14, fontWeight: 700, border: `1.5px solid ${pSel ? ac : BORDER}`, background: pSel ? ac + '22' : CARD, color: pSel ? ac : SEC, cursor: 'pointer', transition: `all 180ms ${SPRING}`, transform: pSel ? 'scale(1.04)' : 'scale(1)', boxShadow: pSel ? `0 0 0 1px ${ac}30` : 'none', whiteSpace: 'nowrap' }}>
                  {pSel && <span style={{ marginRight: 5 }}>✓</span>}{p.name}
                </button>
              )
            })}
          </div>
        </div>
        {/* Done button */}
        <div style={{ padding: '16px 20px 28px', borderTop: `1px solid ${BORDER}` }}>
          <button onClick={onClose}
            style={{ width: '100%', padding: '16px', borderRadius: 14, fontSize: 16, fontWeight: 800, background: count > 0 ? ac : GOLD, color: '#0a0908', border: 'none', cursor: 'pointer', letterSpacing: '-0.01em', boxShadow: `0 4px 20px ${GOLD}40` }}>
            {count > 0 ? `Confirm ${count} product${count > 1 ? 's' : ''}` : 'Done — rate this brand overall'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function TastingKiosk() {
  const { eventId } = useParams() as { eventId: string }
  const [event, setEvent]   = useState<any>(null)
  const [brands, setBrands] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [step, setStep]         = useState<Step>('select')
  const [selected, setSelected] = useState<Item[]>([])
  const [sheet, setSheet]       = useState<any | null>(null)
  const [ratings, setRatings]   = useState<Record<string, { rating: number; would_buy: boolean | null }>>({})
  const [rateIdx, setRateIdx]   = useState(0)
  const [contact, setContact]   = useState({ first_name: '', email: '', notes: '', opted_in: false })
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown]   = useState(5)

  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cdRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch(`/api/tasting/${eventId}`)
      .then(r => r.json())
      .then(({ event, brands }) => { if (event) setEvent(event); if (brands?.length) setBrands(brands) })
      .finally(() => setLoading(false))
  }, [eventId])

  function doReset() {
    if (resetRef.current) clearTimeout(resetRef.current)
    if (cdRef.current) clearInterval(cdRef.current)
    setStep('select'); setSelected([]); setSheet(null)
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
    if (isSel) { setSelected(s => s.filter(x => x.brandSlug !== brand.slug)) }
    else setSelected(s => [...s, { brandSlug: brand.slug, brandName: brand.name, brandColor: brand.color || GOLD, clientId: brand.id }])
  }

  function toggleProduct(brand: any, p: any) {
    const ac = brand.color || GOLD
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
        const r = ratings[itemKey(item)]
        return saveTastingConsumer({ event_id: eventId, client_id: item.clientId || undefined, first_name: contact.first_name || undefined, email: contact.email || undefined, product_rated: item.productName || undefined, rating: r?.rating || undefined, would_buy: r?.would_buy ?? undefined, notes: contact.notes || undefined, opted_in_marketing: contact.email ? contact.opted_in : false, captured_at: new Date().toISOString() })
      }))
      setStep('done')
    } catch { } finally { setSubmitting(false) }
  }

  // For multi-brand events CTA uses gold, single brand uses brand color
  const ctaColor = brands.length === 1 ? (brands[0]?.color || GOLD) : GOLD
  const cur      = selected[rateIdx]
  const curKey   = cur ? itemKey(cur) : ''
  const curR     = ratings[curKey] ?? { rating: 0, would_buy: null }
  const curBrand = brands.find(b => b.slug === cur?.brandSlug)

  const page: React.CSSProperties = { minHeight: '100vh', background: BG, color: CREAM, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', WebkitFontSmoothing: 'antialiased' }

  if (loading) return (
    <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: `2.5px solid ${GOLD}`, borderTop: '2.5px solid transparent', animation: 'spin 600ms linear infinite' }} />
    </div>
  )

  if (!event) return (
    <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: SEC }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🍸</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: CREAM, marginBottom: 6 }}>Event not found</div>
        <div style={{ fontSize: 14 }}>This tasting link may have expired.</div>
      </div>
    </div>
  )

  // ── DONE ──────────────────────────────────────────────────────────────────
  if (step === 'done') return (
    <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        <div style={{ width: 104, height: 104, borderRadius: '50%', background: `radial-gradient(circle, ${GOLD}30, ${GOLD}06)`, border: `2px solid ${GOLD}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', boxShadow: `0 0 48px ${GOLD}28` }}>
          <Check size={50} color={GOLD} strokeWidth={2} />
        </div>
        <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 10 }}>
          {contact.first_name ? `Thanks, ${contact.first_name}!` : 'Thank you!'}
        </div>
        <div style={{ fontSize: 16, color: SEC, lineHeight: 1.6, marginBottom: contact.opted_in ? 10 : 32 }}>Your feedback helps craft better spirits.</div>
        {contact.opted_in && <div style={{ fontSize: 13, color: GOLD, fontWeight: 600, marginBottom: 32 }}>You're on the list — good things coming.</div>}
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>Resetting in {countdown}s</div>
        <button onClick={doReset} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 40px', borderRadius: 50, fontSize: 16, fontWeight: 800, background: GOLD, color: BG, border: 'none', cursor: 'pointer', boxShadow: `0 4px 28px ${GOLD}45` }}>
          Next Person <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )

  // ── CONTACT ───────────────────────────────────────────────────────────────
  if (step === 'contact') return (
    <div style={page}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 28px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: GOLD, textTransform: 'uppercase', marginBottom: 10 }}>Optional</div>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 10, lineHeight: 1.1 }}>Want to stay<br />in the loop?</div>
        <div style={{ fontSize: 15, color: SEC, marginBottom: 36, lineHeight: 1.6 }}>New releases, events, the good stuff. No spam — ever.</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input type="text" placeholder="First name" value={contact.first_name}
            onChange={e => setContact(c => ({ ...c, first_name: e.target.value }))}
            style={{ flex: 1, padding: '16px', borderRadius: 14, border: `1.5px solid ${BORDER}`, background: CARD, color: CREAM, fontSize: 15, outline: 'none' }} />
          <input type="email" placeholder="Email address" value={contact.email}
            onChange={e => setContact(c => ({ ...c, email: e.target.value }))}
            style={{ flex: 2, padding: '16px', borderRadius: 14, border: `1.5px solid ${BORDER}`, background: CARD, color: CREAM, fontSize: 15, outline: 'none' }} />
        </div>

        {contact.email && (
          <button type="button" onClick={() => setContact(c => ({ ...c, opted_in: !c.opted_in }))}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', width: '100%', marginBottom: 14, border: `1.5px solid ${contact.opted_in ? GOLD : BORDER}`, borderRadius: 14, background: contact.opted_in ? GOLD + '12' : 'transparent', color: contact.opted_in ? GOLD : SEC, cursor: 'pointer', fontSize: 14, fontWeight: 600, transition: `all 200ms ease`, boxSizing: 'border-box' }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${contact.opted_in ? GOLD : MUTED}`, background: contact.opted_in ? GOLD : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: `all 200ms ${SPRING}` }}>
              {contact.opted_in && <Check size={13} color={BG} strokeWidth={3} />}
            </div>
            Yes, keep me updated on new releases
          </button>
        )}

        <textarea placeholder="Any other thoughts? (optional)" value={contact.notes}
          onChange={e => setContact(c => ({ ...c, notes: e.target.value }))} rows={3}
          style={{ width: '100%', padding: '16px', borderRadius: 14, border: `1.5px solid ${BORDER}`, background: CARD, color: CREAM, fontSize: 15, resize: 'none', lineHeight: 1.6, outline: 'none', boxSizing: 'border-box', marginBottom: 24 }} />

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: '20px', borderRadius: 16, fontSize: 17, fontWeight: 900, background: GOLD, color: BG, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', marginBottom: 10, opacity: submitting ? 0.7 : 1, letterSpacing: '-0.01em', boxShadow: `0 4px 28px ${GOLD}40` }}>
          {submitting ? 'Submitting…' : 'Submit Feedback'}
        </button>
        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'transparent', color: MUTED, border: `1px solid ${BORDER}`, cursor: 'pointer' }}>
          Skip & Submit
        </button>
      </div>
    </div>
  )

  // ── RATE ──────────────────────────────────────────────────────────────────
  if (step === 'rate') {
    const ac = cur?.brandColor || GOLD
    return (
      <div style={page}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '44px 28px' }}>
          {/* Progress dots */}
          {selected.length > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 44 }}>
              {selected.map((p, i) => (
                <div key={itemKey(p)} style={{ height: 5, width: i === rateIdx ? 30 : 5, borderRadius: 3, background: i === rateIdx ? ac : (ratings[itemKey(p)]?.rating > 0 ? ac + '50' : BORDER), transition: `all 300ms ${SPRING}` }} />
              ))}
            </div>
          )}

          {/* Brand + product card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px', borderRadius: 20, background: `linear-gradient(135deg, ${ac}14 0%, ${CARD} 100%)`, border: `1px solid ${ac}28`, marginBottom: 40 }}>
            <Logo brand={curBrand || { name: cur?.brandName, color: ac }} size={60} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: ac, textTransform: 'uppercase', marginBottom: 4 }}>{cur?.brandName}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: CREAM, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {cur?.productName || 'Overall impression'}
              </div>
            </div>
          </div>

          {/* Stars */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: MUTED, textTransform: 'uppercase', marginBottom: 20 }}>How did you enjoy it?</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
              {[1, 2, 3, 4, 5].map(n => {
                const lit = curR.rating >= n
                return (
                  <button key={n} type="button"
                    onClick={() => setRatings(r => ({ ...r, [curKey]: { rating: n, would_buy: r[curKey]?.would_buy ?? null } }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', transform: lit ? 'scale(1.14)' : 'scale(1)', transition: `transform 200ms ${SPRING}`, filter: lit ? `drop-shadow(0 0 10px ${ac}90)` : 'none' }}>
                    <Star size={62} fill={lit ? ac : 'transparent'} color={lit ? ac : BORDER} strokeWidth={1.5} />
                  </button>
                )
              })}
            </div>
            {curR.rating > 0 && (
              <div style={{ fontSize: 16, color: ac, fontWeight: 700, marginTop: 14, letterSpacing: '-0.01em' }}>
                {RATING_LABELS[curR.rating]}
              </div>
            )}
          </div>

          {/* Would buy — full-width stacked */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: MUTED, textTransform: 'uppercase', marginBottom: 14, textAlign: 'center' }}>Would you buy this?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([{ label: '👍   Yes, I would buy it', v: true }, { label: '🤔   Maybe', v: null as null }, { label: '👎   Not for me', v: false }]).map(opt => {
                const isA = opt.v === true ? curR.would_buy === true : opt.v === false ? curR.would_buy === false : (curR.would_buy === null && ratings[curKey] !== undefined)
                return (
                  <button key={String(opt.v)} type="button"
                    onClick={() => setRatings(r => ({ ...r, [curKey]: { rating: r[curKey]?.rating ?? 0, would_buy: opt.v } }))}
                    style={{ width: '100%', padding: '16px 20px', borderRadius: 14, fontSize: 15, cursor: 'pointer', fontWeight: 600, textAlign: 'left', border: `1.5px solid ${isA ? ac : BORDER}`, background: isA ? `linear-gradient(90deg, ${ac}22, ${ac}08)` : CARD, color: isA ? ac : SEC, transition: `all 180ms ${SPRING}`, boxShadow: isA ? `0 0 0 1px ${ac}28` : 'none', transform: isA ? 'scale(1.01)' : 'scale(1)' }}>
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
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 800, background: curR.rating > 0 ? ac : BORDER, color: curR.rating > 0 ? BG : MUTED, border: 'none', cursor: curR.rating > 0 ? 'pointer' : 'not-allowed', transition: `all 220ms ${SPRING}`, boxShadow: curR.rating > 0 ? `0 4px 24px ${ac}40` : 'none', letterSpacing: '-0.01em' }}>
              {rateIdx < selected.length - 1 ? <>Next <ChevronRight size={16} /></> : <>Finish <ChevronRight size={16} /></>}
            </button>
          </div>
          {curR.rating === 0 && <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 12 }}>Tap a star to continue</div>}
        </div>
      </div>
    )
  }

  // ── SELECT ────────────────────────────────────────────────────────────────
  return (
    <div style={page}>
      {sheet && <ProductSheet brand={sheet} selected={selected} onToggle={toggleProduct} onClose={() => setSheet(null)} />}

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '52px 24px 36px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          {event.title && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: MUTED, textTransform: 'uppercase', marginBottom: 12 }}>{event.title}</div>}
          <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.05, marginBottom: 12 }}>What did you<br />try today?</div>
          <div style={{ fontSize: 15, color: SEC }}>Tap a brand, then pick specific products if you'd like.</div>
        </div>

        {/* Brand grid — equal height tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(brands.length, 3)}, 1fr)`, gap: 14, marginBottom: 28 }}>
          {brands.map(brand => {
            const ac = brand.color || GOLD
            const isSel = selected.some(s => s.brandSlug === brand.slug)
            const brandItems = selected.filter(s => s.brandSlug === brand.slug)
            const productCount = brandItems.filter(x => x.productName).length
            const hasProds = brand.products?.length > 0

            return (
              <div key={brand.slug} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Card */}
                <button type="button" onClick={() => toggleBrand(brand)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 16, padding: '36px 16px 28px',
                    minHeight: 210,
                    borderRadius: 24,
                    border: `2px solid ${isSel ? ac : BORDER}`,
                    background: isSel
                      ? `radial-gradient(ellipse at 50% 20%, ${ac}22 0%, ${CARD} 68%)`
                      : CARD,
                    cursor: 'pointer',
                    transition: `all 250ms ${SPRING}`,
                    position: 'relative',
                    transform: isSel ? 'translateY(-3px) scale(1.02)' : 'translateY(0) scale(1)',
                    boxShadow: isSel
                      ? `0 0 0 1px ${ac}35, 0 12px 40px ${ac}22, 0 4px 12px rgba(0,0,0,0.4)`
                      : '0 2px 10px rgba(0,0,0,0.35)',
                    outline: 'none',
                    flex: 1,
                  }}>
                  {isSel && (
                    <div style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: '50%', background: ac, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 12px ${ac}65` }}>
                      <Check size={15} color={BG} strokeWidth={3} />
                    </div>
                  )}
                  <Logo brand={brand} size={88} />
                  <div style={{ fontSize: 15, fontWeight: 800, color: isSel ? ac : CREAM, textAlign: 'center', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                    {brand.name}
                  </div>
                </button>

                {/* Products button — only when selected, opens bottom sheet */}
                {isSel && hasProds && (
                  <button type="button" onClick={() => setSheet(brand)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 14px', fontSize: 12, fontWeight: 700, color: productCount > 0 ? ac : SEC, background: productCount > 0 ? ac + '15' : 'transparent', border: `1px solid ${productCount > 0 ? ac + '40' : BORDER}`, borderRadius: 12, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', transition: `all 200ms ease` }}>
                    {productCount > 0
                      ? <><Check size={11} strokeWidth={3} /> {productCount} product{productCount > 1 ? 's' : ''}</>
                      : <>{brand.products.length} product{brand.products.length > 1 ? 's' : ''} →</>}
                  </button>
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
            width: '100%', padding: '22px 28px', borderRadius: 20, fontSize: 19, fontWeight: 900,
            background: selected.length > 0 ? ctaColor : CARD,
            color: selected.length > 0 ? BG : MUTED,
            border: `2px solid ${selected.length > 0 ? ctaColor : BORDER}`,
            cursor: selected.length > 0 ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            transition: `all 280ms ${SPRING}`,
            boxShadow: selected.length > 0 ? `0 6px 36px ${ctaColor}42` : 'none',
            transform: selected.length > 0 ? 'scale(1.01)' : 'scale(1)',
            letterSpacing: '-0.02em',
          }}>
          {selected.length > 0
            ? <>Rate {selected.length} selection{selected.length !== 1 ? 's' : ''} <ChevronRight size={22} /></>
            : 'Tap a brand to get started'}
        </button>

        {selected.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: MUTED, letterSpacing: '0.01em' }}>
            {selected.map(s => s.productName || s.brandName).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
