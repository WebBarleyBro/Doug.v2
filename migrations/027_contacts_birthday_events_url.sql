-- Migration 027: contacts birthday, events url
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS url TEXT;
