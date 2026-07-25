# `@cove/infrastructure-postgres`

PostgreSQL adapters for Cove's Effect modules and ports.

This package uses explicit parameterized SQL through Effect's PostgreSQL client. Persisted rows are
decoded before they become domain values, and driver failures are translated into the ports'
typed `PersistenceError`.

Workspace Access and durable Message Commands are the intentional exceptions to the port-adapter
pattern. Workspace Access implements the restricted application-owned
`@cove/application/workspaces/internal` persistence interface and translates failures to
`WorkspaceAccessPersistenceFailure`. Message Commands keep receipt claiming, fingerprinting,
version checks, Message mutation, and terminal outcome persistence together in one PostgreSQL
transaction behind the small application-owned `MessageCommands` interface.

`PostgresLive` reads `DATABASE_URL` and `TOPIC_ARCHIVE_CURSOR_SIGNING_KEY` through Effect `Config`
and provides the Workspace Access module alongside the repository, audit, and transaction ports.
Prisma in `@cove/db` remains the schema and migration tool; it is not used by the runtime adapters.

The integration suite starts a disposable PostgreSQL container and runs `prisma migrate deploy`
against it before testing the adapters. A compatible container runtime such as Docker, Podman,
Colima, Rancher Desktop, or Testcontainers Desktop must be available.

Run it with:

```sh
vp run --filter @cove/infrastructure-postgres test:integration
```

For a local database reset, use `vp run @cove/db#migrate:reset`. The wrapper removes Cove's
database-level Zero publication, inactive replication slots, and internal Zero metadata before
Prisma resets and replays the schema migrations. Stop `@cove/sync#dev` first; the reset refuses to
run while Zero is actively using a replication slot.
