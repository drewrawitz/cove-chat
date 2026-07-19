---
status: accepted
---

# Minimize Workspace Identity profile audit payloads

Every successful Workspace Identity profile change emits one durable audit event atomically with the change. The event records the actor Account, Workspace, subject Workspace Identity, transition timestamp, and a non-empty normalized set of changed fields such as `name` and `avatarUrl`. It records neither raw previous or new profile values nor hashes of those values. A semantic no-op produces no profile-change audit event.

This proves that persistent attribution changed without creating a second profile-history store. Cove accepts that earlier values cannot be reconstructed and that any future requirement for value capture can apply only prospectively. The non-collection is intentional because minimizing retained identity data outweighs speculative forensic or compliance utility.
