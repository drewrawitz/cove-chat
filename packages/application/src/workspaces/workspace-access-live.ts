import { WorkspaceIdentity, WorkspaceId, WorkspaceMembership, type UserId } from "@cove/domain";
import { Clock, Effect, Layer, Schema } from "effect";
import {
  type AlreadyWorkspaceMember,
  AlreadyWorkspaceMember as AlreadyWorkspaceMemberError,
  type CreateWorkspaceCommand as CreateWorkspaceCommandType,
  CreateWorkspaceCommand,
  ExistingWorkspaceIdentityProfileNotAccepted,
  FirstMembershipStarted,
  type FirstMembershipStarted as FirstMembershipStartedType,
  IdentityProfileUnchanged,
  type IdentityProfileUnchanged as IdentityProfileUnchangedType,
  InitialWorkspaceIdentityProfileRequired,
  JoinWorkspaceCommand,
  type JoinWorkspaceCommand as JoinWorkspaceCommandType,
  LastWorkspaceOwner,
  LeaveWorkspaceCommand,
  type LeaveWorkspaceCommand as LeaveWorkspaceCommandType,
  UpdateWorkspaceIdentityCommand,
  type UpdateWorkspaceIdentityCommand as UpdateWorkspaceIdentityCommandType,
  WorkspaceIdentityUpdated,
  type WorkspaceIdentityUpdated as WorkspaceIdentityUpdatedType,
  WorkspaceMembershipEnded,
  type WorkspaceMembershipEnded as WorkspaceMembershipEndedType,
  WorkspaceMembershipReactivated,
  type WorkspaceMembershipReactivated as WorkspaceMembershipReactivatedType,
  type WorkspaceCreated as WorkspaceCreatedType,
  WorkspaceCreated,
  WorkspaceAccess,
  WorkspaceAccessFailure,
  WorkspaceAccessView,
  WorkspaceUnavailable,
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

type JoinTransitionFailure =
  | AlreadyWorkspaceMember
  | ExistingWorkspaceIdentityProfileNotAccepted
  | InitialWorkspaceIdentityProfileRequired
  | WorkspaceUnavailable;

const internalFailure = (operation: string) => new WorkspaceAccessFailure({ operation });

const makeAuditEvent = (
  actorAccountId: UserId,
  occurredAt: Date,
  details: WorkspaceAccessAuditDetails,
): WorkspaceAccessAuditEvent => ({
  id: globalThis.crypto.randomUUID(),
  version: 1,
  actorAccountId,
  occurredAt,
  ...details,
});

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

  const join = Effect.fn("WorkspaceAccess.join")(function* (
    unvalidatedCommand: JoinWorkspaceCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(JoinWorkspaceCommand)(
      unvalidatedCommand,
    ).pipe(
      Effect.tapError((cause) => Effect.logError("WorkspaceAccess.join.validate", cause)),
      Effect.mapError(() => internalFailure("WorkspaceAccess.join.validate")),
    );
    return yield* commitTransition<
      FirstMembershipStartedType | WorkspaceMembershipReactivatedType,
      JoinTransitionFailure
    >("WorkspaceAccess.join", (transaction, occurredAt) =>
      Effect.gen(function* () {
        const facts = yield* transaction.serializeAccountWorkspaceRelationship(
          command.actorAccountId,
          command.workspaceId,
        );
        if (facts.workspace === undefined) {
          return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId: command.workspaceId }));
        }
        if (facts.membership !== undefined) {
          return yield* Effect.fail(
            new AlreadyWorkspaceMemberError({ workspaceId: command.workspaceId }),
          );
        }

        if (facts.identity === undefined) {
          if (command.initialIdentityProfile === undefined) {
            return yield* Effect.fail(
              new InitialWorkspaceIdentityProfileRequired({
                workspaceId: command.workspaceId,
              }),
            );
          }
          const workspaceIdentityId = WorkspaceIdentity.fields.id.make(
            globalThis.crypto.randomUUID(),
          );
          const access = WorkspaceAccessView.make({
            workspace: facts.workspace,
            identity: {
              id: workspaceIdentityId,
              workspaceId: command.workspaceId,
              accountId: command.actorAccountId,
              ...command.initialIdentityProfile,
            },
            membership: {
              workspaceId: command.workspaceId,
              identityId: workspaceIdentityId,
              role: "member",
              startedAt: occurredAt,
            },
          });
          yield* transaction.startFirstMembership(access);
          const outcome = FirstMembershipStarted.make({
            workspaceId: command.workspaceId,
            workspaceIdentityId,
            occurredAt,
          });
          return {
            outcome,
            auditEvent: makeAuditEvent(command.actorAccountId, occurredAt, {
              type: "workspace.membership_started",
              metadata: {
                workspaceId: command.workspaceId,
                workspaceIdentityId,
              },
            }),
          } satisfies TransitionCommit<FirstMembershipStartedType>;
        }

        if (command.initialIdentityProfile !== undefined) {
          return yield* Effect.fail(
            new ExistingWorkspaceIdentityProfileNotAccepted({
              workspaceId: command.workspaceId,
            }),
          );
        }

        const membership = WorkspaceMembership.make({
          workspaceId: command.workspaceId,
          identityId: facts.identity.id,
          role: "member",
          startedAt: occurredAt,
        });
        yield* transaction.reactivateMembership(facts.identity, membership);
        const outcome = WorkspaceMembershipReactivated.make({
          workspaceId: command.workspaceId,
          workspaceIdentityId: facts.identity.id,
          occurredAt,
        });
        return {
          outcome,
          auditEvent: makeAuditEvent(command.actorAccountId, occurredAt, {
            type: "workspace.membership_reactivated",
            metadata: {
              workspaceId: command.workspaceId,
              workspaceIdentityId: facts.identity.id,
            },
          }),
        } satisfies TransitionCommit<WorkspaceMembershipReactivatedType>;
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
    create,
    join,
    updateMyIdentity,
    leave,
  });
});

export const WorkspaceAccessLive: Layer.Layer<WorkspaceAccess, never, WorkspaceAccessPersistence> =
  Layer.effect(WorkspaceAccess, make);
