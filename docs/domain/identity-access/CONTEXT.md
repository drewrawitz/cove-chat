# Identity and Access

This context distinguishes a person's global sign-in from their identity, access, and authority inside each workspace. It preserves authorship even after access ends.

## Identity

**Account**:
The global sign-in identity through which a person can participate in multiple workspaces.
_Avoid_: Workspace member, workspace identity

**Workspace Identity**:
The persistent persona of an Account inside one Workspace, including its workspace-specific name and avatar; an Account may change it only while it has an active Workspace Membership. It remains stable and available for attribution after access ends, and rejoining preserves it while restoring edit authority.
_Avoid_: Global profile, active membership

**Workspace Membership**:
The time-bounded relationship that grants a Workspace Identity access to a Workspace and assigns its current Workspace Role. Ending it removes access and every Channel Membership established under it while preserving the Workspace Identity and its history; a later Workspace Membership does not restore those Channel Memberships.
_Avoid_: Workspace identity

**Workspace Invitation**:
An expiring, email-addressed offer from an Owner or Admin to start or reactivate a Member Workspace Membership. Redeeming the invitation proves control of the invited email address and creates an Account when none exists. Acceptance creates a Workspace Identity only when the Account has never belonged to the Workspace; a returning Account resumes its existing Workspace Identity. Until accepted, revoked, or expired, it is pending; resending replaces its credential and renews its expiry, while revocation ends the offer immediately.
_Avoid_: Workspace membership, share link

**Workspace Role**:
The authority assigned to a workspace membership: owner, admin, member, or guest. The same account can hold a different role in each workspace.
_Avoid_: Account role, global role

## Roles

**Owner**:
A full member with ultimate Workspace authority, including appointing other Owners and archiving the Workspace. Until archived, a Workspace must have at least one Owner with an active Workspace Membership; no departure, removal, or Workspace Role change may eliminate the final active Owner.

**Admin**:
A full member who manages workspace membership, pending Workspace Invitations, roles below owner, and plugin installation without automatically gaining access to private conversations.

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
An explicit relationship between a Workspace Identity with an active Workspace Membership and a Channel. It represents joining a public Channel and grants access to a private Channel or any Channel shared with a Guest; it ends with the Workspace Membership and must be established again after rejoining.
_Avoid_: Workspace membership, topic membership

**Channel Maintainer**:
A full member responsible for a channel's purpose, membership, and lifecycle. A Channel's creator becomes its initial Channel Maintainer; maintenance is independent of Workspace Role.
_Avoid_: Channel Steward, Channel Owner, Channel Admin, Workspace Admin
