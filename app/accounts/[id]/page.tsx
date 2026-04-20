'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  MapPin, Phone, Plus, ChevronLeft, Edit2, Trash2,
  Package, ShoppingCart, Users, Activity, Shield,
} from 'lucide-react'
import LayoutShell from '../../layout-shell'
import VisitLogModal from '../../components/VisitLogModal'
import ConfirmModal from '../../components/ConfirmModal'
import EmptyState from '../../components/EmptyState'
import { getAccount, getVisits, getPlacements, getOrders, getContacts, deleteVisit, createContact, updateContact, deleteContact, createPlacement, getClients } from '../../lib/data'
import { clientLogoUrl } from '../../lib/constants'

function resolveTotal(o: any): number {
  const items: any[] = o.po_line_items || []
  if (items.length > 0) {
    const fromItems = items.reduce((sum: number, li: any) => {
      const lineTotal = Number(li.total || 0)
      if (lineTotal > 0) return sum + lineTotal
      const price = Number(li.unit_price || li.price || 0)
      const qty = Number(li.cases || 0) + Number(li.bottles || 0) + Number(li.quantity || 0) || 1
      return sum + price * qty
    }, 0)
    if (fromItems > 0) return fromItems
  }
  return Number(o.total_amount || (o as any).total || 0)
}
import { getSupabase } from '../../lib/supabase'
import { t, card, btnPrimary, btnSecondary, btnDanger, btnIcon, badge, inputStyle, labelStyle, selectStyle } from '../../lib/theme'
import { formatShortDateMT, relativeTimeStr, daysAgoMT, formatCurrency } from '../../lib/formatters'
import { overdueColor } from '../../lib/theme'
import { PLACEMENT_TYPES, PLACEMENT_TYPE_LABELS } from '../../lib/constants'
import type { UserProfile, Client } from '../../lib/types'

const TABS = ['activity', 'visits', 'placements', 'orders', 'contacts'] as const
type Tab = typeof TABS[number]

