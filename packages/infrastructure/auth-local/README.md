# `@cove/infrastructure-auth-local`

Local-development authentication adapters for Cove.

`ConsoleMagicLinkDelivery` deliberately writes the one-time verification URL to the development
server log so the passwordless flow works without an email provider. It is a local delivery
channel, not a production default; a hosted environment must replace this Layer with a real email
adapter.
