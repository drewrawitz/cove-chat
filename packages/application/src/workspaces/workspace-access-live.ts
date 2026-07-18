import { WorkspaceIdentity, WorkspaceId, WorkspaceMembership, type UserId } from "@cove/domain";
import { Clock, Effect, Layer, Schedule, Schema } from "effect";
import {
  type AlreadyWorkspaceMember,
  AlreadyWorkspaceMember as AlreadyWorkspaceMemberError,
  type CommandId,
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
  WorkspaceAccessCommandConflict,
  WorkspaceAccessFailure,
  WorkspaceAccessView,
  WorkspaceUnavailable,
} from "./workspace-access.ts";
import {
  type WorkspaceAccessAuditEvent,
  type WorkspaceAccessCommandKind,
  WorkspaceAccessPersistence,
  WorkspaceAccessPersistenceFailure,
  type WorkspaceAccessTransaction,
} from "./workspace-access-persistence.ts";

interface TransitionCommit<A> {
  readonly outcome: A;
  readonly auditEvent: WorkspaceAccessAuditEvent | undefined;
}

type JoinTransitionFailure =
  | AlreadyWorkspaceMember
  | ExistingWorkspaceIdentityProfileNotAccepted
  | InitialWorkspaceIdentityProfileRequired
  | WorkspaceUnavailable;

const StoredWorkspaceAccessOutcome = Schema.Union([
  WorkspaceCreated,
  FirstMembershipStarted,
  WorkspaceMembershipReactivated,
  WorkspaceIdentityUpdated,
  IdentityProfileUnchanged,
  WorkspaceMembershipEnded,
]);

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

const internalFailure = (operation: string) => new WorkspaceAccessFailure({ operation });

const fingerprint = Effect.fn("WorkspaceAccess.fingerprint")((value: unknown) =>
  Effect.tryPromise({
    try: async () => {
      const canonicalInput = JSON.stringify(canonicalize(value));
      const digest = new Uint8Array(
        await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalInput)),
      );
      return `v1:sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
        "",
      )}`;
    },
    catch: () => internalFailure("WorkspaceAccess.fingerprint"),
  }),
);

const isPersistenceFailure = (error: unknown): error is WorkspaceAccessPersistenceFailure =>
  error instanceof WorkspaceAccessPersistenceFailure;

const isRetryablePersistenceFailure = (error: unknown): boolean =>
  isPersistenceFailure(error) && error.retryable;

