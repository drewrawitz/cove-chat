# Team Chat Engineering Showcase — Implementation Plan

## 1. Purpose

Build a polished, open-source Slack-like team chat application as a public engineering showcase and learning project.

The project should demonstrate strong product engineering, system design, TypeScript and Effect expertise, realtime reliability, security-conscious multi-tenancy, operational quality, and disciplined public development. It is not currently intended to be a polished commercial SaaS, a fully supported self-hosting product, or a speculative enterprise platform.

Commercial hosting and broader self-hosting support may be explored later, but they must not distract from completing a compelling end-to-end product.

## 2. Success Criteria

The project succeeds when it provides:

- A complete, polished vertical slice that people can run and evaluate.
- Clear architectural boundaries backed by tests, not just diagrams.
- Reliable realtime behavior under retries, disconnects, and reconnects.
- Credible tenant isolation and private-resource authorization.
- A documented engineering process with ADRs, milestones, and meaningful trade-off discussions.
- A live demo and repository that are easy for an interviewer or contributor to understand.

Finishing a smaller, reliable system is more important than accumulating enterprise features or infrastructure adapters.

## 3. V1 Showcase Milestone

> Two users can sign in, join public and private channels, exchange messages in real time, use threads, add reactions, upload and download authorized files, reconnect without losing events, and run the full system locally with Docker Compose.

The V1 milestone is complete only when the behavior is demonstrated through automated tests, documented local setup, and a polished live demo.

## 4. Guiding Principles

- Use TypeScript throughout the product and shared contracts.
- Use Effect v4 as the backend's primary architectural vocabulary.
- Keep domain and application logic independent from HTTP, WebSockets, SQL, and vendors.
- Keep HTTP and WebSocket handlers thin.
- Use Prisma Schema and Prisma Migrate for schema design and migration generation, but use explicit SQL and explicit transactions at runtime.
- Treat Postgres as the durable source of truth.
- Use Zero for synchronized durable reads and reconnect convergence; keep Node WebSockets focused on ephemeral typing and presence.
- Build one complete vertical slice before adding scale-oriented infrastructure.
- Add abstractions when they protect a real boundary, not an imagined provider matrix.
- Make architectural claims observable through code, tests, documentation, and measurements.
- Keep the repository fully public and easy to inspect.

## 5. Explicit Scope Decisions

### Included

- Public and private channels.
- Messages, edits, deletion, threads, and reactions.
- Authentication and secure sessions.
- Workspace membership, roles, and permissions.
- Durable realtime data synchronization through Zero, plus Node-hosted WebSockets for ephemeral signals.
- Idempotent commands, channel event sequences, reconnect convergence, and gap detection tests.
- Authorized file upload and download.
- Postgres migrations and a durable event/outbox log.
- Structured logging, metrics, traces, health checks, CI, and load testing.
- Docker Compose for a reproducible local environment.
- Architecture decision records and disciplined public issue/milestone tracking.
- A web application first, followed by a thin Tauri desktop shell later.

### Deferred

- Durable Objects.
- Redis until multiple API instances and cross-instance fan-out are deliberately demonstrated.
- Kafka, NATS, microservices, per-channel actors, and per-thread actors.
- Kubernetes, Helm charts, an operator, and broad self-hosting support.
- A hosted control plane, private enterprise packages, billing, and license enforcement.
- SAML, SCIM, legal hold, eDiscovery, advanced retention, and compliance exports.
- Multi-region active-active writes and data-residency orchestration.
- A dedicated external search cluster.
- A plugin marketplace and a large integration ecosystem.
- Native mobile applications.
- Offline durable writes and long offline work sessions.

### Cheap future-ready foundations to retain

- `workspace_id` tenant isolation.
- Audit-event hooks.
- Roles and permissions.
- Versioned protocols.
- Pluggable storage and authentication ports.
- Data exportability.

These foundations should remain small. Do not build the advanced enterprise features they could eventually support.

## 6. High-Level Architecture

```text
React + Vite+ web app
        │
        ├── HTTPS durable commands ───────────────┐
        ├── Zero synchronized queries ────────┐   │
        └── Node WebSocket typing/presence ─┐ │   │
                                            │ │   │
                                            ▼ ▼   ▼
                                    Long-running Node server
                                    ├── thin HTTP command transport
                                    ├── authorized Zero query endpoint
                                    ├── thin ephemeral WebSocket transport
                                    └── Effect application runtime
                                                    │
                                                    ▼
                                             PostgreSQL
                                          source of truth
                                             │       │
                         logical replication│       └── FileStorage port
                                             ▼           ├── filesystem
                                          zero-cache      └── S3-compatible
                                             │
                                             └── synchronized rows to clients

Tauri desktop shell (later)
        └── reuses the React application through a platform adapter
```

The initial deployment has one Node API/realtime instance, Postgres with logical replication enabled, and one `zero-cache` service. This deliberately avoids Redis and distributed socket coordination while V1 is being built.

Zero synchronizes durable relational data and reconnect state. Durable writes still enter through thin HTTP handlers and Effect application services, then execute as raw SQL transactions. This preserves the business boundary and avoids coupling Effect use cases to Zero's server-mutator transaction API. Node WebSockets carry only ephemeral signals such as typing and presence.

## 7. Technology Stack

### Repository and tooling

