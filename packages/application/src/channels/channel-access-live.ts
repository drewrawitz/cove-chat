import {
  Channel,
  type ChannelId,
  type ChannelVisibility,
  type UserId,
  type WorkspaceId,
  type WorkspaceIdentityId,
  type WorkspaceRole,
  canViewChannel,
} from "@cove/domain";
import {
  AuditEvent,
  AuditEventWriter,
  type ChannelAccessRecord,
  ChannelAccessRepository,
  type ChannelIdentityRecord,
  type PersistenceError,
  TransactionManager,
} from "@cove/ports";
import { Clock, Effect, Layer } from "effect";
import { FullMemberUnavailable, WorkspaceUnavailable } from "../workspaces/workspace-access.ts";
import {
  ChannelAccess,
  ChannelAccessFailure,
  ChannelAdministrationForbidden,
  PrivateChannelMaintainerCannotLeave,
  ChannelMaintainerView,
  ChannelMemberView,
  ChannelView,
  ChannelMembershipRosterView,
  ChannelMemberUnavailable,
  type AddChannelMemberCommand,
  type CreatePrivateChannelCommand,
  type CreatePublicChannelCommand,
  type LeaveChannelCommand,
} from "./channel-access.ts";
import { ChannelUnavailable } from "./get-channel-for-actor.ts";

function isWorkspaceAdministrator(role: WorkspaceRole): role is "admin" | "owner" {
  return role === "owner" || role === "admin";
}

function isFullMember(role: WorkspaceRole): role is "admin" | "member" | "owner" {
  return role !== "guest";
}

function canActorViewChannel(actor: ChannelIdentityRecord, record: ChannelAccessRecord): boolean {
  return canViewChannel({
    visibility: record.channel.visibility,
    isWorkspaceMember: actor.role !== "guest" || record.hasChannelMembership,
    isChannelMember: record.hasChannelMembership,
  });
}

function maintainerView(identity: ChannelIdentityRecord): ChannelMaintainerView {
  return ChannelMaintainerView.make({
    id: identity.id,
    name: identity.name,
    avatarUrl: identity.avatarUrl,
  });
}

function channelView(record: ChannelAccessRecord): ChannelView {
  return ChannelView.make({
    channel: record.channel,
    maintainer: maintainerView(record.maintainer),
    hasChannelMembership: record.hasChannelMembership,
  });
}

interface ChannelMembershipAuditEventInput {
  readonly action: "added" | "removed";
  readonly actorId: UserId;
  readonly channelId: ChannelId;
  readonly occurredAt: Date;
  readonly visibility: ChannelVisibility;
  readonly workspaceId: WorkspaceId;
  readonly workspaceIdentityId: WorkspaceIdentityId;
}

function channelMembershipAuditEvent(input: ChannelMembershipAuditEventInput): AuditEvent {
  const fields = {
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    version: 1 as const,
    metadata: {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      workspaceIdentityId: input.workspaceIdentityId,
    },
  };
  if (input.action === "added") {
    return input.visibility === "private"
      ? AuditEvent.cases["channel.private_membership_added"].make(fields)
      : AuditEvent.cases["channel.public_membership_added"].make(fields);
  }
  return input.visibility === "private"
    ? AuditEvent.cases["channel.private_membership_removed"].make(fields)
    : AuditEvent.cases["channel.public_membership_removed"].make(fields);
}

