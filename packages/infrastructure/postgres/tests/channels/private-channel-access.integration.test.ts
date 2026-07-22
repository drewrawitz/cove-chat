import { expect, layer } from "@effect/vitest";
import {
  AddPrivateChannelMemberCommand,
  ChannelAccess,
  CreatePrivateChannelCommand,
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
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/database.ts";

layer(TestPostgres, { timeout: "2 minutes" })("Private Channel access", (it) => {
  it.effect("creates a Private Channel with an explicit creator membership", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`private-channel-creator-${suffix}`);
      const channelId = yield* makeChannelId(`strategy-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const channels = yield* ChannelAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'Private Channel Creator')
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
      const created = yield* channels.createPrivate(
        CreatePrivateChannelCommand.make({
          actorAccountId: accountId,
          workspaceId: workspace.workspaceId,
          channelId,
          name: ChannelName.make("strategy"),
          purpose: ChannelPurpose.make("Plan sensitive product strategy."),
        }),
      );
      const joinedPrivateChannels = yield* channels.listPrivateForActor(
        accountId,
        workspace.workspaceId,
      );

      expect(created).toMatchObject({
        channel: {
          id: channelId,
          visibility: "private",
          maintainerIdentityId: workspace.workspaceIdentityId,
        },
        maintainer: {
          id: workspace.workspaceIdentityId,
          name: "Alice Product",
        },
        hasChannelMembership: true,
      });
      expect(joinedPrivateChannels).toMatchObject([
        {
          channel: { id: channelId, visibility: "private" },
          hasChannelMembership: true,
        },
      ]);

      const memberships = yield* sql<{ identityId: string }>`
        SELECT identity_id AS "identityId"
        FROM channel_memberships
        WHERE workspace_id = ${workspace.workspaceId}
          AND channel_id = ${channelId}
      `;
      expect(memberships).toEqual([{ identityId: workspace.workspaceIdentityId }]);
      const auditEvents = yield* sql<{ eventType: string; metadata: unknown }>`
        SELECT event_type AS "eventType", metadata
        FROM audit_events
        WHERE actor_user_id = ${accountId}
          AND event_type = 'channel.private_membership_added'
      `;
      expect(auditEvents).toEqual([
        {
          eventType: "channel.private_membership_added",
          metadata: {
            workspaceId: workspace.workspaceId,
            channelId,
            workspaceIdentityId: workspace.workspaceIdentityId,
          },
        },
      ]);
    }),
  );

  it.effect("returns Private Channel content only to explicit Channel Members", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const creatorAccountId = yield* makeUserId(`private-channel-member-${suffix}`);
      const nonmemberAccountId = yield* makeUserId(`private-channel-nonmember-${suffix}`);
      const nonmemberIdentityId = yield* makeWorkspaceIdentityId(`nonmember-${suffix}`);
      const channelId = yield* makeChannelId(`leadership-${suffix}`);
      const missingChannelId = yield* makeChannelId(`missing-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const channels = yield* ChannelAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${creatorAccountId}, ${`${creatorAccountId}@example.test`}, 'Private Member'),
          (${nonmemberAccountId}, ${`${nonmemberAccountId}@example.test`}, 'Workspace Member')
      `;
      const workspace = yield* workspaces.create(
        CreateWorkspaceCommand.make({
          actorAccountId: creatorAccountId,
          workspaceName: WorkspaceName.make("Access Test"),
          initialIdentityProfile: {
            name: WorkspaceIdentityName.make("Private Member"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
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
          ${nonmemberIdentityId},
          ${workspace.workspaceId},
          ${nonmemberAccountId},
          'Workspace Member',
          '/avatars/default.svg',
          'member'
        )
      `;
      yield* channels.createPrivate(
        CreatePrivateChannelCommand.make({
          actorAccountId: creatorAccountId,
          workspaceId: workspace.workspaceId,
          channelId,
          name: ChannelName.make("leadership"),
          purpose: ChannelPurpose.make("Coordinate sensitive leadership work."),
        }),
      );

      const visible = yield* channels.getForActor(
        creatorAccountId,
        workspace.workspaceId,
        channelId,
      );
      const hidden = yield* channels
        .getForActor(nonmemberAccountId, workspace.workspaceId, channelId)
        .pipe(Effect.flip);
      const missing = yield* channels
        .getForActor(nonmemberAccountId, workspace.workspaceId, missingChannelId)
        .pipe(Effect.flip);

      expect(visible.channel).toMatchObject({ id: channelId, visibility: "private" });
      expect(hidden).toMatchObject({ _tag: "Application.ChannelUnavailable" });
      expect(missing).toMatchObject({ _tag: "Application.ChannelUnavailable" });
    }),
  );

  it.effect("lets the Channel Maintainer explicitly add a Full Member", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const creatorAccountId = yield* makeUserId(`private-maintainer-${suffix}`);
      const memberAccountId = yield* makeUserId(`private-added-member-${suffix}`);
      const memberIdentityId = yield* makeWorkspaceIdentityId(`added-member-${suffix}`);
      const channelId = yield* makeChannelId(`planning-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const channels = yield* ChannelAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${creatorAccountId}, ${`${creatorAccountId}@example.test`}, 'Channel Maintainer'),
          (${memberAccountId}, ${`${memberAccountId}@example.test`}, 'Added Member')
      `;
      const workspace = yield* workspaces.create(
        CreateWorkspaceCommand.make({
          actorAccountId: creatorAccountId,
          workspaceName: WorkspaceName.make("Membership Test"),
          initialIdentityProfile: {
            name: WorkspaceIdentityName.make("Channel Maintainer"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
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
          ${memberIdentityId},
          ${workspace.workspaceId},
          ${memberAccountId},
          'Added Member',
          '/avatars/default.svg',
          'member'
        )
      `;
      yield* channels.createPrivate(
        CreatePrivateChannelCommand.make({
          actorAccountId: creatorAccountId,
          workspaceId: workspace.workspaceId,
          channelId,
          name: ChannelName.make("planning"),
          purpose: ChannelPurpose.make("Plan work with an explicit audience."),
        }),
      );

      const updated = yield* channels.addPrivateMember(
        AddPrivateChannelMemberCommand.make({
          actorAccountId: creatorAccountId,
          workspaceId: workspace.workspaceId,
          channelId,
          workspaceIdentityId: memberIdentityId,
        }),
      );
      const visible = yield* channels.getForActor(
        memberAccountId,
        workspace.workspaceId,
        channelId,
      );

      expect(updated.members.map((member) => member.id)).toEqual([
        workspace.workspaceIdentityId,
        memberIdentityId,
      ]);
      expect(visible.channel.id).toBe(channelId);
      const membershipAuditEvents = yield* sql<{ metadata: unknown }>`
        SELECT metadata
        FROM audit_events
        WHERE actor_user_id = ${creatorAccountId}
          AND event_type = 'channel.private_membership_added'
        ORDER BY occurred_at
      `;
      expect(membershipAuditEvents).toHaveLength(2);
      expect(membershipAuditEvents.map(({ metadata }) => metadata)).toEqual(
        expect.arrayContaining([
          {
            workspaceId: workspace.workspaceId,
            channelId,
            workspaceIdentityId: workspace.workspaceIdentityId,
          },
          {
            workspaceId: workspace.workspaceId,
            channelId,
            workspaceIdentityId: memberIdentityId,
          },
        ]),
      );
    }),
  );

  it.effect("separates Owner and Admin metadata access from Private Channel content access", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const ownerAccountId = yield* makeUserId(`private-owner-${suffix}`);
      const adminAccountId = yield* makeUserId(`private-admin-${suffix}`);
      const maintainerAccountId = yield* makeUserId(`private-maintainer-member-${suffix}`);
      const nonmaintainerAccountId = yield* makeUserId(`private-nonmaintainer-${suffix}`);
      const adminIdentityId = yield* makeWorkspaceIdentityId(`admin-${suffix}`);
      const maintainerIdentityId = yield* makeWorkspaceIdentityId(`maintainer-${suffix}`);
      const nonmaintainerIdentityId = yield* makeWorkspaceIdentityId(`nonmaintainer-${suffix}`);
      const channelId = yield* makeChannelId(`confidential-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const channels = yield* ChannelAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${ownerAccountId}, ${`${ownerAccountId}@example.test`}, 'Workspace Owner'),
          (${adminAccountId}, ${`${adminAccountId}@example.test`}, 'Workspace Admin'),
          (${maintainerAccountId}, ${`${maintainerAccountId}@example.test`}, 'Channel Maintainer'),
          (${nonmaintainerAccountId}, ${`${nonmaintainerAccountId}@example.test`}, 'Workspace Member')
      `;
      const workspace = yield* workspaces.create(
        CreateWorkspaceCommand.make({
          actorAccountId: ownerAccountId,
          workspaceName: WorkspaceName.make("Administration Test"),
          initialIdentityProfile: {
            name: WorkspaceIdentityName.make("Workspace Owner"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
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
        VALUES
          (
            ${adminIdentityId},
            ${workspace.workspaceId},
            ${adminAccountId},
            'Workspace Admin',
            '/avatars/default.svg',
            'admin'
          ),
          (
            ${maintainerIdentityId},
            ${workspace.workspaceId},
            ${maintainerAccountId},
            'Channel Maintainer',
            '/avatars/default.svg',
            'member'
          ),
          (
            ${nonmaintainerIdentityId},
            ${workspace.workspaceId},
            ${nonmaintainerAccountId},
            'Workspace Member',
            '/avatars/default.svg',
            'member'
          )
      `;
      yield* channels.createPrivate(
        CreatePrivateChannelCommand.make({
          actorAccountId: maintainerAccountId,
          workspaceId: workspace.workspaceId,
          channelId,
          name: ChannelName.make("confidential"),
          purpose: ChannelPurpose.make("Coordinate confidential work."),
        }),
      );
      const maintainerCandidates = yield* channels.listPrivateMemberCandidatesForActor(
        maintainerAccountId,
        workspace.workspaceId,
        channelId,
      );

      const ownerMetadata = yield* channels.listPrivateForAdministrator(
        ownerAccountId,
        workspace.workspaceId,
      );
      const adminMetadata = yield* channels.listPrivateForAdministrator(
        adminAccountId,
        workspace.workspaceId,
      );
      const ownerContent = yield* channels
        .getForActor(ownerAccountId, workspace.workspaceId, channelId)
        .pipe(Effect.flip);
      const adminContent = yield* channels
        .getForActor(adminAccountId, workspace.workspaceId, channelId)
        .pipe(Effect.flip);
      const nonmaintainerMetadata = yield* channels
        .listPrivateForAdministrator(nonmaintainerAccountId, workspace.workspaceId)
        .pipe(Effect.flip);
      const nonmaintainerMutation = yield* channels
        .addPrivateMember(
          AddPrivateChannelMemberCommand.make({
            actorAccountId: nonmaintainerAccountId,
            workspaceId: workspace.workspaceId,
            channelId,
            workspaceIdentityId: nonmaintainerIdentityId,
          }),
        )
        .pipe(Effect.flip);
      const nonmaintainerCandidates = yield* channels
        .listPrivateMemberCandidatesForActor(
          nonmaintainerAccountId,
          workspace.workspaceId,
          channelId,
        )
        .pipe(Effect.flip);
      const missingCandidateChannelId = yield* makeChannelId(`missing-candidates-${suffix}`);
      const missingCandidates = yield* channels
        .listPrivateMemberCandidatesForActor(
          nonmaintainerAccountId,
          workspace.workspaceId,
          missingCandidateChannelId,
        )
        .pipe(Effect.flip);
      const missingMutation = yield* channels
        .addPrivateMember(
          AddPrivateChannelMemberCommand.make({
            actorAccountId: nonmaintainerAccountId,
            workspaceId: workspace.workspaceId,
            channelId: yield* makeChannelId(`missing-${suffix}`),
            workspaceIdentityId: nonmaintainerIdentityId,
          }),
        )
        .pipe(Effect.flip);

      expect(ownerMetadata).toMatchObject([
        {
          channel: { id: channelId, visibility: "private" },
          actorHasChannelMembership: false,
          members: [{ id: maintainerIdentityId }],
        },
      ]);
      expect(adminMetadata).toMatchObject([
        {
          channel: { id: channelId, visibility: "private" },
          actorHasChannelMembership: false,
          members: [{ id: maintainerIdentityId }],
        },
      ]);
      expect(maintainerCandidates.map((candidate) => candidate.id)).toEqual(
        expect.arrayContaining([adminIdentityId, nonmaintainerIdentityId]),
      );
      expect(maintainerCandidates.map((candidate) => candidate.id)).not.toContain(
        maintainerIdentityId,
      );
      expect(ownerContent).toMatchObject({ _tag: "Application.ChannelUnavailable" });
      expect(adminContent).toMatchObject({ _tag: "Application.ChannelUnavailable" });
      expect(nonmaintainerMetadata).toMatchObject({
        _tag: "Application.ChannelAdministrationForbidden",
      });
      expect(nonmaintainerMutation).toMatchObject({
        _tag: "Application.ChannelUnavailable",
      });
      expect(missingMutation).toMatchObject({ _tag: "Application.ChannelUnavailable" });
      expect(nonmaintainerCandidates).toMatchObject({
        _tag: "Application.ChannelUnavailable",
      });
      expect(missingCandidates).toMatchObject({ _tag: "Application.ChannelUnavailable" });

      const participantMetadataBeforeJoin = yield* channels.getPrivateAdministrationForActor(
        maintainerAccountId,
        workspace.workspaceId,
        channelId,
      );

      yield* channels.addPrivateMember(
        AddPrivateChannelMemberCommand.make({
          actorAccountId: adminAccountId,
          workspaceId: workspace.workspaceId,
          channelId,
          workspaceIdentityId: adminIdentityId,
        }),
      );
      const participantMetadataAfterJoin = yield* channels.getPrivateAdministrationForActor(
        maintainerAccountId,
        workspace.workspaceId,
        channelId,
      );
      const joinedContent = yield* channels.getForActor(
        adminAccountId,
        workspace.workspaceId,
        channelId,
      );
      expect(participantMetadataBeforeJoin.members.map((member) => member.id)).toEqual([
        maintainerIdentityId,
      ]);
      expect(participantMetadataAfterJoin.members.map((member) => member.id)).toEqual(
        expect.arrayContaining([maintainerIdentityId, adminIdentityId]),
      );
      expect(joinedContent.hasChannelMembership).toBe(true);
    }),
  );
});
