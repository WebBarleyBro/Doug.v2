'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Check, Plus, Package, User, ChevronDown, Calendar, GlassWater, Building2, Clock } from 'lucide-react'
import { v3, v3input, v3label, WIN_STATUSES } from '../lib/theme'
import { useV3Clients, useLogVisit } from '../lib/query'
import { useWinMoment, useV3Toast } from '../lib/context'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../../lib/supabase'
import { relativeTimeStr } from '../../lib/formatters'
import { createPlacement } from '../../lib/data'
import type { Client } from '../../lib/types'

const STATUS_GROUPS = [
  {
    label: 'WINS',
    items: [
      { value: 'New Placement',    desc: 'Product secured at venue',   color: '#5a9ea0' },
      { value: 'Menu Feature Won', desc: 'On menu or bar feature',     color: '#5a9ea0' },
      { value: 'Just Ordered',     desc: 'Order placed or confirmed',  color: '#5a9ea0' },
    ],
  },
  {
    label: 'ACTIVE',
    items: [
      { value: 'Will Order Soon',  desc: 'Strong interest, follow up', color: '#b87840' },
      { value: 'Tasted',           desc: 'Did a tasting at this account', color: '#c4a46e' },
      { value: 'General Check-In', desc: 'Routine relationship visit', color: 'rgba(255,255,255,0.35)' },
    ],
  },
  {
    label: 'ATTENTION',
    items: [
      { value: 'Needs Follow Up',  desc: 'Something needs resolution', color: '#bf7850' },
      { value: 'Not Interested',   desc: 'No interest at this time',   color: 'rgba(255,255,255,0.38)' },
    ],
  },
]

const FOLLOWUP_OPTIONS = [
  { label: 'None',    days: 0  },
  { label: '3 days',  days: 3  },
  { label: '7 days',  days: 7  },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
]

interface Props {
  onClose: () => void
  preAccount?: { id: string; name: string } | null
  onSuccess?: () => void
}

