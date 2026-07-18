import type { UserId } from "@cove/domain";
import { WorkspaceAccessRepository } from "@cove/ports";
import { Effect } from "effect";

export const listWorkspaceAccess = Effect.fn("Application.listWorkspaceAccess")(function* (
  actorId: UserId,
) {
  const workspaces = yield* WorkspaceAccessRepository;
  return yield* workspaces.listForAccount(actorId);
});
