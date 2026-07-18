import { UserId, WorkspaceId } from "@cove/domain";
import { WorkspaceAccessRepository } from "@cove/ports";
import { Effect, Option, Schema } from "effect";

export const GetWorkspaceAccessInput = Schema.Struct({
  actorId: UserId,
  workspaceId: WorkspaceId,
});
export interface GetWorkspaceAccessInput extends Schema.Schema.Type<
  typeof GetWorkspaceAccessInput
> {}

export class WorkspaceUnavailable extends Schema.TaggedErrorClass<WorkspaceUnavailable>()(
  "Application.WorkspaceUnavailable",
  { workspaceId: WorkspaceId },
) {}

export const getWorkspaceAccess = Effect.fn("Application.getWorkspaceAccess")(function* (
  input: GetWorkspaceAccessInput,
) {
  const workspaces = yield* WorkspaceAccessRepository;
  const access = yield* workspaces.findForAccount(input.actorId, input.workspaceId);

  if (Option.isNone(access)) {
    return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId: input.workspaceId }));
  }

  return access.value;
});
