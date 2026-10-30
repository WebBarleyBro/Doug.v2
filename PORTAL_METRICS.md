# Portal metrics: SQL for every number on the page

Every value the client portal shows is computed in `app/portal/[slug]/portal-metrics.ts` from rows in Supabase. This file gives the SQL that reproduces each one, using NoCo Distillery's real data for **October 2026 to date** (as of October 30, 2026, noon Mountain Time) as the worked example. Run the queries in Supabase → SQL Editor. They only read.

Rules from `PORTAL_SPEC.md` v1.2 and the October 30 review that shape every query:

- **An order is not a visit.** The "Accounts visited" measure counts the union of accounts with a visit row and accounts with a client-visible order. The split ("{o} placed orders · {v} visited in person") is always shown with it.
- **Client-visible orders** are `purchase_orders.status IN ('sent', 'fulfilled')`. The order date is `COALESCE(sent_at, created_at)`.
- **Distributors are not venues.** An account with `account_kind = 'distributor'` (added by migration 069), or whose name contains "Distribut" until 069 runs, is left out of every account count, the accounts ledger, the funnel and the map. Its orders still count in Orders and Order value.
- **The `placements` table is never read.** "Active" means a client-visible order in the 90 days ending at the period end.

All dates are Mountain Time. `visits.visited_at` and `purchase_orders.created_at` are stored as UTC without a zone; `sent_at` is a `timestamptz`.

The worked-example values come from running the metrics module against the 2026-10-30 backup export, which holds the same rows. Run the SQL against the live database to confirm them.

## 0. Shared setup

Paste these CTEs above any query below.

```sql
WITH params AS (
  SELECT 'noco-distillery'::text AS slug,
         date '2026-10-01' AS p_start, date '2026-10-30' AS p_end,     -- period (to date)
         date '2026-09-01' AS q_start, date '2026-09-30' AS q_end      -- comparison period
),
-- Distributor accounts (before migration 069 runs, the name test is the only signal;
-- after it runs, replace the condition with: account_kind = 'distributor').
dist AS (
  SELECT id FROM accounts WHERE name ILIKE '%distribut%'
),
-- Visits, one row per venue account per Mountain-Time day (the portal's dedupe).
v AS (
  SELECT DISTINCT visits.account_id,
         (visits.visited_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date AS day
  FROM visits CROSS JOIN params
  WHERE visits.client_slug = params.slug AND visits.account_id IS NOT NULL
    AND visits.account_id NOT IN (SELECT id FROM dist)
),
-- Client-visible orders with Mountain-Time day and portal value
-- (resolveTotal: the sum of line totals when line items exist, else total_amount).
o_all AS (
  SELECT po.id, po.account_id, po.po_number, po.status,
         (COALESCE(po.sent_at, po.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Denver')::date AS day,
         COALESCE(NULLIF((SELECT sum(li.total) FROM po_line_items li WHERE li.po_id = po.id), 0), po.total_amount, 0) AS value,
         po.account_id IN (SELECT id FROM dist) AS is_distributor
  FROM purchase_orders po CROSS JOIN params
  WHERE po.client_slug = params.slug AND po.status IN ('sent', 'fulfilled')
),
-- Venue orders only (used for every account-based number).
o AS (SELECT * FROM o_all WHERE NOT is_distributor),
-- Account-days worked: visits ∪ venue orders.
worked AS (
  SELECT account_id, day FROM v
  UNION
  SELECT account_id, day FROM o WHERE account_id IS NOT NULL
),
first_order AS (
  SELECT account_id, min(day) AS first_day, count(*) AS n_orders FROM o GROUP BY account_id
)
```

> Value note. `resolveTotal` is the spec's definition and sums `po_line_items.total`. Ten NoCo orders carry a `discount_amount`, so their `total_amount` is lower than their line totals by about $250 in total. The portal shows the pre-discount line total, as the spec says. The CTE's `NULLIF(sum, 0)` matches `resolveTotal` whenever line totals are positive, which is true for every NoCo line; `resolveTotal` additionally falls back to `unit_price × quantity` for a line whose `total` is zero, which no NoCo line needs.

## 1. Identity and header

| Element | Source | NoCo |
|---|---|---|
| Represented since | `clients.since_date`, as a month | January 2024 |
| Territory | `clients.territory` | Northern Colorado |
| Tracking since | earliest visit or order for the brand | April 2026 |

