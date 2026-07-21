import {
  User,
  UserId,
  Workspace,
  WorkspaceIdentity,
  WorkspaceIdentityProfile,
  WorkspaceId,
  WorkspaceInvitationId,
  WorkspaceMembership,
  type WorkspaceRole,
} from "@cove/domain";
import { WorkspaceInvitationNotifier } from "@cove/ports";
import { Clock, Effect, Layer, Schema } from "effect";
import {
  AcceptWorkspaceInvitationCommand,
  type AcceptWorkspaceInvitationCommand as AcceptWorkspaceInvitationCommandType,
  type AcceptWorkspaceInvitationFailure,
  type AdministerWorkspaceInvitationFailure,
  AlreadyWorkspaceMember as AlreadyWorkspaceMemberError,
  ChangeWorkspaceRoleCommand,
  type ChangeWorkspaceRoleCommand as ChangeWorkspaceRoleCommandType,
  type ChangeWorkspaceRoleFailure,
  type CreateWorkspaceCommand as CreateWorkspaceCommandType,
  CreateWorkspaceCommand,
  ExistingWorkspaceIdentityProfileNotAccepted,
  IdentityProfileUnchanged,
  type IdentityProfileUnchanged as IdentityProfileUnchangedType,
  InitialWorkspaceIdentityProfileRequired,
  InviteWorkspaceMemberCommand,
  type InviteWorkspaceMemberCommand as InviteWorkspaceMemberCommandType,
  LastWorkspaceOwner,
  LeaveWorkspaceCommand,
  type LeaveWorkspaceCommand as LeaveWorkspaceCommandType,
  RemoveFullMemberCommand,
  type RemoveFullMemberCommand as RemoveFullMemberCommandType,
  type RemoveFullMemberFailure,
  ResendWorkspaceInvitationCommand,
  type ResendWorkspaceInvitationCommand as ResendWorkspaceInvitationCommandType,
  RedeemWorkspaceInvitationCommand,
  type RedeemWorkspaceInvitationCommand as RedeemWorkspaceInvitationCommandType,
  type RedeemWorkspaceInvitationFailure,
  RevokeWorkspaceInvitationCommand,
  type RevokeWorkspaceInvitationCommand as RevokeWorkspaceInvitationCommandType,
  UpdateWorkspaceIdentityCommand,
  type UpdateWorkspaceIdentityCommand as UpdateWorkspaceIdentityCommandType,
  WorkspaceIdentityUpdated,
  type WorkspaceIdentityUpdated as WorkspaceIdentityUpdatedType,
  WorkspaceMembershipEnded,
  type WorkspaceMembershipEnded as WorkspaceMembershipEndedType,
  type WorkspaceCreated as WorkspaceCreatedType,
  WorkspaceCreated,
  WorkspaceAccess,
  WorkspaceAccessFailure,
  WorkspaceAccessView,
  WorkspaceAdministrationForbidden,
  WorkspaceInvitationAccepted,
  type WorkspaceInvitationAccepted as WorkspaceInvitationAcceptedType,
  WorkspaceInvitationIssued,
  WorkspaceInvitationResent,
  WorkspaceInvitationResendTooSoon,
  WorkspaceInvitationRevoked,
  type WorkspaceInvitationRevoked as WorkspaceInvitationRevokedType,
  WorkspaceInvitationRedemptionUnavailable,
  WorkspaceInvitationRedeemed,
  type WorkspaceInvitationRedeemed as WorkspaceInvitationRedeemedType,
  WorkspaceInvitationUnavailable,
  FullMemberRemoved,
  type FullMemberRemoved as FullMemberRemovedType,
  FullMemberUnavailable,
  WorkspaceUnavailable,
  WorkspaceRoleChanged,
  type WorkspaceRoleChanged as WorkspaceRoleChangedType,
  WorkspaceRoleUnchanged,
  type WorkspaceRoleUnchanged as WorkspaceRoleUnchangedType,
  workspaceInvitationResendAvailableAt,
} from "./workspace-access.ts";
import {
  type WorkspaceAccessAuditEvent,
  WorkspaceAccessPersistence,
  WorkspaceAccessPersistenceFailure,
  type WorkspaceAccessTransaction,
  type WorkspaceInvitationRecord,
} from "./workspace-access-persistence.ts";

interface TransitionCommit<A> {
  readonly outcome: A;
  readonly auditEvent: WorkspaceAccessAuditEvent | undefined;
}

interface InvitationAdministrationCommand {
  readonly actorAccountId: UserId;
  readonly workspaceId: WorkspaceId;
  readonly invitationId: WorkspaceInvitationId;
}

type InvitationClaimIdentity =
  | {
      readonly identity: undefined;
      readonly initialIdentityProfile: WorkspaceIdentityProfile;
    }
  | {
      readonly identity: WorkspaceIdentity;
      readonly initialIdentityProfile?: never;
    };

