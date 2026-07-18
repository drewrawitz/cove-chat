import { expect, layer } from "@effect/vitest";
import { makeUserId, makeWorkspaceId } from "@cove/domain";
import { WorkspaceAccessRepository } from "@cove/ports";
import { Effect, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { TestPostgres } from "../support/database.ts";

layer(TestPostgres, { timeout: "2 minutes" })("workspace access with PostgreSQL", (it) => {
  it.effect("ends access without deleting the workspace identity", () =>
    Effect.gen(function* () {
      const workspaces = yield* WorkspaceAccessRepository;
      const accountId = yield* makeUserId("demo-alice");
      const workspaceId = yield* makeWorkspaceId("demo-workspace");

      const listedAccess = yield* workspaces.listForAccount(accountId);
      const accessBeforeLeaving = yield* workspaces.findForAccount(accountId, workspaceId);
      const identityBeforeLeaving = yield* workspaces.findIdentityForAccount(
        accountId,
        workspaceId,
      );

      expect(Option.getOrThrow(accessBeforeLeaving).identity).toEqual(
        Option.getOrThrow(identityBeforeLeaving),
      );
      expect(listedAccess).toEqual([Option.getOrThrow(accessBeforeLeaving)]);

      expect(
        yield* workspaces.endMembership(accountId, workspaceId, new Date("2026-07-18T12:00:00Z")),
      ).toBe("ended");

      expect(Option.isNone(yield* workspaces.findForAccount(accountId, workspaceId))).toBe(true);
      expect(yield* workspaces.findIdentityForAccount(accountId, workspaceId)).toEqual(
        identityBeforeLeaving,
      );
    }),
  );

  it.effect("serializes concurrent owner departures so one owner remains", () =>
    Effect.gen(function* () {
      const workspaces = yield* WorkspaceAccessRepository;
      const sql = yield* SqlClient.SqlClient;
      const aliceId = yield* makeUserId("demo-alice");
      const bobId = yield* makeUserId("demo-bob");
      const workspaceId = yield* makeWorkspaceId("demo-workspace");

      yield* sql`
        UPDATE workspace_identities
        SET role = 'owner', membership_ended_at = NULL
        WHERE workspace_id = ${workspaceId}
      `;

      const results = yield* Effect.all(
        [
          workspaces.endMembership(aliceId, workspaceId, new Date("2026-07-18T12:00:00Z")),
          workspaces.endMembership(bobId, workspaceId, new Date("2026-07-18T12:00:00Z")),
        ],
        { concurrency: "unbounded" },
      );
      const remainingAccess = yield* Effect.all([
        workspaces.findForAccount(aliceId, workspaceId),
        workspaces.findForAccount(bobId, workspaceId),
      ]);
      const activeOwners = remainingAccess.filter(
        (access) => Option.isSome(access) && access.value.role === "owner",
      );

      expect([...results].sort()).toEqual(["ended", "last-owner"]);
      expect(activeOwners).toHaveLength(1);
    }),
  );
});
