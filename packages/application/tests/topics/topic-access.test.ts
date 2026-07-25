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
  AddMessageCommand,
  ChannelAccess,
  MessageMutationForbidden,
  DeleteMessageCommand,
  EditMessageCommand,
  CreateTopicCommand,
  MessageUnavailable,
  TopicAccess,
  TopicAccessLive,
  TopicArchiveCursorInvalid,
  ChannelUnavailable,
  TopicUnavailable,
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
    findById: () => unexpected("TopicRepository", "findById"),
    insertTopic: () => unexpected("TopicRepository", "insertTopic"),
    insertMessage: () => unexpected("TopicRepository", "insertMessage"),
    appendMessage: () => unexpected("TopicRepository", "appendMessage"),
    editMessage: () => unexpected("TopicRepository", "editMessage"),
    tombstoneMessage: () => unexpected("TopicRepository", "tombstoneMessage"),
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

it.effect("creates a Topic and its Opening Brief for a Channel Member", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("member-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("member-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const messageId = yield* makeMessageId("message-1");
    const title = yield* makeTopicTitle("Release readiness");
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
          title,
          openingBrief: MessageBody.make("Capture the remaining launch risks."),
          intent: "question",
        }),
      );
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(created.topic).toMatchObject({
      id: topicId,
      channelId,
      title: "Release readiness",
      intent: "question",
      openedByIdentityId: actorIdentityId,
      messageCount: 1,
      latestMessageId: messageId,
      latestMessagePreview: "Capture the remaining launch risks.",
      latestMessageAuthorIdentityId: actorIdentityId,
      latestMessagePosition: 1,
      latestMessageCreatedAt: expect.any(Date),
      lastActivityAt: expect.any(Date),
    });
    expect(created.messages).toHaveLength(1);
    expect(created.messages[0]?.message).toMatchObject({
      id: messageId,
      topicId,
      body: "Capture the remaining launch risks.",
      position: 1,
    });
    const topics = yield* Ref.get(insertedTopics);
    const messages = yield* Ref.get(insertedMessages);
    expect(topics).toHaveLength(1);
    expect(messages).toHaveLength(1);
  }),
);

it.effect("adds a flat Message at the next Topic position for a Channel Member", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("member-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("member-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const messageId = yield* makeMessageId("message-2");
    const createdAt = new Date("2026-07-22T12:00:00.000Z");
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("general"),
      purpose: ChannelPurpose.make("Coordinate workspace topics."),
      visibility: "public",
      maintainerIdentityId: actorIdentityId,
    });
    const topic = Topic.make({
      id: topicId,
      workspaceId,
      channelId,
      title: yield* makeTopicTitle("Release readiness"),
      openedByIdentityId: actorIdentityId,
      messageCount: 1,
      latestMessageId: messageId,
      latestMessagePreview: makeTopicSummaryPreview("Latest Message"),
      latestMessageAuthorIdentityId: actorIdentityId,
      latestMessagePosition: 1,
      latestMessageCreatedAt: createdAt,
      lastActivityAt: createdAt,
      createdAt,
    });
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
      findById: () => Effect.succeed({ topic, messages: [] }),
      appendMessage: (message) =>
        Effect.succeed(
          Message.make({
            ...message,
            position: 2,
          }),
        ),
    });

    const added = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics.addMessage(
        AddMessageCommand.make({
          actorAccountId,
          workspaceId,
          channelId,
          topicId,
          messageId,
          body: MessageBody.make("The release candidate passed smoke testing."),
        }),
      );
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(added).toMatchObject({
      message: {
        id: messageId,
        topicId,
        authorIdentityId: actorIdentityId,
        body: "The release candidate passed smoke testing.",
        position: 2,
      },
      author: { id: actorIdentityId, name: "Channel Member" },
    });
  }),
);