const persistenceRetrySchedule = Schedule.recurs(2).pipe(
  Schedule.while(({ input }) => isRetryablePersistenceFailure(input)),
);

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

  const commitTransition = <A, E>(options: {
    readonly actorAccountId: UserId;
    readonly commandId: CommandId;
    readonly commandKind: WorkspaceAccessCommandKind;
    readonly inputFingerprint: string;
    readonly decodeOutcome: (value: unknown) => Effect.Effect<A, WorkspaceAccessFailure>;
    readonly transition: (
      transaction: WorkspaceAccessTransaction,
      occurredAt: Date,
    ) => Effect.Effect<TransitionCommit<A>, E | WorkspaceAccessPersistenceFailure>;
  }): Effect.Effect<A, E | WorkspaceAccessCommandConflict | WorkspaceAccessFailure> =>
    persistence
      .transact((transaction) =>
        Effect.gen(function* () {
          const committed = yield* transaction.inspectCommittedCommand(
            options.actorAccountId,
            options.commandId,
          );

          if (committed !== undefined) {
            if (
              committed.commandKind !== options.commandKind ||
              committed.inputFingerprint !== options.inputFingerprint
            ) {
              return yield* Effect.fail(
                new WorkspaceAccessCommandConflict({ commandId: options.commandId }),
              );
            }

            return yield* options.decodeOutcome(committed.outcome);
          }

          const occurredAt = new Date(yield* Clock.currentTimeMillis);
          const committedTransition = yield* options.transition(transaction, occurredAt);
          if (committedTransition.auditEvent !== undefined) {
            yield* transaction.appendAudit(committedTransition.auditEvent);
          }
          const encodedOutcome = yield* Schema.encodeUnknownEffect(StoredWorkspaceAccessOutcome)(
            committedTransition.outcome,
          ).pipe(
            Effect.mapError(() => internalFailure(`WorkspaceAccess.${options.commandKind}.encode`)),
          );
          yield* transaction.storeCommittedOutcome({
            actorAccountId: options.actorAccountId,
            commandId: options.commandId,
            commandKind: options.commandKind,
            inputFingerprint: options.inputFingerprint,
            outcomeVersion: 1,
            outcome: encodedOutcome,
            committedAt: occurredAt,
          });
          return committedTransition.outcome;
        }),
      )
      .pipe(
        Effect.retry(persistenceRetrySchedule),
        Effect.catchTag("Application.WorkspaceAccessPersistenceFailure", () =>
          Effect.fail(internalFailure(`WorkspaceAccess.${options.commandKind}`)),
        ),
      );

  const create = Effect.fn("WorkspaceAccess.create")(function* (
    unvalidatedCommand: CreateWorkspaceCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(CreateWorkspaceCommand)(
      unvalidatedCommand,
    ).pipe(Effect.mapError(() => internalFailure("WorkspaceAccess.create.validate")));
    const inputFingerprint = yield* fingerprint({
      workspaceName: command.workspaceName,
      initialIdentityProfile: command.initialIdentityProfile,
    });

    return yield* commitTransition<WorkspaceCreatedType, never>({
      actorAccountId: command.actorAccountId,
      commandId: command.commandId,
      commandKind: "create_workspace",
      inputFingerprint,
      decodeOutcome: (value) =>
        Schema.decodeUnknownEffect(WorkspaceCreated)(value).pipe(
          Effect.mapError(() => internalFailure("WorkspaceAccess.create.decodeOutcome")),
        ),
      transition: (transaction, occurredAt) =>
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
            auditEvent: {
              id: globalThis.crypto.randomUUID(),
              type: "workspace.created",
              version: 1,
              actorAccountId: command.actorAccountId,
              occurredAt,
              metadata: {
                commandId: command.commandId,
                workspaceId,
                workspaceIdentityId,
              },
            },
          } satisfies TransitionCommit<WorkspaceCreatedType>;
        }),
    });
  });

  const join = Effect.fn("WorkspaceAccess.join")(function* (
    unvalidatedCommand: JoinWorkspaceCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(JoinWorkspaceCommand)(
      unvalidatedCommand,
    ).pipe(Effect.mapError(() => internalFailure("WorkspaceAccess.join.validate")));
    const profileFingerprint =
      command.initialIdentityProfile === undefined
        ? { presence: "absent" as const }
        : { presence: "supplied" as const, value: command.initialIdentityProfile };
    const inputFingerprint = yield* fingerprint({
      workspaceId: command.workspaceId,
      initialIdentityProfile: profileFingerprint,
    });

    return yield* commitTransition<
      FirstMembershipStartedType | WorkspaceMembershipReactivatedType,
      JoinTransitionFailure
    >({
      actorAccountId: command.actorAccountId,
      commandId: command.commandId,
      commandKind: "join_workspace",
      inputFingerprint,
      decodeOutcome: (value) =>
        Schema.decodeUnknownEffect(
          Schema.Union([FirstMembershipStarted, WorkspaceMembershipReactivated]),
        )(value).pipe(Effect.mapError(() => internalFailure("WorkspaceAccess.join.decodeOutcome"))),
      transition: (transaction, occurredAt) =>
        Effect.gen(function* () {
          const facts = yield* transaction.serializeAccountWorkspaceRelationship(
            command.actorAccountId,
            command.workspaceId,
          );
          if (facts.workspace === undefined) {
            return yield* Effect.fail(
              new WorkspaceUnavailable({ workspaceId: command.workspaceId }),
            );
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
              auditEvent: {
                id: globalThis.crypto.randomUUID(),
                type: "workspace.membership_started",
                version: 1,
                actorAccountId: command.actorAccountId,
                occurredAt,
                metadata: {
                  commandId: command.commandId,
                  workspaceId: command.workspaceId,
                  workspaceIdentityId,
                },
              },
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
            auditEvent: {
              id: globalThis.crypto.randomUUID(),
              type: "workspace.membership_reactivated",
              version: 1,
              actorAccountId: command.actorAccountId,
              occurredAt,
              metadata: {
                commandId: command.commandId,
                workspaceId: command.workspaceId,
                workspaceIdentityId: facts.identity.id,
              },
            },
          } satisfies TransitionCommit<WorkspaceMembershipReactivatedType>;
        }),
    });
  });

  const updateMyIdentity = Effect.fn("WorkspaceAccess.updateMyIdentity")(function* (
    unvalidatedCommand: UpdateWorkspaceIdentityCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(UpdateWorkspaceIdentityCommand)(
      unvalidatedCommand,
    ).pipe(Effect.mapError(() => internalFailure("WorkspaceAccess.updateMyIdentity.validate")));
    const inputFingerprint = yield* fingerprint({
      workspaceId: command.workspaceId,
      profile: command.profile,
    });

    return yield* commitTransition<
      IdentityProfileUnchangedType | WorkspaceIdentityUpdatedType,
      WorkspaceUnavailable
    >({
      actorAccountId: command.actorAccountId,
      commandId: command.commandId,
      commandKind: "update_workspace_identity",
      inputFingerprint,
      decodeOutcome: (value) =>
        Schema.decodeUnknownEffect(
          Schema.Union([IdentityProfileUnchanged, WorkspaceIdentityUpdated]),
        )(value).pipe(
          Effect.mapError(() => internalFailure("WorkspaceAccess.updateMyIdentity.decodeOutcome")),
        ),
      transition: (transaction, occurredAt) =>
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
            return yield* Effect.fail(
              new WorkspaceUnavailable({ workspaceId: command.workspaceId }),
            );
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
            auditEvent: {
              id: globalThis.crypto.randomUUID(),
              type: "workspace.identity_profile_changed",
              version: 1,
              actorAccountId: command.actorAccountId,
              occurredAt,
              metadata: {
                commandId: command.commandId,
                workspaceId: command.workspaceId,
                workspaceIdentityId: facts.identity.id,
                changedFields,
              },
            },
          } satisfies TransitionCommit<WorkspaceIdentityUpdatedType>;
        }),
    });
  });

  const leave = Effect.fn("WorkspaceAccess.leave")(function* (
    unvalidatedCommand: LeaveWorkspaceCommandType,
  ) {
    const command = yield* Schema.decodeUnknownEffect(LeaveWorkspaceCommand)(
      unvalidatedCommand,
    ).pipe(Effect.mapError(() => internalFailure("WorkspaceAccess.leave.validate")));
    const inputFingerprint = yield* fingerprint({ workspaceId: command.workspaceId });

    return yield* commitTransition<
      WorkspaceMembershipEndedType,
      LastWorkspaceOwner | WorkspaceUnavailable
    >({
      actorAccountId: command.actorAccountId,
      commandId: command.commandId,
      commandKind: "leave_workspace",
      inputFingerprint,
      decodeOutcome: (value) =>
        Schema.decodeUnknownEffect(WorkspaceMembershipEnded)(value).pipe(
          Effect.mapError(() => internalFailure("WorkspaceAccess.leave.decodeOutcome")),
        ),
      transition: (transaction, occurredAt) =>
        Effect.gen(function* () {
          const facts = yield* transaction.serializeWorkspaceTransition(
            command.actorAccountId,
            command.workspaceId,
          );
          if (facts.identity === undefined || facts.membership === undefined) {
            return yield* Effect.fail(
              new WorkspaceUnavailable({ workspaceId: command.workspaceId }),
            );
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
            auditEvent: {
              id: globalThis.crypto.randomUUID(),
              type: "workspace.membership_ended",
              version: 1,
              actorAccountId: command.actorAccountId,
              occurredAt,
              metadata: {
                commandId: command.commandId,
                workspaceId: command.workspaceId,
                workspaceIdentityId: facts.identity.id,
                reason: "voluntary_departure",
              },
            },
          } satisfies TransitionCommit<WorkspaceMembershipEndedType>;
        }),
    });
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
