// One-page monthly and quarterly brand reports, rendered client-side with
// @react-pdf/renderer. Every number comes from portal-metrics.ts (the same data
// the on-screen preview shows), so the PDF can never disagree with the page.

import React from 'react'
import { Document, Page, Text, View, StyleSheet, Svg, Rect, Line, Font, Image, Link } from '@react-pdf/renderer'
import { WESTERN_PEAK_LOGO_ON_LIGHT_URL } from '../../lib/constants'
import { type MonthlyPdfData, type QuarterlyPdfData, formatPdfDelta, money, moneyK, unitLabel } from './portal-metrics'

export const FIRM_NAME = 'Western Peak'
export const FIRM_CITY = 'Fort Collins, Colorado'
export const FIRM_CONTACT_EMAIL = 'chase@westernpeak.org'

const SANS = 'Schibsted Grotesk'
const MONO = 'DM Mono'

let registered = false
export function registerPortalFonts() {
  if (registered) return
  registered = true
  Font.register({
    family: SANS,
    fonts: [
      { src: 'https://fonts.gstatic.com/s/schibstedgrotesk/v7/JqzK5SSPQuCQF3t8uOwiUL-taUTtarVKQ9vZ6pJJWlMNIsEATw.ttf', fontWeight: 400 },
      { src: 'https://fonts.gstatic.com/s/schibstedgrotesk/v7/JqzK5SSPQuCQF3t8uOwiUL-taUTtarVKQ9vZ6pJJWlMN_MYATw.ttf', fontWeight: 600 },
    ],
  })
  Font.register({ family: MONO, fonts: [{ src: 'https://fonts.gstatic.com/s/dmmono/v16/aFTU7PB1QTsUX8KYhh0.ttf', fontWeight: 400 }] })
  Font.registerHyphenationCallback(word => [word])
}

const INK = '#111', GREY = '#666', RULE = '#ddd', RULE2 = '#eee'

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 34, paddingHorizontal: 40, fontFamily: SANS, fontSize: 9, color: INK, backgroundColor: '#fff', display: 'flex', flexDirection: 'column' },
  hd: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1.5, borderBottomColor: INK, paddingBottom: 8, marginBottom: 14 },
  name: { fontSize: 17, fontWeight: 600, letterSpacing: -0.3 },
  sub: { fontSize: 9, color: GREY, marginTop: 2 },
  pr: { fontSize: 9, color: GREY, textAlign: 'right', lineHeight: 1.4 },
  fig3: { flexDirection: 'row', marginHorizontal: -5, marginBottom: 14 },
  fig: { flex: 1, marginHorizontal: 5, borderWidth: 1, borderColor: RULE, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10 },
  figK: { fontSize: 8.5, color: GREY },
  figV: { fontFamily: MONO, fontSize: 19, fontWeight: 600, marginVertical: 2, letterSpacing: -0.3 },
  figC: { fontSize: 8.5, color: '#444' },
  h5: { fontFamily: MONO, fontSize: 8, letterSpacing: 0.6, textTransform: 'uppercase', color: GREY, marginBottom: 5 },
  two: { flexDirection: 'row', marginHorizontal: -7, flexGrow: 1 },
  col3: { flex: 3, marginHorizontal: 7 },
  col2: { flex: 2, marginHorizontal: 7 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 3, marginBottom: 1 },
  thT: { fontFamily: MONO, fontSize: 7.5, color: GREY, textTransform: 'uppercase', letterSpacing: 0.4 },
  tr: { flexDirection: 'row', paddingVertical: 3.5, borderBottomWidth: 1, borderBottomColor: RULE2 },
  td: { fontSize: 8.5 },
  tdM: { fontFamily: MONO, fontSize: 8.5, textAlign: 'right' },
  ft: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: RULE, paddingTop: 6, fontSize: 8, color: '#777' },
  grid: { flexDirection: 'column', marginBottom: 14 },
  gRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: RULE2 },
  gLabel: { flex: 1.2, paddingVertical: 5, paddingHorizontal: 6, fontSize: 9 },
  gCell: { flex: 1, paddingVertical: 5, paddingHorizontal: 6, fontFamily: MONO, fontSize: 9 },
  gTot: { flex: 1.1, paddingVertical: 5, paddingHorizontal: 6, fontFamily: MONO, fontSize: 9, fontWeight: 600, backgroundColor: '#f4f4f5' },
  gHead: { fontFamily: MONO, fontSize: 7.5, color: GREY, textTransform: 'uppercase', letterSpacing: 0.4 },
})

