-- Add missing columns to accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'on_premise';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone TEXT;

-- Backfill account_type for existing rows
UPDATE accounts SET account_type = 'on_premise' WHERE account_type IS NULL;
