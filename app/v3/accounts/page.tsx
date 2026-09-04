'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Plus, SlidersHorizontal } from 'lucide-react'
import { v3, v3input, v3btnPrimary, v3btnSecondary, v3label } from '../lib/theme'
import {
  useV3Accounts, useV3Orders, useV3Placements,
  useV3RecentVisits, useV3Clients,
} from '../lib/query'
import { useV3Toast } from '../lib/context'
import { buildDemandMap } from '../lib/demand'
import {
  buildIntelMap, compareByUrgency,
  SIGNAL_COLOR, SIGNAL_LABEL,
  type AccountSignal, type AccountIntel,
} from '../lib/stage'
import { relativeTimeStr } from '../../lib/formatters'
import { getSupabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

// ── AddAccountModal ───────────────────────────────────────────────────────────

function AddAccountModal({ onClose }: { onClose: () => void }) {
  const qc    = useQueryClient()
  const toast = useV3Toast()
  const [name,    setName]    = useState('')
  const [address, setAddress] = useState('')
  const [type,    setType]    = useState<'on_premise' | 'off_premise'>('on_premise')
  const [saving,  setSaving]  = useState(false)

  async function handleSave() {
    if (!name.trim()) { toast.show('Account name is required', 'error'); return }
    setSaving(true)
    try {
      const sb = getSupabase()
      const { error } = await sb.from('accounts').insert({
        name:         name.trim(),
        address:      address.trim() || null,
        account_type: type,
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['v3', 'accounts'] })
      toast.show('Account added')
      onClose()
    } catch (err: any) {
      console.error('account.create', err)
      toast.show('Failed to add account', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: v3.bg.overlay }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: 480, background: v3.bg.sheet, borderRadius: '12px 12px 0 0', padding: '24px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: v3.type.lg, fontWeight: 700, color: v3.text.primary, fontFamily: v3.font.ui }}>Add Account</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: v3.text.muted, cursor: 'pointer', padding: 4, fontSize: 18 }}>✕</button>
        </div>
        <div>
          <label style={v3label}>Account Name *</label>
          <input style={v3input} value={name} onChange={e => setName(e.target.value)} placeholder="Bar, restaurant, or liquor store" autoFocus />
        </div>
        <div>
          <label style={v3label}>Address</label>
          <input style={v3input} value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, City, State" />
        </div>
        <div>
          <label style={v3label}>Type</label>
          <select style={{ ...v3input, paddingRight: 8 }} value={type} onChange={e => setType(e.target.value as any)}>
            <option value="on_premise">On Premise</option>
            <option value="off_premise">Off Premise</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{ ...v3btnSecondary, flex: 1 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ ...v3btnPrimary, flex: 2, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Adding…' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Signal dot ────────────────────────────────────────────────────────────────

function SignalDot({ signal }: { signal: AccountSignal }) {
  const color  = SIGNAL_COLOR[signal]
  const urgent = signal === 'urgent' || signal === 'cooling'
  return (
    <div style={{
      width: 7, height: 7, borderRadius: '50%',
      background: color, flexShrink: 0,
      boxShadow: urgent ? `0 0 5px ${color}` : undefined,
    }} title={SIGNAL_LABEL[signal]} />
  )
}

// ── Placement status chip ─────────────────────────────────────────────────────
// Plain language — no pipeline jargon

function PlacementChip({ intel }: { intel: AccountIntel }) {
  if (intel.reorderingCount > 0) {
    const color = v3.amber
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color, background: color + '16', padding: '2px 7px', borderRadius: v3.radius.sm, border: `1px solid ${color}28`, letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {intel.reorderingCount === 1 ? '1 brand reordering' : `${intel.reorderingCount} brands reordering`}
      </span>
    )
  }
  if (intel.activePlacements > 0) {
    const color = '#6878b4'
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color, background: color + '16', padding: '2px 7px', borderRadius: v3.radius.sm, border: `1px solid ${color}28`, letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {intel.activePlacements === 1 ? '1 brand placed' : `${intel.activePlacements} brands placed`}
      </span>
    )
  }
  return null
}

// ── Account row ───────────────────────────────────────────────────────────────

function AccountRow({ account, intel }: { account: any; intel: AccountIntel }) {
  const { signal, nextAction, lastVisitDaysAgo, daysUntilDue, isOverdue } = intel

  return (
    <Link href={`/v3/accounts/${account.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{ padding: '13px 16px', borderBottom: `1px solid ${v3.border.subtle}`, background: 'transparent', transition: 'background 100ms' }}
        onMouseEnter={e => (e.currentTarget.style.background = v3.bg.surface)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Row 1: name + placement status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <SignalDot signal={signal} />
          <span style={{ fontSize: v3.type.base, fontWeight: 600, color: v3.text.primary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {account.name}
          </span>
          <PlacementChip intel={intel} />
        </div>

        {/* Row 2: next action — the reason to go */}
        <div style={{ paddingLeft: 15 }}>
          <p style={{ margin: '0 0 4px', fontSize: v3.type.sm, color: v3.text.secondary, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {nextAction}
          </p>

          {/* Row 3: meta — address, visit timing, type */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {account.address && (
              <span style={{ fontSize: v3.type.xs, color: v3.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                {account.address.split(',').slice(-2).join(',').trim()}
              </span>
            )}
            {isOverdue ? (
              <span style={{ fontSize: v3.type.xs, color: SIGNAL_COLOR['overdue'], fontWeight: 600, flexShrink: 0 }}>
                {Math.abs(daysUntilDue)}d overdue
              </span>
            ) : lastVisitDaysAgo !== null ? (
              <span style={{ fontSize: v3.type.xs, color: v3.text.muted, flexShrink: 0 }}>
                visited {lastVisitDaysAgo === 0 ? 'today' : `${lastVisitDaysAgo}d ago`}
              </span>
            ) : (
              <span style={{ fontSize: v3.type.xs, color: v3.text.muted, flexShrink: 0 }}>never visited</span>
            )}
            {account.account_type && (
              <span style={{ fontSize: v3.type.xs, color: 'rgba(255,255,255,0.20)', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                {account.account_type === 'on_premise' ? 'On' : 'Off'}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Filter pills ──────────────────────────────────────────────────────────────

type AccountFilter = 'all' | 'attention' | 'placed' | 'no_placement'
type SortKey       = 'urgency' | 'visited' | 'az'
type TypeFilter    = 'all' | 'on_premise' | 'off_premise'

const ATTENTION_SIGNALS = new Set<AccountSignal>(['urgent', 'cooling', 'follow_up', 'overdue'])

function filterCounts(intelMap: Record<string, AccountIntel>, accountIds: string[]) {
  let attention = 0, placed = 0, no_placement = 0
  for (const id of accountIds) {
    const intel = intelMap[id]
    if (!intel) continue
    if (ATTENTION_SIGNALS.has(intel.signal)) attention++
    if (intel.activePlacements > 0)          placed++
    else                                      no_placement++
  }
  return { attention, placed, no_placement }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const { data: accounts   = [], isLoading } = useV3Accounts()
  const { data: orders     = [] }             = useV3Orders()
  const { data: placements = [] }             = useV3Placements()
  const { data: visits     = [] }             = useV3RecentVisits(90)
  const { data: clients    = [] }             = useV3Clients()

  const [search,        setSearch]        = useState('')
  const [typeFilter,    setTypeFilter]    = useState<TypeFilter>('all')
  const [sort,          setSort]          = useState<SortKey>('urgency')
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all')
  const [showAdd,       setShowAdd]       = useState(false)
  const [showFilter,    setShowFilter]    = useState(false)

  const clientSlugs = useMemo(() => clients.map(c => c.slug), [clients])
  const accountIds  = useMemo(() => accounts.map(a => a.id), [accounts])

  const demandMap = useMemo(() => {
    if (!accountIds.length || !clientSlugs.length) return {}
    return buildDemandMap(orders, accountIds, clientSlugs)
  }, [orders, accountIds, clientSlugs])

  const intelMap = useMemo(() => {
    if (!accountIds.length) return {}
    return buildIntelMap({
      accountIds,
      allVisits:    visits,
      allPlacements: placements,
      allOrders:    orders,
      clientSlugs,
      demandMap,
    })
  }, [accountIds, visits, placements, orders, clientSlugs, demandMap])

  const counts = useMemo(() => filterCounts(intelMap, accountIds), [intelMap, accountIds])

  const sorted = useMemo(() => {
    let list = [...accounts]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.address ?? '').toLowerCase().includes(q)
      )
    }

    if (typeFilter !== 'all') {
      list = list.filter(a => a.account_type === typeFilter)
    }

    if (accountFilter === 'attention') {
      list = list.filter(a => ATTENTION_SIGNALS.has(intelMap[a.id]?.signal as AccountSignal))
    } else if (accountFilter === 'placed') {
      list = list.filter(a => (intelMap[a.id]?.activePlacements ?? 0) > 0)
    } else if (accountFilter === 'no_placement') {
      list = list.filter(a => (intelMap[a.id]?.activePlacements ?? 0) === 0)
    }

    list.sort((a, b) => {
      const ia = intelMap[a.id]
      const ib = intelMap[b.id]
      if (!ia || !ib) return 0
      switch (sort) {
        case 'urgency': return compareByUrgency(ia, ib)
        case 'az':      return a.name.localeCompare(b.name)
        case 'visited': {
          const da = ia.lastVisitDaysAgo ?? 9999
          const db = ib.lastVisitDaysAgo ?? 9999
          return da - db
        }
      }
    })

    return list
  }, [accounts, search, typeFilter, accountFilter, sort, intelMap])

  const filterLabel = accountFilter === 'attention'    ? 'NEEDS ATTENTION'
    : accountFilter === 'placed'       ? 'HAS PLACEMENT'
    : accountFilter === 'no_placement' ? 'NO PLACEMENT'
    : ''

  const FILTER_OPTIONS: { id: AccountFilter; label: string; count: number; color: string }[] = [
    { id: 'all',          label: 'All',             count: accounts.length, color: v3.text.muted },
    { id: 'attention',    label: 'Needs Attention', count: counts.attention,    color: v3.status.danger },
    { id: 'placed',       label: 'Has Placement',   count: counts.placed,       color: v3.amber },
    { id: 'no_placement', label: 'No Placement',    count: counts.no_placement, color: 'rgba(255,255,255,0.40)' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: v3.bg.page, fontFamily: v3.font.ui }}>

      {/* ── Sticky header ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: v3.bg.page, borderBottom: `1px solid ${v3.border.subtle}` }}>

        {/* Title + actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px' }}>
          <span style={{ fontSize: v3.type.xl, fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Accounts</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowFilter(f => !f)}
              style={{
                background: showFilter ? v3.amberDim : 'rgba(255,255,255,0.04)',
                border: `1px solid ${showFilter ? v3.amber + '44' : v3.border.default}`,
                borderRadius: v3.radius.md, color: showFilter ? v3.amber : v3.text.secondary,
                padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12, fontFamily: v3.font.ui,
              }}>
              <SlidersHorizontal size={13} />
            </button>
            <button
              onClick={() => setShowAdd(true)}
              style={{ ...v3btnPrimary, padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', padding: '0 16px 10px' }}>
          <Search size={13} style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: v3.text.muted, pointerEvents: 'none' }} />
          <input
            style={{ ...v3input, paddingLeft: 32, fontSize: v3.type.md }}
            placeholder="Search accounts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Sort + type filters (collapsible) */}
        {showFilter && (
          <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, borderTop: `1px solid ${v3.border.subtle}`, paddingTop: 10 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: v3.text.muted, fontWeight: 700, letterSpacing: '0.1em', marginRight: 2 }}>TYPE</span>
              {(['all', 'on_premise', 'off_premise'] as TypeFilter[]).map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  style={{ fontSize: 11, padding: '4px 9px', borderRadius: v3.radius.sm, cursor: 'pointer', fontFamily: v3.font.ui, fontWeight: 600, background: typeFilter === t ? v3.amberDim : 'rgba(255,255,255,0.04)', color: typeFilter === t ? v3.amber : v3.text.muted, border: `1px solid ${typeFilter === t ? v3.amber + '33' : v3.border.subtle}` }}>
                  {t === 'all' ? 'All' : t === 'on_premise' ? 'On Premise' : 'Off Premise'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: v3.text.muted, fontWeight: 700, letterSpacing: '0.1em', marginRight: 2 }}>SORT</span>
              {([['urgency', 'Priority'], ['visited', 'Recent'], ['az', 'A–Z']] as [SortKey, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setSort(k)}
                  style={{ fontSize: 11, padding: '4px 9px', borderRadius: v3.radius.sm, cursor: 'pointer', fontFamily: v3.font.ui, fontWeight: 600, background: sort === k ? v3.amberDim : 'rgba(255,255,255,0.04)', color: sort === k ? v3.amber : v3.text.muted, border: `1px solid ${sort === k ? v3.amber + '33' : v3.border.subtle}` }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status filter pills */}
        {!search && (
          <div style={{ padding: '8px 16px 10px', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' as any, borderTop: `1px solid ${v3.border.subtle}` }}>
            {FILTER_OPTIONS.map(f => {
              const isActive = accountFilter === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => setAccountFilter(isActive && f.id !== 'all' ? 'all' : f.id)}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 600, fontFamily: v3.font.ui,
                    padding: '5px 10px', borderRadius: v3.radius.sm, cursor: 'pointer',
                    background: isActive ? f.color + '18' : 'transparent',
                    color: isActive ? f.color : v3.text.muted,
                    border: `1px solid ${isActive ? f.color + '45' : v3.border.subtle}`,
                    transition: 'all 120ms',
                  }}>
                  {f.id !== 'all' && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? f.color : 'rgba(255,255,255,0.25)', display: 'inline-block', flexShrink: 0 }} />
                  )}
                  {f.label}
                  <span style={{ opacity: 0.6, fontFamily: v3.font.mono }}>{f.count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Count ── */}
      <div style={{ padding: '7px 16px', fontSize: v3.type.xs, color: v3.text.muted, fontWeight: 600, letterSpacing: '0.06em' }}>
        {isLoading
          ? 'Loading…'
          : `${sorted.length.toLocaleString()} ACCOUNTS${filterLabel ? ` · ${filterLabel}` : ''}`
        }
      </div>

      {/* ── List ── */}
      <div style={{ paddingBottom: 120 }}>
        {sorted.map(account => {
          const intel = intelMap[account.id]
          if (!intel) return null
          return <AccountRow key={account.id} account={account} intel={intel} />
        })}

        {!isLoading && sorted.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: v3.text.muted, fontSize: v3.type.base }}>
            {search ? `No accounts matching "${search}"` : 'No accounts match these filters'}
          </div>
        )}
      </div>

      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}