```sql
SELECT least((SELECT min(day) FROM v), (SELECT min(day) FROM o_all)) AS tracking_start;   -- 2026-04-16
```

## 2. Measures block

### Accounts visited: 8, previous month 24, ▼ −16

```sql
SELECT
  (SELECT count(DISTINCT account_id) FROM worked, params WHERE day BETWEEN p_start AND p_end) AS current,  -- 8
  (SELECT count(DISTINCT account_id) FROM worked, params WHERE day BETWEEN q_start AND q_end) AS prior;    -- 24
```

Footnote "{o} placed orders · {v} visited in person":

```sql
SELECT (SELECT count(DISTINCT account_id) FROM o, params WHERE day BETWEEN p_start AND p_end) AS ordered,  -- 8
       (SELECT count(DISTINCT account_id) FROM v, params WHERE day BETWEEN p_start AND p_end) AS visited;  -- 0
```

NoCo has no visit rows in October 2026; its latest visit is September 23. Every October account came from an order.

### Orders: 17, previous month 11, ▲ +6

Distributor orders are included here.

```sql
SELECT (SELECT count(*) FROM o_all, params WHERE day BETWEEN p_start AND p_end) AS current,  -- 17
       (SELECT count(*) FROM o_all, params WHERE day BETWEEN q_start AND q_end) AS prior;    -- 11
```

Footnote "{all-time orders} orders since Apr · {accounts} accounts have ordered":

```sql
SELECT (SELECT count(*) FROM o_all) AS all_orders,                       -- 81
       (SELECT count(DISTINCT account_id) FROM o) AS ordering_accounts;  -- 31 (venues only)
```

### Order value: $13,143, previous month $3,611, ▲ +$9,531

```sql
SELECT (SELECT round(sum(value), 2) FROM o_all, params WHERE day BETWEEN p_start AND p_end) AS current,  -- 13142.54
       (SELECT round(sum(value), 2) FROM o_all, params WHERE day BETWEEN q_start AND q_end) AS prior;    -- 3611.47
```

Footnote "{all-time value} since Apr · {average} average order":

```sql
SELECT round(sum(value), 2) AS all_value, round(avg(value), 2) AS avg_order FROM o_all;   -- 33044.25, 407.95
```

### Sparklines (last six calendar months, May to October 2026)

```sql
SELECT m.month,
       (SELECT count(DISTINCT account_id) FROM worked WHERE date_trunc('month', day) = m.month) AS accounts_worked,
       (SELECT count(*) FROM o_all WHERE date_trunc('month', day) = m.month) AS orders,
       (SELECT round(coalesce(sum(value), 0), 2) FROM o_all WHERE date_trunc('month', day) = m.month) AS order_value
FROM generate_series(date '2026-05-01', date '2026-10-01', interval '1 month') AS m(month)
ORDER BY m.month;
-- accounts visited: 24, 20, 33, 25, 24, 8
-- orders:           8,  9, 18, 12, 11, 17
-- order value: 1757.33, 2216.60, 8058.08, 3318.55, 3611.47, 13142.54
```

### Secondary strip

Active accounts: 18. A venue order in the 90 days ending at the period end (Aug 2 to Oct 30, 2026).

```sql
SELECT count(DISTINCT account_id) FROM o, params WHERE day BETWEEN p_end - 89 AND p_end;   -- 18
```

Reordering accounts: 13 of 31. Two or more venue orders, all time.

```sql
SELECT count(*) FILTER (WHERE n_orders >= 2) AS reordering, count(*) AS ordering FROM first_order;   -- 13, 31
```

New accounts: 2. The account's first ever order falls in the period.

```sql
SELECT count(*) FROM first_order, params WHERE first_day BETWEEN p_start AND p_end;   -- 2
```

Tastings held: 0. NoCo has no events.

```sql
SELECT count(*) FROM events e CROSS JOIN params
WHERE (e.client_slug = params.slug OR params.slug = ANY(e.client_slugs))
  AND e.event_type = 'tasting' AND coalesce(e.status, '') <> 'cancelled'
  AND (e.start_time AT TIME ZONE 'America/Denver')::date BETWEEN p_start AND p_end;   -- 0
```

## 3. Order value chart (cumulative by day)

One point per day from the 1st to today. The axis spans all 31 days of October.

