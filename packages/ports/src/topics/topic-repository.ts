import {
  Contribution,
  ContributionBody,
  ContributionId,
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

export interface ContributionAppend {
  readonly id: ContributionId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: TopicId;
  readonly authorIdentityId: WorkspaceIdentityId;
  readonly body: ContributionBody;
  readonly createdAt: Date;
}

export interface ContributionEdit {
  readonly workspaceId: WorkspaceId;
  readonly topicId: TopicId;
  readonly contributionId: ContributionId;
  readonly body: ContributionBody;
  readonly editedAt: Date;
}

export interface ContributionTombstone {
  readonly workspaceId: WorkspaceId;
  readonly topicId: TopicId;
  readonly contributionId: ContributionId;
  readonly deletedAt: Date;
}

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
  readonly appendContribution: (
    contribution: ContributionAppend,
  ) => Effect.Effect<Contribution, PersistenceError>;
  readonly editContribution: (
    edit: ContributionEdit,
  ) => Effect.Effect<Contribution, PersistenceError>;
  readonly tombstoneContribution: (
    tombstone: ContributionTombstone,
  ) => Effect.Effect<Contribution, PersistenceError>;
}

export class TopicRepository extends Context.Service<TopicRepository, TopicRepositoryService>()(
  "@cove/ports/TopicRepository",
) {}
