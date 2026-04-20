-- Run this first in Supabase SQL editor

CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  commission_rate DECIMAL(5,4) DEFAULT 0,
  color         TEXT DEFAULT '#d4a843',
  logo_url      TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address       TEXT,
  territory     TEXT,
  order_type    TEXT CHECK (order_type IN ('direct','distributor')) DEFAULT 'direct',
  since_date    DATE,
  active        BOOLEAN DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with existing clients
INSERT INTO clients
  (name, slug, commission_rate, color, logo_url, contact_name, contact_email, contact_phone, territory, order_type, since_date)
VALUES
  ('NoCo Distillery',        'noco-distillery',         0.12, '#4a9eff', null, 'Sarah Johnson', 'sarah@nocodistillery.com',    '970-414-7188', 'Northern Colorado',         'direct',      '2024-01-01'),
  ('Por Lo Bueno',            'por-lo-bueno',             0,    '#e85d4a', null, 'Carlos Rivera',  'carlos@porlobueno.com',       '970-555-0103', 'Denver Metro + NoCo',       'distributor', '2024-03-01'),
  ('Sol 2 Noches',            'sol-2-noches',             0.12, '#f5a623', null, 'Maria Santos',   'maria@sol2noches.com',        '970-555-0104', 'Northern Colorado',         'distributor', '2024-06-01'),
  ('Rocky Mountain Moonshine','rocky-mountain-moonshine', 0.10, '#4caf50', null, 'Jake Miller',    'jake@rockymountainmoonshine.com','970-555-0105','Statewide Colorado',       'direct',      '2024-02-01')
ON CONFLICT (slug) DO NOTHING;
