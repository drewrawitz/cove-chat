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

const ChannelTopicsArguments = z.object({
  workspaceId: z.string().min(1),
  channelId: z.string().min(1),
});

const TopicArguments = ChannelTopicsArguments.extend({
  topicId: z.string().min(1),
});

const authorizedTopics = (args: z.output<typeof ChannelTopicsArguments>, context: QueryContext) =>
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
      withMessages(authorizedTopics(args, ctx)).orderBy("createdAt", "desc"),
    ),
    byId: defineQuery(TopicArguments, ({ args, ctx }) =>
      withMessages(authorizedTopics(args, ctx).where("id", args.topicId)).one(),
    ),
  },
});
