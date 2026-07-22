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
} from "@cove/ports";
import { Effect, Layer, Ref } from "effect";
import { AddChannelMemberCommand, ChannelAccess, ChannelAccessLive } from "../../src/index.ts";

const unexpected = (operation: string) =>
  Effect.die(new Error(`ChannelAccessRepository.${operation} was not expected`));

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

    const repository = ChannelAccessRepository.of({
      readActiveActor: () => Effect.succeed(maintainer),
      lockActiveActor: () => Effect.succeed(maintainer),
      lockActiveIdentity: (_requestedWorkspaceId, workspaceIdentityId) =>
        Effect.succeed(workspaceIdentityId === memberIdentityId ? member : undefined),
      listPublic: () => unexpected("listPublic"),
      findById: () => Effect.succeed({ channel, maintainer, hasChannelMembership: true }),
      listPrivate: () => unexpected("listPrivate"),
      listMembers: () => Ref.get(members),
      listMemberCandidates: () => unexpected("listMemberCandidates"),
      insert: () => unexpected("insert"),
      addMembership: (_requestedWorkspaceId, _requestedChannelId, workspaceIdentityId) =>
        Effect.gen(function* () {
          if (workspaceIdentityId !== memberIdentityId) return false;
          yield* Ref.update(members, (current) => [...current, member]);
          return true;
        }),
    });
    const dependencies = Layer.mergeAll(
      Layer.succeed(ChannelAccessRepository, repository),
      Layer.succeed(AuditEventWriter, AuditEventWriter.of({ append: () => Effect.void })),
      Layer.succeed(TransactionManager, TransactionManager.of({ run: (effect) => effect })),
    );
    const layer = ChannelAccessLive.pipe(Layer.provide(dependencies));

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
    }).pipe(Effect.provide(layer));

    expect(membershipRoster.channel.visibility).toBe("public");
    expect(membershipRoster.members.map((member) => member.id)).toEqual([
      maintainerIdentityId,
      memberIdentityId,
    ]);
  }),
);
