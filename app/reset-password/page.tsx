'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '../lib/supabase'
import { t, inputStyle, labelStyle } from '../lib/theme'

type Status = 'loading' | 'ready' | 'saving' | 'done' | 'error'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [status, setStatus]     = useState<Status>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')

  useEffect(() => {
    const sb = getSupabase()

    // Supabase embeds the recovery token in the URL hash:
    // #access_token=xxx&refresh_token=yyy&type=recovery
    const hash   = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const type   = params.get('type')
    const access = params.get('access_token')
    const refresh = params.get('refresh_token')

    if (type === 'recovery' && access && refresh) {
      sb.auth.setSession({ access_token: access, refresh_token: refresh })
        .then(({ error: err }) => {
          if (err) { setStatus('error'); setError('Link is invalid or expired. Request a new one.') }
          else setStatus('ready')
        })
    } else {
      // Token may have already been consumed — check for active session
      sb.auth.getSession().then(({ data: { session } }) => {
        if (session) setStatus('ready')
        else { setStatus('error'); setError('Invalid or expired reset link. Please request a new one.') }
      })
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setStatus('saving')
    const sb = getSupabase()

    const { error: updateErr } = await sb.auth.updateUser({ password })
    if (updateErr) {
      setStatus('ready')
      setError(updateErr.message)
      return
    }

    // Redirect portal users to their portal; everyone else to v2 dashboard
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      const { data: profile } = await sb
        .from('user_profiles')
        .select('role, client_slug')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'portal' && profile?.client_slug) {
        router.push(`/portal/${profile.client_slug}`)
      } else {
        router.push('/')
      }
    } else {
      router.push('/login')
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
            Set New Password
          </h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '4px' }}>
            Barley Bros CRM
          </p>
        </div>

        {status === 'loading' && (
          <div style={{ textAlign: 'center', color: t.text.muted, fontSize: '14px', padding: '32px 0' }}>
            Verifying link…
          </div>
        )}

        {status === 'error' && (
          <div style={{
            backgroundColor: t.status.dangerBg,
            border: `1px solid rgba(224,82,82,0.2)`,
            borderRadius: '12px',
            padding: '20px',
            color: t.status.danger,
            fontSize: '14px',
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            {error}
            <div style={{ marginTop: 14 }}>
              <a href="/login" style={{ color: t.gold, textDecoration: 'none', fontWeight: 600 }}>
                Back to login
              </a>
            </div>
          </div>
        )}

        {(status === 'ready' || status === 'saving') && (
          <form onSubmit={handleSubmit} style={{
            backgroundColor: t.bg.card,
            border: `1px solid ${t.border.default}`,
            borderRadius: '16px',
            padding: '28px',
          }}>
            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>New Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                autoFocus
                autoComplete="new-password"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
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
              disabled={status === 'saving'}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: status === 'saving' ? t.status.neutral : t.gold,
                color: '#0f0f0d',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '700',
                cursor: status === 'saving' ? 'not-allowed' : 'pointer',
                transition: 'all 150ms ease',
                letterSpacing: '-0.01em',
              }}
            >
              {status === 'saving' ? 'Updating…' : 'Set New Password'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', fontSize: '12px', color: t.text.muted, marginTop: '24px' }}>
          Barley Bros spirits rep agency · Fort Collins, CO
        </p>
      </div>
    </div>
  )
}
