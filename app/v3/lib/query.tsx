'use client'
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, createContext, useContext } from 'react'
import {
  getClients, getAccounts, getPlacementsForClient, getOrdersForClient,
  getVisitsForClient, getContacts, getProducts, getEvents,
  logVisit, createPlacement, getTastingConsumersForClient,
  getStateRegistrations, getCampaigns,
} from '../../lib/data'
import { getSupabase } from '../../lib/supabase'
import type { Client, Account, Visit, Placement, PurchaseOrder } from '../../lib/types'

// ── Query Client ─────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60_000,   // 2 min — data is fresh for 2 minutes
        gcTime:    10 * 60_000,  // 10 min — keep in memory 10 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient()
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

export function V3QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => getQueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// ── Auth / Profile ────────────────────────────────────────────────────────────

export function useV3Profile() {
  return useQuery({
    queryKey: ['v3', 'profile'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return null
      const { data } = await sb.from('user_profiles').select('*').eq('id', user.id).single()
      // Resolve display name: DB row → auth metadata → email prefix
      const authName = (user.user_metadata?.full_name || user.user_metadata?.name || null) as string | null
      const emailPrefix = user.email
        ? user.email.split('@')[0].replace(/[._-]/g, ' ')
        : null
      const base = data ?? { id: user.id }
      return {
        ...base,
        name:      (base as any).name      || authName || null,
        full_name: (base as any).full_name || authName || emailPrefix,
      }
    },
    staleTime: 10 * 60_000,
  })
}

// ── Clients ───────────────────────────────────────────────────────────────────

export function useV3Clients() {
  return useQuery({
    queryKey: ['v3', 'clients'],
    queryFn: () => getClients(),
    staleTime: 5 * 60_000,
  })
}

// ── Accounts ─────────────────────────────────────────────────────────────────

export function useV3Accounts() {
  return useQuery({
    queryKey: ['v3', 'accounts'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('accounts')
        .select('id, name, address, account_type, priority, visit_frequency_days, last_visited, notes, website, instagram, phone')
        .order('name')
        .limit(2000)
      if (error) throw error
      return (data ?? []) as Account[]
    },
    staleTime: 10 * 60_000,
  })
}

// ── Visits (all, for dashboard/today) ────────────────────────────────────────

