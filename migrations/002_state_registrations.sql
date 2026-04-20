CREATE TABLE IF NOT EXISTS state_registrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID REFERENCES clients(id) ON DELETE CASCADE,
  state                 TEXT NOT NULL,
  status                TEXT CHECK (status IN ('active','pending','expired','not_registered')) DEFAULT 'pending',
  ttb_number            TEXT,
  expiry_date           DATE,
  label_approval_status TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS state_regs_client_state_unique
  ON state_registrations(client_id, state);
