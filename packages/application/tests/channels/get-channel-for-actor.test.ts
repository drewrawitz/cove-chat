import { expect, it } from "@effect/vitest";
import {
  Channel,
  ChannelMembershipFacts,
  makeChannelId,
  makeChannelName,
  makeChannelPurpose,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
  type ChannelId,
  type UserId,
  type WorkspaceId,
} from "@cove/domain";
import { ChannelRepository, MembershipRepository, PersistenceError } from "@cove/ports";
import { Effect, Layer, Option } from "effect";
import {
  ChannelUnavailable,
  GetChannelForActorInput,
  getChannelForActor,
} from "../../src/index.ts";

interface WorkspaceMembership {
  readonly actorId: UserId;
  readonly workspaceId: WorkspaceId;
}

interface ChannelMembership {
  readonly actorId: UserId;
  readonly channelId: ChannelId;
}

const makeFixtures = Effect.gen(function* () {
  const workspaceId = yield* makeWorkspaceId("workspace-a");
  const otherWorkspaceId = yield* makeWorkspaceId("workspace-b");
  const privateMemberId = yield* makeUserId("user-private-member");
  const workspaceMemberId = yield* makeUserId("user-workspace-member");
  const publicChannelId = yield* makeChannelId("channel-public");
  const privateChannelId = yield* makeChannelId("channel-private");
  const otherWorkspaceChannelId = yield* makeChannelId("channel-other-workspace");
  const missingChannelId = yield* makeChannelId("channel-missing");
  const publicChannelName = yield* makeChannelName("general");
  const privateChannelName = yield* makeChannelName("leadership");
  const otherWorkspaceChannelName = yield* makeChannelName("other-team");
  const channelPurpose = yield* makeChannelPurpose("A test channel purpose.");
  const stewardIdentityId = yield* makeWorkspaceIdentityId("channel-steward");

  const publicChannel = Channel.make({
    id: publicChannelId,
    workspaceId,
    name: publicChannelName,
    purpose: channelPurpose,
    visibility: "public",
    stewardIdentityId,
  });
  const privateChannel = Channel.make({
    id: privateChannelId,
    workspaceId,
    name: privateChannelName,
    purpose: channelPurpose,
    visibility: "private",
    stewardIdentityId,
  });
  const otherWorkspaceChannel = Channel.make({
    id: otherWorkspaceChannelId,
    workspaceId: otherWorkspaceId,
    name: otherWorkspaceChannelName,
    purpose: channelPurpose,
    visibility: "public",
    stewardIdentityId,
  });

  const channels = [publicChannel, privateChannel, otherWorkspaceChannel];
  const workspaceMemberships: ReadonlyArray<WorkspaceMembership> = [
    { actorId: privateMemberId, workspaceId },
    { actorId: workspaceMemberId, workspaceId },
  ];
  const channelMemberships: ReadonlyArray<ChannelMembership> = [
    { actorId: privateMemberId, channelId: privateChannelId },
  ];

  const channelRepository = ChannelRepository.of({
    findById: Effect.fn("ChannelRepository.Test.findById")(
      (requestedWorkspaceId: WorkspaceId, channelId: ChannelId) =>
        Effect.succeed(
          Option.fromNullishOr(
            channels.find(
              (channel) => channel.workspaceId === requestedWorkspaceId && channel.id === channelId,
            ),
          ),
        ),
    ),
  });

  const membershipRepository = MembershipRepository.of({
    getChannelAccessFacts: Effect.fn("MembershipRepository.Test.getChannelAccessFacts")(
      (actorId: UserId, requestedWorkspaceId: WorkspaceId, channelId: ChannelId) =>
        Effect.succeed(
          ChannelMembershipFacts.make({
            isWorkspaceMember: workspaceMemberships.some(
              (membership) =>
                membership.actorId === actorId && membership.workspaceId === requestedWorkspaceId,
            ),
            isChannelMember: channelMemberships.some(
              (membership) => membership.actorId === actorId && membership.channelId === channelId,
            ),
          }),
        ),
    ),
  });

  const layer = Layer.mergeAll(
    Layer.succeed(ChannelRepository, channelRepository),
    Layer.succeed(MembershipRepository, membershipRepository),
  );

  return {
    layer,
    workspaceId,
    privateMemberId,
    workspaceMemberId,
    publicChannel,
    privateChannel,
    membershipRepository,
    otherWorkspaceChannelId,
    missingChannelId,
  };
});