```sql
SELECT d::date AS day,
       (SELECT round(coalesce(sum(value), 0), 2) FROM o_all WHERE o_all.day BETWEEN params.p_start AND d::date) AS running_total,
       (SELECT count(*) FROM o_all WHERE o_all.day = d::date) AS orders_this_day
FROM params CROSS JOIN generate_series(params.p_start, params.p_end, interval '1 day') AS d
ORDER BY d;
-- last point: 2026-10-30 → 13142.54
```

For the comparison curve, use `q_start`/`q_end` in both places (last point: 2026-09-30 → 3611.47). The two curves are aligned by day index. The subtitle "$13,143 across 17 orders so far" uses the Orders and Order value measures.

## 4. From account to order (funnel)

```sql
SELECT
  (SELECT count(DISTINCT account_id) FROM worked, params WHERE day BETWEEN p_start AND p_end) AS worked,      -- 8
  (SELECT count(DISTINCT account_id) FROM v, params WHERE day BETWEEN p_start AND p_end) AS visited,         -- 0
  (SELECT count(DISTINCT account_id) FROM o, params WHERE day BETWEEN p_start AND p_end) AS ordered,         -- 8
  (SELECT count(*) FROM first_order, params WHERE first_day BETWEEN p_start AND p_end) AS first_time,        -- 2
  (SELECT count(*) FROM first_order f, params
     WHERE f.n_orders >= 2 AND EXISTS (SELECT 1 FROM o WHERE o.account_id = f.account_id AND o.day BETWEEN p_start AND p_end)) AS repeat,  -- 6
  (SELECT count(DISTINCT account_id) FROM worked, params WHERE day BETWEEN q_start AND q_end) AS prior_worked, -- 24
  (SELECT count(DISTINCT account_id) FROM o, params WHERE day BETWEEN q_start AND q_end) AS prior_ordered;     -- 9
-- subtitle: round(ordered / worked * 100) = 100% of accounts visited placed an order
```

## 5. Account map

Venue accounts tied to the brand (a visit or an order) that have coordinates.

```sql
SELECT count(*) AS on_map,
       count(*) FILTER (WHERE a.id IN (SELECT account_id FROM o, params WHERE day BETWEEN p_end - 89 AND p_end)) AS active
FROM accounts a
WHERE a.lat IS NOT NULL AND a.lng IS NOT NULL AND a.lat <> 0 AND a.lng <> 0
  AND a.id IN (SELECT account_id FROM worked);   -- 103 accounts · 18 active
```

Markers: active is 6px at 90%; visited in the period but not active is 5px at 45%; anything else is 4px at 25%; ordered in the period adds a pulsing ring.

## 6. Ledger

The "October 2026" scope uses `p_start..p_end`. The "Since Apr 2026" scope drops the date filter.

### Accounts tab: 8 rows in period, 104 all time

```sql
SELECT a.id, a.name, a.account_type,
       greatest((SELECT max(day) FROM v WHERE v.account_id = a.id), (SELECT max(day) FROM o WHERE o.account_id = a.id)) AS last_visit,
       (SELECT count(*) FROM v, params WHERE v.account_id = a.id AND day BETWEEN p_start AND p_end) AS visits,
       (SELECT count(*) FROM o, params WHERE o.account_id = a.id AND day BETWEEN p_start AND p_end) AS orders,
       (SELECT round(coalesce(sum(value), 0), 2) FROM o, params WHERE o.account_id = a.id AND day BETWEEN p_start AND p_end) AS value,
       (SELECT round(coalesce(sum(value), 0), 2) FROM o WHERE o.account_id = a.id) AS all_time,
       (SELECT max(day) FROM o WHERE o.account_id = a.id) AS last_order
FROM accounts a
WHERE a.id IN (SELECT account_id FROM worked, params WHERE day BETWEEN p_start AND p_end)
ORDER BY value DESC;
-- top rows: Rocky Mountain Tap & Garden 6 orders $1,239.92 (all-time $4,803.92, last order Oct 28);
--           Bart's Liquor 1 order $549.30 (all-time $2,373.18); Berthoud Hometown Liquors 1 order $410.70 …
```

Below the table: "Distributor orders · {n} · {value}".

```sql
SELECT count(*), round(sum(value), 2) FROM o_all, params WHERE is_distributor AND day BETWEEN p_start AND p_end;   -- 3, 9847.92
```

