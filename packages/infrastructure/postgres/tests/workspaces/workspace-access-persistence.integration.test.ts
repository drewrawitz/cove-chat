import { expect, layer } from "@effect/vitest";
import { WorkspaceAccessView } from "@cove/application";
import {
  WorkspaceAccessPersistence,
  WorkspaceAccessPersistenceFailure,
} from "@cove/application/workspaces/internal";
import {
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  WorkspaceMembership,
  WorkspaceName,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { PostgresWorkspaceAccessPersistence } from "../../src/workspaces/workspace-access-persistence.ts";
import { TestDatabase } from "../support/database.ts";

const TestWorkspaceAccessPersistence = PostgresWorkspaceAccessPersistence.pipe(
  Layer.provideMerge(TestDatabase),
);

layer(TestWorkspaceAccessPersistence, { timeout: "2 minutes" })(
  "Postgres Workspace Access persistence",
  (it) => {
    it.effect("rejects malformed persisted Workspace Identity rows", () =>
      Effect.gen(function* () {
        const suffix = randomUUID();
        const accountId = yield* makeUserId(`malformed-access-account-${suffix}`);
        const workspaceId = yield* makeWorkspaceId(`malformed-access-${suffix}`);
        const sql = yield* SqlClient.SqlClient;
        const persistence = yield* WorkspaceAccessPersistence;

        yield* sql`
          INSERT INTO users (id, email, display_name)
          VALUES (${accountId}, ${`${accountId}@example.test`}, 'Malformed Access')
        `;
        yield* sql`
          INSERT INTO workspaces (id, name)
          VALUES (${workspaceId}, 'Malformed Access Team')
        `;
        yield* sql`
          INSERT INTO workspace_identities (
            id,
            workspace_id,
            account_id,
            name,
            avatar_url,
            role
          )
          VALUES (
            ${`malformed-access-identity-${suffix}`},
            ${workspaceId},
            ${accountId},
            '',
            '/avatars/malformed.svg',
            'member'
          )
        `;

        const failure = yield* persistence
          .readActiveAccess(accountId, workspaceId)
          .pipe(Effect.flip);

        expect(failure).toBeInstanceOf(WorkspaceAccessPersistenceFailure);
      }),
    );

    it.effect("keeps transaction-bound mutations inside the caller transaction", () =>
      Effect.gen(function* () {
        const suffix = randomUUID();
        const accountId = yield* makeUserId(`rollback-access-account-${suffix}`);
        const workspaceId = yield* makeWorkspaceId(`rollback-access-${suffix}`);
        const identityId = yield* makeWorkspaceIdentityId(`rollback-access-identity-${suffix}`);
        const sql = yield* SqlClient.SqlClient;
        const persistence = yield* WorkspaceAccessPersistence;

        yield* sql`
          INSERT INTO users (id, email, display_name)
          VALUES (${accountId}, ${`${accountId}@example.test`}, 'Rollback Access')
        `;
        yield* sql`
          INSERT INTO workspaces (id, name)
          VALUES (${workspaceId}, 'Rollback Access Team')
        `;
        const access = WorkspaceAccessView.make({
          workspace: {
            id: workspaceId,
            name: WorkspaceName.make("Rollback Access Team"),
          },
          identity: {
            id: identityId,
            workspaceId,
            accountId,
            name: WorkspaceIdentityName.make("Rollback Identity"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/rollback.svg"),
          },
          membership: WorkspaceMembership.make({
            workspaceId,
            identityId,
            role: "member",
            startedAt: new Date("2026-07-18T12:00:00Z"),
          }),
        });

        const result = yield* persistence
          .transact((transaction) =>
            transaction
              .startFirstMembership(access)
              .pipe(Effect.andThen(Effect.fail("force rollback"))),
          )
          .pipe(Effect.result);
        const rows = yield* sql<{ count: number }>`
          SELECT COUNT(*)::int AS count
          FROM workspace_identities
          WHERE workspace_id = ${workspaceId}
            AND account_id = ${accountId}
        `;

        expect(result._tag).toBe("Failure");
        expect(rows).toEqual([{ count: 0 }]);
      }),
    );
  },
);