it.effect("returns a public channel to a workspace member", () =>
  Effect.gen(function* () {
    const fixtures = yield* makeFixtures;

    const channel = yield* getChannelForActor(
      GetChannelForActorInput.make({
        actorId: fixtures.workspaceMemberId,
        workspaceId: fixtures.workspaceId,
        channelId: fixtures.publicChannel.id,
      }),
    ).pipe(Effect.provide(fixtures.layer));

    expect(channel).toEqual(fixtures.publicChannel);
  }),
);

it.effect("returns a private channel to one of its members", () =>
  Effect.gen(function* () {
    const fixtures = yield* makeFixtures;

    const channel = yield* getChannelForActor(
      GetChannelForActorInput.make({
        actorId: fixtures.privateMemberId,
        workspaceId: fixtures.workspaceId,
        channelId: fixtures.privateChannel.id,
      }),
    ).pipe(Effect.provide(fixtures.layer));

    expect(channel).toEqual(fixtures.privateChannel);
  }),
);

it.effect("hides a private channel from a workspace member who has not joined it", () =>
  Effect.gen(function* () {
    const fixtures = yield* makeFixtures;

    const error = yield* getChannelForActor(
      GetChannelForActorInput.make({
        actorId: fixtures.workspaceMemberId,
        workspaceId: fixtures.workspaceId,
        channelId: fixtures.privateChannel.id,
      }),
    ).pipe(Effect.provide(fixtures.layer), Effect.flip);

    expect(error).toBeInstanceOf(ChannelUnavailable);
    expect(error).toMatchObject({
      _tag: "Application.ChannelUnavailable",
      channelId: fixtures.privateChannel.id,
    });
  }),
);

it.effect("hides a channel that belongs to another workspace", () =>
  Effect.gen(function* () {
    const fixtures = yield* makeFixtures;

    const error = yield* getChannelForActor(
      GetChannelForActorInput.make({
        actorId: fixtures.privateMemberId,
        workspaceId: fixtures.workspaceId,
        channelId: fixtures.otherWorkspaceChannelId,
      }),
    ).pipe(Effect.provide(fixtures.layer), Effect.flip);

    expect(error).toBeInstanceOf(ChannelUnavailable);
    expect(error).toMatchObject({
      _tag: "Application.ChannelUnavailable",
      channelId: fixtures.otherWorkspaceChannelId,
    });
  }),
);

it.effect("uses the same error when the channel does not exist", () =>
  Effect.gen(function* () {
    const fixtures = yield* makeFixtures;

    const error = yield* getChannelForActor(
      GetChannelForActorInput.make({
        actorId: fixtures.privateMemberId,
        workspaceId: fixtures.workspaceId,
        channelId: fixtures.missingChannelId,
      }),
    ).pipe(Effect.provide(fixtures.layer), Effect.flip);

    expect(error).toBeInstanceOf(ChannelUnavailable);
    expect(error).toMatchObject({
      _tag: "Application.ChannelUnavailable",
      channelId: fixtures.missingChannelId,
    });
  }),
);

it.effect("preserves persistence failures for a higher boundary to handle", () =>
  Effect.gen(function* () {
    const fixtures = yield* makeFixtures;
    const persistenceError = new PersistenceError({
      operation: "ChannelRepository.findById",
      cause: new Error("database unavailable"),
    });
    const failingChannelRepository = ChannelRepository.of({
      findById: Effect.fn("ChannelRepository.Test.findByIdFailure")(() =>
        Effect.fail(persistenceError),
      ),
    });
    const failingLayer = Layer.mergeAll(
      Layer.succeed(ChannelRepository, failingChannelRepository),
      Layer.succeed(MembershipRepository, fixtures.membershipRepository),
    );

    const error = yield* getChannelForActor(
      GetChannelForActorInput.make({
        actorId: fixtures.workspaceMemberId,
        workspaceId: fixtures.workspaceId,
        channelId: fixtures.publicChannel.id,
      }),
    ).pipe(Effect.provide(failingLayer), Effect.flip);

    expect(error).toBe(persistenceError);
  }),
);