it.effect("lets a Message author correct their writing with an edited marker", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("author-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("author-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const messageId = yield* makeMessageId("message-2");
    const createdAt = new Date("2026-07-22T12:00:00.000Z");
    const editedAt = new Date("2026-07-22T12:05:00.000Z");
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("general"),
      purpose: ChannelPurpose.make("Coordinate workspace topics."),
      visibility: "public",
      maintainerIdentityId: actorIdentityId,
    });
    const topic = Topic.make({
      id: topicId,
      workspaceId,
      channelId,
      title: yield* makeTopicTitle("Release readiness"),
      openedByIdentityId: actorIdentityId,
      messageCount: 2,
      latestMessageId: messageId,
      latestMessagePreview: makeTopicSummaryPreview("The release candidate passed smoke testng."),
      latestMessageAuthorIdentityId: actorIdentityId,
      latestMessagePosition: 2,
      latestMessageCreatedAt: createdAt,
      lastActivityAt: createdAt,
      createdAt,
    });
    const original = Message.make({
      id: messageId,
      workspaceId,
      topicId,
      authorIdentityId: actorIdentityId,
      body: MessageBody.make("The release candidate passed smoke testng."),
      position: 2,
      createdAt,
    });
    const author = {
      id: actorIdentityId,
      name: WorkspaceIdentityName.make("Message Author"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/author.svg"),
    };
    const channelAccess = makeChannelAccess({
      getConversationContextForActor: () =>
        Effect.succeed({ channel, actor: author, hasChannelMembership: true }),
    });
    const repository = makeRepository({
      findById: () => Effect.succeed({ topic, messages: [{ message: original, author }] }),
      editMessage: (edit) =>
        Effect.succeed(
          Message.make({
            ...original,
            body: edit.body,
            editedAt,
          }),
        ),
    });

    const corrected = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics.editMessage(
        EditMessageCommand.make({
          actorAccountId,
          workspaceId,
          channelId,
          topicId,
          messageId,
          body: MessageBody.make("The release candidate passed smoke testing."),
        }),
      );
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(corrected.message).toMatchObject({
      id: messageId,
      body: "The release candidate passed smoke testing.",
      position: 2,
      editedAt,
    });
  }),
);

it.effect("lets a Message author leave a tombstone without removing its position", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("author-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("author-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const messageId = yield* makeMessageId("message-2");
    const createdAt = new Date("2026-07-22T12:00:00.000Z");
    const deletedAt = new Date("2026-07-22T12:05:00.000Z");
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("general"),
      purpose: ChannelPurpose.make("Coordinate workspace topics."),
      visibility: "public",
      maintainerIdentityId: actorIdentityId,
    });
    const topic = Topic.make({
      id: topicId,
      workspaceId,
      channelId,
      title: yield* makeTopicTitle("Release readiness"),
      openedByIdentityId: actorIdentityId,
      messageCount: 2,
      latestMessageId: messageId,
      latestMessagePreview: makeTopicSummaryPreview("This Message will be removed."),
      latestMessageAuthorIdentityId: actorIdentityId,
      latestMessagePosition: 2,
      latestMessageCreatedAt: createdAt,
      lastActivityAt: createdAt,
      createdAt,
    });
    const original = Message.make({
      id: messageId,
      workspaceId,
      topicId,
      authorIdentityId: actorIdentityId,
      body: MessageBody.make("This Message will be removed."),
      position: 2,
      createdAt,
    });
    const author = {
      id: actorIdentityId,
      name: WorkspaceIdentityName.make("Message Author"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/author.svg"),
    };
    const channelAccess = makeChannelAccess({
      getConversationContextForActor: () =>
        Effect.succeed({ channel, actor: author, hasChannelMembership: true }),
    });
    const repository = makeRepository({
      findById: () => Effect.succeed({ topic, messages: [{ message: original, author }] }),
      tombstoneMessage: () =>
        Effect.succeed(
          Message.make({
            id: messageId,
            workspaceId,
            topicId,
            authorIdentityId: actorIdentityId,
            position: 2,
            createdAt,
            deletedAt,
          }),
        ),
    });

    const tombstone = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics.deleteMessage(
        DeleteMessageCommand.make({
          actorAccountId,
          workspaceId,
          channelId,
          topicId,
          messageId,
        }),
      );
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(tombstone.message).toMatchObject({
      id: messageId,
      position: 2,
      deletedAt,
    });
    expect(tombstone.message).not.toHaveProperty("body");
  }),
);

