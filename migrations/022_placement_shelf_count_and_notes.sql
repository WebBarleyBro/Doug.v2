-- Add shelf count tracking and notes to placements
ALTER TABLE placements ADD COLUMN IF NOT EXISTS shelf_count INTEGER;
ALTER TABLE placements ADD COLUMN IF NOT EXISTS notes TEXT;