type InvitationClaim = InvitationClaimIdentity & {
  readonly accountId: UserId;
  readonly invitation: WorkspaceInvitationRecord;
  readonly occurredAt: Date;
  readonly workspace: Workspace;
};

const WORKSPACE_INVITATION_TOKEN_LIFETIME_MILLIS = 7 * 24 * 60 * 60 * 1_000;

type WorkspaceAccessAuditDetails<
  Event extends WorkspaceAccessAuditEvent = WorkspaceAccessAuditEvent,
> = Event extends WorkspaceAccessAuditEvent ? Pick<Event, "metadata" | "type"> : never;

function internalFailure(operation: string): WorkspaceAccessFailure {
  return new WorkspaceAccessFailure({ operation });
}

function isWorkspaceAdministrator(role: WorkspaceRole): role is "admin" | "owner" {
  return role === "owner" || role === "admin";
}

function canChangeWorkspaceRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  nextRole: WorkspaceRole,
): boolean {
  if (actorRole === "owner") return true;
  return actorRole === "admin" && targetRole !== "owner" && nextRole !== "owner";
}

function canRemoveFullMember(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  return actorRole === "owner" || (actorRole === "admin" && targetRole !== "owner");
}

function makeAuditEvent(
  actorAccountId: UserId,
  occurredAt: Date,
  details: WorkspaceAccessAuditDetails,
): WorkspaceAccessAuditEvent {
  return {
    id: globalThis.crypto.randomUUID(),
    version: 1,
    actorAccountId,
    occurredAt,
    ...details,
  };
}

