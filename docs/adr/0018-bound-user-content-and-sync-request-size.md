---
status: accepted
---

# Bound user content and synchronization request size

Pagination bounds rows but cannot bound bytes while user-authored fields remain unlimited. Cove
therefore limits a Topic title to 512 UTF-8 bytes, a Channel purpose to 2 KiB, a Message or Opening
Brief body to 8 KiB, and a Topic-summary Message preview to 512 bytes. Conversation command JSON
requests are limited to 64 KiB and Zero query requests to 256 KiB. Validation occurs at the
protocol, domain, and database boundaries where applicable, with matching participant-facing
feedback. These limits keep the worst-case initial 100-Reply page and 50-Topic summary window
predictable instead of allowing one unusually large value to defeat otherwise bounded queries.
