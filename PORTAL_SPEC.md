# Client Portal Rebuild Spec

Western Peak client portal (`/portal/[slug]`). Version 1.2, October 30, 2026 (amended after the data audit; see DOUG_AUDIT.md Section 8).
Reference design: `design/portal-mockup.html` in this repo. Open it in a browser. The build must match it in layout, hierarchy, labels, and behavior. Where this document and the mockup disagree, this document wins.

## 0. Rules that override everything else

1. **Read the database, never write to it from this task.** No migrations, no inserts, no updates, no deletes. The portal is read-only for clients and this build adds no write paths except the two that already exist (file upload, account suggestion).
2. **Before touching code, run the backup:** `node scripts/backup.js "<connection string>"`. Confirm the `backups/<date>/` folder exists with `_summary.txt`. Add `backups/` to `.gitignore`.
3. **Every number on the page must trace to rows in Supabase.** No placeholder values, no estimates, no decorative metrics. If a value cannot be computed from the data, the element is hidden, not faked.
4. **The firm is Western Peak.** Remove every occurrence of "Barley Bros" and "barley-bros.com" from client-facing code (list in Section 11). Do not change email sender domains until `westernpeak.org` is verified in Resend; until then leave the `from:` addresses as they are and add a `// TODO: switch to westernpeak.org when Resend domain is verified` comment.
5. Work in a branch (`portal-v2`). Commit in small steps. Do not deploy to production; Sara deploys after review.
6. No new dependencies beyond what is in `package.json`, except `@next/font` is already available via `next/font/google`. Mapbox GL is already installed.
7. **An order is not a visit.** Many orders arrive by text. Never create or imply a visit from an order. The portal's first measure is therefore "Accounts worked" (visit or order in period) with the split shown underneath, and the timeline shows an order without a same-day visit as its own "Order" stop.
8. **Do not build anything on the `placements` table.** It holds 24 rows across all brands and is not maintained. "Stocked" is derived from order history (Section 4.7).
9. Keep `portal-metrics.ts` as the single source of truth for all calculations. Screen and PDF both read from one `PeriodReport`. Extend it; do not compute numbers inside components.

## 1. Files

| File | Action |
|---|---|
| `app/portal/[slug]/page.tsx` | Rewrite the layout and data orchestration. Keep auth flow (lines 91 to 122 today) unchanged. |
| `app/portal/[slug]/portal-ui.tsx` | Rewrite: new tokens, new components. |
| `app/portal/[slug]/portal-metrics.ts` | Extend: cumulative series, funnel, since-tracking totals, per-account rollups, product rollups, placement-location rollup, timeline events. Remove `wins`, `winRate`, `inProgress` from the KPI set. |
| `app/portal/[slug]/PortalReportPDF.tsx` | Rewrite: monthly one-page layout and quarterly one-page layout. |
| `app/portal/[slug]/PortalMap.tsx` | New: Mapbox map of accounts. |
| `app/lib/data.ts` → `getPortalData` | Extend the accounts fetch so portal receives `lat, lng, account_type` for accounts tied to this brand (tied = has a visit or order for the slug; do not use `account_clients`, which has 26 rows for 177 accounts). Read-only query change. |
| `migrations/069_portal_rls_and_hygiene.sql` | Write the file, do not run it. Contents: (a) replace `accounts_portal_read` with a policy scoped to accounts having a visit, order, or placement for `get_my_client_slug()`; (b) `UPDATE brand_commission_structures SET effective_to = current_date WHERE effective_to IS NULL` with a comment that `clients.commission_rate` is canonical; (c) `CREATE UNIQUE INDEX ... ON products (client_slug, lower(name)) WHERE active` (check for existing duplicates first and list them in a comment). Sara runs it after reading. |
| `design/portal-mockup.html` | Reference only. Do not import it. |

## 2. Data available (already returned by `getPortalData(slug)`)

