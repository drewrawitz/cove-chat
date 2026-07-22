import {
  ChannelId,
  Contribution,
  ContributionBody,
  ContributionId,
  Topic,
  TopicId,
  TopicIntent,
  TopicTitle,
  UserId,
  WorkspaceId,
} from "@cove/domain";
import { Context, type Effect, Schema } from "effect";
import { WorkspaceIdentityView } from "../channels/channel-access.ts";
import type { ChannelUnavailable } from "../channels/get-channel-for-actor.ts";

export const TopicContributionView = Schema.Struct({
  contribution: Contribution,
  author: WorkspaceIdentityView,
});
export interface TopicContributionView extends Schema.Schema.Type<typeof TopicContributionView> {}

export const TopicSummaryView = Schema.Struct({
  topic: Topic,
  openingBrief: TopicContributionView,
  contributionCount: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface TopicSummaryView extends Schema.Schema.Type<typeof TopicSummaryView> {}

export const TopicView = Schema.Struct({
  topic: Topic,
  contributions: Schema.Array(TopicContributionView),
});
export interface TopicView extends Schema.Schema.Type<typeof TopicView> {}

export const CreateTopicCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  topicId: TopicId,
  openingBriefContributionId: ContributionId,
  title: TopicTitle,
  openingBrief: ContributionBody,
  intent: Schema.optionalKey(TopicIntent),
});
export interface CreateTopicCommand extends Schema.Schema.Type<typeof CreateTopicCommand> {}

export class TopicAccessFailure extends Schema.TaggedErrorClass<TopicAccessFailure>()(
  "Application.TopicAccessFailure",
  { operation: Schema.String },
) {}

export class TopicUnavailable extends Schema.TaggedErrorClass<TopicUnavailable>()(
  "Application.TopicUnavailable",
  { topicId: TopicId },
) {}

export interface TopicAccessService {
  readonly listForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<ReadonlyArray<TopicSummaryView>, ChannelUnavailable | TopicAccessFailure>;
  readonly getForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
    topicId: TopicId,
  ) => Effect.Effect<TopicView, ChannelUnavailable | TopicUnavailable | TopicAccessFailure>;
  readonly create: (
    command: CreateTopicCommand,
  ) => Effect.Effect<TopicView, ChannelUnavailable | TopicAccessFailure>;
}

export class TopicAccess extends Context.Service<TopicAccess, TopicAccessService>()(
  "@cove/application/TopicAccess",
) {}