export default function AccountDetailPage() {
  const { id } = useParams() as { id: string }
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
  const [isMobile, setIsMobile] = useState(false)
  const [addContact, setAddContact] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', role: '', email: '', phone: '', is_decision_maker: false })
  const [savingContact, setSavingContact] = useState(false)
  const [addPlacement, setAddPlacement] = useState(false)
  const [placementForm, setPlacementForm] = useState({ client_slug: '', product_name: '', placement_type: 'shelf', price_point: '' })
  const [savingPlacement, setSavingPlacement] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: p } = await sb.from('user_profiles').select('*').eq('id', user.id).single()
        if (p) setProfile(p)
      }
    })
  }, [])

  const loadTab = useCallback(async (t: Tab) => {
    if (!id || loadedTabsRef.current.has(t)) return
    loadedTabsRef.current.add(t)
    try {
      if (t === 'activity' || t === 'visits') {
        const vs = await getVisits({ accountId: id, limit: 50 })
        setVisits(vs)
      }
      if (t === 'activity' || t === 'placements') {
        const ps = await getPlacements({ accountId: id })
        setPlacements(ps)
      }
      if (t === 'activity' || t === 'orders') {
        const os = await getOrders({ accountId: id })
        setOrders(os)
      }
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
      setClients(cls)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadTab(tab) }, [tab, loadTab])

  const reloadAll = useCallback(() => {
    loadedTabsRef.current.clear()
    load().then(() => loadTab(tab))
  }, [load, loadTab, tab])

  if (loading || !account) {
    return (
      <LayoutShell>
        <div style={{ padding: '32px 48px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
          <div style={{ width: '200px', height: '24px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '6px', animation: 'skeleton-pulse 1.2s ease-in-out infinite' }} />
        </div>
      </LayoutShell>
    )
  }

  const days = daysAgoMT(account.last_visited)
  const overdueClr = overdueColor(days)
  const pad = isMobile ? '16px' : '32px 36px'

  // Unified timeline
  const timeline = [
    ...visits.map(v => ({ ...v, _type: 'visit', _date: v.visited_at })),
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
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
              <div style={{ fontSize: '12px', color: overdueClr, marginTop: '6px', fontWeight: '600' }}>
                Last visited: {days === null ? 'Never' : `${days} days ago`}
                {account.visit_frequency_days ? ` · Target: every ${account.visit_frequency_days} days` : ''}
              </div>
            </div>
            <button onClick={() => setVisitModal(true)} style={{ ...btnPrimary, padding: '9px 14px', fontSize: '13px', flexShrink: 0 }}>
              <Plus size={15} /> Log Visit
            </button>
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
                {timeline.slice(0, 20).map((item: any) => (
                  <TimelineItem key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'visits' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {visits.length === 0 ? (
              <EmptyState icon={<MapPin size={32} />} title="No visits logged" />
            ) : visits.map(v => (
              <VisitCard key={v.id} visit={v} onDelete={() => deleteVisit(v.id).then(reloadAll)} isOwner={profile?.role === 'owner'} />
            ))}
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
                    <input type="text" value={placementForm.product_name} onChange={e => setPlacementForm(f => ({ ...f, product_name: e.target.value }))}
                      placeholder="e.g. Single Barrel Bourbon 750ml" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Price Point ($)</label>
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
              <button onClick={() => setAddContact(true)} style={{ ...btnPrimary, padding: '8px 14px', fontSize: '13px' }}>
                <Plus size={14} /> Add Contact
              </button>
            </div>
            {contacts.length === 0 && !addContact ? (
              <EmptyState icon={<Users size={32} />} title="No contacts yet" action={
                <button onClick={() => setAddContact(true)} style={btnPrimary}><Plus size={14} /> Add Contact</button>
              } />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {contacts.map((c: any) => (
                  <ContactCard key={c.id} contact={c} onDelete={() => deleteContact(c.id).then(reloadAll)} />
                ))}
              </div>
            )}
            {addContact && (
              <div style={{ ...card, marginTop: '12px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary, marginBottom: '14px' }}>New Contact</h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                  {[
                    { label: 'Name', key: 'name', type: 'text', placeholder: 'Full name' },
                    { label: 'Role', key: 'role', type: 'text', placeholder: 'General Manager, Buyer...' },
                    { label: 'Email', key: 'email', type: 'email', placeholder: 'email@example.com' },
                    { label: 'Phone', key: 'phone', type: 'tel', placeholder: '(970) 555-0100' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={labelStyle}>{f.label}</label>
                      <input type={f.type} value={(contactForm as any)[f.key]} onChange={e => setContactForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder} style={inputStyle} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setAddContact(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={async () => {
                    if (!contactForm.name) return
                    setSavingContact(true)
                    await createContact({ ...contactForm, account_id: id })
                    setContactForm({ name: '', role: '', email: '', phone: '', is_decision_maker: false })
                    setAddContact(false)
                    setSavingContact(false)
                    reloadAll()
                  }} style={btnPrimary} disabled={savingContact}>
                    {savingContact ? 'Saving...' : 'Save Contact'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}


        {profile && (
          <VisitLogModal
            isOpen={visitModal}
            onClose={() => setVisitModal(false)}
            onSuccess={reloadAll}
            userId={profile.id}
            defaultAccountId={id}
            isMobile={isMobile}
          />
        )}
      </div>
    </LayoutShell>
  )
}

function TimelineItem({ item }: { item: any }) {
  const typeColors: Record<string, string> = { visit: t.gold, placement: t.status.success, order: t.status.info }
  const typeLabels: Record<string, string> = { visit: 'Visit', placement: 'Placement', order: 'Order' }
  return (
    <div style={{ ...card, padding: '12px 16px', borderLeft: `3px solid ${typeColors[item._type]}` }}>
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
        <div style={{ fontSize: '11px', color: t.text.muted, flexShrink: 0, marginLeft: '12px' }}>
          {formatShortDateMT(item._date)}
        </div>
      </div>
    </div>
  )
}

function VisitCard({ visit, onDelete, isOwner }: { visit: any; onDelete: () => void; isOwner: boolean }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <div style={{ ...card, padding: '14px 16px', borderLeft: `3px solid ${t.gold}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={badge.visitStatus(visit.status)}>{visit.status}</span>
              <span style={{ fontSize: '11px', color: t.text.muted }}>{visit.client_slug}</span>
            </div>
            {visit.notes && <p style={{ fontSize: '13px', color: t.text.secondary, lineHeight: 1.5, margin: 0 }}>{visit.notes}</p>}
            <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '6px' }}>
              {formatShortDateMT(visit.visited_at)} · {visit.user_profiles?.name}
            </div>
          </div>
          {isOwner && (
            <button onClick={() => setConfirm(true)} style={{ ...btnIcon, color: t.status.danger }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
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

function ContactCard({ contact, onDelete }: { contact: any; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <div style={{ ...card, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{contact.name}</div>
              {contact.is_decision_maker && (
                <span style={{ fontSize: '10px', backgroundColor: t.goldDim, color: t.gold, padding: '1px 6px', borderRadius: '8px', fontWeight: '600' }}>Decision Maker</span>
              )}
            </div>
            {contact.role && <div style={{ fontSize: '12px', color: t.text.muted }}>{contact.role}</div>}
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
              {contact.email && <a href={`mailto:${contact.email}`} style={{ fontSize: '12px', color: t.gold, textDecoration: 'none' }}>{contact.email}</a>}
              {contact.phone && <a href={`tel:${contact.phone}`} style={{ fontSize: '12px', color: t.text.secondary, textDecoration: 'none' }}>{contact.phone}</a>}
            </div>
          </div>
          <button onClick={() => setConfirm(true)} style={{ ...btnIcon, color: t.text.muted }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <ConfirmModal isOpen={confirm} onClose={() => setConfirm(false)} onConfirm={() => { onDelete(); setConfirm(false) }}
        title="Remove Contact" message="Remove this contact from this account?" confirmLabel="Remove" danger />
    </>
  )
}
