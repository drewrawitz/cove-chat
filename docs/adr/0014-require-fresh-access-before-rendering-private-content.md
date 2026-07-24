---
status: accepted
---

# Require fresh access before rendering private content

After application load or reconnect, Cove requires an authoritative active Workspace Membership and
Channel Membership check before rendering cached Private Channel content. The browser may prepare
the Zero query in parallel, but cached rows are only a performance optimization and never proof of
current access; Cove accepts that offline private reading is unavailable and that revocation cannot
erase data a former participant already copied from their device. If authoritative access or a
synchronized membership update revokes access while a Private Channel is open, Cove hides the
content and navigates away immediately rather than waiting for a cache timeout; rows unique to that
Channel become removable.