- `client`: name, slug, color, logo_url, since_date, order_type, territory
- `visits`: id, account_id, visited_at, status, notes, accounts{id,name,address,account_type}, user_profiles{name}. Statuses: Just Ordered, New Placement, Menu Feature Won, Will Order Soon, Needs Follow Up, Tasted, General Check-In, Not Interested.
- `placements`: id, account_id, product_name, placement_type (well, shelf, menu, cocktail, retail, seasonal), status (committed, ordered, on_shelf, reordering), price_point, created_at, lost_at, accounts{id,name}
- `orders` (purchase_orders): id, po_number, deliver_to_name, total_amount, status (draft, sent, fulfilled, cancelled), order_type, created_at, sent_at, account_id, accounts{id,name}, po_line_items[] (product_name, quantity, unit_price or price, line_total)
- `events`: id, title, event_type (tasting, brand_dinner, meeting, planned_stop, milestone, training, other), start_time, status, accounts{name}
- `campaigns`, `registrations`, `suggestions`, `historyStartISO`
- Tasting consumer counts: `tasting_consumers` table joined by event id (check the actual table name in `data.ts`; `saveTastingConsumer` writes it).

Client-visible orders are `status in ('sent','fulfilled')` only. Order date is `sent_at ?? created_at`. Order value is `resolveTotal(order)` from `lib/formatters.ts`.

Visits are deduplicated to one per account per Mountain-Time day using the existing `dedupeByAccountDay`.

**Tracking start** for a brand = `min(first visit visited_at, first order date)` for that `client_slug`. Compute it from the data, do not hardcode. Label it "Tracking since {Month YYYY}".

## 3. Period model

Modes: `Last 30 days`, `Month`, `Quarter`, `Custom`. Month and Quarter have previous/next arrows; next is disabled when the period includes today. Custom shows two date inputs.

Comparison period label, used everywhere a comparison appears:
- Last 30 days → "previous 30 days"
- Month → "previous month"
- Quarter → "previous quarter"
- Custom → "previous {N} days"

A month or quarter that includes today is labeled "{Period} to date". Its end is today for calculations; its chart x-axis still spans the full month or quarter.

The period selection is kept in URL hash (`#2026-10`, `#q3-2026`, `#30d`, `#2026-09-15_2026-10-15`) so a link can be shared to a specific month.

## 4. Page structure, top to bottom

### 4.1 Toolbar (sticky)
Left: Western Peak mark + "Western Peak" / "Brand report". Right: period segmented control, prev/next, custom inputs, then three buttons: **Files**, **Suggest an account**, **Download report** (primary, filled). Staff preview adds a small "Preview" chip and the client/firm view toggle (Section 9). Password change and sign out move into an account menu (icon button) at the far right.

### 4.2 Identity
Client logo (from `logo_url`, fallback: first letter on accent-tinted square), client name as H1, "Represented since {Month YYYY}" (from `since_date`) + territory. Right side: period label, and "Compared with the {comparison label} · updated {time} MT".

### 4.3 Measures block (one bordered container)
Header row: left "{Period label}", right "Tracking since {Month YYYY}".

Three primary measures, equal columns:
1. **Accounts worked**: distinct `account_id` with a deduped visit or a client-visible order in period (union). Footnote: "{v} visited in person · {o} placed orders". Delta vs comparison period. Sparkline: last 6 calendar months. Footnote: "{all-time distinct accounts} accounts since {Mon} · {visits in period} visits this period".
2. **Orders**: count of client-visible orders in period. Delta. Sparkline. Footnote: "{all-time orders} orders since {Mon} · {distinct ordering accounts} accounts have ordered".
3. **Order value**: sum of order values in period, formatted `$8,940`. Delta in dollars. Sparkline. Footnote: "{all-time value} since {Mon} · {average order value} average order".

Big numbers count up on first render (800 ms, ease-out cubic). Respect `prefers-reduced-motion`.

Delta format: `▲ +4` / `▼ −2` / `— no change`, then " vs {comparison label}". Up is a muted green token, down a muted coral token. Dollars: `▲ +$1,320`.

Sparkline: 6 points (calendar months ending with the current month), thin line in `--bar`, 8% area fill, endpoint dot, month abbreviations under the first, middle and last points only if space allows, otherwise first and last.

