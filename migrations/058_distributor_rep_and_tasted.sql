-- Migration 058: Distributor rep FK tracking + Tasted visit status + account opening tracking

-- ── 1. Contacts: explicit distributor rep flag ────────────────────────────────
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_distributor_rep BOOLEAN NOT NULL DEFAULT false;

-- Backfill from existing category = 'distributor' contacts
UPDATE contacts SET is_distributor_rep = true WHERE category = 'distributor';

-- ── 2. account_clients: per-account-brand rep assignment + account opening ────
ALTER TABLE account_clients
  ADD COLUMN IF NOT EXISTS distributor_rep_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opened_for_client_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- ── 3. purchase_orders: proper FK to the distributor rep contact ──────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS distributor_rep_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- Backfill where distributor_email matches a known contact email
UPDATE purchase_orders po
SET distributor_rep_id = c.id
FROM contacts c
WHERE c.is_distributor_rep = true
  AND po.distributor_email IS NOT NULL
  AND po.distributor_rep_id IS NULL
  AND LOWER(TRIM(c.email)) = LOWER(TRIM(po.distributor_email));

-- ── 4. Visits: add 'Tasted' as a loggable outcome ────────────────────────────
-- Drop existing status constraint if present (name may vary — safe with IF EXISTS)
ALTER TABLE visits DROP CONSTRAINT IF EXISTS check_visit_status;
ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_status_check;

ALTER TABLE visits ADD CONSTRAINT check_visit_status
  CHECK (status IN (
    'Will Order Soon',
    'Just Ordered',
    'Needs Follow Up',
    'Not Interested',
    'Menu Feature Won',
    'New Placement',
    'General Check-In',
    'Tasted'
  ));

-- ── 5. Rename UI label: purchase_orders order_type stays 'distributor' in DB  ─
-- (Renaming the enum value itself risks data loss and FK cascades.
--  All "order inquiry" label changes are UI-only — handled in TypeScript.)

-- ── 6. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_distributor_rep
  ON contacts(id) WHERE is_distributor_rep = true;

CREATE INDEX IF NOT EXISTS idx_account_clients_rep
  ON account_clients(distributor_rep_id) WHERE distributor_rep_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_account_clients_opened
  ON account_clients(client_slug, opened_for_client_at) WHERE opened_for_client_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_po_distributor_rep
  ON purchase_orders(distributor_rep_id) WHERE distributor_rep_id IS NOT NULL;
