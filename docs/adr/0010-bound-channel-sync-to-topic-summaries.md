---
status: accepted
---

# Bound Channel synchronization to Topic summaries

Opening a Channel synchronizes a bounded window of 50 Topic summaries rather than complete Message
histories. Each summary carries the Topic metadata, Message count, latest Message preview and
author, and last activity time through transactionally maintained projection fields; older Topics
load through an explicit action in increments of 50, while full Message bodies synchronize only
after a participant opens a Topic. `messageCount`, `latestMessageId`, and `lastActivityAt` live on
the Topic row and update in the same PostgreSQL transaction as a new Message. Editing or deleting an
existing Message updates its visible projection without bumping Topic activity, and deleted
Messages remain counted as stable tombstones. Loading older Topics expands one current live window
from 50 to 100, then 150, and so on, instead of composing reactive cursor pages that can overlap or
leave gaps when new activity reorders Topics. The reactive window stops at 500 Topics. Older Topics
remain accessible through stable, non-reactive HTTP snapshot pages of 100; opening an archived
result activates its normal Zero-backed Topic view.
