# `@cove/infrastructure-email`

Transactional-email infrastructure for Cove.

`AuthenticationEmailNotifier` translates authentication notification intent into an email. It
owns the `/auth/verify` web path and renders the magic-link message through the generic
`EmailSender` port.

`ConsoleEmailSender` is the local-development email provider. It logs rendered transactional
emails so passwordless sign-in works without a hosted provider. A Resend adapter can replace this
layer in staging and production without changing authentication use cases or templates.