export function useV3RecentVisits(days = 30) {
  return useQuery({
    queryKey: ['v3', 'visits', 'recent', days],
    queryFn: async () => {
      const sb = getSupabase()
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const { data, error } = await sb
        .from('visits')
        .select('id, account_id, user_id, client_slug, visited_at, status, notes, accounts(id, name)')
        .gte('visited_at', since)
        .order('visited_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as (Visit & { accounts: { id: string; name: string } | null })[]
    },
  })
}

// ── Follow-up queue (accounts with open follow-ups) ──────────────────────────

export function useV3FollowUps() {
  return useQuery({
    queryKey: ['v3', 'followups'],
    queryFn: async () => {
      const sb = getSupabase()
      const cutoff = new Date(Date.now() - 60 * 86400000).toISOString()
      const { data, error } = await sb
        .from('visits')
        .select('id, account_id, client_slug, visited_at, status, notes, accounts(id, name, address, visit_frequency_days, last_visited)')
        .in('status', ['Will Order Soon', 'Needs Follow Up'])
        .gte('visited_at', cutoff)
        .order('visited_at', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })
}

// ── Overdue accounts ──────────────────────────────────────────────────────────

export function useV3OverdueAccounts() {
  const { data: accounts, isLoading } = useV3Accounts()
  if (!accounts) return { data: [], isLoading }
  const today = Date.now()
  const overdue = accounts
    .filter(a => {
      if (!a.visit_frequency_days) return false
      if (!a.last_visited) return true  // never visited = overdue
      const daysAgo = (today - new Date(a.last_visited).getTime()) / 86400000
      return daysAgo > a.visit_frequency_days
    })
    .map(a => {
      const neverVisited = !a.last_visited
      const daysAgo = neverVisited ? null : Math.floor((today - new Date(a.last_visited).getTime()) / 86400000)
      const overdueDays = daysAgo !== null ? daysAgo - (a.visit_frequency_days ?? 30) : null
      return { ...a, daysAgo, overdueDays, neverVisited }
    })
    .sort((a, b) => (b.overdueDays ?? 9999) - (a.overdueDays ?? 9999))
  return { data: overdue, isLoading: false }
}

// ── Overdue accounts (targeted query — doesn't load all 2000 accounts) ────────
// Use this on the Today dashboard instead of useV3OverdueAccounts

export function useV3OverdueQuery() {
  return useQuery({
    queryKey: ['v3', 'overdue', 'targeted'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('accounts')
        .select('id, name, visit_frequency_days, last_visited, address')
        .not('visit_frequency_days', 'is', null)
        .order('last_visited', { ascending: true, nullsFirst: true })
        .limit(300)
      if (error) throw error
      const today = Date.now()
      return ((data ?? []) as any[])
        .filter(a => {
          if (!a.last_visited) return true
          const daysAgo = (today - new Date(a.last_visited).getTime()) / 86400000
          return daysAgo > (a.visit_frequency_days ?? 30)
        })
        .map(a => {
          const neverVisited = !a.last_visited
          const daysAgo = neverVisited ? null : Math.floor((today - new Date(a.last_visited).getTime()) / 86400000)
          const overdueDays = daysAgo !== null ? daysAgo - (a.visit_frequency_days ?? 30) : null
          return { ...a, daysAgo, overdueDays, neverVisited }
        })
        .sort((a: any, b: any) => (b.overdueDays ?? 9999) - (a.overdueDays ?? 9999))
    },
    staleTime: 5 * 60_000,
  })
}

// ── Commission MTD (lightweight — no line items join) ─────────────────────────

export function useV3CommissionMTD() {
  return useQuery({
    queryKey: ['v3', 'commission', 'mtd'],
    queryFn: async () => {
      const sb = getSupabase()
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const { data, error } = await sb
        .from('purchase_orders')
        .select('commission_amount, total_amount, status, sent_at')
        .in('status', ['sent', 'fulfilled'])
        .gte('sent_at', monthStart)
        .limit(200)
      if (error) throw error
      return (data ?? []).reduce((sum, o) => sum + (Number(o.commission_amount) || 0), 0)
    },
    staleTime: 5 * 60_000,
  })
}

// ── Placements ────────────────────────────────────────────────────────────────

export function useV3Placements() {
  return useQuery({
    queryKey: ['v3', 'placements'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('placements')
        .select('*, accounts(id, name)')
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      return (data ?? []) as (Placement & { accounts: { id: string; name: string } | null })[]
    },
  })
}

// ── Orders ────────────────────────────────────────────────────────────────────

export function useV3Orders() {
  return useQuery({
    queryKey: ['v3', 'orders'],
    queryFn: async () => {
      const sb = getSupabase()
      // No po_line_items join — total_amount is stored on creation and is accurate.
      // The nested join was causing query timeouts due to RLS row scans on each order.
      const { data, error } = await sb
        .from('purchase_orders')
        .select('id, po_number, client_slug, account_id, deliver_to_name, order_type, status, total_amount, commission_amount, notes, sent_at, created_at, distributor_email, accounts(id, name)')
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as (PurchaseOrder & { accounts: any })[]
    },
    staleTime: 2 * 60_000,
  })
}

// ── Orders with line items (used only where line item detail is needed) ────────

export function useV3OrdersWithItems(orderId: string) {
  return useQuery({
    queryKey: ['v3', 'order', orderId, 'items'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('po_line_items')
        .select('id, product_name, quantity, unit_price, total')
        .eq('purchase_order_id', orderId)
        .order('id')
      if (error) throw error
      return data ?? []
    },
    enabled: !!orderId,
    staleTime: 5 * 60_000,
  })
}

// ── Visit streak ──────────────────────────────────────────────────────────────

export function useV3Streak() {
  return useQuery({
    queryKey: ['v3', 'streak'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return { current: 0, best: 0 }
      const { data } = await sb
        .from('visits')
        .select('visited_at')
        .eq('user_id', user.id)
        .order('visited_at', { ascending: false })
        .limit(200)
      if (!data?.length) return { current: 0, best: 0 }
      const days = new Set(data.map(v => v.visited_at.slice(0, 10)))
      let current = 0, best = 0; const check = new Date()
      for (let i = 0; i < 180; i++) {
        const d = check.toISOString().slice(0, 10)
        check.setDate(check.getDate() - 1)
        if (days.has(d)) { current++; best = Math.max(best, current) }
        else if (i > 0) break
      }
      return { current, best }
    },
    staleTime: 5 * 60_000,
  })
}

// ── Territory coverage (accounts visited this month / total tracked) ─────────

export function useV3TerritoryCoverage() {
  return useQuery({
    queryKey: ['v3', 'coverage'],
    queryFn: async () => {
      const sb = getSupabase()
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const [accountsRes, visitsRes] = await Promise.all([
        sb.from('accounts').select('id').not('visit_frequency_days', 'is', null),
        sb.from('visits').select('account_id').gte('visited_at', monthStart).limit(5000),
      ])
      if (accountsRes.error) throw accountsRes.error
      if (visitsRes.error) throw visitsRes.error
      const total = accountsRes.data?.length ?? 0
      const visitedIds = new Set((visitsRes.data ?? []).map(v => v.account_id))
      const visited = (accountsRes.data ?? []).filter(a => visitedIds.has(a.id)).length
      return { visited, total, pct: total > 0 ? Math.round((visited / total) * 100) : 0 }
    },
    staleTime: 5 * 60_000,
  })
}

// ── All internal team profiles ───────────────────────────────────────────────

export function useV3AllProfiles() {
  return useQuery({
    queryKey: ['v3', 'profiles', 'all'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('user_profiles')
        .select('id, name, full_name, role')
        .in('role', ['owner', 'admin', 'rep'])
        .order('name')
      if (error) throw error
      return (data ?? []) as { id: string; name: string | null; full_name: string | null; role: string }[]
    },
    staleTime: 10 * 60_000,
  })
}

// ── Team leaderboard (visits last 7 days per rep) ─────────────────────────────

export function useV3TeamLeaderboard() {
  return useQuery({
    queryKey: ['v3', 'leaderboard'],
    queryFn: async () => {
      const sb = getSupabase()
      const since = new Date(Date.now() - 7 * 86400000).toISOString()
      const [visitsRes, profilesRes] = await Promise.all([
        sb.from('visits').select('user_id').gte('visited_at', since).limit(2000),
        sb.from('user_profiles').select('id, name, full_name').neq('role', 'portal'),
      ])
      if (visitsRes.error) throw visitsRes.error
      const counts: Record<string, number> = {}
      for (const v of visitsRes.data ?? []) {
        if (!v.user_id) continue
        counts[v.user_id] = (counts[v.user_id] ?? 0) + 1
      }
      const profiles = profilesRes.data ?? []
      return profiles
        .map(p => ({ id: p.id, name: (p.name || p.full_name || 'Rep').split(' ')[0], count: counts[p.id] ?? 0 }))
        .filter(p => p.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
    },
    staleTime: 5 * 60_000,
  })
}

// ── Mutation: advance placement status ────────────────────────────────────────

const PLAC_NEXT: Record<string, string> = {
  committed: 'ordered',
  ordered: 'on_shelf',
  on_shelf: 'reordering',
}

export function useAdvancePlacement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const next = PLAC_NEXT[status]
      if (!next) throw new Error(`No next status for ${status}`)
      const sb = getSupabase()
      const { error } = await sb.from('placements').update({ status: next }).eq('id', id)
      if (error) throw error
      return next
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'placements'] })
      qc.invalidateQueries({ queryKey: ['v3', 'account'] })
    },
  })
}

