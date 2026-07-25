-- Prisma only resets its configured schema. Zero's logical replication slots,
-- publications, and internal schemas are database-level state that must be
-- removed before the application migrations are replayed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_replication_slots
    WHERE (
      slot_name = 'cove_0'
      OR slot_name LIKE 'cove\_0\_%' ESCAPE '\'
    )
      AND database = current_database()
      AND active
  ) OR EXISTS (
    SELECT 1
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND application_name LIKE 'zero-%'
      AND pid <> pg_backend_pid()
  ) THEN
    RAISE EXCEPTION
      'Cannot reset Cove while Zero sync is running. Stop @cove/sync#dev and retry.';
  END IF;
END
$$;

SELECT pg_drop_replication_slot(slot_name)
FROM pg_replication_slots
WHERE (
    slot_name = 'cove_0'
    OR slot_name LIKE 'cove\_0\_%' ESCAPE '\'
  )
  AND database = current_database();

DROP PUBLICATION IF EXISTS "_cove_public_0";
DROP PUBLICATION IF EXISTS "_cove_metadata_0";
DROP PUBLICATION IF EXISTS "cove_zero_data";

DROP SCHEMA IF EXISTS "cove_0/cvr" CASCADE;
DROP SCHEMA IF EXISTS "cove_0/cdc" CASCADE;
DROP SCHEMA IF EXISTS "cove_0" CASCADE;
DROP SCHEMA IF EXISTS "cove" CASCADE;
