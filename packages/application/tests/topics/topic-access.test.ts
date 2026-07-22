import { expect, it } from "@effect/vitest";
import {
  Channel,
  ChannelName,
  ChannelPurpose,
  Contribution,
  ContributionBody,
  Topic,
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  makeChannelId,
  makeContributionId,
  makeTopicId,
  makeTopicTitle,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { TopicRepository, TransactionManager, type TopicRepositoryService } from "@cove/ports";
import { Effect, Layer, Ref } from "effect";
import {
  AddContributionCommand,
  ChannelAccess,
  ContributionMutationForbidden,
  DeleteContributionCommand,
  EditContributionCommand,
  CreateTopicCommand,
  ContributionUnavailable,
  TopicAccess,
  TopicAccessLive,
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
    listSummariesInChannel: () => unexpected("TopicRepository", "listSummariesInChannel"),
    findById: () => unexpected("TopicRepository", "findById"),
    insertTopic: () => unexpected("TopicRepository", "insertTopic"),
    insertContribution: () => unexpected("TopicRepository", "insertContribution"),
    appendContribution: () => unexpected("TopicRepository", "appendContribution"),
    editContribution: () => unexpected("TopicRepository", "editContribution"),
    tombstoneContribution: () => unexpected("TopicRepository", "tombstoneContribution"),
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
    const contributionId = yield* makeContributionId("contribution-1");
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
    const insertedContributions = yield* Ref.make<ReadonlyArray<unknown>>([]);
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
      insertContribution: (contribution) =>
        Ref.update(insertedContributions, (contributions) => [...contributions, contribution]),
    });

    const created = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics.create(
        CreateTopicCommand.make({
          actorAccountId,
          workspaceId,
          channelId,
          topicId,
          openingBriefContributionId: contributionId,
          title,
          openingBrief: ContributionBody.make("Capture the remaining launch risks."),
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
    });
    expect(created.contributions).toHaveLength(1);
    expect(created.contributions[0]?.contribution).toMatchObject({
      id: contributionId,
      topicId,
      body: "Capture the remaining launch risks.",
      position: 1,
    });
    const topics = yield* Ref.get(insertedTopics);
    const contributions = yield* Ref.get(insertedContributions);
    expect(topics).toHaveLength(1);
    expect(contributions).toHaveLength(1);
  }),
);

it.effect("adds a flat Contribution at the next Topic position for a Channel Member", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("member-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("member-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const contributionId = yield* makeContributionId("contribution-2");
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
      findById: () => Effect.succeed({ topic, contributions: [] }),
      appendContribution: (contribution) =>
        Effect.succeed(
          Contribution.make({
            ...contribution,
            position: 2,
          }),
        ),
    });

    const added = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics.addContribution(
        AddContributionCommand.make({
          actorAccountId,
          workspaceId,
          channelId,
          topicId,
          contributionId,
          body: ContributionBody.make("The release candidate passed smoke testing."),
        }),
      );
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(added).toMatchObject({
      contribution: {
        id: contributionId,
        topicId,
        authorIdentityId: actorIdentityId,
        body: "The release candidate passed smoke testing.",
        position: 2,
      },
      author: { id: actorIdentityId, name: "Channel Member" },
    });
  }),
);

it.effect("lets a Contribution author correct their writing with an edited marker", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("author-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("author-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const contributionId = yield* makeContributionId("contribution-2");
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
      createdAt,
    });
    const original = Contribution.make({
      id: contributionId,
      workspaceId,
      topicId,
      authorIdentityId: actorIdentityId,
      body: ContributionBody.make("The release candidate passed smoke testng."),
      position: 2,
      createdAt,
    });
    const author = {
      id: actorIdentityId,
      name: WorkspaceIdentityName.make("Contribution Author"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/author.svg"),
    };
    const channelAccess = makeChannelAccess({
      getConversationContextForActor: () =>
        Effect.succeed({ channel, actor: author, hasChannelMembership: true }),
    });
    const repository = makeRepository({
      findById: () =>
        Effect.succeed({ topic, contributions: [{ contribution: original, author }] }),
      editContribution: (edit) =>
        Effect.succeed(
          Contribution.make({
            ...original,
            body: edit.body,
            editedAt,
          }),
        ),
    });

    const corrected = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics.editContribution(
        EditContributionCommand.make({
          actorAccountId,
          workspaceId,
          channelId,
          topicId,
          contributionId,
          body: ContributionBody.make("The release candidate passed smoke testing."),
        }),
      );
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(corrected.contribution).toMatchObject({
      id: contributionId,
      body: "The release candidate passed smoke testing.",
      position: 2,
      editedAt,
    });
  }),
);

