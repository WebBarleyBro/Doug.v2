CREATE TABLE IF NOT EXISTS depletion_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID REFERENCES placements(id) ON DELETE CASCADE,
  account_id   UUID REFERENCES accounts(id),
  client_id    UUID REFERENCES clients(id),
  period_month DATE NOT NULL,
  cases_sold   DECIMAL(10,2) DEFAULT 0,
  notes        TEXT,
  entered_by   UUID REFERENCES user_profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasting_consumers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID REFERENCES events(id) ON DELETE CASCADE,
  client_id          UUID REFERENCES clients(id),
  email              TEXT,
  first_name         TEXT,
  product_rated      TEXT,
  rating             INTEGER CHECK (rating BETWEEN 1 AND 5),
  would_buy          BOOLEAN,
  notes              TEXT,
  opted_in_marketing BOOLEAN DEFAULT false,
  captured_at        TIMESTAMPTZ DEFAULT NOW()
);
