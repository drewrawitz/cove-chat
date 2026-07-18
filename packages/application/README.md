# `@cove/application`

Cove use cases and orchestration built with Effect.

The current slices expose an authorized channel lookup and passwordless authentication workflows.
Magic-link verification delegates to the provider-neutral `issueSession` use case with an explicit
authentication method, so later passkey and Google identity adapters can share session policy while
retaining useful, structured sign-in audit metadata.

Workspace lifecycle behavior is exposed through the operation-specific `WorkspaceAccess` interface.
Its public effects require no environment; the implementation owns identity/membership transitions,
idempotent command outcomes, owner protection, and audit classification. Postgres reaches the private,
transaction-oriented persistence seam only through the exact
`@cove/application/workspaces/internal` export.