Secondary strip (four cells, below a hairline):
- **Stocked accounts**: accounts with a client-visible order in the last 90 days (as of the period end). Label "Stocked accounts".
- **Reordering accounts**: accounts with 2+ client-visible orders all time, "of {accounts that ever ordered} that ordered".
- **New accounts**: accounts whose first ever client-visible order falls in the period, "{period label}".
- **Tastings held**: events with `event_type = 'tasting'` and `status != 'cancelled'` in period, "{period label}".

### 4.4 Order value chart (3/5 width) and funnel (2/5 width), equal height

**Order value**: cumulative sum of order value by day through the period, drawn as a 2.2px line in `--bar` with a soft glow (`drop-shadow(0 0 6px rgba(242,243,245,.35))`), gradient area beneath (16% to 0%), endpoint dot with glow and the running total as a label. Comparison period's cumulative curve as a 1.5px dashed line in `--ghost`, aligned by day index, with its final value labeled in `--mute` at its end. X axis spans the full month/quarter even when partial. Y axis: three gridlines, labels in `$Nk`. X labels: Month → Oct 1, Oct 8, Oct 15, Oct 22, Oct 29; Quarter → every ~2 weeks; 30 days → weekly; custom → ~7 labels. Line draws in over 1.1 s on render. Hover: vertical crosshair + dot on the curve + tooltip "{date} · {running total} to date / {n} orders this day / {comparison label} at this point: {value}". Subtitle: "{total} across {n} orders" + " so far" when partial. Legend: solid line "{period label}", dashed "{Comparison label}".

**From visit to order**: three horizontal bars, widths relative to the first.
1. Accounts worked {n} · "{visits} visits logged · {prior n} in the {comparison label}"
2. Placed an order {n} · "{first-time orderers} ordering for the first time · {prior n} in the {comparison label}". First-time = account whose earliest order ever falls in this period.
3. Have ordered more than once {n} · "of the {n ordered} that ordered". All-time 2+ orders among accounts that ordered in the period.
Subtitle: "{round(ordered/visited*100)}% of accounts visited placed an order". Bars animate from zero (scaleX) with 120 ms stagger.

### 4.5 Account map (full width, 320px tall, 10px radius)
Mapbox GL, dark style (`mapbox://styles/mapbox/dark-v11`), token from `NEXT_PUBLIC_MAPBOX_TOKEN`. Fit bounds to all accounts for this brand that have `lat/lng` and either a visit or an order. Markers:
- Stocked account (order in last 90 days): 6px circle, `--bar` at 90%.
- Account visited but not stocked: 5px circle, `--bar` at 45%.
- Account that ordered in the period: add a pulsing ring (CSS keyframe, 2 s, respects reduced motion).
Hover: tooltip with account name, type, last visit date, on-shelf count, period order value. Click: opens the account drawer (4.6). Header: "Account map"; subtitle: "{n} accounts · {m} stocked". If no geocoded accounts, hide the panel entirely.

### 4.6 Ledger (full width)
Tabs: **Accounts {n}**, **Orders {n}**, **Products {n}**. Below the tabs: a two-option segmented control "{Period label}" | "Since {Mon YYYY}" (scope), a search field, and a right-aligned summary line. Columns sortable by clicking headers (arrow shows direction; default sort is value descending, date descending on Orders). Show 12 rows, then "Show all {n}" button. Clicking an Account row or an Order row opens the account drawer. Products rows are not clickable.

Accounts columns: Account (name, sub-line "On-premise" or "Retail") · Last visit (latest of visit or order date) · Visits · Orders · Value (with a thin proportional bar to the right of the number) · All-time (only when scope is period) · Last order. Firm view adds **Cadence** (Section 9).

Orders columns: Date · PO · Account · Products ("2 cs Ridge Mountain Gin, 1 cs Single Malt"; strip " (Off-Premise)" suffixes) · Total · Status (tag; "Fulfilled" filled, "Sent" outlined).

Products columns: Product (sub-line "Retail size" for off-premise SKUs) · Cases (with proportional bar) · Value · Accounts ordering · Stocked at (accounts with this product in an order in the last 90 days).

Case counts come from `po_line_items.cases` (the column is `cases`, with `bottles` alongside; show cases, and bottles only when cases is null). If a line item is bottle-based rather than case-based, show the unit as stored; do not convert.

