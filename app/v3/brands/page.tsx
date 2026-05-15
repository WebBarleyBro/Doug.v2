'use client'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { v3, v3input, v3label } from '../lib/theme'
import { useV3Clients, useV3RecentVisits } from '../lib/query'
import { useV3Toast } from '../lib/context'
import { clientLogoUrl } from '../../lib/constants'
import { useState, useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'
import type { Client } from '../../lib/types'

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function AddBrandModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { show: toast } = useV3Toast()
  const [name, setName]           = useState('')
  const [orderType, setOrderType] = useState<'direct' | 'distributor'>('distributor')
  const [commission, setCommission] = useState('')
  const [category, setCategory]   = useState('')

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase()
      const slug = slugify(name.trim())
      const rate = parseFloat(commission)
      const { error } = await sb.from('clients').insert({
        name: name.trim(),
        slug,
        order_type: orderType,
        commission_rate: !isNaN(rate) ? rate / 100 : 0,
        category: category.trim() || null,
        active: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v3', 'clients'] })
      toast('Brand added')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Failed to create brand', 'error'),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: v3.bg.overlay, backdropFilter: 'blur(10px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 440, background: v3.bg.elevated, borderRadius: '12px', boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)', padding: '24px 28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: v3.text.primary, letterSpacing: '-0.02em' }}>Add Brand</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={v3label}>Brand Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="e.g. NoCo Distillery" style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
          <div><label style={v3label}>Category</label>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Whiskey, Gin, RTD…" style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
          <div>
            <label style={v3label}>Order Type</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['distributor', 'direct'] as const).map(ot => (
                <button key={ot} type="button" onClick={() => setOrderType(ot)} style={{
                  flex: 1, padding: '8px 10px', borderRadius: v3.radius.md, fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${orderType === ot ? 'rgba(196,164,110,0.50)' : 'rgba(255,255,255,0.08)'}`,
                  background: orderType === ot ? 'rgba(196,164,110,0.09)' : 'transparent',
                  color: orderType === ot ? v3.amberLight : 'rgba(255,255,255,0.40)',
                }}>
                  {ot === 'direct' ? 'Direct Orders' : 'Order Inquiries'}
                </button>
              ))}
            </div>
          </div>
          <div><label style={v3label}>Commission % <span style={{ opacity: 0.4, fontWeight: 400 }}>(optional)</span></label>
            <input type="number" min={0} max={100} step={0.5} value={commission} onChange={e => setCommission(e.target.value)} placeholder="e.g. 12" style={{ ...v3input, background: v3.bg.sheet }} />
          </div>
          {name.trim() && (
            <div style={{ fontSize: '10px', color: v3.text.muted }}>
              URL slug: <span style={{ fontFamily: 'monospace', color: v3.amberLight }}>{slugify(name.trim())}</span>
            </div>
          )}
        </div>

        <button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}
          style={{
            marginTop: 24, width: '100%', padding: '13px',
            background: save.isPending ? v3.bg.sheet : v3.amber,
            color: '#000', border: 'none', borderRadius: v3.radius.md,
            fontSize: '12px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
          {save.isPending ? 'Creating…' : 'Add Brand'}
        </button>
      </div>
    </div>
  )
}

function BrandTile({ client, visitCount30d }: { client: Client; visitCount30d: number }) {
  const [hovered, setHovered] = useState(false)
  const ac = client.color || v3.amber
  const logo = clientLogoUrl(client)

  return (
    <Link href={`/v3/brands/${client.slug}`} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 12, padding: '32px 24px 28px',
          cursor: 'pointer', position: 'relative', width: 168,
          transition: 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          transform: hovered ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        {/* Radial spotlight behind logo */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 180, height: 180,
          background: `radial-gradient(ellipse at center 30%, ${ac}14 0%, transparent 68%)`,
          opacity: hovered ? 1 : 0, transition: 'opacity 280ms',
          pointerEvents: 'none',
        }} />

        {/* Logo + reticle wrapper */}
        <div style={{ position: 'relative', width: 88, height: 88 }}>
          {/* Inner glow ring */}
          <div style={{
            position: 'absolute', inset: -10, borderRadius: '50%',
            background: `radial-gradient(circle, ${ac}16 0%, transparent 72%)`,
            opacity: hovered ? 1 : 0, transition: 'opacity 200ms', pointerEvents: 'none',
          }} />

          {/* Logo */}
          <div style={{
            width: 88, height: 88, position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            filter: hovered
              ? `drop-shadow(0 0 14px ${ac}75) drop-shadow(0 0 28px ${ac}35)`
              : `drop-shadow(0 3px 10px rgba(0,0,0,0.55))`,
            transition: 'filter 220ms',
          }}>
            {logo
              ? <img src={logo} alt={client.name} style={{ width: 80, height: 80, objectFit: 'contain' }} />
              : <span style={{ fontSize: 36, fontWeight: 900, color: ac }}>{client.name[0]}</span>
            }
          </div>

          {/* Corner reticle brackets */}
          <div style={{ position: 'absolute', top: -8, left: -8, width: 13, height: 13, borderTop: `1.5px solid ${ac}`, borderLeft: `1.5px solid ${ac}`, opacity: hovered ? 1 : 0, transition: 'opacity 180ms' }} />
          <div style={{ position: 'absolute', top: -8, right: -8, width: 13, height: 13, borderTop: `1.5px solid ${ac}`, borderRight: `1.5px solid ${ac}`, opacity: hovered ? 1 : 0, transition: 'opacity 180ms' }} />
          <div style={{ position: 'absolute', bottom: -8, left: -8, width: 13, height: 13, borderBottom: `1.5px solid ${ac}`, borderLeft: `1.5px solid ${ac}`, opacity: hovered ? 1 : 0, transition: 'opacity 180ms' }} />
          <div style={{ position: 'absolute', bottom: -8, right: -8, width: 13, height: 13, borderBottom: `1.5px solid ${ac}`, borderRight: `1.5px solid ${ac}`, opacity: hovered ? 1 : 0, transition: 'opacity 180ms' }} />
        </div>

        {/* Brand name */}
        <div style={{
          fontSize: '13px', fontWeight: 800,
          color: hovered ? v3.text.primary : v3.text.secondary,
          textAlign: 'center', letterSpacing: '-0.01em', lineHeight: 1.3,
          transition: 'color 200ms',
        }}>
          {client.name}
        </div>

        {/* Stat line */}
        <div style={{
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
          color: hovered ? ac : 'rgba(255,255,255,0.2)',
          transition: 'color 200ms', fontFamily: v3.font.ui,
          textAlign: 'center',
        }}>
          {visitCount30d > 0 ? `${visitCount30d} visit${visitCount30d !== 1 ? 's' : ''}` : 'No visits yet'}
        </div>
      </div>
    </Link>
  )
}

export default function BrandsPage() {
  const { data: clients = [], isLoading, isError } = useV3Clients()
  const { data: visits = [] }                      = useV3RecentVisits(30)
  const [showAddBrand, setShowAddBrand]             = useState(false)

  const visitsByBrand = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const v of visits) {
      if (v.client_slug) counts[v.client_slug] = (counts[v.client_slug] || 0) + 1
    }
    return counts
  }, [visits])

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 36, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: v3.text.primary, letterSpacing: '-0.03em', margin: 0 }}>Brands</h1>
          <div style={{ fontSize: '13px', color: v3.text.muted, marginTop: 4 }}>
            {isLoading ? '…' : `${clients.length} brand${clients.length !== 1 ? 's' : ''} in portfolio`}
          </div>
        </div>
        <button onClick={() => setShowAddBrand(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
          background: 'rgba(196,164,110,0.08)', border: `1px solid rgba(196,164,110,0.30)`,
          borderRadius: v3.radius.md, fontSize: '12px', fontWeight: 700, color: v3.amberLight,
          cursor: 'pointer', letterSpacing: '0.03em',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(196,164,110,0.14)'; e.currentTarget.style.borderColor = 'rgba(196,164,110,0.50)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(196,164,110,0.08)'; e.currentTarget.style.borderColor = 'rgba(196,164,110,0.30)' }}>
          <Plus size={13} />Add Brand
        </button>
      </div>

      {isLoading
        ? <div style={{ color: v3.text.muted, fontSize: '13px' }}>Loading…</div>
        : isError
        ? <div style={{ color: v3.status.danger, fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
            Failed to load brands. Check your connection and refresh.
          </div>
        : clients.length === 0
        ? <div style={{ color: v3.text.muted, fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>No brands yet.</div>
        : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {clients.map(c => (
              <BrandTile
                key={c.slug}
                client={c}
                visitCount30d={visitsByBrand[c.slug] ?? 0}
              />
            ))}
          </div>
        )
      }
      {showAddBrand && <AddBrandModal onClose={() => setShowAddBrand(false)} />}
    </div>
  )
}
