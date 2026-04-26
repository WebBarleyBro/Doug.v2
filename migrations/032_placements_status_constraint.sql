-- Enforce valid placement status values at the database level
ALTER TABLE placements ADD CONSTRAINT check_status
  CHECK (status IN ('committed', 'ordered', 'on_shelf', 'reordering'));
