'use client'
import { useState, useEffect, Component } from 'react'
import type { ErrorInfo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, TrendingUp, Briefcase, BarChart2, LogOut, Plus, Home, Users, BookUser, Route, ClipboardList, MapPin } from 'lucide-react'
import { V3QueryProvider } from './lib/query'
import { v3 } from './lib/theme'
import LogVisitModal from './components/LogVisitModal'
import { ToastCtx, LogVisitCtx, WinMomentCtx } from './lib/context'
import type { Toast, WinMoment } from './lib/context'

// ── Error boundary — catches page render crashes, shows a recovery screen ─────
class V3ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[V3 ErrorBoundary]', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      const msg = (this.state.error as Error).message
      return (
        <div style={{
          minHeight: '100vh', background: v3.bg.page, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 32,
        }}>
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: v3.status.danger, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: '13px', color: v3.text.secondary, marginBottom: 8, fontFamily: 'monospace', background: v3.bg.card, padding: '10px 14px', borderRadius: v3.radius.md, textAlign: 'left', wordBreak: 'break-word' }}>
              {msg}
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => this.setState({ error: null })} style={{ padding: '9px 18px', background: v3.bg.sheet, border: `1px solid ${v3.border.default}`, borderRadius: v3.radius.md, color: v3.text.secondary, fontSize: '13px', cursor: 'pointer' }}>
                Try again
              </button>
              <a href="/v3/today" style={{ padding: '9px 18px', background: v3.amber, borderRadius: v3.radius.md, color: '#000', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
                Go to Today
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function WinMomentOverlay({ data, onDone }: { data: WinMoment | null; onDone: () => void }) {
  useEffect(() => {
    if (!data) return
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [data, onDone])
  if (!data) return null
  return (
    <div onClick={onDone} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'radial-gradient(ellipse at center, rgba(196,164,110,0.12) 0%, rgba(0,0,0,0.97) 65%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'v3-win-in 0.38s cubic-bezier(0.34,1.56,0.64,1) forwards',
      cursor: 'pointer',
    }}>
      <div style={{ textAlign: 'center', userSelect: 'none' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: v3.amber, textTransform: 'uppercase', letterSpacing: '0.5em', marginBottom: 20, filter: `drop-shadow(0 0 8px ${v3.amber}88)` }}>
          ◆ &nbsp; Win &nbsp; ◆
        </div>
        <div style={{ fontSize: '48px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.04em', lineHeight: 1, filter: `drop-shadow(0 0 28px ${v3.amber}60)`, marginBottom: 16 }}>
          {data.title ?? 'ON SHELF'}
        </div>
        <div style={{ width: 120, height: 1, background: `linear-gradient(90deg, transparent, ${v3.amber}, transparent)`, margin: '0 auto 20px' }} />
        <div style={{ fontSize: '18px', fontWeight: 700, color: v3.amberLight }}>{data.product}</div>
        <div style={{ fontSize: '14px', color: v3.text.secondary, marginTop: 6 }}>@ {data.account}</div>
        <div style={{ marginTop: 40, fontSize: '9px', color: v3.text.muted, letterSpacing: '0.15em', textTransform: 'uppercase' }}>tap to dismiss</div>
      </div>
    </div>
  )
}

// ── Nav items ────────────────────────────────────────────────────────────────
const NAV = [
  { href: '/v3/today',      label: 'Today',      icon: Home,       section: 'main' },
  { href: '/v3/accounts',   label: 'Accounts',   icon: MapPin,     section: 'main' },
  { href: '/v3/pipeline',   label: 'Orders',     icon: TrendingUp, section: 'main' },
  { href: '/v3/brands',     label: 'Brands',     icon: Briefcase,  section: 'main' },
  { href: '/v3/reports',    label: 'Reports',    icon: BarChart2,  section: 'main' },
]
const NAV_EXTRA = [
  { href: '/v3/prospects', label: 'Prospects', icon: Users },
  { href: '/v3/territory', label: 'Territory', icon: Route },
  { href: '/v3/planner',   label: 'Planner',   icon: CalendarDays },
  { href: '/v3/visits',    label: 'Visits',    icon: ClipboardList },
  { href: '/v3/contacts',  label: 'Contacts',  icon: BookUser },
]

function NavItem({ href, label, icon: Icon, pathname, dim }: { href: string; label: string; icon: any; pathname: string; dim?: boolean }) {
  const active = pathname === href || (pathname.startsWith(href + '/') && href !== '/v3/today')
  const baseOpacity = dim ? 0.38 : 0.55
  const hoverOpacity = dim ? 0.65 : 0.85

  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 14px 7px 12px',
          position: 'relative',
          transition: 'all 140ms',
          cursor: 'pointer',
          borderRadius: '0 3px 3px 0',
          marginRight: 8,
        }}
        onMouseEnter={e => {
          if (!active) {
            (e.currentTarget as HTMLElement).style.opacity = String(hoverOpacity)
            ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
          }
        }}
        onMouseLeave={e => {
          if (!active) {
            (e.currentTarget as HTMLElement).style.opacity = String(baseOpacity)
            ;(e.currentTarget as HTMLElement).style.background = 'transparent'
          }
        }}
      >
        {/* Active — left bar */}
        <div style={{
          position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
          width: 2, height: active ? 18 : 0,
          background: v3.amber,
          boxShadow: active ? `0 0 8px ${v3.amber}70` : 'none',
          transition: 'height 180ms cubic-bezier(0.16,1,0.3,1)',
          borderRadius: '0 2px 2px 0',
        }} />

        {/* Active — radial backglow */}
        {active && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at 10% 50%, rgba(196,164,110,0.07) 0%, transparent 70%)',
            borderRadius: '0 3px 3px 0',
            pointerEvents: 'none',
          }} />
        )}

        <Icon
          size={13}
          color={active ? v3.amberLight : 'rgba(255,255,255,0.5)'}
          style={{
            flexShrink: 0,
            filter: active ? `drop-shadow(0 0 4px ${v3.amber}60)` : 'none',
            transition: 'all 140ms',
          }}
        />
        <span style={{
          fontSize: '12px',
          fontWeight: active ? 600 : 400,
          color: active ? v3.text.primary : 'rgba(255,255,255,0.5)',
          letterSpacing: '0.01em',
          opacity: active ? 1 : 1,
        }}>
          {label}
        </span>
      </div>
    </Link>
  )
}