it.effect("does not let an author edit a tombstoned Message", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("author-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("author-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const messageId = yield* makeMessageId("message-2");
    const createdAt = new Date("2026-07-22T12:00:00.000Z");
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("general"),
      purpose: ChannelPurpose.make("Coordinate workspace topics."),
      visibility: "public",
      maintainerIdentityId: actorIdentityId,
    });
    const topic = Topic.make({
      id: topicId,
      workspaceId,
      channelId,
      title: yield* makeTopicTitle("Release readiness"),
      openedByIdentityId: actorIdentityId,
      messageCount: 2,
      latestMessageId: messageId,
      latestMessageAuthorIdentityId: actorIdentityId,
      latestMessagePosition: 2,
      latestMessageCreatedAt: createdAt,
      latestMessageDeletedAt: new Date("2026-07-22T12:05:00.000Z"),
      lastActivityAt: createdAt,
      createdAt,
    });
    const tombstone = Message.make({
      id: messageId,
      workspaceId,
      topicId,
      authorIdentityId: actorIdentityId,
      position: 2,
      createdAt,
      deletedAt: new Date("2026-07-22T12:05:00.000Z"),
    });
    const author = {
      id: actorIdentityId,
      name: WorkspaceIdentityName.make("Message Author"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/author.svg"),
    };
    const editCount = yield* Ref.make(0);
    const channelAccess = makeChannelAccess({
      getConversationContextForActor: () =>
        Effect.succeed({ channel, actor: author, hasChannelMembership: true }),
    });
    const repository = makeRepository({
      findById: () => Effect.succeed({ topic, messages: [{ message: tombstone, author }] }),
      editMessage: () => Ref.update(editCount, (count) => count + 1).pipe(Effect.as(tombstone)),
    });

    const error = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics
        .editMessage(
          EditMessageCommand.make({
            actorAccountId,
            workspaceId,
            channelId,
            topicId,
            messageId,
            body: MessageBody.make("Restored content."),
          }),
        )
        .pipe(Effect.flip);
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(error).toBeInstanceOf(MessageUnavailable);
    expect(yield* Ref.get(editCount)).toBe(0);
  }),
);

it.effect("does not let a Channel participant change another author's Message", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("participant-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("participant-identity");
    const authorIdentityId = yield* makeWorkspaceIdentityId("author-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const messageId = yield* makeMessageId("message-2");
    const createdAt = new Date("2026-07-22T12:00:00.000Z");
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("general"),
      purpose: ChannelPurpose.make("Coordinate workspace topics."),
      visibility: "public",
      maintainerIdentityId: authorIdentityId,
    });
    const topic = Topic.make({
      id: topicId,
      workspaceId,
      channelId,
      title: yield* makeTopicTitle("Release readiness"),
      openedByIdentityId: authorIdentityId,
      messageCount: 2,
      latestMessageId: messageId,
      latestMessagePreview: makeTopicSummaryPreview("The author's Message."),
      latestMessageAuthorIdentityId: authorIdentityId,
      latestMessagePosition: 2,
      latestMessageCreatedAt: createdAt,
      lastActivityAt: createdAt,
      createdAt,
    });
    const message = Message.make({
      id: messageId,
      workspaceId,
      topicId,
      authorIdentityId,
      body: MessageBody.make("The author's Message."),
      position: 2,
      createdAt,
    });
    const author = {
      id: authorIdentityId,
      name: WorkspaceIdentityName.make("Message Author"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/author.svg"),
    };
    const mutationCount = yield* Ref.make(0);
    const channelAccess = makeChannelAccess({
      getConversationContextForActor: () =>
        Effect.succeed({
          channel,
          actor: {
            id: actorIdentityId,
            name: WorkspaceIdentityName.make("Channel Participant"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/participant.svg"),
          },
          hasChannelMembership: true,
        }),
    });
    const repository = makeRepository({
      findById: () => Effect.succeed({ topic, messages: [{ message, author }] }),
      editMessage: () => Ref.update(mutationCount, (count) => count + 1).pipe(Effect.as(message)),
      tombstoneMessage: () =>
        Ref.update(mutationCount, (count) => count + 1).pipe(Effect.as(message)),
    });

    const errors = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* Effect.all([
        topics
          .editMessage(
            EditMessageCommand.make({
              actorAccountId,
              workspaceId,
              channelId,
              topicId,
              messageId,
              body: MessageBody.make("Unauthorized edit."),
            }),
          )
          .pipe(Effect.flip),
        topics
          .deleteMessage(
            DeleteMessageCommand.make({
              actorAccountId,
              workspaceId,
              channelId,
              topicId,
              messageId,
            }),
          )
          .pipe(Effect.flip),
      ]);
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(errors[0]).toBeInstanceOf(MessageMutationForbidden);
    expect(errors[1]).toBeInstanceOf(MessageMutationForbidden);
    expect(yield* Ref.get(mutationCount)).toBe(0);
  }),
);