- TypeScript monorepo.
- `pnpm` workspaces.
- Vite+ as the unified toolchain and monorepo task runner.
- Vite Task for dependency-aware, cached workspace commands instead of Turborepo.
- Oxlint for linting, Oxfmt for formatting, and Vite+'s type-check integration.
- Vite with Rolldown for application builds and tsdown for package builds where bundling is useful.
- Vitest through Vite+ for unit and integration tests.
- Strict TypeScript configuration.
- Playwright for browser end-to-end tests.
- Testcontainers or Docker Compose services for infrastructure tests.

Do not add Turborepo, Biome, ESLint, or Prettier initially. Add a second tool only for a demonstrated rule or file type that the Vite+ toolchain cannot cover.

### Web client

- React.
- Vite through Vite+.
- TanStack Router.
- Zero React queries for synchronized server state and local relational caching.
- Zustand only for ephemeral UI state.
- Effect Schema for shared boundary contracts.
- shadcn/ui components generated on top of Base UI primitives.
- Zero's IndexedDB-backed client cache for synchronized relational data.
- A small browser-storage adapter for unsynced drafts and local preferences.

The official shadcn/ui Vite components are styled with Tailwind CSS. Therefore, choosing shadcn/ui plus Base UI replaces Radix as the primitive layer, but does not eliminate Tailwind from the UI implementation. Keep Tailwind v4 contained inside `packages/ui`. If eliminating Tailwind is a hard requirement, use Base UI directly with CSS Modules instead of shadcn/ui.

### Desktop client

- Tauri 2 after the web product is working.
- The same React application as the web client.
- A narrow platform interface for notifications, badges, deep links, secure storage, file dialogs, tray behavior, and updates.
- Minimal Rust, restricted to native capabilities.

### Backend

- Long-running Node.js server.
- Effect v4.
- `@effect/platform` and the Node platform adapter.
- `@effect/sql` and `@effect/sql-pg`.
- Plain parameterized PostgreSQL queries.
- Prisma Schema and Prisma Migrate for schema design and migration history.
- No Prisma Client in the runtime query path.
- A Node WebSocket implementation for ephemeral presence and typing.
- An authorized Zero query endpoint for synchronized read models.
- Effect Schema for decoding configuration, requests, protocol messages, database rows, and external responses.

### Infrastructure

- PostgreSQL as the source of truth.
- `zero-cache` backed by Postgres logical replication.
- Local filesystem storage for the simplest development path, or an S3-compatible adapter when object-storage behavior is being exercised.
- Docker Compose for reproducible local dependencies and full-system runs.
- No Redis in the initial architecture.

## 8. Monorepo Structure

```text
apps/
  web/                       # React application built by Vite+
  api/                       # Node composition root, HTTP, Zero query endpoint, WebSockets
  worker/                    # outbox/background jobs when introduced
  desktop/                   # Tauri shell, added after web V1 is stable

packages/
  domain/                    # entities, values, invariants, domain errors
  application/               # use cases and orchestration
  ports/                     # infrastructure-independent service contracts
  protocol/                  # versioned HTTP/WebSocket schemas and mappers
  db/                        # Prisma schema, Prisma Migrate SQL history, seed tooling
  sync/                      # generated Zero schema and authorized query definitions
  ui/                        # reusable React components and design tokens
  platform/                  # browser/desktop capability interface

  infrastructure/
    postgres/                # raw SQL repositories and Effect transactions
    zero/                    # Zero query/auth adapters and generated-schema wiring
    realtime-memory/         # in-process ephemeral socket fan-out
    storage-filesystem/      # local development file storage
    storage-s3/              # optional S3-compatible file storage
    email/                   # transactional-email templates and provider adapters
```

These are workspace packages, not packages intended for npm publication.

Avoid creating a package for every tiny concept. A package must represent a meaningful dependency boundary with an intentional public API.

## 9. Dependency Rules

The dependency graph is below. `A → B` means package A may depend on package B.

```text
ports           → domain
application     → domain + ports
infrastructure  → domain + ports
infrastructure-postgres → application/workspaces/internal (exact restricted subpath only)
sync            → db schema output
apps/api        → application + infrastructure + protocol + sync
apps/web        → protocol + sync + ui
apps/desktop    → apps/web + platform
```

Interpret the graph through these concrete rules:

- `domain` depends on no application, transport, database, or vendor package.
- `ports` may use domain types but exposes no provider-specific types.
- `application` depends on `domain` and `ports`.
- `protocol` owns serialized transport contracts and explicit mappings; domain models are not treated as wire formats.
- `db` is tooling-only: it owns the Prisma schema and committed SQL migrations, but exports no runtime domain model.
- `sync` owns the generated Zero schema and named query definitions. It is a sync/transport concern, not the domain model.
- Infrastructure packages implement ports and depend on domain contracts. The Postgres Workspace
  Access adapter has one explicit exception: it imports the exact restricted
  `@cove/application/workspaces/internal` subpath owned by the deep Workspace Access module. That
  subpath is not re-exported from the application root, and no wildcard application-internal
  dependency is allowed.
- `apps/api` is the composition root. It selects Effect Layers and connects transports to application use cases.
- `apps/web` consumes `protocol`, `sync`, and `ui`, not backend infrastructure or application internals.
- No application use case imports HTTP, WebSocket, Postgres, filesystem, S3, or Node APIs.

Enforce these rules with workspace dependency declarations, package exports, TypeScript project references where useful, lint restrictions, and architecture tests.

