'use client'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error('App error:', error) }, [error])
  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0f0f0d',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚠️</div>
        <h2 style={{ color: '#eceae4', fontSize: '18px', marginBottom: '8px' }}>Something went wrong</h2>
        <p style={{ color: '#9a9790', fontSize: '13px', marginBottom: '20px', wordBreak: 'break-all' }}>
          {error.message}
        </p>
        <button onClick={reset} style={{
          backgroundColor: '#d4a843', color: '#0f0f0d', border: 'none',
          borderRadius: '8px', padding: '10px 20px', fontSize: '14px',
          fontWeight: '700', cursor: 'pointer',
        }}>
          Try again
        </button>
      </div>
    </div>
  )
}
