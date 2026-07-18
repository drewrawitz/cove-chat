import { UserId, WorkspaceId, WorkspaceIdentity, WorkspaceIdentityProfile } from "@cove/domain";
import { WorkspaceAccessRepository, WorkspaceIdentifierGenerator } from "@cove/ports";
import { Effect, Option, Schema } from "effect";
import { WorkspaceUnavailable } from "./get-workspace-access.ts";

export const JoinWorkspaceInput = Schema.Struct({
  actorId: UserId,
  workspaceId: WorkspaceId,
  profile: WorkspaceIdentityProfile,
});
export interface JoinWorkspaceInput extends Schema.Schema.Type<typeof JoinWorkspaceInput> {}

export class WorkspaceIdentityDefaultsUnavailable extends Schema.TaggedErrorClass<WorkspaceIdentityDefaultsUnavailable>()(
  "Application.WorkspaceIdentityDefaultsUnavailable",
  { actorId: UserId },
) {}

export const getWorkspaceIdentityDefaults = Effect.fn("Application.getWorkspaceIdentityDefaults")(
  function* (actorId: UserId, sourceWorkspaceId: WorkspaceId) {
    const workspaces = yield* WorkspaceAccessRepository;
    const identity = yield* workspaces.findIdentityForAccount(actorId, sourceWorkspaceId);

    if (Option.isNone(identity)) {
      return yield* Effect.fail(new WorkspaceIdentityDefaultsUnavailable({ actorId }));
    }

    return WorkspaceIdentityProfile.make({
      name: identity.value.name,
      avatarUrl: identity.value.avatarUrl,
    });
  },
);

export const joinWorkspace = Effect.fn("Application.joinWorkspace")(function* (
  input: JoinWorkspaceInput,
) {
  const workspaces = yield* WorkspaceAccessRepository;
  const identifiers = yield* WorkspaceIdentifierGenerator;
  const workspaceIdentityId = yield* identifiers.nextWorkspaceIdentityId();
  const joined = yield* workspaces.joinWorkspace(
    WorkspaceIdentity.make({
      id: workspaceIdentityId,
      workspaceId: input.workspaceId,
      accountId: input.actorId,
      ...input.profile,
    }),
  );

  if (Option.isNone(joined)) {
    return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId: input.workspaceId }));
  }

  return joined.value;
});