it.effect("lets a Contribution author leave a tombstone without removing its position", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("author-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("author-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const contributionId = yield* makeContributionId("contribution-2");
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
      createdAt,
    });
    const original = Contribution.make({
      id: contributionId,
      workspaceId,
      topicId,
      authorIdentityId: actorIdentityId,
      body: ContributionBody.make("This Contribution will be removed."),
      position: 2,
      createdAt,
    });
    const author = {
      id: actorIdentityId,
      name: WorkspaceIdentityName.make("Contribution Author"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/author.svg"),
    };
    const channelAccess = makeChannelAccess({
      getConversationContextForActor: () =>
        Effect.succeed({ channel, actor: author, hasChannelMembership: true }),
    });
    const repository = makeRepository({
      findById: () =>
        Effect.succeed({ topic, contributions: [{ contribution: original, author }] }),
      tombstoneContribution: () =>
        Effect.succeed(
          Contribution.make({
            id: contributionId,
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
      return yield* topics.deleteContribution(
        DeleteContributionCommand.make({
          actorAccountId,
          workspaceId,
          channelId,
          topicId,
          contributionId,
        }),
      );
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(tombstone.contribution).toMatchObject({
      id: contributionId,
      position: 2,
      deletedAt,
    });
    expect(tombstone.contribution).not.toHaveProperty("body");
  }),
);

it.effect("does not let an author edit a tombstoned Contribution", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("author-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("author-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const contributionId = yield* makeContributionId("contribution-2");
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
      createdAt,
    });
    const tombstone = Contribution.make({
      id: contributionId,
      workspaceId,
      topicId,
      authorIdentityId: actorIdentityId,
      position: 2,
      createdAt,
      deletedAt: new Date("2026-07-22T12:05:00.000Z"),
    });
    const author = {
      id: actorIdentityId,
      name: WorkspaceIdentityName.make("Contribution Author"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/author.svg"),
    };
    const editCount = yield* Ref.make(0);
    const channelAccess = makeChannelAccess({
      getConversationContextForActor: () =>
        Effect.succeed({ channel, actor: author, hasChannelMembership: true }),
    });
    const repository = makeRepository({
      findById: () =>
        Effect.succeed({ topic, contributions: [{ contribution: tombstone, author }] }),
      editContribution: () =>
        Ref.update(editCount, (count) => count + 1).pipe(Effect.as(tombstone)),
    });

    const error = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* topics
        .editContribution(
          EditContributionCommand.make({
            actorAccountId,
            workspaceId,
            channelId,
            topicId,
            contributionId,
            body: ContributionBody.make("Restored content."),
          }),
        )
        .pipe(Effect.flip);
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(error).toBeInstanceOf(ContributionUnavailable);
    expect(yield* Ref.get(editCount)).toBe(0);
  }),
);

it.effect("does not let a Channel participant change another author's Contribution", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("participant-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("participant-identity");
    const authorIdentityId = yield* makeWorkspaceIdentityId("author-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const contributionId = yield* makeContributionId("contribution-2");
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
      createdAt,
    });
    const contribution = Contribution.make({
      id: contributionId,
      workspaceId,
      topicId,
      authorIdentityId,
      body: ContributionBody.make("The author's Contribution."),
      position: 2,
      createdAt,
    });
    const author = {
      id: authorIdentityId,
      name: WorkspaceIdentityName.make("Contribution Author"),
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
      findById: () => Effect.succeed({ topic, contributions: [{ contribution, author }] }),
      editContribution: () =>
        Ref.update(mutationCount, (count) => count + 1).pipe(Effect.as(contribution)),
      tombstoneContribution: () =>
        Ref.update(mutationCount, (count) => count + 1).pipe(Effect.as(contribution)),
    });

    const errors = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return yield* Effect.all([
        topics
          .editContribution(
            EditContributionCommand.make({
              actorAccountId,
              workspaceId,
              channelId,
              topicId,
              contributionId,
              body: ContributionBody.make("Unauthorized edit."),
            }),
          )
          .pipe(Effect.flip),
        topics
          .deleteContribution(
            DeleteContributionCommand.make({
              actorAccountId,
              workspaceId,
              channelId,
              topicId,
              contributionId,
            }),
          )
          .pipe(Effect.flip),
      ]);
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(errors[0]).toBeInstanceOf(ContributionMutationForbidden);
    expect(errors[1]).toBeInstanceOf(ContributionMutationForbidden);
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
    const contributionId = yield* makeContributionId("contribution-1");
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
      insertContribution: () => Ref.update(insertCount, (count) => count + 1),
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
              openingBriefContributionId: contributionId,
              title,
              openingBrief: ContributionBody.make("Capture the remaining launch risks."),
            }),
          )
          .pipe(Effect.flip),
        topics
          .addContribution(
            AddContributionCommand.make({
              actorAccountId,
              workspaceId,
              channelId,
              topicId,
              contributionId,
              body: ContributionBody.make("Readers cannot add Contributions."),
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

it.effect("inherits Channel read access when browsing and opening Topics", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("reader-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("reader-identity");
    const authorIdentityId = yield* makeWorkspaceIdentityId("author-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const contributionId = yield* makeContributionId("contribution-1");
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
      createdAt,
    });
    const openingBrief = {
      contribution: Contribution.make({
        id: contributionId,
        workspaceId,
        topicId,
        authorIdentityId,
        body: ContributionBody.make("Capture the remaining launch risks."),
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
      listSummariesInChannel: () => Effect.succeed([{ topic, openingBrief, contributionCount: 1 }]),
      findById: () => Effect.succeed({ topic, contributions: [openingBrief] }),
    });

    const result = yield* Effect.gen(function* () {
      const topics = yield* TopicAccess;
      return {
        summaries: yield* topics.listForActor(actorAccountId, workspaceId, channelId),
        detail: yield* topics.getForActor(actorAccountId, workspaceId, channelId, topicId),
      };
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]?.openingBrief.contribution.body).toBe(
      "Capture the remaining launch risks.",
    );
    expect(result.detail.topic.id).toBe(topicId);
    expect(result.detail.contributions).toHaveLength(1);
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
