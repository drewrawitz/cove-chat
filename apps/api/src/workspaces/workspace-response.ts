import type { WorkspaceAccessView } from "@cove/application";
import {
  WorkspaceAccessResponse,
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