export default function LogVisitModal({ onClose, preAccount, onSuccess }: Props) {
  const { data: clients = [] } = useV3Clients()
  const logVisit = useLogVisit()
  const { trigger: triggerWin } = useWinMoment()
  const { show: toast } = useV3Toast()
  const qc = useQueryClient()

  // Core state
  const [accountSearch, setAccountSearch]   = useState(preAccount?.name ?? '')
  const [accountId, setAccountId]           = useState(preAccount?.id ?? '')
  const [accountResults, setAccountResults] = useState<any[]>([])
  const [selectedSlugs, setSelectedSlugs]   = useState<string[]>([])
  const [status, setStatus]                 = useState('')
  const [dateChoice, setDateChoice]         = useState<'today' | 'yesterday'>('today')

  // Notes — shared or per-brand
  const [sharedNotes, setSharedNotes]     = useState('')
  const [brandNotes, setBrandNotes]       = useState<Record<string, string>>({})

  // Follow-up
  const [followupDays, setFollowupDays]   = useState(0)

  // Tasting notes
  const [tastingNotes, setTastingNotes]   = useState('')

  // Feedback
  const [feedback, setFeedback]           = useState('')

  // Create new account inline
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [newAccName, setNewAccName]       = useState('')
  const [newAccType, setNewAccType]       = useState<'on_premise' | 'off_premise'>('on_premise')
  const [newAccAddr, setNewAccAddr]       = useState('')
  const [creatingAccSaving, setCreatingAccSaving] = useState(false)

  // Extras (progressive disclosure)
  const [showExtras, setShowExtras]       = useState(false)
  const [extraPanel, setExtraPanel]       = useState<'placement' | 'contact' | null>(null)

  // Placement sub-form
  const [placementProduct, setPlacementProduct]   = useState('')
  const [placementType, setPlacementType]         = useState('shelf')
  const [placementStatus, setPlacementStatus]     = useState<'committed' | 'ordered' | 'on_shelf'>('committed')
  const [placementPrice, setPlacementPrice]       = useState('')
  const [placementShelfCount, setPlacementShelfCount] = useState('')
  const [placementSlug, setPlacementSlug]         = useState(selectedSlugs[0] ?? '')

  // Contact sub-form
  const [contactName, setContactName]   = useState('')
  const [contactRole, setContactRole]   = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (selectedSlugs.length > 0 && !selectedSlugs.includes(placementSlug)) {
      setPlacementSlug(selectedSlugs[0])
    }
  }, [selectedSlugs])

  useEffect(() => {
    if (preAccount) return
    if (!accountSearch.trim() || accountSearch.length < 2) { setAccountResults([]); return }
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(async () => {
      const sb = getSupabase()
      const { data } = await sb.from('accounts').select('id, name, address, last_visited').ilike('name', `%${accountSearch}%`).limit(8)
      setAccountResults(data ?? [])
    }, 250)
  }, [accountSearch, preAccount])

  function toggleSlug(slug: string) {
    setSelectedSlugs(s => s.includes(slug) ? s.filter(x => x !== slug) : [...s, slug])
  }

  function visitedAt() {
    if (dateChoice === 'today') return new Date().toISOString()
    const d = new Date()
    d.setDate(d.getDate() - 1)
    d.setHours(18, 0, 0, 0) // yesterday at 6pm
    return d.toISOString()
  }

  const canSubmit = accountId && selectedSlugs.length > 0 && status
  const multiBrand = selectedSlugs.length > 1

  async function handleCreateAccount() {
    if (!newAccName.trim() || creatingAccSaving) return
    setCreatingAccSaving(true)
    try {
      const sb = getSupabase()
      const { data, error } = await sb.from('accounts').insert({
        name: newAccName.trim(),
        account_type: newAccType,
        address: newAccAddr.trim() || null,
        visit_frequency_days: 30,
      }).select('id, name').single()
      if (error) throw error
      setAccountId(data.id)
      setAccountSearch(data.name)
      setCreatingAccount(false)
      setNewAccName('')
      setNewAccAddr('')
      toast('Account created')
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create account')
      toast('Failed to create account', 'error')
    } finally {
      setCreatingAccSaving(false)
    }
  }

  async function handleSubmit() {
    if (!canSubmit || saving) return
    setSaving(true)
    setError('')
    try {
      const clientNotes = multiBrand
        ? Object.fromEntries(selectedSlugs.map(s => [s, brandNotes[s] ?? '']))
        : undefined

      await logVisit.mutateAsync({
        account_id: accountId,
        client_slugs: selectedSlugs,
        status: status as any,
        notes: multiBrand ? undefined : (sharedNotes || undefined),
        client_notes: multiBrand ? clientNotes : undefined,
        tasting_notes: tastingNotes || undefined,
        feedback: feedback || undefined,
        visited_at: visitedAt(),
        followup_days: followupDays > 0 ? followupDays : undefined,
        create_followup: followupDays > 0,
      })
      toast('Visit logged')

      if (showExtras && extraPanel === 'placement' && placementProduct.trim() && placementSlug) {
        await createPlacement({
          account_id: accountId,
          client_slug: placementSlug,
          product_name: placementProduct.trim(),
          placement_type: placementType as any,
          status: placementStatus,
          price_point: placementPrice ? Number(placementPrice) : undefined,
          shelf_count: placementShelfCount ? Number(placementShelfCount) : undefined,
        })
        qc.invalidateQueries({ queryKey: ['v3', 'placements'] })
        qc.invalidateQueries({ queryKey: ['v3', 'account', accountId, 'placements'] })
        toast('Placement added')
      }

      if (showExtras && extraPanel === 'contact' && contactName.trim()) {
        const sb = getSupabase()
        const { error: contactErr } = await sb.from('contacts').insert({
          account_id: accountId,
          client_slug: selectedSlugs[0] || null,
          name: contactName.trim(),
          role: contactRole || null,
          phone: contactPhone || null,
          email: contactEmail || null,
          category: 'general',
        })
        if (!contactErr) {
          qc.invalidateQueries({ queryKey: ['v3', 'account', accountId, 'contacts'] })
          toast('Contact saved')
        } else {
          toast('Contact not saved', 'error')
        }
      }

      setSaved(true)

      if (WIN_STATUSES.has(status)) {
        const titleMap: Record<string, string> = {
          'New Placement':    'PLACED',
          'Menu Feature Won': 'MENU WIN',
          'Just Ordered':     'ORDERED',
        }
        setTimeout(() => {
          triggerWin({ title: titleMap[status] ?? status.toUpperCase(), product: status, account: accountSearch })
        }, 400)
      }

      setTimeout(() => { onSuccess?.(); onClose() }, 500)
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ position: 'absolute', inset: 0, background: v3.bg.overlay, backdropFilter: 'blur(10px)' }} onClick={onClose} />

      <div style={{
        position: 'relative', width: '100%', maxWidth: '560px',
        background: v3.bg.elevated,
        borderRadius: '12px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)',
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        <div style={{ padding: '24px 28px 32px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em', fontFamily: v3.font.ui }}>
              Log Visit
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 4, display: 'flex', transition: 'color 120ms' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.65)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
            >
              <X size={17} />
            </button>
          </div>

          {/* ── DATE ─────────────────────────────────────────── */}
          <div style={{ marginBottom: 22 }}>
            <label style={v3label}>Visit Date</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['today', 'yesterday'] as const).map(d => {
                const sel = dateChoice === d
                return (
                  <button key={d} type="button" onClick={() => setDateChoice(d)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                    borderRadius: v3.radius.full, fontSize: v3.type.sm, fontWeight: 600,
                    fontFamily: v3.font.ui, textTransform: 'capitalize', cursor: 'pointer',
                    border: `1.5px solid ${sel ? 'rgba(196,164,110,0.55)' : 'rgba(255,255,255,0.10)'}`,
                    background: sel ? 'rgba(196,164,110,0.10)' : 'transparent',
                    color: sel ? v3.amberLight : 'rgba(255,255,255,0.40)',
                    transition: `all 140ms ${v3.ease.default}`,
                  }}>
                    <Calendar size={11} />
                    {d === 'today' ? 'Today' : 'Yesterday'}
                    {sel && <Check size={10} strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── ACCOUNT ─────────────────────────────────────── */}
          {!preAccount && (
            <div style={{ marginBottom: 20, position: 'relative' }}>
              <label style={v3label}>Account</label>
              {accountId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(196,164,110,0.06)', border: `1px solid rgba(196,164,110,0.28)`, borderRadius: v3.radius.md }}>
                  <span style={{ flex: 1, fontSize: v3.type.base, color: v3.text.primary, fontWeight: 600, fontFamily: v3.font.ui }}>{accountSearch}</span>
                  <button onClick={() => { setAccountId(''); setAccountSearch(''); setAccountResults([]) }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={13} /></button>
                </div>
              ) : (
                <>
                  <input
                    value={accountSearch} onChange={e => setAccountSearch(e.target.value)}
                    placeholder="Search accounts…" autoFocus
                    style={{ ...v3input, background: v3.bg.sheet }}
                  />
                  {(accountResults.length > 0 || (accountSearch.length >= 2 && !creatingAccount)) && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: v3.bg.sheet, border: `1px solid ${v3.border.strong}`, borderRadius: v3.radius.md, overflow: 'hidden', marginTop: 2, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                      {accountResults.map(a => (
                        <button key={a.id} onClick={() => { setAccountId(a.id); setAccountSearch(a.name); setAccountResults([]) }}
                          style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${v3.border.subtle}`, textAlign: 'left', cursor: 'pointer', color: v3.text.primary, fontSize: v3.type.base, fontFamily: v3.font.ui, transition: 'background 100ms' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontWeight: 600 }}>{a.name}</span>
                            {a.last_visited && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '11px', color: 'rgba(255,255,255,0.32)', flexShrink: 0 }}>
                                <Clock size={9} />{relativeTimeStr(a.last_visited) ?? ''}
                              </span>
                            )}
                          </div>
                          {a.address && <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: v3.type.sm }}>{a.address}</span>}
                        </button>
                      ))}
                      <button
                        onClick={() => { setCreatingAccount(true); setNewAccName(accountSearch); setAccountResults([]) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: v3.amberLight, fontSize: v3.type.sm, fontFamily: v3.font.ui, fontWeight: 600, transition: 'background 100ms' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(196,164,110,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <Building2 size={11} />
                        Add &ldquo;{accountSearch}&rdquo; as new account
                      </button>
                    </div>
                  )}

                  {/* ── Inline create account form ─────── */}
                  {creatingAccount && (
                    <div style={{ marginTop: 8, padding: '14px', background: v3.bg.sheet, border: `1px solid rgba(196,164,110,0.28)`, borderRadius: v3.radius.md }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: v3.amberLight, fontFamily: v3.font.ui, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Building2 size={11} /> New Account
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div>
                          <label style={v3label}>Name</label>
                          <input value={newAccName} onChange={e => setNewAccName(e.target.value)} placeholder="Account name" autoFocus style={{ ...v3input, background: 'rgba(255,255,255,0.06)' }} />
                        </div>
                        <div>
                          <label style={v3label}>Type</label>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {([['on_premise', 'On-Premise'], ['off_premise', 'Off-Premise']] as const).map(([val, label]) => {
                              const sel = newAccType === val
                              return (
                                <button key={val} type="button" onClick={() => setNewAccType(val)} style={{
                                  flex: 1, padding: '7px 10px', borderRadius: v3.radius.md, cursor: 'pointer',
                                  border: `1px solid ${sel ? 'rgba(196,164,110,0.45)' : 'rgba(255,255,255,0.08)'}`,
                                  background: sel ? 'rgba(196,164,110,0.09)' : 'transparent',
                                  color: sel ? v3.amberLight : 'rgba(255,255,255,0.40)',
                                  fontSize: '12px', fontWeight: 600, fontFamily: v3.font.ui, transition: 'all 140ms',
                                }}>
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div>
                          <label style={v3label}>Address <span style={{ opacity: 0.45 }}>(optional)</span></label>
                          <input value={newAccAddr} onChange={e => setNewAccAddr(e.target.value)} placeholder="123 Main St, Denver, CO" style={{ ...v3input, background: 'rgba(255,255,255,0.06)' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                          <button type="button" onClick={() => setCreatingAccount(false)} style={{ flex: 1, padding: '8px', borderRadius: v3.radius.md, border: `1px solid rgba(255,255,255,0.10)`, background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: '12px', fontWeight: 600, fontFamily: v3.font.ui, cursor: 'pointer' }}>
                            Cancel
                          </button>
                          <button type="button" onClick={handleCreateAccount} disabled={!newAccName.trim() || creatingAccSaving} style={{ flex: 2, padding: '8px', borderRadius: v3.radius.md, border: 'none', background: newAccName.trim() ? v3.amber : 'rgba(255,255,255,0.06)', color: newAccName.trim() ? '#000' : 'rgba(255,255,255,0.42)', fontSize: '12px', fontWeight: 700, fontFamily: v3.font.ui, cursor: newAccName.trim() ? 'pointer' : 'not-allowed' }}>
                            {creatingAccSaving ? 'Creating…' : 'Create Account'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── BRANDS ──────────────────────────────────────── */}
          <div style={{ marginBottom: 22 }}>
            <label style={v3label}>Brand{clients.length > 1 ? 's' : ''}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {clients.map((c: Client) => {
                const sel = selectedSlugs.includes(c.slug)
                const ac = c.color || v3.amber
                return (
                  <button key={c.slug} type="button" onClick={() => toggleSlug(c.slug)} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px',
                    borderRadius: v3.radius.full, fontSize: v3.type.sm, fontWeight: 600,
                    fontFamily: v3.font.ui,
                    border: `1.5px solid ${sel ? ac + '70' : 'rgba(255,255,255,0.10)'}`,
                    background: sel ? ac + '14' : 'transparent',
                    color: sel ? ac : 'rgba(255,255,255,0.42)',
                    cursor: 'pointer', transition: `all 150ms ${v3.ease.default}`,
                  }}>
                    {c.logo_url
                      ? <img src={c.logo_url} alt="" style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: 2 }} />
                      : <div style={{ width: 14, height: 14, borderRadius: '50%', background: ac + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: ac }}>{c.name[0]}</div>
                    }
                    {c.name}
                    {sel && <Check size={10} strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── STATUS — grouped visual grid ─────────────────── */}
          <div style={{ marginBottom: 22 }}>
            <label style={v3label}>Visit Outcome</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STATUS_GROUPS.map(group => (
                <div key={group.label}>
                  <div style={{ fontSize: '8px', fontWeight: 700, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.22em', marginBottom: 5, paddingLeft: 2, fontFamily: v3.font.ui }}>
                    {group.label}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: group.items.length === 2 ? '1fr 1fr' : '1fr 1fr 1fr', gap: 5 }}>
                    {group.items.map(s => {
                      const sel = status === s.value
                      return (
                        <button key={s.value} type="button" onClick={() => setStatus(s.value)} style={{
                          padding: '10px 11px', borderRadius: v3.radius.md,
                          textAlign: 'left', cursor: 'pointer',
                          border: `1px solid ${sel ? s.color + '50' : 'rgba(255,255,255,0.07)'}`,
                          background: sel ? s.color + '10' : 'rgba(255,255,255,0.02)',
                          transition: `all 140ms ${v3.ease.default}`,
                          display: 'flex', flexDirection: 'column', gap: 4,
                        }}
                          onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.borderColor = s.color + '28' }}
                          onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: sel ? s.color : 'rgba(255,255,255,0.30)', flexShrink: 0, boxShadow: sel ? `0 0 6px ${s.color}70` : 'none', transition: 'all 140ms' }} />
                            <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: v3.font.ui, color: sel ? s.color : 'rgba(255,255,255,0.52)' }}>
                              {s.value}
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)', paddingLeft: 11, lineHeight: 1.3, fontFamily: v3.font.ui }}>
                            {s.desc}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── NOTES — per-brand when multiple selected ─────── */}
          <div style={{ marginBottom: 22 }}>
            {multiBrand ? (
              <>
                <label style={v3label}>Notes by Brand <span style={{ fontWeight: 400, opacity: 0.45 }}>(optional)</span></label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedSlugs.map(slug => {
                    const cl = clients.find((c: Client) => c.slug === slug)
                    return (
                      <div key={slug}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: cl?.color || v3.amber, fontFamily: v3.font.ui, marginBottom: 5, letterSpacing: '0.04em' }}>
                          {cl?.name ?? slug}
                        </div>
                        <input
                          value={brandNotes[slug] ?? ''}
                          onChange={e => setBrandNotes(prev => ({ ...prev, [slug]: e.target.value }))}
                          placeholder="What happened with this brand?"
                          style={{ ...v3input, background: v3.bg.sheet }}
                        />
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <label style={v3label}>Notes <span style={{ fontWeight: 400, opacity: 0.45 }}>(optional)</span></label>
                <input value={sharedNotes} onChange={e => setSharedNotes(e.target.value)}
                  placeholder="What happened? What's next?"
                  style={{ ...v3input, background: v3.bg.sheet }} />
              </>
            )}
          </div>

          {/* ── TASTING NOTES ───────────────────────────────── */}
          <div style={{ marginBottom: 22 }}>
            <label style={v3label}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <GlassWater size={9} style={{ opacity: 0.6 }} />
                Tasting / Event Notes <span style={{ fontWeight: 400, opacity: 0.45 }}>(optional)</span>
              </span>
            </label>
            <textarea
              value={tastingNotes}
              onChange={e => setTastingNotes(e.target.value)}
              placeholder="Consumer reactions, product feedback, tasting event notes…"
              rows={2}
              style={{ ...v3input, background: v3.bg.sheet, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {/* ── FEEDBACK ────────────────────────────────────── */}
          <div style={{ marginBottom: 22 }}>
            <label style={v3label}>
              Buyer Feedback <span style={{ fontWeight: 400, opacity: 0.45 }}>(optional)</span>
            </label>
            <input
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="What the buyer or manager said about the product…"
              style={{ ...v3input, background: v3.bg.sheet }}
            />
          </div>

          {/* ── FOLLOW-UP SCHEDULING ─────────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <label style={v3label}>Follow-Up Reminder</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {FOLLOWUP_OPTIONS.map(opt => {
                const sel = followupDays === opt.days
                return (
                  <button key={opt.days} type="button" onClick={() => setFollowupDays(opt.days)} style={{
                    padding: '6px 13px', borderRadius: v3.radius.full,
                    fontSize: '12px', fontWeight: 600, fontFamily: v3.font.ui, cursor: 'pointer',
                    border: `1px solid ${sel ? 'rgba(196,164,110,0.50)' : 'rgba(255,255,255,0.08)'}`,
                    background: sel ? 'rgba(196,164,110,0.09)' : 'transparent',
                    color: sel ? v3.amberLight : 'rgba(255,255,255,0.35)',
                    transition: `all 140ms ${v3.ease.default}`,
                  }}
                    onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.38)' }}
                    onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── ADD MORE (progressive disclosure) ───────────── */}
          <div style={{ marginBottom: 24 }}>
            <button type="button" onClick={() => setShowExtras(d => !d)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', width: '100%',
              background: showExtras ? 'rgba(196,164,110,0.06)' : 'transparent',
              border: `1px solid ${showExtras ? 'rgba(196,164,110,0.28)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: v3.radius.md, cursor: 'pointer',
              color: showExtras ? v3.amberLight : 'rgba(255,255,255,0.28)',
              fontSize: v3.type.sm, fontWeight: 600, fontFamily: v3.font.ui,
              transition: `all 160ms ${v3.ease.default}`,
            }}>
              <Plus size={13} />
              Add placement or contact
              <ChevronDown size={13} style={{ marginLeft: 'auto', transform: showExtras ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }} />
            </button>

            {showExtras && (
              <div style={{ marginTop: 8, padding: '16px 14px', background: v3.bg.sheet, borderRadius: v3.radius.md, border: `1px solid ${v3.border.subtle}` }}>
                <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
                  {[
                    { id: 'placement', label: 'Placement', icon: <Package size={11} /> },
                    { id: 'contact',   label: 'Contact',   icon: <User size={11} /> },
                  ].map(p => (
                    <button key={p.id} type="button" onClick={() => setExtraPanel(extraPanel === p.id as any ? null : p.id as any)} style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                      borderRadius: v3.radius.full, fontSize: '12px', fontWeight: 600, fontFamily: v3.font.ui,
                      border: `1px solid ${extraPanel === p.id ? 'rgba(196,164,110,0.50)' : 'rgba(255,255,255,0.10)'}`,
                      background: extraPanel === p.id ? 'rgba(196,164,110,0.09)' : 'transparent',
                      color: extraPanel === p.id ? v3.amberLight : 'rgba(255,255,255,0.38)',
                      cursor: 'pointer', transition: `all 140ms ${v3.ease.default}`,
                    }}>
                      {p.icon}{p.label}
                    </button>
                  ))}
                </div>

                {/* Placement sub-form */}
                {extraPanel === 'placement' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    <div>
                      <label style={v3label}>Product Name</label>
                      <input value={placementProduct} onChange={e => setPlacementProduct(e.target.value)}
                        placeholder="e.g. NoCo Rye Whiskey" style={v3input} />
                    </div>

                    {/* Placement status chips */}
                    <div>
                      <label style={v3label}>Status</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[
                          { value: 'committed', label: 'Committed', desc: 'Agreement, no order yet' },
                          { value: 'ordered',   label: 'Ordered',   desc: 'PO sent, awaiting delivery' },
                          { value: 'on_shelf',  label: 'On Shelf',  desc: 'Product already placed' },
                        ].map(opt => {
                          const sel = placementStatus === opt.value
                          return (
                            <button key={opt.value} type="button" onClick={() => setPlacementStatus(opt.value as any)} style={{
                              flex: 1, padding: '8px 10px', borderRadius: v3.radius.md,
                              textAlign: 'left', cursor: 'pointer',
                              border: `1px solid ${sel ? 'rgba(196,164,110,0.45)' : 'rgba(255,255,255,0.08)'}`,
                              background: sel ? 'rgba(196,164,110,0.09)' : 'rgba(255,255,255,0.02)',
                              transition: `all 140ms ${v3.ease.default}`,
                            }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: sel ? v3.amberLight : 'rgba(255,255,255,0.50)', fontFamily: v3.font.ui }}>{opt.label}</div>
                              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)', marginTop: 2, fontFamily: v3.font.ui }}>{opt.desc}</div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={v3label}>Type</label>
                        <select value={placementType} onChange={e => setPlacementType(e.target.value)} style={{ ...v3input, appearance: 'none' }}>
                          {['shelf', 'well', 'menu', 'cocktail', 'retail', 'seasonal'].map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={v3label}>Shelf Count <span style={{ opacity: 0.45 }}>(opt)</span></label>
                        <input type="number" value={placementShelfCount} onChange={e => setPlacementShelfCount(e.target.value)} placeholder="0" style={v3input} />
                      </div>
                      <div>
                        <label style={v3label}>Price <span style={{ opacity: 0.45 }}>(opt)</span></label>
                        <input type="number" value={placementPrice} onChange={e => setPlacementPrice(e.target.value)} placeholder="$0.00" style={v3input} />
                      </div>
                    </div>

                    {selectedSlugs.length > 1 && (
                      <div>
                        <label style={v3label}>Brand</label>
                        <select value={placementSlug} onChange={e => setPlacementSlug(e.target.value)} style={{ ...v3input, appearance: 'none' }}>
                          {selectedSlugs.map(s => {
                            const cl = clients.find((c: Client) => c.slug === s)
                            return <option key={s} value={s}>{cl?.name ?? s}</option>
                          })}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Contact sub-form */}
                {extraPanel === 'contact' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={v3label}>Name</label>
                        <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="First Last" style={v3input} />
                      </div>
                      <div>
                        <label style={v3label}>Role</label>
                        <input value={contactRole} onChange={e => setContactRole(e.target.value)} placeholder="Bar Manager" style={v3input} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={v3label}>Phone</label>
                        <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="(303) 555-0100" style={v3input} />
                      </div>
                      <div>
                        <label style={v3label}>Email</label>
                        <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="name@bar.com" style={v3input} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── ERROR ───────────────────────────────────────── */}
          {error && (
            <div style={{ padding: '10px 14px', background: v3.status.dangerDim, border: `1px solid ${v3.status.danger}33`, borderRadius: v3.radius.md, fontSize: v3.type.sm, color: v3.status.danger, marginBottom: 14, fontFamily: v3.font.ui }}>
              {error}
            </div>
          )}

          {/* ── SUBMIT ──────────────────────────────────────── */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            style={{
              width: '100%', padding: '14px',
              background: saved ? v3.status.success : canSubmit ? v3.amber : 'rgba(255,255,255,0.05)',
              color: canSubmit ? '#000' : 'rgba(255,255,255,0.42)',
              border: 'none', borderRadius: v3.radius.md,
              fontSize: '14px', fontWeight: 700, fontFamily: v3.font.ui,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: canSubmit && !saving ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: `all 180ms ${v3.ease.default}`,
              boxShadow: canSubmit && !saving && !saved ? `0 4px 20px rgba(196,164,110,0.22)` : 'none',
            }}>
            {saved
              ? <><Check size={15} strokeWidth={3} /> Logged</>
              : saving
              ? 'Saving…'
              : canSubmit
              ? 'Log Visit'
              : !accountId ? 'Select an account'
              : !selectedSlugs.length ? 'Select a brand'
              : 'Select an outcome'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
