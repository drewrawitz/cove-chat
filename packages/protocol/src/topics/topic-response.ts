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
  createdAt: Schema.DateFromString,
  edited: Schema.Boolean,
  deleted: Schema.Boolean,
  author: TopicAuthorResponse,
}).annotate({ identifier: "TopicMessageResponse" });
export interface TopicMessageResponse extends Schema.Schema.Type<typeof TopicMessageResponse> {}

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

export const TopicResponse = Schema.Struct({
  ...TopicResponseFields,
  messages: Schema.Array(TopicMessageResponse),
}).annotate({ identifier: "TopicResponse" });
export interface TopicResponse extends Schema.Schema.Type<typeof TopicResponse> {}
