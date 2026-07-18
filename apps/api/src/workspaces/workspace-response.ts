import type { WorkspaceAccess } from "@cove/domain";
import {
  WorkspaceAccessResponse,
  WorkspaceListResponse,
  WorkspaceSummaryResponse,
} from "@cove/protocol";

export const workspaceAccessResponse = (access: WorkspaceAccess): WorkspaceAccessResponse =>
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
    role: access.role,
  });

export const workspaceListResponse = (
  workspaces: ReadonlyArray<WorkspaceAccess>,
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
        role: access.role,
      }),
    ),
  });
