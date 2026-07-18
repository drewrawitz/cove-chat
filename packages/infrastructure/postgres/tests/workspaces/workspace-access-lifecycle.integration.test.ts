import { expect, layer } from "@effect/vitest";
import {
  AlreadyWorkspaceMember,
  CommandId,
  CreateWorkspaceCommand,
  ExistingWorkspaceIdentityProfileNotAccepted,
  GetChannelForActorInput,
  InitialWorkspaceIdentityProfileRequired,
  JoinWorkspaceCommand,
  LastWorkspaceOwner,
  LeaveWorkspaceCommand,
  UpdateWorkspaceIdentityCommand,
  WorkspaceAccess,
  WorkspaceAccessCommandConflict,
  WorkspaceAccessFailure,
  WorkspaceUnavailable,
  getChannelForActor,
} from "@cove/application";
import {
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
      const commandId = CommandId.make(`create-${suffix}`);

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'Workspace Creator')
      `;

      const created = yield* workspaces.create(
        CreateWorkspaceCommand.make({
          actorAccountId: accountId,
          commandId,
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
        WHERE metadata ->> 'commandId' = ${commandId}
      `;
      const commandRecords = yield* sql<{ inputFingerprint: string; outcome: unknown }>`
        SELECT
          input_fingerprint AS "inputFingerprint",
          outcome
        FROM workspace_access_commands
        WHERE actor_user_id = ${accountId}
          AND command_id = ${commandId}
      `;

      expect(found.membership.role).toBe("owner");
      expect(auditEvents).toEqual([
        {
          eventType: "workspace.created",
          occurredAt: created.occurredAt,
          metadata: {
            commandId,
            workspaceId: created.workspaceId,
            workspaceIdentityId: created.workspaceIdentityId,
          },
        },
      ]);
      expect(commandRecords).toEqual([
        {
          inputFingerprint: expect.stringMatching(/^v1:sha256:[0-9a-f]{64}$/),
          outcome: {
            _tag: "WorkspaceCreated",
            workspaceId: created.workspaceId,
            workspaceIdentityId: created.workspaceIdentityId,
            occurredAt: created.occurredAt.toISOString(),
          },
        },
      ]);
      expect(JSON.stringify(commandRecords)).not.toContain("Alice Product");
      expect(JSON.stringify(commandRecords)).not.toContain("/avatars/alice.svg");
    }),
  );

  it.effect("starts a first membership from the supplied identity profile", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`workspace-join-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`workspace-join-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'Workspace Joiner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Design Guild')
      `;

      const joined = yield* workspaces.join(
        JoinWorkspaceCommand.make({
          actorAccountId: accountId,
          commandId: CommandId.make(`join-${suffix}`),
          workspaceId,
          initialIdentityProfile: {
            name: WorkspaceIdentityName.make("Alice Design"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
          },
        }),
      );
      const access = yield* workspaces.getForActor(accountId, workspaceId);

      expect(joined._tag).toBe("FirstMembershipStarted");
      expect(access.membership.role).toBe("member");
      expect(access.identity.id).toBe(joined.workspaceIdentityId);
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
      const commandId = CommandId.make(`update-${suffix}`);

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
          commandId,
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
        WHERE metadata ->> 'commandId' = ${commandId}
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
            commandId,
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
          commandId: CommandId.make(`leave-${suffix}`),
          workspaceId,
        }),
      );
      const unavailable = yield* workspaces.getForActor(accountId, workspaceId).pipe(Effect.flip);
      const reactivated = yield* workspaces.join(
        JoinWorkspaceCommand.make({
          actorAccountId: accountId,
          commandId: CommandId.make(`rejoin-${suffix}`),
          workspaceId,
        }),
      );

      expect(ended.workspaceIdentityId).toBe(identityId);
      expect(unavailable).toBeInstanceOf(WorkspaceUnavailable);
      expect(reactivated._tag).toBe("WorkspaceMembershipReactivated");
      expect(yield* workspaces.getForActor(accountId, workspaceId)).toMatchObject({
        identity: {
          id: identityId,
          name: "Alice Persistent",
          avatarUrl: "/avatars/persistent.svg",
        },
      });
    }),
  );

  it.effect("negotiates first membership and reactivation without sticky failures", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const firstAccountId = yield* makeUserId(`join-negotiation-first-${suffix}`);
      const returningAccountId = yield* makeUserId(`join-negotiation-returning-${suffix}`);
      const activeAccountId = yield* makeUserId(`join-negotiation-active-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`join-negotiation-${suffix}`);
      const returningIdentityId = yield* makeWorkspaceIdentityId(
        `join-negotiation-returning-identity-${suffix}`,
      );
      const activeIdentityId = yield* makeWorkspaceIdentityId(
        `join-negotiation-active-identity-${suffix}`,
      );
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${firstAccountId}, ${`${firstAccountId}@example.test`}, 'First Joiner'),
          (${returningAccountId}, ${`${returningAccountId}@example.test`}, 'Returning Joiner'),
          (${activeAccountId}, ${`${activeAccountId}@example.test`}, 'Active Joiner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Join Negotiation Team')
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
            ${returningIdentityId},
            ${workspaceId},
            ${returningAccountId},
            'Returning Profile',
            '/avatars/returning.svg',
            'member',
            '2026-07-17T12:00:00Z'
          ),
          (
            ${activeIdentityId},
            ${workspaceId},
            ${activeAccountId},
            'Active Profile',
            '/avatars/active.svg',
            'member',
            NULL
          )
      `;

      const firstCommandId = CommandId.make(`join-first-${suffix}`);
      const missingProfile = yield* workspaces
        .join(
          JoinWorkspaceCommand.make({
            actorAccountId: firstAccountId,
            commandId: firstCommandId,
            workspaceId,
          }),
        )
        .pipe(Effect.flip);
      const firstStarted = yield* workspaces.join(
        JoinWorkspaceCommand.make({
          actorAccountId: firstAccountId,
          commandId: firstCommandId,
          workspaceId,
          initialIdentityProfile: {
            name: WorkspaceIdentityName.make("First Profile"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/first.svg"),
          },
        }),
      );

      const returningCommandId = CommandId.make(`join-returning-${suffix}`);
      const suppliedExistingProfile = yield* workspaces
        .join(
          JoinWorkspaceCommand.make({
            actorAccountId: returningAccountId,
            commandId: returningCommandId,
            workspaceId,
            initialIdentityProfile: {
              name: WorkspaceIdentityName.make("Replacement Profile"),
              avatarUrl: WorkspaceAvatarUrl.make("/avatars/replacement.svg"),
            },
          }),
        )
        .pipe(Effect.flip);
      yield* workspaces.join(
        JoinWorkspaceCommand.make({
          actorAccountId: returningAccountId,
          commandId: returningCommandId,
          workspaceId,
        }),
      );

      const alreadyActive = yield* workspaces
        .join(
          JoinWorkspaceCommand.make({
            actorAccountId: activeAccountId,
            commandId: CommandId.make(`join-active-${suffix}`),
            workspaceId,
          }),
        )
        .pipe(Effect.flip);

      expect(missingProfile).toBeInstanceOf(InitialWorkspaceIdentityProfileRequired);
      expect(firstStarted._tag).toBe("FirstMembershipStarted");
      expect(suppliedExistingProfile).toBeInstanceOf(ExistingWorkspaceIdentityProfileNotAccepted);
      expect(yield* workspaces.getForActor(returningAccountId, workspaceId)).toMatchObject({
        identity: {
          id: returningIdentityId,
          name: "Returning Profile",
          avatarUrl: "/avatars/returning.svg",
        },
      });
      expect(alreadyActive).toBeInstanceOf(AlreadyWorkspaceMember);
    }),
  );

  it.effect("serializes concurrent joins for one account and workspace", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`concurrent-join-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`concurrent-join-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'Concurrent Joiner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Concurrent Join Team')
      `;

      const results = yield* Effect.all(
        [
          workspaces
            .join(
              JoinWorkspaceCommand.make({
                actorAccountId: accountId,
                commandId: CommandId.make(`concurrent-join-a-${suffix}`),
                workspaceId,
                initialIdentityProfile: {
                  name: WorkspaceIdentityName.make("Concurrent A"),
                  avatarUrl: WorkspaceAvatarUrl.make("/avatars/a.svg"),
                },
              }),
            )
            .pipe(Effect.result),
          workspaces
            .join(
              JoinWorkspaceCommand.make({
                actorAccountId: accountId,
                commandId: CommandId.make(`concurrent-join-b-${suffix}`),
                workspaceId,
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
      expect(failures[0]?.failure).toBeInstanceOf(AlreadyWorkspaceMember);
    }),
  );

  it.effect("replays concurrent duplicate commands and rejects conflicting reuse", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`command-replay-account-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const commandId = CommandId.make(`command-replay-${suffix}`);

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'Command Replayer')
      `;
      const command = CreateWorkspaceCommand.make({
        actorAccountId: accountId,
        commandId,
        workspaceName: WorkspaceName.make("Replay Team"),
        initialIdentityProfile: {
          name: WorkspaceIdentityName.make("Replay Profile"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/replay.svg"),
        },
      });

      const outcomes = yield* Effect.all([workspaces.create(command), workspaces.create(command)], {
        concurrency: "unbounded",
      });
      const conflict = yield* workspaces
        .create(
          CreateWorkspaceCommand.make({
            ...command,
            workspaceName: WorkspaceName.make("Conflicting Team"),
          }),
        )
        .pipe(Effect.flip);
      const kindConflict = yield* workspaces
        .updateMyIdentity(
          UpdateWorkspaceIdentityCommand.make({
            actorAccountId: accountId,
            commandId,
            workspaceId: outcomes[0].workspaceId,
            profile: {
              name: WorkspaceIdentityName.make("Replay Profile"),
              avatarUrl: WorkspaceAvatarUrl.make("/avatars/replay.svg"),
            },
          }),
        )
        .pipe(Effect.flip);
      const auditCounts = yield* sql<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE metadata ->> 'commandId' = ${commandId}
      `;

      expect(outcomes[0]).toEqual(outcomes[1]);
      expect(conflict).toBeInstanceOf(WorkspaceAccessCommandConflict);
      expect(kindConflict).toBeInstanceOf(WorkspaceAccessCommandConflict);
      expect(auditCounts).toEqual([{ count: 1 }]);
    }),
  );

  it.effect("scopes command identifiers to the actor account", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const firstAccountId = yield* makeUserId(`command-scope-a-${suffix}`);
      const secondAccountId = yield* makeUserId(`command-scope-b-${suffix}`);
      const commandId = CommandId.make(`shared-command-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${firstAccountId}, ${`${firstAccountId}@example.test`}, 'Command Scope A'),
          (${secondAccountId}, ${`${secondAccountId}@example.test`}, 'Command Scope B')
      `;
      const [first, second] = yield* Effect.all([
        workspaces.create(
          CreateWorkspaceCommand.make({
            actorAccountId: firstAccountId,
            commandId,
            workspaceName: WorkspaceName.make("Command Scope A"),
            initialIdentityProfile: {
              name: WorkspaceIdentityName.make("Command Scope A"),
              avatarUrl: WorkspaceAvatarUrl.make("/avatars/scope-a.svg"),
            },
          }),
        ),
        workspaces.create(
          CreateWorkspaceCommand.make({
            actorAccountId: secondAccountId,
            commandId,
            workspaceName: WorkspaceName.make("Command Scope B"),
            initialIdentityProfile: {
              name: WorkspaceIdentityName.make("Command Scope B"),
              avatarUrl: WorkspaceAvatarUrl.make("/avatars/scope-b.svg"),
            },
          }),
        ),
      ]);

      expect(first.workspaceId).not.toBe(second.workspaceId);
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
                commandId: CommandId.make(`leave-owner-a-${suffix}`),
                workspaceId,
              }),
            )
            .pipe(Effect.result),
          workspaces
            .leave(
              LeaveWorkspaceCommand.make({
                actorAccountId: secondOwnerId,
                commandId: CommandId.make(`leave-owner-b-${suffix}`),
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
      const leaveCommandId = CommandId.make(`leave-update-leave-${suffix}`);
      const updateCommandId = CommandId.make(`leave-update-update-${suffix}`);
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
                commandId: leaveCommandId,
                workspaceId,
              }),
            )
            .pipe(Effect.result, Effect.forkScoped);
          yield* awaitLockWaiters(1);

          const updateFiber = yield* workspaces
            .updateMyIdentity(
              UpdateWorkspaceIdentityCommand.make({
                actorAccountId: accountId,
                commandId: updateCommandId,
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
      );
      const updateAudit = yield* sql<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE metadata ->> 'commandId' = ${updateCommandId}
      `;
      const updateLedger = yield* sql<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM workspace_access_commands
        WHERE actor_user_id = ${accountId}
          AND command_id = ${updateCommandId}
      `;

      expect(leaveResult._tag).toBe("Success");
      expect(updateResult._tag).toBe("Failure");
      if (updateResult._tag === "Failure") {
        expect(updateResult.failure).toBeInstanceOf(WorkspaceUnavailable);
      }
      expect(updateAudit).toEqual([{ count: 0 }]);
      expect(updateLedger).toEqual([{ count: 0 }]);
    }),
  );

  it.effect("replays the pinned redacted v1 workspace-created outcome", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`compatibility-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`compatibility-workspace-${suffix}`);
      const identityId = yield* makeWorkspaceIdentityId(`compatibility-identity-${suffix}`);
      const commandId = CommandId.make(`compatibility-command-${suffix}`);
      const occurredAt = new Date("2026-07-18T12:34:56.000Z");
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'Compatibility Account')
      `;
      yield* sql`
        INSERT INTO workspace_access_commands (
          actor_user_id,
          command_id,
          command_kind,
          input_fingerprint,
          outcome_version,
          outcome,
          committed_at
        )
        VALUES (
          ${accountId},
          ${commandId},
          'create_workspace',
          'v1:sha256:bc0b1b5b317ab92b6f14491f5e926866479f12736e4c034d09bc100f76d4c785',
          1,
          ${JSON.stringify({
            _tag: "WorkspaceCreated",
            workspaceId,
            workspaceIdentityId: identityId,
            occurredAt: occurredAt.toISOString(),
          })}::jsonb,
          ${occurredAt}
        )
      `;

      const replayed = yield* workspaces.create(
        CreateWorkspaceCommand.make({
          actorAccountId: accountId,
          commandId,
          workspaceName: WorkspaceName.make("Compatibility Team"),
          initialIdentityProfile: {
            name: WorkspaceIdentityName.make("Compatibility Profile"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/compat.svg"),
          },
        }),
      );
      const createdRows = yield* sql<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM workspaces
        WHERE id = ${workspaceId}
      `;

      expect(replayed).toEqual({
        _tag: "WorkspaceCreated",
        workspaceId,
        workspaceIdentityId: identityId,
        occurredAt,
      });
      expect(createdRows).toEqual([{ count: 0 }]);
    }),
  );

  it.effect("commits and replays an authorized identity-profile no-op without audit", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`profile-noop-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`profile-noop-${suffix}`);
      const identityId = yield* makeWorkspaceIdentityId(`profile-noop-identity-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const noOpCommandId = CommandId.make(`profile-noop-${suffix}`);

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
        commandId: noOpCommandId,
        workspaceId,
        profile: {
          name: WorkspaceIdentityName.make("Stable Profile"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/stable.svg"),
        },
      });
      const originalNoOp = yield* workspaces.updateMyIdentity(noOpCommand);
      yield* workspaces.updateMyIdentity(
        UpdateWorkspaceIdentityCommand.make({
          actorAccountId: accountId,
          commandId: CommandId.make(`profile-change-after-noop-${suffix}`),
          workspaceId,
          profile: {
            name: WorkspaceIdentityName.make("Later Profile"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/later.svg"),
          },
        }),
      );
      const replayedNoOp = yield* workspaces.updateMyIdentity(noOpCommand);
      const current = yield* workspaces.getForActor(accountId, workspaceId);
      const noOpAuditCounts = yield* sql<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE metadata ->> 'commandId' = ${noOpCommandId}
      `;

      expect(originalNoOp._tag).toBe("IdentityProfileUnchanged");
      expect(replayedNoOp).toEqual(originalNoOp);
      expect(current.identity).toMatchObject({
        name: "Later Profile",
        avatarUrl: "/avatars/later.svg",
      });
      expect(noOpAuditCounts).toEqual([{ count: 0 }]);
    }),
  );

  it.effect("does not treat an inactive matching identity profile as an authorized no-op", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`inactive-profile-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`inactive-profile-${suffix}`);
      const identityId = yield* makeWorkspaceIdentityId(`inactive-profile-identity-${suffix}`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const updateCommand = UpdateWorkspaceIdentityCommand.make({
        actorAccountId: accountId,
        commandId: CommandId.make(`inactive-profile-update-${suffix}`),
        workspaceId,
        profile: {
          name: WorkspaceIdentityName.make("Inactive Profile"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/inactive.svg"),
        },
      });

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${accountId}, ${`${accountId}@example.test`}, 'Inactive Editor')
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
        VALUES (
          ${identityId},
          ${workspaceId},
          ${accountId},
          'Inactive Profile',
          '/avatars/inactive.svg',
          'member',
          '2026-07-17T12:00:00Z'
        )
      `;

      const inactiveFailure = yield* workspaces.updateMyIdentity(updateCommand).pipe(Effect.flip);
      yield* workspaces.join(
        JoinWorkspaceCommand.make({
          actorAccountId: accountId,
          commandId: CommandId.make(`inactive-profile-rejoin-${suffix}`),
          workspaceId,
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
        INSERT INTO channels (id, workspace_id, name, visibility)
        VALUES
          (${publicChannelId}, ${workspaceId}, 'general', 'public'),
          (${privateChannelId}, ${workspaceId}, 'leadership', 'private')
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
          commandId: CommandId.make(`channel-revoke-leave-${suffix}`),
          workspaceId,
        }),
      );
      yield* workspaces.join(
        JoinWorkspaceCommand.make({
          actorAccountId: accountId,
          commandId: CommandId.make(`channel-revoke-rejoin-${suffix}`),
          workspaceId,
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
      const commandId = CommandId.make(`last-owner-leave-${suffix}`);
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
        commandId,
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

  it.effect("rolls back lifecycle and command state when audit persistence fails", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const accountId = yield* makeUserId(`audit-failure-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`audit-failure-${suffix}`);
      const identityId = yield* makeWorkspaceIdentityId(`audit-failure-identity-${suffix}`);
      const commandId = CommandId.make(`audit-failure-test-${suffix}`);
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
          IF NEW.metadata ->> 'commandId' LIKE 'audit-failure-test-%' THEN
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
        commandId,
        workspaceId,
        profile: {
          name: WorkspaceIdentityName.make("After Audit Failure"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/after-audit.svg"),
        },
      });

      const failure = yield* workspaces.updateMyIdentity(command).pipe(Effect.flip);
      const afterFailure = yield* workspaces.getForActor(accountId, workspaceId);
      const ledgerAfterFailure = yield* sql<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM workspace_access_commands
        WHERE actor_user_id = ${accountId}
          AND command_id = ${commandId}
      `;
      yield* sql`DROP TRIGGER workspace_access_test_fail_audit_trigger ON audit_events`;
      const retried = yield* workspaces.updateMyIdentity(command);

      expect(failure).toBeInstanceOf(WorkspaceAccessFailure);
      expect(afterFailure.identity).toMatchObject({
        name: "Before Audit Failure",
        avatarUrl: "/avatars/before-audit.svg",
      });
      expect(ledgerAfterFailure).toEqual([{ count: 0 }]);
      expect(retried._tag).toBe("WorkspaceIdentityUpdated");
    }),
  );
});
