---
status: accepted
---

# Page long Topics by Reply position

Opening a Topic synchronizes its Opening Brief and at most the 100 newest Replies, then lets the
participant deliberately load older Replies in additional pages of at most 100 using stable Message
position cursors. Cove bounds each automatic synchronization without imposing a lifetime history
cap: a participant may continue paging through the entire Topic when they choose. Every loaded page
remains active while the Topic is open and stays cached for five minutes after navigation before
becoming eligible for removal. The interface states how many older Replies are not yet loaded so a
bounded initial view cannot be mistaken for the Topic's complete history.