function Bars({ bars }: { bars: { label: string; value: number }[] }) {
  const W = 520, max = Math.max(1, ...bars.map(b => b.value)), bw = W / Math.max(1, bars.length)
  return (
    <Svg width={W} height={84} viewBox={`0 0 ${W} 84`} style={{ width: '100%' }}>
      {bars.map((b, i) => {
        const h = (b.value / max) * 44, x = i * bw + bw * 0.25
        return (
          <React.Fragment key={b.label}>
            <Rect x={x} y={66 - h} width={bw * 0.5} height={h} fill={INK} rx={1} />
            <Text x={x + bw * 0.25} y={62 - h} style={{ fontFamily: MONO, fontSize: 7, fill: INK, textAnchor: 'middle' } as never}>{moneyK(b.value)}</Text>
            <Text x={x + bw * 0.25} y={78} style={{ fontFamily: MONO, fontSize: 7, fill: GREY, textAnchor: 'middle' } as never}>{b.label}</Text>
          </React.Fragment>
        )
      })}
      <Line x1={0} x2={W} y1={66.5} y2={66.5} stroke="#999" strokeWidth={0.5} />
    </Svg>
  )
}

function Header({ clientName, line, preparedOn }: { clientName: string; line: string; preparedOn: string }) {
  return (
    <View style={s.hd}>
      <View><Text style={s.name}>{clientName}</Text><Text style={s.sub}>{line}</Text></View>
      <View style={{ alignItems: 'flex-end' }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
        <Image src={WESTERN_PEAK_LOGO_ON_LIGHT_URL} style={{ height: 22, width: 66, objectFit: 'contain', marginBottom: 3 }} />
        <Text style={s.pr}>Prepared {preparedOn}</Text>
      </View>
    </View>
  )
}

function Footer() {
  return <View style={s.ft}><Text>{FIRM_NAME} · {FIRM_CITY}</Text><Text>Questions: <Link src={`mailto:${FIRM_CONTACT_EMAIL}`} style={{ color: '#777', textDecoration: 'none' }}>{FIRM_CONTACT_EMAIL}</Link></Text></View>
}

function AccountsTable({ rows }: { rows: { name: string; orders: number; value: number }[] }) {
  return (
    <View>
      <View style={s.th}><Text style={{ ...s.thT, flex: 3 }}>Account</Text><Text style={{ ...s.thT, flex: 1, textAlign: 'right' }}>Orders</Text><Text style={{ ...s.thT, flex: 1.4, textAlign: 'right' }}>Value</Text></View>
      {rows.map(a => (
        <View key={a.name} style={s.tr}><Text style={{ ...s.td, flex: 3 }}>{a.name}</Text><Text style={{ ...s.tdM, flex: 1 }}>{a.orders}</Text><Text style={{ ...s.tdM, flex: 1.4 }}>{money(a.value)}</Text></View>
      ))}
    </View>
  )
}

function ProductsTable({ rows }: { rows: { name: string; retail: boolean; cases: number; bottles: number }[] }) {
  return (
    <View>
      {rows.map(p => (
        <View key={p.name + (p.retail ? '-r' : '')} style={s.tr}><Text style={{ ...s.td, flex: 3 }}>{p.name}{p.retail ? ' · retail' : ''}</Text><Text style={{ ...s.tdM, flex: 1.2 }}>{unitLabel(p)}</Text></View>
      ))}
    </View>
  )
}

export function MonthlyReportPDF({ data, clientName, preparedOn }: { data: MonthlyPdfData; clientName: string; preparedOn: string }) {
  registerPortalFonts()
  const figs: [string, string, string][] = [
    ['Accounts visited', String(data.accountsWorked.current), `${formatPdfDelta(data.accountsWorked, 'count', data.compareLabel)} · ${data.visits} visit${data.visits === 1 ? '' : 's'}`],
    ['Orders', String(data.orders.current), formatPdfDelta(data.orders, 'count', data.compareLabel)],
    ['Order value', money(data.value.current), formatPdfDelta(data.value, 'dollars', data.compareLabel)],
  ]
  return (
    <Document title={`${clientName} — Brand report — ${data.label}`} author={FIRM_NAME}>
      <Page size="LETTER" style={s.page}>
        <Header clientName={clientName} line={`Brand report · ${data.label}`} preparedOn={preparedOn} />
        <View style={s.fig3}>
          {figs.map(([k, v, c]) => <View key={k} style={s.fig}><Text style={s.figK}>{k}</Text><Text style={s.figV}>{v}</Text><Text style={s.figC}>{c}</Text></View>)}
        </View>
        <View style={{ marginBottom: 14 }}><Text style={s.h5}>Order value by week</Text><Bars bars={data.weeks} /></View>
        <View style={s.two}>
          <View style={s.col3}><Text style={s.h5}>Top accounts</Text><AccountsTable rows={data.topAccounts} /></View>
          <View style={s.col2}>
            <Text style={s.h5}>Products ordered</Text><ProductsTable rows={data.products} />
            <Text style={{ ...s.h5, marginTop: 10 }}>Accounts</Text>
            {[['Active (ordered in the last 90 days)', data.active.accounts], ['Reordering', data.active.reorderingAccounts], ['New this month', data.active.newThisMonth], ['Tastings', data.active.tastings]].map(([k, v]) => (
              <View key={String(k)} style={s.tr}><Text style={{ ...s.td, flex: 3 }}>{k}</Text><Text style={{ ...s.tdM, flex: 1 }}>{v}</Text></View>
            ))}
          </View>
        </View>
        <Footer />
      </Page>
    </Document>
  )
}

export function QuarterlyReportPDF({ data, clientName, preparedOn }: { data: QuarterlyPdfData; clientName: string; preparedOn: string }) {
  registerPortalFonts()
  const row = (label: string, k: 'accountsWorked' | 'orders' | 'value' | 'newAccounts' | 'tastings', fmt: (n: number) => string) => (
    <View key={k} style={s.gRow}>
      <Text style={s.gLabel}>{label}</Text>
      {data.months.map(m => <Text key={m.key} style={s.gCell}>{fmt(m[k])}</Text>)}
      <Text style={s.gTot}>{fmt(data.totals[k])}</Text>
    </View>
  )
  return (
    <Document title={`${clientName} — Quarterly report — ${data.label}`} author={FIRM_NAME}>
      <Page size="LETTER" style={s.page}>
        <Header clientName={clientName} line={`Quarterly report · ${data.label}`} preparedOn={preparedOn} />
        <View style={s.grid}>
          <View style={s.gRow}>
            <Text style={s.gLabel} />
            {data.months.map(m => <Text key={m.key} style={{ ...s.gCell, ...s.gHead }}>{m.label}</Text>)}
            <Text style={{ ...s.gTot, ...s.gHead, fontWeight: 600 }}>Q{data.q}</Text>
          </View>
          {row('Accounts visited', 'accountsWorked', String)}
          {row('Orders', 'orders', String)}
          {row('Order value', 'value', money)}
          {row('New accounts', 'newAccounts', String)}
          {row('Tastings', 'tastings', String)}
        </View>
        <View style={{ marginBottom: 14 }}><Text style={s.h5}>Order value by month</Text><Bars bars={data.months.map(m => ({ label: m.label, value: m.value }))} /></View>
        <View style={s.two}>
          <View style={s.col3}><Text style={s.h5}>Top accounts, quarter</Text><AccountsTable rows={data.topAccounts} /></View>
          <View style={s.col2}><Text style={s.h5}>Products ordered, quarter</Text><ProductsTable rows={data.products} /></View>
        </View>
        <Footer />
      </Page>
    </Document>
  )
}
