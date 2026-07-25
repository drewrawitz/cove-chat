import { expect, it } from "@effect/vitest";
import {
  Channel,
  ChannelName,
  ChannelPurpose,
  Message,
  MessageBody,
  Topic,
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  makeChannelId,
  makeMessageId,
  makeTopicId,
  makeTopicSummaryPreview,
  makeTopicTitle,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { TopicRepository, TransactionManager, type TopicRepositoryService } from "@cove/ports";
import { Effect, Layer, Ref } from "effect";
import {
  ChannelAccess,
  ChannelUnavailable,
  CreateTopicCommand,
  TopicAccess,
  TopicAccessLive,
  TopicArchiveCursorInvalid,
  type ChannelAccessService,
} from "../../src/index.ts";

const unexpected = (service: string, operation: string) =>
  Effect.die(new Error(`${service}.${operation} was not expected`));

const makeChannelAccess = (overrides: Partial<ChannelAccessService>): ChannelAccessService =>
  ChannelAccess.of({
    listPublicForActor: () => unexpected("ChannelAccess", "listPublicForActor"),
    getPublicForActor: () => unexpected("ChannelAccess", "getPublicForActor"),
    getForActor: () => unexpected("ChannelAccess", "getForActor"),
    getConversationContextForActor: () =>
      unexpected("ChannelAccess", "getConversationContextForActor"),
    createPublic: () => unexpected("ChannelAccess", "createPublic"),
    createPrivate: () => unexpected("ChannelAccess", "createPrivate"),
    addMember: () => unexpected("ChannelAccess", "addMember"),
    listPrivateForActor: () => unexpected("ChannelAccess", "listPrivateForActor"),
    listMemberCandidatesForActor: () => unexpected("ChannelAccess", "listMemberCandidatesForActor"),
    listPrivateForAdministrator: () => unexpected("ChannelAccess", "listPrivateForAdministrator"),
    getMembershipRosterForActor: () => unexpected("ChannelAccess", "getMembershipRosterForActor"),
    joinPublic: () => unexpected("ChannelAccess", "joinPublic"),
    leave: () => unexpected("ChannelAccess", "leave"),
    ...overrides,
  });

const makeRepository = (overrides: Partial<TopicRepositoryService>): TopicRepositoryService =>
  TopicRepository.of({
    listArchivePageInChannel: () => unexpected("TopicRepository", "listArchivePageInChannel"),
    findTopicById: () => unexpected("TopicRepository", "findTopicById"),
    findMessageById: () => unexpected("TopicRepository", "findMessageById"),
    insertTopic: () => unexpected("TopicRepository", "insertTopic"),
    insertMessage: () => unexpected("TopicRepository", "insertMessage"),
    ...overrides,
  });

const topicAccessTestLayer = (
  channelAccess: ChannelAccessService,
  repository: TopicRepositoryService,
) =>
  TopicAccessLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(ChannelAccess, channelAccess),
        Layer.succeed(TopicRepository, repository),
        Layer.succeed(TransactionManager, TransactionManager.of({ run: (effect) => effect })),
      ),
    ),
  );

it.effect("creates a Topic and versioned Opening Brief for a Channel Member", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("member-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("member-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const messageId = yield* makeMessageId("message-1");
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("general"),
      purpose: ChannelPurpose.make("Coordinate workspace topics."),
      visibility: "public",
      maintainerIdentityId: actorIdentityId,
    });
    const insertedTopics = yield* Ref.make<ReadonlyArray<unknown>>([]);
    const insertedMessages = yield* Ref.make<ReadonlyArray<unknown>>([]);
    const channelAccess = makeChannelAccess({
      getConversationContextForActor: () =>
        Effect.succeed({
          channel,
          actor: {
            id: actorIdentityId,
            name: WorkspaceIdentityName.make("Channel Member"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/member.svg"),
          },
          hasChannelMembership: true,
        }),
    });
    const repository = makeRepository({
      insertTopic: (topic) => Ref.update(insertedTopics, (topics) => [...topics, topic]),
      insertMessage: (message) =>
        Ref.update(insertedMessages, (messages) => [...messages, message]),
    });

    const created = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics.create(
        CreateTopicCommand.make({
          actorAccountId,
          workspaceId,
          channelId,
          topicId,
          openingBriefMessageId: messageId,
          title: yield* makeTopicTitle("Release readiness"),
          openingBrief: MessageBody.make("Capture the remaining launch risks."),
        }),
      );
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(created.topic.id).toBe(topicId);
    expect(created.messages[0]?.message).toMatchObject({
      id: messageId,
      version: 1,
      body: "Capture the remaining launch risks.",
    });
    expect(yield* Ref.get(insertedTopics)).toHaveLength(1);
    expect(yield* Ref.get(insertedMessages)).toHaveLength(1);
  }),
);

