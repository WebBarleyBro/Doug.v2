-- Add FK constraint on events.account_id so PostgREST can join accounts.
-- IF NOT EXISTS equivalent: use DO block to avoid error if constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'events_account_id_fkey'
      AND table_name = 'events'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
  END IF;
END $$;
