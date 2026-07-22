import { Contribution, Topic } from "@cove/domain";
import {
  type PersistenceError,
  type TopicContributionRecord,
  type TopicRecord,
  TopicRepository,
  type TopicSummaryRecord,
  TransactionManager,
} from "@cove/ports";
import { Clock, Effect, Layer } from "effect";
import {
  ChannelAccess,
  ChannelAccessFailure,
  type ChannelConversationContext,
} from "../channels/channel-access.ts";
import { ChannelUnavailable } from "../channels/get-channel-for-actor.ts";
import {
  type CreateTopicCommand,
  TopicAccess,
  TopicAccessFailure,
  TopicContributionView,
  TopicSummaryView,
  TopicUnavailable,
  TopicView,
} from "./topic-access.ts";

function contributionView(record: TopicContributionRecord): TopicContributionView {
  return TopicContributionView.make(record);
}

function topicSummaryView(record: TopicSummaryRecord): TopicSummaryView {
  return TopicSummaryView.make({
    topic: record.topic,
    openingBrief: contributionView(record.openingBrief),
    contributionCount: record.contributionCount,
  });
}

function topicView(record: TopicRecord): TopicView {
  return TopicView.make({
    topic: record.topic,
    contributions: record.contributions.map(contributionView),
  });
}

const make = Effect.gen(function* () {
  const channels = yield* ChannelAccess;
  const repository = yield* TopicRepository;
  const transactions = yield* TransactionManager;

  const accessFailure = (operation: string) => new TopicAccessFailure({ operation });
  const recoverFailure = <A, E, R>(
    operation: string,
    effect: Effect.Effect<A, E | ChannelAccessFailure | PersistenceError, R>,
  ): Effect.Effect<A, E | TopicAccessFailure, R> =>
    effect.pipe(
      Effect.catchTag("Application.ChannelAccessFailure", () =>
        Effect.fail(accessFailure(operation)),
      ),
      Effect.catchTag("Ports.PersistenceError", () => Effect.fail(accessFailure(operation))),
    );

  const conversationContext = Effect.fn("TopicAccess.conversationContext")(function* (
    actorAccountId: CreateTopicCommand["actorAccountId"],
    workspaceId: CreateTopicCommand["workspaceId"],
    channelId: CreateTopicCommand["channelId"],
  ): Effect.fn.Return<ChannelConversationContext, ChannelUnavailable | ChannelAccessFailure> {
    return yield* channels.getConversationContextForActor(actorAccountId, workspaceId, channelId);
  });

  return TopicAccess.of({
    listForActor: Effect.fn("TopicAccess.listForActor")(
      function* (actorAccountId, workspaceId, channelId) {
        yield* conversationContext(actorAccountId, workspaceId, channelId);
        const summaries = yield* repository.listSummariesInChannel(workspaceId, channelId);
        return summaries.map(topicSummaryView);
      },
      (effect) => recoverFailure("TopicAccess.listForActor", effect),
    ),
    getForActor: Effect.fn("TopicAccess.getForActor")(
      function* (actorAccountId, workspaceId, channelId, topicId) {
        yield* conversationContext(actorAccountId, workspaceId, channelId);
        const record = yield* repository.findById(workspaceId, channelId, topicId);
        if (record === undefined) {
          return yield* Effect.fail(new TopicUnavailable({ topicId }));
        }
        return topicView(record);
      },
      (effect) => recoverFailure("TopicAccess.getForActor", effect),
    ),
    create: Effect.fn("TopicAccess.create")(
      (command) =>
        transactions.run(
          Effect.gen(function* () {
            const context = yield* conversationContext(
              command.actorAccountId,
              command.workspaceId,
              command.channelId,
            );
            if (!context.hasChannelMembership) {
              return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
            }

            const now = new Date(yield* Clock.currentTimeMillis);
            const topic = Topic.make({
              id: command.topicId,
              workspaceId: command.workspaceId,
              channelId: command.channelId,
              title: command.title,
              ...(command.intent === undefined ? {} : { intent: command.intent }),
              openedByIdentityId: context.actor.id,
              createdAt: now,
            });
            const openingBrief = Contribution.make({
              id: command.openingBriefContributionId,
              workspaceId: command.workspaceId,
              topicId: command.topicId,
              authorIdentityId: context.actor.id,
              body: command.openingBrief,
              position: 1,
              createdAt: now,
            });

            yield* repository.insertTopic(topic);
            yield* repository.insertContribution(openingBrief);

            return TopicView.make({
              topic,
              contributions: [
                TopicContributionView.make({
                  contribution: openingBrief,
                  author: context.actor,
                }),
              ],
            });
          }),
        ),
      (effect) => recoverFailure("TopicAccess.create", effect),
    ),
  });
});

export const TopicAccessLive = Layer.effect(TopicAccess, make);