const SIDEBAR_W = 176

function Sidebar({ pathname, onLogVisit }: { pathname: string; onLogVisit: () => void }) {
  return (
    <nav style={{
      width: SIDEBAR_W, flexShrink: 0,
      background: '#030303',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', flexDirection: 'column',
      position: 'fixed', top: 0, left: 0, bottom: 0,
      zIndex: 50,
    }}>
      {/* Wordmark */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 2, height: 20, background: v3.amber, borderRadius: 1, flexShrink: 0, boxShadow: `0 0 6px ${v3.amber}55` }} />
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: v3.text.primary, letterSpacing: '-0.01em', lineHeight: 1 }}>
            Western Peak
          </div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.38)', letterSpacing: '0.14em', marginTop: 3, textTransform: 'uppercase', fontFamily: v3.font.mono }}>
            Field CRM
          </div>
        </div>
      </div>

      {/* Log Visit — ghost button */}
      <div style={{ padding: '10px 12px 8px' }}>
        <button onClick={onLogVisit} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '8px 12px',
          background: 'transparent',
          border: '1px solid rgba(196,164,110,0.22)',
          borderRadius: v3.radius.md,
          fontSize: '10px', fontWeight: 700, color: 'rgba(196,164,110,0.60)',
          cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
          fontFamily: v3.font.ui,
          transition: 'all 160ms',
        }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(196,164,110,0.07)'
            e.currentTarget.style.borderColor = 'rgba(196,164,110,0.45)'
            e.currentTarget.style.color = v3.amberLight
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'rgba(196,164,110,0.22)'
            e.currentTarget.style.color = 'rgba(196,164,110,0.60)'
          }}
        >
          <Plus size={11} strokeWidth={2.5} />
          Log Visit
        </button>
      </div>

      {/* Primary nav */}
      <div style={{ padding: '6px 0', flex: 1, overflowY: 'auto' }}>
        {NAV.map((item, i) => (
          <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} pathname={pathname} />
        ))}

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)', margin: '10px 14px' }} />

        {NAV_EXTRA.map(item => (
          <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} pathname={pathname} dim />
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'block' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 4px', cursor: 'pointer', opacity: 0.25, transition: 'opacity 120ms' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.25'}
          >
            <LogOut size={10} color="rgba(255,255,255,0.5)" />
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>Classic view</span>
          </div>
        </Link>
      </div>
    </nav>
  )
}

