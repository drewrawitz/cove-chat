import type {
  FullMemberView,
  IdentityProfileUnchanged,
  WorkspaceAccessView,
  WorkspaceCreated,
  WorkspaceIdentityUpdated,
  WorkspaceInvitationAccepted,
  WorkspaceInvitationCreated,
  WorkspaceInvitationView,
  WorkspaceRoleChanged,
  WorkspaceRoleUnchanged,
} from "@cove/application";
import {
  WorkspaceAccessResponse,
  WorkspaceCreatedResponse,
  WorkspaceIdentityUpdateResponse,
  WorkspaceInvitationAcceptedResponse,
  WorkspaceInvitationCreatedResponse,
  WorkspaceInvitationListResponse,
  WorkspaceInvitationResponse,
  WorkspaceListResponse,
  WorkspaceMemberListResponse,
  WorkspaceMemberResponse,
  WorkspaceRoleChangeResponse,
  WorkspaceSummaryResponse,
} from "@cove/protocol";

export const workspaceAccessResponse = (access: WorkspaceAccessView): WorkspaceAccessResponse =>
  WorkspaceAccessResponse.make({
    workspace: {
      id: access.workspace.id,
      name: access.workspace.name,
    },
    identity: {
      id: access.identity.id,
      name: access.identity.name,
      avatarUrl: access.identity.avatarUrl,
    },
    membership: { role: access.membership.role },
  });

export const workspaceListResponse = (
  workspaces: ReadonlyArray<WorkspaceAccessView>,
): WorkspaceListResponse =>
  WorkspaceListResponse.make({
    workspaces: workspaces.map((access) =>
      WorkspaceSummaryResponse.make({
        id: access.workspace.id,
        name: access.workspace.name,
        identity: {
          id: access.identity.id,
          name: access.identity.name,
          avatarUrl: access.identity.avatarUrl,
        },
        membership: { role: access.membership.role },
      }),
    ),
  });

export const workspaceCreatedResponse = (outcome: WorkspaceCreated): WorkspaceCreatedResponse =>
  WorkspaceCreatedResponse.make({
    outcome: outcome._tag,
    workspaceId: outcome.workspaceId,
    workspaceIdentityId: outcome.workspaceIdentityId,
    occurredAt: outcome.occurredAt,
  });

export const workspaceIdentityUpdateResponse = (
  outcome: IdentityProfileUnchanged | WorkspaceIdentityUpdated,
): WorkspaceIdentityUpdateResponse =>
  WorkspaceIdentityUpdateResponse.make({
    outcome: outcome._tag,
    workspaceId: outcome.workspaceId,
    workspaceIdentityId: outcome.workspaceIdentityId,
    occurredAt: outcome.occurredAt,
  });

export const workspaceInvitationListResponse = (
  invitations: ReadonlyArray<WorkspaceInvitationView>,
): WorkspaceInvitationListResponse =>
  WorkspaceInvitationListResponse.make({
    invitations: invitations.map((invitation) =>
      WorkspaceInvitationResponse.make({
        id: invitation.id,
        workspace: invitation.workspace,
        role: invitation.role,
        requiresIdentityProfile: invitation.requiresIdentityProfile,
        invitedAt: invitation.invitedAt,
      }),
    ),
  });

export const workspaceMemberListResponse = (
  members: ReadonlyArray<FullMemberView>,
): WorkspaceMemberListResponse =>
  WorkspaceMemberListResponse.make({
    members: members.map((member) =>
      WorkspaceMemberResponse.make({
        identity: {
          id: member.identity.id,
          name: member.identity.name,
          avatarUrl: member.identity.avatarUrl,
        },
        membership: { role: member.membership.role },
      }),
    ),
  });

export const workspaceInvitationCreatedResponse = (
  outcome: WorkspaceInvitationCreated,
): WorkspaceInvitationCreatedResponse =>
  WorkspaceInvitationCreatedResponse.make({
    outcome: outcome._tag,
    invitationId: outcome.invitationId,
    workspaceId: outcome.workspaceId,
    inviteeAccountId: outcome.inviteeAccountId,
    occurredAt: outcome.occurredAt,
  });

export const workspaceInvitationAcceptedResponse = (
  outcome: WorkspaceInvitationAccepted,
): WorkspaceInvitationAcceptedResponse =>
  WorkspaceInvitationAcceptedResponse.make({
    outcome: outcome._tag,
    invitationId: outcome.invitationId,
    workspaceId: outcome.workspaceId,
    workspaceIdentityId: outcome.workspaceIdentityId,
    occurredAt: outcome.occurredAt,
  });

export const workspaceRoleChangeResponse = (
  outcome: WorkspaceRoleChanged | WorkspaceRoleUnchanged,
): WorkspaceRoleChangeResponse =>
  WorkspaceRoleChangeResponse.make({
    outcome: outcome._tag,
    workspaceId: outcome.workspaceId,
    workspaceIdentityId: outcome.workspaceIdentityId,
    previousRole: outcome._tag === "WorkspaceRoleChanged" ? outcome.previousRole : outcome.role,
    role: outcome.role,
    occurredAt: outcome.occurredAt,
  });
