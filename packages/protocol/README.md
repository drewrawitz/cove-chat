# `@cove/protocol`

The client-safe source of truth for Cove's serialized transport contracts.

Three Effect `HttpApi` values keep Cove's HTTP audiences separate:

- `CoveAppApi` is the first-party interface under `/api/app/v1`. It uses Cove's browser session
  and CSRF model and is not included in public documentation.
- `CovePublicApi` is the stable interface reserved for supported integrations under `/api/v1`.
  Its OpenAPI document is the only contract served publicly. It currently has no operations.
- `CoveOperationsApi` contains liveness and readiness endpoints under `/health`. It is not included
  in public documentation and should be restricted by deployment ingress policy.

The API server implements each contract independently, and consumers can derive a typed
`HttpApiClient` from the contract appropriate to their audience.

Domain and application models are mapped into these contracts explicitly; they are not treated as
wire formats.
