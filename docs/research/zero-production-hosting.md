# Zero 1.8 production hosting for Cove

_Researched 2026-07-23 against Cove's current implementation and the official Zero, PostgreSQL,
Railway, and Render documentation._

## Executive summary

Cove's first production deployment needs four independently deployable pieces:

1. The static web application, usually served by a CDN or static host.
2. The long-running Cove API service.
3. One long-running `zero-cache` service.
4. PostgreSQL 15 or later with logical replication enabled.

The smallest sensible deployment is one API instance and one single-node `zero-cache` instance in
the same region as PostgreSQL. A single `zero-cache` process tree already contains both of Zero's
roles: the replication manager, which consumes PostgreSQL's logical replication stream, and view
syncers, which serve client queries. Rocicorp says this single-node topology can go surprisingly far
and recommends splitting the roles only after reaching its limits. The repository currently pins
`@rocicorp/zero` 1.8.0, so the corresponding production image is `rocicorp/zero:1.8.0` or
`ghcr.io/rocicorp/zero:1.8.0`.
([Zero self-hosting](https://zero.rocicorp.dev/docs/self-host))

Logical replication is a standard PostgreSQL feature, but cloud-provider access to its settings,
replication slots, publications, and required privileges is not standardized:

- Railway supports the required configuration because its PostgreSQL template is an unmanaged
  PostgreSQL container under the customer's control. Railway documents using `ALTER SYSTEM` and
  restarting the deployment.
  ([Railway PostgreSQL](https://docs.railway.com/databases/postgresql))
- Render supports logical replication, but it is disabled by default. It currently requires a Pro
  workspace or higher, at least 10 GB of database storage, and a support request.
  ([Render logical replication](https://render.com/docs/postgresql-logical-replication))

For Cove, Railway is the more direct path if the team is comfortable operating the database
template. Render is viable, but its support-gated setup, lack of event-trigger privileges, and
incompatibility between Zero and Render HA are material constraints.

## Cove's production traffic flow

The current application intentionally keeps commands in the API rather than using Zero mutators.
`ZERO_ENABLE_CRUD_MUTATIONS=false` is therefore correct, and Cove does not need a
`ZERO_MUTATE_URL`.

The flow is:

1. The browser downloads the web build. `VITE_ZERO_CACHE_URL` is baked into that build and should
   point to a public HTTPS origin such as `https://sync.example.com`.
2. The browser sends authentication and durable command requests to the Cove API.
3. The browser opens a long-lived WebSocket connection to the public `zero-cache` origin.
4. For a named query, `zero-cache` forwards the browser's session cookie to Cove's
   `POST /api/zero/query` endpoint at `ZERO_QUERY_URL`.
5. The API validates the opaque Cove session and returns the authorized ZQL transformation.
6. `zero-cache` executes that transformation against its local SQLite replica and streams the
   authorized rows to the browser.
7. Durable commands write to authoritative PostgreSQL through the API. PostgreSQL emits committed
   row changes through the logical replication stream, `zero-cache` applies them to SQLite, and the
   view syncer pushes the resulting query diffs to connected clients.

This is the same query lifecycle described by Rocicorp: the query endpoint turns a named query into
ZQL, `zero-cache` hydrates it from its server-side replica, and later PostgreSQL changes update the
query incrementally.
([Zero queries](https://zero.rocicorp.dev/docs/queries))

Place the API, `zero-cache`, and PostgreSQL in one region and use private networking for the
server-to-server links. Rocicorp explicitly recommends colocating all services in a single-region
deployment.
([Zero self-hosting: performance](https://zero.rocicorp.dev/docs/self-host#performance))

## The initial `zero-cache` service

Run the production `zero-cache` image, not `zero-cache-dev`. The initial service should have:

- One replica of the service.
- Public HTTPS/WSS routing to the service's port `4848`; the load balancer must support WebSockets.
- A health check against `/keepalive`.
- A local persistent volume mounted at a path such as `/data`, with
  `ZERO_REPLICA_FILE=/data/replica.db`.
- A generous startup grace period because a missing replica causes a full initial copy. Rocicorp
  suggests ten minutes as a starting point.
- A generous shutdown/draining period so WebSockets and replication state can close cleanly.
- Fast disk IOPS. Hydration runs against the local SQLite replica, so its disk is a primary
  performance constraint.
- Enough disk for the replica and its WAL files. If `ZERO_REPLICA_VACUUM_INTERVAL_HOURS` is enabled,
  a vacuum needs approximately twice the replica size in free disk.

The SQLite file is a derived cache, not the source of truth. It may be lost, but the next start then
has to copy and resynchronize from PostgreSQL. Persistent storage chiefly avoids slow restarts and
unnecessary load on PostgreSQL.
([Zero self-hosting](https://zero.rocicorp.dev/docs/self-host),
[zero-cache replica configuration](https://zero.rocicorp.dev/docs/zero-cache-config#replica-file))

### Production environment

At minimum, adapt the current `packages/sync/.env.example` into secret-managed production
configuration:

| Variable                     | Cove production value or requirement                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `NODE_ENV`                   | `production`                                                                          |
| `ZERO_APP_ID`                | `cove`; keep stable for the life of this deployment                                   |
| `ZERO_APP_PUBLICATIONS`      | `cove_zero_data`                                                                      |
| `ZERO_UPSTREAM_DB`           | A **direct**, TLS-enabled PostgreSQL URL; never a PgBouncer or transaction-pooler URL |
| `ZERO_CVR_DB`                | A pooled PostgreSQL URL in production; it may point at the same database              |
| `ZERO_CHANGE_DB`             | A pooled PostgreSQL URL in production; it may point at the same database              |
| `ZERO_REPLICA_FILE`          | A path on the mounted volume, such as `/data/replica.db`                              |
| `ZERO_ADMIN_PASSWORD`        | A long random secret; required when `NODE_ENV=production`                             |
| `ZERO_QUERY_URL`             | A URL reachable from `zero-cache`, such as `https://api.example.com/api/zero/query`   |
| `ZERO_QUERY_FORWARD_COOKIES` | `true` for Cove's current cookie authentication                                       |
| `ZERO_ENABLE_CRUD_MUTATIONS` | `false`; Cove writes through its HTTP API                                             |
| `ZERO_PORT`                  | Normally leave at `4848` and map the platform's public HTTPS port to it               |
| `VITE_ZERO_CACHE_URL`        | Web build-time value such as `https://sync.example.com`                               |

The upstream connection must be direct because the replication manager owns a logical replication
slot and keeps a streaming connection open. Rocicorp recommends pooled connections for CVR and
change storage, but not for the upstream replication stream.
([Zero self-hosting](https://zero.rocicorp.dev/docs/self-host))

Connection-pool sizing is part of capacity planning. Zero 1.8 defaults to 30 CVR connections, 5
change-database connections, and 20 upstream mutation connections plus the replication stream,
although disabling CRUD mutations means view syncers do not use the upstream mutation pool. Tune
the worker and pool settings to the database plan instead of assuming the defaults fit a small
hosted instance.
([zero-cache configuration](https://zero.rocicorp.dev/docs/zero-cache-config))

Do not leave the Prisma-specific `?schema=public` parameter on `ZERO_UPSTREAM_DB`; Zero expects a
normal PostgreSQL connection string. The repository's current `.env.example` still needs that local
development correction reflected in any deployment template.

## Authentication and network security

Only the view-syncer port is public:

- The browser-facing view syncer is exposed through HTTPS/WSS. Zero listens on `4848` by default.
- In a future multi-node topology, the replication manager listens on `4849`, but it must remain on
  private networking and be reachable only by view syncers.
- PostgreSQL should be reachable only from the API and Zero services where the hosting platform
  permits private networking.

Rocicorp explicitly warns not to expose the replication manager publicly.
([Zero self-hosting: networking](https://zero.rocicorp.dev/docs/self-host#networking))

Cove's current cookie setup requires work before separate production subdomains will authenticate
Zero connections. The API sets `Secure`, `SameSite=Strict`, host-only cookies. A cookie issued by
`api.example.com` is not sent to `sync.example.com`. Rocicorp's production cookie deployment
requires:

1. Hosting `zero-cache` on a subdomain of the application's root domain.
2. Issuing the session cookie with `Domain=.example.com`.
3. Retaining `SameSite=Lax` or `SameSite=Strict`; Rocicorp warns never to use `SameSite=None` for
   Zero auth because of cross-site WebSocket hijacking risk.

([Zero authentication](https://zero.rocicorp.dev/docs/auth#cookie-deployment))

An alternative is token authentication, but that would be an application-level design change. For
the current implementation, add a deployment-aware cookie domain before production. Also ensure
logout/session revocation reaches open connections in bounded time by configuring and testing
Zero's auth revalidation/retransformation behavior.
([zero-cache auth configuration](https://zero.rocicorp.dev/docs/zero-cache-config#auth-revalidate-interval-seconds))

`ZERO_ADMIN_PASSWORD` protects the inspector and `/statz`, but those administrative surfaces should
still be access-controlled at the network or proxy layer.
([Zero inspector](https://zero.rocicorp.dev/docs/debug/inspector))

## PostgreSQL requirements

The database must satisfy all of the following:

- PostgreSQL 15 or later.
- `wal_level=logical`.
- Enough `max_replication_slots` and `max_wal_senders` for Zero and any other replication users.
- A direct connection role with `LOGIN`, `REPLICATION`, and `SELECT` on the published tables for
  initial copy/streaming.
- Permission to create and manage the schemas/tables Zero uses for its app, CVR, and change
  metadata, or separately provisioned databases/roles with those permissions.
- The `cove_zero_data` publication applied by Cove's migration.
- A primary key or another usable replica identity on every published table whose updates/deletes
  must replicate.

PostgreSQL documents that a logical replication connection role needs `LOGIN` and `REPLICATION` and
that initial data copying needs `SELECT`. Publication creation additionally depends on database and
table ownership privileges.
([PostgreSQL logical replication security](https://www.postgresql.org/docs/current/logical-replication-security.html),
[PostgreSQL `CREATE PUBLICATION`](https://www.postgresql.org/docs/current/sql-createpublication.html))

The current explicit publication is a good production boundary:

```sql
CREATE PUBLICATION "cove_zero_data" FOR TABLE
  "workspaces",
  "workspace_identities",
  "channels",
  "channel_memberships",
  "topics",
  "messages";
```

It avoids giving `zero-cache` every table in `public`. Changing `ZERO_APP_PUBLICATIONS` causes a
replica resync and can produce replication lag/downtime, so publication changes should be treated as
planned schema deployments.
([zero-cache app publications](https://zero.rocicorp.dev/docs/zero-cache-config#app-publications))

### WAL and replication-slot operations

Logical replication slots can retain WAL indefinitely if the consumer is down or stalled, which can
fill the database disk. Monitor slot activity, restart LSN/retained bytes, and database disk usage.
Zero exposes `zero.replication.slot_health` and `zero.replication.slot_retained_wal_bytes` through
OpenTelemetry.
([PostgreSQL replication-slot warning](https://www.postgresql.org/docs/current/warm-standby.html),
[Zero OpenTelemetry metrics](https://zero.rocicorp.dev/docs/otel))

Rocicorp specifically advises against using a small `max_slot_wal_keep_size` on production
databases: invalidating a lagging slot forces Zero to resynchronize its replica and clients. Prefer
monitoring, alerting, adequate disk, and fixing a stalled consumer.
([Zero Postgres configuration](https://zero.rocicorp.dev/docs/connecting-to-postgres#bounding-wal-size))

## Railway and Render

### Railway

Railway's PostgreSQL offering is a deployed SSL-enabled PostgreSQL container and is explicitly
described as an unmanaged template. That means logical replication is available, but the customer
owns configuration, backups, upgrades, monitoring, and operational correctness.

Use the database admin connection to set at least:

```sql
ALTER SYSTEM SET wal_level = 'logical';
```

Then restart the PostgreSQL deployment and verify:

```sql
SHOW wal_level;
SHOW max_replication_slots;
SHOW max_wal_senders;
```

Size `max_replication_slots` and `max_wal_senders` for the Zero slot plus other physical/logical
replication. PostgreSQL requires enough WAL senders for the slots and physical replicas.
([Railway PostgreSQL](https://docs.railway.com/databases/postgresql),
[PostgreSQL publisher settings](https://www.postgresql.org/docs/current/logical-replication-config.html))

This is operationally different from a fully managed database: Railway supplies the deployment
mechanism and persistent volume, while the application team remains the database operator.

### Render

Render does not enable logical replication by default. As of the research date, prerequisites are:

- Pro workspace or higher.
- At least 10 GB of database storage.
- A Render support request containing the database service ID, the connection role, and the
  published schemas.

After enablement, users may create an explicit `CREATE PUBLICATION ... FOR TABLE ...`; only
`FOR ALL TABLES` requires Render support. That makes Cove's explicit `cove_zero_data` publication a
better fit than Zero's default all-public-schema publication.
([Render logical replication](https://render.com/docs/postgresql-logical-replication))

There are two Zero-specific Render caveats:

1. App roles cannot create event triggers. Without a manual schema-change hook, Zero may need to
   reset all server and client state after DDL. Zero documents enabling manual DDL detection and
   calling the generated `update_schemas()` hook immediately after schema changes.
2. Rocicorp says not to use Render HA for a Zero upstream. Render's HA standby is asynchronous and
   can lose a small number of recent writes on failover, which is incompatible with a sync engine
   that must not miss committed changes.

([Zero provider notes for Render](https://zero.rocicorp.dev/docs/connecting-to-postgres#render),
[Render HA limitations](https://render.com/docs/postgresql-high-availability))

## Scaling beyond the initial node

Do not horizontally duplicate the single-node service as ordinary stateless replicas. When Cove
outgrows one Zero node, use Zero's documented multi-node topology:

- Exactly one replication manager with `ZERO_NUM_SYNC_WORKERS=0`.
- One or more horizontally scaled view-syncers.
- A private `ZERO_CHANGE_STREAMER_URI` from each view-syncer to the replication manager on port
  `4849`.
- `ZERO_LITESTREAM_BACKUP_URL` on the replication manager, pointing to an S3 bucket. It is required
  in the multi-node topology.
- Separate local replica storage for the replication manager and each view-syncer.
- Sticky sessions on the public view-syncer load balancer where possible, to preserve warm query
  pipelines and avoid redundant hydration/Rehome errors.

([Zero self-hosting: maximal strategy](https://zero.rocicorp.dev/docs/self-host#maximal-strategy),
[Zero self-hosting: sticky sessions](https://zero.rocicorp.dev/docs/self-host#sticky-sessions))

PostgreSQL 17 and later can synchronize failover-enabled logical slots, and Zero exposes
`ZERO_UPSTREAM_PG_REPLICATION_SLOT_FAILOVER=true`, but the provider must also expose and configure
the PostgreSQL side. Do not assume that ordinary database HA preserves Zero's slot.
([zero-cache failover configuration](https://zero.rocicorp.dev/docs/zero-cache-config#pg-replication-slot-failover),
[PostgreSQL failover slot synchronization](https://www.postgresql.org/docs/current/logicaldecoding-explanation.html#LOGICALDECODING-REPLICATION-SLOTS-SYNCHRONIZATION))

## Production operations checklist

- Pin the same Zero version in the web/API build and `zero-cache` image.
- Run migrations before the new code that needs them.
- For additive schema changes, deploy DB, wait for Zero replication/backfill, then API, then web.
- For removals, deploy web, then API, then DB.
- Separate Zero version upgrades from schema changes.
- Monitor `/keepalive`, startup failures, WebSocket connection/reconnect counts, API query-transform
  latency, replica size, replication lag, slot health, retained WAL, and PostgreSQL disk.
- Back up authoritative PostgreSQL and regularly test restore. Treat the SQLite volume as a
  rebuildable acceleration layer.
- Test a full Zero restart/resync on staging with production-like data to determine real startup
  grace periods and database load.
- Test session expiry/logout while a Zero WebSocket remains open.
- Test publication/schema migrations against the actual hosted PostgreSQL provider, especially on
  Render where event triggers are unavailable.

Zero's documented zero-downtime schema order is DB → API → client for expansion and client → API →
DB for contraction. Incorrect order can put clients into an error state until reload.
([Zero production schema changes](https://zero.rocicorp.dev/docs/schema#production))

## Current repository deployment gaps

The application architecture is ready for the four-service shape, but production deployment still
needs explicit work:

- No production `zero-cache` service definition currently exists; the sync package only exposes
  `zero-cache-dev`.
- `packages/sync/.env.example` is development-only and omits the production admin password,
  persistent replica path, CVR/change URLs, and hosted origins.
- The sample upstream URL contains the Prisma-only `?schema=public` parameter that should not be
  copied into production.
- Session cookies are host-only, so they will not reach a separate Zero subdomain.
- A hosting-specific persistent volume, WebSocket route, health check, startup grace period,
  shutdown grace period, secrets, and OpenTelemetry destination remain to be configured.
- Render would additionally require a migration policy that invokes Zero's manual schema-change
  hook.

These are deployment/configuration tasks, not a change to Cove's core data flow.
