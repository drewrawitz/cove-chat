# `@cove/ports`

Infrastructure-independent capabilities required by Cove application workflows.

The interfaces cover tenant-scoped channel authorization plus passwordless identity, session,
transaction, notification, generic email delivery, and audit capabilities. Authentication use
cases publish intent through `AuthenticationNotifier`; Workspace invitation workflows publish
email-addressed invitation intent through `WorkspaceInvitationNotifier`. Email infrastructure
renders both through `EmailSender`. Security capabilities use distinct branded token types, and
concrete adapters translate provider failures into typed errors.

Audit events use an append-only, typed event contract with an explicit version and structured
metadata. The PostgreSQL adapter persists that metadata as JSONB.
