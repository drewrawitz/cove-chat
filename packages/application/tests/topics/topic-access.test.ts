import { expect, it } from "@effect/vitest";
import {
  Channel,
  ChannelName,
  ChannelPurpose,
  Contribution,
  ContributionBody,
  TopicTitle,
  Topic,
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  makeChannelId,
  makeContributionId,
  makeTopicId,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { TopicRepository, TransactionManager, type TopicRepositoryService } from "@cove/ports";
import { Effect, Layer, Ref } from "effect";
import {
  ChannelAccess,
  CreateTopicCommand,
  TopicAccess,
  TopicAccessLive,
  ChannelUnavailable,
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
          title: TopicTitle.make("Release readiness"),
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

it.effect("does not let a Public Channel reader create a Topic before joining", () =>
  Effect.gen(function* () {
    const actorAccountId = yield* makeUserId("reader-account");
    const actorIdentityId = yield* makeWorkspaceIdentityId("reader-identity");
    const maintainerIdentityId = yield* makeWorkspaceIdentityId("maintainer-identity");
    const workspaceId = yield* makeWorkspaceId("workspace");
    const channelId = yield* makeChannelId("general");
    const topicId = yield* makeTopicId("topic-1");
    const contributionId = yield* makeContributionId("contribution-1");
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
      return yield* topics
        .create(
          CreateTopicCommand.make({
            actorAccountId,
            workspaceId,
            channelId,
            topicId,
            openingBriefContributionId: contributionId,
            title: TopicTitle.make("Release readiness"),
            openingBrief: ContributionBody.make("Capture the remaining launch risks."),
          }),
        )
        .pipe(Effect.flip);
    }).pipe(Effect.provide(topicAccessTestLayer(channelAccess, repository)));

    expect(error).toBeInstanceOf(ChannelUnavailable);
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
      title: TopicTitle.make("Release readiness"),
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
