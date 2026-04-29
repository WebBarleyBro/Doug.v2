-- Add optional contact_person field to client_suggestions
-- Allows clients to include a specific contact name when suggesting a venue
ALTER TABLE client_suggestions ADD COLUMN IF NOT EXISTS contact_person TEXT;
