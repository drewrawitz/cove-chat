import type {
  FirstMembershipStarted,
  IdentityProfileUnchanged,
  WorkspaceAccessView,
  WorkspaceCreated,
  WorkspaceIdentityUpdated,
  WorkspaceMembershipReactivated,
} from "@cove/application";
import {
  WorkspaceAccessResponse,
  WorkspaceCreatedResponse,
  WorkspaceIdentityUpdateResponse,
  WorkspaceJoinedResponse,
  WorkspaceListResponse,
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

export const workspaceJoinedResponse = (
  outcome: FirstMembershipStarted | WorkspaceMembershipReactivated,
): WorkspaceJoinedResponse =>
  WorkspaceJoinedResponse.make({
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