Order frequency (Western Peak view only, accounts with two or more orders): the average gap between consecutive order days, and days since the last order. The row is highlighted only when days since is greater than the average gap.

```sql
SELECT account_id,
       greatest(1, round(avg(gap))) AS every_n_days,
       (date '2026-10-30' - max(day)) AS last_n_days_ago
FROM (SELECT account_id, day, day - lag(day) OVER (PARTITION BY account_id ORDER BY day, id) AS gap FROM o) g
GROUP BY account_id HAVING count(*) >= 2;
-- Rocky Mountain Tap & Garden: every 10 days · last 2d ago
```

The portal measures the gap on exact timestamps and rounds afterwards. This day-level SQL can differ from the screen by one day for an account whose orders fall at different times of day.

### Orders tab: 17 rows in period, 81 all time

Distributor orders are listed here too.

```sql
SELECT o.day, o.po_number, a.name,
       string_agg(concat_ws(' + ', nullif(li.cases, 0) || ' cs', nullif(li.bottles, 0) || ' btl') || ' ' ||
                  regexp_replace(li.product_name, '\s*\(Off-Premise\)\s*$', ''), ', ' ORDER BY li.id) AS products,
       round(o.value, 2) AS total, o.status
FROM o_all o
JOIN accounts a ON a.id = o.account_id
LEFT JOIN po_line_items li ON li.po_id = o.id
CROSS JOIN params
WHERE o.day BETWEEN params.p_start AND params.p_end
GROUP BY o.id, o.day, o.po_number, a.name, o.value, o.status
ORDER BY o.day DESC;
```

Units are shown exactly as stored in `cases` and `bottles`. Nothing is converted.

### Products tab: 17 rows in period, 37 all time

One row per stored `product_name`. A retail "(Off-Premise)" SKU is its own row, shown without the suffix and with a "Retail size" sub-line. Cases and value include distributor orders; "Accounts ordering" and "Active at" count venue accounts only.

```sql
SELECT li.product_name,
       sum(coalesce(li.cases, 0)) AS cases, sum(coalesce(li.bottles, 0)) AS bottles,
       round(sum(coalesce(li.total, 0)), 2) AS value,
       count(DISTINCT o.account_id) FILTER (WHERE NOT o.is_distributor) AS accounts_ordering,
       (SELECT count(DISTINCT o2.account_id) FROM o o2 JOIN po_line_items l2 ON l2.po_id = o2.id
          WHERE l2.product_name = li.product_name AND o2.day BETWEEN params.p_end - 89 AND params.p_end) AS active_at
FROM o_all o JOIN po_line_items li ON li.po_id = o.id CROSS JOIN params
WHERE o.day BETWEEN params.p_start AND params.p_end
GROUP BY li.product_name, params.p_end
ORDER BY value DESC;
-- Cigar Cut Whiskey 5 cs $3,570 · 0 venue accounts · active at 1
-- Ridge Mountain Bourbon 7 cs $1,344 · 2 accounts · active at 4
-- Bourbon II 4 cs + 3 btl $1,240.65 · 2 accounts · active at 7
-- Rye 4 cs + 3 btl $1,159.65 · 2 accounts · active at 7
-- Saffron Gin 3 cs $992.70 · 0 venue accounts · active at 1
```

## 7. Account drawer

For one account: orders all time, value all time, last order, products ordered, orders, and the last ten visits. Not Interested visits are hidden for portal users.

```sql
SELECT count(*) AS orders_all_time, round(sum(value), 2) AS value_all_time, max(day) AS last_order
FROM o_all WHERE account_id = :account_id;
```

## 8. Accounts panel

Cells: Active 18, Reordering 13, New 2, from Section 2. "By product" is the number of distinct venue accounts that ordered each product in the 90-day window, top 8.

```sql
SELECT li.product_name, count(DISTINCT o.account_id) AS accounts
FROM o JOIN po_line_items li ON li.po_id = o.id CROSS JOIN params
WHERE o.day BETWEEN params.p_end - 89 AND params.p_end
GROUP BY li.product_name ORDER BY accounts DESC, li.product_name LIMIT 8;
-- Bourbon II 7 · Rye 7 · Ridge Mountain Bourbon 4 · Ridge Mountain Rum 4 · Aromatic Bitters 3 · Ridge Mountain Gin 3 · Ridge Mountain Vodka 3 · Ridge Mountain Rye (retail) 2
```

