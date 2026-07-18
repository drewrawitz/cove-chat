# `@cove/api`

Node composition root and HTTP transport for Cove.

The initial HTTP surface exposes:

- `POST /api/app/v1/auth/login` to request a short-lived magic link.
- `POST /api/app/v1/auth/login/verify` to redeem a one-time magic-link token and issue a session.
- `POST /api/app/v1/auth/logout` to revoke the current session after CSRF validation and expire
  its cookies.
- `GET /api/app/v1/me` to return the server-authenticated current user.
- `GET /health/live` for process liveness.
- `GET /health/ready` for PostgreSQL readiness.
- `GET /openapi/public.json` for the generated public OpenAPI 3.1 contract.
- `GET /docs` for interactive Scalar documentation of the public contract.
- `GET /internal/docs` for interactive Scalar documentation of the first-party app contract
  when `EXPOSE_APP_API_DOCS=true`.

The server mounts three declarative contracts from `@cove/protocol` independently. `CoveAppApi`
contains first-party application endpoints, `CoveOperationsApi` contains health checks, and
`CovePublicApi` is reserved for supported integrations. Only `CovePublicApi` is exposed through
public OpenAPI and Scalar; it currently has no operations. `CoveAppApi` documentation can be mounted
explicitly for local or protected environments. Request and response encoding is performed from the
relevant shared contract.

Authentication uses an opaque `cove_session` cookie with `HttpOnly`, `Secure`, `SameSite=Strict`,
and a root path. A separate readable `cove_csrf` cookie supplies the token clients must echo in the
`x-csrf-token` header for cookie-authenticated state changes. Only SHA-256 hashes of magic-link,
session, and CSRF tokens are stored in PostgreSQL. `CoveAppApi` declares the cookie security scheme
and CSRF header for protected first-party operations without publishing them in public Scalar docs.

Magic-link verification delegates session creation to a provider-neutral application use case.
Future passkey and Google sign-in adapters should authenticate their credential, resolve a Cove
user, and call that same session issuer; passwords are not part of this design.

Authentication use cases publish notification intent through `AuthenticationNotifier`. The email
infrastructure owns the magic-link template and `/auth/verify` route, then delegates the rendered
message to the generic `EmailSender` port. Local development uses `ConsoleEmailSender`; staging and
production can provide a Resend adapter without changing authentication workflows or templates.

`PUBLIC_APP_URL` is the deployment-specific web origin used to construct public links. Route paths
remain code-owned rather than configurable.

## Compatibility

This is a pre-release breaking route migration. First-party callers must replace `/api/v1` with
`/api/app/v1`, and OpenAPI callers must replace `/openapi.json` with `/openapi/public.json`.
`/docs` now renders only the public contract; the first-party reference is available at the opt-in
`/internal/docs` route. The transitional `/developers` and `/internal/developers` routes are
intentionally removed without redirects or compatibility aliases.

Runtime configuration:

- `DATABASE_URL` is required.
- `EXPOSE_APP_API_DOCS` defaults to `false`. The local `.env.example` enables it; leave it disabled
  unless `/internal/docs` is protected from public access.
- `PUBLIC_APP_URL` is required. The local `.env.example` uses `http://localhost:3000`.
- `HOST` defaults to `0.0.0.0`.
- `PORT` defaults to `3001` so it does not collide with the local web app.
