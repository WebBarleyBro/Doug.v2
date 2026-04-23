# Barley Bros CRM — Product Spec

## What We Are

Barley Bros is a **spirits marketing and sales representation firm** based in Colorado. We are NOT a distributor. We represent craft distilleries and emerging beverage brands, putting boots on the ground at on-premise accounts (bars, restaurants, hotels) and off-premise accounts (liquor stores, grocery) to:

- Secure new product placements and defend existing ones
- Run tastings and brand activation events
- Coordinate order inquiries to distributors on behalf of clients
- Handle state compliance (TTB, label approvals, state registrations)
- Manage marketing campaigns for client brands
- Report all field activity and results back to brand clients via a client portal

**Users of this system:**
- `owner` / `admin` — full access, team oversight, finances, compliance, client management
- `rep` — field reps who log visits, manage accounts, submit orders
- `intern` — limited access (assigned tasks, marketing assets, campaigns)
- `portal` — brand clients who see their data via a read-only client portal

---

## Design Principles

1. **Field-first.** A rep logging 12 visits in a day should never feel like they're doing data entry. Every action must be as fast as possible.
2. **Zero ambiguity.** Always show the user what happened. Every save gets feedback. Every button has a clear outcome.
3. **Contextual.** Before walking into an account, a rep should be able to see everything relevant in one tap.
4. **No AI features.** The CRM is a tool, not a co-pilot. No AI suggestions, no generated content.
5. **Mobile-capable.** Reps use this in the field on their phones. Every page must work on mobile.
6. **Clients feel cared for.** The client portal must look professional enough that a brand founder thinks "these people are serious."

---

## Data Model Summary

### Core Entities

**clients** — Brand clients we represent
- `id, name, slug, color, logo_url`
- `commission_rate` — our % commission on orders
- `order_type` — `direct` (purchase orders) | `distributor` (inquiry emails to distributor)
- `contact_name/email/phone` — main contact at the brand
- `distributor_name, distributor_rep_id`
- `territory, category, since_date`
- `instagram, website, notes`

**accounts** — Venues and retailers we visit
- `id, name, address, phone, account_type` (on_premise | off_premise)
- `visit_frequency_days` — how often we should visit
- `last_visited` — auto-updated when a visit is logged
- `priority` — A/B/C
- `best_days, best_time` — when to visit
- `notes, website, instagram`
- Related: `account_clients` (many-to-many with clients via `client_slug`)

**visits** — Every field visit logged by a rep
- `id, account_id, user_id, client_slug, visited_at, status`
- `status` options: `Will Order Soon | Just Ordered | Needs Follow Up | Not Interested | Menu Feature Won | New Placement | General Check-In`
- `notes, tasting_notes, feedback, photo_urls[]`
- `follow_up_cleared_at, follow_up_dismissed_at` — for queue management
- One row per client_slug per visit (an account with 2 brands = 2 visit rows)

**placements** — Products placed at accounts (on shelf / on menu)
- `id, account_id, client_slug, product_name, placement_type, status`
- `status` flow: `committed → ordered → on_shelf → reordering`
- `price_point, shelf_count, shelf_date, notes`
- `lost_at, lost_reason` — soft delete when lost

**purchase_orders** — Direct orders and distributor inquiries
- `id, client_slug, account_id, deliver_to_name, po_number`
- `order_type` — `direct` | `distributor`
- `status` — `draft | sent | fulfilled | cancelled`
- `total_amount, commission_amount`
- `distributor_email, distributor_rep_name`
- `follow_up_status` — `not_started | contacted | waiting | closed`
- Related: `po_line_items`

**contacts** — People at accounts (buyers, bar managers, GMs) and distributor reps
- `id, account_id, client_slug, name, role, category, email, phone`
- `is_decision_maker`
- `category`: general | distributor | buyer | chef | gm_owner | media | other

**tasks** — Action items assigned to reps or interns
- `id, user_id, assigned_to, title, description, priority, due_date, completed`
- `account_id, client_slug` — optional context links

**events** — Tastings, meetings, demos, milestones
- `id, title, account_id, client_slug, event_type, start_time, end_time, status, notes`

