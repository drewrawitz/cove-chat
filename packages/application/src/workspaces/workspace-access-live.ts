import {
  WorkspaceIdentity,
  WorkspaceId,
  WorkspaceInvitationId,
  WorkspaceMembership,
  type UserId,
  type WorkspaceRole,
} from "@cove/domain";
import { Clock, Effect, Layer, Schema } from "effect";
import {
  AcceptWorkspaceInvitationCommand,
  type AcceptWorkspaceInvitationCommand as AcceptWorkspaceInvitationCommandType,
  type AcceptWorkspaceInvitationFailure,
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
  type InviteWorkspaceMemberFailure,
  LastWorkspaceOwner,
  LeaveWorkspaceCommand,
  type LeaveWorkspaceCommand as LeaveWorkspaceCommandType,
  RemoveWorkspaceMemberCommand,
  type RemoveWorkspaceMemberCommand as RemoveWorkspaceMemberCommandType,
  type RemoveWorkspaceMemberFailure,
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
  WorkspaceInvitationAlreadyPending,
  WorkspaceInvitationCreated,
  type WorkspaceInvitationCreated as WorkspaceInvitationCreatedType,
  WorkspaceInvitationUnavailable,
  WorkspaceInviteeUnavailable,
  WorkspaceMemberRemoved,
  type WorkspaceMemberRemoved as WorkspaceMemberRemovedType,
  WorkspaceMemberUnavailable,
  WorkspaceUnavailable,
  WorkspaceRoleChanged,
  type WorkspaceRoleChanged as WorkspaceRoleChangedType,
  WorkspaceRoleUnchanged,
  type WorkspaceRoleUnchanged as WorkspaceRoleUnchangedType,
} from "./workspace-access.ts";
import {
  type WorkspaceAccessAuditEvent,
  WorkspaceAccessPersistence,
  WorkspaceAccessPersistenceFailure,
  type WorkspaceAccessTransaction,
} from "./workspace-access-persistence.ts";

interface TransitionCommit<A> {
  readonly outcome: A;
  readonly auditEvent: WorkspaceAccessAuditEvent | undefined;
}

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

