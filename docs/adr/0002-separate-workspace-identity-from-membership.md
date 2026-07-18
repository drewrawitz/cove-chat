---
status: accepted
---

# Separate workspace identity from membership

An Account has a persistent Workspace Identity with workspace-specific profile data, while Workspace Membership is the time-bounded grant of access and a role. Ending membership must not erase or detach authored history, and changes to one workspace's identity do not propagate to another; this costs an additional domain distinction but preserves attribution across departures, removals, rejoins, and different roles in different workspaces.

The distinction is conceptual, not necessarily relational: while Cove retains only the current or most recently ended membership, its role and start/end timestamps live on the Workspace Identity row. If Cove needs multiple join periods or role-tenure history, Membership becomes a separate historical relation rather than a one-to-one table.
