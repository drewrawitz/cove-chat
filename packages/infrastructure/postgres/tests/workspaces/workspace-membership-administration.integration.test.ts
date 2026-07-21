import { expect, layer } from "@effect/vitest";
import {
  AcceptWorkspaceInvitationCommand,
  AlreadyWorkspaceMember,
  ChangeWorkspaceRoleCommand,
  ExistingWorkspaceIdentityProfileNotAccepted,
  InitialWorkspaceIdentityProfileRequired,
  InviteWorkspaceMemberCommand,
  LastWorkspaceOwner,
  RemoveFullMemberCommand,
  ResendWorkspaceInvitationCommand,
  RedeemWorkspaceInvitationCommand,
  RevokeWorkspaceInvitationCommand,
  WorkspaceAccess,
  WorkspaceAdministrationForbidden,
  WorkspaceInvitationRedemptionUnavailable,
  WorkspaceInvitationUnavailable,
  getCurrentUser,
  redeemWorkspaceInvitation,
} from "@cove/application";
import {
  DisplayName,
  EmailAddress,
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { PersistenceError, SessionRepository, type WorkspaceInvitationToken } from "@cove/ports";
import { Clock, Effect, Redacted, Result } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { TestPostgres, TestWorkspaceInvitationNotifier } from "../support/database.ts";

layer(TestPostgres, { timeout: "2 minutes" })("Workspace Membership administration", (it) => {
  it.effect("creates an invited Account and Membership when an unknown email redeems", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const ownerAccountId = yield* makeUserId(`unknown-invite-owner-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`unknown-invite-workspace-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(
        `unknown-invite-owner-identity-${suffix}`,
      );
      const inviteeEmail = EmailAddress.make(`unknown-invitee-${suffix}@example.test`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const notifications = yield* TestWorkspaceInvitationNotifier;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${ownerAccountId}, ${`unknown-invite-owner-${suffix}@example.test`}, 'Workspace Owner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Unknown Invitee Team')
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
          ${ownerAccountId},
          'Workspace Owner',
          '/avatars/owner.svg',
          'owner'
        )
      `;

      const invitation = yield* workspaces.inviteMember(
        InviteWorkspaceMemberCommand.make({
          actorAccountId: ownerAccountId,
          workspaceId,
          inviteeEmail,
        }),
      );

      expect(invitation).toMatchObject({
        _tag: "WorkspaceInvitationIssued",
        workspaceId,
        inviteeEmail,
      });
      const notification = yield* notifications.take();
      const redemptionCommand = RedeemWorkspaceInvitationCommand.make({
        token: notification.token,
        displayName: DisplayName.make("New Account"),
        initialIdentityProfile: {
          name: WorkspaceIdentityName.make("New Workspace Member"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/new-member.svg"),
        },
      });
      const sessionRepository = yield* SessionRepository;
      const sessionFailure = yield* redeemWorkspaceInvitation(redemptionCommand).pipe(
        Effect.provideService(
          SessionRepository,
          SessionRepository.of({
            ...sessionRepository,
            create: Effect.fn("SessionRepository.Test.failCreate")(() =>
              Effect.fail(
                new PersistenceError({ operation: "SessionRepository.create", cause: "test" }),
              ),
            ),
          }),
        ),
        Effect.flip,
      );
      const rolledBack = yield* sql<{
        readonly accountCount: number;
        readonly acceptedAt: Date | null;
      }>`
        SELECT
          count(account.id)::integer AS "accountCount",
          invitation.accepted_at AS "acceptedAt"
        FROM workspace_invitations AS invitation
        LEFT JOIN users AS account
          ON lower(account.email) = lower(invitation.invitee_email)
        WHERE invitation.id = ${invitation.invitationId}
        GROUP BY invitation.accepted_at
      `;
      const concurrentAttempts = yield* Effect.all(
        [
          redeemWorkspaceInvitation(redemptionCommand).pipe(Effect.result),
          redeemWorkspaceInvitation(redemptionCommand).pipe(Effect.result),
        ],
        { concurrency: 2 },
      );
      const successfulAttempts = concurrentAttempts.flatMap((attempt) =>
        Result.isSuccess(attempt) ? [attempt.success] : [],
      );
      const authenticated = successfulAttempts[0];
      if (authenticated === undefined) {
        return yield* Effect.die("Expected one concurrent redemption to succeed");
      }
      const redeemed = authenticated.invitation;
      const currentAccount = yield* getCurrentUser(authenticated.session.token);
      const access = yield* workspaces.getForActor(redeemed.account.id, workspaceId);
      const replayFailure = yield* workspaces
        .redeemInvitation(
          RedeemWorkspaceInvitationCommand.make({
            token: notification.token,
            displayName: DisplayName.make("Duplicate Account"),
            initialIdentityProfile: {
              name: WorkspaceIdentityName.make("Duplicate Member"),
              avatarUrl: WorkspaceAvatarUrl.make("/avatars/duplicate.svg"),
            },
          }),
        )
        .pipe(Effect.flip);

      expect(redeemed).toMatchObject({
        _tag: "WorkspaceInvitationRedeemed",
        invitationId: invitation.invitationId,
        workspaceId,
        account: { email: inviteeEmail, displayName: "New Account" },
      });
      expect(sessionFailure).toMatchObject({ _tag: "Ports.PersistenceError" });
      expect(rolledBack).toEqual([{ accountCount: 0, acceptedAt: null }]);
      expect(successfulAttempts).toHaveLength(1);
      expect(currentAccount).toMatchObject({
        id: redeemed.account.id,
        email: inviteeEmail,
      });
      expect(access).toMatchObject({
        identity: {
          accountId: redeemed.account.id,
          name: "New Workspace Member",
          avatarUrl: "/avatars/new-member.svg",
        },
        membership: { role: "member" },
      });
      expect(replayFailure).toBeInstanceOf(WorkspaceInvitationRedemptionUnavailable);
    }),
  );

  it.effect("recovers failed delivery and expiry by rotating the invitation token", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const ownerAccountId = yield* makeUserId(`retry-invite-owner-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`retry-invite-workspace-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(
        `retry-invite-owner-identity-${suffix}`,
      );
      const inviteeEmail = EmailAddress.make(`retry-invitee-${suffix}@example.test`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const notifications = yield* TestWorkspaceInvitationNotifier;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${ownerAccountId}, ${`retry-invite-owner-${suffix}@example.test`}, 'Workspace Owner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Retry Invitation Team')
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
          ${ownerAccountId},
          'Workspace Owner',
          '/avatars/owner.svg',
          'owner'
        )
      `;

      const invite = () =>
        workspaces.inviteMember(
          InviteWorkspaceMemberCommand.make({
            actorAccountId: ownerAccountId,
            workspaceId,
            inviteeEmail,
          }),
        );
      const redeem = (token: WorkspaceInvitationToken) =>
        workspaces.redeemInvitation(
          RedeemWorkspaceInvitationCommand.make({
            token,
            displayName: DisplayName.make("Retry Account"),
            initialIdentityProfile: {
              name: WorkspaceIdentityName.make("Retry Member"),
              avatarUrl: WorkspaceAvatarUrl.make("/avatars/retry.svg"),
            },
          }),
        );

      yield* notifications.failNext();
      const deliveryFailure = yield* invite().pipe(Effect.flip);
      const failedNotification = yield* notifications.takeFailed();
      const retriedInvitation = yield* invite();
      const retriedNotification = yield* notifications.take();
      const rotatedTokenFailure = yield* redeem(failedNotification.token).pipe(Effect.flip);

      const now = yield* Clock.currentTimeMillis;
      yield* sql`
        UPDATE workspace_invitations
        SET token_expires_at = ${new Date(now - 1)}
        WHERE id = ${retriedInvitation.invitationId}
      `;
      const expiredTokenFailure = yield* redeem(retriedNotification.token).pipe(Effect.flip);
      const renewedInvitation = yield* invite();
      const renewedNotification = yield* notifications.take();
      const redeemed = yield* redeem(renewedNotification.token);

      expect(deliveryFailure).toMatchObject({ _tag: "Application.WorkspaceAccessFailure" });
      expect(retriedInvitation.invitationId).toBe(renewedInvitation.invitationId);
      expect(Redacted.value(failedNotification.token)).not.toBe(
        Redacted.value(retriedNotification.token),
      );
      expect(Redacted.value(retriedNotification.token)).not.toBe(
        Redacted.value(renewedNotification.token),
      );
      expect(rotatedTokenFailure).toBeInstanceOf(WorkspaceInvitationRedemptionUnavailable);
      expect(expiredTokenFailure).toBeInstanceOf(WorkspaceInvitationRedemptionUnavailable);
      expect(redeemed.account.email).toBe(inviteeEmail);
    }),
  );

  it.effect("lets an Admin list, resend, and revoke pending Workspace Invitations", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const ownerAccountId = yield* makeUserId(`invitation-owner-${suffix}`);
      const adminAccountId = yield* makeUserId(`invitation-admin-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`invitation-workspace-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(`invitation-owner-${suffix}`);
      const adminIdentityId = yield* makeWorkspaceIdentityId(`invitation-admin-${suffix}`);
      const inviteeEmail = EmailAddress.make(`pending-${suffix}@example.test`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;
      const notifications = yield* TestWorkspaceInvitationNotifier;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${ownerAccountId}, ${`invitation-owner-${suffix}@example.test`}, 'Invitation Owner'),
          (${adminAccountId}, ${`invitation-admin-${suffix}@example.test`}, 'Invitation Admin')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Invitation Administration Team')
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
          (${ownerIdentityId}, ${workspaceId}, ${ownerAccountId}, 'Invitation Owner', '/avatars/owner.svg', 'owner'),
          (${adminIdentityId}, ${workspaceId}, ${adminAccountId}, 'Invitation Admin', '/avatars/admin.svg', 'admin')
      `;

      const issued = yield* workspaces.inviteMember(
        InviteWorkspaceMemberCommand.make({
          actorAccountId: ownerAccountId,
          workspaceId,
          inviteeEmail,
        }),
      );
      const originalNotification = yield* notifications.take();
      const pending = yield* workspaces.listPendingInvitationsForAdministrator(
        adminAccountId,
        workspaceId,
      );

      const resent = yield* workspaces.resendInvitation(
        ResendWorkspaceInvitationCommand.make({
          actorAccountId: adminAccountId,
          workspaceId,
          invitationId: issued.invitationId,
        }),
      );
      const replacementNotification = yield* notifications.take();
      const oldTokenFailure = yield* workspaces
        .redeemInvitation(
          RedeemWorkspaceInvitationCommand.make({
            token: originalNotification.token,
            displayName: DisplayName.make("Old Link Invitee"),
            initialIdentityProfile: {
              name: WorkspaceIdentityName.make("Old Link Invitee"),
              avatarUrl: WorkspaceAvatarUrl.make("/avatars/old-link.svg"),
            },
          }),
        )
        .pipe(Effect.flip);

      const revoked = yield* workspaces.revokeInvitation(
        RevokeWorkspaceInvitationCommand.make({
          actorAccountId: adminAccountId,
          workspaceId,
          invitationId: issued.invitationId,
        }),
      );
      const replacementTokenFailure = yield* workspaces
        .redeemInvitation(
          RedeemWorkspaceInvitationCommand.make({
            token: replacementNotification.token,
            displayName: DisplayName.make("Revoked Invitee"),
            initialIdentityProfile: {
              name: WorkspaceIdentityName.make("Revoked Invitee"),
              avatarUrl: WorkspaceAvatarUrl.make("/avatars/revoked.svg"),
            },
          }),
        )
        .pipe(Effect.flip);
      const remaining = yield* workspaces.listPendingInvitationsForAdministrator(
        adminAccountId,
        workspaceId,
      );
      const auditEvents = yield* sql<{ actorAccountId: string; eventType: string }>`
        SELECT actor_user_id AS "actorAccountId", event_type AS "eventType"
        FROM audit_events
        WHERE event_type IN ('workspace.invitation_resent', 'workspace.invitation_revoked')
          AND metadata ->> 'workspaceId' = ${workspaceId}
        ORDER BY occurred_at
      `;

      expect(pending).toEqual([
        {
          id: issued.invitationId,
          workspaceId,
          inviteeEmail,
          invitedAt: issued.occurredAt,
          tokenExpiresAt: originalNotification.expiresAt,
        },
      ]);
      expect(resent).toMatchObject({
        _tag: "WorkspaceInvitationResent",
        invitationId: issued.invitationId,
        workspaceId,
        inviteeEmail,
      });
      expect(Redacted.value(replacementNotification.token)).not.toBe(
        Redacted.value(originalNotification.token),
      );
      expect(replacementNotification.expiresAt.getTime()).toBeGreaterThanOrEqual(
        originalNotification.expiresAt.getTime(),
      );
      expect(oldTokenFailure).toBeInstanceOf(WorkspaceInvitationRedemptionUnavailable);
      expect(revoked).toMatchObject({
        _tag: "WorkspaceInvitationRevoked",
        invitationId: issued.invitationId,
        workspaceId,
        inviteeEmail,
      });
      expect(replacementTokenFailure).toBeInstanceOf(WorkspaceInvitationRedemptionUnavailable);
      expect(remaining).toEqual([]);
      expect(auditEvents).toEqual([
        { actorAccountId: adminAccountId, eventType: "workspace.invitation_resent" },
        { actorAccountId: adminAccountId, eventType: "workspace.invitation_revoked" },
      ]);

      const raceEmail = EmailAddress.make(`invitation-race-${suffix}@example.test`);
      const raceInvitation = yield* workspaces.inviteMember(
        InviteWorkspaceMemberCommand.make({
          actorAccountId: ownerAccountId,
          workspaceId,
          inviteeEmail: raceEmail,
        }),
      );
      const raceNotification = yield* notifications.take();
      const raceResults = yield* Effect.all(
        [
          workspaces
            .redeemInvitation(
              RedeemWorkspaceInvitationCommand.make({
                token: raceNotification.token,
                displayName: DisplayName.make("Racing Invitee"),
                initialIdentityProfile: {
                  name: WorkspaceIdentityName.make("Racing Invitee"),
                  avatarUrl: WorkspaceAvatarUrl.make("/avatars/racing.svg"),
                },
              }),
            )
            .pipe(Effect.result),
          workspaces
            .revokeInvitation(
              RevokeWorkspaceInvitationCommand.make({
                actorAccountId: adminAccountId,
                workspaceId,
                invitationId: raceInvitation.invitationId,
              }),
            )
            .pipe(Effect.result),
        ],
        { concurrency: 2 },
      );
      const [redemptionResult, revocationResult] = raceResults;

      expect(raceResults.filter((result) => result._tag === "Success")).toHaveLength(1);
      if (Result.isSuccess(redemptionResult)) {
        expect(
          Result.isFailure(revocationResult) ? revocationResult.failure : undefined,
        ).toBeInstanceOf(WorkspaceInvitationUnavailable);
        expect(
          yield* workspaces.getForActor(redemptionResult.success.account.id, workspaceId),
        ).toMatchObject({ membership: { role: "member" } });
      } else {
        expect(redemptionResult.failure).toBeInstanceOf(WorkspaceInvitationRedemptionUnavailable);
        expect(Result.isSuccess(revocationResult)).toBe(true);
        expect(
          yield* sql<{ count: number }>`
            SELECT count(*)::integer AS count
            FROM users
            WHERE lower(email) = lower(${raceEmail})
          `,
        ).toEqual([{ count: 0 }]);
      }
      expect(
        yield* workspaces.listPendingInvitationsForAdministrator(adminAccountId, workspaceId),
      ).toEqual([]);
    }),
  );

  it.effect("creates a Member identity and Membership when an invited Account accepts", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const ownerAccountId = yield* makeUserId(`invite-owner-account-${suffix}`);
      const inviteeAccountId = yield* makeUserId(`invitee-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`invite-workspace-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(`invite-owner-identity-${suffix}`);
      const inviteeEmail = EmailAddress.make(`invitee-${suffix}@example.test`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${ownerAccountId}, ${`owner-${suffix}@example.test`}, 'Workspace Owner'),
          (${inviteeAccountId}, ${inviteeEmail}, 'Invited Account')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Invitation Team')
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
          ${ownerAccountId},
          'Workspace Owner',
          '/avatars/owner.svg',
          'owner'
        )
      `;

      const invitation = yield* workspaces.inviteMember(
        InviteWorkspaceMemberCommand.make({
          actorAccountId: ownerAccountId,
          workspaceId,
          inviteeEmail,
        }),
      );
      const now = yield* Clock.currentTimeMillis;
      yield* sql`
        UPDATE workspace_invitations
        SET token_expires_at = ${new Date(now - 1)}
        WHERE id = ${invitation.invitationId}
      `;
      const expiredPending = yield* workspaces.listInvitationsForActor(inviteeAccountId);
      const expiredAcceptance = yield* workspaces
        .acceptInvitation(
          AcceptWorkspaceInvitationCommand.make({
            actorAccountId: inviteeAccountId,
            invitationId: invitation.invitationId,
            initialIdentityProfile: {
              name: WorkspaceIdentityName.make("Expired Member"),
              avatarUrl: WorkspaceAvatarUrl.make("/avatars/expired.svg"),
            },
          }),
        )
        .pipe(Effect.flip);
      const renewedInvitation = yield* workspaces.inviteMember(
        InviteWorkspaceMemberCommand.make({
          actorAccountId: ownerAccountId,
          workspaceId,
          inviteeEmail,
        }),
      );
      const pending = yield* workspaces.listInvitationsForActor(inviteeAccountId);

      expect(expiredPending).toEqual([]);
      expect(expiredAcceptance).toBeInstanceOf(WorkspaceInvitationUnavailable);
      expect(renewedInvitation.invitationId).toBe(invitation.invitationId);
      expect(pending).toEqual([
        {
          id: renewedInvitation.invitationId,
          workspace: { id: workspaceId, name: "Invitation Team" },
          role: "member",
          requiresIdentityProfile: true,
          invitedAt: renewedInvitation.occurredAt,
        },
      ]);

      const accepted = yield* workspaces.acceptInvitation(
        AcceptWorkspaceInvitationCommand.make({
          actorAccountId: inviteeAccountId,
          invitationId: renewedInvitation.invitationId,
          initialIdentityProfile: {
            name: WorkspaceIdentityName.make("Invited Member"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/invited.svg"),
          },
        }),
      );
      const access = yield* workspaces.getForActor(inviteeAccountId, workspaceId);
      const members = yield* workspaces.listFullMembersForActor(ownerAccountId, workspaceId);
      const auditEvents = yield* sql<{
        actorAccountId: string;
        eventType: string;
        metadata: unknown;
      }>`
        SELECT
          actor_user_id AS "actorAccountId",
          event_type AS "eventType",
          metadata
        FROM audit_events
        WHERE event_type IN ('workspace.member_invited', 'workspace.invitation_accepted')
          AND metadata ->> 'workspaceId' = ${workspaceId}
        ORDER BY occurred_at, event_type
      `;

      expect(accepted).toMatchObject({
        _tag: "WorkspaceInvitationAccepted",
        invitationId: renewedInvitation.invitationId,
        workspaceId,
        workspaceIdentityId: access.identity.id,
      });
      expect(access).toMatchObject({
        identity: {
          accountId: inviteeAccountId,
          name: "Invited Member",
          avatarUrl: "/avatars/invited.svg",
        },
        membership: { role: "member" },
      });
      expect(members.map((member) => [member.identity.name, member.membership.role])).toEqual([
        ["Invited Member", "member"],
        ["Workspace Owner", "owner"],
      ]);
      expect(yield* workspaces.listInvitationsForActor(inviteeAccountId)).toEqual([]);
      expect(auditEvents).toEqual(
        expect.arrayContaining([
          {
            actorAccountId: ownerAccountId,
            eventType: "workspace.member_invited",
            metadata: {
              workspaceId,
              invitationId: invitation.invitationId,
              inviteeEmail,
            },
          },
          {
            actorAccountId: inviteeAccountId,
            eventType: "workspace.invitation_accepted",
            metadata: {
              workspaceId,
              workspaceIdentityId: access.identity.id,
              invitationId: invitation.invitationId,
            },
          },
        ]),
      );
      expect(auditEvents).toHaveLength(2);
    }),
  );

  it.effect(
    "negotiates first Membership and reactivation without replacing an existing identity",
    () =>
      Effect.gen(function* () {
        const suffix = randomUUID();
        const ownerAccountId = yield* makeUserId(`accept-owner-${suffix}`);
        const firstAccountId = yield* makeUserId(`accept-first-${suffix}`);
        const returningAccountId = yield* makeUserId(`accept-returning-${suffix}`);
        const activeAccountId = yield* makeUserId(`accept-active-${suffix}`);
        const workspaceId = yield* makeWorkspaceId(`accept-workspace-${suffix}`);
        const ownerIdentityId = yield* makeWorkspaceIdentityId(`accept-owner-identity-${suffix}`);
        const returningIdentityId = yield* makeWorkspaceIdentityId(
          `accept-returning-identity-${suffix}`,
        );
        const activeIdentityId = yield* makeWorkspaceIdentityId(`accept-active-identity-${suffix}`);
        const firstEmail = EmailAddress.make(`accept-first-${suffix}@example.test`);
        const returningEmail = EmailAddress.make(`accept-returning-${suffix}@example.test`);
        const activeEmail = EmailAddress.make(`accept-active-${suffix}@example.test`);
        const sql = yield* SqlClient.SqlClient;
        const workspaces = yield* WorkspaceAccess;

        yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${ownerAccountId}, ${`accept-owner-${suffix}@example.test`}, 'Acceptance Owner'),
          (${firstAccountId}, ${firstEmail}, 'First Invitee'),
          (${returningAccountId}, ${returningEmail}, 'Returning Invitee'),
          (${activeAccountId}, ${activeEmail}, 'Active Member')
      `;
        yield* sql`INSERT INTO workspaces (id, name) VALUES (${workspaceId}, 'Acceptance Team')`;
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
          (${ownerIdentityId}, ${workspaceId}, ${ownerAccountId}, 'Acceptance Owner', '/avatars/owner.svg', 'owner', NULL),
          (${returningIdentityId}, ${workspaceId}, ${returningAccountId}, 'Persistent Identity', '/avatars/persistent.svg', 'member', '2026-07-17T12:00:00Z'),
          (${activeIdentityId}, ${workspaceId}, ${activeAccountId}, 'Active Member', '/avatars/active.svg', 'member', NULL)
      `;

        const firstInvitation = yield* workspaces.inviteMember(
          InviteWorkspaceMemberCommand.make({
            actorAccountId: ownerAccountId,
            workspaceId,
            inviteeEmail: firstEmail,
          }),
        );
        const missingProfile = yield* workspaces
          .acceptInvitation(
            AcceptWorkspaceInvitationCommand.make({
              actorAccountId: firstAccountId,
              invitationId: firstInvitation.invitationId,
            }),
          )
          .pipe(Effect.flip);
        const firstAccepted = yield* workspaces.acceptInvitation(
          AcceptWorkspaceInvitationCommand.make({
            actorAccountId: firstAccountId,
            invitationId: firstInvitation.invitationId,
            initialIdentityProfile: {
              name: WorkspaceIdentityName.make("First Identity"),
              avatarUrl: WorkspaceAvatarUrl.make("/avatars/first.svg"),
            },
          }),
        );

        const returningInvitation = yield* workspaces.inviteMember(
          InviteWorkspaceMemberCommand.make({
            actorAccountId: ownerAccountId,
            workspaceId,
            inviteeEmail: returningEmail,
          }),
        );
        const replacementProfile = yield* workspaces
          .acceptInvitation(
            AcceptWorkspaceInvitationCommand.make({
              actorAccountId: returningAccountId,
              invitationId: returningInvitation.invitationId,
              initialIdentityProfile: {
                name: WorkspaceIdentityName.make("Replacement Identity"),
                avatarUrl: WorkspaceAvatarUrl.make("/avatars/replacement.svg"),
              },
            }),
          )
          .pipe(Effect.flip);
        const returningAccepted = yield* workspaces.acceptInvitation(
          AcceptWorkspaceInvitationCommand.make({
            actorAccountId: returningAccountId,
            invitationId: returningInvitation.invitationId,
          }),
        );
        const activeMemberFailure = yield* workspaces
          .inviteMember(
            InviteWorkspaceMemberCommand.make({
              actorAccountId: ownerAccountId,
              workspaceId,
              inviteeEmail: activeEmail,
            }),
          )
          .pipe(Effect.flip);

        expect(missingProfile).toBeInstanceOf(InitialWorkspaceIdentityProfileRequired);
        expect(firstAccepted.workspaceIdentityId).not.toBe(returningIdentityId);
        expect(replacementProfile).toBeInstanceOf(ExistingWorkspaceIdentityProfileNotAccepted);
        expect(returningAccepted.workspaceIdentityId).toBe(returningIdentityId);
        expect(
          (yield* workspaces.getForActor(returningAccountId, workspaceId)).identity,
        ).toMatchObject({
          id: returningIdentityId,
          name: "Persistent Identity",
          avatarUrl: "/avatars/persistent.svg",
        });
        expect(activeMemberFailure).toBeInstanceOf(AlreadyWorkspaceMember);
      }),
  );

  it.effect("lets Owners and Admins manage only the Workspace Roles within their authority", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const ownerAccountId = yield* makeUserId(`role-owner-account-${suffix}`);
      const adminAccountId = yield* makeUserId(`role-admin-account-${suffix}`);
      const memberAccountId = yield* makeUserId(`role-member-account-${suffix}`);
      const inviteeAccountId = yield* makeUserId(`role-invitee-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`role-workspace-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(`role-owner-identity-${suffix}`);
      const adminIdentityId = yield* makeWorkspaceIdentityId(`role-admin-identity-${suffix}`);
      const memberIdentityId = yield* makeWorkspaceIdentityId(`role-member-identity-${suffix}`);
      const inviteeEmail = EmailAddress.make(`role-invitee-${suffix}@example.test`);
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES
          (${ownerAccountId}, ${`role-owner-${suffix}@example.test`}, 'Role Owner'),
          (${adminAccountId}, ${`role-admin-${suffix}@example.test`}, 'Role Admin'),
          (${memberAccountId}, ${`role-member-${suffix}@example.test`}, 'Role Member'),
          (${inviteeAccountId}, ${inviteeEmail}, 'Role Invitee')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Role Team')
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
          (${ownerIdentityId}, ${workspaceId}, ${ownerAccountId}, 'Role Owner', '/avatars/owner.svg', 'owner'),
          (${adminIdentityId}, ${workspaceId}, ${adminAccountId}, 'Role Admin', '/avatars/admin.svg', 'admin'),
          (${memberIdentityId}, ${workspaceId}, ${memberAccountId}, 'Role Member', '/avatars/member.svg', 'member')
      `;

      const invitedByAdmin = yield* workspaces.inviteMember(
        InviteWorkspaceMemberCommand.make({
          actorAccountId: adminAccountId,
          workspaceId,
          inviteeEmail,
        }),
      );
      const memberInvitationDenied = yield* workspaces
        .inviteMember(
          InviteWorkspaceMemberCommand.make({
            actorAccountId: memberAccountId,
            workspaceId,
            inviteeEmail,
          }),
        )
        .pipe(Effect.flip);

      const promotedByAdmin = yield* workspaces.changeMemberRole(
        ChangeWorkspaceRoleCommand.make({
          actorAccountId: adminAccountId,
          workspaceId,
          workspaceIdentityId: memberIdentityId,
          role: "admin",
        }),
      );
      const ownerAppointmentDenied = yield* workspaces
        .changeMemberRole(
          ChangeWorkspaceRoleCommand.make({
            actorAccountId: adminAccountId,
            workspaceId,
            workspaceIdentityId: memberIdentityId,
            role: "owner",
          }),
        )
        .pipe(Effect.flip);
      const appointedByOwner = yield* workspaces.changeMemberRole(
        ChangeWorkspaceRoleCommand.make({
          actorAccountId: ownerAccountId,
          workspaceId,
          workspaceIdentityId: memberIdentityId,
          role: "owner",
        }),
      );
      const roleAudits = yield* sql<{ actorAccountId: string; metadata: unknown }>`
        SELECT actor_user_id AS "actorAccountId", metadata
        FROM audit_events
        WHERE event_type = 'workspace.role_changed'
          AND metadata ->> 'workspaceId' = ${workspaceId}
        ORDER BY occurred_at
      `;

      expect(promotedByAdmin).toMatchObject({
        _tag: "WorkspaceRoleChanged",
        previousRole: "member",
        role: "admin",
      });
      expect(invitedByAdmin._tag).toBe("WorkspaceInvitationIssued");
      expect(memberInvitationDenied).toBeInstanceOf(WorkspaceAdministrationForbidden);
      expect(ownerAppointmentDenied).toBeInstanceOf(WorkspaceAdministrationForbidden);
      expect(appointedByOwner).toMatchObject({
        _tag: "WorkspaceRoleChanged",
        previousRole: "admin",
        role: "owner",
      });
      expect(roleAudits).toEqual(
        expect.arrayContaining([
          {
            actorAccountId: adminAccountId,
            metadata: {
              workspaceId,
              workspaceIdentityId: memberIdentityId,
              previousRole: "member",
              role: "admin",
            },
          },
          {
            actorAccountId: ownerAccountId,
            metadata: {
              workspaceId,
              workspaceIdentityId: memberIdentityId,
              previousRole: "admin",
              role: "owner",
            },
          },
        ]),
      );
      expect(roleAudits).toHaveLength(2);
    }),
  );

  it.effect("prevents the final Owner from being demoted or removed", () =>
    Effect.gen(function* () {
      const suffix = randomUUID();
      const ownerAccountId = yield* makeUserId(`final-owner-account-${suffix}`);
      const replacementAccountId = yield* makeUserId(`replacement-owner-account-${suffix}`);
      const workspaceId = yield* makeWorkspaceId(`final-owner-workspace-${suffix}`);
      const ownerIdentityId = yield* makeWorkspaceIdentityId(`final-owner-identity-${suffix}`);
      const replacementIdentityId = yield* makeWorkspaceIdentityId(
        `replacement-owner-identity-${suffix}`,
      );
      const sql = yield* SqlClient.SqlClient;
      const workspaces = yield* WorkspaceAccess;

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${ownerAccountId}, ${`final-owner-${suffix}@example.test`}, 'Final Owner')
      `;
      yield* sql`
        INSERT INTO workspaces (id, name)
        VALUES (${workspaceId}, 'Final Owner Team')
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
          ${ownerAccountId},
          'Final Owner',
          '/avatars/final-owner.svg',
          'owner'
        )
      `;

      const demotionFailure = yield* workspaces
        .changeMemberRole(
          ChangeWorkspaceRoleCommand.make({
            actorAccountId: ownerAccountId,
            workspaceId,
            workspaceIdentityId: ownerIdentityId,
            role: "member",
          }),
        )
        .pipe(Effect.flip);
      const removalFailure = yield* workspaces
        .removeFullMember(
          RemoveFullMemberCommand.make({
            actorAccountId: ownerAccountId,
            workspaceId,
            workspaceIdentityId: ownerIdentityId,
          }),
        )
        .pipe(Effect.flip);
      const forbiddenAuditCount = yield* sql<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE actor_user_id = ${ownerAccountId}
          AND metadata ->> 'workspaceId' = ${workspaceId}
      `;

      expect(demotionFailure).toBeInstanceOf(LastWorkspaceOwner);
      expect(removalFailure).toBeInstanceOf(LastWorkspaceOwner);
      expect((yield* workspaces.getForActor(ownerAccountId, workspaceId)).membership.role).toBe(
        "owner",
      );
      expect(forbiddenAuditCount).toEqual([{ count: 0 }]);

      yield* sql`
        INSERT INTO users (id, email, display_name)
        VALUES (
          ${replacementAccountId},
          ${`replacement-owner-${suffix}@example.test`},
          'Replacement Owner'
        )
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
          ${replacementIdentityId},
          ${workspaceId},
          ${replacementAccountId},
          'Replacement Owner',
          '/avatars/replacement-owner.svg',
          'owner'
        )
      `;

      const removed = yield* workspaces.removeFullMember(
        RemoveFullMemberCommand.make({
          actorAccountId: ownerAccountId,
          workspaceId,
          workspaceIdentityId: ownerIdentityId,
        }),
      );
      const endedAccess = yield* workspaces
        .getForActor(ownerAccountId, workspaceId)
        .pipe(Effect.flip);
      const removalAudit = yield* sql<{ actorAccountId: string; metadata: unknown }>`
        SELECT actor_user_id AS "actorAccountId", metadata
        FROM audit_events
        WHERE event_type = 'workspace.membership_ended'
          AND metadata ->> 'workspaceId' = ${workspaceId}
      `;

      expect(removed._tag).toBe("FullMemberRemoved");
      expect(endedAccess._tag).toBe("Application.WorkspaceUnavailable");
      expect(
        (yield* workspaces.getForActor(replacementAccountId, workspaceId)).membership.role,
      ).toBe("owner");
      expect(removalAudit).toEqual([
        {
          actorAccountId: ownerAccountId,
          metadata: {
            workspaceId,
            workspaceIdentityId: ownerIdentityId,
            reason: "removed_by_administrator",
          },
        },
      ]);
    }),
  );
});
