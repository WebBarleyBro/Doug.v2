'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Home, MapPin, Users, Calendar, BarChart3, DollarSign,
  ShoppingCart, TrendingUp, Megaphone, Shield, Package,
  BookOpen, ChevronRight, ChevronLeft, Search, Bell, X, Menu, Plus,
  LogOut, Map, ClipboardList, UserCircle, FolderOpen, Upload,
} from 'lucide-react'
import { t, btnPrimary } from './lib/theme'
import { signOut } from './lib/auth'
import { getSupabase } from './lib/supabase'
import VisitLogModal from './components/VisitLogModal'
import type { UserProfile } from './lib/types'

// ─── App Context ─────────────────────────────────────────────────────────

interface AppCtx {
  profile: UserProfile | null
  isMobile: boolean
  showVisitLog: boolean
  setShowVisitLog: (v: boolean) => void
}
const AppContext = createContext<AppCtx>({
  profile: null,
  isMobile: false,
  showVisitLog: false,
  setShowVisitLog: () => {},
})
export const useApp = () => useContext(AppContext)

// ─── Nav items ────────────────────────────────────────────────────────────

const ownerNav = [
  { href: '/',            label: 'Dashboard',   icon: Home },
  { href: '/planner',     label: 'Day Planner', icon: Map },
  { href: '/accounts',    label: 'Accounts',    icon: MapPin },
  { href: '/clients',     label: 'Clients',     icon: Users },
  { href: '/placements',  label: 'Placements',  icon: Package },
  { href: '/orders',      label: 'Orders',      icon: ShoppingCart },
  { href: '/finance',     label: 'Finance',     icon: DollarSign },
  { href: '/analytics',   label: 'Analytics',   icon: BarChart3 },
  { href: '/calendar',    label: 'Calendar',    icon: Calendar },
  { href: '/contacts',    label: 'Contacts',    icon: UserCircle },
  { href: '/marketing',   label: 'Marketing',   icon: Megaphone },
  { href: '/compliance',  label: 'Compliance',  icon: Shield },
  { href: '/intern-hub',  label: 'Intern Hub',  icon: BookOpen },
]

const repNav = [
  { href: '/',           label: 'Dashboard',  icon: Home },
  { href: '/planner',    label: 'Day Planner',icon: Map },
  { href: '/accounts',   label: 'Accounts',   icon: MapPin },
  { href: '/clients',    label: 'Clients',    icon: Users },
  { href: '/placements', label: 'Placements', icon: Package },
  { href: '/orders',     label: 'Orders',     icon: ShoppingCart },
  { href: '/calendar',   label: 'Calendar',   icon: Calendar },
  { href: '/contacts',   label: 'Contacts',   icon: UserCircle },
]

const internNav = [
  { href: '/intern',           label: 'My Work',   icon: Home },
  { href: '/intern/tasks',     label: 'Tasks',     icon: ClipboardList },
  { href: '/intern/projects',  label: 'Projects',  icon: FolderOpen },
  { href: '/intern/assets',    label: 'Assets',    icon: Upload },
  { href: '/intern/resources', label: 'Resources', icon: BookOpen },
]

// Mobile bottom nav (4 tabs + center FAB)
const mobileBottomNav = [
  { href: '/',          label: 'Home',     icon: Home },
  { href: '/accounts',  label: 'Accounts', icon: MapPin },
  { href: '/planner',   label: 'Planner',  icon: Map },
  { href: '/clients',   label: 'Clients',  icon: Users },
]

// Grouped nav for desktop sidebar
type NavItem = { href: string; label: string; icon: any }
type NavGroup = { label: string; items: NavItem[] }

const ownerNavGroups: NavGroup[] = [
  { label: 'FIELD', items: [
    { href: '/',           label: 'Dashboard',   icon: Home },
    { href: '/planner',    label: 'Day Planner', icon: Map },
    { href: '/accounts',   label: 'Accounts',    icon: MapPin },
    { href: '/clients',    label: 'Clients',     icon: Users },
  ]},
  { label: 'SALES', items: [
    { href: '/placements', label: 'Placements',  icon: Package },
    { href: '/orders',     label: 'Orders',      icon: ShoppingCart },
    { href: '/finance',    label: 'Finance',     icon: DollarSign },
  ]},
  { label: 'INTEL', items: [
    { href: '/analytics',  label: 'Analytics',   icon: BarChart3 },
    { href: '/calendar',   label: 'Calendar',    icon: Calendar },
    { href: '/contacts',   label: 'Contacts',    icon: UserCircle },
    { href: '/marketing',  label: 'Marketing',   icon: Megaphone },
    { href: '/compliance', label: 'Compliance',  icon: Shield },
  ]},
  { label: 'TEAM', items: [
    { href: '/intern-hub', label: 'Intern Hub',  icon: BookOpen },
  ]},
]

