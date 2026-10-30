# Portal metrics: SQL for every number on the page

Every value the client portal shows is computed in `app/portal/[slug]/portal-metrics.ts` from rows in Supabase. This file gives the SQL that reproduces each one, using NoCo Distillery's real data for **October 2026 to date** (as of October 30, 2026, noon Mountain Time) as the worked example. Run the queries in Supabase → SQL Editor.

Three rules from `PORTAL_SPEC.md` 1.1 shape every query:

- **An order implies a visit.** "Accounts visited" is the union of accounts with a deduplicated visit row and accounts with a client-visible order in the period.
- **Client-visible orders** are `purchase_orders.status IN ('sent', 'fulfilled')`; the order date is `COALESCE(sent_at, created_at)`.
- **The `placements` table is never read.** "Stocked" means ordered in the 90 days ending at the period end.

All dates are Mountain Time. `visits.visited_at` and `purchase_orders.created_at` are stored as UTC timestamps without a zone; `sent_at` is a `timestamptz`.

Worked-example values were produced by running the metrics module against the 2026-10-30 backup export (the same rows the queries read) with `node app/portal/[slug]/__tests__/run.js` passing. The SQL below is written against the live schema; run it to confirm the same numbers.

## 0. Shared setup

Every query below assumes these CTEs (paste them above the query you want to run).

```sql
WITH params AS (
  SELECT 'noco-distillery'::text AS slug,
         date '2026-10-01' AS p_start, date '2026-10-30' AS p_end,     -- period (to date)
         date '2026-09-01' AS q_start, date '2026-09-30' AS q_end      -- comparison period
),
-- Visits, one row per account per Mountain-Time day (the dedupe the portal applies).
v AS (
  SELECT DISTINCT account_id,
         (visited_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date AS day
  FROM visits, params
  WHERE visits.client_slug = params.slug AND account_id IS NOT NULL
),
-- Client-visible orders with their Mountain-Time day and portal value
-- (resolveTotal: the sum of line totals when the order has line items, else total_amount).
o AS (
  SELECT po.id, po.account_id, po.po_number, po.status,
         (COALESCE(po.sent_at, po.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Denver')::date AS day,
         COALESCE(NULLIF((SELECT sum(li.total) FROM po_line_items li WHERE li.po_id = po.id), 0), po.total_amount, 0) AS value
  FROM purchase_orders po, params
  WHERE po.client_slug = params.slug AND po.status IN ('sent', 'fulfilled')
),
-- "Visited" account-days: visits ∪ orders.
reached AS (
  SELECT account_id, day FROM v
  UNION
  SELECT account_id, day FROM o WHERE account_id IS NOT NULL
),
first_order AS (
  SELECT account_id, min(day) AS first_day, count(*) AS n_orders FROM o GROUP BY account_id
)
```

> Note on value: `resolveTotal` is the spec's definition and sums `po_line_items.total`. Ten NoCo orders carry a `discount_amount`, so their `total_amount` is lower than the sum of line totals (about $250 in total across the ten). The portal follows the spec and shows the pre-discount line total.

## 1. Identity and header

| Element | Source | NoCo |
|---|---|---|
| Represented since | `clients.since_date` → month | January 2024 |
| Territory | `clients.territory` | Northern Colorado |
| Tracking since | earliest of first visit and first order (query below) | April 2026 |

```sql
SELECT least(min(v.day), min(o.day)) AS tracking_start FROM v, o;   -- 2026-04-16
```

## 2. Measures block

### Accounts visited (9, previous month 24, ▼ −15)

```sql
SELECT
  (SELECT count(DISTINCT account_id) FROM reached, params WHERE day BETWEEN p_start AND p_end) AS current,   -- 9
  (SELECT count(DISTINCT account_id) FROM reached, params WHERE day BETWEEN q_start AND q_end) AS prior;     -- 24
```

Footnote "{all-time accounts} accounts since Apr · {visits} visits logged":

```sql
SELECT (SELECT count(DISTINCT account_id) FROM reached) AS all_time_accounts,                 -- 105
       (SELECT count(*) FROM v, params WHERE day BETWEEN p_start AND p_end) AS visits_logged;  -- 0
```

### Orders (17, previous month 11, ▲ +6)

```sql
SELECT (SELECT count(*) FROM o, params WHERE day BETWEEN p_start AND p_end) AS current,  -- 17
       (SELECT count(*) FROM o, params WHERE day BETWEEN q_start AND q_end) AS prior;    -- 11
```

Footnote "{all-time orders} orders since Apr · {accounts} accounts have ordered":