## 10. Package Responsibilities

### `domain`

Contains:

- Entities and value objects.
- Domain invariants and pure decision functions.
- Branded identifiers where they reduce accidental mixing.
- Typed domain errors.
- Concepts such as workspace, membership, channel visibility, message body, thread root, and reaction.

It contains no SQL, HTTP, WebSocket, React, Node, or provider code.

### `ports`

Defines narrow capabilities required by use cases, such as:

- `MessageRepository`.
- `ChannelRepository`.
- `MembershipRepository`.
- `TransactionManager` or a purpose-built transactional operation boundary.
- `FileStorage`.
- `OutboxWriter`.
- `SessionRepository` and an authentication/identity seam.
- `AuditEventWriter`.
- `Clock` and `IdGenerator` where deterministic tests benefit.
- `DataExporter` when export functionality is added.

Avoid universal CRUD repositories. Ports should express application needs and preserve useful transaction boundaries.

### `application`

Contains complete use cases such as:

- `SignIn` and `SignOut`.
- `CreateWorkspace` and `InviteMember`.
- `CreateChannel`, `JoinChannel`, and `AddChannelMember`.
- `SendMessage`, `EditMessage`, and `DeleteMessage`.
- `ReplyToThread` and `AddReaction`.
- `UploadFile`, `AttachFile`, and `AuthorizeFileDownload`.
- `ListChannelMessages` for non-Zero API/export consumers when needed.
- `MarkChannelRead`.

Application services perform authorization, orchestrate ports, enforce domain invariants, and return
typed success or error values. They do not choose HTTP statuses or WebSocket frame formats.

### `protocol`

Contains versioned schemas for:

- supported integration requests and responses under `/api/v1`.
- first-party application requests and responses under `/api/app/v1`.
- operational health responses under `/health`.
- WebSocket client and server envelopes.
- Stable error codes and error payloads.
- Pagination cursors.
- Ephemeral realtime event versions.

Define HTTP contracts declaratively with Effect `HttpApi`. The Node application implements those
contracts with `HttpApiBuilder`. Public OpenAPI 3.1 plus interactive documentation are generated
from `CovePublicApi`. The first-party web application generates its fetch functions and TanStack
Query hooks with Orval from a deterministic `CoveAppApi` OpenAPI artifact; the Effect contract,
not the generated document or client, remains the source of truth. `CoveAppApi` and
`CoveOperationsApi` remain separate interfaces and are not included in public documentation. The
API application may mount `CoveAppApi` Scalar documentation behind an explicit, production-off
configuration for local or otherwise protected environments.

Use explicit mappers between domain/application values and protocol values:

```text
domain/application result
          ↓ mapper
versioned protocol value
          ↓ encoder
       transport
```

### `infrastructure`

Contains concrete adapters, provider configuration, SQL row decoders, and failure translation. Infrastructure failures must be mapped to typed errors rather than leaking raw driver errors across the port boundary.

### Transport applications

HTTP handlers do only the following:

1. Read authenticated request context.
2. Decode the protocol input.
3. Call one application use case.
4. Map typed errors to stable HTTP responses.
5. Encode the protocol output.

WebSocket handlers do only the following:

1. Authenticate the connection or associate an existing secure session.
2. Decode and validate frames.
3. Track connection/subscription metadata.
4. Dispatch ephemeral commands or application calls.
5. Encode and deliver events.

Membership checks, message rules, SQL, and durable workflow decisions do not belong in either transport.

## 11. Effect v4 Conventions

- Model expected failures as specific typed errors.
- Reserve defects for programmer errors and broken invariants.
- Decode untrusted server boundaries with Effect Schema; decode the browser HTTP boundary with the Zod schemas generated by Orval from the same contract.
- Define dependencies as small Effect services/ports.
- Compose live dependencies with Layers at application entry points.
- Keep Layer construction out of domain and use-case modules.
- Use scoped resource management for database pools, server lifecycles, and other resources.
- Add tracing spans around use cases, SQL operations, Zero query authorization, ephemeral WebSocket delivery, and background jobs.
- Provide deterministic test Layers for the clock, ID generation, repositories, storage, and realtime publication.

An error taxonomy should distinguish at least:

- Validation errors.
- Authentication errors.
- Authorization errors.
- Not-found errors that do not disclose cross-tenant resources.
- Conflict/idempotency errors.
- Infrastructure/database/storage errors.
- Protocol/version errors.

## 12. Data and Transaction Strategy

### PostgreSQL ownership

Postgres is authoritative for:

- Users and sessions.
- Workspaces, memberships, roles, and permissions.
- Channels and channel memberships.
- Messages, thread relationships, edits, deletions, and reactions.
- File metadata and message attachments.
- Read positions.
- Channel event sequences and durable events.
- Outbox records.
- Audit events.

Ephemeral connection state, presence, and typing do not need durable storage in V1.

### SQL approach

- Use `schema.prisma` as the declarative database design model.
- Use Prisma Migrate to generate timestamped SQL migrations.
- Create important migrations with `prisma migrate dev --create-only`, inspect and edit the generated SQL, then apply it.
- Commit the generated and customized SQL migration history to source control.
- Apply committed migrations in deployed/test environments with `prisma migrate deploy`.
- Do not use `prisma db push` after the disposable prototyping stage.
- Do not use Prisma Client for runtime persistence.
- Write runtime reads and writes as plain parameterized SQL through `@effect/sql-pg`.
- Decode result rows with Effect Schema instead of unchecked casts.
- Use explicit transactions and verify their behavior with real Postgres integration tests.
- Document indexes and query plans for important message-history and authorization queries.
- Avoid vendor-specific Postgres extensions unless a clear need is demonstrated.

