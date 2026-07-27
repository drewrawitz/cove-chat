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

The ordinary seed stays intentionally small. For the opt-in growth-readiness fixture, reset the
local database while synchronization is stopped and then load the deterministic moderate shape:

```sh
vp run @cove/db#migrate:reset
vp run @cove/db#seed:moderate
```

The moderate command reuses the ordinary demo seed, then creates exactly 20 Channels, 500 Topics in
General, 10,000 Messages, and 1,000 Replies in `Growth Topic 0001`. Repeating it is safe and does not
duplicate fixture rows. It is a correctness and smoke fixture, not the default development seed or
a production-capacity benchmark. The exported `MODERATE_*` constants in
`prisma/moderate-fixture.ts` are the source of truth for those dimensions.

Audit rows retain common indexed columns alongside an event version and JSONB metadata payload, so
new event-specific context can be added without a migration for every field.
