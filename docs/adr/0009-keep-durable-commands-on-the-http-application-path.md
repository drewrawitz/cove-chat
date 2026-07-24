---
status: accepted
---

# Keep durable commands on the HTTP application path

Cove sends every durable command through its HTTP transport, Effect application logic, and
PostgreSQL transaction path, while Zero synchronizes only committed rows to clients. Zero mutators
remain deferred unless an experiment proves they can reuse the same application rules and
transaction semantics without creating a second write implementation; Cove accepts owning a small
pending-command overlay in exchange for one authoritative write path. The overlay distinguishes a
locally pending command from one accepted by PostgreSQL but still synchronizing, and removes itself
only when Zero delivers the authoritative committed row; sync delay never turns an accepted command
into a failure or an automatic resend. A reload with an ambiguous outcome preserves the draft and
original command ID but never resends automatically; after Zero reconnects, the participant must
explicitly retry if no committed result appears. Message creation, editing, and deletion all use
this lifecycle, retaining the previous committed state so a failed optimistic change can be
reversed. Optimistic edits and deletions display their intended state immediately with a pending
marker; a terminal rejection restores the previous committed state, while an accepted deletion
remains visibly syncing until Zero delivers its tombstone. An unknown HTTP outcome offers an
explicit retry with the same command ID, while an accepted command delayed in Zero offers
connection recovery rather than retry; neither state resends automatically.
The Account-scoped command journal is shared across Cove tabs so each command has one overlay
everywhere, but only the tab where the participant acted sends it. Rebuilding the disposable Zero
cache restores unresolved overlays from this journal without executing their commands again. If an
accepted command has not reconciled after ten seconds, Cove verifies its receipt and restarts the
Zero connection once; after thirty seconds it offers a sync-cache repair, never a command resend.