## 9. Tastings and events

The panel is hidden when the period has no events, and the Accounts panel then spans the full row. NoCo has none.

```sql
SELECT e.id, (e.start_time AT TIME ZONE 'America/Denver')::date AS day, coalesce(a.name, e.title) AS account, e.event_type,
       (SELECT count(*) FROM tasting_consumers tc WHERE tc.event_id = e.id) AS consumers
FROM events e LEFT JOIN accounts a ON a.id = e.account_id CROSS JOIN params
WHERE (e.client_slug = params.slug OR params.slug = ANY(e.client_slugs))
  AND coalesce(e.status, '') <> 'cancelled'
  AND e.event_type IN ('tasting', 'brand_dinner', 'meeting', 'training', 'milestone')
  AND (e.start_time AT TIME ZONE 'America/Denver')::date BETWEEN params.p_start AND params.p_end
ORDER BY e.start_time DESC;   -- 0 rows for NoCo
```

## 10. Field activity

One row per client-visible order and one per visit, grouped by Mountain-Time day. An order is not a visit, so an order and a visit at the same account on the same day are two rows. Distributor orders appear as order rows. Not Interested visits are omitted for portal users.

- **Order row:** "{account} · Order · {units} · {total}". Units are the order's summed `cases` and `bottles`, as stored.
- **Placement row (Placements filter):** "{account} · New placement · {product}", or "New placements · {product}, +{n} more" when one order placed several. Under Everything and Orders, the same information is the "{n} new" tag on the order row.
- **Visit row:** "{account} · Visit · {note}", with the note cut to one line.

A **placement** is the first client-visible order line for a (venue account, `product_name`) pair, across all time. Its date is its order's date. The `placements` table is not read. A retail "(Off-Premise)" SKU is a different `product_name`, so it places separately.

```sql
-- Placements made in the period, one row per order that placed something.
WITH lines AS (
  SELECT o.id AS order_id, o.account_id, o.day, li.product_name,
         row_number() OVER (PARTITION BY o.account_id, li.product_name ORDER BY o.day, o.id, li.id) AS nth
  FROM o JOIN po_line_items li ON li.po_id = o.id          -- o = venue orders only
)
SELECT day, order_id, a.name,
       array_agg(regexp_replace(product_name, '\s*\(Off-Premise\)\s*$', '') ORDER BY product_name) AS new_products
FROM lines JOIN accounts a ON a.id = lines.account_id CROSS JOIN params
WHERE nth = 1 AND day BETWEEN params.p_start AND params.p_end
GROUP BY day, order_id, a.name
ORDER BY day DESC;
```

The portal breaks ties between same-day orders by their stored order of line items. This SQL breaks them by order id and line id, so two orders for the same new product on the same day could pick a different "first" order. No NoCo account has such a pair.

Rows per day and the day header "{Mon D} · {n} stops · {day order total}":

```sql
SELECT day, count(*) AS rows, round(sum(value), 2) AS day_order_total
FROM (
  SELECT day, value FROM o_all
  UNION ALL
  SELECT day, NULL FROM v
) t CROSS JOIN params
WHERE day BETWEEN params.p_start AND params.p_end
GROUP BY day ORDER BY day DESC;   -- October: 17 order rows, 0 visit rows, across 13 days
```

Clicking an order or placement row opens the Order drawer: account, date, PO, status, and each line's product, quantity with unit, `unit_price`, `total`, plus a "New placement" tag on lines the query above marks `nth = 1`.

## 11. PDF

The monthly PDF uses the Section 2 measures for the month, weekly order value (weeks start on the 1st, 8th, 15th, 22nd and 29th), the top 10 venue accounts by value, the top 6 products by cases, and the Accounts block. October 2026 by week: $759.92, $9,225.12, $1,957.50, $1,200.00, $0. The quarterly PDF repeats the measures per month with a quarter total. Q3 2026: 72 accounts visited (previous quarter 49), 41 orders (23), $14,988.10 ($4,913.61).

```sql
SELECT params.p_start + 7 * w AS week_start,
       (SELECT round(coalesce(sum(value), 0), 2) FROM o_all
         WHERE o_all.day BETWEEN params.p_start + 7 * w AND least(params.p_start + 7 * w + 6, date '2026-10-31')) AS value
FROM params CROSS JOIN generate_series(0, 4) AS w
ORDER BY w;
```
