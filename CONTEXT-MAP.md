# Cove Context Map

Cove separates durable conversation, access, attention, and extension concepts so that no single chat-shaped model owns all product behavior.

## Contexts

- [Identity and Access](./docs/domain/identity-access/CONTEXT.md) — defines workspace-scoped identity, active access, roles, and channel participation
- [Conversations](./docs/domain/conversations/CONTEXT.md) — owns channels, direct spaces, named topics, messages, and resolutions
- [Attention](./docs/domain/attention/CONTEXT.md) — controls how activity becomes something a person follows, receives, or is asked to handle
- [Integrations](./docs/domain/integrations/CONTEXT.md) — extends Cove through workspace-installed plugins without bypassing core permissions or attention rules

## Relationships

- **Identity and Access → Conversations**: supplies the workspace identity that authors messages and determines which conversation containers it may access.
- **Conversations → Attention**: topic and message activity can be followed, deliberately delivered to an inbox, or attached to a response request.
- **Identity and Access → Attention**: scopes inboxes and away statuses to a workspace and supplies the recipients of notifications and response requests.
- **Integrations → Conversations**: plugins may add actions and structured messages inside an accessible topic.
- **Identity and Access → Integrations**: workspace roles govern plugin installation, while individual workspace identities authorize external accounts.