function BottomNav({ pathname, onLogVisit }: { pathname: string; onLogVisit: () => void }) {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: 'rgba(3,3,3,0.97)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center',
      paddingBottom: 'env(safe-area-inset-bottom)',
      backdropFilter: 'blur(12px)',
    }}>
      {NAV.map((item, i) => {
        const active = pathname.startsWith(item.href)
        const Icon = item.icon
        const isCenter = i === 2
        if (isCenter) return (
          <button key={item.href} onClick={onLogVisit} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', gap: 3,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'rgba(196,164,110,0.10)',
              border: '1px solid rgba(196,164,110,0.30)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 16px rgba(196,164,110,0.10)',
              marginTop: -12,
            }}>
              <Plus size={18} color={v3.amberLight} strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: 9, color: v3.amberLight, fontWeight: 700, letterSpacing: '0.04em' }}>Log</span>
          </button>
        )
        return (
          <Link key={item.href} href={item.href} style={{ textDecoration: 'none', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0', gap: 4 }}>
              <Icon size={17} color={active ? v3.amberLight : 'rgba(255,255,255,0.3)'}
                style={{ filter: active ? `drop-shadow(0 0 5px ${v3.amber}70)` : 'none', transition: 'all 150ms' }} />
              <span style={{ fontSize: 9, fontWeight: active ? 600 : 400, color: active ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>
                {item.label}
              </span>
            </div>
          </Link>
        )
      })}
    </nav>
  )
}

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(toast => (
        <div key={toast.id} onClick={() => onDismiss(toast.id)} style={{
          padding: '11px 16px', borderRadius: v3.radius.md, cursor: 'pointer',
          background: toast.type === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(16,185,129,0.08)',
          border: `1px solid ${toast.type === 'error' ? 'rgba(248,113,113,0.3)' : 'rgba(16,185,129,0.3)'}`,
          color: toast.type === 'error' ? v3.status.danger : v3.amberLight,
          fontSize: '12px', fontWeight: 600,
          boxShadow: `0 4px 20px rgba(0,0,0,0.4), 0 0 16px ${toast.type === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(16,185,129,0.08)'}`,
          backdropFilter: 'blur(12px)',
          maxWidth: 300,
        }}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}

// ── Root layout wrapper ───────────────────────────────────────────────────────
function V3Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [toasts, setToasts] = useState<Toast[]>([])
  const [logVisitOpen, setLogVisitOpen] = useState(false)
  const [logVisitAccount, setLogVisitAccount] = useState<{ id: string; name: string } | undefined>()
  const [winMoment, setWinMoment] = useState<WinMoment | null>(null)

  function showToast(message: string, type: Toast['type'] = 'success') {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }

  function openLogVisit(account?: { id: string; name: string }) {
    setLogVisitAccount(account)
    setLogVisitOpen(true)
  }

  return (
    <ToastCtx.Provider value={{ show: showToast }}>
      <LogVisitCtx.Provider value={{ open: openLogVisit }}>
      <WinMomentCtx.Provider value={{ trigger: (d) => setWinMoment(d) }}>
        <div style={{ minHeight: '100vh', background: v3.bg.page, color: v3.text.primary, fontFamily: v3.font.ui, WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' } as any}>

          {/* Desktop sidebar */}
          <div style={{ display: 'none' }} className="v3-desktop-nav">
            <Sidebar pathname={pathname} onLogVisit={() => openLogVisit()} />
          </div>

          {/* Main content */}
          <main style={{ marginLeft: SIDEBAR_W, minHeight: '100vh' }} className="v3-main">
            {children}
          </main>

          {/* Mobile bottom nav */}
          <div className="v3-mobile-nav">
            <BottomNav pathname={pathname} onLogVisit={() => openLogVisit()} />
          </div>

          {logVisitOpen && (
            <LogVisitModal
              onClose={() => setLogVisitOpen(false)}
              preAccount={logVisitAccount}
              onSuccess={() => showToast('Visit logged')}
            />
          )}

          <WinMomentOverlay data={winMoment} onDone={() => setWinMoment(null)} />
          <ToastStack toasts={toasts} onDismiss={id => setToasts(t => t.filter(x => x.id !== id))} />
        </div>

        <style>{`
          @media (max-width: 768px) {
            .v3-desktop-nav { display: none !important; }
            .v3-main { margin-left: 0 !important; padding-bottom: 80px; }
            .v3-mobile-nav { display: block; }
          }
          @media (min-width: 769px) {
            .v3-desktop-nav { display: block !important; }
            .v3-mobile-nav { display: none !important; }
          }
          *, *::before, *::after { box-sizing: border-box; }

          html { font-family: "Space Grotesk", -apple-system, system-ui, sans-serif; }

          body {
            background-color: #050505;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }

          ::-webkit-scrollbar { width: 2px; height: 2px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(196,164,110,0.18); border-radius: 1px; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(196,164,110,0.35); }

          .v3-mono { font-family: "JetBrains Mono", ui-monospace, monospace; }

          /* Glow classes — quiet, warm, understated */
          .v3-glow-green  { color: #5a9ea0 !important; text-shadow: 0 0 24px rgba(90,158,160,0.22), 0 0 60px rgba(90,158,160,0.07); }
          .v3-glow-red    { color: #bf7850 !important; text-shadow: 0 0 24px rgba(191,120,80,0.22), 0 0 60px rgba(191,120,80,0.07); }
          .v3-glow-yellow { color: #a08440 !important; text-shadow: 0 0 24px rgba(160,132,64,0.22), 0 0 60px rgba(160,132,64,0.07); }
          .v3-glow-warn   { color: #c8a46e !important; text-shadow: 0 0 24px rgba(196,164,110,0.28), 0 0 60px rgba(196,164,110,0.10); }
          .v3-glow-amber  { color: #c8a870 !important; text-shadow: 0 0 24px rgba(196,164,110,0.25), 0 0 60px rgba(196,164,110,0.08); }
          .v3-glow-cyan   { color: #c8a870 !important; text-shadow: 0 0 24px rgba(196,164,110,0.25), 0 0 60px rgba(196,164,110,0.08); }
          .v3-glow-orange { color: #c8a870 !important; text-shadow: 0 0 24px rgba(196,164,110,0.25), 0 0 60px rgba(196,164,110,0.08); }

          input, select, textarea, button { font-family: "Space Grotesk", -apple-system, system-ui, sans-serif; }
          input::placeholder, textarea::placeholder { color: rgba(120,120,120,0.9); }
          input:focus, select:focus, textarea:focus { border-color: rgba(196,164,110,0.40) !important; box-shadow: 0 0 0 1px rgba(196,164,110,0.08); }
          select option { background: #0e0e0e; color: #efefef; }
          a { color: inherit; text-decoration: none; }

          /* Section header utility */
          .v3-section-hdr {
            display: flex; align-items: center; justify-content: space-between;
            padding: 7px 16px;
            background: rgba(255,255,255,0.015);
            border-bottom: 1px solid rgba(255,255,255,0.04);
            font-size: 9px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.20em; color: rgba(255,255,255,0.38);
          }

          .v3-card-hover { transition: border-color 150ms; }
          .v3-card-hover:hover { border-color: rgba(196,164,110,0.18) !important; }

          .v3-row-hover { transition: background 100ms; }
          .v3-row-hover:hover { background: rgba(255,255,255,0.022) !important; }

          @keyframes v3-win-in {
            0%   { opacity: 0; transform: scale(0.92) translateY(8px); }
            60%  { opacity: 1; transform: scale(1.01) translateY(0); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }

          @keyframes v3-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.50; }
          }
          .v3-pulse { animation: v3-pulse 2.2s ease-in-out infinite; }

          @keyframes v3-fade-in {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .v3-fade-in { animation: v3-fade-in 0.35s cubic-bezier(0.16,1,0.3,1) both; }

          @keyframes v3-bar-fill {
            from { width: 0%; }
          }
          .v3-bar-fill { animation: v3-bar-fill 1.1s cubic-bezier(0.16,1,0.3,1) both; }
        `}</style>
      </WinMomentCtx.Provider>
      </LogVisitCtx.Provider>
    </ToastCtx.Provider>
  )
}

export default function V3Layout({ children }: { children: React.ReactNode }) {
  return (
    <V3ErrorBoundary>
      <V3QueryProvider>
        <V3Shell>{children}</V3Shell>
      </V3QueryProvider>
    </V3ErrorBoundary>
  )
}