it.effect("does not let a Public Channel reader create a Topic before joining", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("reader-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("reader-identity");
    const maintainerIdentityId = yield* makeWorkspaceIdentityId("maintainer-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const insertCount = yield* Ref.make(0);
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("general"),
      purpose: ChannelPurpose.make("Coordinate workspace topics."),
      visibility: "public",
      maintainerIdentityId,
    });
    const channelAccess = makeChannelAccess({
      getConversationContextForActor: () =>
        Effect.succeed({
          channel,
          actor: {
            id: actorIdentityId,
            name: WorkspaceIdentityName.make("Channel Reader"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/reader.svg"),
          },
          hasChannelMembership: false,
        }),
    });
    const repository = makeRepository({
      insertTopic: () => Ref.update(insertCount, (count) => count + 1),
      insertMessage: () => Ref.update(insertCount, (count) => count + 1),
    });

    const error = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics
        .create(
          CreateTopicCommand.make({
            actorAccountId,
            workspaceId,
            channelId,
            topicId: yield* makeTopicId("topic-1"),
            openingBriefMessageId: yield* makeMessageId("message-1"),
            title: yield* makeTopicTitle("Release readiness"),
            openingBrief: MessageBody.make("Capture the remaining launch risks."),
          }),
        )
        .pipe(Effect.flip);
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(error).toBeInstanceOf(ChannelUnavailable);
    expect(yield* Ref.get(insertCount)).toBe(0);
  }),
);

it.effect("carries one stable opaque cursor through authorized Topic archive pages", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("reader-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("reader-identity");
    const authorIdentityId = yield* makeWorkspaceIdentityId("author-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-501");
    const messageId = yield* makeMessageId("message-501");
    const activityAt = new Date("2026-07-22T12:00:00.000Z");
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("general"),
      purpose: ChannelPurpose.make("Coordinate workspace topics."),
      visibility: "public",
      maintainerIdentityId: authorIdentityId,
    });
    const summary = {
      topic: Topic.make({
        id: topicId,
        workspaceId,
        channelId,
        title: yield* makeTopicTitle("Archived release notes"),
        openedByIdentityId: authorIdentityId,
        messageCount: 1,
        latestMessageId: messageId,
        latestMessagePreview: makeTopicSummaryPreview("The archived release shipped."),
        latestMessageAuthorIdentityId: authorIdentityId,
        latestMessagePosition: 1,
        latestMessageCreatedAt: activityAt,
        lastActivityAt: activityAt,
        createdAt: activityAt,
      }),
      latestMessage: {
        message: Message.make({
          id: messageId,
          workspaceId,
          topicId,
          authorIdentityId,
          body: MessageBody.make("The archived release shipped."),
          position: 1,
          version: 1,
          createdAt: activityAt,
        }),
        author: {
          id: authorIdentityId,
          name: WorkspaceIdentityName.make("Topic Author"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/author.svg"),
        },
      },
      messageCount: 1,
    };
    const requests = yield* Ref.make<ReadonlyArray<string | undefined>>([]);
    const channelAccess = makeChannelAccess({
      getConversationContextForActor: () =>
        Effect.succeed({
          channel,
          actor: {
            id: actorIdentityId,
            name: WorkspaceIdentityName.make("Channel Reader"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/reader.svg"),
          },
          hasChannelMembership: false,
        }),
    });
    const repository = makeRepository({
      listArchivePageInChannel: (_actorAccountId, _workspaceId, _channelId, cursor) =>
        Ref.updateAndGet(requests, (seen) => [...seen, cursor]).pipe(
          Effect.map((seen) =>
            seen.length === 1
              ? { summaries: [summary], nextCursor: "server-owned-cursor", cursorValid: true }
              : seen.length === 2
                ? { summaries: [], cursorValid: true }
                : { summaries: [], cursorValid: false },
          ),
        ),
    });

    const result = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      const first = yield* topics.listArchiveForActor(actorAccountId, workspaceId, channelId);
      const second = yield* topics.listArchiveForActor(
        actorAccountId,
        workspaceId,
        channelId,
        first.nextCursor,
      );
      const invalid = yield* topics
        .listArchiveForActor(actorAccountId, workspaceId, channelId, "unknown-cursor")
        .pipe(Effect.flip);
      return { first, second, invalid };
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(result.first.topics.map(({ topic }) => topic.id)).toEqual([topicId]);
    expect(result.first.nextCursor).toBe("server-owned-cursor");
    expect(result.second.topics).toEqual([]);
    expect(result.invalid).toBeInstanceOf(TopicArchiveCursorInvalid);
    expect(yield* Ref.get(requests)).toEqual([undefined, "server-owned-cursor", "unknown-cursor"]);
  }),
);