const repNavGroups: NavGroup[] = [
  { label: 'FIELD', items: [
    { href: '/',           label: 'Dashboard',   icon: Home },
    { href: '/planner',    label: 'Day Planner', icon: Map },
    { href: '/accounts',   label: 'Accounts',    icon: MapPin },
    { href: '/clients',    label: 'Clients',     icon: Users },
  ]},
  { label: 'SALES', items: [
    { href: '/placements', label: 'Placements',  icon: Package },
    { href: '/orders',     label: 'Orders',      icon: ShoppingCart },
  ]},
  { label: 'INTEL', items: [
    { href: '/calendar',   label: 'Calendar',    icon: Calendar },
    { href: '/contacts',   label: 'Contacts',    icon: UserCircle },
  ]},
]

// ─── Desktop Sidebar ─────────────────────────────────────────────────────

function DesktopSidebar({ profile, navGroups, collapsed, setCollapsed }: {
  profile: UserProfile
  navGroups: NavGroup[]
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}) {
  const pathname = usePathname()
  const router = useRouter()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <aside style={{
      width: collapsed ? '60px' : '220px',
      minHeight: '100vh',
      backgroundColor: t.bg.sidebar,
      borderRight: `1px solid ${t.border.default}`,
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 200ms ease',
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 50,
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '14px 0' : '14px 12px 14px 14px',
        borderBottom: `1px solid ${t.border.subtle}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0, paddingLeft: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src="https://res.cloudinary.com/dhg83nxda/image/upload/v1776653105/Doug_Logo_2_1_okgk0i.png"
              alt="Doug logo"
              style={{ height: '36px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#F5F0E8', letterSpacing: '-0.03em', lineHeight: 1 }}>Doug</div>
              <div style={{ fontSize: '9px', color: t.text.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '4px' }}>by Barley Bros</div>
            </div>
          </div>
        )}
        {collapsed && (
          <button onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} title="Expand sidebar">
            <img
              src="https://res.cloudinary.com/dhg83nxda/image/upload/v1776653105/Doug_Logo_2_1_okgk0i.png"
              alt="D"
              style={{ height: '24px', width: 'auto', objectFit: 'contain' }}
            />
          </button>
        )}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '6px', flexShrink: 0, display: 'flex', borderRadius: '6px' }} title="Collapse sidebar">
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {/* Nav links — grouped */}
      <nav style={{ flex: 1, padding: '4px 0', overflowY: 'auto' }}>
        {navGroups.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && (
              <div style={{ height: '1px', backgroundColor: t.border.subtle, margin: collapsed ? '6px 0' : '6px 10px' }} />
            )}
            {!collapsed && (
              <div style={{ padding: '8px 16px 4px', fontSize: '9px', fontWeight: '700', color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {group.label}
              </div>
            )}
            {group.items.map(item => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link key={item.href} href={item.href}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: collapsed ? '10px 0' : '8px 14px 8px 16px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    color: active ? t.gold : t.text.secondary,
                    textDecoration: 'none', fontSize: '13px',
                    fontWeight: active ? '600' : '400',
                    backgroundColor: active ? t.goldDim : 'transparent',
                    borderLeft: active ? `3px solid ${t.gold}` : '3px solid transparent',
                    transition: 'all 100ms ease',
                  }}>
                  <Icon size={16} strokeWidth={active ? 2.5 : 1.8} style={{ flexShrink: 0 }} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div style={{
        padding: collapsed ? '12px 0' : '12px 16px',
        borderTop: `1px solid ${t.border.subtle}`,
        flexShrink: 0,
      }}>
        {!collapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              backgroundColor: t.goldDim,
              border: `1px solid ${t.goldBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', color: t.gold, fontWeight: '600', flexShrink: 0,
            }}>
              {profile.name?.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile.name}
              </div>
              <div style={{ fontSize: '10px', color: t.text.muted, textTransform: 'capitalize' }}>
                {profile.role}
              </div>
            </div>
            <button onClick={() => signOut().then(() => router.push('/login'))}
              style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '4px' }}>
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer', padding: '4px', display: 'flex' }} title="Expand sidebar">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

