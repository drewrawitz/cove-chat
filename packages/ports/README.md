# `@cove/ports`

Infrastructure-independent capabilities required by Cove application workflows.

The current interface contains only the tenant-scoped channel lookup and membership facts needed
to authorize channel access. Concrete persistence adapters must translate provider failures into
the typed `PersistenceError`.
