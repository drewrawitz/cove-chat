import {
  Contribution,
  Topic,
  TopicId,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
  type ChannelId,
} from "@cove/domain";
import { Context, type Effect, Schema } from "effect";
import type { PersistenceError } from "../persistence-error.ts";

export const TopicAuthorRecord = Schema.Struct({
  id: WorkspaceIdentityId,
  name: WorkspaceIdentityName,
  avatarUrl: WorkspaceAvatarUrl,
});
export interface TopicAuthorRecord extends Schema.Schema.Type<typeof TopicAuthorRecord> {}

export const TopicContributionRecord = Schema.Struct({
  contribution: Contribution,
  author: TopicAuthorRecord,
});
export interface TopicContributionRecord extends Schema.Schema.Type<
  typeof TopicContributionRecord
> {}

export const TopicSummaryRecord = Schema.Struct({
  topic: Topic,
  openingBrief: TopicContributionRecord,
  contributionCount: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface TopicSummaryRecord extends Schema.Schema.Type<typeof TopicSummaryRecord> {}

export const TopicRecord = Schema.Struct({
  topic: Topic,
  contributions: Schema.Array(TopicContributionRecord),
});
export interface TopicRecord extends Schema.Schema.Type<typeof TopicRecord> {}

export interface TopicRepositoryService {
  readonly listSummariesInChannel: (
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<ReadonlyArray<TopicSummaryRecord>, PersistenceError>;
  readonly findById: (
    workspaceId: WorkspaceId,
    channelId: ChannelId,
    topicId: TopicId,
  ) => Effect.Effect<TopicRecord | undefined, PersistenceError>;
  readonly insertTopic: (topic: Topic) => Effect.Effect<void, PersistenceError>;
  readonly insertContribution: (
    contribution: Contribution,
  ) => Effect.Effect<void, PersistenceError>;
}

export class TopicRepository extends Context.Service<TopicRepository, TopicRepositoryService>()(
  "@cove/ports/TopicRepository",
) {}
