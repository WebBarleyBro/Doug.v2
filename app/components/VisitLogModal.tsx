'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Search, Check, Plus, AlertCircle, ChevronDown, ChevronRight, Package } from 'lucide-react'
import { t, inputStyle, labelStyle, btnPrimary, modalOverlay, mobileSheetContent } from '../lib/theme'
import { logVisit, getAccounts, getClients, getProducts, createPlacement } from '../lib/data'
import { getSupabase } from '../lib/supabase'
import { todayMT, isFutureDate, saveDateMT } from '../lib/formatters'
import type { Account, Client, Product, VisitStatus, PlacementType, PlacementStatus } from '../lib/types'
import AddAccountModal from './AddAccountModal'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  userId?: string
  defaultAccountId?: string
  defaultAccountName?: string
  defaultClientSlugs?: string[]
  isMobile?: boolean
}

interface TastingEntry {
  clientSlug: string
  products: string[]
  notes: string
}

interface PlacementEntry {
  client_slug: string
  product_name: string
  placement_type: PlacementType
  status: PlacementStatus
  shelf_count: string
  price_point: string
  notes: string
}

const emptyPlacement = (): PlacementEntry => ({
  client_slug: '',
  product_name: '',
  placement_type: 'shelf',
  status: 'on_shelf',
  shelf_count: '',
  price_point: '',
  notes: '',
})

interface FormState {
  account_id: string
  account_name: string
  client_slugs: string[]
  visited_at: string
  status: VisitStatus
  notes: string
  client_notes: Record<string, string>
  tastings: TastingEntry[]
  followup_days: number | null
  create_checkin: boolean
}

const emptyForm = (defaultDate: string): FormState => ({
  account_id: '',
  account_name: '',
  client_slugs: [],
  visited_at: defaultDate,
  status: 'General Check-In',
  notes: '',
  client_notes: {},
  tastings: [],
  followup_days: null,
  create_checkin: false,
})

