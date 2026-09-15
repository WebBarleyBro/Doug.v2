-- Retire duplicate NoCo product rows.
--
-- Two products had been entered twice:
--   Quadruple Distilled Bourbon  - two rows; the older one has null
--                                  bottle_size/category, the newer is complete.
--   Ridge Mountain Spiced Rum    - two identical rows created 52 seconds apart
--                                  (an accidental double submit).
--
-- Nothing is deleted. The redundant row is flagged active = false so it stays
-- available for history while dropping out of the product pickers (getProducts
-- now filters on active). Re-runnable, and safe if already applied.
--
-- Note: po_line_items and placements both reference products by product_name
-- text, not by id, so retiring a catalog row cannot orphan an order or a
-- placement.

-- Keep f57682c1 (750ml / Ultra Premium); retire the incomplete older row.
UPDATE products SET active = false
WHERE id = 'b25b0b3e-5e82-4fae-93bb-897a4a1ddfce'
  AND client_slug = 'noco-distillery'
  AND name = 'Quadruple Distilled Bourbon';

-- Keep e50d982b (created first); retire the duplicate submitted 52s later.
UPDATE products SET active = false
WHERE id = 'a760d622-7648-457f-a86c-b265f2ea903a'
  AND client_slug = 'noco-distillery'
  AND name = 'Ridge Mountain Spiced Rum';
