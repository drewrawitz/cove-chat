# `@cove/protocol`

The client-safe source of truth for Cove's serialized transport contracts.

`CoveApi` declares HTTP paths, request and response schemas, status codes, and public errors with
Effect `HttpApi`. The API server implements this contract, consumers can derive a typed
`HttpApiClient`, and the same value generates Cove's OpenAPI document.

Domain and application models are mapped into these contracts explicitly; they are not treated as
wire formats.
