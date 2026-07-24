---
status: accepted
---

# Assign read ownership by behavior

Authentication, Workspace access, Channel access checks, and non-reactive browsing beyond a
Channel's 500-Topic live window remain ordinary HTTP reads. Reactive Topic summaries and opened
Topic Messages use Zero because they require durable synchronization. Cove assigns each read model
one owner and migrates another read to Zero only when its behavior requires synchronization,
accepting a deliberate hybrid client instead of duplicating ownership for architectural symmetry.
