'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Star, TrendingUp, MapPin, Package, ShoppingCart, Calendar, BarChart2, Shield, Settings, FileText, Users, BookOpen, Plus, X, Download, ExternalLink, Copy, Check, Pencil, Trash2 } from 'lucide-react'
import LayoutShell from '../../layout-shell'
import { getClients, getVisitsForClient, getPlacementsForClient, getOrdersForClient, getEventsForClient, getCampaigns, getStateRegistrations, getTastingConsumersForClient, getContacts, getProducts, createProduct, updateProduct, deleteProduct, updateClient, getDistributorContacts } from '../../lib/data'
import { getSupabase } from '../../lib/supabase'
import { invalidate } from '../../lib/cache'
import { t, card, btnPrimary, btnSecondary, badge, inputStyle, labelStyle, selectStyle } from '../../lib/theme'
import { formatShortDateMT, formatCurrency, relativeTimeStr, formatMonthYear } from '../../lib/formatters'
import { PLACEMENT_STATUS_LABELS, EVENT_TYPE_LABELS, clientLogoUrl } from '../../lib/constants'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { Client } from '../../lib/types'

const TABS = [
  { key: 'overview', label: 'Overview', icon: <BarChart2 size={14} /> },
  { key: 'visits', label: 'Visits', icon: <MapPin size={14} /> },
  { key: 'placements', label: 'Placements', icon: <Package size={14} /> },
  { key: 'orders', label: 'Orders', icon: <ShoppingCart size={14} /> },
  { key: 'products', label: 'Products', icon: <BookOpen size={14} /> },
  { key: 'events', label: 'Events', icon: <Calendar size={14} /> },
  { key: 'campaigns', label: 'Campaigns', icon: <TrendingUp size={14} /> },
  { key: 'tastings', label: 'Tastings', icon: <Star size={14} /> },
  { key: 'contacts', label: 'Contacts', icon: <Users size={14} /> },
  { key: 'compliance', label: 'Compliance', icon: <Shield size={14} /> },
  { key: 'report', label: 'Report', icon: <FileText size={14} /> },
]

// Which data group each tab needs
const TAB_GROUP: Record<string, string> = {
  overview: 'core', visits: 'core', placements: 'core', orders: 'core',
  tastings: 'core', report: 'core',
  products: 'products',
  events: 'events', campaigns: 'campaigns', contacts: 'contacts', compliance: 'compliance',
}

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

