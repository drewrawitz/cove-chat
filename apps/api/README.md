# `@cove/api`

Node composition root and HTTP transport for Cove.

The initial HTTP surface exposes:

- `GET /health/live` for process liveness.
- `GET /health/ready` for PostgreSQL readiness.
- `GET /openapi.json` for the generated OpenAPI 3.1 contract.
- `GET /docs` for interactive Scalar API documentation.

Health handlers implement the declarative `CoveApi` contract from `@cove/protocol`; request and
response encoding is performed from that shared contract.

Runtime configuration:

- `DATABASE_URL` is required.
- `HOST` defaults to `0.0.0.0`.
- `PORT` defaults to `3000`.
