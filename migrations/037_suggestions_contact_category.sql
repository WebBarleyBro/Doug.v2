-- Allow portal clients to flag a suggested contact as a distributor rep
ALTER TABLE client_suggestions ADD COLUMN IF NOT EXISTS contact_category TEXT DEFAULT 'general';
