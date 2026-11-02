'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, getCurrentUserWithProfile } from '../lib/auth'
import { t, inputStyle, labelStyle } from '../lib/theme'
import { WESTERN_PEAK_LOGO_SCREEN_URL } from '../lib/constants'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [redirectTo, setRedirectTo] = useState('/')

  useEffect(() => {
    // Supabase invite/reset emails return to the site with the session in the URL hash.
    // Send those straight to the password page instead of the login form.
    const hash = new URLSearchParams(window.location.hash.substring(1))
    if (hash.get('error') || ['invite', 'recovery', 'signup', 'magiclink'].includes(hash.get('type') || '')) {
      window.location.replace('/reset-password' + window.location.hash)
      return
    }
    const params = new URLSearchParams(window.location.search)
    const r = params.get('redirect')
    if (r && r.startsWith('/')) setRedirectTo(r)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: err } = await signIn(email, password)
      if (err) { setError(err.message); return }
      const result = await getCurrentUserWithProfile()
      if (result?.profile?.role === 'portal' && result.profile.client_slug) {
        router.push(`/portal/${result.profile.client_slug}`)
      } else {
        router.push(redirectTo)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: t.bg.page,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={WESTERN_PEAK_LOGO_SCREEN_URL} alt="Western Peak" style={{ height: 56, width: 'auto', display: 'block', margin: '0 auto 16px' }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>
            Doug
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{
          backgroundColor: t.bg.card,
          border: `1px solid ${t.border.default}`,
          borderRadius: '16px',
          padding: '28px',
        }}>
          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@westernpeak.org"
              required
              autoComplete="email"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              backgroundColor: t.status.dangerBg,
              border: `1px solid rgba(224,82,82,0.2)`,
              borderRadius: '8px',
              padding: '10px 14px',
              color: t.status.danger,
              fontSize: '13px',
              marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: loading ? t.status.neutral : t.gold,
              color: '#0f0f0d',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 150ms ease',
              letterSpacing: '-0.01em',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '12px', color: t.text.muted, marginTop: '24px' }}>
          Western Peak · Fort Collins, CO
        </p>
      </div>
    </div>
  )
}