// ─── Mobile Header + Bottom Nav ───────────────────────────────────────────

function MobileHeader({ profile, onMenuOpen }: { profile: UserProfile; onMenuOpen: () => void }) {
  const pathname = usePathname()

  const titleMap: Record<string, string> = {
    '/': 'Dashboard',
    '/planner': 'Day Planner',
    '/accounts': 'Accounts',
    '/clients': 'Clients',
    '/placements': 'Placements',
    '/orders': 'Orders',
    '/finance': 'Finance',
    '/analytics': 'Analytics',
    '/calendar': 'Calendar',
    '/contacts': 'Contacts',
    '/marketing': 'Marketing',
    '/compliance': 'Compliance',
    '/intern-hub': 'Intern Hub',
    '/intern': 'My Work',
  }
  const title = titleMap[pathname] || 'Doug'

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      backgroundColor: t.bg.sidebar,
      borderBottom: `1px solid ${t.border.default}`,
      padding: '0 16px',
      height: '52px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <img
          src="https://res.cloudinary.com/dhg83nxda/image/upload/v1776653105/Doug_Logo_2_1_okgk0i.png"
          alt="Doug"
          style={{ height: '28px', width: 'auto', objectFit: 'contain' }}
        />
        <span style={{ fontSize: '15px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.01em' }}>
          {title}
        </span>
      </div>
      <button onClick={onMenuOpen} style={{
        background: 'none', border: 'none', color: t.text.secondary,
        cursor: 'pointer', padding: '6px',
      }}>
        <Menu size={20} />
      </button>
    </header>
  )
}

