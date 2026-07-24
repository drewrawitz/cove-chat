---
status: accepted
---

# Treat the Zero replica as disposable persistent state

The server-side `zero-cache` SQLite replica lives on persistent storage to avoid routine rebuilds
but is never backed up as a source of truth because PostgreSQL can reconstruct it. The lightweight
showcase smoke flow deletes and rebuilds the replica from the moderate fixture, records its size and
rebuild duration, reports sync readiness as unavailable during recovery, and proves that active
clients converge afterward without manual refresh or command replay. Cove makes no production
recovery-time, disk-headroom, concurrency, or high-availability claim until real deployment
evidence creates that requirement.