function canRemoveWorkspaceMember(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
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
    return yield* commitTransition<WorkspaceInvitationCreatedType, InviteWorkspaceMemberFailure>(
      "WorkspaceAccess.inviteMember",
      (transaction, occurredAt) =>
        Effect.gen(function* () {
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
          if (facts.invitee === undefined) {
            return yield* Effect.fail(
              new WorkspaceInviteeUnavailable({ workspaceId: command.workspaceId }),
            );
          }
          if (facts.inviteeMembership !== undefined) {
            return yield* Effect.fail(
              new AlreadyWorkspaceMemberError({ workspaceId: command.workspaceId }),
            );
          }
          if (facts.pendingInvitation !== undefined) {
            return yield* Effect.fail(
              new WorkspaceInvitationAlreadyPending({ workspaceId: command.workspaceId }),
            );
          }

          const invitationId = WorkspaceInvitationId.make(globalThis.crypto.randomUUID());
          yield* transaction.createInvitation({
            id: invitationId,
            workspaceId: command.workspaceId,
            inviteeAccountId: facts.invitee.id,
            invitedByAccountId: command.actorAccountId,
            role: "member",
            invitedAt: occurredAt,
          });
          const outcome = WorkspaceInvitationCreated.make({
            invitationId,
            workspaceId: command.workspaceId,
            inviteeAccountId: facts.invitee.id,
            occurredAt,
          });
          return {
            outcome,
            auditEvent: makeAuditEvent(command.actorAccountId, occurredAt, {
              type: "workspace.member_invited",
              metadata: {
                workspaceId: command.workspaceId,
                invitationId,
                inviteeAccountId: facts.invitee.id,
              },
            }),
          } satisfies TransitionCommit<WorkspaceInvitationCreatedType>;
        }),
    );
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
          workspaceIdentityId = WorkspaceIdentity.fields.id.make(globalThis.crypto.randomUUID());
          yield* transaction.startFirstMembership(
            WorkspaceAccessView.make({
              workspace: facts.workspace,
              identity: {
                id: workspaceIdentityId,
                workspaceId: facts.invitation.workspaceId,
                accountId: command.actorAccountId,
                ...command.initialIdentityProfile,
              },
              membership: {
                workspaceId: facts.invitation.workspaceId,
                identityId: workspaceIdentityId,
                role: "member",
                startedAt: occurredAt,
              },
            }),
          );
        } else {
          if (command.initialIdentityProfile !== undefined) {
            return yield* Effect.fail(
              new ExistingWorkspaceIdentityProfileNotAccepted({
                workspaceId: facts.invitation.workspaceId,
              }),
            );
          }
          workspaceIdentityId = facts.identity.id;
          yield* transaction.reactivateMembership(
            facts.identity,
            WorkspaceMembership.make({
              workspaceId: facts.invitation.workspaceId,
              identityId: workspaceIdentityId,
              role: "member",
              startedAt: occurredAt,
            }),
          );
        }
        yield* transaction.acceptInvitation(command.invitationId, occurredAt);

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
        const facts = yield* transaction.serializeMemberAdministration(
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
            new WorkspaceMemberUnavailable({
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

  const removeMember = Effect.fn("WorkspaceAccess.removeMember")(function* (
    unvalidatedCommand: RemoveWorkspaceMemberCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(RemoveWorkspaceMemberCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) => Effect.logError("WorkspaceAccess.removeMember.validate", cause)),
      Effect.mapError(() => internalFailure("WorkspaceAccess.removeMember.validate")),
    );
    return yield* commitTransition<WorkspaceMemberRemovedType, RemoveWorkspaceMemberFailure>(
      "WorkspaceAccess.removeMember",
      (transaction, occurredAt) =>
        Effect.gen(function* () {
          const facts = yield* transaction.serializeMemberAdministration(
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
              new WorkspaceMemberUnavailable({
                workspaceId: command.workspaceId,
                workspaceIdentityId: command.workspaceIdentityId,
              }),
            );
          }
          if (!canRemoveWorkspaceMember(facts.membership.role, facts.targetMembership.role)) {
            return yield* Effect.fail(
              new WorkspaceAdministrationForbidden({ workspaceId: command.workspaceId }),
            );
          }
          if (facts.targetMembership.role === "owner" && facts.activeOwnerCount <= 1) {
            return yield* Effect.fail(new LastWorkspaceOwner({ workspaceId: command.workspaceId }));
          }

          yield* transaction.endMemberAndRevokeChannels(
            command.workspaceId,
            command.workspaceIdentityId,
            occurredAt,
          );
          return {
            outcome: WorkspaceMemberRemoved.make({
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
          } satisfies TransitionCommit<WorkspaceMemberRemovedType>;
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
      (actorAccountId) =>
        persistence
          .listPendingInvitations(actorAccountId)
          .pipe(
            Effect.catchTag("Application.WorkspaceAccessPersistenceFailure", () =>
              Effect.fail(internalFailure("WorkspaceAccess.listInvitationsForActor")),
            ),
          ),
    ),
    listMembersForActor: Effect.fn("WorkspaceAccess.listMembersForActor")(
      function* (actorAccountId, workspaceId) {
        const access = yield* readActiveAccess(actorAccountId, workspaceId);
        if (access === undefined) {
          return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId }));
        }
        if (!isWorkspaceAdministrator(access.membership.role)) {
          return yield* Effect.fail(new WorkspaceAdministrationForbidden({ workspaceId }));
        }
        const members = yield* persistence
          .listMembersForAdministrator(actorAccountId, workspaceId)
          .pipe(
            Effect.catchTag("Application.WorkspaceAccessPersistenceFailure", () =>
              Effect.fail(internalFailure("WorkspaceAccess.listMembersForActor")),
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
    acceptInvitation,
    changeMemberRole,
    removeMember,
  });
});

export const WorkspaceAccessLive: Layer.Layer<WorkspaceAccess, never, WorkspaceAccessPersistence> =
  Layer.effect(WorkspaceAccess, make);
