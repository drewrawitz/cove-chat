import { Schema } from "effect";
import { TopicIntentValue } from "./topic-intent.ts";

export const TopicAuthorResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  avatarUrl: Schema.String,
}).annotate({ identifier: "TopicAuthorResponse" });
export interface TopicAuthorResponse extends Schema.Schema.Type<typeof TopicAuthorResponse> {}

export const TopicContributionResponse = Schema.Struct({
  id: Schema.String,
  body: Schema.String,
  position: Schema.Int.check(Schema.isGreaterThan(0)),
  createdAt: Schema.DateFromString,
  author: TopicAuthorResponse,
}).annotate({ identifier: "TopicContributionResponse" });
export interface TopicContributionResponse extends Schema.Schema.Type<
  typeof TopicContributionResponse
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
  openingBrief: TopicContributionResponse,
  contributionCount: Schema.Int.check(Schema.isGreaterThan(0)),
}).annotate({ identifier: "TopicSummaryResponse" });
export interface TopicSummaryResponse extends Schema.Schema.Type<typeof TopicSummaryResponse> {}

export const TopicListResponse = Schema.Struct({
  topics: Schema.Array(TopicSummaryResponse),
}).annotate({ identifier: "TopicListResponse" });
export interface TopicListResponse extends Schema.Schema.Type<typeof TopicListResponse> {}

export const TopicResponse = Schema.Struct({
  ...TopicResponseFields,
  contributions: Schema.Array(TopicContributionResponse),
}).annotate({ identifier: "TopicResponse" });
export interface TopicResponse extends Schema.Schema.Type<typeof TopicResponse> {}
