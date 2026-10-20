-- Additive module initialization; existing off-days and profile events are retained.
-- The operations store persists this module atomically under its existing lock.
INSERT INTO ops_state(key,data)
VALUES ('roster','{"version":1,"requests":[],"plans":[],"entitlements":[]}'::jsonb)
ON CONFLICT(key) DO NOTHING;
