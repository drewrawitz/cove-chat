# `@cove/application`

Cove use cases and orchestration built with Effect.

The current slices expose an authorized channel lookup and passwordless authentication workflows.
Magic-link verification delegates to the provider-neutral `issueSession` use case so later passkey
and Google identity adapters can share session policy and durable sign-in audit capture.