Prisma Schema cannot express every PostgreSQL feature needed by a serious chat schema. CHECK constraints, some specialized indexes, triggers, and data migrations may require handwritten SQL in a generated migration. In those cases:

1. Keep the closest accurate model in `schema.prisma`.
2. Add the database-only feature to the migration SQL.
3. Document the feature beside the relevant Prisma model.
4. Verify it with an infrastructure integration test.
5. Ensure later migrations do not accidentally remove it.

The three schema artifacts have distinct roles:

```text
schema.prisma                 declarative design model
prisma/migrations/**/sql     executable, immutable migration history
Effect Schema row codecs     runtime validation at persistence boundaries
```

Do not import Prisma-generated model types into `domain` or `application`.

### Zero schema and query model

Generate Zero's schema from `schema.prisma` with `prisma-zero`, commit the generated artifact, and verify in CI that regeneration produces no diff. Define named, server-authorized Zero queries over that generated schema.

Zero Query Language is allowed only in the sync/read-model adapter. All application repositories and command-side database access continue to use raw SQL through `@effect/sql-pg`. This is an intentional exception: adopting Zero necessarily means its clients select synchronized data with ZQL rather than backend raw SQL.

Postgres must run with logical replication enabled so `zero-cache` can maintain its replica. Docker Compose and test infrastructure must use the same setting.

### Tenant isolation

Every tenant-scoped record includes `workspace_id`, including join tables where practical.

Every tenant-scoped query includes the authenticated workspace scope:

```sql
SELECT id, channel_id, author_id, body, channel_sequence, created_at
FROM messages
WHERE workspace_id = $1
  AND channel_id = $2
  AND channel_sequence < $3
ORDER BY channel_sequence DESC
LIMIT $4;
```

Additional safeguards:

- Use composite foreign keys or equivalent constraints to prevent cross-workspace relationships.
- Centralize authenticated actor/workspace context at the transport boundary.
- Pass actor identity into application use cases; never accept authoritative `user_id`, role, or workspace claims from request bodies.
- Test that resources from another workspace appear inaccessible rather than merely unauthorized when disclosure would leak information.
- Add architecture or query-review checks that make accidental unscoped access difficult.

Application-layer authorization is the initial enforcement model. Postgres Row-Level Security may be evaluated later as defense in depth, but it is not required for V1.

## 13. Messaging Model and Reliability

### Threads

Threads are messages, not separate runtime actors:

```text
top-level message: thread_root_id = null
thread reply:      thread_root_id = root_message_id
```

Replies receive channel sequence numbers because they affect activity, mentions, unread state, notifications, search, and recovery.

### Idempotency and ordering

Each durable messaging mutation includes a stable `command_id`. Retries reuse the same ID.

Each committed channel event includes:

- `event_id` for deduplication.
- `channel_id`.
- Monotonically increasing `channel_sequence`.
- Event type and version.
- Creation timestamp.

Recommended constraints include:

```sql
UNIQUE (workspace_id, command_id)
PRIMARY KEY (workspace_id, channel_id, channel_sequence)
UNIQUE (workspace_id, event_id)
```

### Message write transaction

One Postgres transaction should:

1. Check or lock the command's idempotency record.
2. Validate durable authorization facts needed for the mutation.
3. Allocate the next channel sequence atomically.
4. Insert or update the message/reaction state.
5. Insert the durable channel event.
6. Insert the outbox record.
7. Commit.

After commit, Postgres logical replication makes the durable row changes visible to `zero-cache`, which updates affected client queries. The outbox remains available for asynchronous side effects and non-Zero consumers.

### Reconnect and gap recovery

Zero owns durable query synchronization, its IndexedDB-backed local cache, and reconnect convergence. The application does not implement a second cursor/replay protocol for message rows.

Channel sequences remain part of the domain and database model because they provide deterministic channel ordering, read positions, diagnostics, and a way to assert convergence. On reconnect:

1. Zero reconnects its sync connection.
2. Active named queries are re-established under the authenticated user context.
3. `zero-cache` sends the changes required to converge the client cache with Postgres.
4. The UI reconciles pending HTTP commands by stable `command_id` as authoritative rows arrive.
5. Integration and end-to-end tests assert that the visible sequence converges without missing or duplicated committed messages.

The Node WebSocket may disconnect independently without affecting durable messages. It only controls ephemeral presence and typing state.

### Outbox

Persist an outbox record in the same transaction as the domain change. A lightweight dispatcher may process pending records for notifications, audit projections, integrations, or other side effects. Durable client synchronization does not depend on successfully dispatching the outbox.

V1 does not require Kafka, NATS, or Redis Streams.

## 14. Realtime Architecture

### V1: Zero plus one Node instance

- `zero-cache` owns the sync connection for durable relational data.
- The Node server exposes authenticated, named Zero query definitions that enforce tenant and channel read permissions.
- Durable writes use HTTP and run through Effect application services and `@effect/sql-pg` transactions.
- The Node server separately terminates the ephemeral WebSocket.
- Each authenticated socket is associated with a server-derived actor and workspace.
- The process owns a local registry of sockets and channel subscriptions for presence and typing.
- Presence and typing are best-effort, ephemeral events.

