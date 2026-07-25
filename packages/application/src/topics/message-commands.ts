import {
  ChannelId,
  MessageBody,
  MessageCommandId,
  MessageId,
  MessageVersion,
  TopicId,
  UserId,
  WorkspaceId,
} from "@cove/domain";
import { Context, type Effect, type Option, Schema } from "effect";
import type { ChannelUnavailable } from "../channels/get-channel-for-actor.ts";
import type { TopicUnavailable } from "./topic-access.ts";

const MessageCommandScope = {
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  topicId: TopicId,
  commandId: MessageCommandId,
};

export const CreateReplyCommand = Schema.TaggedStruct("create", {
  ...MessageCommandScope,
  body: MessageBody,
});
export interface CreateReplyCommand extends Schema.Schema.Type<typeof CreateReplyCommand> {}

export const EditMessageCommand = Schema.TaggedStruct("edit", {
  ...MessageCommandScope,
  messageId: MessageId,
  expectedVersion: MessageVersion,
  body: MessageBody,
});
export interface EditMessageCommand extends Schema.Schema.Type<typeof EditMessageCommand> {}

export const DeleteMessageCommand = Schema.TaggedStruct("delete", {
  ...MessageCommandScope,
  messageId: MessageId,
  expectedVersion: MessageVersion,
});
export interface DeleteMessageCommand extends Schema.Schema.Type<typeof DeleteMessageCommand> {}

export const MessageCommand = Schema.Union([
  CreateReplyCommand,
  EditMessageCommand,
  DeleteMessageCommand,
]);
export type MessageCommand = typeof MessageCommand.Type;

export const MessageCommandRejection = Schema.Literals([
  "channel_unavailable",
  "topic_unavailable",
  "message_unavailable",
  "mutation_forbidden",
  "stale_version",
]);
export type MessageCommandRejection = typeof MessageCommandRejection.Type;

export const MessageCommandKind = Schema.Union([
  CreateReplyCommand.fields._tag,
  EditMessageCommand.fields._tag,
  DeleteMessageCommand.fields._tag,
]);
export type MessageCommandKind = typeof MessageCommandKind.Type;

export const MessageCommandSucceeded = Schema.TaggedStruct("succeeded", {
  commandId: MessageCommandId,
  kind: MessageCommandKind,
  messageId: MessageId,
  messageVersion: MessageVersion,
});
export interface MessageCommandSucceeded extends Schema.Schema.Type<
  typeof MessageCommandSucceeded
> {}

export const MessageCommandRejected = Schema.TaggedStruct("rejected", {
  commandId: MessageCommandId,
  kind: MessageCommandKind,
  rejection: MessageCommandRejection,
  messageId: Schema.optionalKey(MessageId),
});
export interface MessageCommandRejected extends Schema.Schema.Type<typeof MessageCommandRejected> {}

export const MessageCommandStatus = Schema.Union([MessageCommandSucceeded, MessageCommandRejected]);
export type MessageCommandStatus = typeof MessageCommandStatus.Type;

export class MessageCommandConflict extends Schema.TaggedErrorClass<MessageCommandConflict>()(
  "Application.MessageCommandConflict",
  { commandId: MessageCommandId },
) {}

export class MessageMutationForbidden extends Schema.TaggedErrorClass<MessageMutationForbidden>()(
  "Application.MessageMutationForbidden",
  { messageId: MessageId },
) {}

export class MessageUnavailable extends Schema.TaggedErrorClass<MessageUnavailable>()(
  "Application.MessageUnavailable",
  { messageId: MessageId },
) {}

export class StaleMessageVersion extends Schema.TaggedErrorClass<StaleMessageVersion>()(
  "Application.StaleMessageVersion",
  {
    messageId: MessageId,
    expectedVersion: MessageVersion,
  },
) {}

export class MessageCommandFailure extends Schema.TaggedErrorClass<MessageCommandFailure>()(
  "Application.MessageCommandFailure",
  { operation: Schema.String },
) {}

export interface MessageCommandsService {
  readonly execute: (
    command: MessageCommand,
  ) => Effect.Effect<
    MessageCommandSucceeded,
    | ChannelUnavailable
    | TopicUnavailable
    | MessageUnavailable
    | MessageMutationForbidden
    | StaleMessageVersion
    | MessageCommandConflict
    | MessageCommandFailure
  >;
  readonly status: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    commandId: MessageCommandId,
  ) => Effect.Effect<Option.Option<MessageCommandStatus>, MessageCommandFailure>;
}

export class MessageCommands extends Context.Service<MessageCommands, MessageCommandsService>()(
  "@cove/application/MessageCommands",
) {}
