import { expect, layer } from "@effect/vitest";
import {
  AcceptWorkspaceInvitationCommand,
  ChangeWorkspaceRoleCommand,
  CreateWorkspaceCommand,
  GetChannelForActorInput,
  InviteWorkspaceMemberCommand,
  LastWorkspaceOwner,
  LeaveWorkspaceCommand,
  RemoveFullMemberCommand,
  ResendWorkspaceInvitationCommand,
  RevokeWorkspaceInvitationCommand,
  UpdateWorkspaceIdentityCommand,
  WorkspaceAccess,
  WorkspaceAccessFailure,
  WorkspaceInvitationUnavailable,
  WorkspaceUnavailable,
  getChannelForActor,
} from "@cove/application";
import {
  EmailAddress,
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  WorkspaceName,
  makeChannelId,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { Effect, Fiber, Schedule } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/database.ts";

layer(TestPostgres, { timeout: "2 minutes" })("Workspace Access lifecycle", (it) => {
  it.effect("creates a workspace with an initial owner membership", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`workspace-create-account-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'Workspace Creator')
      `;

      const created = yield* workspaces.create(
        CreateWorkspaceCommand.make({
          actorAccountId: accountId,
          workspaceName: WorkspaceName.make("Product Studio"),
          initialIdentityProfile: {
            name: WorkspaceIdentityName.make("Alice Product"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
          },
        }),
      );
      const found = yield* workspaces.getForActor(accountId, created.workspaceId);
      const auditEvents = yield* sql<{
        eventType: string;
        occurredAt: Date;
        metadata: unknown;
      }>`
        SELECT
          event_type AS "eventType",
          occurred_at AS "occurredAt",
          metadata
        FROM audit_events
        WHERE actor_user_id = ${accountId}
          AND event_type = 'workspace.created'
          AND metadata ->> 'workspaceId' = ${created.workspaceId}
      `;

      expect(found.membership.role).toBe("owner");
      expect(auditEvents).toEqual([
        {
          eventType: "workspace.created",
          occurredAt: created.occurredAt,
          metadata: {
            workspaceId: created.workspaceId,
            workspaceIdentityId: created.workspaceIdentityId,
          },
        },
      ]);
    }),
  );

  it.effect("updates the actor's active workspace identity", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`workspace-update-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`workspace-update-${suffix}`);
      const identityId = yield* makeWorkspaceIdentityId(`workspace-update-identity-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'Workspace Editor')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Editorial Team')
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
          ${identityId},
          ${workspaceId},
          ${accountId},
          'Alice Before',
          '/avatars/before.svg',
          'member'
        )
      `;

      const updated = yield* workspaces.updateMyIdentity(
        UpdateWorkspaceIdentityCommand.make({
          actorAccountId: accountId,
          workspaceId,
          profile: {
            name: WorkspaceIdentityName.make("Alice After"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/after.svg"),
          },
        }),
      );
      const auditEvents = yield* sql<{ metadata: unknown }>`
        SELECT metadata
        FROM audit_events
        WHERE actor_user_id = ${accountId}
          AND event_type = 'workspace.identity_profile_changed'
          AND metadata ->> 'workspaceId' = ${workspaceId}
      `;
      const access = yield* workspaces.getForActor(accountId, workspaceId);

      expect(updated._tag).toBe("WorkspaceIdentityUpdated");
      expect(access.identity).toMatchObject({
        id: identityId,
        name: "Alice After",
        avatarUrl: "/avatars/after.svg",
      });
      expect(auditEvents).toEqual([
        {
          metadata: {
            workspaceId,
            workspaceIdentityId: identityId,
            changedFields: ["name", "avatarUrl"],
          },
        },
      ]);
    }),
  );

  it.effect("ends access while preserving the identity for reactivation", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`workspace-leave-account-${suffix}`);
      const ownerId = yield* makeUserId(`workspace-leave-owner-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`workspace-leave-${suffix}`);
      const identityId = yield* makeWorkspaceIdentityId(`workspace-leave-identity-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(
        `workspace-leave-owner-identity-${suffix}`,
      );
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${accountId}, ${`${accountId}@example.test`}, 'Workspace Leaver'),
          (${ownerId}, ${`${ownerId}@example.test`}, 'Workspace Owner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Persistent Identity Team')
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
        VALUES
          (
            ${identityId},
            ${workspaceId},
            ${accountId},
            'Alice Persistent',
            '/avatars/persistent.svg',
            'member'
          ),
          (
            ${ownerIdentityId},
            ${workspaceId},
            ${ownerId},
            'Olivia Owner',
            '/avatars/owner.svg',
            'owner'
          )
      `;

      const ended = yield* workspaces.leave(
        LeaveWorkspaceCommand.make({
          actorAccountId: accountId,
          workspaceId,
        }),
      );
      const unavailable = yield* workspaces.getForActor(accountId, workspaceId).pipe(Effect.flip);
      const invitation = yield* workspaces.inviteMember(
        InviteWorkspaceMemberCommand.make({
          actorAccountId: ownerId,
          workspaceId,
          inviteeEmail: EmailAddress.make(`${accountId}@example.test`),
        }),
      );
      const reactivated = yield* workspaces.acceptInvitation(
        AcceptWorkspaceInvitationCommand.make({
          actorAccountId: accountId,
          invitationId: invitation.invitationId,
        }),
      );
      const access = yield* workspaces.getForActor(accountId, workspaceId);
      const lifecycleAudits = yield* sql<{
        eventType: string;
        metadata: unknown;
      }>`
        SELECT event_type AS "eventType", metadata
        FROM audit_events
        WHERE metadata ->> 'workspaceId' = ${workspaceId}
          AND metadata ->> 'workspaceIdentityId' = ${identityId}
      `;

      expect(ended.workspaceIdentityId).toBe(identityId);
      expect(unavailable).toBeInstanceOf(WorkspaceUnavailable);
      expect(reactivated._tag).toBe("WorkspaceInvitationAccepted");
      expect(access).toMatchObject({
        identity: {
          id: identityId,
          name: "Alice Persistent",
          avatarUrl: "/avatars/persistent.svg",
        },
      });
      expect(access.membership.startedAt).toEqual(reactivated.occurredAt);
      expect(lifecycleAudits).toEqual(
        expect.arrayContaining([
          {
            eventType: "workspace.membership_ended",
            metadata: {
              workspaceId,
              workspaceIdentityId: identityId,
              reason: "voluntary_departure",
            },
          },
          {
            eventType: "workspace.invitation_accepted",
            metadata: {
              workspaceId,
              workspaceIdentityId: identityId,
              invitationId: invitation.invitationId,
            },
          },
        ]),
      );
      expect(lifecycleAudits).toHaveLength(2);
    }),
  );

  it.effect("revokes every membership-gated boundary as soon as Membership ends", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const ownerAccountId = yield* makeUserId(`boundary-owner-${suffix}`);
      const adminAccountId = yield* makeUserId(`boundary-admin-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(`boundary-owner-identity-${suffix}`);
      const adminIdentityId = yield* makeWorkspaceIdentityId(`boundary-admin-identity-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`boundary-workspace-${suffix}`);
      const channelId = yield* makeChannelId(`boundary-channel-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${ownerAccountId}, ${`${ownerAccountId}@example.test`}, 'Boundary Owner'),
          (${adminAccountId}, ${`${adminAccountId}@example.test`}, 'Boundary Admin')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Boundary Team')
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
        VALUES
          (${ownerIdentityId}, ${workspaceId}, ${ownerAccountId}, 'Boundary Owner', '/avatars/owner.svg', 'owner'),
          (${adminIdentityId}, ${workspaceId}, ${adminAccountId}, 'Boundary Admin', '/avatars/admin.svg', 'admin')
      `;
      yield* sql`
        INSERT INTO channels (id, workspace_id, name, purpose, visibility, maintainer_identity_id)
        VALUES (${channelId}, ${workspaceId}, 'boundary', 'Boundary access checks.', 'public', ${adminIdentityId})
      `;
      yield* sql`
        INSERT INTO channel_memberships (workspace_id, channel_id, identity_id)
        VALUES (${workspaceId}, ${channelId}, ${adminIdentityId})
      `;

      const invitation = yield* workspaces.inviteMember(
        InviteWorkspaceMemberCommand.make({
          actorAccountId: adminAccountId,
          workspaceId,
          inviteeEmail: EmailAddress.make(`boundary-invitee-${suffix}@example.test`),
        }),
      );
      yield* workspaces.leave(
        LeaveWorkspaceCommand.make({
          actorAccountId: adminAccountId,
          workspaceId,
        }),
      );

      const getFailure = yield* workspaces
        .getForActor(adminAccountId, workspaceId)
        .pipe(Effect.flip);
      const updateFailure = yield* workspaces
        .updateMyIdentity(
          UpdateWorkspaceIdentityCommand.make({
            actorAccountId: adminAccountId,
            workspaceId,
            profile: {
              name: WorkspaceIdentityName.make("Boundary Admin Updated"),
              avatarUrl: WorkspaceAvatarUrl.make("/avatars/admin-updated.svg"),
            },
          }),
        )
        .pipe(Effect.flip);
      const leaveFailure = yield* workspaces
        .leave(LeaveWorkspaceCommand.make({ actorAccountId: adminAccountId, workspaceId }))
        .pipe(Effect.flip);
      const invitationListFailure = yield* workspaces
        .listPendingInvitationsForAdministrator(adminAccountId, workspaceId)
        .pipe(Effect.flip);
      const memberListFailure = yield* workspaces
        .listFullMembersForActor(adminAccountId, workspaceId)
        .pipe(Effect.flip);
      const inviteFailure = yield* workspaces
        .inviteMember(
          InviteWorkspaceMemberCommand.make({
            actorAccountId: adminAccountId,
            workspaceId,
            inviteeEmail: EmailAddress.make(`boundary-second-invitee-${suffix}@example.test`),
          }),
        )
        .pipe(Effect.flip);
      const resendFailure = yield* workspaces
        .resendInvitation(
          ResendWorkspaceInvitationCommand.make({
            actorAccountId: adminAccountId,
            workspaceId,
            invitationId: invitation.invitationId,
          }),
        )
        .pipe(Effect.flip);
      const revokeFailure = yield* workspaces
        .revokeInvitation(
          RevokeWorkspaceInvitationCommand.make({
            actorAccountId: adminAccountId,
            workspaceId,
            invitationId: invitation.invitationId,
          }),
        )
        .pipe(Effect.flip);
      const roleFailure = yield* workspaces
        .changeMemberRole(
          ChangeWorkspaceRoleCommand.make({
            actorAccountId: adminAccountId,
            workspaceId,
            workspaceIdentityId: ownerIdentityId,
            role: "member",
          }),
        )
        .pipe(Effect.flip);
      const removeFailure = yield* workspaces
        .removeFullMember(
          RemoveFullMemberCommand.make({
            actorAccountId: adminAccountId,
            workspaceId,
            workspaceIdentityId: ownerIdentityId,
          }),
        )
        .pipe(Effect.flip);
      const channelFailure = yield* getChannelForActor(
        GetChannelForActorInput.make({
          actorId: adminAccountId,
          workspaceId,
          channelId,
        }),
      ).pipe(Effect.flip);
      const transferredChannel = yield* getChannelForActor(
        GetChannelForActorInput.make({
          actorId: ownerAccountId,
          workspaceId,
          channelId,
        }),
      );

      expect(yield* workspaces.listForActor(adminAccountId)).toEqual([]);
      for (const failure of [
        getFailure,
        updateFailure,
        leaveFailure,
        invitationListFailure,
        memberListFailure,
        inviteFailure,
        resendFailure,
        revokeFailure,
        roleFailure,
        removeFailure,
      ]) {
        expect(failure).toBeInstanceOf(WorkspaceUnavailable);
      }
      expect(channelFailure._tag).toBe("Application.ChannelUnavailable");
      expect(transferredChannel.maintainerIdentityId).toBe(ownerIdentityId);
    }),
  );

  it.effect("serializes concurrent acceptance of one Workspace invitation", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`concurrent-join-account-${suffix}`);
      const ownerId = yield* makeUserId(`concurrent-join-owner-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`concurrent-join-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(
        `concurrent-join-owner-identity-${suffix}`,
      );
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${accountId}, ${`${accountId}@example.test`}, 'Concurrent Joiner'),
          (${ownerId}, ${`${ownerId}@example.test`}, 'Concurrent Owner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Concurrent Join Team')
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
          ${ownerIdentityId},
          ${workspaceId},
          ${ownerId},
          'Concurrent Owner',
          '/avatars/owner.svg',
          'owner'
        )
      `;
      const invitation = yield* workspaces.inviteMember(
        InviteWorkspaceMemberCommand.make({
          actorAccountId: ownerId,
          workspaceId,
          inviteeEmail: EmailAddress.make(`${accountId}@example.test`),
        }),
      );

      const results = yield* Effect.all(
        [
          workspaces
            .acceptInvitation(
              AcceptWorkspaceInvitationCommand.make({
                actorAccountId: accountId,
                invitationId: invitation.invitationId,
                initialIdentityProfile: {
                  name: WorkspaceIdentityName.make("Concurrent A"),
                  avatarUrl: WorkspaceAvatarUrl.make("/avatars/a.svg"),
                },
              }),
            )
            .pipe(Effect.result),
          workspaces
            .acceptInvitation(
              AcceptWorkspaceInvitationCommand.make({
                actorAccountId: accountId,
                invitationId: invitation.invitationId,
                initialIdentityProfile: {
                  name: WorkspaceIdentityName.make("Concurrent B"),
                  avatarUrl: WorkspaceAvatarUrl.make("/avatars/b.svg"),
                },
              }),
            )
            .pipe(Effect.result),
        ],
        { concurrency: "unbounded" },
      );
      const successes = results.filter((result) => result._tag === "Success");
      const failures = results.filter((result) => result._tag === "Failure");

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0]?.failure).toBeInstanceOf(WorkspaceInvitationUnavailable);
    }),
  );

  it.effect("serializes concurrent owner departures so one active owner remains", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const firstOwnerId = yield* makeUserId(`concurrent-owner-a-${suffix}`);
      const secondOwnerId = yield* makeUserId(`concurrent-owner-b-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`concurrent-owners-${suffix}`);
      const firstIdentityId = yield* makeWorkspaceIdentityId(`concurrent-identity-a-${suffix}`);
      const secondIdentityId = yield* makeWorkspaceIdentityId(`concurrent-identity-b-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${firstOwnerId}, ${`${firstOwnerId}@example.test`}, 'Owner A'),
          (${secondOwnerId}, ${`${secondOwnerId}@example.test`}, 'Owner B')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Concurrent Owners')
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
        VALUES
          (${firstIdentityId}, ${workspaceId}, ${firstOwnerId}, 'Owner A', '/avatars/a.svg', 'owner'),
          (${secondIdentityId}, ${workspaceId}, ${secondOwnerId}, 'Owner B', '/avatars/b.svg', 'owner')
      `;

      const results = yield* Effect.all(
        [
          workspaces
            .leave(
              LeaveWorkspaceCommand.make({
                actorAccountId: firstOwnerId,
                workspaceId,
              }),
            )
            .pipe(Effect.result),
          workspaces
            .leave(
              LeaveWorkspaceCommand.make({
                actorAccountId: secondOwnerId,
                workspaceId,
              }),
            )
            .pipe(Effect.result),
        ],
        { concurrency: "unbounded" },
      );
      const successes = results.filter((result) => result._tag === "Success");
      const failures = results.filter((result) => result._tag === "Failure");

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0]?.failure).toBeInstanceOf(LastWorkspaceOwner);
      expect(
        (yield* workspaces.listForActor(firstOwnerId)).length +
          (yield* workspaces.listForActor(secondOwnerId)).length,
      ).toBe(1);
    }),
  );

  it.effect("serializes identity updates with membership ending", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`leave-update-account-${suffix}`);
      const ownerId = yield* makeUserId(`leave-update-owner-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`leave-update-${suffix}`);
      const identityId = yield* makeWorkspaceIdentityId(`leave-update-identity-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(
        `leave-update-owner-identity-${suffix}`,
      );
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${accountId}, ${`${accountId}@example.test`}, 'Leave Update Member'),
          (${ownerId}, ${`${ownerId}@example.test`}, 'Leave Update Owner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Leave Update Team')
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
        VALUES
          (
            ${identityId},
            ${workspaceId},
            ${accountId},
            'Leave Update Profile',
            '/avatars/leave-update.svg',
            'member'
          ),
          (
            ${ownerIdentityId},
            ${workspaceId},
            ${ownerId},
            'Leave Update Owner',
            '/avatars/leave-update-owner.svg',
            'owner'
          )
      `;
      yield* sql`
        CREATE OR REPLACE FUNCTION delay_leave_update_membership_end()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF OLD.membership_ended_at IS NULL
            AND NEW.membership_ended_at IS NOT NULL
            AND NEW.name = 'Leave Update Profile'
          THEN
            PERFORM pg_advisory_xact_lock(741852963);
          END IF;
          RETURN NEW;
        END;
        $$
      `;
      yield* sql`
        DROP TRIGGER IF EXISTS delay_leave_update_membership_end ON workspace_identities
      `;
      yield* sql`
        CREATE TRIGGER delay_leave_update_membership_end
        BEFORE UPDATE ON workspace_identities
        FOR EACH ROW
        EXECUTE FUNCTION delay_leave_update_membership_end()
      `;

      const [leaveResult, updateResult] = yield* Effect.scoped(
        Effect.gen(function* () {
          const controlConnection = yield* sql.reserve;
          yield* controlConnection.executeRaw("SELECT pg_advisory_lock(741852963)", []);

          const awaitLockWaiters = (minimum: number) =>
            sql<{ count: number }>`
              SELECT COUNT(*)::int AS count
              FROM pg_stat_activity
              WHERE datname = current_database()
                AND wait_event_type = 'Lock'
            `.pipe(
              Effect.flatMap(([row]) =>
                (row?.count ?? 0) >= minimum ? Effect.void : Effect.fail("waiting for lock"),
              ),
              Effect.retry(Schedule.recurs(1_000)),
            );

          const leaveFiber = yield* workspaces
            .leave(
              LeaveWorkspaceCommand.make({
                actorAccountId: accountId,
                workspaceId,
              }),
            )
            .pipe(Effect.result, Effect.forkScoped);
          yield* awaitLockWaiters(1);

          const updateFiber = yield* workspaces
            .updateMyIdentity(
              UpdateWorkspaceIdentityCommand.make({
                actorAccountId: accountId,
                workspaceId,
                profile: {
                  name: WorkspaceIdentityName.make("Updated After Leave"),
                  avatarUrl: WorkspaceAvatarUrl.make("/avatars/updated-after-leave.svg"),
                },
              }),
            )
            .pipe(Effect.result, Effect.forkScoped);
          yield* awaitLockWaiters(2);
          yield* controlConnection.executeRaw("SELECT pg_advisory_unlock(741852963)", []);

          return [yield* Fiber.join(leaveFiber), yield* Fiber.join(updateFiber)] as const;
        }),
      ).pipe(
        Effect.ensuring(
          sql`
            DROP TRIGGER IF EXISTS delay_leave_update_membership_end ON workspace_identities
          `.pipe(Effect.orDie),
        ),
      );
      const updateAudit = yield* sql<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE actor_user_id = ${accountId}
          AND event_type = 'workspace.identity_profile_changed'
          AND metadata ->> 'workspaceId' = ${workspaceId}
      `;

      expect(leaveResult._tag).toBe("Success");
      expect(updateResult._tag).toBe("Failure");
      if (updateResult._tag === "Failure") {
        expect(updateResult.failure).toBeInstanceOf(WorkspaceUnavailable);
      }
      expect(updateAudit).toEqual([{ count: 0 }]);
    }),
  );

  it.effect("returns an authorized identity-profile no-op without audit", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`profile-noop-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`profile-noop-${suffix}`);
      const identityId = yield* makeWorkspaceIdentityId(`profile-noop-identity-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'No-op Editor')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'No-op Team')
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
          ${identityId},
          ${workspaceId},
          ${accountId},
          'Stable Profile',
          '/avatars/stable.svg',
          'member'
        )
      `;

      const noOpCommand = UpdateWorkspaceIdentityCommand.make({
        actorAccountId: accountId,
        workspaceId,
        profile: {
          name: WorkspaceIdentityName.make("Stable Profile"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/stable.svg"),
        },
      });
      const noOp = yield* workspaces.updateMyIdentity(noOpCommand);
      const current = yield* workspaces.getForActor(accountId, workspaceId);
      const noOpAuditCounts = yield* sql<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE actor_user_id = ${accountId}
          AND event_type = 'workspace.identity_profile_changed'
          AND metadata ->> 'workspaceId' = ${workspaceId}
      `;

      expect(noOp._tag).toBe("IdentityProfileUnchanged");
      expect(current.identity).toMatchObject({
        name: "Stable Profile",
        avatarUrl: "/avatars/stable.svg",
      });
      expect(noOpAuditCounts).toEqual([{ count: 0 }]);
    }),
  );

  it.effect("does not treat an inactive matching identity profile as an authorized no-op", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`inactive-profile-account-${suffix}`);
      const ownerId = yield* makeUserId(`inactive-profile-owner-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`inactive-profile-${suffix}`);
      const identityId = yield* makeWorkspaceIdentityId(`inactive-profile-identity-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(
        `inactive-profile-owner-identity-${suffix}`,
      );
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const updateCommand = UpdateWorkspaceIdentityCommand.make({
        actorAccountId: accountId,
        workspaceId,
        profile: {
          name: WorkspaceIdentityName.make("Inactive Profile"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/inactive.svg"),
        },
      });

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${accountId}, ${`${accountId}@example.test`}, 'Inactive Editor'),
          (${ownerId}, ${`${ownerId}@example.test`}, 'Inactive Profile Owner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Inactive Profile Team')
      `;
      yield* sql`
        INSERT INTO workspace_identities (
          id,
          workspace_id,
          account_id,
          name,
          avatar_url,
          role,
          membership_ended_at
        )
        VALUES
          (
            ${identityId},
            ${workspaceId},
            ${accountId},
            'Inactive Profile',
            '/avatars/inactive.svg',
            'member',
            '2026-07-17T12:00:00Z'
          ),
          (
            ${ownerIdentityId},
            ${workspaceId},
            ${ownerId},
            'Inactive Profile Owner',
            '/avatars/owner.svg',
            'owner',
            NULL
          )
      `;

      const inactiveFailure = yield* workspaces.updateMyIdentity(updateCommand).pipe(Effect.flip);
      const invitation = yield* workspaces.inviteMember(
        InviteWorkspaceMemberCommand.make({
          actorAccountId: ownerId,
          workspaceId,
          inviteeEmail: EmailAddress.make(`${accountId}@example.test`),
        }),
      );
      yield* workspaces.acceptInvitation(
        AcceptWorkspaceInvitationCommand.make({
          actorAccountId: accountId,
          invitationId: invitation.invitationId,
        }),
      );
      const activeNoOp = yield* workspaces.updateMyIdentity(updateCommand);

      expect(inactiveFailure).toBeInstanceOf(WorkspaceUnavailable);
      expect(activeNoOp._tag).toBe("IdentityProfileUnchanged");
    }),
  );

  it.effect("revokes explicit channel memberships and does not restore them on rejoin", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`channel-revoke-account-${suffix}`);
      const ownerId = yield* makeUserId(`channel-revoke-owner-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`channel-revoke-${suffix}`);
      const identityId = yield* makeWorkspaceIdentityId(`channel-revoke-identity-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(
        `channel-revoke-owner-identity-${suffix}`,
      );
      const publicChannelId = yield* makeChannelId(`channel-revoke-public-${suffix}`);
      const privateChannelId = yield* makeChannelId(`channel-revoke-private-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${accountId}, ${`${accountId}@example.test`}, 'Channel Member'),
          (${ownerId}, ${`${ownerId}@example.test`}, 'Channel Owner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Channel Revocation Team')
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
        VALUES
          (${identityId}, ${workspaceId}, ${accountId}, 'Channel Member', '/avatars/member.svg', 'member'),
          (${ownerIdentityId}, ${workspaceId}, ${ownerId}, 'Channel Owner', '/avatars/owner.svg', 'owner')
      `;
      yield* sql`
        INSERT INTO channels (id, workspace_id, name, purpose, visibility, maintainer_identity_id)
        VALUES
          (${publicChannelId}, ${workspaceId}, 'general', 'General coordination.', 'public', ${ownerIdentityId}),
          (${privateChannelId}, ${workspaceId}, 'leadership', 'Leadership coordination.', 'private', ${ownerIdentityId})
      `;
      yield* sql`
        INSERT INTO channel_memberships (workspace_id, channel_id, identity_id)
        VALUES
          (${workspaceId}, ${publicChannelId}, ${identityId}),
          (${workspaceId}, ${privateChannelId}, ${identityId})
      `;

      yield* workspaces.leave(
        LeaveWorkspaceCommand.make({
          actorAccountId: accountId,
          workspaceId,
        }),
      );
      const invitation = yield* workspaces.inviteMember(
        InviteWorkspaceMemberCommand.make({
          actorAccountId: ownerId,
          workspaceId,
          inviteeEmail: EmailAddress.make(`${accountId}@example.test`),
        }),
      );
      yield* workspaces.acceptInvitation(
        AcceptWorkspaceInvitationCommand.make({
          actorAccountId: accountId,
          invitationId: invitation.invitationId,
        }),
      );

      const publicChannel = yield* getChannelForActor(
        GetChannelForActorInput.make({
          actorId: accountId,
          workspaceId,
          channelId: publicChannelId,
        }),
      );
      const privateFailure = yield* getChannelForActor(
        GetChannelForActorInput.make({
          actorId: accountId,
          workspaceId,
          channelId: privateChannelId,
        }),
      ).pipe(Effect.flip);

      expect(publicChannel).toMatchObject({
        id: publicChannelId,
        workspaceId,
        name: "general",
        visibility: "public",
      });
      expect(privateFailure._tag).toBe("Application.ChannelUnavailable");
    }),
  );

  it.effect("keeps final-owner failure non-sticky", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const ownerId = yield* makeUserId(`last-owner-account-${suffix}`);
      const replacementOwnerId = yield* makeUserId(`replacement-owner-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`last-owner-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(`last-owner-identity-${suffix}`);
      const replacementIdentityId = yield* makeWorkspaceIdentityId(
        `replacement-owner-identity-${suffix}`,
      );
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${ownerId}, ${`${ownerId}@example.test`}, 'Final Owner'),
          (${replacementOwnerId}, ${`${replacementOwnerId}@example.test`}, 'Replacement Owner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Last Owner Team')
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
          ${ownerIdentityId},
          ${workspaceId},
          ${ownerId},
          'Final Owner',
          '/avatars/final-owner.svg',
          'owner'
        )
      `;
      const command = LeaveWorkspaceCommand.make({
        actorAccountId: ownerId,
        workspaceId,
      });

      const blocked = yield* workspaces.leave(command).pipe(Effect.flip);
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
          ${replacementIdentityId},
          ${workspaceId},
          ${replacementOwnerId},
          'Replacement Owner',
          '/avatars/replacement-owner.svg',
          'owner'
        )
      `;
      const ended = yield* workspaces.leave(command);

      expect(blocked).toBeInstanceOf(LastWorkspaceOwner);
      expect(ended.workspaceIdentityId).toBe(ownerIdentityId);
    }),
  );

  it.effect("rolls back lifecycle state when audit persistence fails", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`audit-failure-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`audit-failure-${suffix}`);
      const identityId = yield* makeWorkspaceIdentityId(`audit-failure-identity-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'Audit Failure Editor')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Audit Failure Team')
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
          ${identityId},
          ${workspaceId},
          ${accountId},
          'Before Audit Failure',
          '/avatars/before-audit.svg',
          'member'
        )
      `;
      yield* sql`
        CREATE OR REPLACE FUNCTION workspace_access_test_fail_audit()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $test_function$
        BEGIN
          IF NEW.metadata ->> 'workspaceId' LIKE 'audit-failure-%' THEN
            RAISE EXCEPTION 'forced workspace access audit failure';
          END IF;
          RETURN NEW;
        END;
        $test_function$
      `;
      yield* sql`
        DROP TRIGGER IF EXISTS workspace_access_test_fail_audit_trigger ON audit_events
      `;
      yield* sql`
        CREATE TRIGGER workspace_access_test_fail_audit_trigger
        BEFORE INSERT ON audit_events
        FOR EACH ROW
        EXECUTE FUNCTION workspace_access_test_fail_audit()
      `;
      const command = UpdateWorkspaceIdentityCommand.make({
        actorAccountId: accountId,
        workspaceId,
        profile: {
          name: WorkspaceIdentityName.make("After Audit Failure"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/after-audit.svg"),
        },
      });

      const failure = yield* workspaces.updateMyIdentity(command).pipe(Effect.flip);
      const afterFailure = yield* workspaces.getForActor(accountId, workspaceId);
      yield* sql`DROP TRIGGER workspace_access_test_fail_audit_trigger ON audit_events`;
      const retried = yield* workspaces.updateMyIdentity(command);

      expect(failure).toBeInstanceOf(WorkspaceAccessFailure);
      expect(afterFailure.identity).toMatchObject({
        name: "Before Audit Failure",
        avatarUrl: "/avatars/before-audit.svg",
      });
      expect(retried._tag).toBe("WorkspaceIdentityUpdated");
    }),
  );
});