```sql
SELECT count(*) AS all_orders, count(DISTINCT account_id) AS ordering_accounts FROM o;   -- 81, 32
```

### Order value ($13,143, previous month $3,611, ▲ +$9,531)

```sql
SELECT (SELECT round(sum(value), 2) FROM o, params WHERE day BETWEEN p_start AND p_end) AS current,  -- 13142.54
       (SELECT round(sum(value), 2) FROM o, params WHERE day BETWEEN q_start AND q_end) AS prior;    -- 3611.47
```

Footnote "{all-time value} since Apr · {average} average order":

```sql
SELECT round(sum(value), 2) AS all_value, round(avg(value), 2) AS avg_order FROM o;   -- 33044.25, 407.95
```

### Sparklines (last six calendar months, May–Oct 2026)

```sql
SELECT m.month,
       (SELECT count(DISTINCT account_id) FROM reached WHERE date_trunc('month', day) = m.month) AS accounts_visited,
       (SELECT count(*) FROM o WHERE date_trunc('month', day) = m.month) AS orders,
       (SELECT round(coalesce(sum(value), 0), 2) FROM o WHERE date_trunc('month', day) = m.month) AS order_value
FROM generate_series(date '2026-05-01', date '2026-10-01', interval '1 month') AS m(month)
ORDER BY m.month;
-- accounts visited: 24, 20, 33, 25, 24, 9
-- orders:            8,  9, 18, 12, 11, 17
-- order value: 1757.33, 2216.60, 8058.08, 3318.55, 3611.47, 13142.54
```

### Secondary strip

Stocked accounts (19): a client-visible order in the 90 days ending at the period end (Aug 2 – Oct 30, 2026).

```sql
SELECT count(DISTINCT account_id) FROM o, params WHERE day BETWEEN p_end - 89 AND p_end;   -- 19
```

Reordering accounts (14 of 32): two or more client-visible orders, all time.

```sql
SELECT count(*) FILTER (WHERE n_orders >= 2) AS reordering, count(*) AS ordering FROM first_order;   -- 14, 32
```

New accounts (3): first ever client-visible order falls in the period.

```sql
SELECT count(*) FROM first_order, params WHERE first_day BETWEEN p_start AND p_end;   -- 3
```

Tastings held (0): `events.event_type = 'tasting'`, not cancelled, in the period (NoCo has no events).

```sql
SELECT count(*) FROM events e, params
WHERE (e.client_slug = params.slug OR params.slug = ANY(e.client_slugs))
  AND e.event_type = 'tasting' AND coalesce(e.status, '') <> 'cancelled'
  AND (e.start_time AT TIME ZONE 'America/Denver')::date BETWEEN p_start AND p_end;   -- 0
```

## 3. Order value chart (cumulative by day)

Current curve, one point per day from the 1st to today (31-day axis for October):

```sql
SELECT d::date AS day,
       round(coalesce(sum(o.value) FILTER (WHERE o.day <= d::date), 0), 2) AS running_total,
       count(o.id) FILTER (WHERE o.day = d::date) AS orders_this_day
FROM params, generate_series(p_start, p_end, interval '1 day') AS d
LEFT JOIN o ON o.day BETWEEN p_start AND d::date
GROUP BY d ORDER BY d;
-- last point: 2026-10-30 → 13142.54
```

Comparison curve: same query with `q_start`/`q_end` (last point 2026-09-30 → 3611.47). The two are drawn aligned by day index.

Subtitle "$13,143 across 17 orders so far" uses the Orders and Order value measures above.

## 4. From visit to order (funnel)

```sql
SELECT
  (SELECT count(DISTINCT account_id) FROM reached, params WHERE day BETWEEN p_start AND p_end) AS visited,        -- 9
  (SELECT count(*) FROM v, params WHERE day BETWEEN p_start AND p_end) AS visits_logged,                           -- 0
  (SELECT count(DISTINCT account_id) FROM o, params WHERE day BETWEEN p_start AND p_end) AS ordered,              -- 9
  (SELECT count(*) FROM first_order, params WHERE first_day BETWEEN p_start AND p_end) AS first_time,             -- 3
  (SELECT count(*) FROM first_order f, params
     WHERE f.n_orders >= 2 AND EXISTS (SELECT 1 FROM o WHERE o.account_id = f.account_id AND o.day BETWEEN p_start AND p_end)) AS repeat,  -- 7
  (SELECT count(DISTINCT account_id) FROM reached, params WHERE day BETWEEN q_start AND q_end) AS prior_visited,  -- 24
  (SELECT count(DISTINCT account_id) FROM o, params WHERE day BETWEEN q_start AND q_end) AS prior_ordered;        -- 9
-- subtitle: round(ordered / visited * 100) = 100% of accounts visited placed an order
```

