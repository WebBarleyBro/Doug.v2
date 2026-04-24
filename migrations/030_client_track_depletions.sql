-- Per-client flag to show/hide the depletion report section in the portal
ALTER TABLE clients ADD COLUMN IF NOT EXISTS track_depletions boolean NOT NULL DEFAULT false;
