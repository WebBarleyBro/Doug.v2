@SPEC.md

# Doug.v2 CRM — Claude Code Instructions

## Project Overview
**Doug.v2** is a Next.js 15 field-sales CRM for spirits representation (Barley Bros).
- Users: 4-8 field reps, 4 brand clients (for now)
- Tech: Next.js 15, React 19, Supabase (PostgREST + RLS), Vercel, Tailwind CSS 4
- Data: Mountain Time (MT) timezone everywhere; all dates in YYYY-MM-DD format
- **Billing removed** — using external invoicing tools

## Core Principles
1. **Defensive data handling** — Always validate input before DB writes
2. **RLS-first** — Every query respects row-level security policies
3. **MT timezone** — No UTC conversions in displays; use formatters from lib/formatters.ts
4. **Commission locked** — Only sent/fulfilled orders earn commission; immutable calculation
5. **Visit deduplication** — One visit per account per day (even if multiple brands)
6. **Type safety** — Use interfaces from lib/types.ts; no `any`
7. **Cache strategically** — Use lib/cache.ts; invalidate by prefix, not globally
8. **Error first** — Log errors to console; never silently fail

## Stack Constraints
- **Database**: Supabase PostgREST only (no raw SQL in client)
- **Auth**: Next.js SSR middleware (middleware.ts pattern)
- **No paid APIs**: Resend for email, Axiom free tier for logs, Upstash for rate limiting
- **Styling**: Inline React.CSSProperties with theme.ts vars; no CSS files
- **State**: React hooks only; no Redux/Zustand

## File Organization
- `app/` → pages and components
- `app/lib/` → data layer (data.ts), auth (auth.ts), types (types.ts), formatters (formatters.ts)
- `migrations/` → SQL only; include migration number in filename
- `.claude/rules/` → Domain-specific instructions (loaded auto)

## Before You Start
- Read SPEC.md for business requirements
- Visit https://barley-bros.com to understand the business