## 5. Account map

Accounts tied to the brand (a visit or an order) with coordinates; "stocked" as in Section 2.

```sql
SELECT count(*) AS on_map,
       count(*) FILTER (WHERE a.id IN (SELECT account_id FROM o, params WHERE day BETWEEN p_end - 89 AND p_end)) AS stocked
FROM accounts a
WHERE a.lat IS NOT NULL AND a.lng IS NOT NULL AND a.lat <> 0 AND a.lng <> 0
  AND a.id IN (SELECT account_id FROM reached);   -- 103 accounts · 18 stocked
```

(19 accounts are stocked; one of them has no coordinates, so 18 appear on the map.)

Marker rules: stocked → 6px at 90%; visited in period but not stocked → 5px at 45%; otherwise 4px at 25%; ordered in the period → pulsing ring.

## 6. Ledger

Scope "October 2026" uses `p_start..p_end`; scope "Since Apr 2026" drops the date filter.

### Accounts tab (9 rows in period, 105 all time)

```sql
SELECT a.id, a.name, a.account_type,
       greatest((SELECT max(day) FROM v WHERE v.account_id = a.id), (SELECT max(day) FROM o WHERE o.account_id = a.id)) AS last_visit,
       (SELECT count(*) FROM v, params WHERE v.account_id = a.id AND day BETWEEN p_start AND p_end) AS visits,
       (SELECT count(*) FROM o, params WHERE o.account_id = a.id AND day BETWEEN p_start AND p_end) AS orders,
       (SELECT round(coalesce(sum(value), 0), 2) FROM o, params WHERE o.account_id = a.id AND day BETWEEN p_start AND p_end) AS value,
       (SELECT round(coalesce(sum(value), 0), 2) FROM o WHERE o.account_id = a.id) AS all_time,
       (SELECT max(day) FROM o WHERE o.account_id = a.id) AS last_order
FROM accounts a
WHERE a.id IN (SELECT account_id FROM reached, params WHERE day BETWEEN p_start AND p_end)
ORDER BY value DESC;
-- top rows: Chieftain Distribution 3 orders $9,847.92 (last order Oct 19);
--           Rocky Mountain Tap & Garden 6 orders $1,239.92 (all-time $4,803.92, last order Oct 28); Bart's Liquor 1 order $549.30 …
```

Cadence (Western Peak view only, accounts with 2+ orders): average gap between consecutive order days vs days since the last order; `since <= avg` → on pace, `<= 1.5 × avg` → slipping, else overdue.

```sql
SELECT account_id,
       round(avg(gap)) AS avg_gap_days,
       (date '2026-10-30' - max(day)) AS since_days
FROM (SELECT account_id, day, day - lag(day) OVER (PARTITION BY account_id ORDER BY day, id) AS gap FROM o) g
GROUP BY account_id HAVING count(*) >= 2;
-- Chieftain Distribution: avg gap 5, since 11 → overdue; Rocky Mountain Tap: avg 10, since 2 → on pace
```

### Orders tab (17 rows in period, 81 all time)

```sql
SELECT o.day, o.po_number, a.name,
       string_agg(concat_ws(' + ', nullif(li.cases, 0) || ' cs', nullif(li.bottles, 0) || ' btl') || ' ' ||
                  regexp_replace(li.product_name, '\s*\(Off-Premise\)\s*$', ''), ', ' ORDER BY li.id) AS products,
       round(o.value, 2) AS total, o.status
FROM o JOIN accounts a ON a.id = o.account_id
LEFT JOIN po_line_items li ON li.po_id = o.id, params
WHERE o.day BETWEEN p_start AND p_end
GROUP BY o.id, o.day, o.po_number, a.name, o.value, o.status
ORDER BY o.day DESC;
```

Units are shown exactly as stored (`cases`, `bottles`); nothing is converted.

### Products tab (17 rows in period, 37 all time)

One row per stored `product_name` (a retail "(Off-Premise)" SKU is its own row, shown with the suffix stripped and a "Retail size" sub-line).