it.effect("does not let a Public Channel reader create a Topic before joining", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("reader-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("reader-identity");
    const maintainerIdentityId = yield* makeWorkspaceIdentityId("maintainer-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const messageId = yield* makeMessageId("message-1");
    const title = yield* makeTopicTitle("Release readiness");
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("general"),
      purpose: ChannelPurpose.make("Coordinate workspace topics."),
      visibility: "public",
      maintainerIdentityId,
    });
    const insertCount = yield* Ref.make(0);
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
      return yield* Effect.all([
        topics
          .create(
            CreateTopicCommand.make({
              actorAccountId,
              workspaceId,
              channelId,
              topicId,
              openingBriefMessageId: messageId,
              title,
              openingBrief: MessageBody.make("Capture the remaining launch risks."),
            }),
          )
          .pipe(Effect.flip),
        topics
          .addMessage(
            AddMessageCommand.make({
              actorAccountId,
              workspaceId,
              channelId,
              topicId,
              messageId,
              body: MessageBody.make("Readers cannot add Messages."),
            }),
          )
          .pipe(Effect.flip),
      ]);
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(error[0]).toBeInstanceOf(ChannelUnavailable);
    expect(error[1]).toBeInstanceOf(ChannelUnavailable);
    const persisted = yield* Ref.get(insertCount);
    expect(persisted).toBe(0);
  }),
);

it.effect("inherits Channel read access when opening a Topic", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("reader-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("reader-identity");
    const authorIdentityId = yield* makeWorkspaceIdentityId("author-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const messageId = yield* makeMessageId("message-1");
    const title = yield* makeTopicTitle("Release readiness");
    const createdAt = new Date("2026-07-22T12:00:00.000Z");
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("general"),
      purpose: ChannelPurpose.make("Coordinate workspace topics."),
      visibility: "public",
      maintainerIdentityId: authorIdentityId,
    });
    const topic = Topic.make({
      id: topicId,
      workspaceId,
      channelId,
      title,
      intent: "discussion",
      openedByIdentityId: authorIdentityId,
      messageCount: 1,
      latestMessageId: messageId,
      latestMessagePreview: makeTopicSummaryPreview("Capture the remaining launch risks."),
      latestMessageAuthorIdentityId: authorIdentityId,
      latestMessagePosition: 1,
      latestMessageCreatedAt: createdAt,
      lastActivityAt: createdAt,
      createdAt,
    });
    const latestMessage = {
      message: Message.make({
        id: messageId,
        workspaceId,
        topicId,
        authorIdentityId,
        body: MessageBody.make("Capture the remaining launch risks."),
        position: 1,
        createdAt,
      }),
      author: {
        id: authorIdentityId,
        name: WorkspaceIdentityName.make("Topic Author"),
        avatarUrl: WorkspaceAvatarUrl.make("/avatars/author.svg"),
      },
    };
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
      findById: () => Effect.succeed({ topic, messages: [latestMessage] }),
    });

    const detail = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics.getForActor(actorAccountId, workspaceId, channelId, topicId);
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(detail.topic.id).toBe(topicId);
    expect(detail.messages).toHaveLength(1);
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
    const topic = Topic.make({
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
    });
    const summary = {
      topic,
      latestMessage: {
        message: Message.make({
          id: messageId,
          workspaceId,
          topicId,
          authorIdentityId,
          body: MessageBody.make("The archived release shipped."),
          position: 1,
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
    const requests = yield* Ref.make<ReadonlyArray<unknown>>([]);
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
              ? {
                  summaries: [summary],
                  nextCursor: "server-owned-cursor",
                  cursorValid: true,
                }
              : seen.length === 2
                ? {
                    summaries: [],
                    cursorValid: true,
                  }
                : {
                    summaries: [],
                    cursorValid: false,
                  },
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
    expect(result.first.nextCursor).toEqual(expect.any(String));
    expect(result.second.topics).toEqual([]);
    expect(result.invalid).toBeInstanceOf(TopicArchiveCursorInvalid);
    expect(yield* Ref.get(requests)).toEqual([undefined, "server-owned-cursor", "unknown-cursor"]);
  }),
);

it.effect("returns TopicUnavailable when an accessible Channel does not contain the Topic", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("reader-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("reader-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("missing-topic");
    const channel = Channel.make({
      id: channelId,
      workspaceId,
      name: ChannelName.make("general"),
      purpose: ChannelPurpose.make("Coordinate workspace topics."),
      visibility: "public",
      maintainerIdentityId: actorIdentityId,
    });
    const lookupCount = yield* Ref.make(0);
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
      findById: () => Ref.update(lookupCount, (count) => count + 1).pipe(Effect.as(undefined)),
    });

    const error = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics
        .getForActor(actorAccountId, workspaceId, channelId, topicId)
        .pipe(Effect.flip);
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(error).toBeInstanceOf(TopicUnavailable);
    expect(error).toMatchObject({ topicId });
    expect(yield* Ref.get(lookupCount)).toBe(1);
  }),
);
