# `@cove/ports`

Infrastructure-independent capabilities required by Cove application workflows.

The interfaces cover tenant-scoped channel authorization plus passwordless identity, session,
transaction, delivery, and audit capabilities. Security capabilities use distinct branded token
types, and concrete persistence adapters translate provider failures into typed errors.
