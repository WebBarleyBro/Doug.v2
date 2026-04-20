-- Distributor info on clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS distributor_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS distributor_rep_id UUID REFERENCES contacts(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS territory TEXT;
