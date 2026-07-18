# Identity and Access

This context distinguishes a person's global sign-in from their identity, access, and authority inside each workspace. It preserves authorship even after access ends.

## Identity

**Account**:
The global sign-in identity through which a person can participate in multiple workspaces.
_Avoid_: Workspace member, workspace identity

**Workspace Identity**:
The persistent persona of an account inside one workspace, including its workspace-specific name and avatar. It remains available for attribution after workspace access ends.
_Avoid_: Global profile, active membership

**Workspace Membership**:
The time-bounded relationship that grants a workspace identity access to a workspace and assigns its current workspace role. Ending it removes access without removing the workspace identity or its history.
_Avoid_: Workspace identity

**Workspace Role**:
The authority assigned to a workspace membership: owner, admin, member, or guest. The same account can hold a different role in each workspace.
_Avoid_: Account role, global role

## Roles

**Owner**:
A full member with ultimate workspace authority, including appointing other owners and archiving the workspace. Every active workspace has at least one owner.

**Admin**:
A full member who manages workspace membership, roles below owner, and plugin installation without automatically gaining access to private conversations.

**Member**:
An internal workspace participant without workspace-wide administrative authority.

**Full Member**:
An owner, admin, or member. Full members can discover public channels; guests cannot.
_Avoid_: Guest, all workspace memberships

**Guest**:
An externally marked workspace participant limited to explicitly shared channels and the people who share those channels.
_Avoid_: Full member

## Channel participation

**Channel Membership**:
An explicit relationship between a workspace identity and a channel. It represents joining a public channel and grants access to a private channel or any channel shared with a guest.
_Avoid_: Workspace membership, topic membership

**Channel Steward**:
A full member responsible for a channel's purpose, membership, and lifecycle. Stewardship is independent of workspace role.
_Avoid_: Workspace admin, channel owner