**campaigns** — Marketing campaigns for brand clients
- `id, client_slug, title, campaign_type, status, budget, start_date, end_date`
- Related: `campaign_milestones`, `campaign_deliverables`

**state_registrations** — Compliance tracking
- `id, client_id, state, status, ttb_number, expiry_date, notes`

**products** — Product catalog per brand
- `id, client_slug, name, category, sku, price, bottle_price, active`

**user_profiles** — Internal team members and portal users
- `id, name, full_name, role, client_slug` (portal users have a client_slug)

---

## Pages & Features

### Dashboard (`/`)
**Purpose:** Morning briefing. What needs to happen today.

**Sections:**
- KPI row: Team Visits (MTD), Active Placements, Commission (MTD), Open Tasks
- Follow-Up Queue — accounts with "Will Order Soon" or "Needs Follow Up" status, deduplicated per account, sorted by urgency (days since + status weight). Actions: Log Visit, Cleared, Disregard
- Today's Schedule — planner stops + tasks due today
- Accounts Overdue — accounts past visit frequency, sorted by most overdue
- Client Suggestions — accounts that suggested brands for follow-up

**Known Issues:**
- Follow-up queue hard-caps at 8 (should paginate or show all)
- No success toast on task completion / follow-up actions

---

### Day Planner (`/planner`)
**Purpose:** Structure today's route. See what's planned, log progress.

**Features:**
- Date picker (today by default)
- Sidebar: Logged Today, Events Today, Open Tasks
- Add/remove planned stops with notes
- Log visit directly from a planned stop
- Quick-add account to today's route

**Missing:**
- Map view of today's stops
- Route optimization ("visit these 8 accounts in the most efficient order")
- One-tap directions from a stop
- Status as you complete each stop (check off stops as visited)

---

### Accounts (`/accounts`, `/accounts/[id]`)
**Purpose:** The full account database. Every bar, restaurant, liquor store we work with.

**List features:**
- Search by name/address
- Filter by type (on/off-premise), brand, priority
- Sort: overdue first, A-Z, recently visited
- Health dot per account (color-coded by how overdue)
- Duplicate detection with one-click delete
- Add Account modal
- Log Visit modal (from list)

**Detail tabs:**
- Activity — timeline of all actions (visits, placements won, orders, contacts added)
- Visits — full visit history, deduped by date+user
- Placements — active and lost placements at this account
- Orders — orders/inquiries linked to this account
- Contacts — people at this account (buyer, GM, bar manager)

**Missing:**
- Pre-visit brief view (one screen: last visit + contacts + open tasks + placements)
- Edit visit (currently can only delete)
- One-tap directions from account header
- Rep ownership field (which rep owns this account)
- Samples tracking (left X bottles of Y on date)
- Account-level notes that persist separately from visit notes

---

### Clients (`/clients`, `/clients/[slug]`)
**Purpose:** Brand portfolio management.

**List:** Shows all active brands with logo, type (direct/distributor), commission rate.

**Detail tabs (per brand):**
- Overview — KPIs, visit trend chart, recent activity
- Visits — all visits logged for this brand
- Placements — all active placements for this brand
- Orders — all orders/inquiries for this brand
- Products — product catalog for this brand
- Events — tastings, meetings, milestones
- Campaigns — marketing campaigns
- Tastings — tasting consumer data
- Contacts — contacts in this brand's account network
- Compliance — state registrations for this brand
- Report — printable/exportable activity report

**Missing:**
- Add client from the UI (currently no way to create a brand)
- Brand health score with trend
- Distributor relationship section (which distributor reps handle this brand, recent communications)
- Depletion data entry (per placement per month)
- Commission invoice generation

---

### Placements (`/placements`)
**Purpose:** Track every product that's on a shelf or menu.

**Features:**
- Filter by status (committed / ordered / on shelf / reordering)
- Filter by brand
- Advance / revert status with one click
- Mark placement lost (with reason)
- Create placement modal

**Missing:**
- Edit placement (product name, price point, notes, type — currently uneditable after creation)
- Search by account name
- Sort by date added / account name
- Export placement list per brand (for client reports)
- Depletion entry on each placement

---

