-- RECOVERY: Restore correct clients table after accidental DROP TABLE CASCADE
-- The other AI dropped the original table and recreated it with the wrong schema.
-- This script restores the correct structure and data.

-- Step 1: Drop the broken table the other AI created (wrong schema)
DROP TABLE IF EXISTS public.clients CASCADE;

-- Step 2: Recreate with the CORRECT schema (matches app/lib/types.ts Client interface)
CREATE TABLE public.clients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,
  commission_rate  DECIMAL(5,4) DEFAULT 0,
  color            TEXT DEFAULT '#d4a843',
  logo_url         TEXT,
  contact_name     TEXT,
  contact_email    TEXT,
  contact_phone    TEXT,
  address          TEXT,
  territory        TEXT,
  distributor_name TEXT,
  order_type       TEXT CHECK (order_type IN ('direct','distributor')) DEFAULT 'direct',
  since_date       DATE,
  active           BOOLEAN DEFAULT true,
  notes            TEXT,
  category         TEXT,
  state            TEXT,
  instagram        TEXT,
  website          TEXT,
  track_depletions BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Insert the 4 real Barley Bros clients
INSERT INTO clients
  (name, slug, commission_rate, color, order_type, since_date, contact_email, territory)
VALUES
  ('NoCo Distillery',         'noco-distillery',         0.12, '#4a9eff', 'direct',      '2024-01-01',
   'nocodistillery@gmail.com',  'Northern Colorado'),
  ('Por Lo Bueno',             'por-lo-bueno',             0,    '#e85d4a', 'distributor', '2024-03-01',
   'richard@porlobueno.com',    'Denver Metro + NoCo'),
  ('Sol 2 Noches',             'sol-2-noches',             0.12, '#f5a623', 'distributor', '2024-06-01',
   'daisy@sol2noches.com',      'Northern Colorado'),
  ('Rocky Mountain Moonshine', 'rocky-mountain-moonshine', 0.10, '#4caf50', 'direct',      '2024-02-01',
   'rockymtmoonshine@gmail.com','Statewide Colorado')
ON CONFLICT (slug) DO NOTHING;

-- Step 4: Restore logos
UPDATE clients SET logo_url = 'https://res.cloudinary.com/dhg83nxda/image/upload/v1769094617/NoCo_Distillery_Logo_ynk7uk_e_background_removal_f_png_l1rwrn.png' WHERE slug = 'noco-distillery';
UPDATE clients SET logo_url = 'https://res.cloudinary.com/dhg83nxda/image/upload/v1769093535/PLB_Logo_Mezcal_Logo_Skull_Cream_80_gnaxj4.webp'                WHERE slug = 'por-lo-bueno';
UPDATE clients SET logo_url = 'https://res.cloudinary.com/dhg83nxda/image/upload/v1769094474/Round_S2N_R_logo-03_1_2_1_hitn0a.png'                       WHERE slug = 'sol-2-noches';
UPDATE clients SET logo_url = 'https://res.cloudinary.com/dhg83nxda/image/upload/v1769094769/8da5b56cb_RockyMountainMoonshine_mlogku.png'                 WHERE slug = 'rocky-mountain-moonshine';

-- Step 5: Restore client_id columns on related tables (FK constraints were CASCADE dropped)
ALTER TABLE visits          ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE placements      ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE events          ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE campaigns       ADD COLUMN IF NOT EXISTS client_id UUID;

-- Clear orphaned UUIDs (they pointed to the old deleted client records)
UPDATE visits          SET client_id = NULL;
UPDATE placements      SET client_id = NULL;
UPDATE purchase_orders SET client_id = NULL;
UPDATE events          SET client_id = NULL;
UPDATE campaigns       SET client_id = NULL;

-- Backfill client_id from client_slug (the slug is still intact on all rows)
UPDATE visits          v   SET client_id = c.id FROM clients c WHERE v.client_slug   = c.slug;
UPDATE placements      p   SET client_id = c.id FROM clients c WHERE p.client_slug   = c.slug;
UPDATE purchase_orders po  SET client_id = c.id FROM clients c WHERE po.client_slug  = c.slug;
UPDATE events          e   SET client_id = c.id FROM clients c WHERE e.client_slug   = c.slug;
UPDATE campaigns       cam SET client_id = c.id FROM clients c WHERE cam.client_slug = c.slug;

-- Step 6: Re-enable RLS and policies (were dropped with CASCADE)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_staff"       ON clients;
DROP POLICY IF EXISTS "clients_portal_read" ON clients;

CREATE POLICY "clients_staff" ON clients
  FOR ALL USING (get_my_role() IN ('owner','admin','rep','intern'));

CREATE POLICY "clients_portal_read" ON clients
  FOR SELECT USING (
    get_my_role() = 'portal'
    AND slug = get_my_client_slug()
  );
