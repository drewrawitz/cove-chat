import { expect, layer } from "@effect/vitest";
import {
  ChannelAccess,
  CreatePublicChannelCommand,
  CreateWorkspaceCommand,
  WorkspaceAccess,
} from "@cove/application";
import {
  ChannelName,
  ChannelPurpose,
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  WorkspaceName,
  makeChannelId,
  makeUserId,
} from "@cove/domain";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/database.ts";

layer(TestPostgres, { timeout: "2 minutes" })("Public Channel access", (it) => {
  it.effect("makes the creator the initial Channel Maintainer", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`channel-creator-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const channels = yield* ChannelAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'Channel Creator')
      `;

      const workspace = yield* workspaces.create(
        CreateWorkspaceCommand.make({
          actorAccountId: accountId,
          workspaceName: WorkspaceName.make("Product Studio"),
          initialIdentityProfile: {
            name: WorkspaceIdentityName.make("Alice Product"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
          },
        }),
      );
      const created = yield* channels.createPublic(
        CreatePublicChannelCommand.make({
          actorAccountId: accountId,
          workspaceId: workspace.workspaceId,
          channelId: yield* makeChannelId(`product-lab-${suffix}`),
          name: ChannelName.make("product-lab"),
          purpose: ChannelPurpose.make("Explore and maintain product experiments."),
        }),
      );

      expect(created.maintainer).toMatchObject({
        id: workspace.workspaceIdentityId,
        name: "Alice Product",
        avatarUrl: "/avatars/alice.svg",
      });
      expect(created.hasChannelMembership).toBe(true);

      const memberships = yield* sql<{ identityId: string }>`
        SELECT identity_id AS "identityId"
        FROM channel_memberships
        WHERE workspace_id = ${workspace.workspaceId}
          AND channel_id = ${created.channel.id}
      `;
      expect(memberships).toEqual([{ identityId: workspace.workspaceIdentityId }]);
    }),
  );
});
