import { Schema } from "effect";
import { protocolUtf8ByteLimit } from "../content-bounds.ts";
import { TopicIntentValue } from "./topic-intent.ts";

export const TopicAuthorResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  avatarUrl: Schema.String,
}).annotate({ identifier: "TopicAuthorResponse" });
export interface TopicAuthorResponse extends Schema.Schema.Type<typeof TopicAuthorResponse> {}

export const TopicMessageResponse = Schema.Struct({
  id: Schema.String,
  body: Schema.optionalKey(Schema.String),
  position: Schema.Int.check(Schema.isGreaterThan(0)),
  version: Schema.Int.check(Schema.isGreaterThan(0)),
  producedByCommandId: Schema.optionalKey(Schema.String),
  createdAt: Schema.DateFromString,
  edited: Schema.Boolean,
  deleted: Schema.Boolean,
  author: TopicAuthorResponse,
}).annotate({ identifier: "TopicMessageResponse" });
export interface TopicMessageResponse extends Schema.Schema.Type<typeof TopicMessageResponse> {}

const MessageCommandResponseFields = {
  commandId: Schema.String,
  kind: Schema.Literals(["create", "edit", "delete"]),
};

export const MessageCommandAcceptedResponse = Schema.Struct({
  ...MessageCommandResponseFields,
  status: Schema.Literal("succeeded"),
  messageId: Schema.String,
  messageVersion: Schema.Int.check(Schema.isGreaterThan(0)),
}).annotate({ identifier: "MessageCommandAcceptedResponse" });
export interface MessageCommandAcceptedResponse extends Schema.Schema.Type<
  typeof MessageCommandAcceptedResponse
> {}

export const MessageCommandRejectedStatusResponse = Schema.Struct({
  ...MessageCommandResponseFields,
  status: Schema.Literal("rejected"),
  rejection: Schema.Literals([
    "channel_unavailable",
    "topic_unavailable",
    "message_unavailable",
    "mutation_forbidden",
    "stale_version",
  ]),
  messageId: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "MessageCommandRejectedStatusResponse" });
export interface MessageCommandRejectedStatusResponse extends Schema.Schema.Type<
  typeof MessageCommandRejectedStatusResponse
> {}

export const MessageCommandStatusResponse = Schema.Union([
  MessageCommandAcceptedResponse,
  MessageCommandRejectedStatusResponse,
]).annotate({ identifier: "MessageCommandStatusResponse" });
export type MessageCommandStatusResponse = typeof MessageCommandStatusResponse.Type;

export const TopicSummaryMessageResponse = Schema.Struct({
  id: Schema.String,
  preview: Schema.optionalKey(Schema.String.check(protocolUtf8ByteLimit(512))),
  position: Schema.Int.check(Schema.isGreaterThan(0)),
  createdAt: Schema.DateFromString,
  edited: Schema.Boolean,
  deleted: Schema.Boolean,
  author: TopicAuthorResponse,
}).annotate({ identifier: "TopicSummaryMessageResponse" });
export interface TopicSummaryMessageResponse extends Schema.Schema.Type<
  typeof TopicSummaryMessageResponse
> {}

const TopicResponseFields = {
  id: Schema.String,
  workspaceId: Schema.String,
  channelId: Schema.String,
  title: Schema.String,
  intent: Schema.optionalKey(TopicIntentValue),
  createdAt: Schema.DateFromString,
};

export const TopicSummaryResponse = Schema.Struct({
  ...TopicResponseFields,
  latestMessage: TopicSummaryMessageResponse,
  messageCount: Schema.Int.check(Schema.isGreaterThan(0)),
  lastActivityAt: Schema.DateFromString,
}).annotate({ identifier: "TopicSummaryResponse" });
export interface TopicSummaryResponse extends Schema.Schema.Type<typeof TopicSummaryResponse> {}

export const TopicArchivePageResponse = Schema.Struct({
  topics: Schema.Array(TopicSummaryResponse),
  nextCursor: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "TopicArchivePageResponse" });
export interface TopicArchivePageResponse extends Schema.Schema.Type<
  typeof TopicArchivePageResponse
> {}

export const CreatedTopicResponse = Schema.Struct({
  ...TopicResponseFields,
  openingBrief: TopicMessageResponse,
}).annotate({ identifier: "CreatedTopicResponse" });
export interface CreatedTopicResponse extends Schema.Schema.Type<typeof CreatedTopicResponse> {}
