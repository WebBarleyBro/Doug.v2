-- Add foreign key from visits.user_id to user_profiles.id
-- This enables the PostgREST embedded join user_profiles(id, name)
ALTER TABLE visits
  ADD CONSTRAINT visits_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