function MobileBottomNav({ onFabPress }: { onFabPress: () => void }) {
  const pathname = usePathname()
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const left = mobileBottomNav.slice(0, 2)
  const right = mobileBottomNav.slice(2)

  return (
    <nav className="mobile-nav-safe" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      backgroundColor: t.bg.sidebar,
      borderTop: `1px solid ${t.border.default}`,
      display: 'flex', alignItems: 'stretch', height: '64px',
    }}>
      {left.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)
        return (
          <Link key={item.href} href={item.href} style={{
            flex: 1, display: 'flex', flexDirection: 'column', minHeight: '44px',
            alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', color: active ? t.gold : t.text.muted,
            gap: '3px', paddingBottom: '4px',
          }}>
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            <span style={{ fontSize: '10px', fontWeight: active ? '600' : '400' }}>{item.label}</span>
          </Link>
        )
      })}

      {/* Center FAB */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <button onClick={onFabPress} style={{
          width: 52, height: 52, borderRadius: '50%',
          backgroundColor: t.gold, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: `0 4px 16px ${t.gold}55`,
          position: 'absolute', bottom: '10px',
          transition: 'transform 100ms ease, box-shadow 100ms ease',
        }}>
          <Plus size={24} color="#0c0c0a" strokeWidth={2.5} />
        </button>
      </div>

      {right.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)
        return (
          <Link key={item.href} href={item.href} style={{
            flex: 1, display: 'flex', flexDirection: 'column', minHeight: '44px',
            alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', color: active ? t.gold : t.text.muted,
            gap: '3px', paddingBottom: '4px',
          }}>
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            <span style={{ fontSize: '10px', fontWeight: active ? '600' : '400' }}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

// ─── Mobile Drawer ────────────────────────────────────────────────────────

function MobileDrawer({ open, onClose, profile, nav }: {
  open: boolean
  onClose: () => void
  profile: UserProfile
  nav: typeof ownerNav
}) {
  const router = useRouter()
  const pathname = usePathname()
  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }} />
      <div className="slide-up" style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: t.bg.elevated,
        borderRadius: '20px 20px 0 0',
        maxHeight: '85vh',
        overflowY: 'auto',
        paddingBottom: 'env(safe-area-inset-bottom, 16px)',
      }}>
        {/* Handle + close button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px 8px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.border.hover }} />
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: t.text.muted, cursor: 'pointer',
            padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={20} />
          </button>
        </div>

        {/* Profile */}
        <div style={{ padding: '0 20px 16px', borderBottom: `1px solid ${t.border.default}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px', color: t.gold, fontWeight: '700',
            }}>
              {profile.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: t.text.primary }}>{profile.name}</div>
              <div style={{ fontSize: '12px', color: t.text.muted, textTransform: 'capitalize' }}>{profile.role} · Barley Bros</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: '8px 0' }}>
          {nav.map(item => {
            const Icon = item.icon
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href} onClick={onClose} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '13px 20px',
                color: active ? t.gold : t.text.secondary,
                textDecoration: 'none',
                fontSize: '15px',
                fontWeight: active ? '600' : '400',
                backgroundColor: active ? t.goldDim : 'transparent',
              }}>
                <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Sign out */}
        <div style={{ padding: '12px 20px 8px', borderTop: `1px solid ${t.border.default}` }}>
          <button onClick={() => signOut().then(() => router.push('/login'))}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 0', background: 'none', border: 'none',
              color: t.status.danger, fontSize: '15px', cursor: 'pointer',
            }}>
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showVisitLog, setShowVisitLog] = useState(false)
  const [collapsed, setCollapsedState] = useState(false)

  function setCollapsed(val: boolean) {
    setCollapsedState(val)
    try { localStorage.setItem('sidebar-collapsed', String(val)) } catch {}
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidebar-collapsed')
      if (saved === 'true') setCollapsedState(true)
    } catch {}
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { window.location.replace('/login'); return }
      const { data: p } = await sb.from('user_profiles').select('*').eq('id', user.id).single()
      if (!p) { window.location.replace('/login'); return }
      if (p.role === 'intern' && !window.location.pathname.startsWith('/intern')) {
        window.location.replace('/intern'); return
      }
      if (p.role === 'portal' && p.client_slug) { window.location.replace(`/portal/${p.client_slug}`); return }
      setProfile(p)
      setLoading(false)
    }).catch(() => { window.location.replace('/login') })
  }, [router])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: t.bg.page,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: t.goldDim, border: `1px solid ${t.goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <span style={{ color: t.gold, fontSize: '22px', fontWeight: '700' }}>D</span>
          </div>
          <div style={{ color: t.text.secondary, fontSize: '13px' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!profile) return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg.page }} />
  )

  const nav = profile.role === 'owner' ? ownerNav : profile.role === 'intern' ? internNav : repNav
  const navGroups = profile.role === 'owner' ? ownerNavGroups : profile.role === 'intern'
    ? [{ label: 'INTERN', items: internNav }]
    : repNavGroups

  return (
    <AppContext.Provider value={{ profile, isMobile, showVisitLog, setShowVisitLog }}>
      {isMobile ? (
        // ── MOBILE LAYOUT ──
        <div style={{ backgroundColor: t.bg.page, minHeight: '100vh' }}>
          <MobileHeader profile={profile} onMenuOpen={() => setDrawerOpen(true)} />
          <main style={{ paddingTop: '52px', paddingBottom: '80px', minHeight: '100vh' }}>
            {children}
          </main>
          <MobileBottomNav onFabPress={() => setShowVisitLog(true)} />
          <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} profile={profile} nav={nav} />
          {showVisitLog && profile.role !== 'intern' && (
            <VisitLogModal
              isOpen={showVisitLog}
              onClose={() => setShowVisitLog(false)}
              onSuccess={() => setShowVisitLog(false)}
              userId={profile.id}
              isMobile
            />
          )}
        </div>
      ) : (
        // ── DESKTOP LAYOUT ──
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: t.bg.page }}>
          <DesktopSidebar profile={profile} navGroups={navGroups} collapsed={collapsed} setCollapsed={setCollapsed} />
          <main style={{
            flex: 1, marginLeft: collapsed ? '60px' : '220px',
            minHeight: '100vh', transition: 'margin-left 200ms ease',
            display: 'flex', flexDirection: 'column',
          }}>
            {children}
          </main>
        </div>
      )}
    </AppContext.Provider>
  )
}
