-- Add order inquiry columns to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'direct';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS deliver_to_phone TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS distributor_email TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS distributor_rep_name TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS email_draft TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT false;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS last_resent_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS last_resent_to TEXT;

-- Add client_slug to contacts (for distributor reps)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS client_slug TEXT;

-- Update client logos from Cloudinary
UPDATE clients SET logo_url = 'https://res.cloudinary.com/dhg83nxda/image/upload/v1769094617/NoCo_Distillery_Logo_ynk7uk_e_background_removal_f_png_l1rwrn.png' WHERE slug = 'noco-distillery' AND (logo_url IS NULL OR logo_url = '');
UPDATE clients SET logo_url = 'https://res.cloudinary.com/dhg83nxda/image/upload/v1769093535/PLB_Logo_Mezcal_Logo_Skull_Cream_80_gnaxj4.webp'                WHERE slug = 'por-lo-bueno'             AND (logo_url IS NULL OR logo_url = '');
UPDATE clients SET logo_url = 'https://res.cloudinary.com/dhg83nxda/image/upload/v1769094474/Round_S2N_R_logo-03_1_2_1_hitn0a.png'                       WHERE slug = 'sol-2-noches'             AND (logo_url IS NULL OR logo_url = '');
UPDATE clients SET logo_url = 'https://res.cloudinary.com/dhg83nxda/image/upload/v1769094769/8da5b56cb_RockyMountainMoonshine_mlogku.png'                 WHERE slug = 'rocky-mountain-moonshine' AND (logo_url IS NULL OR logo_url = '');