const make = Effect.gen(function* () {
  const auditEvents = yield* AuditEventWriter;
  const repository = yield* ChannelAccessRepository;
  const transactions = yield* TransactionManager;

  const internalFailure = (operation: string) => new ChannelAccessFailure({ operation });
  const recoverPersistence = <A, E, R>(
    operation: string,
    effect: Effect.Effect<A, E | PersistenceError, R>,
  ): Effect.Effect<A, E | ChannelAccessFailure, R> =>
    effect.pipe(
      Effect.catchTag("Ports.PersistenceError", () => Effect.fail(internalFailure(operation))),
    );

  const readActor = Effect.fn("ChannelAccess.readActor")(function* (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) {
    const actor = yield* repository.readActiveActor(actorAccountId, workspaceId);
    if (actor === undefined) {
      return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId }));
    }
    return actor;
  });

  const findVisibleChannel = Effect.fn("ChannelAccess.findVisibleChannel")(function* (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) {
    const actor = yield* repository.readActiveActor(actorAccountId, workspaceId);
    if (actor === undefined) {
      return yield* Effect.fail(new ChannelUnavailable({ channelId }));
    }
    const record = yield* repository.findById(workspaceId, actor.id, channelId);
    if (record === undefined || !canActorViewChannel(actor, record)) {
      return yield* Effect.fail(new ChannelUnavailable({ channelId }));
    }
    return record;
  });

  const membershipRosterView = Effect.fn("ChannelAccess.membershipRosterView")(function* (
    workspaceId: WorkspaceId,
    record: ChannelAccessRecord,
  ) {
    const members = yield* repository.listMembers(workspaceId, record.channel.id);
    return ChannelMembershipRosterView.make({
      channel: record.channel,
      maintainer: maintainerView(record.maintainer),
      members: members.map((member) =>
        ChannelMemberView.make({
          id: member.id,
          name: member.name,
          avatarUrl: member.avatarUrl,
        }),
      ),
      actorHasChannelMembership: record.hasChannelMembership,
    });
  });

  const create = Effect.fn("ChannelAccess.create")(function* (
    command: CreatePublicChannelCommand | CreatePrivateChannelCommand,
    visibility: ChannelVisibility,
  ) {
    return yield* transactions.run(
      Effect.gen(function* () {
        const actor = yield* repository.lockActiveActor(
          command.actorAccountId,
          command.workspaceId,
        );
        if (actor === undefined || !isFullMember(actor.role)) {
          return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId: command.workspaceId }));
        }

        const channel = Channel.make({
          id: command.channelId,
          workspaceId: command.workspaceId,
          name: command.name,
          purpose: command.purpose,
          visibility,
          maintainerIdentityId: actor.id,
        });
        yield* repository.insert(channel);
        yield* repository.addMembership(command.workspaceId, command.channelId, actor.id);

        if (visibility === "private") {
          const now = yield* Clock.currentTimeMillis;
          yield* auditEvents.append(
            channelMembershipAuditEvent({
              action: "added",
              actorId: command.actorAccountId,
              channelId: command.channelId,
              occurredAt: new Date(now),
              visibility,
              workspaceId: command.workspaceId,
              workspaceIdentityId: actor.id,
            }),
          );
        }

        return channelView({ channel, maintainer: actor, hasChannelMembership: true });
      }),
    );
  });

  const lockMembershipParticipants = Effect.fn("ChannelAccess.lockMembershipParticipants")(
    function* (command: AddChannelMemberCommand) {
      const actorSnapshot = yield* repository.readActiveActor(
        command.actorAccountId,
        command.workspaceId,
      );
      if (actorSnapshot === undefined) {
        return { actor: undefined, member: undefined };
      }

      if (actorSnapshot.id.localeCompare(command.workspaceIdentityId) <= 0) {
        const actor = yield* repository.lockActiveActor(
          command.actorAccountId,
          command.workspaceId,
        );
        const member = yield* repository.lockActiveIdentity(
          command.workspaceId,
          command.workspaceIdentityId,
        );
        return { actor, member };
      }

      const member = yield* repository.lockActiveIdentity(
        command.workspaceId,
        command.workspaceIdentityId,
      );
      const actor = yield* repository.lockActiveActor(command.actorAccountId, command.workspaceId);
      return { actor, member };
    },
  );

  return ChannelAccess.of({
    listPublicForActor: Effect.fn("ChannelAccess.listPublicForActor")(
      function* (actorAccountId, workspaceId) {
        const actor = yield* readActor(actorAccountId, workspaceId);
        const channels = yield* repository.listPublic(workspaceId, actor.id);
        return channels.filter((record) => canActorViewChannel(actor, record)).map(channelView);
      },
      (effect) => recoverPersistence("ChannelAccess.listPublicForActor", effect),
    ),
    getPublicForActor: Effect.fn("ChannelAccess.getPublicForActor")(
      function* (actorAccountId, workspaceId, channelId) {
        const record = yield* findVisibleChannel(actorAccountId, workspaceId, channelId);
        if (record.channel.visibility !== "public") {
          return yield* Effect.fail(new ChannelUnavailable({ channelId }));
        }
        return channelView(record);
      },
      (effect) => recoverPersistence("ChannelAccess.getPublicForActor", effect),
    ),
    getForActor: Effect.fn("ChannelAccess.getForActor")(
      function* (actorAccountId, workspaceId, channelId) {
        return channelView(yield* findVisibleChannel(actorAccountId, workspaceId, channelId));
      },
      (effect) => recoverPersistence("ChannelAccess.getForActor", effect),
    ),
    createPublic: Effect.fn("ChannelAccess.createPublic")(
      (command) => create(command, "public"),
      (effect) => recoverPersistence("ChannelAccess.createPublic", effect),
    ),
    createPrivate: Effect.fn("ChannelAccess.createPrivate")(
      (command) => create(command, "private"),
      (effect) => recoverPersistence("ChannelAccess.createPrivate", effect),
    ),
    addMember: Effect.fn("ChannelAccess.addMember")(
      (command: AddChannelMemberCommand) =>
        transactions.run(
          Effect.gen(function* () {
            const { actor, member } = yield* lockMembershipParticipants(command);
            if (actor === undefined || !isFullMember(actor.role)) {
              return yield* Effect.fail(
                new WorkspaceUnavailable({ workspaceId: command.workspaceId }),
              );
            }

            const record = yield* repository.findById(
              command.workspaceId,
              actor.id,
              command.channelId,
            );
            const canAdminister =
              record !== undefined &&
              (isWorkspaceAdministrator(actor.role) ||
                record.channel.maintainerIdentityId === actor.id);
            if (!canAdminister) {
              return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
            }

            if (member === undefined) {
              return yield* Effect.fail(
                new ChannelMemberUnavailable({
                  workspaceId: command.workspaceId,
                  channelId: command.channelId,
                  workspaceIdentityId: command.workspaceIdentityId,
                }),
              );
            }
            if (record.channel.visibility === "private" && !isFullMember(member.role)) {
              return yield* Effect.fail(
                new FullMemberUnavailable({
                  workspaceId: command.workspaceId,
                  workspaceIdentityId: command.workspaceIdentityId,
                }),
              );
            }

            const added = yield* repository.addMembership(
              command.workspaceId,
              command.channelId,
              member.id,
            );
            if (added) {
              const now = yield* Clock.currentTimeMillis;
              yield* auditEvents.append(
                channelMembershipAuditEvent({
                  action: "added",
                  actorId: command.actorAccountId,
                  channelId: command.channelId,
                  occurredAt: new Date(now),
                  visibility: record.channel.visibility,
                  workspaceId: command.workspaceId,
                  workspaceIdentityId: member.id,
                }),
              );
            }

            return yield* membershipRosterView(command.workspaceId, {
              ...record,
              hasChannelMembership: record.hasChannelMembership || member.id === actor.id,
            });
          }),
        ),
      (effect) => recoverPersistence("ChannelAccess.addMember", effect),
    ),
    listPrivateForActor: Effect.fn("ChannelAccess.listPrivateForActor")(
      function* (actorAccountId, workspaceId) {
        const actor = yield* readActor(actorAccountId, workspaceId);
        const channels = yield* repository.listPrivate(workspaceId, actor.id);
        return channels.filter((record) => record.hasChannelMembership).map(channelView);
      },
      (effect) => recoverPersistence("ChannelAccess.listPrivateForActor", effect),
    ),
    listMemberCandidatesForActor: Effect.fn("ChannelAccess.listMemberCandidatesForActor")(
      function* (actorAccountId, workspaceId, channelId) {
        const actor = yield* repository.readActiveActor(actorAccountId, workspaceId);
        if (actor === undefined) {
          return yield* Effect.fail(new ChannelUnavailable({ channelId }));
        }
        const record = yield* repository.findById(workspaceId, actor.id, channelId);
        const canAdminister =
          record !== undefined &&
          (isWorkspaceAdministrator(actor.role) ||
            record.channel.maintainerIdentityId === actor.id);
        if (!canAdminister) {
          return yield* Effect.fail(new ChannelUnavailable({ channelId }));
        }
        const candidates = yield* repository.listMemberCandidates(workspaceId, channelId);
        return candidates
          .filter(
            (candidate) => record.channel.visibility === "public" || isFullMember(candidate.role),
          )
          .map((candidate) =>
            ChannelMemberView.make({
              id: candidate.id,
              name: candidate.name,
              avatarUrl: candidate.avatarUrl,
            }),
          );
      },
      (effect) => recoverPersistence("ChannelAccess.listMemberCandidatesForActor", effect),
    ),
    listPrivateForAdministrator: Effect.fn("ChannelAccess.listPrivateForAdministrator")(
      function* (actorAccountId, workspaceId) {
        const actor = yield* readActor(actorAccountId, workspaceId);
        if (!isWorkspaceAdministrator(actor.role)) {
          return yield* Effect.fail(new ChannelAdministrationForbidden({ workspaceId }));
        }
        const channels = yield* repository.listPrivate(workspaceId, actor.id);
        return yield* Effect.forEach(channels, (record) =>
          membershipRosterView(workspaceId, record),
        );
      },
      (effect) => recoverPersistence("ChannelAccess.listPrivateForAdministrator", effect),
    ),
    getMembershipRosterForActor: Effect.fn("ChannelAccess.getMembershipRosterForActor")(
      function* (actorAccountId, workspaceId, channelId) {
        const actor = yield* repository.readActiveActor(actorAccountId, workspaceId);
        if (actor === undefined) {
          return yield* Effect.fail(new ChannelUnavailable({ channelId }));
        }
        const record = yield* repository.findById(workspaceId, actor.id, channelId);
        const canInspect =
          record !== undefined &&
          (isWorkspaceAdministrator(actor.role) || canActorViewChannel(actor, record));
        if (!canInspect) {
          return yield* Effect.fail(new ChannelUnavailable({ channelId }));
        }
        return yield* membershipRosterView(workspaceId, record);
      },
      (effect) => recoverPersistence("ChannelAccess.getMembershipRosterForActor", effect),
    ),
    joinPublic: Effect.fn("ChannelAccess.joinPublic")(
      (command) =>
        transactions.run(
          Effect.gen(function* () {
            const actor = yield* repository.lockActiveActor(
              command.actorAccountId,
              command.workspaceId,
            );
            if (actor === undefined || !isFullMember(actor.role)) {
              return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
            }
            const record = yield* repository.findById(
              command.workspaceId,
              actor.id,
              command.channelId,
            );
            if (
              record === undefined ||
              record.channel.visibility !== "public" ||
              !canActorViewChannel(actor, record)
            ) {
              return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
            }
            yield* repository.addMembership(command.workspaceId, command.channelId, actor.id);
            return channelView({ ...record, hasChannelMembership: true });
          }),
        ),
      (effect) => recoverPersistence("ChannelAccess.joinPublic", effect),
    ),
    leave: Effect.fn("ChannelAccess.leave")(
      (command: LeaveChannelCommand) =>
        transactions.run(
          Effect.gen(function* () {
            const actor = yield* repository.lockActiveActor(
              command.actorAccountId,
              command.workspaceId,
            );
            if (actor === undefined) {
              return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
            }
            const record = yield* repository.findById(
              command.workspaceId,
              actor.id,
              command.channelId,
            );
            if (record === undefined || !canActorViewChannel(actor, record)) {
              return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
            }
            if (
              record.hasChannelMembership &&
              record.channel.visibility === "private" &&
              record.channel.maintainerIdentityId === actor.id
            ) {
              return yield* Effect.fail(
                new PrivateChannelMaintainerCannotLeave({
                  workspaceId: command.workspaceId,
                  channelId: command.channelId,
                }),
              );
            }

            const removed = yield* repository.removeMembership(
              command.workspaceId,
              command.channelId,
              actor.id,
            );
            if (removed) {
              const now = yield* Clock.currentTimeMillis;
              yield* auditEvents.append(
                channelMembershipAuditEvent({
                  action: "removed",
                  actorId: command.actorAccountId,
                  channelId: command.channelId,
                  occurredAt: new Date(now),
                  visibility: record.channel.visibility,
                  workspaceId: command.workspaceId,
                  workspaceIdentityId: actor.id,
                }),
              );
            }
          }),
        ),
      (effect) => recoverPersistence("ChannelAccess.leave", effect),
    ),
  });
});

export const ChannelAccessLive = Layer.effect(ChannelAccess, make);
