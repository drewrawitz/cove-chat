# `@cove/api`

Node composition root and HTTP transport for Cove.

The initial HTTP surface exposes:

- `POST /api/v1/auth/login` to request a short-lived magic link.
- `POST /api/v1/auth/login/verify` to redeem a one-time magic-link token and issue a session.
- `POST /api/v1/auth/logout` to revoke the current session after CSRF validation and expire its
  cookies.
- `GET /api/v1/me` to return the server-authenticated current user.
- `GET /health/live` for process liveness.
- `GET /health/ready` for PostgreSQL readiness.
- `GET /openapi.json` for the generated OpenAPI 3.1 contract.
- `GET /docs` for interactive Scalar API documentation.

Health handlers implement the declarative `CoveApi` contract from `@cove/protocol`; request and
response encoding is performed from that shared contract.

Authentication uses an opaque `cove_session` cookie with `HttpOnly`, `Secure`, `SameSite=Strict`,
and a root path. A separate readable `cove_csrf` cookie supplies the token clients must echo in the
`x-csrf-token` header for cookie-authenticated state changes. Only SHA-256 hashes of magic-link,
session, and CSRF tokens are stored in PostgreSQL. The generated OpenAPI document declares the
cookie security scheme and CSRF header, so Scalar displays them on protected operations.

Magic-link verification delegates session creation to a provider-neutral application use case.
Future passkey and Google sign-in adapters should authenticate their credential, resolve a Cove
user, and call that same session issuer; passwords are not part of this design.

The current delivery adapter prints one-time magic links for local development. It is intentionally
isolated behind `MagicLinkDelivery`; replace it with an email adapter before a hosted deployment.
Set `MAGIC_LINK_VERIFY_URL` to the web route that accepts the token and posts it to the verification
endpoint.

Runtime configuration:

- `DATABASE_URL` is required.
- `MAGIC_LINK_VERIFY_URL` defaults to `http://localhost:3000/auth/verify`.
- `HOST` defaults to `0.0.0.0`.
- `PORT` defaults to `3000`.
