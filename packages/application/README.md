# `@cove/application`

Cove use cases and orchestration built with Effect.

The current slice exposes `getChannelForActor`, which loads a tenant-scoped channel, evaluates its
domain access rules, and hides missing and inaccessible channels behind the same typed error.
