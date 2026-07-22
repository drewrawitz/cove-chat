import { expect, it } from "@effect/vitest";
import {
  Channel,
  ChannelName,
  ChannelPurpose,
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  makeChannelId,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import {
  AuditEventWriter,
  ChannelAccessRepository,
  ChannelIdentityRecord,
  TransactionManager,
  type ChannelAccessRepositoryService,
} from "@cove/ports";
import { Effect, Layer, Ref } from "effect";
import {
  AddChannelMemberCommand,
  ChannelAccess,
  ChannelAccessLive,
  LeaveChannelCommand,
} from "../../src/index.ts";

const unexpected = (operation: string) =>
  Effect.die(new Error(`ChannelAccessRepository.${operation} was not expected`));

const makeRepository = (
  overrides: Partial<ChannelAccessRepositoryService>,
): ChannelAccessRepositoryService =>
  ChannelAccessRepository.of({
    readActiveActor: () => unexpected("readActiveActor"),
    lockActiveActor: () => unexpected("lockActiveActor"),
    lockActiveIdentity: () => unexpected("lockActiveIdentity"),
    listPublic: () => unexpected("listPublic"),
    findById: () => unexpected("findById"),
    listPrivate: () => unexpected("listPrivate"),
    listMembers: () => unexpected("listMembers"),
    listMemberCandidates: () => unexpected("listMemberCandidates"),
    insert: () => unexpected("insert"),
    addMembership: () => unexpected("addMembership"),
    removeMembership: () => unexpected("removeMembership"),
    ...overrides,
  });

const channelAccessTestLayer = (repository: ChannelAccessRepositoryService) =>
  ChannelAccessLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(ChannelAccessRepository, repository),
        Layer.succeed(AuditEventWriter, AuditEventWriter.of({ append: () => Effect.void })),
        Layer.succeed(TransactionManager, TransactionManager.of({ run: (effect) => effect })),
      ),
    ),
  );

it.effect("lets a Public Channel maintainer add a Full Member as a Channel Member", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("maintainer-account");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("public-channel");
    const maintainerIdentityId = yield* makeWorkspaceIdentityId("maintainer-identity");
    const memberIdentityId = yield* makeWorkspaceIdentityId("member-identity");
    const maintainer = ChannelIdentityRecord.make({
      id: maintainerIdentityId,
      name: WorkspaceIdentityName.make("Maintainer"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/maintainer.svg"),
      role: "member",
    });
    const member = ChannelIdentityRecord.make({
      id: memberIdentityId,
      name: WorkspaceIdentityName.make("Added Member"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/member.svg"),
      role: "member",
    });
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("public-channel"),
      purpose: ChannelPurpose.make("Coordinate work with a visible membership."),
      visibility: "public",
      maintainerIdentityId,
    });
    const members = yield* Ref.make<ReadonlyArray<ChannelIdentityRecord>>([maintainer]);

    const repository = makeRepository({
      readActiveActor: () => Effect.succeed(maintainer),
      lockActiveActor: () => Effect.succeed(maintainer),
      lockActiveIdentity: (_requestedWorkspaceId, workspaceIdentityId) =>
        Effect.succeed(workspaceIdentityId === memberIdentityId ? member : undefined),
      findById: () => Effect.succeed({ channel, maintainer, hasChannelMembership: true }),
      listMembers: () => Ref.get(members),
      addMembership: (_requestedWorkspaceId, _requestedChannelId, workspaceIdentityId) =>
        Effect.gen(function* () {
          if (workspaceIdentityId !== memberIdentityId) return false;
          yield* Ref.update(members, (current) => [...current, member]);
          return true;
        }),
    });

    const membershipRoster = yield* Effect.gen(function* () {
      const channels = yield* ChannelAccess;
      return yield* channels.addMember(
        AddChannelMemberCommand.make({
          actorAccountId,
          workspaceId,
          channelId,
          workspaceIdentityId: memberIdentityId,
        }),
      );
    }).pipe(Effect.provide(channelAccessTestLayer(repository)));

    expect(membershipRoster.channel.visibility).toBe("public");
    expect(membershipRoster.members.map((member) => member.id)).toEqual([
      maintainerIdentityId,
      memberIdentityId,
    ]);
  }),
);

it.effect("lets a Public Channel Maintainer leave its explicit membership", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("public-maintainer-account");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("public-channel");
    const actorIdentityId = yield* makeWorkspaceIdentityId("public-maintainer-identity");
    const actor = ChannelIdentityRecord.make({
      id: actorIdentityId,
      name: WorkspaceIdentityName.make("Public Maintainer"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/maintainer.svg"),
      role: "member",
    });
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("public-channel"),
      purpose: ChannelPurpose.make("Coordinate visible work."),
      visibility: "public",
      maintainerIdentityId: actorIdentityId,
    });
    const hasMembership = yield* Ref.make(true);

    const repository = makeRepository({
      lockActiveActor: () => Effect.succeed(actor),
      findById: () =>
        Ref.get(hasMembership).pipe(
          Effect.map((membership) => ({
            channel,
            maintainer: actor,
            hasChannelMembership: membership,
          })),
        ),
      removeMembership: () => Ref.getAndSet(hasMembership, false),
    });

    yield* Effect.gen(function* () {
      const channels = yield* ChannelAccess;
      yield* channels.leave(LeaveChannelCommand.make({ actorAccountId, workspaceId, channelId }));
    }).pipe(Effect.provide(channelAccessTestLayer(repository)));

    expect(yield* Ref.get(hasMembership)).toBe(false);
  }),
);

it.effect("keeps a Private Channel Maintainer from leaving", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("private-maintainer-account");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("private-channel");
    const actorIdentityId = yield* makeWorkspaceIdentityId("private-maintainer-identity");
    const actor = ChannelIdentityRecord.make({
      id: actorIdentityId,
      name: WorkspaceIdentityName.make("Private Maintainer"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/maintainer.svg"),
      role: "member",
    });
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("private-channel"),
      purpose: ChannelPurpose.make("Coordinate sensitive work."),
      visibility: "private",
      maintainerIdentityId: actorIdentityId,
    });
    const removalCount = yield* Ref.make(0);

    const repository = makeRepository({
      lockActiveActor: () => Effect.succeed(actor),
      findById: () => Effect.succeed({ channel, maintainer: actor, hasChannelMembership: true }),
      removeMembership: () =>
        Ref.updateAndGet(removalCount, (count) => count + 1).pipe(Effect.as(true)),
    });

    const error = yield* Effect.gen(function* () {
      const channels = yield* ChannelAccess;
      return yield* channels
        .leave(LeaveChannelCommand.make({ actorAccountId, workspaceId, channelId }))
        .pipe(Effect.flip);
    }).pipe(Effect.provide(channelAccessTestLayer(repository)));

    expect(error).toMatchObject({ _tag: "Application.PrivateChannelMaintainerCannotLeave" });
    expect(yield* Ref.get(removalCount)).toBe(0);
  }),
);