Do not send committed messages, edits, or reactions through the Node WebSocket. Zero synchronizes those durable rows. The ephemeral socket carries typing, presence, and connection hints only; clients must still derive durable authorization and membership from synchronized server state.

### Zero adoption boundary

Use Zero for:

- Named synchronized reads.
- Client-side relational cache.
- Automatic updates when Postgres rows change.
- Reconnect convergence for committed data.
- Fast reactive UI queries.

Do not use Zero server mutators in the initial implementation. Its mutators execute within a Zero-provided transaction, which would require a transaction-specific adapter to preserve the Effect application boundary. Durable writes remain ordinary HTTP commands until a focused experiment proves a clean integration.

Zero does not support offline writes or long offline sessions. V1 should preserve unsent composer text locally, disable or clearly queue the UI action while disconnected, and make this limitation explicit rather than promising local-first behavior.

### Redis trigger

Do not add Redis merely because the design might someday run multiple replicas.

Add Redis Pub/Sub only when a deliberate deployment or load-test milestone demonstrates two or more API instances that must fan out events to sockets owned by different processes:

```text
Node A ─┐
Node B ─┼── Redis Pub/Sub
Node C ─┘
```

Redis would then own only cross-instance fan-out for ephemeral WebSockets and short-lived coordination. It would not become the message store, durable sync path, or recovery log.

### Durable Objects decision

Do not use Cloudflare Durable Objects. They add a second runtime, vendor-specific deployment, a separate authentication/event-delivery path, and complexity that does not improve this showcase's initial requirements.

The ephemeral WebSocket adapter boundary preserves enough optionality to explore Redis, a managed provider, or Durable Objects later without moving business logic. Zero remains a separate durable-sync concern.

## 15. Authentication, Authorization, and Security

### Authentication

For V1, implement one reliable sign-in path that works in Docker Compose, such as local email/password accounts with secure password hashing and server-managed sessions.

- Use secure, HTTP-only, same-site cookies.
- Include CSRF protection for cookie-authenticated state changes.
- Rotate sessions at sign-in and privilege changes.
- Do not store bearer tokens in browser local storage.
- Put the identity/session implementation behind a small port so generic OIDC can be added later.

The goal is a credible working implementation, not support for every identity provider.

### Authorization

Every protected application use case checks:

1. Authenticated actor.
2. Workspace membership.
3. Channel visibility or membership.
4. Required role/permission.
5. Tenant ownership of all referenced resources.

Every named Zero query independently derives its actor and workspace from authenticated server context and applies equivalent tenant, visibility, and membership predicates before any rows are synchronized. Clients choose a registered query name and arguments; they do not supply authoritative identity or arbitrary query logic. Treat these read predicates as a security boundary and cover them with cross-tenant contract tests.

Model public, private, and direct-message access explicitly. V1 requires public and private channels; DMs may follow after the primary showcase slice if schedule requires.

Permission decisions should be unit-tested as domain/application behavior and integration-tested against real tenant-scoped data.

### Audit hooks

Generate durable audit events for security-sensitive actions such as sign-in, invitations, membership changes, role changes, private-channel membership changes, message deletion, and file access. V1 needs reliable event capture, not an advanced enterprise audit-search product.

### Security documentation

Publish a concise threat model covering:

- Cross-tenant data access.
- Broken object-level authorization.
- WebSocket authentication and stale memberships.
- Zero query authentication, read predicates, cache invalidation, and accidental private-row synchronization.
- Session theft and CSRF.
- File upload abuse and unauthorized downloads.
- Injection and unsafe rendering.
- Secrets and local development defaults.
- Rate limiting and resource exhaustion.

## 16. File Storage and Authorization

Expose a `FileStorage` port with two possible adapters:

- Local filesystem for the smallest reproducible local setup.
- S3-compatible object storage for production-like object behavior.

Do not build adapters for many cloud vendors. One filesystem implementation and one standards-compatible object adapter are enough.

Recommended flow:

```text
1. Client requests an upload for a channel.
2. Application verifies workspace and channel access.
3. Server creates a pending file record and authorized upload target.
4. Client uploads the bytes.
5. Server verifies completion and commits file metadata/attachment.
6. The committed attachment row synchronizes to authorized clients through Zero.
```

Downloads must use the file's database ID, load tenant-scoped metadata, re-check current channel access, and then stream the file or issue a short-lived signed URL. Object keys and unguessable IDs are not authorization.

Validate size and content-type limits, sanitize displayed filenames, prevent path traversal in filesystem storage, and provide a file-scanning hook without requiring antivirus infrastructure in V1.

## 17. Client Architecture

### State ownership

- Zero owns synchronized server state and its local relational cache: workspaces, channels, members, messages, reactions, file metadata, and read state.
- Zustand owns ephemeral presentation state and the small pending-command overlay: open panels, modal state, composer UI, layout preferences, pending HTTP commands, and attachment progress.
- TanStack Query owns one-shot first-party HTTP state such as authentication and workspace-access requests, using hooks and query keys generated from `CoveAppApi` through Orval.
- A narrow browser-storage adapter owns unsynced drafts and local preferences. Do not add Dexie unless those local-only records outgrow the browser APIs.
- The Node WebSocket handler updates ephemeral presence and typing state only. It never mutates the durable message cache.

