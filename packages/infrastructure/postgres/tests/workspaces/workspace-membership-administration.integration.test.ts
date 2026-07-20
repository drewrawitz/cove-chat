import { expect, layer } from "@effect/vitest";
import {
  AcceptWorkspaceInvitationCommand,
  AlreadyWorkspaceMember,
  ChangeWorkspaceRoleCommand,
  ExistingWorkspaceIdentityProfileNotAccepted,
  InitialWorkspaceIdentityProfileRequired,
  InviteWorkspaceMemberCommand,
  LastWorkspaceOwner,
  RemoveWorkspaceMemberCommand,
  WorkspaceAccess,
  WorkspaceAdministrationForbidden,
} from "@cove/application";
import {
  EmailAddress,
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/database.ts";

layer(TestPostgres, { timeout: "2 minutes" })("Workspace Membership administration", (it) => {
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
      const pending = yield* workspaces.listInvitationsForActor(inviteeAccountId);

      expect(pending).toEqual([
        {
          id: invitation.invitationId,
          workspace: { id: workspaceId, name: "Invitation Team" },
          role: "member",
          requiresIdentityProfile: true,
          invitedAt: invitation.occurredAt,
        },
      ]);

      const accepted = yield* workspaces.acceptInvitation(
        AcceptWorkspaceInvitationCommand.make({
          actorAccountId: inviteeAccountId,
          invitationId: invitation.invitationId,
          initialIdentityProfile: {
            name: WorkspaceIdentityName.make("Invited Member"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/invited.svg"),
          },
        }),
      );
      const access = yield* workspaces.getForActor(inviteeAccountId, workspaceId);
      const members = yield* workspaces.listMembersForActor(ownerAccountId, workspaceId);
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
        invitationId: invitation.invitationId,
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
              inviteeAccountId,
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
      expect(invitedByAdmin._tag).toBe("WorkspaceInvitationCreated");
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
        .removeMember(
          RemoveWorkspaceMemberCommand.make({
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

      const removed = yield* workspaces.removeMember(
        RemoveWorkspaceMemberCommand.make({
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

      expect(removed._tag).toBe("WorkspaceMemberRemoved");
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
