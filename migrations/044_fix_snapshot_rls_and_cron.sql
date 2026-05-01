-- Migration 044: Fix zone_metric_snapshots RLS for client-agnostic territories.
--
-- Migration 043 made markets client-agnostic by moving client_slug to zones,
-- but forgot to update the zone_metric_snapshots SELECT policy which still
-- joins through markets to check m.client_slug (now null). Portal users would
-- see no snapshots. This fixes the policy to join directly through zones.

DROP POLICY IF EXISTS "zms_select" ON zone_metric_snapshots;
CREATE POLICY "zms_select" ON zone_metric_snapshots FOR SELECT USING (
  get_my_role() IN ('owner', 'admin', 'rep')
  OR (get_my_role() = 'portal' AND EXISTS (
    SELECT 1 FROM zones z
    WHERE z.id = zone_metric_snapshots.zone_id
      AND z.client_slug = get_my_client_slug()
  ))
);
