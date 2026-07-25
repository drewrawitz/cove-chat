---
status: accepted
---

# Bound Channel synchronization to Topic summaries

Opening a Channel synchronizes a bounded window of 50 Topic summaries rather than complete Message
histories. Each summary carries the Topic metadata, Message count, latest Message preview and
author, and last activity time through transactionally maintained projection fields; older Topics
load through an explicit action in increments of 50, while full Message bodies synchronize only
after a participant opens a Topic. Message count and the latest Message's identity, bounded preview,
author, position, timestamps, deletion state, and Topic activity time live on the Topic row and
update in the same PostgreSQL transaction as a new Message. Editing or deleting an existing Message
updates its visible projection without bumping Topic activity, and deleted Messages remain counted
as stable tombstones. Loading older Topics expands one current live window
from 50 to 100, then 150, and so on, instead of composing reactive cursor pages that can overlap or
leave gaps when new activity reorders Topics. The reactive window stops at 500 Topics. Older Topics
remain accessible through non-reactive HTTP keyset pages of 100 using a scope-bound opaque cursor;
opening an archived result activates its normal Zero-backed Topic view. Starting archive traversal
retains the current live window in client state, and live and archive results are deduplicated by
Topic identity. New activity may move a Topic out of a later archive page, but that Topic then
appears in the live window; Cove does not maintain temporal ordering history or server-side cursor
records solely to repeat an identical archive page.
