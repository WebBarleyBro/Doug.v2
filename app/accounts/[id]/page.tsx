'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MapPin, Phone, Plus, ChevronLeft, Edit2, Trash2, ChevronRight,
  Package, ShoppingCart, Users, Activity, X, Globe, Instagram,
} from 'lucide-react'
import LayoutShell, { useToast } from '../../layout-shell'
import VisitLogModal from '../../components/VisitLogModal'
import ConfirmModal from '../../components/ConfirmModal'
import EmptyState from '../../components/EmptyState'
import {
  getAccount, getVisits, getPlacements, getOrders, getContacts,
  deleteVisitGroup, updateVisitGroup, createContact, updateContact, deleteContact,
  createPlacement, getProducts, getClients, updateAccount, updateAccountClients,
  deleteAccount,
} from '../../lib/data'
import { invalidate } from '../../lib/cache'
import { clientLogoUrl } from '../../lib/constants'
import { getSupabase } from '../../lib/supabase'
import { t, card, btnPrimary, btnSecondary, btnIcon, badge, inputStyle, labelStyle, selectStyle } from '../../lib/theme'
import { formatShortDateMT, daysAgoMT, formatCurrency, resolveTotal } from '../../lib/formatters'
import { overdueColor } from '../../lib/theme'
import { PLACEMENT_TYPES, PLACEMENT_TYPE_LABELS, VISIT_STATUSES } from '../../lib/constants'
import type { UserProfile, Client } from '../../lib/types'
import { useIsMobile } from '../../lib/use-is-mobile'

declare global { interface Window { google: any } }

const CONTACT_CATEGORIES = [
  { value: 'general',     label: 'General' },
  { value: 'distributor', label: 'Distributor Rep' },
  { value: 'buyer',       label: 'Buyer / Purchaser' },
  { value: 'bar_manager', label: 'Bar Manager' },
  { value: 'chef',        label: 'Chef' },
  { value: 'gm',          label: 'General Manager' },
  { value: 'owner',       label: 'Owner' },
  { value: 'media',       label: 'Media / Press' },
  { value: 'other',       label: 'Other' },
]

const CATEGORY_COLORS: Record<string, string> = {
  distributor: t.status.info,
  buyer:       t.gold,
  bar_manager: t.status.success,
  chef:        '#f97316',
  gm:          t.status.warning,
  owner:       '#f43f5e',
  gm_owner:    t.status.warning,
  media:       '#a78bfa',
  general:     t.text.muted,
  other:       t.text.muted,
}

const TABS = ['activity', 'visits', 'placements', 'orders', 'contacts'] as const
type Tab = typeof TABS[number]

