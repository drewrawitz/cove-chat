---
status: accepted
---

# Separate workspace identity from membership

An Account has a persistent Workspace Identity with workspace-specific profile data, while Workspace Membership is the time-bounded grant of access and a role. Ending membership must not erase or detach authored history, and changes to one workspace's identity do not propagate to another; this costs an additional domain distinction but preserves attribution across departures, removals, rejoins, and different roles in different workspaces.
