-- Advanced account fields for smarter visit planning
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS best_days TEXT[] DEFAULT '{}';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS best_time TEXT DEFAULT 'anytime';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'B';
