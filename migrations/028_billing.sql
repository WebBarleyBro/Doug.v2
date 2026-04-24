-- Billing: monthly retainer fees, Stripe invoicing, depletion-based commission tracking

-- Add billing fields to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_retainer_fee numeric NOT NULL DEFAULT 0;

-- billing_depletions: distributor sell-through reports submitted by portal clients
-- (separate from depletion_entries which is placement-level internal tracking)
CREATE TABLE IF NOT EXISTS billing_depletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL,
  product_name text NOT NULL,
  period_month text NOT NULL,          -- 'YYYY-MM'
  cases_sold numeric NOT NULL DEFAULT 0,
  sale_value numeric NOT NULL DEFAULT 0, -- total $ from distributor report
  notes text,
  invoice_id uuid,                     -- set when this depletion is included in an invoice
  submitted_by uuid REFERENCES user_profiles(id),
  submitted_by_portal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- client_invoices: monthly billing records (retainer + commission)
CREATE TABLE IF NOT EXISTS client_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL,
  stripe_invoice_id text UNIQUE,
  stripe_invoice_url text,
  stripe_pdf_url text,
  period_month text NOT NULL,          -- 'YYYY-MM' billing month
  status text NOT NULL DEFAULT 'draft', -- draft | sent | paid | void | overdue
  retainer_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  admin_notes text,
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- client_invoice_line_items: editable line items for admin review
CREATE TABLE IF NOT EXISTS client_invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES client_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'other',  -- retainer | commission | other
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add FK after both tables exist
ALTER TABLE billing_depletions ADD CONSTRAINT billing_depletions_invoice_fk
  FOREIGN KEY (invoice_id) REFERENCES client_invoices(id) ON DELETE SET NULL
  NOT VALID;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_client_invoices_client_slug ON client_invoices(client_slug);
CREATE INDEX IF NOT EXISTS idx_client_invoices_status ON client_invoices(status);
CREATE INDEX IF NOT EXISTS idx_billing_depletions_client_slug ON billing_depletions(client_slug);
CREATE INDEX IF NOT EXISTS idx_billing_depletions_invoice_id ON billing_depletions(invoice_id);

-- RLS
ALTER TABLE client_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_depletions ENABLE ROW LEVEL SECURITY;

-- Invoices: internal team full access
CREATE POLICY "invoices_internal" ON client_invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','rep'))
  );

-- Invoices: portal clients read their own
CREATE POLICY "invoices_portal_read" ON client_invoices
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'portal' AND client_slug = client_invoices.client_slug)
  );

-- Line items: internal full access
CREATE POLICY "line_items_internal" ON client_invoice_line_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','rep'))
  );

-- Line items: portal clients read their own invoice's items
CREATE POLICY "line_items_portal_read" ON client_invoice_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM client_invoices ci
      JOIN user_profiles up ON up.id = auth.uid()
      WHERE ci.id = client_invoice_line_items.invoice_id
        AND up.role = 'portal' AND up.client_slug = ci.client_slug
    )
  );

-- Depletions: internal read all
CREATE POLICY "depletions_internal_read" ON billing_depletions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','rep'))
  );

-- Depletions: internal write
CREATE POLICY "depletions_internal_write" ON billing_depletions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','rep'))
  );

-- Depletions: portal clients full access to their own
CREATE POLICY "depletions_portal_own" ON billing_depletions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'portal' AND client_slug = billing_depletions.client_slug)
  );
