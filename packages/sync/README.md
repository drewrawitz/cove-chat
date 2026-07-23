# `@cove/sync`

Zero schema, authorized named queries, and development cache tooling for Cove's durable Topic
projection.

PostgreSQL remains authoritative. Topic commands go through the Cove HTTP API; Zero replicates the
explicit `cove_zero_data` publication and transforms named queries through the authenticated
`POST /api/zero/query` route. CRUD mutations are disabled so sync does not become a second business
rule or write boundary.

For local development, PostgreSQL must run with `wal_level=logical`. Copy `.env.example` to `.env`,
apply migrations, and start the cache:

```sh
vp run @cove/db#migrate:deploy
vp run @cove/db#generate:zero
vp run @cove/sync#dev
```

The web app connects to `http://localhost:4848` by default. Set `VITE_ZERO_CACHE_URL` when the
browser-facing cache URL differs. In a deployed environment, configure the equivalent `ZERO_*`
values from `.env.example`; `ZERO_QUERY_URL` is the server-reachable Cove API URL, while
`VITE_ZERO_CACHE_URL` is the browser-reachable Zero cache URL.
