import {
  ChannelId,
  Message,
  MessageBody,
  MessageId,
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

export const TopicMessageView = Schema.Struct({
  message: Message,
  author: WorkspaceIdentityView,
});
export interface TopicMessageView extends Schema.Schema.Type<typeof TopicMessageView> {}

export const TopicSummaryView = Schema.Struct({
  topic: Topic,
  openingBrief: TopicMessageView,
  messageCount: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface TopicSummaryView extends Schema.Schema.Type<typeof TopicSummaryView> {}

export const TopicView = Schema.Struct({
  topic: Topic,
  messages: Schema.Array(TopicMessageView),
});
export interface TopicView extends Schema.Schema.Type<typeof TopicView> {}

export const CreateTopicCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  topicId: TopicId,
  openingBriefMessageId: MessageId,
  title: TopicTitle,
  openingBrief: MessageBody,
  intent: Schema.optionalKey(TopicIntent),
});
export interface CreateTopicCommand extends Schema.Schema.Type<typeof CreateTopicCommand> {}

export const AddMessageCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  topicId: TopicId,
  messageId: MessageId,
  body: MessageBody,
});
export interface AddMessageCommand extends Schema.Schema.Type<typeof AddMessageCommand> {}

export const EditMessageCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  topicId: TopicId,
  messageId: MessageId,
  body: MessageBody,
});
export interface EditMessageCommand extends Schema.Schema.Type<typeof EditMessageCommand> {}

export const DeleteMessageCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  topicId: TopicId,
  messageId: MessageId,
});
export interface DeleteMessageCommand extends Schema.Schema.Type<typeof DeleteMessageCommand> {}

export class TopicAccessFailure extends Schema.TaggedErrorClass<TopicAccessFailure>()(
  "Application.TopicAccessFailure",
  { operation: Schema.String },
) {}

export class TopicUnavailable extends Schema.TaggedErrorClass<TopicUnavailable>()(
  "Application.TopicUnavailable",
  { topicId: TopicId },
) {}

export class MessageMutationForbidden extends Schema.TaggedErrorClass<MessageMutationForbidden>()(
  "Application.MessageMutationForbidden",
  { messageId: MessageId },
) {}

export class MessageUnavailable extends Schema.TaggedErrorClass<MessageUnavailable>()(
  "Application.MessageUnavailable",
  { messageId: MessageId },
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
  readonly addMessage: (
    command: AddMessageCommand,
  ) => Effect.Effect<TopicMessageView, ChannelUnavailable | TopicUnavailable | TopicAccessFailure>;
  readonly editMessage: (
    command: EditMessageCommand,
  ) => Effect.Effect<
    TopicMessageView,
    | ChannelUnavailable
    | TopicUnavailable
    | MessageUnavailable
    | MessageMutationForbidden
    | TopicAccessFailure
  >;
  readonly deleteMessage: (
    command: DeleteMessageCommand,
  ) => Effect.Effect<
    TopicMessageView,
    | ChannelUnavailable
    | TopicUnavailable
    | MessageUnavailable
    | MessageMutationForbidden
    | TopicAccessFailure
  >;
}

export class TopicAccess extends Context.Service<TopicAccess, TopicAccessService>()(
  "@cove/application/TopicAccess",
) {}
