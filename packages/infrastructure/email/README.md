# `@cove/infrastructure-email`

Transactional-email infrastructure for Cove.

`AuthenticationEmailNotifier` translates authentication notification intent into an email. It
owns the `/auth/verify` web path and renders the magic-link message through the generic
`EmailSender` port.

`WorkspaceInvitationEmailNotifier` renders an expiring, single-use invitation link for an email
address that may not belong to an Account yet. Redeeming the link creates or resolves the Account
before establishing its Workspace Identity and Membership. Reinviting the same address rotates the
secret and sends a fresh link, so an expired link or failed delivery remains recoverable.

`ConsoleEmailSender` is the local-development email provider. It logs rendered transactional
emails so passwordless sign-in works without a hosted provider. A Resend adapter can replace this
layer in staging and production without changing authentication use cases or templates.
