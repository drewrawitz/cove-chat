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

Authentication use cases publish notification intent through `AuthenticationNotifier`. The email
infrastructure owns the magic-link template and `/auth/verify` route, then delegates the rendered
message to the generic `EmailSender` port. Local development uses `ConsoleEmailSender`; staging and
production can provide a Resend adapter without changing authentication workflows or templates.

`PUBLIC_APP_URL` is the deployment-specific web origin used to construct public links. Route paths
remain code-owned rather than configurable.

Runtime configuration:

- `DATABASE_URL` is required.
- `PUBLIC_APP_URL` is required. The local `.env.example` uses `http://localhost:3000`.
- `HOST` defaults to `0.0.0.0`.
- `PORT` defaults to `3001` so it does not collide with the local web app.