export default function VisitLogModal({
  isOpen, onClose, onSuccess, userId, defaultAccountId, defaultAccountName, defaultClientSlugs, isMobile,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm(todayMT()))
  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Record<string, Product[]>>({})
  const [accountSearch, setAccountSearch] = useState('')
  const [accountResults, setAccountResults] = useState<Account[]>([])
  const [showAccountSearch, setShowAccountSearch] = useState(!defaultAccountId)
  const [showAddAccountModal, setShowAddAccountModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [placements, setPlacements] = useState<PlacementEntry[]>([])
  const [showPlacements, setShowPlacements] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    getClients().then(setClients).catch(() => {})
  }, [isOpen])

  function ensureProducts(slug: string) {
    if (!slug || products[slug]) return
    getProducts(slug).then(prods => setProducts(prev => ({ ...prev, [slug]: prods }))).catch(() => {})
  }

  useEffect(() => {
    form.client_slugs.forEach(ensureProducts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.client_slugs])

  // Load products for all clients when the placement panel opens
  useEffect(() => {
    if (!showPlacements) return
    clients.forEach(c => ensureProducts(c.slug))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPlacements, clients])

  useEffect(() => {
    if (!accountSearch || accountSearch.length < 2) { setAccountResults([]); return }
    getAccounts({ search: accountSearch, limit: 8 })
      .then(res => setAccountResults(res.filter((a: Account, i: number, arr: Account[]) => arr.findIndex((x: Account) => x.id === a.id) === i)))
      .catch(() => {})
  }, [accountSearch])

  useEffect(() => {
    if (!isOpen) { setSaved(false); setError(''); return }
    const d = todayMT()
    setForm({
      ...emptyForm(d),
      account_id: defaultAccountId || '',
      account_name: defaultAccountName || '',
      client_slugs: defaultClientSlugs || [],
      followup_days: null,
      create_checkin: false,
    })
    setPlacements([])
    setShowPlacements(false)
    if (defaultAccountId) setShowAccountSearch(false)
    else setShowAccountSearch(true)
  }, [isOpen, defaultAccountId, defaultAccountName, defaultClientSlugs])

  function selectAccount(acc: Account) {
    const slugs = acc.account_clients?.map(ac => ac.client_slug) || []
    setForm(f => ({
      ...f,
      account_id: acc.id,
      account_name: acc.name,
      client_slugs: slugs.length > 0 && f.client_slugs.length === 0 ? slugs : f.client_slugs,
    }))
    setShowAccountSearch(false)
    setAccountSearch('')
    setAccountResults([])
  }

  function toggleClient(slug: string) {
    setForm(f => {
      const slugs = f.client_slugs.includes(slug)
        ? f.client_slugs.filter(s => s !== slug)
        : [...f.client_slugs, slug]
      const tastings = slugs.map(s =>
        f.tastings.find(t => t.clientSlug === s) || { clientSlug: s, products: [], notes: '' }
      )
      return { ...f, client_slugs: slugs, tastings }
    })
  }

  function toggleTastingProduct(clientSlug: string, productName: string) {
    setForm(f => ({
      ...f,
      tastings: f.tastings.map(t =>
        t.clientSlug !== clientSlug ? t : {
          ...t,
          products: t.products.includes(productName)
            ? t.products.filter(p => p !== productName)
            : [...t.products, productName],
        }
      ),
    }))
  }

  function updateTasting(clientSlug: string, value: string) {
    setForm(f => ({
      ...f,
      tastings: f.tastings.map(t => t.clientSlug !== clientSlug ? t : { ...t, notes: value }),
    }))
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setError('')
    if (!form.account_id) { setError('Please select an account.'); return }
    if (!form.visited_at) { setError('Please enter a visit date.'); return }
    if (isFutureDate(form.visited_at)) { setError('Visit date cannot be in the future.'); return }

    // Build per-client notes that include tasting details for that client only
    const clientNotesWithTasting: Record<string, string> = { ...form.client_notes }
    form.tastings
      .filter(t => t.products.length > 0 || t.notes)
      .forEach(t => {
        const parts = [
          t.products.length > 0 ? `Tasted: ${t.products.join(', ')}` : '',
          t.notes || '',
        ].filter(Boolean).join(' | ')
        const existing = clientNotesWithTasting[t.clientSlug] || ''
        clientNotesWithTasting[t.clientSlug] = [existing, parts].filter(Boolean).join('\n')
      })

    const followupNote = form.followup_days
      ? `Follow up in ${form.followup_days} days`
      : form.create_checkin ? 'General check-in reminder' : undefined

    setSaving(true)
    try {
      let resolvedUserId = userId
      if (!resolvedUserId) {
        const { data: { user } } = await getSupabase().auth.getUser()
        resolvedUserId = user?.id
      }
      if (!resolvedUserId) { setError('Not signed in.'); return }
      await logVisit({
        account_id: form.account_id,
        user_id: resolvedUserId,
        client_slugs: form.client_slugs,
        visited_at: saveDateMT(form.visited_at),
        status: form.status,
        notes: form.notes || undefined,
        client_notes: Object.keys(clientNotesWithTasting).length > 0 ? clientNotesWithTasting : undefined,
        create_followup: !!(form.followup_days || form.create_checkin),
        followup_note: followupNote,
      })

      // Save any placements added during the visit
      const validPlacements = placements.filter(p => p.product_name.trim() && p.client_slug)
      await Promise.all(validPlacements.map(p => createPlacement({
        account_id: form.account_id,
        client_slug: p.client_slug,
        product_name: p.product_name.trim(),
        placement_type: p.placement_type,
        status: p.status,
        shelf_count: p.shelf_count ? parseInt(p.shelf_count) : undefined,
        price_point: p.price_point ? parseFloat(p.price_point) : undefined,
        notes: p.notes || undefined,
        shelf_date: saveDateMT(form.visited_at),
      })))

      setSaved(true)
      setTimeout(() => { onClose(); onSuccess?.() }, 1200)
    } catch (err: any) {
      setError(err.message || 'Failed to log visit.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const statusOptions: { value: VisitStatus; color: string }[] = [
    { value: 'Just Ordered',     color: t.status.success },
    { value: 'Will Order Soon',  color: t.status.warning },
    { value: 'New Placement',    color: t.gold },
    { value: 'Menu Feature Won', color: t.status.success },
    { value: 'Needs Follow Up',  color: t.status.info },
    { value: 'Not Interested',   color: t.status.danger },
    { value: 'General Check-In', color: t.text.muted },
  ]

  const content = (
    <div style={{ padding: isMobile ? '0 16px 24px' : '0' }}>
      {isMobile && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.border.hover }} />
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 0 16px' : '28px 28px 0',
        ...(isMobile ? {} : { paddingBottom: '20px', borderBottom: `1px solid ${t.border.default}` }),
      }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.01em' }}>Log a Visit</h2>
          {saved && <p style={{ fontSize: '12px', color: t.status.success }}>Visit logged!</p>}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '6px' }}>
          <X size={20} />
        </button>
      </div>

      {saved && (
        <div style={{ padding: isMobile ? '32px 0' : '40px 28px', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            backgroundColor: t.status.successBg, border: `2px solid ${t.status.success}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <Check size={32} color={t.status.success} />
          </div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: t.text.primary }}>Visit Logged!</div>
          <div style={{ fontSize: '13px', color: t.text.muted, marginTop: '6px' }}>
            {form.account_name} · {form.status}
          </div>
        </div>
      )}

      {!saved && (
        <form onSubmit={handleSubmit} style={{ padding: isMobile ? '0' : '20px 28px 28px' }}>

          {/* Account */}
          <Section label="Account">
            {!showAccountSearch && form.account_name ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', backgroundColor: t.bg.input,
                border: `1px solid ${t.border.default}`, borderRadius: '8px',
              }}>
                <span style={{ color: t.text.primary, fontSize: '15px' }}>{form.account_name}</span>
                <button type="button" onClick={() => { setShowAccountSearch(true); setForm(f => ({ ...f, account_id: '', account_name: '' })) }}
                  style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', fontSize: '12px' }}>
                  Change
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.text.muted }} />
                  <input
                    ref={searchRef}
                    type="text"
                    value={accountSearch}
                    onChange={e => setAccountSearch(e.target.value)}
                    placeholder="Search accounts..."
                    autoFocus
                    style={{ ...inputStyle, paddingLeft: '36px' }}
                  />
                </div>
                {accountResults.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`,
                    borderRadius: '8px', marginTop: '4px', overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}>
                    {accountResults.map(acc => (
                      <button key={acc.id} type="button" onClick={() => selectAccount(acc)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '10px 14px', background: 'none', border: 'none',
                          color: t.text.primary, cursor: 'pointer', fontSize: '14px',
                          borderBottom: `1px solid ${t.border.subtle}`,
                        }}>
                        <div style={{ fontWeight: '500' }}>{acc.name}</div>
                        {acc.address && <div style={{ fontSize: '12px', color: t.text.muted }}>{acc.address}</div>}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => setShowAddAccountModal(true)} style={{
                  marginTop: '8px', fontSize: '12px', color: t.gold, background: 'none', border: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0',
                }}>
                  <Plus size={13} /> Create new account
                </button>
              </div>
            )}
          </Section>

          {/* Date */}
          <Section label="Visit Date">
            <input
              type="date"
              value={form.visited_at}
              max={todayMT()}
              onChange={e => setForm(f => ({ ...f, visited_at: e.target.value }))}
              style={inputStyle}
            />
          </Section>

          {/* Brands */}
          {clients.length > 0 && (
            <Section label="Brands (select all that apply)">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {clients.map(c => {
                  const selected = form.client_slugs.includes(c.slug)
                  return (
                    <button key={c.slug} type="button" onClick={() => toggleClient(c.slug)} style={{
                      padding: '7px 14px', borderRadius: '20px',
                      border: `1px solid ${selected ? c.color : t.border.default}`,
                      backgroundColor: selected ? (c.color + '20') : 'transparent',
                      color: selected ? c.color : t.text.secondary,
                      fontSize: '13px', fontWeight: selected ? '600' : '400',
                      cursor: 'pointer', transition: 'all 150ms ease',
                    }}>
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Outcome */}
          <Section label="Outcome">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '6px' }}>
              {statusOptions.map(s => (
                <button key={s.value} type="button" onClick={() => setForm(f => ({ ...f, status: s.value }))}
                  style={{
                    padding: '9px 12px', borderRadius: '8px',
                    border: `1px solid ${form.status === s.value ? s.color : t.border.default}`,
                    backgroundColor: form.status === s.value ? (s.color + '15') : 'transparent',
                    color: form.status === s.value ? s.color : t.text.secondary,
                    fontSize: '12.5px', fontWeight: form.status === s.value ? '600' : '400',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 120ms ease',
                  }}>
                  {s.value}
                </button>
              ))}
            </div>
          </Section>

          {/* Notes — per-brand when multiple brands selected */}
          {form.client_slugs.length > 1 ? (
            <Section label="Notes (per brand)">
              <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '10px' }}>
                Each brand's client portal only shows notes written for that brand.
              </div>
              {form.client_slugs.map(slug => {
                const client = clients.find(c => c.slug === slug)
                return (
                  <div key={slug} style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: client?.color || t.gold, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {client?.name || slug}
                    </div>
                    <textarea
                      value={form.client_notes[slug] || ''}
                      onChange={e => setForm(f => ({ ...f, client_notes: { ...f.client_notes, [slug]: e.target.value } }))}
                      placeholder={`Notes for ${client?.name || slug} only...`}
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }}
                    />
                  </div>
                )
              })}
            </Section>
          ) : (
            <Section label="Notes (optional)">
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="What happened? Any context for next time..."
                rows={isMobile ? 3 : 4}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
              />
            </Section>
          )}

          {/* Tasting details per brand */}
          {form.client_slugs.length > 0 && (
            <Section label="Tasting Details (optional)">
              {form.tastings.map(tasting => {
                const client = clients.find(c => c.slug === tasting.clientSlug)
                const prods = products[tasting.clientSlug] || []
                return (
                  <div key={tasting.clientSlug} style={{
                    backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`,
                    borderRadius: '10px', padding: '12px', marginBottom: '10px',
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: client?.color || t.gold, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {client?.name}
                    </div>
                    {prods.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '6px' }}>Products Tasted</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {prods.map(p => {
                            const sel = tasting.products.includes(p.name)
                            return (
                              <button key={p.id} type="button" onClick={() => toggleTastingProduct(tasting.clientSlug, p.name)} style={{
                                padding: '4px 10px', borderRadius: '12px',
                                border: `1px solid ${sel ? client?.color || t.gold : t.border.default}`,
                                backgroundColor: sel ? ((client?.color || t.gold) + '20') : 'transparent',
                                color: sel ? (client?.color || t.gold) : t.text.muted,
                                fontSize: '12px', cursor: 'pointer',
                              }}>{p.name}</button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <textarea
                      value={tasting.notes}
                      onChange={e => updateTasting(tasting.clientSlug, e.target.value)}
                      placeholder="Tasting notes, consumer reactions..."
                      rows={2}
                      style={{ ...inputStyle, fontSize: '13px', resize: 'none', marginTop: prods.length > 0 ? '8px' : 0 }}
                    />
                  </div>
                )
              })}
            </Section>
          )}

          {/* Placements */}
          {(form.status === 'New Placement' || form.status === 'Menu Feature Won') && !showPlacements && (
            <div style={{ marginBottom: '8px', padding: '8px 12px', borderRadius: '8px', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, fontSize: '12px', color: t.gold, fontWeight: '600' }}>
              You selected "{form.status}" — don't forget to log the placement below
            </div>
          )}
          <div style={{ marginBottom: '18px' }}>
            <button
              type="button"
              onClick={() => {
                setShowPlacements(v => !v)
                if (!showPlacements && placements.length === 0) {
                  setPlacements([{ ...emptyPlacement(), client_slug: form.client_slugs[0] || '' }])
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                border: `1px solid ${showPlacements ? t.gold : t.border.default}`,
                backgroundColor: showPlacements ? t.goldDim : t.bg.input,
                color: showPlacements ? t.gold : t.text.secondary,
                fontSize: '13px', fontWeight: '500', textAlign: 'left',
                transition: 'all 150ms ease',
              }}
            >
              <Package size={14} />
              <span style={{ flex: 1 }}>Log Placement / Shelf Count</span>
              {placements.filter(p => p.product_name).length > 0 && (
                <span style={{ fontSize: '11px', backgroundColor: t.goldDim, color: t.gold, padding: '2px 7px', borderRadius: '10px', fontWeight: '600' }}>
                  {placements.filter(p => p.product_name).length}
                </span>
              )}
              {showPlacements ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {showPlacements && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {placements.map((pl, i) => (
                  <div key={i} style={{ backgroundColor: t.bg.input, border: `1px solid ${t.border.default}`, borderRadius: '10px', padding: '14px', position: 'relative' }}>
                    {placements.length > 1 && (
                      <button type="button" onClick={() => setPlacements(ps => ps.filter((_, idx) => idx !== i))}
                        style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '2px' }}>
                        <X size={14} />
                      </button>
                    )}

                    {/* Brand */}
                    {clients.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Brand</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {(form.client_slugs.length > 0 ? clients.filter(c => form.client_slugs.includes(c.slug)) : clients).map(c => (
                            <button key={c.slug} type="button" onClick={() => { setPlacements(ps => ps.map((p, idx) => idx !== i ? p : { ...p, client_slug: c.slug, product_name: '' })); ensureProducts(c.slug) }}
                              style={{
                                padding: '5px 12px', borderRadius: '16px', fontSize: '12px', cursor: 'pointer',
                                border: `1px solid ${pl.client_slug === c.slug ? c.color : t.border.default}`,
                                backgroundColor: pl.client_slug === c.slug ? c.color + '20' : 'transparent',
                                color: pl.client_slug === c.slug ? c.color : t.text.muted,
                                fontWeight: pl.client_slug === c.slug ? '600' : '400',
                              }}>{c.name}</button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Product */}
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Product</div>
                      {pl.client_slug && (products[pl.client_slug] || []).length > 0 ? (
                        <select
                          value={pl.product_name}
                          onChange={e => setPlacements(ps => ps.map((p, idx) => idx !== i ? p : { ...p, product_name: e.target.value }))}
                          style={{ ...inputStyle, fontSize: '13px' }}
                        >
                          <option value="">Select product...</option>
                          {(products[pl.client_slug] || []).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      ) : (
                        <input type="text" placeholder="Product name" value={pl.product_name}
                          onChange={e => setPlacements(ps => ps.map((p, idx) => idx !== i ? p : { ...p, product_name: e.target.value }))}
                          style={{ ...inputStyle, fontSize: '13px' }} />
                      )}
                    </div>

                    {/* Type + Status */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</div>
                        <select value={pl.placement_type}
                          onChange={e => setPlacements(ps => ps.map((p, idx) => idx !== i ? p : { ...p, placement_type: e.target.value as PlacementType }))}
                          style={{ ...inputStyle, fontSize: '13px' }}>
                          <option value="shelf">Shelf</option>
                          <option value="menu">Menu</option>
                          <option value="cocktail">Cocktail</option>
                          <option value="well">Well</option>
                          <option value="retail">Retail</option>
                          <option value="seasonal">Seasonal</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</div>
                        <select value={pl.status}
                          onChange={e => setPlacements(ps => ps.map((p, idx) => idx !== i ? p : { ...p, status: e.target.value as PlacementStatus }))}
                          style={{ ...inputStyle, fontSize: '13px' }}>
                          <option value="on_shelf">On Shelf</option>
                          <option value="committed">Committed</option>
                          <option value="ordered">Ordered</option>
                          <option value="reordering">Reordering</option>
                        </select>
                      </div>
                    </div>

                    {/* Shelf count + Price */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Units on Shelf</div>
                        <input type="number" placeholder="e.g. 6" min="0" value={pl.shelf_count}
                          onChange={e => setPlacements(ps => ps.map((p, idx) => idx !== i ? p : { ...p, shelf_count: e.target.value }))}
                          style={{ ...inputStyle, fontSize: '13px' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Price Point ($)</div>
                        <input type="number" placeholder="e.g. 42" min="0" step="0.01" value={pl.price_point}
                          onChange={e => setPlacements(ps => ps.map((p, idx) => idx !== i ? p : { ...p, price_point: e.target.value }))}
                          style={{ ...inputStyle, fontSize: '13px' }} />
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes (optional)</div>
                      <input type="text" placeholder="e.g. Front-of-bar, facing label out..." value={pl.notes}
                        onChange={e => setPlacements(ps => ps.map((p, idx) => idx !== i ? p : { ...p, notes: e.target.value }))}
                        style={{ ...inputStyle, fontSize: '13px' }} />
                    </div>
                  </div>
                ))}

                <button type="button"
                  onClick={() => setPlacements(ps => [...ps, { ...emptyPlacement(), client_slug: form.client_slugs[0] || '' }])}
                  style={{ fontSize: '12px', color: t.gold, background: 'none', border: `1px dashed ${t.border.default}`, borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Plus size={13} /> Add another placement
                </button>
              </div>
            )}
          </div>

          {/* Follow-up */}
          <Section label="Follow-Up">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '11px', color: t.text.muted, marginBottom: '6px' }}>Schedule a follow-up in:</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[3, 7, 14, 30].map(days => (
                    <button key={days} type="button"
                      onClick={() => setForm(f => ({ ...f, followup_days: f.followup_days === days ? null : days, create_checkin: false }))}
                      style={{
                        padding: '7px 14px', borderRadius: '8px', fontSize: '12.5px', cursor: 'pointer',
                        border: `1px solid ${form.followup_days === days ? t.gold : t.border.default}`,
                        backgroundColor: form.followup_days === days ? t.goldDim : 'transparent',
                        color: form.followup_days === days ? t.gold : t.text.secondary,
                        fontWeight: form.followup_days === days ? '700' : '400',
                        transition: 'all 120ms ease',
                      }}>
                      {days}d
                    </button>
                  ))}
                </div>
              </div>
              <button type="button"
                onClick={() => setForm(f => ({ ...f, create_checkin: !f.create_checkin, followup_days: null }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px', width: '100%', textAlign: 'left',
                  border: `1px solid ${form.create_checkin ? t.border.hover : t.border.subtle}`,
                  borderRadius: '8px',
                  backgroundColor: form.create_checkin ? t.bg.elevated : 'transparent',
                  color: form.create_checkin ? t.text.secondary : t.text.muted,
                  cursor: 'pointer', fontSize: '13px', transition: 'all 150ms ease',
                }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  border: `1.5px solid ${form.create_checkin ? t.text.muted : t.border.hover}`,
                  backgroundColor: form.create_checkin ? t.text.muted : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {form.create_checkin && <Check size={9} color="#0f0f0d" strokeWidth={3} />}
                </div>
                <span>Remind me to check in</span>
                <span style={{ fontSize: '11px', color: t.text.muted, marginLeft: 'auto' }}>no set date</span>
              </button>
            </div>
          </Section>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
              backgroundColor: t.status.dangerBg, border: `1px solid rgba(224,82,82,0.2)`,
              borderRadius: '8px', color: t.status.danger, fontSize: '13px', marginBottom: '16px',
            }}>
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <button type="submit" disabled={saving || !form.account_id}
            style={{
              ...btnPrimary, width: '100%', justifyContent: 'center', padding: '13px', fontSize: '15px',
              opacity: saving || !form.account_id ? 0.6 : 1,
              cursor: saving || !form.account_id ? 'not-allowed' : 'pointer', marginTop: '8px',
            }}>
            {saving ? 'Saving...' : 'Log Visit'}
          </button>
        </form>
      )}
    </div>
  )

  const modalWrapper = isMobile ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div className="slide-up" style={{ ...mobileSheetContent, position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '95vh', overflowY: 'auto' }}>
        {content}
      </div>
    </div>
  ) : (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fade-in" style={{
        backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`,
        borderRadius: '16px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {content}
      </div>
    </div>
  )

  return (
    <>
      {modalWrapper}
      {showAddAccountModal && (
        <AddAccountModal
          onClose={() => setShowAddAccountModal(false)}
          onAdded={acc => { selectAccount(acc as Account); setShowAddAccountModal(false) }}
          isMobile={isMobile}
        />
      )}
    </>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      {label && <label style={labelStyle}>{label}</label>}
      {children}
    </div>
  )
}
