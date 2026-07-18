import { expect, layer } from "@effect/vitest";
import {
  WorkspaceAccess,
  WorkspaceAvatarUrl,
  WorkspaceIdentity,
  WorkspaceIdentityName,
  WorkspaceName,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { WorkspaceAccessRepository } from "@cove/ports";
import { Effect, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { TestPostgres } from "../support/database.ts";

layer(TestPostgres, { timeout: "2 minutes" })("workspace access with PostgreSQL", (it) => {
  it.effect("creates a workspace with its initial owner identity", () =>
    Effect.gen(function* () {
      const workspaces = yield* WorkspaceAccessRepository;
      const sql = yield* SqlClient.SqlClient;
      const accountId = yield* makeUserId("issue-4-create-account");
      const workspaceId = yield* makeWorkspaceId("issue-4-created-workspace");
      const identityId = yield* makeWorkspaceIdentityId("issue-4-created-identity");

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, 'issue-4-create@cove.local', 'Issue Four Create')
      `;

      const created = yield* workspaces.createWorkspace(
        WorkspaceAccess.make({
          workspace: { id: workspaceId, name: WorkspaceName.make("Product Studio") },
          identity: {
            id: identityId,
            workspaceId,
            accountId,
            name: WorkspaceIdentityName.make("Alice Product"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
          },
          role: "owner",
        }),
      );

      expect(created).toEqual(
        WorkspaceAccess.make({
          workspace: { id: workspaceId, name: WorkspaceName.make("Product Studio") },
          identity: {
            id: identityId,
            workspaceId,
            accountId,
            name: WorkspaceIdentityName.make("Alice Product"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
          },
          role: "owner",
        }),
      );
    }),
  );

  it.effect("joins a workspace with an editable copy of profile defaults", () =>
    Effect.gen(function* () {
      const workspaces = yield* WorkspaceAccessRepository;
      const sql = yield* SqlClient.SqlClient;
      const accountId = yield* makeUserId("issue-4-join-account");
      const existingWorkspaceId = yield* makeWorkspaceId("issue-4-existing-workspace");
      const joinedWorkspaceId = yield* makeWorkspaceId("issue-4-joined-workspace");
      const joinedIdentityId = yield* makeWorkspaceIdentityId("issue-4-joined-identity");

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, 'issue-4-join@cove.local', 'Issue Four Join')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES
          (${existingWorkspaceId}, 'Existing Team'),
          (${joinedWorkspaceId}, 'Design Guild')
      `;
      yield* sql`
        INSERT INTO workspace_identities (id, workspace_id, account_id, name, avatar_url, role)
        VALUES (
          'issue-4-existing-identity',
          ${existingWorkspaceId},
          ${accountId},
          'Alice Product',
          '/avatars/alice.svg',
          'owner'
        )
      `;

      const joined = Option.getOrThrow(
        yield* workspaces.joinWorkspace(
          WorkspaceIdentity.make({
            id: joinedIdentityId,
            workspaceId: joinedWorkspaceId,
            accountId,
            name: WorkspaceIdentityName.make("Alice Design"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
          }),
        ),
      );

      expect(joined).toMatchObject({
        workspace: { id: "issue-4-joined-workspace", name: "Design Guild" },
        identity: { name: "Alice Design", avatarUrl: "/avatars/alice.svg" },
        role: "member",
      });
    }),
  );

  it.effect("updates one workspace identity without changing another", () =>
    Effect.gen(function* () {
      const workspaces = yield* WorkspaceAccessRepository;
      const sql = yield* SqlClient.SqlClient;
      const accountId = yield* makeUserId("issue-4-edit-account");
      const firstWorkspaceId = yield* makeWorkspaceId("issue-4-first-workspace");
      const secondWorkspaceId = yield* makeWorkspaceId("issue-4-second-workspace");

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, 'issue-4-edit@cove.local', 'Issue Four Edit')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES
          (${firstWorkspaceId}, 'Alpha Team'),
          (${secondWorkspaceId}, 'Beta Team')
      `;
      yield* sql`
        INSERT INTO workspace_identities (id, workspace_id, account_id, name, avatar_url, role)
        VALUES
          ('issue-4-first-identity', ${firstWorkspaceId}, ${accountId}, 'Alice', '/avatars/alice.svg', 'owner'),
          ('issue-4-second-identity', ${secondWorkspaceId}, ${accountId}, 'Alice', '/avatars/alice.svg', 'member')
      `;

      const edited = Option.getOrThrow(
        yield* workspaces.updateIdentity(accountId, secondWorkspaceId, {
          name: WorkspaceIdentityName.make("Alice Guild"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/default.svg"),
        }),
      );

      expect(yield* workspaces.listForAccount(accountId)).toEqual([
        WorkspaceAccess.make({
          workspace: { id: firstWorkspaceId, name: WorkspaceName.make("Alpha Team") },
          identity: {
            id: yield* makeWorkspaceIdentityId("issue-4-first-identity"),
            workspaceId: firstWorkspaceId,
            accountId,
            name: WorkspaceIdentityName.make("Alice"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
          },
          role: "owner",
        }),
        edited,
      ]);
    }),
  );

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
