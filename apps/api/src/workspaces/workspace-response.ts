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
  WorkspaceIdentityResponse,
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

interface WorkspaceIdentityView {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string;
}

function workspaceIdentityResponse(identity: WorkspaceIdentityView): WorkspaceIdentityResponse {
  return WorkspaceIdentityResponse.make({
    id: identity.id,
    name: identity.name,
    avatarUrl: identity.avatarUrl,
  });
}

export function workspaceAccessResponse(access: WorkspaceAccessView): WorkspaceAccessResponse {
  return WorkspaceAccessResponse.make({
    workspace: {
      id: access.workspace.id,
      name: access.workspace.name,
    },
    identity: workspaceIdentityResponse(access.identity),
    membership: { role: access.membership.role },
  });
}

export function workspaceListResponse(
  workspaces: ReadonlyArray<WorkspaceAccessView>,
): WorkspaceListResponse {
  return WorkspaceListResponse.make({
    workspaces: workspaces.map((access) =>
      WorkspaceSummaryResponse.make({
        id: access.workspace.id,
        name: access.workspace.name,
        identity: workspaceIdentityResponse(access.identity),
        membership: { role: access.membership.role },
      }),
    ),
  });
}

export function workspaceCreatedResponse(outcome: WorkspaceCreated): WorkspaceCreatedResponse {
  return WorkspaceCreatedResponse.make({
    outcome: outcome._tag,
    workspaceId: outcome.workspaceId,
    workspaceIdentityId: outcome.workspaceIdentityId,
    occurredAt: outcome.occurredAt,
  });
}

export function workspaceIdentityUpdateResponse(
  outcome: IdentityProfileUnchanged | WorkspaceIdentityUpdated,
): WorkspaceIdentityUpdateResponse {
  return WorkspaceIdentityUpdateResponse.make({
    outcome: outcome._tag,
    workspaceId: outcome.workspaceId,
    workspaceIdentityId: outcome.workspaceIdentityId,
    occurredAt: outcome.occurredAt,
  });
}

export function workspaceInvitationListResponse(
  invitations: ReadonlyArray<WorkspaceInvitationView>,
): WorkspaceInvitationListResponse {
  return WorkspaceInvitationListResponse.make({
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
}

export function workspaceMemberListResponse(
  members: ReadonlyArray<FullMemberView>,
): WorkspaceMemberListResponse {
  return WorkspaceMemberListResponse.make({
    members: members.map((member) =>
      WorkspaceMemberResponse.make({
        identity: workspaceIdentityResponse(member.identity),
        membership: { role: member.membership.role },
      }),
    ),
  });
}

export function workspaceInvitationCreatedResponse(
  outcome: WorkspaceInvitationCreated,
): WorkspaceInvitationCreatedResponse {
  return WorkspaceInvitationCreatedResponse.make({
    outcome: outcome._tag,
    invitationId: outcome.invitationId,
    workspaceId: outcome.workspaceId,
    inviteeAccountId: outcome.inviteeAccountId,
    occurredAt: outcome.occurredAt,
  });
}

export function workspaceInvitationAcceptedResponse(
  outcome: WorkspaceInvitationAccepted,
): WorkspaceInvitationAcceptedResponse {
  return WorkspaceInvitationAcceptedResponse.make({
    outcome: outcome._tag,
    invitationId: outcome.invitationId,
    workspaceId: outcome.workspaceId,
    workspaceIdentityId: outcome.workspaceIdentityId,
    occurredAt: outcome.occurredAt,
  });
}

export function workspaceRoleChangeResponse(
  outcome: WorkspaceRoleChanged | WorkspaceRoleUnchanged,
): WorkspaceRoleChangeResponse {
  return WorkspaceRoleChangeResponse.make({
    outcome: outcome._tag,
    workspaceId: outcome.workspaceId,
    workspaceIdentityId: outcome.workspaceIdentityId,
    previousRole: outcome._tag === "WorkspaceRoleChanged" ? outcome.previousRole : outcome.role,
    role: outcome.role,
    occurredAt: outcome.occurredAt,
  });
}
