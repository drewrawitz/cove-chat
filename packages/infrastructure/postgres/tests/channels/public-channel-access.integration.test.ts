import { expect, layer } from "@effect/vitest";
import {
  AddChannelMemberCommand,
  ChannelAccess,
  CreatePublicChannelCommand,
  CreateWorkspaceCommand,
  LeaveChannelCommand,
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
  makeWorkspaceIdentityId,
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

      yield* channels.leave(
        LeaveChannelCommand.make({
          actorAccountId: accountId,
          workspaceId: workspace.workspaceId,
          channelId: created.channel.id,
        }),
      );
      const afterLeaving = yield* channels.getForActor(
        accountId,
        workspace.workspaceId,
        created.channel.id,
      );
      const membershipsAfterLeaving = yield* sql<{ identityId: string }>`
        SELECT identity_id AS "identityId"
        FROM channel_memberships
        WHERE workspace_id = ${workspace.workspaceId}
          AND channel_id = ${created.channel.id}
      `;
      const leaveAuditEvents = yield* sql<{ metadata: unknown }>`
        SELECT metadata
        FROM audit_events
        WHERE actor_user_id = ${accountId}
          AND event_type = 'channel.public_membership_removed'
      `;

      expect(afterLeaving.hasChannelMembership).toBe(false);
      expect(membershipsAfterLeaving).toEqual([]);
      expect(leaveAuditEvents).toEqual([
        {
          metadata: {
            workspaceId: workspace.workspaceId,
            channelId: created.channel.id,
            workspaceIdentityId: workspace.workspaceIdentityId,
          },
        },
      ]);
    }),
  );

  it.effect("lets a Public Channel Maintainer add a Guest as a Channel Member", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const maintainerAccountId = yield* makeUserId(`public-maintainer-${suffix}`);
      const guestAccountId = yield* makeUserId(`public-guest-${suffix}`);
      const guestIdentityId = yield* makeWorkspaceIdentityId(`public-guest-${suffix}`);
      const channelId = yield* makeChannelId(`public-guests-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const channels = yield* ChannelAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${maintainerAccountId}, ${`${maintainerAccountId}@example.test`}, 'Channel Maintainer'),
          (${guestAccountId}, ${`${guestAccountId}@example.test`}, 'Channel Guest')
      `;
      const workspace = yield* workspaces.create(
        CreateWorkspaceCommand.make({
          actorAccountId: maintainerAccountId,
          workspaceName: WorkspaceName.make("Guest Access Test"),
          initialIdentityProfile: {
            name: WorkspaceIdentityName.make("Channel Maintainer"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/maintainer.svg"),
          },
        }),
      );
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
          ${guestIdentityId},
          ${workspace.workspaceId},
          ${guestAccountId},
          'Channel Guest',
          '/avatars/guest.svg',
          'guest'
        )
      `;
      yield* channels.createPublic(
        CreatePublicChannelCommand.make({
          actorAccountId: maintainerAccountId,
          workspaceId: workspace.workspaceId,
          channelId,
          name: ChannelName.make("public-guests"),
          purpose: ChannelPurpose.make("Collaborate with explicitly added guests."),
        }),
      );

      const candidates = yield* channels.listMemberCandidatesForActor(
        maintainerAccountId,
        workspace.workspaceId,
        channelId,
      );
      expect(candidates.map((candidate) => candidate.id)).toContain(guestIdentityId);

      const updated = yield* channels.addMember(
        AddChannelMemberCommand.make({
          actorAccountId: maintainerAccountId,
          workspaceId: workspace.workspaceId,
          channelId,
          workspaceIdentityId: guestIdentityId,
        }),
      );
      const guestView = yield* channels.getForActor(
        guestAccountId,
        workspace.workspaceId,
        channelId,
      );
      const guestMembershipRoster = yield* channels.getMembershipRosterForActor(
        guestAccountId,
        workspace.workspaceId,
        channelId,
      );

      expect(updated.members.map((member) => member.id)).toEqual([
        workspace.workspaceIdentityId,
        guestIdentityId,
      ]);
      expect(guestView).toMatchObject({
        channel: { id: channelId, visibility: "public" },
        hasChannelMembership: true,
      });
      expect(guestMembershipRoster.members.map((member) => member.id)).toEqual([
        workspace.workspaceIdentityId,
        guestIdentityId,
      ]);
      const auditEvents = yield* sql<{ metadata: unknown }>`
        SELECT metadata
        FROM audit_events
        WHERE actor_user_id = ${maintainerAccountId}
          AND event_type = 'channel.public_membership_added'
      `;
      expect(auditEvents).toEqual([
        {
          metadata: {
            workspaceId: workspace.workspaceId,
            channelId,
            workspaceIdentityId: guestIdentityId,
          },
        },
      ]);
    }),
  );
});
