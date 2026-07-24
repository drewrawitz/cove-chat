import { defineQueriesWithType, defineQueryWithType } from "@rocicorp/zero";
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

const ChannelTopicLiveLimit = z.union([
  z.literal(50),
  z.literal(100),
  z.literal(150),
  z.literal(200),
  z.literal(250),
  z.literal(300),
  z.literal(350),
  z.literal(400),
  z.literal(450),
  z.literal(500),
]);
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

const authorizedTopics = (args: z.output<typeof ChannelScopeArguments>, context: QueryContext) =>
  zql.topic
    .where("workspaceId", args.workspaceId)
    .where("channelId", args.channelId)
    .whereExists("channel", (channel) =>
      channel.where((expression) =>
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
        ),
      ),
    );

const withMessages = (query: ReturnType<typeof authorizedTopics>) =>
  query.related("messages", (message) => message.orderBy("position", "asc").related("author"));

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
      withMessages(authorizedTopics(args, ctx).where("id", args.topicId)).one(),
    ),
  },
});