const make = Effect.gen(function* () {
  const persistence = yield* WorkspaceAccessPersistence;
  const invitationNotifier = yield* WorkspaceInvitationNotifier;

  const readActiveAccess = Effect.fn("WorkspaceAccess.readActiveAccess")(
    (actorAccountId: UserId, workspaceId: WorkspaceId) =>
      persistence
        .readActiveAccess(actorAccountId, workspaceId)
        .pipe(
          Effect.catchTag("Application.WorkspaceAccessPersistenceFailure", () =>
            Effect.fail(internalFailure("WorkspaceAccess.getForActor")),
          ),
        ),
  );

  const commitTransition = <A, E>(
    operation: string,
    transition: (
      transaction: WorkspaceAccessTransaction,
      occurredAt: Date,
    ) => Effect.Effect<TransitionCommit<A>, E | WorkspaceAccessPersistenceFailure>,
  ): Effect.Effect<A, E | WorkspaceAccessFailure> =>
    persistence
      .transact((transaction) =>
        Effect.gen(function* () {
          const occurredAt = new Date(yield* Clock.currentTimeMillis);
          const committedTransition = yield* transition(transaction, occurredAt);
          if (committedTransition.auditEvent !== undefined) {
            yield* transaction.appendAudit(committedTransition.auditEvent);
          }
          return committedTransition.outcome;
        }),
      )
      .pipe(
        Effect.catchTag("Application.WorkspaceAccessPersistenceFailure", () =>
          Effect.fail(internalFailure(operation)),
        ),
      );

  const authorizePendingInvitation = Effect.fn("WorkspaceAccess.authorizePendingInvitation")(
    function* (
      transaction: WorkspaceAccessTransaction,
      command: InvitationAdministrationCommand,
      occurredAt: Date,
    ) {
      const facts = yield* transaction.serializeInvitationAdministration(
        command.actorAccountId,
        command.workspaceId,
        command.invitationId,
      );
      if (facts.workspace === undefined || facts.membership === undefined) {
        return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId: command.workspaceId }));
      }
      if (!isWorkspaceAdministrator(facts.membership.role)) {
        return yield* Effect.fail(
          new WorkspaceAdministrationForbidden({ workspaceId: command.workspaceId }),
        );
      }
      if (facts.invitation === undefined || facts.invitation.tokenExpiresAt <= occurredAt) {
        return yield* Effect.fail(
          new WorkspaceInvitationUnavailable({ invitationId: command.invitationId }),
        );
      }
      return { invitation: facts.invitation, workspace: facts.workspace };
    },
  );

  const claimInvitation = Effect.fn("WorkspaceAccess.claimInvitation")(function* (
    transaction: WorkspaceAccessTransaction,
    claim: InvitationClaim,
  ) {
    let workspaceIdentityId: WorkspaceIdentity["id"];
    if (claim.identity === undefined) {
      workspaceIdentityId = WorkspaceIdentity.fields.id.make(globalThis.crypto.randomUUID());
      yield* transaction.startFirstMembership(
        WorkspaceAccessView.make({
          workspace: claim.workspace,
          identity: {
            id: workspaceIdentityId,
            workspaceId: claim.invitation.workspaceId,
            accountId: claim.accountId,
            ...claim.initialIdentityProfile,
          },
          membership: {
            workspaceId: claim.invitation.workspaceId,
            identityId: workspaceIdentityId,
            role: "member",
            startedAt: claim.occurredAt,
          },
        }),
      );
    } else {
      workspaceIdentityId = claim.identity.id;
      yield* transaction.reactivateMembership(
        claim.identity,
        WorkspaceMembership.make({
          workspaceId: claim.invitation.workspaceId,
          identityId: workspaceIdentityId,
          role: "member",
          startedAt: claim.occurredAt,
        }),
      );
    }
    yield* transaction.acceptInvitation(claim.invitation.id, claim.accountId, claim.occurredAt);
    return workspaceIdentityId;
  });

  const create = Effect.fn("WorkspaceAccess.create")(function* (
    unvalidatedCommand: CreateWorkspaceCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(CreateWorkspaceCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) => Effect.logError("WorkspaceAccess.create.validate", cause)),
      Effect.mapError(() => internalFailure("WorkspaceAccess.create.validate")),
    );
    return yield* commitTransition<WorkspaceCreatedType, never>(
      "WorkspaceAccess.create",
      (transaction, occurredAt) =>
        Effect.gen(function* () {
          const workspaceId = WorkspaceId.make(globalThis.crypto.randomUUID());
          const workspaceIdentityId = WorkspaceIdentity.fields.id.make(
            globalThis.crypto.randomUUID(),
          );
          const access = WorkspaceAccessView.make({
            workspace: {
              id: workspaceId,
              name: command.workspaceName,
            },
            identity: {
              id: workspaceIdentityId,
              workspaceId,
              accountId: command.actorAccountId,
              ...command.initialIdentityProfile,
            },
            membership: WorkspaceMembership.make({
              workspaceId,
              identityId: workspaceIdentityId,
              role: "owner",
              startedAt: occurredAt,
            }),
          });
          yield* transaction.createWorkspaceWithOwner(access);
          const outcome = WorkspaceCreated.make({
            workspaceId,
            workspaceIdentityId,
            occurredAt,
          });

          return {
            outcome,
            auditEvent: makeAuditEvent(command.actorAccountId, occurredAt, {
              type: "workspace.created",
              metadata: {
                workspaceId,
                workspaceIdentityId,
              },
            }),
          } satisfies TransitionCommit<WorkspaceCreatedType>;
        }),
    );
  });

  const updateMyIdentity = Effect.fn("WorkspaceAccess.updateMyIdentity")(function* (
    unvalidatedCommand: UpdateWorkspaceIdentityCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(UpdateWorkspaceIdentityCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) =>
        Effect.logError("WorkspaceAccess.updateMyIdentity.validate", cause),
      ),
      Effect.mapError(() => internalFailure("WorkspaceAccess.updateMyIdentity.validate")),
    );
    return yield* commitTransition<
      IdentityProfileUnchangedType | WorkspaceIdentityUpdatedType,
      WorkspaceUnavailable
    >("WorkspaceAccess.updateMyIdentity", (transaction, occurredAt) =>
      Effect.gen(function* () {
        const facts = yield* transaction.serializeAccountWorkspaceRelationship(
          command.actorAccountId,
          command.workspaceId,
        );
        if (
          facts.workspace === undefined ||
          facts.identity === undefined ||
          facts.membership === undefined
        ) {
          return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId: command.workspaceId }));
        }
        const changedFields = [
          ...(facts.identity.name === command.profile.name ? [] : (["name"] as const)),
          ...(facts.identity.avatarUrl === command.profile.avatarUrl
            ? []
            : (["avatarUrl"] as const)),
        ];
        if (changedFields.length === 0) {
          return {
            outcome: IdentityProfileUnchanged.make({
              workspaceId: command.workspaceId,
              workspaceIdentityId: facts.identity.id,
              occurredAt,
            }),
            auditEvent: undefined,
          } satisfies TransitionCommit<IdentityProfileUnchangedType>;
        }

        yield* transaction.updateActiveIdentity(
          command.actorAccountId,
          command.workspaceId,
          command.profile,
        );
        return {
          outcome: WorkspaceIdentityUpdated.make({
            workspaceId: command.workspaceId,
            workspaceIdentityId: facts.identity.id,
            occurredAt,
          }),
          auditEvent: makeAuditEvent(command.actorAccountId, occurredAt, {
            type: "workspace.identity_profile_changed",
            metadata: {
              workspaceId: command.workspaceId,
              workspaceIdentityId: facts.identity.id,
              changedFields,
            },
          }),
        } satisfies TransitionCommit<WorkspaceIdentityUpdatedType>;
      }),
    );
  });

  const leave = Effect.fn("WorkspaceAccess.leave")(function* (
    unvalidatedCommand: LeaveWorkspaceCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(LeaveWorkspaceCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) => Effect.logError("WorkspaceAccess.leave.validate", cause)),
      Effect.mapError(() => internalFailure("WorkspaceAccess.leave.validate")),
    );
    return yield* commitTransition<
      WorkspaceMembershipEndedType,
      LastWorkspaceOwner | WorkspaceUnavailable
    >("WorkspaceAccess.leave", (transaction, occurredAt) =>
      Effect.gen(function* () {
        const facts = yield* transaction.serializeWorkspaceTransition(
          command.actorAccountId,
          command.workspaceId,
        );
        if (facts.identity === undefined || facts.membership === undefined) {
          return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId: command.workspaceId }));
        }
        if (facts.membership.role === "owner" && facts.activeOwnerCount <= 1) {
          return yield* Effect.fail(new LastWorkspaceOwner({ workspaceId: command.workspaceId }));
        }

        yield* transaction.endMembershipAndRevokeChannels(
          command.actorAccountId,
          command.workspaceId,
          occurredAt,
        );
        return {
          outcome: WorkspaceMembershipEnded.make({
            workspaceId: command.workspaceId,
            workspaceIdentityId: facts.identity.id,
            endedAt: occurredAt,
          }),
          auditEvent: makeAuditEvent(command.actorAccountId, occurredAt, {
            type: "workspace.membership_ended",
            metadata: {
              workspaceId: command.workspaceId,
              workspaceIdentityId: facts.identity.id,
              reason: "voluntary_departure",
            },
          }),
        } satisfies TransitionCommit<WorkspaceMembershipEndedType>;
      }),
    );
  });

  const inviteMember = Effect.fn("WorkspaceAccess.inviteMember")(function* (
    unvalidatedCommand: InviteWorkspaceMemberCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(InviteWorkspaceMemberCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) => Effect.logError("WorkspaceAccess.inviteMember.validate", cause)),
      Effect.mapError(() => internalFailure("WorkspaceAccess.inviteMember.validate")),
    );
    const committed = yield* persistence
      .transact((transaction) =>
        Effect.gen(function* () {
          const occurredAt = new Date(yield* Clock.currentTimeMillis);
          const facts = yield* transaction.serializeInviteMember(
            command.actorAccountId,
            command.workspaceId,
            command.inviteeEmail,
          );
          if (facts.workspace === undefined || facts.membership === undefined) {
            return yield* Effect.fail(
              new WorkspaceUnavailable({ workspaceId: command.workspaceId }),
            );
          }
          if (!isWorkspaceAdministrator(facts.membership.role)) {
            return yield* Effect.fail(
              new WorkspaceAdministrationForbidden({ workspaceId: command.workspaceId }),
            );
          }
          if (facts.inviteeMembership !== undefined) {
            return yield* Effect.fail(
              new AlreadyWorkspaceMemberError({ workspaceId: command.workspaceId }),
            );
          }
          const invitationId =
            facts.pendingInvitation?.id ??
            WorkspaceInvitationId.make(globalThis.crypto.randomUUID());
          const tokenExpiresAt = new Date(
            occurredAt.getTime() + WORKSPACE_INVITATION_TOKEN_LIFETIME_MILLIS,
          );
          const invitation = {
            id: invitationId,
            workspaceId: command.workspaceId,
            inviteeEmail: command.inviteeEmail,
            invitedByAccountId: command.actorAccountId,
            role: "member",
            invitedAt: occurredAt,
            tokenExpiresAt,
          } as const;
          const token = yield* facts.pendingInvitation === undefined
            ? transaction.createInvitation(invitation)
            : transaction.refreshInvitation(invitation);
          const outcome = WorkspaceInvitationIssued.make({
            invitationId,
            workspaceId: command.workspaceId,
            inviteeEmail: command.inviteeEmail,
            occurredAt,
          });
          yield* transaction.appendAudit(
            makeAuditEvent(command.actorAccountId, occurredAt, {
              type: "workspace.member_invited",
              metadata: {
                workspaceId: command.workspaceId,
                invitationId,
                inviteeEmail: command.inviteeEmail,
              },
            }),
          );
          return {
            outcome,
            notification: {
              recipient: command.inviteeEmail,
              workspaceName: facts.workspace.name,
              token,
              expiresAt: tokenExpiresAt,
            },
          };
        }),
      )
      .pipe(
        Effect.catchTag("Application.WorkspaceAccessPersistenceFailure", () =>
          Effect.fail(internalFailure("WorkspaceAccess.inviteMember")),
        ),
      );
    yield* invitationNotifier
      .sendInvitation(committed.notification)
      .pipe(Effect.mapError(() => internalFailure("WorkspaceAccess.inviteMember.notify")));
    return committed.outcome;
  });

  const acceptInvitation = Effect.fn("WorkspaceAccess.acceptInvitation")(function* (
    unvalidatedCommand: AcceptWorkspaceInvitationCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(AcceptWorkspaceInvitationCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) =>
        Effect.logError("WorkspaceAccess.acceptInvitation.validate", cause),
      ),
      Effect.mapError(() => internalFailure("WorkspaceAccess.acceptInvitation.validate")),
    );
    return yield* commitTransition<
      WorkspaceInvitationAcceptedType,
      AcceptWorkspaceInvitationFailure
    >("WorkspaceAccess.acceptInvitation", (transaction, occurredAt) =>
      Effect.gen(function* () {
        const facts = yield* transaction.serializeInvitationAcceptance(
          command.actorAccountId,
          command.invitationId,
        );
        if (facts.invitation === undefined || facts.workspace === undefined) {
          return yield* Effect.fail(
            new WorkspaceInvitationUnavailable({ invitationId: command.invitationId }),
          );
        }
        if (facts.invitation.tokenExpiresAt <= occurredAt) {
          return yield* Effect.fail(
            new WorkspaceInvitationUnavailable({ invitationId: command.invitationId }),
          );
        }
        if (facts.membership !== undefined) {
          return yield* Effect.fail(
            new AlreadyWorkspaceMemberError({ workspaceId: facts.invitation.workspaceId }),
          );
        }

        let workspaceIdentityId: WorkspaceIdentity["id"];
        if (facts.identity === undefined) {
          if (command.initialIdentityProfile === undefined) {
            return yield* Effect.fail(
              new InitialWorkspaceIdentityProfileRequired({
                workspaceId: facts.invitation.workspaceId,
              }),
            );
          }
          workspaceIdentityId = yield* claimInvitation(transaction, {
            accountId: command.actorAccountId,
            invitation: facts.invitation,
            workspace: facts.workspace,
            identity: undefined,
            initialIdentityProfile: command.initialIdentityProfile,
            occurredAt,
          });
        } else {
          if (command.initialIdentityProfile !== undefined) {
            return yield* Effect.fail(
              new ExistingWorkspaceIdentityProfileNotAccepted({
                workspaceId: facts.invitation.workspaceId,
              }),
            );
          }
          workspaceIdentityId = yield* claimInvitation(transaction, {
            accountId: command.actorAccountId,
            invitation: facts.invitation,
            workspace: facts.workspace,
            identity: facts.identity,
            occurredAt,
          });
        }

        const outcome = WorkspaceInvitationAccepted.make({
          invitationId: command.invitationId,
          workspaceId: facts.invitation.workspaceId,
          workspaceIdentityId,
          occurredAt,
        });
        return {
          outcome,
          auditEvent: makeAuditEvent(command.actorAccountId, occurredAt, {
            type: "workspace.invitation_accepted",
            metadata: {
              workspaceId: facts.invitation.workspaceId,
              workspaceIdentityId,
              invitationId: command.invitationId,
            },
          }),
        } satisfies TransitionCommit<WorkspaceInvitationAcceptedType>;
      }),
    );
  });

  const resendInvitation = Effect.fn("WorkspaceAccess.resendInvitation")(function* (
    unvalidatedCommand: ResendWorkspaceInvitationCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(ResendWorkspaceInvitationCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) =>
        Effect.logError("WorkspaceAccess.resendInvitation.validate", cause),
      ),
      Effect.mapError(() => internalFailure("WorkspaceAccess.resendInvitation.validate")),
    );
    const committed = yield* persistence
      .transact((transaction) =>
        Effect.gen(function* () {
          const occurredAt = new Date(yield* Clock.currentTimeMillis);
          const authorized = yield* authorizePendingInvitation(transaction, command, occurredAt);
          const resendAvailableAt = workspaceInvitationResendAvailableAt(
            authorized.invitation.invitedAt,
          );
          if (resendAvailableAt > occurredAt) {
            return yield* Effect.fail(
              new WorkspaceInvitationResendTooSoon({
                invitationId: authorized.invitation.id,
                resendAvailableAt,
              }),
            );
          }

          const tokenExpiresAt = new Date(
            occurredAt.getTime() + WORKSPACE_INVITATION_TOKEN_LIFETIME_MILLIS,
          );
          const invitation = {
            ...authorized.invitation,
            invitedByAccountId: command.actorAccountId,
            invitedAt: occurredAt,
            tokenExpiresAt,
          };
          const token = yield* transaction.refreshInvitation(invitation);
          const outcome = WorkspaceInvitationResent.make({
            invitationId: invitation.id,
            workspaceId: invitation.workspaceId,
            inviteeEmail: invitation.inviteeEmail,
            occurredAt,
          });
          yield* transaction.appendAudit(
            makeAuditEvent(command.actorAccountId, occurredAt, {
              type: "workspace.invitation_resent",
              metadata: {
                workspaceId: invitation.workspaceId,
                invitationId: invitation.id,
                inviteeEmail: invitation.inviteeEmail,
              },
            }),
          );
          return {
            outcome,
            notification: {
              recipient: invitation.inviteeEmail,
              workspaceName: authorized.workspace.name,
              token,
              expiresAt: tokenExpiresAt,
            },
          };
        }),
      )
      .pipe(
        Effect.catchTag("Application.WorkspaceAccessPersistenceFailure", () =>
          Effect.fail(internalFailure("WorkspaceAccess.resendInvitation")),
        ),
      );
    yield* invitationNotifier
      .sendInvitation(committed.notification)
      .pipe(Effect.mapError(() => internalFailure("WorkspaceAccess.resendInvitation.notify")));
    return committed.outcome;
  });

  const revokeInvitation = Effect.fn("WorkspaceAccess.revokeInvitation")(function* (
    unvalidatedCommand: RevokeWorkspaceInvitationCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(RevokeWorkspaceInvitationCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) =>
        Effect.logError("WorkspaceAccess.revokeInvitation.validate", cause),
      ),
      Effect.mapError(() => internalFailure("WorkspaceAccess.revokeInvitation.validate")),
    );
    return yield* commitTransition<
      WorkspaceInvitationRevokedType,
      AdministerWorkspaceInvitationFailure
    >("WorkspaceAccess.revokeInvitation", (transaction, occurredAt) =>
      Effect.gen(function* () {
        const authorized = yield* authorizePendingInvitation(transaction, command, occurredAt);

        yield* transaction.revokeInvitation(authorized.invitation.id);
        return {
          outcome: WorkspaceInvitationRevoked.make({
            invitationId: authorized.invitation.id,
            workspaceId: authorized.invitation.workspaceId,
            inviteeEmail: authorized.invitation.inviteeEmail,
            occurredAt,
          }),
          auditEvent: makeAuditEvent(command.actorAccountId, occurredAt, {
            type: "workspace.invitation_revoked",
            metadata: {
              workspaceId: authorized.invitation.workspaceId,
              invitationId: authorized.invitation.id,
              inviteeEmail: authorized.invitation.inviteeEmail,
            },
          }),
        } satisfies TransitionCommit<WorkspaceInvitationRevokedType>;
      }),
    );
  });

  const redeemInvitation = Effect.fn("WorkspaceAccess.redeemInvitation")(function* (
    unvalidatedCommand: RedeemWorkspaceInvitationCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(RedeemWorkspaceInvitationCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) =>
        Effect.logError("WorkspaceAccess.redeemInvitation.validate", cause),
      ),
      Effect.mapError(() => internalFailure("WorkspaceAccess.redeemInvitation.validate")),
    );
    const proposedAccountId = UserId.make(globalThis.crypto.randomUUID());
    return yield* commitTransition<
      WorkspaceInvitationRedeemedType,
      RedeemWorkspaceInvitationFailure
    >("WorkspaceAccess.redeemInvitation", (transaction, occurredAt) =>
      Effect.gen(function* () {
        const facts = yield* transaction.serializeInvitationRedemption(
          command.token,
          proposedAccountId,
          occurredAt,
        );
        if (facts.invitation === undefined || facts.workspace === undefined) {
          return yield* Effect.fail(new WorkspaceInvitationRedemptionUnavailable());
        }

        const account =
          facts.account ??
          User.make({
            id: proposedAccountId,
            email: facts.invitation.inviteeEmail,
            displayName: command.displayName,
          });
        if (facts.account === undefined) {
          yield* transaction.createAccount(account);
        }
        if (facts.membership !== undefined) {
          return yield* Effect.fail(
            new AlreadyWorkspaceMemberError({ workspaceId: facts.invitation.workspaceId }),
          );
        }

        const workspaceIdentityId = yield* claimInvitation(
          transaction,
          facts.identity === undefined
            ? {
                accountId: account.id,
                invitation: facts.invitation,
                workspace: facts.workspace,
                identity: undefined,
                initialIdentityProfile: command.initialIdentityProfile,
                occurredAt,
              }
            : {
                accountId: account.id,
                invitation: facts.invitation,
                workspace: facts.workspace,
                identity: facts.identity,
                occurredAt,
              },
        );

        return {
          outcome: WorkspaceInvitationRedeemed.make({
            account,
            invitationId: facts.invitation.id,
            workspaceId: facts.invitation.workspaceId,
            workspaceIdentityId,
            occurredAt,
          }),
          auditEvent: makeAuditEvent(account.id, occurredAt, {
            type: "workspace.invitation_accepted",
            metadata: {
              workspaceId: facts.invitation.workspaceId,
              workspaceIdentityId,
              invitationId: facts.invitation.id,
            },
          }),
        } satisfies TransitionCommit<WorkspaceInvitationRedeemedType>;
      }),
    );
  });

  const changeMemberRole = Effect.fn("WorkspaceAccess.changeMemberRole")(function* (
    unvalidatedCommand: ChangeWorkspaceRoleCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(ChangeWorkspaceRoleCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) =>
        Effect.logError("WorkspaceAccess.changeMemberRole.validate", cause),
      ),
      Effect.mapError(() => internalFailure("WorkspaceAccess.changeMemberRole.validate")),
    );
    return yield* commitTransition<
      WorkspaceRoleChangedType | WorkspaceRoleUnchangedType,
      ChangeWorkspaceRoleFailure
    >("WorkspaceAccess.changeMemberRole", (transaction, occurredAt) =>
      Effect.gen(function* () {
        const facts = yield* transaction.serializeFullMemberAdministration(
          command.actorAccountId,
          command.workspaceId,
          command.workspaceIdentityId,
        );
        if (facts.workspace === undefined || facts.membership === undefined) {
          return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId: command.workspaceId }));
        }
        if (
          facts.targetIdentity === undefined ||
          facts.targetMembership === undefined ||
          facts.targetMembership.role === "guest"
        ) {
          return yield* Effect.fail(
            new FullMemberUnavailable({
              workspaceId: command.workspaceId,
              workspaceIdentityId: command.workspaceIdentityId,
            }),
          );
        }
        if (
          !canChangeWorkspaceRole(facts.membership.role, facts.targetMembership.role, command.role)
        ) {
          return yield* Effect.fail(
            new WorkspaceAdministrationForbidden({ workspaceId: command.workspaceId }),
          );
        }
        if (
          facts.targetMembership.role === "owner" &&
          command.role !== "owner" &&
          facts.activeOwnerCount <= 1
        ) {
          return yield* Effect.fail(new LastWorkspaceOwner({ workspaceId: command.workspaceId }));
        }
        if (facts.targetMembership.role === command.role) {
          return {
            outcome: WorkspaceRoleUnchanged.make({
              workspaceId: command.workspaceId,
              workspaceIdentityId: command.workspaceIdentityId,
              role: command.role,
              occurredAt,
            }),
            auditEvent: undefined,
          } satisfies TransitionCommit<WorkspaceRoleUnchangedType>;
        }

        const previousRole = facts.targetMembership.role;
        yield* transaction.updateMemberRole(
          command.workspaceId,
          command.workspaceIdentityId,
          command.role,
        );
        return {
          outcome: WorkspaceRoleChanged.make({
            workspaceId: command.workspaceId,
            workspaceIdentityId: command.workspaceIdentityId,
            previousRole,
            role: command.role,
            occurredAt,
          }),
          auditEvent: makeAuditEvent(command.actorAccountId, occurredAt, {
            type: "workspace.role_changed",
            metadata: {
              workspaceId: command.workspaceId,
              workspaceIdentityId: command.workspaceIdentityId,
              previousRole,
              role: command.role,
            },
          }),
        } satisfies TransitionCommit<WorkspaceRoleChangedType>;
      }),
    );
  });

  const removeFullMember = Effect.fn("WorkspaceAccess.removeFullMember")(function* (
    unvalidatedCommand: RemoveFullMemberCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(RemoveFullMemberCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) =>
        Effect.logError("WorkspaceAccess.removeFullMember.validate", cause),
      ),
      Effect.mapError(() => internalFailure("WorkspaceAccess.removeFullMember.validate")),
    );
    return yield* commitTransition<FullMemberRemovedType, RemoveFullMemberFailure>(
      "WorkspaceAccess.removeFullMember",
      (transaction, occurredAt) =>
        Effect.gen(function* () {
          const facts = yield* transaction.serializeFullMemberAdministration(
            command.actorAccountId,
            command.workspaceId,
            command.workspaceIdentityId,
          );
          if (facts.workspace === undefined || facts.membership === undefined) {
            return yield* Effect.fail(
              new WorkspaceUnavailable({ workspaceId: command.workspaceId }),
            );
          }
          if (
            facts.targetIdentity === undefined ||
            facts.targetMembership === undefined ||
            facts.targetMembership.role === "guest"
          ) {
            return yield* Effect.fail(
              new FullMemberUnavailable({
                workspaceId: command.workspaceId,
                workspaceIdentityId: command.workspaceIdentityId,
              }),
            );
          }
          if (!canRemoveFullMember(facts.membership.role, facts.targetMembership.role)) {
            return yield* Effect.fail(
              new WorkspaceAdministrationForbidden({ workspaceId: command.workspaceId }),
            );
          }
          if (facts.targetMembership.role === "owner" && facts.activeOwnerCount <= 1) {
            return yield* Effect.fail(new LastWorkspaceOwner({ workspaceId: command.workspaceId }));
          }

          yield* transaction.endFullMemberAndRevokeChannels(
            command.workspaceId,
            command.workspaceIdentityId,
            occurredAt,
          );
          return {
            outcome: FullMemberRemoved.make({
              workspaceId: command.workspaceId,
              workspaceIdentityId: command.workspaceIdentityId,
              endedAt: occurredAt,
            }),
            auditEvent: makeAuditEvent(command.actorAccountId, occurredAt, {
              type: "workspace.membership_ended",
              metadata: {
                workspaceId: command.workspaceId,
                workspaceIdentityId: command.workspaceIdentityId,
                reason: "removed_by_administrator",
              },
            }),
          } satisfies TransitionCommit<FullMemberRemovedType>;
        }),
    );
  });

  return WorkspaceAccess.of({
    listForActor: Effect.fn("WorkspaceAccess.listForActor")((actorAccountId) =>
      persistence
        .listActiveAccess(actorAccountId)
        .pipe(
          Effect.catchTag("Application.WorkspaceAccessPersistenceFailure", () =>
            Effect.fail(internalFailure("WorkspaceAccess.listForActor")),
          ),
        ),
    ),
    getForActor: Effect.fn("WorkspaceAccess.getForActor")(function* (actorAccountId, workspaceId) {
      const access = yield* readActiveAccess(actorAccountId, workspaceId);
      if (access === undefined) {
        return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId }));
      }
      return access;
    }),
    listInvitationsForActor: Effect.fn("WorkspaceAccess.listInvitationsForActor")(
      function* (actorAccountId) {
        const now = yield* Clock.currentTimeMillis;
        return yield* persistence
          .listPendingInvitations(actorAccountId, new Date(now))
          .pipe(
            Effect.catchTag("Application.WorkspaceAccessPersistenceFailure", () =>
              Effect.fail(internalFailure("WorkspaceAccess.listInvitationsForActor")),
            ),
          );
      },
    ),
    listPendingInvitationsForAdministrator: Effect.fn(
      "WorkspaceAccess.listPendingInvitationsForAdministrator",
    )(function* (actorAccountId, workspaceId) {
      const access = yield* readActiveAccess(actorAccountId, workspaceId);
      if (access === undefined) {
        return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId }));
      }
      if (!isWorkspaceAdministrator(access.membership.role)) {
        return yield* Effect.fail(new WorkspaceAdministrationForbidden({ workspaceId }));
      }
      const now = new Date(yield* Clock.currentTimeMillis);
      const invitations = yield* persistence
        .listPendingInvitationsForAdministrator(actorAccountId, workspaceId, now)
        .pipe(
          Effect.catchTag("Application.WorkspaceAccessPersistenceFailure", () =>
            Effect.fail(internalFailure("WorkspaceAccess.listPendingInvitationsForAdministrator")),
          ),
        );
      if (invitations === undefined) {
        return yield* Effect.fail(new WorkspaceAdministrationForbidden({ workspaceId }));
      }
      return invitations;
    }),
    listFullMembersForActor: Effect.fn("WorkspaceAccess.listFullMembersForActor")(
      function* (actorAccountId, workspaceId) {
        const access = yield* readActiveAccess(actorAccountId, workspaceId);
        if (access === undefined) {
          return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId }));
        }
        if (!isWorkspaceAdministrator(access.membership.role)) {
          return yield* Effect.fail(new WorkspaceAdministrationForbidden({ workspaceId }));
        }
        const members = yield* persistence
          .listFullMembersForAdministrator(actorAccountId, workspaceId)
          .pipe(
            Effect.catchTag("Application.WorkspaceAccessPersistenceFailure", () =>
              Effect.fail(internalFailure("WorkspaceAccess.listFullMembersForActor")),
            ),
          );
        if (members === undefined) {
          return yield* Effect.fail(new WorkspaceAdministrationForbidden({ workspaceId }));
        }
        return members;
      },
    ),
    create,
    updateMyIdentity,
    leave,
    inviteMember,
    resendInvitation,
    revokeInvitation,
    acceptInvitation,
    redeemInvitation,
    changeMemberRole,
    removeFullMember,
  });
});

export const WorkspaceAccessLive: Layer.Layer<
  WorkspaceAccess,
  never,
  WorkspaceAccessPersistence | WorkspaceInvitationNotifier
> = Layer.effect(WorkspaceAccess, make);