export default function ClientDetailPage() {
  const { slug } = useParams() as { slug: string }
  const router = useRouter()
  const [tab, setTab] = useState('overview')
  const [client, setClient] = useState<Client | null>(null)
  const [clientLoading, setClientLoading] = useState(true)
  const [tabLoading, setTabLoading] = useState(false)
  const [visits, setVisits] = useState<any[]>([])
  const [placements, setPlacements] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [registrations, setRegistrations] = useState<any[]>([])
  const [tastings, setTastings] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Client>>({})
  const [distributorContacts, setDistributorContacts] = useState<any[]>([])
  const [editSaving, setEditSaving] = useState(false)
  const [editErr, setEditErr] = useState('')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any | null>(null)
  const [productForm, setProductForm] = useState({ name: '', sku: '', category: '', active: true })
  const [productSaving, setProductSaving] = useState(false)
  const [userRole, setUserRole] = useState<string>('owner')
  const [isMobile, setIsMobile] = useState(false)
  const loaded = useRef(new Set<string>())

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Load distributor contacts for the settings panel
  useEffect(() => {
    getDistributorContacts().then(setDistributorContacts).catch(() => {})
  }, [])

  // Load user role
  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: p } = await sb.from('user_profiles').select('role').eq('id', user.id).single()
      if (p?.role) setUserRole(p.role)
    })
  }, [])

  // Load client from cache
  useEffect(() => {
    getClients().then(all => {
      const found = all.find(c => c.slug === slug)
      setClient(found || null)
      setClientLoading(false)
    }).catch(() => setClientLoading(false))
  }, [slug])

  // Lazy-load tab data when tab changes (or client becomes available)
  useEffect(() => {
    if (!client) return
    const group = TAB_GROUP[tab]
    if (!group || loaded.current.has(group)) return

    setTabLoading(true)
    const load = async () => {
      if (group === 'core') {
        const [v, p, o, ta] = await Promise.all([
          getVisitsForClient(slug),
          getPlacementsForClient(slug),
          getOrdersForClient(slug),
          getTastingConsumersForClient(slug),
        ])
        setVisits(v); setPlacements(p); setOrders(o); setTastings(ta)
      } else if (group === 'events') {
        setEvents(await getEventsForClient(slug))
      } else if (group === 'campaigns') {
        setCampaigns(await getCampaigns(slug))
      } else if (group === 'contacts') {
        setContacts(await getContacts(slug))
      } else if (group === 'compliance') {
        setRegistrations(await getStateRegistrations(client.id))
      } else if (group === 'products') {
        setProducts(await getProducts(slug))
      }
      loaded.current.add(group)
      setTabLoading(false)
    }
    load().catch(() => setTabLoading(false))
  }, [tab, client, slug])

  if (clientLoading) {
    return (
      <LayoutShell>
        <div style={{ padding: '32px 48px' }}>
          <div style={{ height: '24px', width: '200px', backgroundColor: t.bg.card, borderRadius: '6px', marginBottom: '8px' }} />
          <div style={{ height: '14px', width: '120px', backgroundColor: t.bg.elevated, borderRadius: '4px' }} />
        </div>
      </LayoutShell>
    )
  }

  if (!client) {
    return (
      <LayoutShell>
        <div style={{ padding: '32px 48px', color: t.text.muted }}>Client not found.</div>
      </LayoutShell>
    )
  }

  const totalRevenue = orders.reduce((s, o) => s + resolveTotal(o), 0)
  const activePlacements = placements.filter(p => p.status !== 'lost' && p.status !== 'removed')
  const avgRating = tastings.length ? (tastings.reduce((s, tg) => s + (tg.rating || 0), 0) / tastings.length).toFixed(1) : null
  const wouldBuyPct = tastings.length ? Math.round(tastings.filter(tg => tg.would_buy === true).length / tastings.length * 100) : null

  const visitsByMonth: Record<string, number> = {}
  visits.forEach(v => {
    const key = formatMonthYear(v.visited_at)
    visitsByMonth[key] = (visitsByMonth[key] || 0) + 1
  })
  const visitChartData = Object.entries(visitsByMonth).slice(-6).map(([month, count]) => ({ month, count }))

  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/portal/${slug}` : `/portal/${slug}`

  function copyPortalUrl() {
    navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const spinnerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '60px 0', color: t.text.muted, fontSize: '13px',
  }

  return (
    <LayoutShell>
      <div style={{ padding: isMobile ? '16px' : '32px 48px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <button onClick={() => router.push('/clients')} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '6px', display: 'flex' }}>
            <ArrowLeft size={18} />
          </button>
          {(() => {
            const logo = clientLogoUrl(client)
            return logo ? (
              <img src={logo} alt={client.name}
                style={{ width: '44px', height: '44px', objectFit: 'contain', flexShrink: 0, borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.04)', padding: '2px' }} />
            ) : (
              <div style={{ width: '44px', height: '44px', borderRadius: '8px', backgroundColor: `${client.color}22`, border: `1px solid ${client.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '18px', fontWeight: '700', color: client.color }}>{client.name[0]}</span>
              </div>
            )
          })()}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>{client.name}</h1>
            <p style={{ fontSize: '13px', color: t.text.muted }}>{client.category || 'Spirits Brand'}{client.state ? ` · ${client.state}` : ''}{client.territory ? ` · ${client.territory}` : ''}</p>
          </div>
          <button onClick={() => setShowSettings(true)} title="Brand Settings" style={{
            background: 'none', border: `1px solid ${t.border.default}`, color: t.text.muted,
            cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center',
            transition: 'all 150ms ease',
          }}>
            <Settings size={16} />
          </button>
        </div>

        {/* Tabs */}
        {(() => {
          const INTERN_ALLOWED_TABS = new Set(['overview', 'visits', 'placements', 'events', 'products'])
          const visibleTabs = userRole === 'intern' ? TABS.filter(tb => INTERN_ALLOWED_TABS.has(tb.key)) : TABS
          return (
        <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: `1px solid ${t.border.default}`, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {visibleTabs.map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap',
              color: tab === tb.key ? t.text.primary : t.text.muted,
              borderBottom: `2px solid ${tab === tb.key ? client.color || t.gold : 'transparent'}`,
              marginBottom: '-1px', transition: 'color 150ms ease',
            }}>
              {tb.icon}{tb.label}
            </button>
          ))}
        </div>
          )
        })()}

        {tabLoading && (
          <div style={spinnerStyle}>Loading…</div>
        )}

        {/* Overview Tab */}
        {tab === 'overview' && !tabLoading && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
              {[
                { label: 'Total Visits', value: visits.length },
                { label: 'Active Placements', value: activePlacements.length },
                { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
                { label: 'Tasting Responses', value: tastings.length },
              ].map(s => (
                <div key={s.label} style={{ ...card, padding: '16px 18px' }}>
                  <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{s.label}</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {visitChartData.length > 0 && (
              <div style={{ ...card, padding: '20px 24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary, marginBottom: '16px' }}>Visits — Last 6 Months</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={visitChartData} barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.border.subtle} vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: t.text.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: t.text.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderRadius: '8px', fontSize: '12px' }} />
                    <Bar dataKey="count" fill={client.color || t.gold} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Distributor info */}
            {(client.distributor_name || client.distributor_rep_id) && (() => {
              const rep = distributorContacts.find(c => c.id === client.distributor_rep_id)
              return (
                <div style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderRadius: '8px', padding: '14px 18px', marginBottom: '16px', fontSize: '13px', color: t.text.secondary }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '10px' }}>Distributor</span>
                  {client.distributor_name && <span style={{ color: t.text.primary, fontWeight: '600', marginRight: '6px' }}>{client.distributor_name}</span>}
                  {rep && (
                    <span style={{ color: t.text.secondary }}>
                      {' · Rep: '}<strong style={{ color: t.text.primary }}>{rep.name}</strong>
                      {rep.phone && <a href={`tel:${rep.phone}`} style={{ color: t.gold, textDecoration: 'none', marginLeft: '6px' }}>{rep.phone}</a>}
                      {rep.email && <a href={`mailto:${rep.email}`} style={{ color: t.gold, textDecoration: 'none', marginLeft: '6px' }}>{rep.email}</a>}
                    </span>
                  )}
                </div>
              )
            })()}

            {visits.length === 0 && placements.length === 0 && orders.length === 0 && (
              <div style={{ color: t.text.muted, fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>
                No activity logged yet — start by logging a visit.
              </div>
            )}
          </div>
        )}

        {/* Visits Tab */}
        {tab === 'visits' && !tabLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {visits.length === 0 ? (
              <div style={{ color: t.text.muted, fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>No visits logged for this brand yet</div>
            ) : visits.map(v => (
              <div key={v.id} style={{ ...card, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Link href={v.accounts?.id ? `/accounts/${v.accounts.id}` : '#'} style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary, textDecoration: 'none' }}>{v.accounts?.name || 'Unknown Account'}</Link>
                    <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>{v.accounts?.address}</div>
                    {v.notes && <p style={{ fontSize: '12px', color: t.text.secondary, marginTop: '4px' }}>{v.notes}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '16px' }}>
                    <span style={badge.visitStatus(v.status)}>{v.status}</span>
                    <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '4px' }}>{formatShortDateMT(v.visited_at)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Placements Tab */}
        {tab === 'placements' && !tabLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {placements.length === 0 ? (
              <div style={{ color: t.text.muted, fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>No placements for this brand</div>
            ) : placements.map(p => (
              <div key={p.id} style={{ ...card, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{p.product_name}</div>
                    <div style={{ fontSize: '12px', color: t.text.muted }}>
                      {p.accounts?.id ? <Link href={`/accounts/${p.accounts.id}`} style={{ color: t.text.muted, textDecoration: 'none' }}>{p.accounts.name}</Link> : p.accounts?.name}
                      {' · '}{p.placement_type?.replace('_', ' ')}
                    </div>
                    {p.price_point && <div style={{ fontSize: '12px', color: t.gold, marginTop: '2px' }}>${p.price_point}</div>}
                  </div>
                  <span style={badge.placementStatus(p.status)}>{PLACEMENT_STATUS_LABELS[p.status as keyof typeof PLACEMENT_STATUS_LABELS] || p.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Orders Tab */}
        {tab === 'orders' && !tabLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {orders.length === 0 ? (
              <div style={{ color: t.text.muted, fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>No orders for this brand</div>
            ) : orders.map(o => (
              <div key={o.id} style={{ ...card, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="mono" style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{o.po_number}</div>
                    <div style={{ fontSize: '12px', color: t.text.muted }}>
                      {o.accounts?.id ? <Link href={`/accounts/${o.accounts.id}`} style={{ color: t.text.muted, textDecoration: 'none' }}>{o.accounts.name}</Link> : o.accounts?.name}
                      {' · '}{formatShortDateMT(o.order_date || o.created_at)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>{formatCurrency(resolveTotal(o))}</div>
                    <span style={badge.orderStatus(o.status)}>{o.status}</span>
                  </div>
                </div>
              </div>
            ))}
            {orders.length > 0 && (
              <div style={{ ...card, padding: '14px 18px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: t.text.primary }}>Total Revenue</span>
                <span style={{ fontSize: '16px', fontWeight: '800', color: t.gold }}>{formatCurrency(totalRevenue)}</span>
              </div>
            )}
          </div>
        )}

        {/* Products Tab */}
        {tab === 'products' && !tabLoading && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: t.text.muted }}>Products appear in the visit log tasting section and placement forms.</p>
              <button onClick={() => { setProductForm({ name: '', sku: '', category: '', active: true }); setEditingProduct(null); setShowAddProduct(true) }} style={{ ...btnPrimary, padding: '8px 14px', fontSize: '12px' }}>
                <Plus size={13} /> Add Product
              </button>
            </div>

            {products.length === 0 ? (
              <div style={{ color: t.text.muted, fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>
                No products yet — add products so they appear when logging visits and tastings.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {products.map(p => (
                  <div key={p.id} style={{ ...card, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{p.name}</div>
                      <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>
                        {p.category && <span>{p.category}</span>}
                        {p.sku && <span style={{ marginLeft: p.category ? '8px' : 0 }}>SKU: {p.sku}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '8px', backgroundColor: p.active ? 'rgba(61,186,120,0.12)' : 'rgba(107,105,102,0.12)', color: p.active ? '#3dba78' : '#6b6966', fontWeight: '700' }}>
                      {p.active ? 'Active' : 'Inactive'}
                    </span>
                    <button onClick={() => { setEditingProduct(p); setProductForm({ name: p.name, sku: p.sku || '', category: p.category || '', active: p.active }); setShowAddProduct(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted, padding: '4px', display: 'flex' }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={async () => { if (!confirm(`Delete "${p.name}"?`)) return; await deleteProduct(p.id); setProducts(prev => prev.filter(x => x.id !== p.id)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05252', padding: '4px', display: 'flex' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add / Edit Product modal */}
            {showAddProduct && (
              <>
                <div onClick={() => setShowAddProduct(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 400 }} />
                <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '420px', maxWidth: '95vw', backgroundColor: t.bg.elevated, border: `1px solid ${t.border.hover}`, borderRadius: '12px', zIndex: 500, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary }}>{editingProduct ? 'Edit Product' : 'Add Product'}</div>
                    <button onClick={() => setShowAddProduct(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.muted, padding: '4px', display: 'flex' }}><X size={18} /></button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Product Name *</label>
                      <input value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Barley Bros Wheat Whiskey" style={{ ...inputStyle, marginTop: '4px' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={labelStyle}>SKU</label>
                        <input value={productForm.sku} onChange={e => setProductForm(f => ({ ...f, sku: e.target.value }))} placeholder="BBW-750" style={{ ...inputStyle, marginTop: '4px' }} />
                      </div>
                      <div>
                        <label style={labelStyle}>Category</label>
                        <input value={productForm.category} onChange={e => setProductForm(f => ({ ...f, category: e.target.value }))} placeholder="Whiskey, Vodka..." style={{ ...inputStyle, marginTop: '4px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input type="checkbox" id="prod-active" checked={productForm.active} onChange={e => setProductForm(f => ({ ...f, active: e.target.checked }))} />
                      <label htmlFor="prod-active" style={{ fontSize: '13px', color: t.text.secondary, cursor: 'pointer' }}>Active (shows in visit log)</label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowAddProduct(false)} style={btnSecondary}>Cancel</button>
                    <button disabled={!productForm.name.trim() || productSaving} onClick={async () => {
                      if (!productForm.name.trim()) return
                      setProductSaving(true)
                      try {
                        if (editingProduct) {
                          await updateProduct(editingProduct.id, { name: productForm.name.trim(), sku: productForm.sku || undefined, category: productForm.category || undefined, active: productForm.active })
                          setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...productForm, name: productForm.name.trim() } : p))
                        } else {
                          const created = await createProduct({ client_slug: slug, name: productForm.name.trim(), sku: productForm.sku || undefined, category: productForm.category || undefined, active: productForm.active })
                          setProducts(prev => [...prev, created])
                        }
                        setShowAddProduct(false)
                      } catch (e) { console.error(e) }
                      setProductSaving(false)
                    }} style={{ ...btnPrimary, opacity: !productForm.name.trim() || productSaving ? 0.5 : 1 }}>
                      {productSaving ? 'Saving…' : editingProduct ? 'Save Changes' : 'Add Product'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Events Tab */}
        {tab === 'events' && !tabLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {events.length === 0 ? (
              <div style={{ color: t.text.muted, fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>No events for this brand</div>
            ) : events.map(e => (
              <div key={e.id} style={{ ...card, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{e.title}</div>
                    <div style={{ fontSize: '12px', color: t.text.muted }}>
                      {EVENT_TYPE_LABELS[e.event_type as keyof typeof EVENT_TYPE_LABELS]}{e.accounts?.name ? ` · ${e.accounts.name}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: t.text.muted }}>{formatShortDateMT(e.start_time)}</div>
                </div>
                {e.notes && <p style={{ fontSize: '12px', color: t.text.secondary, marginTop: '6px' }}>{e.notes}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Campaigns Tab */}
        {tab === 'campaigns' && !tabLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {campaigns.length === 0 ? (
              <div style={{ color: t.text.muted, fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>No campaigns for this brand</div>
            ) : campaigns.map(c => (
              <div key={c.id} style={{ ...card, padding: '14px 18px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{c.name}</div>
                <div style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>
                  {c.campaign_type?.replace('_', ' ')}{c.start_date ? ` · ${formatShortDateMT(c.start_date)}` : ''}
                  {c.budget ? ` · $${c.budget.toLocaleString()}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tastings Tab */}
        {tab === 'tastings' && !tabLoading && (
          <div>
            {tastings.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                  { label: 'Responses', value: tastings.length },
                  { label: 'Avg Rating', value: avgRating ? `${avgRating} / 5` : '—' },
                  { label: 'Would Buy', value: wouldBuyPct !== null ? `${wouldBuyPct}%` : '—' },
                ].map(s => (
                  <div key={s.label} style={{ ...card, padding: '16px 18px' }}>
                    <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{s.label}</div>
                    <div style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {tastings.length === 0 ? (
                <div style={{ color: t.text.muted, fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>No tasting feedback yet — share the event QR code to collect responses</div>
              ) : tastings.map((tg: any) => (
                <div key={tg.id} style={{ ...card, padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '2px', marginBottom: '4px' }}>
                        {[1,2,3,4,5].map(n => <Star key={n} size={12} fill={tg.rating >= n ? '#d4a843' : 'transparent'} color={tg.rating >= n ? '#d4a843' : '#3d3d38'} />)}
                      </div>
                      {tg.first_name && <div style={{ fontSize: '13px', fontWeight: '500', color: t.text.primary }}>{tg.first_name}</div>}
                      {tg.notes && <p style={{ fontSize: '12px', color: t.text.muted, marginTop: '2px' }}>{tg.notes}</p>}
                    </div>
                    <div style={{ fontSize: '11px', color: t.text.muted }}>{relativeTimeStr(tg.captured_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contacts Tab */}
        {tab === 'contacts' && !tabLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {contacts.length === 0 ? (
              <div style={{ color: t.text.muted, fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>No contacts linked to this brand</div>
            ) : contacts.map(c => (
              <div key={c.id} style={{ ...card, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{c.name}</span>
                      {c.is_decision_maker && <Star size={12} fill={t.gold} color={t.gold} />}
                    </div>
                    {c.role && <div style={{ fontSize: '12px', color: t.text.muted }}>{c.role}</div>}
                    {(c as any).accounts?.name && <div style={{ fontSize: '12px', color: t.text.secondary }}>{(c as any).accounts.name}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: '12px', color: t.gold, textDecoration: 'none' }}>{c.email}</a>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Compliance Tab */}
        {tab === 'compliance' && !tabLoading && (
          <div>
            {registrations.length === 0 ? (
              <div style={{ color: t.text.muted, fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>No state registrations tracked — go to Compliance to add them</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                {registrations.map(r => {
                  const statusColors: Record<string, string> = { active: '#3dba78', pending: '#e89a2e', expired: '#e05252', not_registered: '#6b6966' }
                  const color = statusColors[r.status] || '#6b6966'
                  return (
                    <div key={r.id} style={{ backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary }}>{r.state}</span>
                        <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '8px', backgroundColor: color + '20', color, fontWeight: '700', textTransform: 'uppercase' }}>{r.status.replace('_', ' ')}</span>
                      </div>
                      {r.ttb_number && <div style={{ fontSize: '11px', color: t.text.muted }}>TTB: {r.ttb_number}</div>}
                      {r.expiry_date && <div style={{ fontSize: '11px', color: t.text.muted }}>Expires {formatShortDateMT(r.expiry_date)}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Report Tab */}
        {tab === 'report' && !tabLoading && (
          <div style={{ ...card, padding: '28px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>{client.name} — Activity Report</h2>
                <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>Generated by Barley Bros · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <button onClick={() => window.print()} style={btnSecondary}><Download size={14} /> Export</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
              {[
                { label: 'Total Visits', value: visits.length },
                { label: 'Active Placements', value: activePlacements.length },
                { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
                { label: 'Tasting Responses', value: tastings.length },
              ].map(s => (
                <div key={s.label} style={{ backgroundColor: t.bg.elevated, borderRadius: '10px', padding: '16px 18px', border: `1px solid ${t.border.default}` }}>
                  <div style={{ fontSize: '10px', color: t.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{s.label}</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary }}>{s.value}</div>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary, marginBottom: '12px' }}>Recent Visits</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
              {visits.length === 0 ? (
                <div style={{ fontSize: '13px', color: t.text.muted, padding: '8px 0' }}>No visits yet</div>
              ) : visits.filter((v: any) => !v.client_slug || v.client_slug === slug).slice(0, 10).map(v => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${t.border.subtle}` }}>
                  <span style={{ fontSize: '13px', color: t.text.primary }}>{v.accounts?.name}</span>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={badge.visitStatus(v.status)}>{v.status}</span>
                    <span style={{ fontSize: '12px', color: t.text.muted }}>{formatShortDateMT(v.visited_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary, marginBottom: '12px' }}>Active Placements</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activePlacements.length === 0 ? (
                <div style={{ fontSize: '13px', color: t.text.muted, padding: '8px 0' }}>No active placements</div>
              ) : activePlacements.slice(0, 10).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${t.border.subtle}` }}>
                  <div>
                    <span style={{ fontSize: '13px', color: t.text.primary }}>{p.product_name}</span>
                    <span style={{ fontSize: '12px', color: t.text.muted, marginLeft: '8px' }}>{p.accounts?.name}</span>
                  </div>
                  <span style={badge.placementStatus(p.status)}>{p.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings slide-over panel */}
        {showSettings && (
          <>
            <div onClick={() => setShowSettings(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 400 }} />
            <div style={{
              position: 'fixed', top: 0, right: 0, height: '100vh', width: '400px', maxWidth: '95vw',
              backgroundColor: t.bg.elevated,
              borderLeft: `1px solid ${t.border.hover}`,
              zIndex: 500,
              display: 'flex', flexDirection: 'column',
              animation: 'slideInRight 200ms ease',
            }}>
              {/* Panel header */}
              <div style={{
                padding: '20px 24px',
                borderBottom: `1px solid ${t.border.default}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: client.color || t.gold }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: t.text.primary }}>{client.name}</div>
                    <div style={{ fontSize: '11px', color: t.text.muted }}>Brand Management</div>
                  </div>
                </div>
                <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '6px', display: 'flex' }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Client Portal */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Client Portal</div>
                  <p style={{ fontSize: '13px', color: t.text.secondary, marginBottom: '12px', lineHeight: 1.5 }}>
                    Share this link with {client.name} so they can see their own brand performance.
                  </p>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ flex: 1, backgroundColor: t.bg.page, border: `1px solid ${t.border.default}`, borderRadius: '8px', padding: '9px 12px', fontSize: '12px', color: t.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {portalUrl}
                    </div>
                    <button onClick={copyPortalUrl} style={{ ...btnSecondary, padding: '9px 12px', fontSize: '12px', flexShrink: 0, gap: '4px' }}>
                      {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                    </button>
                  </div>
                  <a href={portalUrl} target="_blank" rel="noreferrer" style={{ ...btnPrimary, fontSize: '13px', textDecoration: 'none', justifyContent: 'center' }}>
                    <ExternalLink size={14} /> Open Portal
                  </a>
                </div>

                {/* Divider */}
                <div style={{ borderTop: `1px solid ${t.border.subtle}` }} />

                {/* Edit Brand Info */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' }}>Edit Brand Info</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={labelStyle}>Contact Name</label>
                      <input type="text" value={editForm.contact_name ?? client.contact_name ?? ''} onChange={e => setEditForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Primary contact" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Contact Email</label>
                      <input type="email" value={editForm.contact_email ?? client.contact_email ?? ''} onChange={e => setEditForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="contact@brand.com" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Contact Phone</label>
                      <input type="text" value={editForm.contact_phone ?? client.contact_phone ?? ''} onChange={e => setEditForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="(720) 555-0000" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Territory</label>
                      <input type="text" value={editForm.territory ?? client.territory ?? ''} onChange={e => setEditForm(f => ({ ...f, territory: e.target.value }))} placeholder="e.g. Colorado" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Commission Rate (%)</label>
                      <input type="number" step="0.1" min="0" max="100"
                        value={editForm.commission_rate !== undefined ? (editForm.commission_rate * 100) : (client.commission_rate * 100)}
                        onChange={e => setEditForm(f => ({ ...f, commission_rate: parseFloat(e.target.value) / 100 || 0 }))}
                        placeholder="e.g. 12" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Distributor Name</label>
                      <input type="text" value={editForm.distributor_name ?? client.distributor_name ?? ''} onChange={e => setEditForm(f => ({ ...f, distributor_name: e.target.value }))} placeholder="e.g. Republic National" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Distributor Rep</label>
                      <select
                        value={editForm.distributor_rep_id ?? client.distributor_rep_id ?? ''}
                        onChange={e => setEditForm(f => ({ ...f, distributor_rep_id: e.target.value || undefined }))}
                        style={selectStyle}
                      >
                        <option value="">None</option>
                        {distributorContacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ''}</option>)}
                      </select>
                      {distributorContacts.length === 0 && (
                        <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '4px' }}>Add contacts with category "Distributor Rep" on account pages to see them here.</div>
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>Notes</label>
                      <input type="text" value={editForm.notes ?? client.notes ?? ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." style={inputStyle} />
                    </div>
                    {editErr && <div style={{ fontSize: '12px', color: t.status.danger }}>{editErr}</div>}
                    <button
                      onClick={async () => {
                        if (!Object.keys(editForm).length) return
                        setEditSaving(true); setEditErr('')
                        try {
                          await updateClient(client.id, editForm)
                          invalidate('clients')
                          setClient(c => c ? { ...c, ...editForm } : c)
                          setEditForm({})
                        } catch (e: any) { setEditErr(e.message || 'Failed to save') }
                        finally { setEditSaving(false) }
                      }}
                      disabled={editSaving || !Object.keys(editForm).length}
                      style={{ ...btnPrimary, opacity: (editSaving || !Object.keys(editForm).length) ? 0.5 : 1, fontSize: '13px' }}
                    >
                      {editSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
          </>
        )}
      </div>
    </LayoutShell>
  )
}