// ── Tasks (current user's open tasks) ────────────────────────────────────────

export function useV3MyTasks() {
  return useQuery({
    queryKey: ['v3', 'tasks', 'mine'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return []
      const { data, error } = await sb
        .from('tasks')
        .select('id, title, description, priority, due_date, completed, account_id, client_slug, accounts(id, name)')
        .or(`user_id.eq.${user.id},assigned_to.eq.${user.id}`)
        .eq('completed', false)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as any[]
    },
    staleTime: 2 * 60_000,
  })
}

// ── At-risk placements (stalled in pipeline) ─────────────────────────────────

export function useV3AtRiskPlacements() {
  return useQuery({
    queryKey: ['v3', 'placements', 'atrisk'],
    queryFn: async () => {
      const sb = getSupabase()
      const committedCutoff = new Date(Date.now() - 30 * 86400000).toISOString()
      const orderedCutoff   = new Date(Date.now() - 14 * 86400000).toISOString()
      const { data, error } = await sb
        .from('placements')
        .select('id, product_name, status, client_slug, created_at, updated_at, account_id, accounts(id, name)')
        .is('lost_at', null)
        .or(`and(status.eq.committed,created_at.lt.${committedCutoff}),and(status.eq.ordered,updated_at.lt.${orderedCutoff})`)
        .order('created_at', { ascending: true })
        .limit(10)
      if (error) throw error
      return (data ?? []) as any[]
    },
    staleTime: 5 * 60_000,
  })
}

