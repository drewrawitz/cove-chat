import { UserId, WorkspaceAccess, WorkspaceIdentityProfile, WorkspaceName } from "@cove/domain";
import { WorkspaceAccessRepository, WorkspaceIdentifierGenerator } from "@cove/ports";
import { Effect, Schema } from "effect";

export const CreateWorkspaceInput = Schema.Struct({
  actorId: UserId,
  workspaceName: WorkspaceName,
  profile: WorkspaceIdentityProfile,
});
export interface CreateWorkspaceInput extends Schema.Schema.Type<typeof CreateWorkspaceInput> {}

export const createWorkspace = Effect.fn("Application.createWorkspace")(function* (
  input: CreateWorkspaceInput,
) {
  const workspaces = yield* WorkspaceAccessRepository;
  const identifiers = yield* WorkspaceIdentifierGenerator;
  const workspaceId = yield* identifiers.nextWorkspaceId();
  const workspaceIdentityId = yield* identifiers.nextWorkspaceIdentityId();
  const access = WorkspaceAccess.make({
    workspace: {
      id: workspaceId,
      name: input.workspaceName,
    },
    identity: {
      id: workspaceIdentityId,
      workspaceId,
      accountId: input.actorId,
      ...input.profile,
    },
    role: "owner",
  });

  return yield* workspaces.createWorkspace(access);
});
