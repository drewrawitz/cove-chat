import { UserId, WorkspaceId } from "@cove/domain";
import {
  AuditEvent,
  AuditEventWriter,
  TransactionManager,
  WorkspaceAccessRepository,
} from "@cove/ports";
import { Clock, Effect, Option, Schema } from "effect";
import { WorkspaceUnavailable } from "./get-workspace-access.ts";

export const EndWorkspaceMembershipInput = Schema.Struct({
  actorId: UserId,
  workspaceId: WorkspaceId,
});
export interface EndWorkspaceMembershipInput extends Schema.Schema.Type<
  typeof EndWorkspaceMembershipInput
> {}

export class LastWorkspaceOwner extends Schema.TaggedErrorClass<LastWorkspaceOwner>()(
  "Application.LastWorkspaceOwner",
  { workspaceId: WorkspaceId },
) {}

export const endWorkspaceMembership = Effect.fn("Application.endWorkspaceMembership")(function* (
  input: EndWorkspaceMembershipInput,
) {
  const auditEvents = yield* AuditEventWriter;
  const transactions = yield* TransactionManager;
  const workspaces = yield* WorkspaceAccessRepository;

  return yield* transactions.run(
    Effect.gen(function* () {
      const access = yield* workspaces.findForAccount(input.actorId, input.workspaceId);

      if (Option.isNone(access)) {
        return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId: input.workspaceId }));
      }

      const now = yield* Clock.currentTimeMillis;
      const endedAt = new Date(now);
      const result = yield* workspaces.endMembership(input.actorId, input.workspaceId, endedAt);

      if (result === "not-found") {
        return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId: input.workspaceId }));
      }

      if (result === "last-owner") {
        return yield* Effect.fail(new LastWorkspaceOwner({ workspaceId: input.workspaceId }));
      }

      yield* auditEvents.append(
        AuditEvent.cases["workspace.membership_ended"].make({
          actorId: input.actorId,
          occurredAt: endedAt,
          version: 1,
          metadata: {
            workspaceId: input.workspaceId,
            workspaceIdentityId: access.value.identity.id,
          },
        }),
      );
    }),
  );
});
