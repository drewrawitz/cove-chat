import { expect, it } from "@effect/vitest";
import {
  WorkspaceAccess,
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  WorkspaceName,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import {
  AuditEventWriter,
  TransactionManager,
  WorkspaceAccessRepository,
  type AuditEvent,
} from "@cove/ports";
import { Effect, Layer, Option, Ref } from "effect";
import { TestClock } from "effect/testing";
import {
  EndWorkspaceMembershipInput,
  GetWorkspaceAccessInput,
  LastWorkspaceOwner,
  WorkspaceUnavailable,
  endWorkspaceMembership,
  getWorkspaceAccess,
} from "../../src/index.ts";

const makeFixture = (role: "member" | "owner" = "member", canEnd = true) =>
  Effect.gen(function* () {
    const accountId = yield* makeUserId("account-1");
    const workspaceId = yield* makeWorkspaceId("workspace-1");
    const identityId = yield* makeWorkspaceIdentityId("identity-1");
    const access = WorkspaceAccess.make({
      workspace: { id: workspaceId, name: WorkspaceName.make("Cove Team") },
      identity: {
        id: identityId,
        workspaceId,
        accountId,
        name: WorkspaceIdentityName.make("Workspace Alice"),
        avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
      },
      role,
    });
    const active = yield* Ref.make(true);
    const auditEvents = yield* Ref.make<ReadonlyArray<AuditEvent>>([]);
    const findForAccountCalls = yield* Ref.make<
      ReadonlyArray<{
        readonly accountId: typeof accountId;
        readonly workspaceId: typeof workspaceId;
      }>
    >([]);
    const endMembershipCalls = yield* Ref.make<
      ReadonlyArray<{
        readonly accountId: typeof accountId;
        readonly workspaceId: typeof workspaceId;
        readonly endedAt: Date;
      }>
    >([]);

    const workspaces = Layer.mock(WorkspaceAccessRepository, {
      listForAccount: Effect.fn("WorkspaceAccessRepository.Test.listForAccount")(() =>
        Ref.get(active).pipe(Effect.map((isActive) => (isActive ? [access] : []))),
      ),
      findForAccount: Effect.fn("WorkspaceAccessRepository.Test.findForAccount")(
        function* (receivedAccountId, receivedWorkspaceId) {
          yield* Ref.update(findForAccountCalls, (calls) => [
            ...calls,
            { accountId: receivedAccountId, workspaceId: receivedWorkspaceId },
          ]);
          return (yield* Ref.get(active)) ? Option.some(access) : Option.none();
        },
      ),
      findIdentityForAccount: Effect.fn("WorkspaceAccessRepository.Test.findIdentityForAccount")(
        () => Effect.succeed(Option.some(access.identity)),
      ),
      endMembership: Effect.fn("WorkspaceAccessRepository.Test.endMembership")(
        function* (receivedAccountId, receivedWorkspaceId, endedAt) {
          yield* Ref.update(endMembershipCalls, (calls) => [
            ...calls,
            { accountId: receivedAccountId, workspaceId: receivedWorkspaceId, endedAt },
          ]);
          if (!canEnd) return "last-owner" as const;
          const wasActive = yield* Ref.getAndSet(active, false);
          return wasActive ? ("ended" as const) : ("not-found" as const);
        },
      ),
    });
    const audits = AuditEventWriter.of({
      append: Effect.fn("AuditEventWriter.Test.append")((event) =>
        Ref.update(auditEvents, (events) => [...events, event]),
      ),
    });
    const transactions = TransactionManager.of({ run: (effect) => effect });

    return {
      access,
      accountId,
      workspaceId,
      auditEvents,
      findForAccountCalls,
      endMembershipCalls,
      layer: Layer.mergeAll(
        workspaces,
        Layer.succeed(AuditEventWriter, audits),
        Layer.succeed(TransactionManager, transactions),
      ),
    };
  });

it.effect("ends workspace access while preserving identity and recording the change", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture();
    const now = new Date("2026-07-18T12:00:00Z");

    yield* Effect.gen(function* () {
      yield* TestClock.setTime(now.getTime());
      yield* endWorkspaceMembership(
        EndWorkspaceMembershipInput.make({
          actorId: fixture.accountId,
          workspaceId: fixture.workspaceId,
        }),
      );

      expect(yield* Ref.get(fixture.findForAccountCalls)).toEqual([
        { accountId: fixture.accountId, workspaceId: fixture.workspaceId },
      ]);
      expect(yield* Ref.get(fixture.endMembershipCalls)).toEqual([
        { accountId: fixture.accountId, workspaceId: fixture.workspaceId, endedAt: now },
      ]);

      const error = yield* getWorkspaceAccess(
        GetWorkspaceAccessInput.make({
          actorId: fixture.accountId,
          workspaceId: fixture.workspaceId,
        }),
      ).pipe(Effect.flip);
      expect(error).toBeInstanceOf(WorkspaceUnavailable);
      expect(yield* Ref.get(fixture.auditEvents)).toEqual([
        {
          type: "workspace.membership_ended",
          version: 1,
          actorId: fixture.accountId,
          occurredAt: now,
          metadata: {
            workspaceId: fixture.workspaceId,
            workspaceIdentityId: fixture.access.identity.id,
          },
        },
      ]);
    }).pipe(Effect.provide(fixture.layer));
  }),
);

it.effect("refuses to end the final owner's membership", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture("owner", false);

    const error = yield* endWorkspaceMembership(
      EndWorkspaceMembershipInput.make({
        actorId: fixture.accountId,
        workspaceId: fixture.workspaceId,
      }),
    ).pipe(Effect.provide(fixture.layer), Effect.flip);

    expect(error).toBeInstanceOf(LastWorkspaceOwner);
  }),
);
