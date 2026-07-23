---
status: accepted
---

# Inherit topic access and move topics atomically

A Topic inherits access from its Channel or Direct Space and has no independent access list. Moving a Direct Topic to a Channel therefore requires every direct-space participant to approve the complete audience change, after which the Topic and all Messages move atomically rather than being cloned; the Direct Space keeps only a destination tombstone so Cove has one canonical conversation instead of diverging private and shared copies.
