'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '../lib/auth'
import { t, inputStyle, labelStyle } from '../lib/theme'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [redirectTo, setRedirectTo] = useState('/')

  useEffect(() => {
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
      router.push(redirectTo)
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
          <div style={{
            width: 64, height: 64, borderRadius: '16px',
            background: `linear-gradient(135deg, ${t.gold} 0%, #b8891e 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', fontWeight: '800', color: '#0f0f0d',
            margin: '0 auto 16px',
            boxShadow: `0 8px 32px rgba(212,168,67,0.25)`,
          }}>D</div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>
            Doug
          </h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '4px' }}>
            Barley Bros CRM
          </p>
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
              placeholder="you@barley-bros.com"
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
          Barley Bros spirits rep agency · Fort Collins, CO
        </p>
      </div>
    </div>
  )
}
