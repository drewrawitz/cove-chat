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
  type AddContributionCommand,
  type CreateTopicCommand,
  ContributionMutationForbidden,
  ContributionUnavailable,
  type DeleteContributionCommand,
  type EditContributionCommand,
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

  const contributionMutationTarget = Effect.fn("TopicAccess.contributionMutationTarget")(function* (
    command: EditContributionCommand | DeleteContributionCommand,
  ) {
    const context = yield* conversationContext(
      command.actorAccountId,
      command.workspaceId,
      command.channelId,
    );
    if (!context.hasChannelMembership) {
      return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
    }

    const topic = yield* repository.findById(
      command.workspaceId,
      command.channelId,
      command.topicId,
    );
    if (topic === undefined) {
      return yield* Effect.fail(new TopicUnavailable({ topicId: command.topicId }));
    }
    const current = topic.contributions.find(
      ({ contribution }) => contribution.id === command.contributionId,
    );
    if (current === undefined || current.contribution.deletedAt !== undefined) {
      return yield* Effect.fail(
        new ContributionUnavailable({ contributionId: command.contributionId }),
      );
    }
    if (current.contribution.authorIdentityId !== context.actor.id) {
      return yield* Effect.fail(
        new ContributionMutationForbidden({ contributionId: command.contributionId }),
      );
    }
    return current;
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
    addContribution: Effect.fn("TopicAccess.addContribution")(
      (command: AddContributionCommand) =>
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

            const topic = yield* repository.findById(
              command.workspaceId,
              command.channelId,
              command.topicId,
            );
            if (topic === undefined) {
              return yield* Effect.fail(new TopicUnavailable({ topicId: command.topicId }));
            }

            const contribution = yield* repository.appendContribution({
              id: command.contributionId,
              workspaceId: command.workspaceId,
              topicId: command.topicId,
              authorIdentityId: context.actor.id,
              body: command.body,
              createdAt: new Date(yield* Clock.currentTimeMillis),
            });
            return TopicContributionView.make({ contribution, author: context.actor });
          }),
        ),
      (effect) => recoverFailure("TopicAccess.addContribution", effect),
    ),
    editContribution: Effect.fn("TopicAccess.editContribution")(
      (command: EditContributionCommand) =>
        transactions.run(
          Effect.gen(function* () {
            const current = yield* contributionMutationTarget(command);

            const contribution = yield* repository.editContribution({
              workspaceId: command.workspaceId,
              topicId: command.topicId,
              contributionId: command.contributionId,
              body: command.body,
              editedAt: new Date(yield* Clock.currentTimeMillis),
            });
            return TopicContributionView.make({ contribution, author: current.author });
          }),
        ),
      (effect) => recoverFailure("TopicAccess.editContribution", effect),
    ),
    deleteContribution: Effect.fn("TopicAccess.deleteContribution")(
      (command: DeleteContributionCommand) =>
        transactions.run(
          Effect.gen(function* () {
            const current = yield* contributionMutationTarget(command);

            const contribution = yield* repository.tombstoneContribution({
              workspaceId: command.workspaceId,
              topicId: command.topicId,
              contributionId: command.contributionId,
              deletedAt: new Date(yield* Clock.currentTimeMillis),
            });
            return TopicContributionView.make({ contribution, author: current.author });
          }),
        ),
      (effect) => recoverFailure("TopicAccess.deleteContribution", effect),
    ),
  });
});

export const TopicAccessLive = Layer.effect(TopicAccess, make);
