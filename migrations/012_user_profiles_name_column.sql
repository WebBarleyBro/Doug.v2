-- user_profiles uses full_name; app expects name — add alias column
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS name TEXT;
UPDATE user_profiles SET name = full_name WHERE name IS NULL;
