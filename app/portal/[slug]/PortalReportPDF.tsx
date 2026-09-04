// Printable brand report. Rendered client-side with @react-pdf/renderer so the
// viewer gets a real PDF file (not a browser print dialog), on phone or desktop.
// Everything here reads from the same PeriodReport the on-screen portal uses.

import React from 'react'
import { Document, Page, Text, View, StyleSheet, Svg, Rect, Line, Path, Circle, Image } from '@react-pdf/renderer'
import {
  type PeriodReport, type Delta,
  OUTCOME_GROUP_COLOR, OUTCOME_DESCRIPTION, PIPELINE_LABEL,
  formatDelta, toMs, mtShortDate, outcomeGroup as outcomeGroupOf,
} from './portal-metrics'

const INK = '#141210'
const INK_2 = '#5b574f'
const MUTED = '#8f8a80'
const RULE = '#e6e2da'
const SURFACE = '#f6f4ef'

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 48, fontFamily: 'Helvetica', fontSize: 9.5, color: INK },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  brand: { fontSize: 24, fontFamily: 'Helvetica-Bold', letterSpacing: -0.6 },
  sub: { fontSize: 9, color: INK_2, marginTop: 3 },
  eyebrow: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.2 },
  h2: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK_2, textTransform: 'uppercase', letterSpacing: 1.1, marginTop: 20, marginBottom: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: RULE },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  kpi: { width: '25%', paddingHorizontal: 4, marginBottom: 8 },
  kpiBox: { backgroundColor: SURFACE, borderRadius: 5, padding: 10 },
  kpiLabel: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.9 },
  kpiValue: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginTop: 4, letterSpacing: -0.5 },
  kpiDelta: { fontSize: 7.5, marginTop: 3 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: RULE },
  th: { fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: RULE, flexDirection: 'row' },
  cell: { fontSize: 8.5 },
  chip: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#fff', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  footer: { position: 'absolute', bottom: 28, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
  twoCol: { flexDirection: 'row', marginHorizontal: -8 },
  col: { flex: 1, paddingHorizontal: 8 },
  note: { fontSize: 7.5, color: MUTED, marginTop: 4, lineHeight: 1.4 },
})

function deltaColor(d: Delta, upIsGood = true): string {
  if (d.dir === 'flat') return MUTED
  const good = d.dir === 'up' ? upIsGood : !upIsGood
  return good ? '#1a7f54' : '#b8412b'
}

function Kpi({ label, value, d, unit, upIsGood = true, priorLabel }: {
  label: string; value: string; d: Delta; unit?: 'count' | 'pts' | 'dollars'; upIsGood?: boolean; priorLabel: string
}) {
  return (
    <View style={s.kpi}>
      <View style={s.kpiBox}>
        <Text style={s.kpiLabel}>{label}</Text>
        <Text style={s.kpiValue}>{value}</Text>
        <Text style={{ ...s.kpiDelta, color: deltaColor(d, upIsGood) }}>
          {formatDelta(d, unit)} vs {priorLabel}
        </Text>
      </View>
    </View>
  )
}

// Current period as bars, prior period as a gray line — same encoding as the screen.
function TrendChart({ report, accent }: { report: PeriodReport; accent: string }) {
  const W = 500, H = 130, padL = 26, padB = 20, padT = 8
  const data = report.trend
  const max = Math.max(1, ...data.map(b => Math.max(b.current, b.prior)))
  const plotW = W - padL - 6, plotH = H - padB - padT
  const slot = plotW / Math.max(1, data.length)
  const barW = Math.min(14, Math.max(3, slot * 0.55))
  const y = (v: number) => padT + plotH - (v / max) * plotH
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max]
  const labelEvery = Math.ceil(data.length / 8)
  const priorPath = data.map((b, i) => `${i === 0 ? 'M' : 'L'}${padL + i * slot + slot / 2},${y(b.prior)}`).join(' ')
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {ticks.map(t => (
        <React.Fragment key={t}>
          <Line x1={padL} y1={y(t)} x2={W - 6} y2={y(t)} stroke={RULE} strokeWidth={0.6} />
          <Text x={padL - 5} y={y(t) + 2.5} style={{ fontSize: 6.5, fill: MUTED, textAnchor: 'end' } as any}>{String(t)}</Text>
        </React.Fragment>
      ))}
      {data.map((b, i) => (
        <Rect key={i} x={padL + i * slot + (slot - barW) / 2} y={y(b.current)} width={barW} height={Math.max(0, padT + plotH - y(b.current))} fill={accent} rx={1.5} />
      ))}
      {data.length > 1 && <Path d={priorPath} stroke="#9a958b" strokeWidth={1.4} fill="none" />}
      {data.map((b, i) => (
        <Circle key={`p${i}`} cx={padL + i * slot + slot / 2} cy={y(b.prior)} r={1.8} fill="#9a958b" />
      ))}
      {data.map((b, i) => (i % labelEvery === 0 || i === data.length - 1) && (
        <Text key={`l${i}`} x={padL + i * slot + slot / 2} y={H - 6} style={{ fontSize: 6.5, fill: MUTED, textAnchor: 'middle' } as any}>{b.label}</Text>
      ))}
    </Svg>
  )
}