**Account drawer** (right side, 620px max): name, type, first visited date. Three stat cards: Orders all time, Value all time, Last order. Sections: Products ordered (product, cases all time, last ordered), Orders (lines, date, PO, status, total), Visits (last 10: note, date, outcome label).

### 4.7 Stocked accounts (1/2) and Tastings and events (1/2)
**Stocked accounts**: subtitle "{n} accounts ordered in the last 90 days". Three cells in one bordered row: Stocked "Ordered in the last 90 days" · Reordering "Two or more orders, all time" · New "First order in {period}". Then "BY PRODUCT": horizontal bars, one per product, value = number of distinct accounts that ordered that product in the last 90 days, top 8, from `po_line_items`. The `placements` table is not read.

**Tastings and events**: hide the whole panel when there are no events in the period (currently true for every brand). When present: subtitle "{t} tastings, {c} consumers signed up · {o} other events" (consumers from `tasting_consumers` joined on event id). Rows: date · account + event type label · consumer count for tastings. Labels: Tasting, Brand dinner, Buyer meeting, Staff training, Milestone; hide `planned_stop` and `other`. Max 7 rows.

### 4.8 Field activity (full width)
Timeline grouped by day, built from the union of deduped visits and client-visible orders. A visit and an order for the same account on the same day merge into one stop showing both; an order with no visit that day is its own stop labeled "Order". Left column: weekday, then "{Mon D} · {n} stops · {day order total}". Right: vertical rail with a node per stop. Filled node (with soft ring) for orders; hollow node for other visits.

