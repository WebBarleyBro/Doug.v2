-- Add last_visit_status to accounts for momentum indicator on the accounts list.
-- This lets us show the last recorded visit status without loading full visit history.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_visit_status TEXT;

-- Backfill: set last_visit_status from the most recent visit per account
UPDATE accounts a
SET last_visit_status = sub.status
FROM (
  SELECT DISTINCT ON (account_id)
    account_id,
    status
  FROM visits
  ORDER BY account_id, visited_at DESC
) sub
WHERE a.id = sub.account_id
  AND a.last_visit_status IS NULL;
