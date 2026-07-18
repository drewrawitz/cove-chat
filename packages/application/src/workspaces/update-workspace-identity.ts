import { UserId, WorkspaceId, WorkspaceIdentityProfile } from "@cove/domain";
import { WorkspaceAccessRepository } from "@cove/ports";
import { Effect, Option, Schema } from "effect";
import { WorkspaceUnavailable } from "./get-workspace-access.ts";

export const UpdateWorkspaceIdentityInput = Schema.Struct({
  actorId: UserId,
  workspaceId: WorkspaceId,
  profile: WorkspaceIdentityProfile,
});
export interface UpdateWorkspaceIdentityInput extends Schema.Schema.Type<
  typeof UpdateWorkspaceIdentityInput
> {}

export const updateWorkspaceIdentity = Effect.fn("Application.updateWorkspaceIdentity")(function* (
  input: UpdateWorkspaceIdentityInput,
) {
  const workspaces = yield* WorkspaceAccessRepository;
  const updated = yield* workspaces.updateIdentity(input.actorId, input.workspaceId, input.profile);

  if (Option.isNone(updated)) {
    return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId: input.workspaceId }));
  }

  return updated.value;
});