export default function AccountDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [account, setAccount] = useState<any>(null)
  const [visits, setVisits] = useState<any[]>([])
  const [placements, setPlacements] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [tab, setTab] = useState<Tab>('activity')
  const [visitModal, setVisitModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const loadedTabsRef = useRef<Set<string>>(new Set())
  const accountNameRef = useRef<string>('')
  const isMobile = useIsMobile()
  const toast = useToast()
  const [activityLimit, setActivityLimit] = useState(20)

  // Edit account modal
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '', address: '', phone: '',
    account_type: 'on_premise',
    visit_frequency_days: 21,
    client_slugs: [] as string[],
    best_days: [] as string[],
    best_time: 'anytime',
    website: '',
    instagram: '',
    notes: '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editErr, setEditErr] = useState('')
  const editAddressRef = useRef<HTMLInputElement>(null)
  const editAcRef = useRef<any>(null)

  // Delete account
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)

  // Contacts
  const [addContact, setAddContact] = useState(false)
  const [editingContact, setEditingContact] = useState<any>(null)
  const [contactForm, setContactForm] = useState({ name: '', role: '', email: '', phone: '', category: 'general', notes: '', is_decision_maker: false })
  const [savingContact, setSavingContact] = useState(false)
  const [deleteContactTarget, setDeleteContactTarget] = useState('')

  // Placements
  const [addPlacement, setAddPlacement] = useState(false)
  const [placementForm, setPlacementForm] = useState({ client_slug: '', product_name: '', placement_type: 'shelf', price_point: '' })
  const [savingPlacement, setSavingPlacement] = useState(false)
  const [placementProducts, setPlacementProducts] = useState<any[]>([])

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: p } = await sb.from('user_profiles').select('*').eq('id', user.id).single()
        if (p) setProfile(p)
      }
    })
  }, [])

  // Set up Google Places autocomplete on edit name field when modal opens
  useEffect(() => {
    if (!showEdit) {
      if (editAcRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(editAcRef.current)
      }
      editAcRef.current = null
      return
    }
    let alive = true
    function initAC() {
      if (!alive || !editAddressRef.current || editAcRef.current) return
      editAcRef.current = new window.google.maps.places.Autocomplete(editAddressRef.current, {
        types: ['establishment'],
        componentRestrictions: { country: 'us' },
        fields: ['name', 'formatted_address', 'formatted_phone_number'],
      })
      editAcRef.current.addListener('place_changed', () => {
        const place = editAcRef.current.getPlace()
        setEditForm(f => ({
          ...f,
          name: place.name || f.name,
          address: place.formatted_address || f.address,
          phone: place.formatted_phone_number || f.phone,
        }))
      })
    }
    if (window.google?.maps?.places) {
      initAC()
    } else {
      const interval = setInterval(() => {
        if (window.google?.maps?.places) { clearInterval(interval); initAC() }
      }, 100)
      return () => { alive = false; clearInterval(interval) }
    }
    return () => { alive = false }
  }, [showEdit])

  const loadTab = useCallback(async (t: Tab) => {
    if (!id || loadedTabsRef.current.has(t)) return
    loadedTabsRef.current.add(t)
    try {
      if (t === 'contacts') {
        const cs = await getContacts({ accountId: id })
        setContacts(cs)
      }
    } catch (e) { console.error(e) }
  }, [id])

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [acc, cls] = await Promise.all([getAccount(id), getClients()])
      setAccount(acc)
      accountNameRef.current = acc?.name || ''
      setClients(cls)
      // Fetch all tab data together so orders get the correct account name
      const [vs, ps, os] = await Promise.all([
        getVisits({ accountId: id, limit: 200 }),
        getPlacements({ accountId: id }),
        getOrders({ accountId: id, accountName: acc?.name || '' }),
      ])
      setVisits(vs)
      setPlacements(ps)
      setOrders(os)
      loadedTabsRef.current = new Set(['activity', 'visits', 'placements', 'orders'])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadTab(tab) }, [tab, loadTab])

  useEffect(() => {
    if (placementForm.client_slug) {
      getProducts(placementForm.client_slug).then(setPlacementProducts).catch(() => setPlacementProducts([]))
    } else {
      setPlacementProducts([])
    }
  }, [placementForm.client_slug])

  const reloadAll = useCallback(async () => {
    loadedTabsRef.current.clear()
    await load()
  }, [load])

  function openEditModal() {
    if (!account) return
    const currentSlugs = (account.account_clients || []).map((ac: any) => ac.client_slug)
    setEditForm({
      name: account.name || '',
      address: account.address || '',
      phone: account.phone || '',
      account_type: account.account_type || 'on_premise',
      visit_frequency_days: account.visit_frequency_days || 21,
      client_slugs: currentSlugs,
      best_days: account.best_days || [],
      best_time: account.best_time || 'anytime',
      website: account.website || '',
      instagram: account.instagram || '',
      notes: account.notes || '',
    })
    setEditErr('')
    setShowEdit(true)
  }

  async function handleSaveEdit() {
    if (!editForm.name.trim()) { setEditErr('Account name is required'); return }
    setEditSaving(true); setEditErr('')
    try {
      await updateAccount(id, {
        name: editForm.name.trim(),
        address: editForm.address || undefined,
        phone: editForm.phone || undefined,
        account_type: editForm.account_type as any,
        visit_frequency_days: editForm.visit_frequency_days,
        best_days: editForm.best_days,
        best_time: editForm.best_time,
        website: editForm.website || undefined,
        instagram: editForm.instagram || undefined,
        notes: editForm.notes || undefined,
      })
      await updateAccountClients(id, editForm.client_slugs)
      setShowEdit(false)
      toast('Account saved')
      await reloadAll()
    } catch (e: any) {
      setEditErr(e.message || 'Failed to save')
    } finally { setEditSaving(false) }
  }

  async function handleDeleteAccount() {
    try {
      await deleteAccount(id)
      invalidate('accounts:all')
      router.push('/accounts')
    } catch (e: any) {
      console.error(e)
    }
  }

  function openAddContact() {
    setEditingContact(null)
    setContactForm({ name: '', role: '', email: '', phone: '', category: 'general', notes: '', is_decision_maker: false })
    setAddContact(true)
  }

  function openEditContact(c: any) {
    setEditingContact(c)
    setContactForm({ name: c.name || '', role: c.role || '', email: c.email || '', phone: c.phone || '', category: c.category || 'general', notes: c.notes || '', is_decision_maker: c.is_decision_maker || false })
    setAddContact(true)
  }

  async function handleSaveContact() {
    if (!contactForm.name) return
    setSavingContact(true)
    try {
      if (editingContact) {
        await updateContact(editingContact.id, { ...contactForm })
      } else {
        await createContact({ ...contactForm, account_id: id })
      }
      setContactForm({ name: '', role: '', email: '', phone: '', category: 'general', notes: '', is_decision_maker: false })
      setAddContact(false)
      setEditingContact(null)
      toast(editingContact ? 'Contact updated' : 'Contact added')
      loadedTabsRef.current.delete('contacts')
      const cs = await getContacts({ accountId: id })
      setContacts(cs)
      loadedTabsRef.current.add('contacts')
    } catch (e) { console.error(e); toast('Failed to save contact', 'error') }
    finally { setSavingContact(false) }
  }

  if (loading || !account) {
    return (
      <LayoutShell>
        <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
          <div style={{ width: '200px', height: '24px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '6px', animation: 'skeleton-pulse 1.2s ease-in-out infinite' }} />
        </div>
      </LayoutShell>
    )
  }

  const days = daysAgoMT(account.last_visited)
  const overdueClr = overdueColor(days)
  const pad = isMobile ? '16px' : '32px 36px'

  const dedupedVisits = Object.values(
    visits.reduce((acc: Record<string, any>, v: any) => {
      const key = `${String(v.visited_at).slice(0, 10)}|${v.user_id}`
      if (!acc[key]) acc[key] = v
      return acc
    }, {})
  )
  const timeline = [
    ...dedupedVisits.map((v: any) => ({ ...v, _type: 'visit', _date: v.visited_at })),
    ...placements.map(p => ({ ...p, _type: 'placement', _date: p.created_at })),
    ...orders.map(o => ({ ...o, _type: 'order', _date: o.created_at })),
  ].sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime())

  return (
    <LayoutShell>
      <div style={{ padding: pad, maxWidth: '960px', margin: '0 auto', width: '100%' }}>
        {/* Back */}
        <Link href="/accounts" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: t.text.muted, textDecoration: 'none', fontSize: '13px', marginBottom: '20px' }}>
          <ChevronLeft size={16} /> Accounts
        </Link>

        {/* Account header */}
        <div style={{ ...card, marginBottom: '20px', borderLeft: `3px solid ${overdueClr}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '20px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>
                  {account.name}
                </h1>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: t.status.neutralBg, color: t.text.muted, textTransform: 'capitalize' }}>
                  {account.account_type?.replace('_', '-')}
                </span>
              </div>
              {account.address && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <MapPin size={13} color={t.text.muted} />
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(account.address)}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: '13px', color: t.text.muted, textDecoration: 'none' }}>
                    {account.address}
                  </a>
                </div>
              )}
              {account.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Phone size={13} color={t.text.muted} />
                  <a href={`tel:${account.phone}`} style={{ fontSize: '13px', color: t.text.muted, textDecoration: 'none' }}>{account.phone}</a>
                </div>
              )}
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '2px' }}>
                {account.website && (
                  <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: t.text.muted, textDecoration: 'none' }}>
                    <Globe size={12} /> {account.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {account.instagram && (
                  <a href={`https://instagram.com/${account.instagram.replace('@', '')}`} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: t.text.muted, textDecoration: 'none' }}>
                    <Instagram size={12} /> @{account.instagram.replace('@', '')}
                  </a>
                )}
              </div>
              {(account.best_days?.length > 0 || (account.best_time && account.best_time !== 'anytime')) && (
                <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '4px' }}>
                  Best time to visit:
                  {account.best_days?.length > 0 && ` ${account.best_days.join(', ')}`}
                  {account.best_time && account.best_time !== 'anytime' && ` · ${account.best_time}`}
                </div>
              )}
              {account.notes && (
                <div style={{ fontSize: '12px', color: t.text.secondary, fontStyle: 'italic', marginBottom: '4px', lineHeight: 1.5 }}>
                  {account.notes}
                </div>
              )}
              <div style={{ fontSize: '12px', color: overdueClr, marginTop: '6px', fontWeight: '600' }}>
                Last visited: {days === null ? 'Never' : `${days} days ago`}
                {account.visit_frequency_days ? ` · Target: every ${account.visit_frequency_days} days` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button onClick={openEditModal} style={{ ...btnSecondary, padding: '8px 12px', fontSize: '13px' }}>
                <Edit2 size={14} /> Edit
              </button>
              <button onClick={() => setVisitModal(true)} style={{ ...btnPrimary, padding: '9px 14px', fontSize: '13px' }}>
                <Plus size={15} /> Log Visit
              </button>
            </div>
          </div>

          {/* Client logos */}
          {account.account_clients?.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              {account.account_clients.map((ac: any) => {
                const client = clients.find((c: any) => c.slug === ac.client_slug)
                const logo = client ? clientLogoUrl(client) : null
                return logo ? (
                  <img key={ac.client_slug} src={logo} alt={client?.name || ac.client_slug} title={client?.name || ac.client_slug}
                    style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.04)' }} />
                ) : (
                  <span key={ac.client_slug} style={{
                    fontSize: '11px', padding: '3px 10px', borderRadius: '12px',
                    backgroundColor: client ? `${client.color}22` : t.goldDim,
                    color: client?.color || t.gold, fontWeight: '600',
                    border: `1px solid ${client?.color ? client.color + '44' : t.goldBorder}`,
                  }}>
                    {client?.name || ac.client_slug}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '2px' }}>
          {TABS.map(tb => (
            <button key={tb} onClick={() => setTab(tb)} style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              border: `1px solid ${tab === tb ? t.gold : t.border.default}`,
              backgroundColor: tab === tb ? t.goldDim : 'transparent',
              color: tab === tb ? t.gold : t.text.secondary,
              fontWeight: tab === tb ? '600' : '400',
              textTransform: 'capitalize', whiteSpace: 'nowrap',
            }}>
              {tb}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'activity' && (
          <div>
            {timeline.length === 0 ? (
              <EmptyState icon={<Activity size={32} />} title="No activity yet" subtitle="Log a visit to get started" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {timeline.slice(0, activityLimit).map((item: any) => (
                  <TimelineItem key={item.id} item={item} accountId={id} />
                ))}
                {timeline.length > activityLimit && (
                  <button onClick={() => setActivityLimit(n => n + 20)}
                    style={{ padding: '10px', background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '8px', color: t.text.muted, cursor: 'pointer', fontSize: '13px' }}>
                    Show more ({timeline.length - activityLimit} remaining)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'visits' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {visits.length === 0 ? (
              <EmptyState icon={<MapPin size={32} />} title="No visits logged" />
            ) : (() => {
              // Group rows by visited_at — same timestamp = one physical visit
              const groups: Record<string, any[]> = {}
              visits.forEach((v: any) => {
                const key = `${String(v.visited_at).slice(0, 10)}|${v.user_id}`
                if (!groups[key]) groups[key] = []
                groups[key].push(v)
              })
              return Object.entries(groups)
                .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
                .map(([, rows]) => {
                  const primary = rows[0]
                  return (
                    <VisitCard key={primary.id} visit={primary} allRows={rows} clients={clients}
                      onDelete={() => deleteVisitGroup(rows.map(r => r.id), rows.map(r => r.client_slug)).then(reloadAll)}
                      onSave={(updates) => updateVisitGroup(rows.map(r => r.id), updates as any).then(reloadAll)}
                      isMobile={isMobile}
                    />
                  )
                })
            })()}
          </div>
        )}

        {tab === 'placements' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
              <button onClick={() => setAddPlacement(true)} style={{ ...btnPrimary, padding: '8px 14px', fontSize: '13px' }}>
                <Plus size={14} /> Add Placement
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {placements.length === 0 && !addPlacement ? (
                <EmptyState icon={<Package size={32} />} title="No active placements" action={
                  <button onClick={() => setAddPlacement(true)} style={btnPrimary}><Plus size={14} /> Add Placement</button>
                } />
              ) : placements.map((p: any) => {
                const client = clients.find(c => c.slug === p.client_slug)
                return (
                  <div key={p.id} style={{ ...card, borderLeft: `3px solid ${client?.color || t.gold}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{p.product_name}</div>
                        <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>
                          {client?.name || p.client_slug} · {PLACEMENT_TYPE_LABELS[p.placement_type as keyof typeof PLACEMENT_TYPE_LABELS] || p.placement_type}
                          {p.price_point ? ` · $${p.price_point}` : ''}
                        </div>
                      </div>
                      <span style={badge.placementStatus(p.status)}>{p.status.replace('_', ' ')}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {addPlacement && (
              <div style={{ ...card, marginTop: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary, marginBottom: '14px' }}>New Placement</h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Brand</label>
                    <select value={placementForm.client_slug} onChange={e => setPlacementForm(f => ({ ...f, client_slug: e.target.value }))} style={selectStyle}>
                      <option value="">Select brand...</option>
                      {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Placement Type</label>
                    <select value={placementForm.placement_type} onChange={e => setPlacementForm(f => ({ ...f, placement_type: e.target.value }))} style={selectStyle}>
                      {PLACEMENT_TYPES.map(pt => <option key={pt} value={pt}>{PLACEMENT_TYPE_LABELS[pt]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Product Name</label>
                    {placementProducts.length > 0 ? (
                      <select value={placementForm.product_name} onChange={e => setPlacementForm(f => ({ ...f, product_name: e.target.value }))} style={selectStyle}>
                        <option value="">Select product...</option>
                        {placementProducts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={placementForm.product_name} onChange={e => setPlacementForm(f => ({ ...f, product_name: e.target.value }))}
                        placeholder="e.g. Single Barrel Bourbon 750ml" style={inputStyle} />
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Price Point (optional)</label>
                    <input type="number" value={placementForm.price_point} onChange={e => setPlacementForm(f => ({ ...f, price_point: e.target.value }))}
                      placeholder="0.00" step="0.01" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setAddPlacement(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={async () => {
                    if (!placementForm.client_slug || !placementForm.product_name) return
                    setSavingPlacement(true)
                    await createPlacement({
                      account_id: id,
                      client_slug: placementForm.client_slug,
                      product_name: placementForm.product_name,
                      placement_type: placementForm.placement_type as any,
                      price_point: placementForm.price_point ? parseFloat(placementForm.price_point) : undefined,
                      status: 'committed',
                    })
                    setPlacementForm({ client_slug: '', product_name: '', placement_type: 'shelf', price_point: '' })
                    setAddPlacement(false)
                    setSavingPlacement(false)
                    toast('Placement added')
                    reloadAll()
                  }} style={btnPrimary} disabled={savingPlacement || !placementForm.client_slug || !placementForm.product_name}>
                    {savingPlacement ? 'Saving...' : 'Add Placement'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'orders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {orders.length === 0 ? (
              <EmptyState icon={<ShoppingCart size={32} />} title="No orders yet" subtitle="Orders logged against this account will appear here" />
            ) : orders.map((o: any) => {
              const client = clients.find(c => c.slug === o.client_slug)
              return (
                <div key={o.id} style={{ ...card, borderLeft: `3px solid ${client?.color || t.gold}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{o.po_number}</div>
                      <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>
                        {client?.name || o.client_slug} · {formatShortDateMT(o.created_at)}
                      </div>
                      {o.po_line_items?.length > 0 && (
                        <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '4px' }}>
                          {o.po_line_items.map((li: any) => `${li.product_name} ×${li.quantity}`).join(', ')}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>{formatCurrency(resolveTotal(o))}</div>
                      <span style={badge.orderStatus(o.status)}>{o.status}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'contacts' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
              <button onClick={openAddContact} style={{ ...btnPrimary, padding: '8px 14px', fontSize: '13px' }}>
                <Plus size={14} /> Add Contact
              </button>
            </div>
            {contacts.length === 0 && !addContact ? (
              <EmptyState icon={<Users size={32} />} title="No contacts yet" action={
                <button onClick={openAddContact} style={btnPrimary}><Plus size={14} /> Add Contact</button>
              } />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {contacts.map((c: any) => (
                  <ContactCard key={c.id} contact={c}
                    onEdit={() => openEditContact(c)}
                    onDelete={() => setDeleteContactTarget(c.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}


        <ConfirmModal
          isOpen={!!deleteContactTarget}
          onClose={() => setDeleteContactTarget('')}
          onConfirm={() => deleteContact(deleteContactTarget).then(() => {
            setDeleteContactTarget('')
            loadedTabsRef.current.delete('contacts')
            getContacts({ accountId: id }).then(cs => { setContacts(cs); loadedTabsRef.current.add('contacts') })
          })}
          title="Remove Contact"
          message="Remove this contact permanently?"
          confirmLabel="Remove"
          danger
        />

        {profile && (
          <VisitLogModal
            isOpen={visitModal}
            onClose={() => setVisitModal(false)}
            onSuccess={reloadAll}
            userId={profile.id}
            defaultAccountId={id}
            defaultAccountName={account?.name}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* ── Edit Account Modal ── */}
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: t.text.primary }}>Edit Account</h3>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Account Name — type to search Google</label>
                <input
                  ref={editAddressRef}
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Business name"
                  style={inputStyle}
                  autoComplete="off"
                />
              </div>
              <div>
                <label style={labelStyle}>Address</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Auto-fills from Google, or type manually"
                  style={inputStyle}
                  autoComplete="off"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input type="text" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="(720) 555-0000" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Account Type</label>
                  <select value={editForm.account_type} onChange={e => setEditForm(f => ({ ...f, account_type: e.target.value }))} style={selectStyle}>
                    <option value="on_premise">On-Premise (bar, restaurant, hotel)</option>
                    <option value="off_premise">Off-Premise (liquor store, grocery)</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Visit Frequency (days)</label>
                <input type="number" min="1" value={editForm.visit_frequency_days} onChange={e => setEditForm(f => ({ ...f, visit_frequency_days: parseInt(e.target.value) || 21 }))} style={inputStyle} />
              </div>

              {/* Client slugs multi-select */}
              <div>
                <label style={labelStyle}>Brands</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {clients.map(c => {
                    const selected = editForm.client_slugs.includes(c.slug)
                    return (
                      <button key={c.slug} type="button"
                        onClick={() => setEditForm(f => ({
                          ...f,
                          client_slugs: selected
                            ? f.client_slugs.filter(s => s !== c.slug)
                            : [...f.client_slugs, c.slug],
                        }))}
                        style={{
                          padding: '5px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                          border: `1px solid ${selected ? c.color : t.border.default}`,
                          backgroundColor: selected ? `${c.color}22` : 'transparent',
                          color: selected ? c.color : t.text.secondary,
                          fontWeight: selected ? '600' : '400',
                        }}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Best days */}
              <div>
                <label style={labelStyle}>Best Days to Visit</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                    const sel = editForm.best_days.includes(day)
                    return (
                      <button key={day} type="button" onClick={() => setEditForm(f => ({
                        ...f,
                        best_days: sel ? f.best_days.filter(d => d !== day) : [...f.best_days, day],
                      }))} style={{
                        padding: '4px 10px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer',
                        border: `1px solid ${sel ? t.gold : t.border.default}`,
                        backgroundColor: sel ? t.goldDim : 'transparent',
                        color: sel ? t.gold : t.text.secondary,
                      }}>{day}</button>
                    )
                  })}
                </div>
              </div>

              {/* Best time */}
              <div>
                <label style={labelStyle}>Best Time</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                  {['morning', 'afternoon', 'evening', 'anytime'].map(opt => {
                    const sel = editForm.best_time === opt
                    return (
                      <button key={opt} type="button" onClick={() => setEditForm(f => ({ ...f, best_time: opt }))} style={{
                        padding: '4px 12px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize',
                        border: `1px solid ${sel ? t.gold : t.border.default}`,
                        backgroundColor: sel ? t.goldDim : 'transparent',
                        color: sel ? t.gold : t.text.secondary,
                      }}>{opt}</button>
                    )
                  })}
                </div>
              </div>

              {/* Website + Instagram */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Website</label>
                  <input type="text" value={editForm.website} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} placeholder="example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Instagram</label>
                  <input type="text" value={editForm.instagram} onChange={e => setEditForm(f => ({ ...f, instagram: e.target.value }))} placeholder="@handle" style={inputStyle} />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any useful notes about this account..." rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} />
              </div>
            </div>

            {editErr && <div style={{ fontSize: '12px', color: t.status.danger, marginTop: '12px' }}>{editErr}</div>}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'space-between' }}>
              <button onClick={() => { setShowEdit(false); setShowDeleteAccount(true) }}
                style={{ ...btnSecondary, color: t.status.danger, borderColor: 'rgba(224,82,82,0.3)', fontSize: '13px' }}>
                <Trash2 size={13} /> Delete Account
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowEdit(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleSaveEdit} disabled={editSaving || !editForm.name.trim()}
                  style={{ ...btnPrimary, opacity: editSaving || !editForm.name.trim() ? 0.6 : 1 }}>
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Contact Modal ── */}
      {addContact && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '20px' }}>
          <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: t.text.primary }}>{editingContact ? 'Edit Contact' : 'New Contact'}</h3>
              <button onClick={() => { setAddContact(false); setEditingContact(null) }} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input type="text" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={contactForm.category} onChange={e => setContactForm(f => ({ ...f, category: e.target.value }))} style={selectStyle}>
                  {CONTACT_CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Role / Title</label>
                <input type="text" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))} placeholder="General Manager, Buyer..." style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input type="tel" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} placeholder="(970) 555-0100" style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Email</label>
                <input type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Notes</label>
                <input type="text" value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setAddContact(false); setEditingContact(null) }} style={btnSecondary}>Cancel</button>
              <button onClick={handleSaveContact} disabled={savingContact || !contactForm.name}
                style={{ ...btnPrimary, opacity: savingContact || !contactForm.name ? 0.6 : 1 }}>
                {savingContact ? 'Saving...' : editingContact ? 'Save Changes' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Account ── */}
      <ConfirmModal
        isOpen={showDeleteAccount}
        onClose={() => setShowDeleteAccount(false)}
        onConfirm={handleDeleteAccount}
        title="Delete Account"
        message={`Permanently delete "${account?.name}"? This cannot be undone.`}
        confirmLabel="Delete Account"
        danger
      />
    </LayoutShell>
  )
}

function TimelineItem({ item, accountId }: { item: any; accountId: string }) {
  const typeColors: Record<string, string> = { visit: t.gold, placement: t.status.success, order: t.status.info }
  const typeLabels: Record<string, string> = { visit: 'Visit', placement: 'Placement', order: 'Order' }
  const navHref = item._type === 'order' ? `/orders` : item._type === 'placement' ? `/placements` : null
  const inner = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '10px', fontWeight: '700', color: typeColors[item._type], textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {typeLabels[item._type]}
          </span>
          {item.status && <span style={badge.visitStatus(item.status)}>{item.status}</span>}
          {item.product_name && <span style={{ fontSize: '13px', color: t.text.primary, fontWeight: '500' }}>{item.product_name}</span>}
          {item.po_number && <span style={{ fontSize: '13px', color: t.text.primary, fontWeight: '500' }}>{item.po_number}</span>}
        </div>
        {item.notes && <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.5, margin: 0 }}>{item.notes}</p>}
        {item.user_profiles?.name && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '4px' }}>by {item.user_profiles.name}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
        <div style={{ fontSize: '11px', color: t.text.muted }}>{formatShortDateMT(item._date)}</div>
        {navHref && <ChevronRight size={13} color={t.text.muted} />}
      </div>
    </div>
  )
  return navHref ? (
    <Link href={navHref} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{ ...card, padding: '12px 16px', borderLeft: `3px solid ${typeColors[item._type]}`, cursor: 'pointer' }}>
        {inner}
      </div>
    </Link>
  ) : (
    <div style={{ ...card, padding: '12px 16px', borderLeft: `3px solid ${typeColors[item._type]}` }}>
      {inner}
    </div>
  )
}

function VisitCard({ visit, allRows, clients, onDelete, onSave, isMobile = false }: {
  visit: any
  allRows?: any[]
  clients?: any[]
  onDelete: () => void
  onSave: (updates: { visited_at?: string; status?: string; notes?: string }) => void
  isMobile?: boolean
}) {
  const [confirm, setConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ visited_at: '', status: '', notes: '' })

  function openEdit() {
    setForm({
      visited_at: visit.visited_at ? visit.visited_at.slice(0, 10) : '',
      status: visit.status || 'General Check-In',
      notes: visit.notes || '',
    })
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ visited_at: form.visited_at || undefined, status: form.status || undefined, notes: form.notes || undefined })
      setEditing(false)
    } finally { setSaving(false) }
  }

  return (
    <>
      <div style={{ ...card, padding: '14px 16px', borderLeft: `3px solid ${t.gold}` }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={form.visited_at} onChange={e => setForm(f => ({ ...f, visited_at: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={selectStyle}>
                  {VISIT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(false)} style={btnSecondary}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={badge.visitStatus(visit.status)}>{visit.status}</span>
              </div>
              {/* Per-brand notes */}
              {allRows && allRows.length > 1 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '4px' }}>
                  {allRows.filter(r => r.notes).map(r => {
                    const client = clients?.find((c: any) => c.slug === r.client_slug)
                    return (
                      <div key={r.id}>
                        {client && <div style={{ fontSize: '10px', fontWeight: '700', color: client.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{client.name}</div>}
                        <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.5, margin: 0 }}>{r.notes}</p>
                      </div>
                    )
                  })}
                  {!allRows.some(r => r.notes) && visit.notes && (
                    <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.5, margin: 0 }}>{visit.notes}</p>
                  )}
                </div>
              ) : (
                visit.notes && <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.5, margin: 0 }}>{visit.notes}</p>
              )}
              <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '6px' }}>
                {formatShortDateMT(visit.visited_at)}{visit.user_profiles?.name ? ` · ${visit.user_profiles.name}` : ''}
                {allRows && allRows.length > 1 && clients && (
                  <span style={{ marginLeft: '6px' }}>
                    {allRows.map(r => clients.find((c: any) => c.slug === r.client_slug)).filter(Boolean).map((c: any) => {
                      const logo = clientLogoUrl(c)
                      return logo ? (
                        <img key={c.slug} src={logo} alt={c.name} title={c.name}
                          style={{ width: '16px', height: '16px', objectFit: 'contain', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: '4px', verticalAlign: 'middle' }} />
                      ) : (
                        <span key={c.slug} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: c.color, marginLeft: '4px', verticalAlign: 'middle' }} title={c.name} />
                      )
                    })}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <button onClick={openEdit} style={{ ...btnIcon, color: t.text.muted }}>
                <Edit2 size={13} />
              </button>
              <button onClick={() => setConfirm(true)} style={{ ...btnIcon, color: t.status.danger }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => { onDelete(); setConfirm(false) }}
        title="Delete Visit"
        message="This will permanently delete this visit log. This cannot be undone."
        confirmLabel="Delete"
        danger
      />
    </>
  )
}

