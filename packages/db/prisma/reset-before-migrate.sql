-- Prisma resets the configured schema, but PostgreSQL publications are
-- database-level objects and survive with an empty table list.
DROP PUBLICATION IF EXISTS "cove_zero_data";
