import { defineQueriesWithType, defineQueryWithType, type ExpressionFactory } from "@rocicorp/zero";
import { z } from "zod";
import { type Schema, zql } from "./generated/schema.ts";

export interface QueryContext {
  readonly userID: string;
}

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: QueryContext;
  }
}

const defineQuery = defineQueryWithType<Schema, QueryContext>();
const defineQueries = defineQueriesWithType<Schema>();

export const CHANNEL_TOPIC_LIVE_INITIAL = 50;
export const CHANNEL_TOPIC_LIVE_INCREMENT = 50;
export const CHANNEL_TOPIC_LIVE_MAXIMUM = 500;
export const TOPIC_REPLY_PAGE_SIZE = 100;

type ChannelTopicLiveLimitValue = 50 | 100 | 150 | 200 | 250 | 300 | 350 | 400 | 450 | 500;

const channelTopicLiveLimits = Array.from(
  {
    length:
      (CHANNEL_TOPIC_LIVE_MAXIMUM - CHANNEL_TOPIC_LIVE_INITIAL) / CHANNEL_TOPIC_LIVE_INCREMENT + 1,
  },
  (_, index) => CHANNEL_TOPIC_LIVE_INITIAL + index * CHANNEL_TOPIC_LIVE_INCREMENT,
) as Array<ChannelTopicLiveLimitValue>;
const ChannelTopicLiveLimit = z.literal(channelTopicLiveLimits);
export type ChannelTopicLiveLimit = z.output<typeof ChannelTopicLiveLimit>;

const ChannelScopeArguments = z.object({
  workspaceId: z.string().min(1),
  channelId: z.string().min(1),
});

const ChannelTopicsArguments = ChannelScopeArguments.extend({
  limit: ChannelTopicLiveLimit,
});

const TopicArguments = ChannelScopeArguments.extend({
  topicId: z.string().min(1),
});

const TopicReplyPageArguments = TopicArguments.extend({
  beforePosition: z.number().int().min(2).optional(),
});

const channelIsAuthorizedFor =
  (context: QueryContext): ExpressionFactory<"channel", Schema> =>
  (expression) =>
    expression.or(
      expression.and(
        expression.cmp("visibility", "public"),
        expression.exists("workspace", (workspace) =>
          workspace.whereExists("identities", (identity) =>
            identity
              .where("accountId", context.userID)
              .where("membershipEndedAt", "IS", null)
              .where("role", "!=", "guest"),
          ),
        ),
      ),
      expression.exists("memberships", (membership) =>
        membership.whereExists("workspaceIdentity", (identity) =>
          identity.where("accountId", context.userID).where("membershipEndedAt", "IS", null),
        ),
      ),
    );

const authorizedTopics = (args: z.output<typeof ChannelScopeArguments>, context: QueryContext) =>
  zql.topic
    .where("workspaceId", args.workspaceId)
    .where("channelId", args.channelId)
    .whereExists("channel", (channel) => channel.where(channelIsAuthorizedFor(context)));

const authorizedMessages = (args: z.output<typeof TopicArguments>, context: QueryContext) =>
  zql.message
    .where("workspaceId", args.workspaceId)
    .where("topicId", args.topicId)
    .whereExists("topic", (topic) =>
      topic
        .where("workspaceId", args.workspaceId)
        .where("channelId", args.channelId)
        .where("id", args.topicId)
        .whereExists("channel", (channel) => channel.where(channelIsAuthorizedFor(context))),
    );

export const queries = defineQueries({
  topics: {
    inChannel: defineQuery(ChannelTopicsArguments, ({ args, ctx }) =>
      authorizedTopics(args, ctx)
        .orderBy("lastActivityAt", "desc")
        .orderBy("id", "asc")
        .limit(args.limit)
        .related("latestMessageAuthor"),
    ),
    byId: defineQuery(TopicArguments, ({ args, ctx }) =>
      authorizedTopics(args, ctx).where("id", args.topicId).one(),
    ),
  },
  messages: {
    openingBrief: defineQuery(TopicArguments, ({ args, ctx }) =>
      authorizedMessages(args, ctx).where("position", 1).related("author").one(),
    ),
    replies: defineQuery(TopicReplyPageArguments, ({ args, ctx }) => {
      const replies = authorizedMessages(args, ctx).where("position", ">", 1);
      const page =
        args.beforePosition === undefined
          ? replies
          : replies.where("position", "<", args.beforePosition);
      return page.orderBy("position", "desc").limit(TOPIC_REPLY_PAGE_SIZE).related("author");
    }),
  },
});