### Optimistic mutations

Create optimistic messages and reactions with stable command IDs and explicit states:

```text
pending → committed
        ↘ failed/retryable
```

The client renders a pending overlay immediately, then sends the command over HTTP. The HTTP response reports success or a typed failure; the authoritative row arrives through Zero and reconciles the overlay by stable `command_id`. Retries preserve the original command ID.

This is intentionally not a Zero mutator in V1. It keeps the server write path inside the Effect application service while still providing a responsive optimistic UI.

### Startup and reconnect

```text
render Zero's local cached queries
  → connect Zero sync
  → converge active queries with Postgres
  → connect ephemeral Node WebSocket
  → restore typing/presence state
```

The UI should visibly distinguish offline, reconnecting, stale, pending, and failed states. Drafts survive refreshes; durable writes while offline are not supported in V1.

### Product quality

Prioritize keyboard navigation, accessible semantics, focus management, responsive layouts, empty/error/loading states, message virtualization where needed, and a coherent design system. A polished experience is part of the showcase, not a final coat of paint.

## 18. Observability and Operations

### Structured logging

Emit structured logs with appropriate fields such as:

- Request/trace ID.
- Actor ID when safe.
- Workspace ID.
- Command ID.
- Event ID and channel sequence.
- Use-case or operation name.
- Error tag and retryability.

Never log message bodies, passwords, session tokens, file contents, or sensitive headers by default.

### Metrics and traces

Instrument at least:

- HTTP latency and error rates.
- Zero sync connections, reconnects, query latency, replication lag, and sync errors.
- Ephemeral WebSocket connections, reconnects, and delivery failures.
- Use-case latency and tagged failures.
- SQL latency, pool saturation, and transaction failures.
- Outbox age and retry counts.
- Reconnect convergence duration and detected channel-sequence anomalies.
- Postgres-commit-to-Zero-visibility latency.

Use OpenTelemetry-compatible instrumentation so the local and hosted demo can choose its backend.

### Health checks

Provide separate endpoints for:

- Liveness: process event loop/server is alive.
- Readiness: required dependencies such as Postgres are usable, migrations are compatible, and the Zero query endpoint configuration is valid.

### Migrations

Provide explicit Prisma Migrate commands for creating draft migrations, applying local migrations, deploying committed migrations, and checking status. Test upgrades from at least the previous tagged schema once releases begin. Do not promise automatic rollback for irreversible data migrations.

## 19. Testing Strategy

### Domain tests

Fast tests for:

- Message and channel invariants.
- Roles and permission decisions.
- Thread and reaction rules.
- Tenant-scoping decisions.
- Typed error outcomes.

### Application tests

Use deterministic in-memory port Layers where the dependency is genuinely remote or external.
Deep modules backed by local-substitutable infrastructure are tested through their application
interface with the local substitute. Workspace Access therefore uses local Postgres lifecycle
tests rather than an in-memory repository adapter, including denied access, audit behavior, and
concurrency invariants.

### Infrastructure integration tests

Run against real Postgres and the selected storage adapter to test:

- SQL row decoding.
- Transactions and rollbacks.
- Sequence allocation under concurrency.
- Idempotency constraints.
- Cross-tenant relationship constraints.
- Prisma migration behavior, including customized SQL features.
- Prisma-to-Zero schema generation drift.
- Authorized file paths and storage failure translation.

Run Zero integration tests with logical replication enabled to test:

- Authorized named queries never sync cross-workspace or unauthorized private-channel rows.
- Ordinary Effect/SQL writes become visible through Zero without a custom broadcast.
- Disconnect and reconnect converge to the authoritative Postgres state.
- Pending command overlays reconcile by `command_id`.
- Schema changes remain compatible with `zero-cache` during supported upgrade paths.

### Contract tests

Verify:

- HTTP inputs and outputs conform to versioned protocol schemas.
- Every ephemeral WebSocket event decodes in the client package.
- Generated Zero schemas and named queries match the committed Prisma schema.
- Typed application errors map to stable transport errors.
- Port implementations share behavioral contract suites where useful.

### End-to-end tests

Playwright should cover the V1 milestone with two isolated browser contexts:

- Sign in as two users.
- Enter a shared public channel.
- Verify realtime messaging without refresh.
- Verify private-channel access and denial.
- Create and reply to a thread.
- Add a reaction.
- Upload and download an authorized file.
- Prove an unauthorized user cannot access the private file.
- Interrupt and restore Zero and ephemeral WebSocket connections, then verify convergence and no duplicated messages.

### Load and resilience tests

Create a repeatable load-test scenario that measures:

- Concurrent Zero sync and ephemeral WebSocket connections.
- Messages per second.
- Postgres-commit-to-client-visibility latency percentiles.
- Sequence allocation contention.
- Reconnect storms.
- `zero-cache` CPU, memory, replica size, and replication lag.
- Database pool behavior.
- Outbox backlog recovery.

Publish the environment, parameters, results, limitations, and any resulting architectural decision. The goal is evidence and learning, not an inflated headline number.

## 20. CI and Repository Quality

CI should run:

1. `vp check` for Oxfmt, Oxlint, and type checking.
2. `prisma format` and `prisma validate`.
3. Prisma-to-Zero schema regeneration with a clean-diff assertion.
4. Domain and application tests through `vp test`.
5. Infrastructure and Zero integration tests with service containers.
6. Production builds through Vite+ workspace tasks.
7. Protocol compatibility/contract tests.
8. Playwright smoke tests for protected branches or pull requests where runtime permits.
9. Dependency and secret scanning.