Each stop: account name + "on-premise"/"retail"; then one line built from data, in this priority:
1. If an order exists for that account on that day: "**Ordered** 2 cs Ridge Mountain Gin, 1 cs Single Malt" (+ " · first order here" if it is that account's first ever order). Amount right-aligned.
2. Else if status is Menu Feature Won and a placement was created that day: "**Menu feature** · {product} on the {location}".
3. Else if status is Tasted: "**Tasting** · {notes}".
4. Else if status is Will Order Soon or Needs Follow Up: "**Follow-up** · {notes}".
5. Else: the visit notes.
Visits with status Not Interested are hidden in client view. Visits with status Needs Follow Up or Will Order Soon and an empty note show as "**Follow-up**" only. Notes are shown as logged; if a note is empty, show nothing after the label.

Filter control (segmented): Everything · Orders · Visits only. Show 16 stops, then "Show all {n}".

### 4.9 Footer
"Prepared by Western Peak · Updates as the field logs it · Mountain Time" left, "Questions: {primary contact name}" right (Chase Frakes).

## 5. Drawers

- **Files**: list of `client_files` for the brand (name, type, who uploaded, date, Open). Upload form: type select (Logo or brand asset, Product photo, Price sheet, Sell sheet, Other), file input, Upload. Keep existing upload code paths.
- **Suggest an account**: venue, address or town, reason select (They asked for us / Gap I noticed / Referral / Staff interest / High-volume, strong fit / Other), notes, Send. On success replace the form with "Sent to Chase." Uses existing `submitClientSuggestion` and notify route.
- **Report**: tabs Monthly | Quarterly; rendered preview of the page; "Download PDF" button; list of earlier reports (from a `reports` storage folder if it exists; otherwise show only the current period's download).

Escape closes drawers. Clicking the scrim closes. Focus is trapped inside while open.

## 6. PDF (react-pdf, `PortalReportPDF.tsx`)

Letter size, white background, `#111` text, grey rules. Fonts: register Schibsted Grotesk (regular, semibold) and DM Mono (regular) from Google Fonts TTF URLs with `Font.register`. All numbers in DM Mono.

**Monthly, exactly one page:**
1. Header: client name (17pt semibold), "Brand report · {Month YYYY}" under it; right side "Western Peak" and "Prepared {date}". 1.5pt rule beneath.
2. Three boxed figures: Accounts visited, Orders, Order value, each with "+N vs previous month" and (for accounts) "{n} visits".
3. "ORDER VALUE BY WEEK": small bar chart, one bar per week, value labels above bars in `$Nk`, week start dates beneath.
4. Two columns: left "TOP ACCOUNTS" table (top 10: account, orders, value); right "PRODUCTS ORDERED" (top 6: product, cases) and "ACCOUNTS" (stocked in last 90 days, reordering, new this month, tastings).
5. Footer: "Western Peak · Fort Collins, Colorado" left, "Questions: Chase Frakes" right.
Content must fit without overflow at the top-10 / top-6 limits. If a client has fewer rows, the page simply has whitespace at the bottom of those tables.

**Quarterly, exactly one page:**
1. Same header with "Quarterly report · Q{n} {YYYY}".
2. Grid: rows Accounts visited, Orders, Order value, New accounts, Tastings; columns the three months and a shaded Q total column.
3. "ORDER VALUE BY MONTH": three bars with labels.
4. Two columns: "TOP ACCOUNTS, QUARTER" (top 8) and "PRODUCTS ORDERED, QUARTER" (top 6).
5. Same footer.

File name: `{client-slug}-{YYYY-MM}.pdf` or `{client-slug}-Q{n}-{YYYY}.pdf`.

## 7. Design tokens (portal only, in `portal-ui.tsx`)

```
--bg:#0b0c0f; --surface:#111318; --raised:#171a20; --hover:#1c2028;
--line:rgba(242,243,245,.08); --line2:rgba(242,243,245,.045);
--ink:#f2f3f5; --ink2:#b4b9c2; --mute:#737a86; --faint:#474d58;
--bar:#e6e8ec; --bar2:#9aa0aa; --ghost:rgba(242,243,245,.18);
--accent: client.color (fallback #8fb6d9); --accent-ink: lightened 30%; --accent-soft: accent at 14%
--up:#8fd3b4; --dn:#f0a391
```
Accent is used only for: logo chip background/text, focus rings, the "slipping" cadence tag, links. Data marks are `--bar`/`--bar2`. No gold, no brown, no green/amber/red status pills.

Type: Schibsted Grotesk (400/500/600/700) for text, DM Mono (400/500) for every number, date, PO, code and uppercase label. Load via `next/font/google` scoped to the portal layout. Body 14.5px; minimum 12px anywhere; uppercase labels 11px with 0.04em tracking; H1 clamp(26px, 3vw, 34px); big measures 44px; section titles 16px/600.

Spacing: panels 14px radius, 1px `--line` border, 20px/22px padding, 14px gap between panels. Hairlines (`--line2`) between rows. Max content width 1180px. Side gutter min 16px.

Motion: count-up, curve draw, funnel grow, tile fade. All disabled under `prefers-reduced-motion: reduce`.

Mobile (≤ 980px): measures stack to one column; chart and funnel stack; ledger scrolls horizontally inside its panel; stocked accounts and events stack; timeline date column goes above the stops. Nothing on the page may cause horizontal page scroll.

## 8. Labels (exact strings)

Toolbar: Last 30 days · Month · Quarter · Custom · Files · Suggest an account · Download report
Measures: Accounts worked · Orders · Order value · Stocked accounts · Reordering accounts · New accounts · Tastings held
Charts: Order value · From account to order · Account map · Stocked accounts · By product
Ledger: Accounts · Orders · Products · Last visit · Visits · Orders · Value · All-time · On shelf · Date · PO · Account · Products · Total · Status · Product · Cases · Accounts ordering
Events: Tastings and events · Tasting · Brand dinner · Buyer meeting · Staff training · Milestone
Activity: Field activity · Everything · Orders · Visits only · Ordered · Menu feature · Tasting · Follow-up
Client-view outcome labels (visit status → label): Just Ordered → Ordered; New Placement → New placement; Menu Feature Won → Menu feature; Will Order Soon → Follow-up; Needs Follow Up → Follow-up; Tasted → Tasting; General Check-In → Visit; Not Interested → hidden.

Never show the words "wins", "win rate", "interest", "pace", "this period", "Barley Bros", "Doug" to a client.

## 9. Staff (firm) view

When the logged-in user is owner/admin/rep/intern, the page shows a "Preview" chip and a toggle "Client view | Western Peak view". Western Peak view adds, without changing layout:
- Raw visit status and rep name on every activity stop and in the account drawer.
- Not Interested visits shown.
- **Cadence** column in the Accounts tab: days since last order and a tag. Rule: average gap between this account's orders (needs 2+ orders); `since <= avg` → "on pace" (outlined tag); `since <= 1.5 × avg` → "slipping" (accent tag); otherwise "overdue" (coral-outlined tag). Accounts with fewer than 2 orders show nothing.
Portal-role users never see any of this; enforce by role check, not by CSS.

## 10. Metrics module additions (`portal-metrics.ts`)

Extend `PeriodReport` with:
- `trackingStart: string` (ISO), `allTime: { accounts, orders, value, orderingAccounts, reorderingAccounts, avgOrder }`
- `cumulative: { current: {date, value, orders}[], prior: {date, value}[] }`
- `funnel: { visited, visits, ordered, firstTime, repeat, priorVisited, priorOrdered }`
- `accountsLedger: { id, name, type, lastVisit, visits, orders, value, allTimeValue, onShelf, cadence?: {sinceDays, flag} }[]` for both scopes
- `ordersLedger` and `productsLedger` for both scopes
- `stocked: { accounts, reordering, newAccounts, byProduct: { product, accounts }[] }`
- `events: { id, date, account, type, consumers }[]`
- `timeline: { date, stops: { accountId, name, type, kind: 'order'|'placement'|'tasting'|'followup'|'visit'|'passed', text, amount?, status, rep }[] }[]`
Remove `wins`, `winRate`, `inProgress`, `outcomes`, `topAccounts`, `snapshot` entirely (it was placement-based). Keep `dedupeByAccountDay`, `resolveRange`, `delta`, date helpers. Unit-test the pure functions with a fixture (vitest or a plain node test file under `app/portal/[slug]/__tests__/`), at minimum: cumulative alignment across a month boundary, funnel first-time logic, cadence flags, dedupe.

## 11. Rename list (Barley Bros → Western Peak)

- `app/portal/[slug]/page.tsx`: header text (line ~461), footer (~642), drawer title "Suggest to Barley Bros" (~791).
- `app/portal/[slug]/PortalReportPDF.tsx`: `author`, eyebrow, two footers (barley-bros.com → westernpeak.org).
- `app/portal/[slug]/portal-ui.tsx`: comment.
- `app/layout-shell.tsx`: "by Barley Bros" (~190), "· Barley Bros" (~489).
- `app/api/send-email/route.ts` and `app/api/client-suggestion-notify/route.ts`: leave addresses, add TODO comments (Section 0.4). Recipient `sara@barley-bros.com` stays until she says otherwise.
- `CLAUDE.md`, `SPEC.md`: update firm name, client count, site URL (westernpeak.org). Replace "Barley Bros CRM" with "Doug".

## 12. Acceptance checklist

- [ ] Backup folder exists; `backups/` is gitignored.
- [ ] `/portal/noco-distillery` renders for a portal user with no console errors, on desktop and at 390px width, with no horizontal scroll.
- [ ] Every number on the screen can be reproduced by a SQL query against the same tables; write the query for each measure in a `PORTAL_METRICS.md` next to this file.
- [ ] Period switching updates every panel; URL hash reflects the period; prev/next disabled correctly.
- [ ] Comparison labels read exactly "previous month / previous quarter / previous 30 days / previous N days".
- [ ] Not Interested never appears for portal-role users; cadence never appears for portal-role users.
- [ ] Monthly PDF is one page for NoCo's real October data; quarterly PDF is one page for Q3.
- [ ] Map shows geocoded accounts; panel hidden when none.
- [ ] October 2026 for NoCo shows "Accounts worked" ≥ 17 with the footnote showing 3 visited in person; no number on the page implies the orders were visits.
- [ ] Nothing reads the `placements` table.
- [ ] Zero occurrences of "Barley Bros" in `app/portal/**` and `app/layout-shell.tsx`.
- [ ] `npm run typecheck` and `npm run lint` pass.
- [ ] Screenshots of client view and firm view at 1280px and 390px saved to `design/screens/` for Sara's review.