### Orders (`/orders`)
**Purpose:** Create and track purchase orders (direct) and distributor inquiries.

**Features:**
- 3 tabs: Direct Orders / Distributor Inquiries / Follow-Ups kanban
- Create order with line items
- Send email draft (distributor orders)
- Advance follow-up status
- Status: draft → sent → fulfilled / cancelled

**Missing:**
- Edit an existing order (currently must delete and recreate)
- Order search
- Attach PDF to order
- Bulk status update

---

### Finance (`/finance`)
**Purpose:** Commission and revenue tracking.

**Features:**
- KPI row: Commission MTD, Revenue MTD, Commission YTD, Revenue YTD
- 12-month commission bar chart
- Per-brand breakdown (MTD + YTD)
- Recent orders list
- CSV export

**Missing:**
- Expense tracking (subtract COGS from commission to get net)
- Commission statement / invoice PDF generation
- Payment received vs. earned reconciliation
- Filter by date range (currently always 12-month view)
- Forecast ("at current run rate, Q2 commission will be ~$X")

---

### Analytics (`/analytics`)
**Purpose:** Performance data across the portfolio.

**Features:**
- Date range filter (7D / 30D / 90D / 1Y)
- Visit activity chart
- Commission trend chart
- Visit outcomes breakdown (with drill-down to see accounts per status)
- Active placements by status and brand
- Follow-up action list

**Missing:**
- Per-rep activity breakdown (who visited what, how many accounts)
- Brand health score per client
- Account coverage % (what % of accounts visited in period)
- Export analytics data
- Action buttons on follow-up cards (same as dashboard)

---

### Calendar (`/calendar`)
**Purpose:** Scheduled events (tastings, meetings, demos).

**Features:**
- Monthly calendar view
- Create event (with client, type, notes)
- Filter by user / client / category
- QR code generation per tasting event
- Consumer tasting registration via `/taste/[eventId]`
- Delete event

**Missing:**
- Edit event (can only delete and recreate)
- Week view
- Sync with external calendar (Google/Outlook)
- Reminder/notification when event is upcoming
- Attendance tracking

---

### Contacts (`/contacts`)
**Purpose:** All people — buyers, bar managers, distributor reps, media.

**Features:**
- Search by name/email
- Category filter (buyer, chef, distributor, etc.)
- Create / edit / delete contacts
- Link to account

**Missing:**
- Contact activity history (when was this person last interacted with)
- Import from CSV
- Phone/email click-to-action on mobile
- Distributor rep list separate from venue contacts

---

### Marketing (`/marketing`)
**Purpose:** Campaign management for brand clients.

**Features:**
- Campaign list with status
- Create campaign with milestones and deliverables
- Milestone completion tracking
- Campaign expenses and assets
- Instagram-style asset display for intern brand resources

**Missing:**
- Campaign calendar view
- Social post scheduling / content calendar
- Campaign performance metrics (reach, engagement — manual entry)
- Intern assignment to campaign deliverables

---

### Compliance (`/compliance`)
**Purpose:** State registrations and TTB tracking.

**Features:**
- Per-brand registration list
- Status tracking (active / pending / expired / not_registered)
- Expiry alerts (30-day and 90-day banners)
- Add state registration

**Missing:**
- Edit existing registrations (currently add-only)
- Label approval tracking per product
- Document upload per registration
- Email alert when registration expires within 30 days
- TTB number validation

---

### Intern Hub (`/intern-hub`, `/intern/*`)
**Purpose:** Task and resource management for interns.

**Intern pages:**
- `/intern` — My Work (tasks assigned, resources)
- `/intern/tasks` — full task list
- `/intern/projects` — intern projects
- `/intern/assets` — brand asset uploads
- `/intern/resources` — brand resource links

**Missing:**
- Edit / complete tasks inline (currently read-only in some sub-pages)
- "Done This Week" stat is hardcoded to "—" and never computed
- File upload for assets isn't wired to storage in all pages
- Intern can see `/marketing` but the nav item links there (not to intern-specific campaigns view)

---

### Visits Log (`/visits`)
**Purpose:** Chronological log of all visits across the team.

