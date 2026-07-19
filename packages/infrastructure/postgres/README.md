# `@cove/infrastructure-postgres`

PostgreSQL adapters for Cove's Effect modules and ports.

This package uses explicit parameterized SQL through Effect's PostgreSQL client. Persisted rows are
decoded before they become domain values, and driver failures are translated into the ports'
typed `PersistenceError`.

Workspace Access is the intentional exception to the port-adapter pattern: its Postgres adapter
implements the restricted application-owned `@cove/application/workspaces/internal` persistence
interface and translates failures to `WorkspaceAccessPersistenceFailure`.

`PostgresLive` reads `DATABASE_URL` through Effect `Config` and provides the Workspace Access module
alongside the repository, audit, and transaction ports.
Prisma in `@cove/db` remains the schema and migration tool; it is not used by the runtime adapters.

The integration suite starts a disposable PostgreSQL container and runs `prisma migrate deploy`
against it before testing the adapters. A compatible container runtime such as Docker, Podman,
Colima, Rancher Desktop, or Testcontainers Desktop must be available.

Run it with:

```sh
vp run --filter @cove/infrastructure-postgres test:integration
```