function BarRow({ label, sub, value, max, color, right }: { label: string; sub?: string; value: number; max: number; color: string; right: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <View style={{ marginBottom: 7 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginRight: 5 }} />
          <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>{label}</Text>
          {sub ? <Text style={{ fontSize: 7.5, color: MUTED, marginLeft: 5 }}>{sub}</Text> : null}
        </View>
        <Text style={{ fontSize: 8.5, color: INK_2 }}>{right}</Text>
      </View>
      <View style={{ height: 4, backgroundColor: SURFACE, borderRadius: 2 }}>
        <View style={{ width: `${pct}%`, height: 4, backgroundColor: color, borderRadius: 2 }} />
      </View>
    </View>
  )
}

export function PortalReportPDF({ report, clientName, logoUrl, accent, isDistributor, generatedAt, placements }: {
  report: PeriodReport
  clientName: string
  logoUrl: string | null
  accent: string
  isDistributor: boolean
  generatedAt: string
  placements: { product_name: string; status: string; placement_type?: string | null; accounts?: { name: string } | null }[]
}) {
  const { kpis, range } = report
  const maxOutcome = Math.max(1, ...report.outcomes.map(o => o.current))
  const byDollars = report.topAccounts.some(a => a.orderValue > 0)
  const maxAcct = Math.max(1, ...report.topAccounts.map(a => byDollars ? a.orderValue : a.visits))
  const orderNoun = isDistributor ? 'Inquiries' : 'Orders'
  const visitsForTable = report.visits.slice(0, 60)

  return (
    <Document title={`${clientName} — Field Report — ${range.label}`} author="Barley Bros">
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>Barley Bros · Field Report</Text>
            <Text style={s.brand}>{clientName}</Text>
            <Text style={s.sub}>{range.label} · compared with {range.priorLabel}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
          {logoUrl ? <Image src={logoUrl} style={{ height: 34, width: 90, objectFit: 'contain' }} /> : null}
        </View>

        {/* KPIs */}
        <View style={s.kpiGrid}>
          <Kpi label="Visits" value={String(kpis.visits.current)} d={kpis.visits} priorLabel={range.priorLabel} />
          <Kpi label="Accounts reached" value={String(kpis.accountsReached.current)} d={kpis.accountsReached} priorLabel={range.priorLabel} />
          <Kpi label="Field wins" value={String(kpis.wins.current)} d={kpis.wins} priorLabel={range.priorLabel} />
          <Kpi label="Win rate" value={`${kpis.winRate.current}%`} d={kpis.winRate} unit="pts" priorLabel={range.priorLabel} />
          <Kpi label={orderNoun} value={String(kpis.orders.current)} d={kpis.orders} priorLabel={range.priorLabel} />
          {report.hasOrderValue
            ? <Kpi label="Order value" value={`$${kpis.orderValue.current.toLocaleString()}`} d={kpis.orderValue} unit="dollars" priorLabel={range.priorLabel} />
            : <Kpi label="In progress" value={String(kpis.inProgress.current)} d={kpis.inProgress} priorLabel={range.priorLabel} />}
          <Kpi label="New placements" value={String(kpis.newPlacements.current)} d={kpis.newPlacements} priorLabel={range.priorLabel} />
          <Kpi label="Events & tastings" value={String(kpis.events.current)} d={kpis.events} priorLabel={range.priorLabel} />
        </View>

        {/* Trend */}
        <Text style={s.h2}>Visit activity</Text>
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
            <View style={{ width: 8, height: 8, backgroundColor: accent, borderRadius: 1.5, marginRight: 4 }} /><Text style={{ fontSize: 7.5, color: INK_2 }}>{range.label}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 12, height: 1.4, backgroundColor: '#9a958b', marginRight: 4 }} /><Text style={{ fontSize: 7.5, color: INK_2 }}>{range.priorLabel}</Text>
          </View>
        </View>
        <TrendChart report={report} accent={accent} />

        <View style={s.twoCol}>
          {/* Outcomes */}
          <View style={s.col}>
            <Text style={s.h2}>Visit outcomes</Text>
            {report.outcomes.length === 0 && <Text style={s.note}>No visits in this period.</Text>}
            {report.outcomes.map(o => (
              <BarRow key={o.status} label={o.status} sub={OUTCOME_DESCRIPTION[o.status]} value={o.current} max={maxOutcome}
                color={OUTCOME_GROUP_COLOR[o.group]} right={`${o.current}  (${o.pct}%)  · prior ${o.prior}`} />
            ))}
          </View>
          {/* Top accounts */}
          <View style={s.col}>
            <Text style={s.h2}>Top accounts</Text>
            {report.topAccounts.length === 0 && <Text style={s.note}>No account activity in this period.</Text>}
            {report.topAccounts.map(a => {
              const detail = [
                a.orders > 0 ? `${a.orders} order${a.orders === 1 ? '' : 's'}` : null,
                a.visits > 0 ? `${a.visits} visit${a.visits === 1 ? '' : 's'}` : null,
                a.wins > 0 ? `${a.wins} win${a.wins > 1 ? 's' : ''}` : null,
              ].filter(Boolean).join(' · ')
              return (
                <BarRow key={a.id} label={a.name} value={byDollars ? a.orderValue : a.visits} max={maxAcct}
                  color={a.orderValue > 0 ? accent : '#b5b0a6'}
                  right={a.orderValue > 0 ? `$${a.orderValue.toLocaleString()}` : `${a.visits} visit${a.visits === 1 ? '' : 's'}`}
                  sub={detail} />
              )
            })}
          </View>
        </View>

        {/* Snapshot */}
        <Text style={s.h2}>Placements as of {generatedAt}</Text>
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          <Text style={{ fontSize: 8.5, marginRight: 16 }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>{report.snapshot.activePlacements}</Text> active placements</Text>
          <Text style={{ fontSize: 8.5, marginRight: 16 }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>{report.snapshot.onShelf}</Text> on shelf</Text>
          {report.snapshot.reach.pct !== null && (
            <Text style={{ fontSize: 8.5, marginRight: 16 }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>{report.snapshot.reach.pct}%</Text> of accounts visited this period are buying</Text>
          )}
          {report.snapshot.repeat.pct !== null && (
            <Text style={{ fontSize: 8.5 }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>{report.snapshot.repeat.repeatAccounts} of {report.snapshot.repeat.ordering}</Text> accounts that ordered have reordered</Text>
          )}
        </View>
        {report.snapshot.pipeline.length > 0 && (
          <View style={{ flexDirection: 'row', height: 10, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
            {report.snapshot.pipeline.map((p, i) => (
              <View key={p.status} style={{ width: `${(p.count / report.snapshot.activePlacements) * 100}%`, backgroundColor: ['#8f7440', '#b3935a', '#c4a46e', '#dcc79a'][i] || accent, marginRight: i < report.snapshot.pipeline.length - 1 ? 1.5 : 0 }} />
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {report.snapshot.pipeline.map((p, i) => (
            <View key={p.status} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ['#8f7440', '#b3935a', '#c4a46e', '#dcc79a'][i] || accent, marginRight: 4 }} />
              <Text style={{ fontSize: 7.5, color: INK_2 }}>{p.label} · {p.count}</Text>
            </View>
          ))}
        </View>

        <View style={s.footer} fixed>
          <Text>Prepared by Barley Bros · barley-bros.com</Text>
          <Text render={({ pageNumber, totalPages }) => `Generated ${generatedAt} · Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      {/* Detail pages */}
      <Page size="LETTER" style={s.page}>
        <Text style={s.eyebrow}>{clientName} · {range.label}</Text>
        <Text style={s.h2}>Field activity ({report.visits.length} visit{report.visits.length === 1 ? '' : 's'})</Text>
        <View style={s.th}>
          <Text style={{ width: '14%' }}>Date</Text>
          <Text style={{ width: '30%' }}>Account</Text>
          <Text style={{ width: '20%' }}>Outcome</Text>
          <Text style={{ width: '36%' }}>Notes</Text>
        </View>
        {visitsForTable.length === 0 && <Text style={s.note}>No visits in this period.</Text>}
        {visitsForTable.map(v => (
          <View key={v.id} style={s.row} wrap={false}>
            <Text style={{ ...s.cell, width: '14%', color: INK_2 }}>{mtShortDate(toMs(v.visited_at))}</Text>
            <Text style={{ ...s.cell, width: '30%', fontFamily: 'Helvetica-Bold' }}>{v.accounts?.name || 'Account'}</Text>
            <View style={{ width: '20%', flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: OUTCOME_GROUP_COLOR[outcomeGroupOf(v.status)], marginRight: 4 }} />
              <Text style={s.cell}>{v.status}</Text>
            </View>
            <Text style={{ ...s.cell, width: '36%', color: INK_2 }}>{(v.notes || '').slice(0, 140)}</Text>
          </View>
        ))}
        {report.visits.length > visitsForTable.length && (
          <Text style={s.note}>Showing the {visitsForTable.length} most recent of {report.visits.length} visits. The full log is available in the online portal.</Text>
        )}

        {report.orders.length > 0 && (
          <>
            <Text style={s.h2}>{orderNoun} in period ({report.orders.length})</Text>
            <View style={s.th}>
              <Text style={{ width: '16%' }}>Date</Text>
              <Text style={{ width: '44%' }}>Deliver to</Text>
              <Text style={{ width: '20%' }}>Status</Text>
              <Text style={{ width: '20%', textAlign: 'right' }}>Amount</Text>
            </View>
            {report.orders.map(o => {
              const total = Number((o as any).total_amount) || 0
              return (
                <View key={o.id} style={s.row} wrap={false}>
                  <Text style={{ ...s.cell, width: '16%', color: INK_2 }}>{mtShortDate(toMs(o.sent_at || o.created_at))}</Text>
                  <Text style={{ ...s.cell, width: '44%', fontFamily: 'Helvetica-Bold' }}>{o.deliver_to_name || o.accounts?.name || 'Order'}{o.po_number ? `  ·  PO ${o.po_number}` : ''}</Text>
                  <Text style={{ ...s.cell, width: '20%', color: INK_2 }}>{o.status === 'fulfilled' ? 'Delivered' : isDistributor ? 'Sent to distributor' : 'Submitted'}</Text>
                  <Text style={{ ...s.cell, width: '20%', textAlign: 'right' }}>{total > 0 ? `$${total.toLocaleString()}` : '—'}</Text>
                </View>
              )
            })}
          </>
        )}

        {placements.length > 0 && (
          <>
            <Text style={s.h2}>Active placements ({placements.length})</Text>
            <View style={s.th}>
              <Text style={{ width: '40%' }}>Account</Text>
              <Text style={{ width: '36%' }}>Product</Text>
              <Text style={{ width: '24%' }}>Stage</Text>
            </View>
            {placements.map((p, i) => (
              <View key={i} style={s.row} wrap={false}>
                <Text style={{ ...s.cell, width: '40%', fontFamily: 'Helvetica-Bold' }}>{p.accounts?.name || '—'}</Text>
                <Text style={{ ...s.cell, width: '36%' }}>{p.product_name}{p.placement_type ? ` · ${p.placement_type}` : ''}</Text>
                <Text style={{ ...s.cell, width: '24%', color: INK_2 }}>{PIPELINE_LABEL[p.status] || p.status}</Text>
              </View>
            ))}
          </>
        )}

        <View style={s.footer} fixed>
          <Text>Prepared by Barley Bros · barley-bros.com</Text>
          <Text render={({ pageNumber, totalPages }) => `Generated ${generatedAt} · Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

