import {
  workspaceInvitationResendAvailableAt,
  type FullMemberView,
  type IdentityProfileUnchanged,
  type PendingWorkspaceInvitationView,
  type WorkspaceAccessView,
  type WorkspaceCreated,
  type WorkspaceIdentityUpdated,
  type WorkspaceInvitationAccepted,
  type WorkspaceInvitationIssued,
  type WorkspaceInvitationRedeemed,
  type WorkspaceInvitationResent,
  type WorkspaceInvitationRevoked,
  type WorkspaceInvitationView,
  type WorkspaceRoleChanged,
  type WorkspaceRoleUnchanged,
} from "@cove/application";
import { GENERAL_CHANNEL_ID } from "@cove/domain";
import {
  FullMemberListResponse,
  FullMemberResponse,
  PendingWorkspaceInvitationListResponse,
  PendingWorkspaceInvitationResponse,
  WorkspaceAccessResponse,
  WorkspaceCreatedResponse,
  WorkspaceIdentityResponse,
  WorkspaceIdentityUpdateResponse,
  WorkspaceInvitationAcceptedResponse,
  WorkspaceInvitationIssuedResponse,
  WorkspaceInvitationListResponse,
  WorkspaceInvitationRedeemedResponse,
  WorkspaceInvitationResentResponse,
  WorkspaceInvitationRevokedResponse,
  WorkspaceInvitationResponse,
  WorkspaceListResponse,
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
    generalChannelId: GENERAL_CHANNEL_ID,
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
    generalChannelId: outcome.generalChannelId,
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

export function fullMemberListResponse(
  members: ReadonlyArray<FullMemberView>,
): FullMemberListResponse {
  return FullMemberListResponse.make({
    members: members.map((member) =>
      FullMemberResponse.make({
        identity: workspaceIdentityResponse(member.identity),
        membership: { role: member.membership.role },
      }),
    ),
  });
}

export function pendingWorkspaceInvitationListResponse(
  invitations: ReadonlyArray<PendingWorkspaceInvitationView>,
): PendingWorkspaceInvitationListResponse {
  return PendingWorkspaceInvitationListResponse.make({
    invitations: invitations.map((invitation) =>
      PendingWorkspaceInvitationResponse.make({
        id: invitation.id,
        inviteeEmail: invitation.inviteeEmail,
        invitedAt: invitation.invitedAt,
        expiresAt: invitation.tokenExpiresAt,
        resendAvailableAt: workspaceInvitationResendAvailableAt(invitation.invitedAt),
      }),
    ),
  });
}

export function workspaceInvitationIssuedResponse(
  outcome: WorkspaceInvitationIssued,
): WorkspaceInvitationIssuedResponse {
  return WorkspaceInvitationIssuedResponse.make({
    outcome: outcome._tag,
    invitationId: outcome.invitationId,
    workspaceId: outcome.workspaceId,
    inviteeEmail: outcome.inviteeEmail,
    occurredAt: outcome.occurredAt,
  });
}

export function workspaceInvitationResentResponse(
  outcome: WorkspaceInvitationResent,
): WorkspaceInvitationResentResponse {
  return WorkspaceInvitationResentResponse.make({
    outcome: outcome._tag,
    invitationId: outcome.invitationId,
    workspaceId: outcome.workspaceId,
    inviteeEmail: outcome.inviteeEmail,
    occurredAt: outcome.occurredAt,
  });
}

export function workspaceInvitationRevokedResponse(
  outcome: WorkspaceInvitationRevoked,
): WorkspaceInvitationRevokedResponse {
  return WorkspaceInvitationRevokedResponse.make({
    outcome: outcome._tag,
    invitationId: outcome.invitationId,
    workspaceId: outcome.workspaceId,
    inviteeEmail: outcome.inviteeEmail,
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

export function workspaceInvitationRedeemedResponse(
  outcome: WorkspaceInvitationRedeemed,
): WorkspaceInvitationRedeemedResponse {
  return WorkspaceInvitationRedeemedResponse.make({
    outcome: outcome._tag,
    account: {
      id: outcome.account.id,
      email: outcome.account.email,
      displayName: outcome.account.displayName,
    },
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
