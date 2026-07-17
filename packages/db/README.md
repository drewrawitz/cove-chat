# `@cove/db`

Prisma Schema and Prisma Migrate tooling for Cove's PostgreSQL database.

This package is tooling-only. Runtime persistence uses explicit SQL through Effect, so it does not
generate or export Prisma Client.

Copy `.env.example` to `.env`, then run the package scripts through Vite+ to validate the schema,
create reviewed migrations, apply local migrations, deploy committed migrations, or inspect
migration status.