**Features:**
- Group by date
- Filter by period (today / 7d / 30d / all time)
- Owner/admin: rep filter dropdown
- Each visit links to its account
- Deduplication by date+user

**Missing:**
- Export to CSV
- Filter by client/brand
- Filter by visit status
- Click to expand visit notes
- Visit count by rep (summary row per rep)

---

### Client Portal (`/portal/[slug]`)
**Purpose:** Brand client view. Shows them what Barley Bros is doing on their behalf.

**Sections:**
- Hero (brand logo, contact info, account manager)
- KPI tiles: Visits This Month, Active Placements, Orders/Inquiries, Events & Tastings, Showing Interest
- Visit Trend Chart (12 weeks)
- Field Activity (filterable: all / action / wins / general)
- Active Placements (with status breakdown)
- Orders/Inquiries
- Events & Tastings (upcoming + past)
- Campaigns
- Suggest an Account form
- Print/PDF report button

**No AI features. No edit functionality. Read-only.**

---

## Known Bugs (Prioritized Fix List)

| # | Issue | Location | Priority |
|---|-------|----------|----------|
| 1 | No edit for compliance registrations | `/compliance` | High |
| 2 | No edit for placements | `/placements` | High |
| 3 | No edit for visits | `/accounts/[id]` | High |
| 4 | Account delete in dupes panel has no confirmation | `/accounts` | High |
| 5 | No way to add a client brand from the UI | `/clients` | High |
| 6 | Placement inline create in VisitLogModal silently does nothing | `VisitLogModal` | High |
| 7 | Product dropdown in Orders only loads after brand selected (no explanation shown) | `/orders` | High |
| 8 | "Done This Week" on intern dashboard is always "—" | `/intern` | Medium |
| 9 | Analytics follow-up cards have no action buttons | `/analytics` | Medium |
| 10 | Finance commission uses `created_at` not `sent_at` for period bucketing | `/finance` | Medium |
| 11 | Follow-up queue hard-caps at 8 items visible | `/` | Medium |
| 12 | No success/error toast on inline actions (saves, deletes, status changes) | All pages | Medium |
| 13 | `expiringSoon` banner hidden when `urgent` banner also shows | `/compliance` | Low |
| 14 | Google Places event listener not cleaned up on modal close (memory leak) | `AddAccountModal` | Low |
| 15 | `account_type` select shows "both" option but schema only has on_premise/off_premise | `/accounts/[id]` | Low |

## Dead Data (Types Exist, No UI)

These are fully defined in the data model and data.ts but have no interface:

| Feature | Type | Function in data.ts |
|---------|------|---------------------|
| Competitive sightings | `CompetitiveSighting` | `logVisit()` saves them but no view |
| Depletion tracking | `DepletionEntry` | No UI |
| Tasting consumer data | `TastingConsumer` | `saveTastingConsumer()` exists, no analysis view |
| Tasting consumer follow-up analysis | `TastingConsumer` | Data captured at events, no analysis view |

---

## Pending Migrations

- **025** — `follow_up_cleared_at`, `follow_up_dismissed_at` on `visits` *(needs to be run in Supabase)*

---

## Roadmap

### Immediate (bugs + polish)
- Fix all items in the Known Bugs table above
- Add toast notifications for all save/delete actions
- Add loading states to inline action buttons

### Sprint 1 (field rep experience)
- Pre-visit brief screen on account detail
- Quick-log mode: 2-tap visit check-in
- One-tap directions button on every account card
- Rep ownership field on accounts
- Samples left tracking (add to visit modal + show on account)
- Edit visit capability

### Sprint 2 (owner/admin power)
- Goals / quota tracking per client per quarter
- Depletions entry UI (per placement per month)
- Per-rep activity breakdown on analytics
- Commission invoice / statement PDF generation

### Sprint 3 (territory + map)
- Map view on accounts page
- Route planning from day planner
- Territory assignment per rep
- Account coverage % per territory

### Sprint 4 (notifications + integrations)
- In-app and email notifications for: overdue accounts, expiring compliance, tasks due, follow-ups aging
- Label approval document uploads on compliance
- Calendar sync (Google / Outlook)
- CSV import for bulk account/contact creation
