-- Add shelf_date to placements so VisitLogModal can record when a product hit the shelf
ALTER TABLE placements ADD COLUMN IF NOT EXISTS shelf_date DATE;