The repository should include:

- A concise README with screenshots, architecture overview, and a five-minute local start.
- `CONTRIBUTING.md` with development and test commands.
- `.env.example` containing safe placeholder values.
- Seed/demo data for two users and representative channels.
- A security policy and responsible disclosure contact.
- Automated dependency updates.
- A clear license, preferably MIT or Apache 2.0 for the showcase unless project goals change.

## 21. Public Engineering Process

### ADRs

Record consequential decisions, including:

- Node instead of Workers/Durable Objects.
- Effect v4 and package boundary conventions.
- Prisma Schema/Migrate for schema evolution with raw `@effect/sql-pg` at runtime.
- Zero for durable read synchronization while HTTP/Effect owns writes.
- Postgres event log and outbox.
- Node WebSockets for ephemeral signals without Redis initially.
- Tenant isolation strategy.
- Filesystem versus S3-compatible storage.
- Protocol versioning and reconnect semantics.

Each ADR should describe context, decision, alternatives, consequences, and evidence that could cause reconsideration.

### Issues and milestones

- Define milestones around working vertical slices, not layers of infrastructure.
- Keep issues small enough to review but large enough to deliver observable behavior.
- Link pull requests to issues and ADRs.
- State acceptance criteria and required tests on every feature issue.
- Keep a public roadmap with `Now`, `Next`, and `Later` rather than speculative dates.
- Use meaningful commits that let reviewers follow the evolution of the design.

### Demonstration material

Maintain:

- A public live web demo with seeded or self-service demo accounts.
- A short product walkthrough video or GIF.
- An architecture diagram and reliability walkthrough.
- A brief write-up of the hardest bugs and the evidence used to fix them.
- Published load-test results and performance trade-offs.

## 22. Phased Implementation Plan

Each phase should finish with a demonstrable vertical slice and updated documentation.

### Phase 0 — Repository and architecture foundation

Build:

- `pnpm` workspace initialized with Vite+ and strict shared TypeScript configuration.
- Root Vite+ configuration for Oxlint, Oxfmt, type checking, Vitest, builds, and workspace tasks.
- Initial packages and enforced dependency boundaries.
- Effect runtime composition in the Node application.
- React/Vite+ shell and shared protocol package.
- shadcn/ui initialized in `packages/ui` with Base UI primitives.
- Prisma schema, initial reviewed SQL migration, and seed tooling.
- Generated Zero schema from Prisma.
- Postgres with logical replication, `zero-cache`, and API services in Docker Compose.
- Migration, seed, test, check, and build commands through Vite+ and Prisma.
- A focused integration spike proving that an Effect/SQL write appears in an authorized Zero query after logical replication.
- CI baseline.
- Initial ADRs.

Exit criteria:

- One command starts Postgres, `zero-cache`, API, and web development services.
- CI validates the empty vertical architecture.
- A health endpoint checks API, Postgres, and Zero query-endpoint readiness.
- Boundary violations fail an automated check.
- The Zero spike proves authenticated query sync, or an ADR records the failure and restores the custom event-sync fallback.

### Phase 1 — Identity, workspaces, and channel authorization

Build:

- Local authentication and secure session cookies.
- Seeded demo users plus normal sign-in behavior.
- Workspace and membership model.
- Basic roles and permission checks.
- Public and private channels.
- Private-channel membership administration.
- Tenant-scoped repository queries and composite constraints.
- Server-authorized Zero queries for workspace/channel navigation.
- Audit hooks for sign-in and membership changes.
- Initial navigation and accessible channel UI.

Exit criteria:

- Two users can sign in and see only their permitted workspaces/channels.
- Cross-workspace and private-channel access tests pass at application, SQL, HTTP, and Zero-sync levels.

### Phase 2 — Durable core messaging

Build:

- Message schema, pagination, send, edit, and delete use cases.
- Stable `command_id` idempotency.
- Atomic channel sequence allocation.
- Durable channel event log and transactional outbox.
- Thread replies and reactions.
- Typed errors and protocol mappings.
- HTTP command mutations, pending client overlays, and Zero reconciliation by `command_id`.

Exit criteria:

- Concurrent sends produce a deterministic, gap-free channel order.
- Retried commands do not create duplicates.
- Threads and reactions work through thin HTTP handlers.
- Integration tests prove transaction rollback and tenant isolation.
- Prisma migration SQL is reviewed, and Zero schema generation is clean.

### Phase 3 — Zero synchronization and ephemeral realtime

Build:

- Authenticated Zero query endpoint with server-derived user/workspace context.
- Zero React queries for channels, messages, threads, reactions, members, and file metadata.
- Postgres-to-Zero synchronization for all committed durable changes.
- Authenticated Node-hosted WebSocket endpoint and local registry for ephemeral signals.
- Typing and presence as best-effort ephemeral events.
- Reconnect convergence and channel-sequence anomaly tests.
- Realtime observability.

Exit criteria:

- Two browser contexts exchange messages, threads, and reactions without refresh.
- A forced Zero disconnect followed by missed commits converges without loss or duplication.
- A forced Node WebSocket disconnect affects only typing/presence, not durable data.
- Stale channel membership is invalidated and no longer receives private events.

