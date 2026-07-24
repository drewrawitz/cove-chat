---
status: accepted
---

# Erase account conversation data on sign-out

Intentional sign-out, or discovery that the session is no longer valid, erases the Account's Zero
cache, unsent drafts, and pending-command records from that browser. Cove accepts a slower later
sign-in to protect conversation data on shared devices, while retaining device-wide preferences
that contain no Account conversation data. Synchronized Zero data is stored and reset independently
from unsent drafts and pending-command records so quota, corruption, or schema recovery can rebuild
the disposable cache from PostgreSQL without destroying unsent work. Browser-cache growth is
bounded by query ownership rather than one cross-browser byte limit: after five minutes of active
Zero runtime, rows unique to inactive queries become removable, measured IndexedDB usage reaches a
steady state across repeated navigation, and quota usage remains observable. Cove does not request
browser persistent-storage status for V1; real evidence of draft eviction is required before
pinning the origin's reconstructable synchronized cache. A Zero quota, corruption, or
storage-schema failure preserves drafts and command records, clears only synchronized cache state,
and attempts one automatic rebuild; a repeated failure opens a recovery screen instead of looping.
Sign-out broadcasts to every Cove tab, closes that Account's Zero connections, stops rendering its
cached content, and clears its Account-scoped local stores. Drafts are scoped to an Account and
Topic, obey the Message body-size limit, and expire after thirty days without editing; loss of Topic
access removes them immediately.
