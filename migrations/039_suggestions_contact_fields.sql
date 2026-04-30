-- Add phone and email fields for contact suggestions from portal clients
ALTER TABLE client_suggestions ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE client_suggestions ADD COLUMN IF NOT EXISTS contact_email TEXT;