// ── Mutation: log visit ───────────────────────────────────────────────────────

export function useLogVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: Omit<Parameters<typeof logVisit>[0], 'user_id'>) => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      return logVisit({ ...args, user_id: user.id })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'visits'] })
      qc.invalidateQueries({ queryKey: ['v3', 'followups'] })
      qc.invalidateQueries({ queryKey: ['v3', 'streak'] })
      qc.invalidateQueries({ queryKey: ['v3', 'accounts'] })
    },
  })
}

// ── Today's planner stops ────────────────────────────────────────────────────

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useV3TodayStops() {
  const date = todayStr()
  return useQuery({
    queryKey: ['v3', 'planner', date],
    queryFn: async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return []
      const { data, error } = await sb
        .from('planner_stops')
        .select('id, account_id, title, notes, stop_order, accounts(id, name, address)')
        .eq('user_id', user.id)
        .eq('plan_date', date)
        .order('stop_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as any[]
    },
    staleTime: 60_000,
  })
}

// ── Win rate + hot hand (last 7 days) ────────────────────────────────────────

export function useV3WinRate() {
  return useQuery({
    queryKey: ['v3', 'winrate'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return { rate: null as number | null, hotHand: false, recent: 0, wins: 0 }
      const since = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data } = await sb
        .from('visits')
        .select('status')
        .eq('user_id', user.id)
        .gte('visited_at', since)
        .limit(200)
      if (!data?.length) return { rate: null, hotHand: false, recent: 0, wins: 0 }
      const WIN = new Set(['New Placement', 'Menu Feature Won', 'Just Ordered', 'Will Order Soon'])
      const wins = data.filter(v => WIN.has(v.status)).length
      const rate = Math.round((wins / data.length) * 100)
      // Hot hand: 3+ wins in last 7 days
      const hotHand = wins >= 3
      return { rate, hotHand, recent: data.length, wins }
    },
    staleTime: 5 * 60_000,
  })
}

// ── Potential commission today (accounts on route × avg order value) ──────────
// Simple estimate: planner stops that haven't been visited today ×
// mean order value for that rep's recent wins. Returns null if no data.
export function useV3PotentialToday() {
  return useQuery({
    queryKey: ['v3', 'potential-today'],
    queryFn: async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return null
      const date = todayStr()
      const [stopsRes, ordersRes] = await Promise.all([
        sb.from('planner_stops').select('id').eq('user_id', user.id).eq('plan_date', date),
        sb.from('purchase_orders')
          .select('total_amount, commission_amount, client_slug')
          .in('status', ['sent', 'fulfilled'])
          .order('created_at', { ascending: false })
          .limit(50),
      ])
      const stopCount = stopsRes.data?.length ?? 0
      if (stopCount === 0) return null
      const orders = ordersRes.data ?? []
      if (!orders.length) return null
      const avgCommission = orders.reduce((s, o) => s + (o.commission_amount ?? 0), 0) / orders.length
      return { stops: stopCount, potential: Math.round(stopCount * avgCommission) }
    },
    staleTime: 2 * 60_000,
  })
}