```sql
SELECT li.product_name,
       sum(coalesce(li.cases, 0)) AS cases, sum(coalesce(li.bottles, 0)) AS bottles,
       round(sum(coalesce(li.total, 0)), 2) AS value,
       count(DISTINCT o.account_id) AS accounts_ordering,
       (SELECT count(DISTINCT o2.account_id) FROM o o2 JOIN po_line_items l2 ON l2.po_id = o2.id, params
          WHERE l2.product_name = li.product_name AND o2.day BETWEEN p_end - 89 AND p_end) AS stocked_at
FROM o JOIN po_line_items li ON li.po_id = o.id, params
WHERE o.day BETWEEN p_start AND p_end
GROUP BY li.product_name ORDER BY value DESC;
-- Cigar Cut Whiskey 5 cs $3,570 · 1 account · stocked at 2
-- Ridge Mountain Bourbon 7 cs $1,344 · 3 accounts · stocked at 5
-- Bourbon II 4 cs + 3 btl $1,240.65 · 3 accounts · stocked at 8
-- Rye 4 cs + 3 btl $1,159.65 · 3 accounts · stocked at 8
-- Saffron Gin 3 cs $992.70 · 1 account · stocked at 2
```

## 7. Account drawer

For one account: orders all time, value all time, last order, products ordered (cases all time, last ordered), orders, last ten visits (Not Interested hidden for portal users).

```sql
SELECT count(*) AS orders_all_time, round(sum(value), 2) AS value_all_time, max(day) AS last_order
FROM o WHERE account_id = :account_id;
```

## 8. Stocked accounts panel

Cells: Stocked (19), Reordering (14), New (3) — Section 2. "By product" = distinct accounts that ordered each product in the 90-day window, top 8:

```sql
SELECT li.product_name, count(DISTINCT o.account_id) AS accounts
FROM o JOIN po_line_items li ON li.po_id = o.id, params
WHERE o.day BETWEEN p_end - 89 AND p_end
GROUP BY li.product_name ORDER BY accounts DESC, li.product_name LIMIT 8;
-- Bourbon II 8 · Rye 8 · Ridge Mountain Bourbon 5 · Ridge Mountain Rum 5 · Aromatic Bitters 4 · Ridge Mountain Gin 4 · Ridge Mountain Vodka 4 · Cigar Cut Whiskey 2
```

## 9. Tastings and events

Hidden when the period has no events (NoCo: none). When present: events for the brand in the period, excluding cancelled, `planned_stop` and `other`; consumer counts from `tasting_consumers` joined on `event_id`.

```sql
SELECT e.id, (e.start_time AT TIME ZONE 'America/Denver')::date AS day, coalesce(a.name, e.title) AS account, e.event_type,
       (SELECT count(*) FROM tasting_consumers tc WHERE tc.event_id = e.id) AS consumers
FROM events e LEFT JOIN accounts a ON a.id = e.account_id, params
WHERE (e.client_slug = params.slug OR params.slug = ANY(e.client_slugs))
  AND coalesce(e.status, '') <> 'cancelled'
  AND e.event_type IN ('tasting', 'brand_dinner', 'meeting', 'training', 'milestone')
  AND (e.start_time AT TIME ZONE 'America/Denver')::date BETWEEN p_start AND p_end
ORDER BY e.start_time DESC;   -- 0 rows for NoCo
```

## 10. Field activity

Stops are the union of deduplicated visits and client-visible orders by account and day. An account with an order and no visit row still produces an "Ordered …" stop. Not Interested visits are omitted for portal users. Subtitle "{visits logged} visits · {orders} orders in October 2026".

```sql
SELECT r.day, r.account_id, a.name,
       (SELECT round(sum(value), 2) FROM o WHERE o.account_id = r.account_id AND o.day = r.day) AS ordered_that_day,
       (SELECT min(first_day) FROM first_order f WHERE f.account_id = r.account_id) = r.day AS first_order_here
FROM reached r JOIN accounts a ON a.id = r.account_id, params
WHERE r.day BETWEEN p_start AND p_end
ORDER BY r.day DESC, a.name;   -- 15 stops across 13 days for NoCo in October
```

Day header "{Mon D} · {n} stops · {day order total}" = count of stops that day and `sum(value)` of that day's orders.

## 11. PDF

The monthly PDF uses the Section 2 measures for the month, weekly order value (weeks start on the 1st, 8th, 15th, 22nd, 29th), the top 10 accounts by value, the top 6 products by cases, and the stocked block (stocked, reordering, new this month, tastings). The quarterly PDF uses the same measures per month plus the quarter total. October 2026: $759.92 / $9,225.12 / $1,957.50 / $1,200.00 / $0 by week. Q3 2026: 72 accounts visited (previous quarter 49), 41 orders (23), $14,988.10 ($4,913.61).

```sql
SELECT p_start + 7 * w AS week_start, round(coalesce(sum(o.value), 0), 2) AS value
FROM params CROSS JOIN generate_series(0, 4) AS w
LEFT JOIN o ON o.day BETWEEN p_start + 7 * w AND least(p_start + 7 * w + 6, date '2026-10-31')
GROUP BY w, p_start ORDER BY w;
```