function CategoryBadge({ category }: { category?: string }) {
  if (!category || category === 'general') return null
  const cat = CONTACT_CATEGORIES.find(c => c.value === category)
  const color = CATEGORY_COLORS[category] || t.text.muted
  return (
    <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', backgroundColor: color + '1a', color, fontWeight: '600', border: `1px solid ${color}33` }}>
      {cat?.label || category}
    </span>
  )
}

function ContactCard({ contact, onEdit, onDelete }: { contact: any; onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{contact.name}</div>
            {contact.is_decision_maker && (
              <span style={{ fontSize: '10px', backgroundColor: t.goldDim, color: t.gold, padding: '1px 6px', borderRadius: '8px', fontWeight: '600' }}>Decision Maker</span>
            )}
            <CategoryBadge category={contact.category} />
          </div>
          {contact.role && <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>{contact.role}</div>}
          <div style={{ display: 'flex', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
            {contact.email && <a href={`mailto:${contact.email}`} style={{ fontSize: '12px', color: t.gold, textDecoration: 'none' }}>{contact.email}</a>}
            {contact.phone && <a href={`tel:${contact.phone}`} style={{ fontSize: '12px', color: t.text.secondary, textDecoration: 'none' }}>{contact.phone}</a>}
          </div>
          {contact.notes && <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '4px', fontStyle: 'italic' }}>{contact.notes}</div>}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button onClick={onEdit} style={{ ...btnIcon, color: t.text.muted }}>
            <Edit2 size={13} />
          </button>
          <button onClick={onDelete} style={{ ...btnIcon, color: t.status.danger }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
