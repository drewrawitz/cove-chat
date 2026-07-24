---
status: accepted
---

# Require idempotency for durable Conversation commands

Every durable Conversation command carries a client-generated command ID that is unique within its
Workspace, and PostgreSQL records the completed outcome so a retry returns that outcome without
executing the command again. Cove applies this invariant to Message creation, editing, and deletion
first, then to future reactions, Resolutions, Topic Moves, and other durable commands; entity IDs
alone are insufficient because commands that change existing entities also require safe retries.
The synchronized projection exposes the command ID that produced a row's current state so clients
can reconcile pending commands deterministically regardless of whether the HTTP outcome or Zero
update arrives first. Successful receipts retain only compact outcome metadata and references for
the lifetime of their Workspace; they never expire independently, because expiry would allow a late
retry to execute twice. Each receipt stores a compact fingerprint of the command request. Reusing a
command ID with the same request returns the saved outcome, while reusing it with different content
is rejected as an idempotency-key conflict.
Authenticated, schema-valid commands also retain terminal domain rejections as completed outcomes,
while malformed, unauthenticated, CSRF, and transient infrastructure failures do not create
receipts and remain retryable. A participant whose circumstances change issues a new command ID
rather than causing an old rejected command to acquire new meaning.
Message edits and deletions also carry the version the participant observed, and PostgreSQL rejects
a command whose version is stale. Cove retains conflicting edit text for review because command
idempotency prevents duplicate execution but does not prevent two distinct commands from
overwriting one another.
