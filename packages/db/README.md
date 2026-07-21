# `@cove/db`

Prisma Schema and Prisma Migrate tooling for Cove's PostgreSQL database.

This package is tooling-only. Runtime persistence uses explicit SQL through Effect, so it does not
generate or export Prisma Client.

Copy `.env.example` to `.env`, then run the package scripts through Vite+ to validate the schema,
create reviewed migrations, apply local migrations, deploy committed migrations, or inspect
migration status.

Run `vp run @cove/db#seed` from the repository root to upsert the three passwordless demo users:

- `alice@cove.local` (`demo-alice`)
- `bob@cove.local` (`demo-bob`)
- `carol@cove.local` (`demo-carol`)

Sign-in is by one-time magic link; the seed contains no passwords or reusable login credentials.

Audit rows retain common indexed columns alongside an event version and JSONB metadata payload, so
new event-specific context can be added without a migration for every field.
