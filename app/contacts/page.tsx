'use client'
import { useState, useEffect } from 'react'
import { Search, Plus, Star, Mail, Phone } from 'lucide-react'
import Link from 'next/link'
import LayoutShell from '../layout-shell'
import EmptyState from '../components/EmptyState'
import { getContacts } from '../lib/data'
import { t, card } from '../lib/theme'
import type { Contact } from '../lib/types'

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getContacts().then(cs => { setContacts(cs); setLoading(false) })
  }, [])

  const filtered = contacts.filter(c => {
    if (!search) return true
    const s = search.toLowerCase()
    return c.name?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s) || c.role?.toLowerCase().includes(s)
  })

  return (
    <LayoutShell>
      <div style={{ padding: '32px 48px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: t.text.primary, letterSpacing: '-0.02em' }}>Contacts</h1>
          <p style={{ fontSize: '13px', color: t.text.muted, marginTop: '2px' }}>{contacts.length} contacts across all accounts</p>
        </div>

        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.text.muted }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..."
            style={{ backgroundColor: t.bg.card, border: `1px solid ${t.border.default}`, borderRadius: '8px', padding: '10px 12px 10px 36px', color: t.text.primary, fontSize: '14px', width: '100%', outline: 'none' }} />
        </div>

        {loading ? null : filtered.length === 0 ? (
          <EmptyState icon={<Phone size={36} />} title="No contacts found" subtitle="Add contacts from the account detail page" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(c => (
              <div key={c.id} style={{ ...card, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: t.text.primary }}>{c.name}</span>
                      {c.is_decision_maker && <Star size={12} fill={t.gold} color={t.gold} />}
                    </div>
                    {c.role && <div style={{ fontSize: '12px', color: t.text.muted }}>{c.role}</div>}
                    {(c as any).accounts?.name && (
                      <div style={{ fontSize: '12px', color: t.text.secondary, marginTop: '2px' }}>
                        {(c as any).accounts?.id
                          ? <Link href={`/accounts/${(c as any).accounts.id}`} style={{ color: t.text.secondary, textDecoration: 'none' }}>{(c as any).accounts.name}</Link>
                          : (c as any).accounts.name}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {c.email && <a href={`mailto:${c.email}`} style={{ color: t.gold, display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontSize: '12px' }}><Mail size={14} />{c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} style={{ color: t.text.muted, display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontSize: '12px' }}><Phone size={14} />{c.phone}</a>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </LayoutShell>
  )
}
