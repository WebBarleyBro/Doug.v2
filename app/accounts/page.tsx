'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { MapPin, Plus, Search, ChevronRight, X, AlertTriangle, Trash2 } from 'lucide-react'
import LayoutShell from '../layout-shell'
import VisitLogModal from '../components/VisitLogModal'
import AddAccountModal from '../components/AddAccountModal'
import EmptyState from '../components/EmptyState'
import ConfirmModal from '../components/ConfirmModal'
import { CardSkeleton } from '../components/LoadingSkeleton'
import { getAccounts, getClients, deleteAccount } from '../lib/data'
import { getSupabase } from '../lib/supabase'
import { t, card, btnPrimary, btnSecondary, badge } from '../lib/theme'
import { daysAgoMT, relativeTimeStr } from '../lib/formatters'
import { overdueColor, overdueColorBg } from '../lib/theme'
import { clientLogoUrl } from '../lib/constants'
import type { Account, Client, UserProfile } from '../lib/types'

function AccountCard({ account, clients }: { account: any; clients: Client[] }) {
  const days = daysAgoMT(account.last_visited)
  const color = overdueColor(days)
  const slugs = account.account_clients?.map((ac: any) => ac.client_slug) || []
  const accountClients = clients.filter(c => slugs.includes(c.slug))

  return (
    <div style={{ ...card, padding: '16px 20px', borderLeft: `3px solid ${color}`, position: 'relative' }}>
      <Link href={`/accounts/${account.id}`} style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{ fontSize: '15px', fontWeight: '600', color: t.text.primary }}>
                {account.name}
              </div>
            </div>
            {account.address && (
              <div style={{ fontSize: '12px', color: t.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '8px' }}>
                {account.address}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color, fontWeight: '600' }}>
                {days === null ? 'Never visited' : days === 0 ? 'Visited today' : `${days}d ago`}
              </span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {accountClients.map(c => {
                  const logo = clientLogoUrl(c)
                  return logo ? (
                    <img key={c.slug} src={logo} alt={c.name} title={c.name}
                      style={{ width: '26px', height: '26px', objectFit: 'contain', opacity: 0.95, borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)' }} />
                  ) : (
                    <span key={c.slug} style={{
                      width: '18px', height: '18px', borderRadius: '50%',
                      backgroundColor: c.color, display: 'inline-block',
                      border: `1px solid ${c.color}40`,
                    }} title={c.name} />
                  )
                })}
              </div>
            </div>
          </div>
          <ChevronRight size={16} color={t.text.muted} style={{ flexShrink: 0, marginTop: '2px' }} />
        </div>
      </Link>
      {account.address && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(account.address)}`}
          target="_blank" rel="noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '12px', right: '36px',
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '11px', color: t.text.muted, textDecoration: 'none',
            padding: '3px 7px', borderRadius: '5px', border: `1px solid ${t.border.subtle}`,
            backgroundColor: t.bg.elevated, opacity: 0.8,
          }}
          title="Get directions"
        >
          <MapPin size={10} /> Directions
        </a>
      )}
    </div>
  )
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterClient, setFilterClient] = useState('all')
  const [sortBy, setSortBy] = useState<'name' | 'overdue' | 'recent'>('overdue')
  const [visitModal, setVisitModal] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [showDupes, setShowDupes] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)

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

  const load = useCallback(async () => {
    try {
      const [accs, cls] = await Promise.all([getAccounts(), getClients()])
      setAccounts(accs)
      setClients(cls)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = accounts
    .filter(a => {
      if (filterType !== 'all' && a.account_type !== filterType) return false
      if (filterClient !== 'all') {
        const slugs = a.account_clients?.map((ac: any) => ac.client_slug) || []
        if (!slugs.includes(filterClient)) return false
      }
      if (search) {
        const s = search.toLowerCase()
        if (!a.name?.toLowerCase().includes(s) && !a.address?.toLowerCase().includes(s)) return false
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'recent') {
        const parseT = (s: string | null) => {
          if (!s) return 0
          const d = s.length > 10 && !s.endsWith('Z') && !s.includes('+') && !s.includes('-', 10) ? s + 'Z' : s
          return new Date(d).getTime()
        }
        return parseT(b.last_visited) - parseT(a.last_visited)
      }
      // overdue first
      const daysA = daysAgoMT(a.last_visited) ?? 99999
      const daysB = daysAgoMT(b.last_visited) ?? 99999
      const overdueA = a.visit_frequency_days ? daysA - a.visit_frequency_days : daysA
      const overdueB = b.visit_frequency_days ? daysB - b.visit_frequency_days : daysB
      return overdueB - overdueA
    })

  // Detect duplicates: normalize name and group accounts that match
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim()
  const dupeMap: Record<string, any[]> = {}
  for (const a of accounts) {
    const key = normalize(a.name || '')
    if (!key) continue
    dupeMap[key] = dupeMap[key] ? [...dupeMap[key], a] : [a]
  }
  const dupeGroups: any[][] = Object.values(dupeMap).filter(g => g.length > 1)

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteAccount(id)
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  const pad = isMobile ? '16px' : '32px 40px'

  return (
    <LayoutShell>
      <div style={{ padding: pad, maxWidth: '960px', margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Accounts</h1>
            <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>{accounts.length} accounts total</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setVisitModal(true)} style={{ ...btnSecondary, padding: '9px 14px', fontSize: '13px' }}>
              <MapPin size={15} /> Log Visit
            </button>
            <button onClick={() => setShowAddAccount(true)} style={{ ...btnPrimary, padding: '9px 14px', fontSize: '13px' }}>
              <Plus size={15} /> Add Account
            </button>
          </div>
        </div>

        {/* Duplicate warning */}
        {dupeGroups.length > 0 && (
          <div style={{ marginBottom: '20px', borderRadius: '10px', border: '1px solid rgba(224,82,82,0.3)', backgroundColor: 'rgba(224,82,82,0.06)', overflow: 'hidden' }}>
            <button
              onClick={() => setShowDupes(d => !d)}
              style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <AlertTriangle size={15} color="#e05252" />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#e05252', flex: 1 }}>
                {dupeGroups.length} duplicate account{dupeGroups.length !== 1 ? 's' : ''} detected — review and delete the copy
              </span>
              <span style={{ fontSize: '11px', color: '#e05252', opacity: 0.7 }}>{showDupes ? 'hide' : 'show'}</span>
            </button>
            {showDupes && (
              <div style={{ borderTop: '1px solid rgba(224,82,82,0.2)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {dupeGroups.map((group, gi) => (
                  <div key={gi}>
                    <div style={{ fontSize: '11px', color: '#e05252', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                      "{group[0].name}"
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {group.map((a: any) => {
                        const days = daysAgoMT(a.last_visited)
                        const slugs = a.account_clients?.map((ac: any) => ac.client_slug) || []
                        return (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', backgroundColor: t.bg.card, border: `1px solid ${t.border.default}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: t.text.primary }}>{a.name}</div>
                              {a.address && <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.address}</div>}
                              <div style={{ fontSize: '11px', color: t.text.muted, marginTop: '2px' }}>
                                {a.account_type === 'on_premise' ? 'On-Premise' : 'Off-Premise'}
                                {slugs.length > 0 && ` · ${slugs.length} brand${slugs.length !== 1 ? 's' : ''}`}
                                {days !== null ? ` · visited ${days}d ago` : ' · never visited'}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                              <Link href={`/accounts/${a.id}`} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', backgroundColor: t.bg.elevated, border: `1px solid ${t.border.default}`, color: t.text.secondary, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                View
                              </Link>
                              <button
                                onClick={() => setConfirmDelete({ id: a.id, name: a.name })}
                                disabled={deletingId === a.id}
                                style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', backgroundColor: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)', color: '#e05252', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', opacity: deletingId === a.id ? 0.5 : 1 }}
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search + Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.text.muted }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search accounts..."
              style={{
                backgroundColor: t.bg.card,
                border: `1px solid ${t.border.default}`,
                borderRadius: '8px',
                padding: '10px 12px 10px 36px',
                color: t.text.primary,
                fontSize: '14px',
                width: '100%',
                outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer' }}>
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {/* Type filter */}
            {['all', 'on_premise', 'off_premise'].map(v => (
              <button key={v} onClick={() => setFilterType(v)} style={{
                padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                border: `1px solid ${filterType === v ? t.gold : t.border.default}`,
                backgroundColor: filterType === v ? t.goldDim : 'transparent',
                color: filterType === v ? t.gold : t.text.secondary,
                fontWeight: filterType === v ? '600' : '400',
              }}>
                {v === 'all' ? 'All Types' : v === 'on_premise' ? 'On-Premise' : 'Off-Premise'}
              </button>
            ))}

            {/* Client filter */}
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{
              padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
              border: `1px solid ${filterClient !== 'all' ? t.gold : t.border.default}`,
              backgroundColor: filterClient !== 'all' ? t.goldDim : t.bg.card,
              color: filterClient !== 'all' ? t.gold : t.text.secondary,
              outline: 'none', appearance: 'none',
            }}>
              <option value="all">All Brands</option>
              {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>

            {/* Sort */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{
              padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
              border: `1px solid ${t.border.default}`,
              backgroundColor: t.bg.card,
              color: t.text.secondary,
              outline: 'none', appearance: 'none', marginLeft: 'auto',
            }}>
              <option value="overdue">Overdue First</option>
              <option value="name">A-Z</option>
              <option value="recent">Recently Visited</option>
            </select>
          </div>
        </div>

        {/* Results count */}
        {search && (
          <div style={{ fontSize: '12px', color: t.text.muted, marginBottom: '12px' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
          </div>
        )}

        {/* Account list */}
        {loading ? <CardSkeleton count={6} /> : filtered.length === 0 ? (
          <EmptyState icon={<MapPin size={36} />} title="No accounts found" subtitle="Try adjusting your filters" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(acc => (
              <AccountCard key={acc.id} account={acc} clients={clients} />
            ))}
          </div>
        )}

        {profile && (
          <VisitLogModal
            isOpen={visitModal}
            onClose={() => setVisitModal(false)}
            onSuccess={load}
            userId={profile.id}
            isMobile={isMobile}
          />
        )}
        {showAddAccount && (
          <AddAccountModal
            onClose={() => setShowAddAccount(false)}
            onAdded={() => { setShowAddAccount(false); load() }}
            isMobile={isMobile}
          />
        )}
        <ConfirmModal
          isOpen={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            if (!confirmDelete) return
            await handleDelete(confirmDelete.id)
            setConfirmDelete(null)
          }}
          title="Delete Account"
          message={`Are you sure you want to delete "${confirmDelete?.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={deletingId === confirmDelete?.id}
        />
      </div>
    </LayoutShell>
  )
}
