-- Performance indexes for the most common query patterns
-- Run in: Supabase Dashboard → SQL Editor

-- visits: dashboard follow-up queue (status + cleared/dismissed + date)
CREATE INDEX IF NOT EXISTS idx_visits_followup
  ON visits(status, visited_at DESC)
  WHERE follow_up_cleared_at IS NULL AND follow_up_dismissed_at IS NULL;

-- visits: account timeline tab + dedup queries
CREATE INDEX IF NOT EXISTS idx_visits_account_date
  ON visits(account_id, visited_at DESC);

-- visits: per-rep filter on visits log page
CREATE INDEX IF NOT EXISTS idx_visits_user_date
  ON visits(user_id, visited_at DESC);

-- visits: client brand filter
CREATE INDEX IF NOT EXISTS idx_visits_client_slug
  ON visits(client_slug, visited_at DESC);

-- accounts: overdue query (sorted by last_visited)
CREATE INDEX IF NOT EXISTS idx_accounts_last_visited
  ON accounts(last_visited ASC NULLS FIRST, visit_frequency_days);

-- placements: active placements per brand (most common read)
CREATE INDEX IF NOT EXISTS idx_placements_client_active
  ON placements(client_slug, status)
  WHERE lost_at IS NULL;

-- placements: account placements tab
CREATE INDEX IF NOT EXISTS idx_placements_account_active
  ON placements(account_id)
  WHERE lost_at IS NULL;

-- purchase_orders: orders per brand (finance + client pages)
CREATE INDEX IF NOT EXISTS idx_orders_client_status
  ON purchase_orders(client_slug, status, created_at DESC);

-- purchase_orders: distributor follow-up queue
CREATE INDEX IF NOT EXISTS idx_orders_distributor_status
  ON purchase_orders(distributor_status, created_at DESC)
  WHERE order_type = 'distributor';

-- contacts: account contacts tab
CREATE INDEX IF NOT EXISTS idx_contacts_account
  ON contacts(account_id, category);

-- contacts: distributor rep lookups
CREATE INDEX IF NOT EXISTS idx_contacts_distributor
  ON contacts(category)
  WHERE category = 'distributor';

-- tasks: dashboard open tasks per user
CREATE INDEX IF NOT EXISTS idx_tasks_user_open
  ON tasks(assigned_to, due_date)
  WHERE completed = false;

-- client_suggestions: dashboard unread queue
CREATE INDEX IF NOT EXISTS idx_suggestions_new
  ON client_suggestions(submitted_at DESC)
  WHERE status = 'new';