### Phase 4 — Authorized files and security hardening

Build:

- `FileStorage` port.
- Filesystem adapter; add S3-compatible storage only if useful for the demo.
- Pending upload, completion, attachment, and authorized download flows.
- Size/type policy and safe filename/path handling.
- File-scanning hook.
- Security audit events and threat model.
- CSRF, rate limiting, secure headers, and log-redaction review.

Exit criteria:

- Authorized members can upload and download attachments.
- Nonmembers cannot infer or retrieve private attachments.
- File flows work in Docker Compose and have application, integration, and end-to-end coverage.

### Phase 5 — V1 polish and public showcase

Build:

- Offline/read-only/reconnecting/pending/failed UI states and locally preserved drafts.
- Keyboard navigation and accessibility pass.
- Responsive layout, message rendering polish, empty states, and error recovery.
- Complete Docker Compose local flow and demo seed data.
- Structured logs, metrics, traces, Zero replication visibility, and dashboards or a documented local viewer.
- Full V1 Playwright journey.
- Repeatable load and reconnect-storm tests.
- README, architecture guide, ADR index, screenshots, demo video, and live deployment.

Exit criteria:

- The explicit V1 showcase milestone passes in CI and in the live demo.
- A new developer can clone, start, and understand the project from the documentation.
- Performance findings and known limits are published honestly.

### Phase 6 — Desktop shell and evidence-driven extensions

Only after web V1 is stable:

- Add the Tauri shell and platform interface.
- Implement notifications, badges, deep links, secure credential handling, and file dialogs as narrow adapters.
- Reuse the existing React product and protocol without duplicating business logic.
- Choose follow-up product features from real usage and feedback.

Potential evidence-driven extensions:

- Direct and group messages.
- Postgres full-text search.
- Read state and unread/mention views.
- Background notification delivery.
- Redis Pub/Sub plus a multi-instance deployment demonstration.
- Generic OIDC.
- S3-compatible storage if V1 used only the filesystem.

Exit criteria:

- Desktop-specific code remains isolated behind the platform boundary.
- Any new infrastructure is justified by a measured limitation or a deliberate learning objective documented in an ADR.

## 23. Definition of Done for a Feature

A feature is done when:

- Its user-visible behavior and failure cases are documented.
- Domain/application rules live outside transports.
- Untrusted inputs and persisted rows are decoded.
- Expected failures are typed and mapped to stable protocol errors.
- Tenant and permission boundaries are tested.
- Relevant unit, integration, contract, and end-to-end tests pass.
- Logs, metrics, and traces are sufficient to diagnose failure.
- Migrations and compatibility implications are documented.
- User-facing states include loading, empty, denied, offline, and retry behavior where relevant.
- The issue, pull request, and any ADR explain the important trade-offs.

## 24. Reconsideration Triggers

Revisit deferred choices only with evidence:

| Choice                              | Reconsider when                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Zero server mutators                | A spike proves they can execute Effect application use cases inside the required transaction without leaking Zero into business code. |
| Redis Pub/Sub                       | A tested multi-instance deployment needs cross-process socket fan-out.                                                                |
| Durable Objects or managed realtime | Global connection economics or edge latency becomes a measured requirement and the portability trade-off is acceptable.               |
| External search                     | Postgres full-text search fails measured relevance, latency, or scale needs.                                                          |
| Kafka/NATS/streams                  | The Postgres outbox cannot meet measured throughput or consumer requirements.                                                         |
| Kubernetes/Helm                     | Real deployment needs exceed Docker Compose and a simple hosted deployment.                                                           |
| Enterprise identity/compliance      | A real user or learning goal justifies the feature.                                                                                   |
| Multi-region writes                 | Real latency, residency, or availability requirements justify the consistency cost.                                                   |

## 25. Final Build Recommendation

Build the project first as:

```text
TypeScript monorepo with pnpm + Vite+
React + Vite/Rolldown
shadcn/ui + Base UI primitives
Node.js + Effect v4
Prisma Schema + Prisma Migrate
plain SQL via @effect/sql-pg
PostgreSQL
Zero for synchronized durable reads
Node-hosted WebSockets for typing/presence
filesystem or S3-compatible file storage
Docker Compose
```

Do not begin with Durable Objects or Redis. Keep command transports thin, keep application logic separate, make Postgres authoritative, use Prisma only for schema evolution, and let Zero converge durable client state while Node WebSockets handle ephemeral signals.

The most impressive outcome is not a claim of enterprise scale. It is a finished public system whose architecture, security, reliability, operational behavior, and engineering decisions can all be inspected and demonstrated.

## 26. Primary Technical References

- [Vite+ getting started](https://viteplus.dev/guide/)
- [Vite+ monorepo guide](https://viteplus.dev/guide/monorepo)
- [shadcn/ui with Vite](https://ui.shadcn.com/docs/installation/vite)
- [shadcn/ui Base UI support](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)
- [Base UI overview](https://base-ui.com/react/overview/about)
- [Zero: when to use it](https://zero.rocicorp.dev/docs/when-to-use)
- [Zero installation and architecture](https://zero.rocicorp.dev/docs/install)
- [Zero mutators](https://zero.rocicorp.dev/docs/mutators)
- [Prisma Migrate](https://docs.prisma.io/docs/orm/prisma-migrate)
- [Customizing Prisma migrations](https://docs.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)
