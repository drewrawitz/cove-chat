import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import {
  CHANNEL_TOPIC_LIVE_MAXIMUM,
  queries,
  schema,
  TOPIC_REPLY_PAGE_SIZE,
} from "../src/index.ts";

const channelArguments = {
  workspaceId: "review-workspace",
  channelId: "review-channel",
} as const;
const topicArguments = {
  ...channelArguments,
  topicId: "review-topic",
} as const;
const context = { userID: "review-account" };

interface QueryAst {
  readonly alias?: string;
  readonly table: string;
  readonly limit?: number;
  readonly orderBy?: ReadonlyArray<readonly [string, "asc" | "desc"]>;
  readonly related?: ReadonlyArray<{
    readonly subquery: QueryAst;
  }>;
}

const queryAst = (query: unknown): QueryAst => (query as { readonly ast: QueryAst }).ast;

interface Relationship {
  readonly cardinality: "many" | "one";
  readonly destSchema: string;
}

const relationships = schema.relationships as Record<
  string,
  Record<string, ReadonlyArray<Relationship>>
>;

interface QueryShape {
  readonly table: string;
  readonly limit?: number;
  readonly orderBy: ReadonlyArray<readonly [string, "asc" | "desc"]>;
  readonly related: ReadonlyArray<
    QueryShape & {
      readonly alias: string;
      readonly cardinality: "many" | "one";
    }
  >;
}

const queryShape = (ast: QueryAst): QueryShape => {
  const related = (ast.related ?? []).map(({ subquery }) => {
    const alias = subquery.alias ?? subquery.table;
    const relationship = relationships[ast.table]?.[alias]?.[0];
    if (relationship === undefined) {
      throw new Error(`No schema relationship defines ${ast.table}.${alias}.`);
    }
    if (relationship.destSchema !== subquery.table) {
      throw new Error(`Synchronized relation ${ast.table}.${alias} targets an unexpected table.`);
    }
    if (relationship.cardinality === "many" && subquery.limit === undefined) {
      throw new Error(`Synchronized relation ${ast.table}.${alias} is unbounded.`);
    }
    const nestedShape = queryShape(subquery);
    return {
      alias,
      cardinality: relationship.cardinality,
      ...nestedShape,
    };
  });
  return {
    table: ast.table,
    limit: ast.limit,
    orderBy: ast.orderBy ?? [],
    related,
  };
};

describe("synchronized growth and privacy review", () => {
  it("rejects an unbounded relation nested below a bounded to-one relation", () => {
    expect(() =>
      queryShape({
        table: "topic",
        related: [
          {
            subquery: {
              alias: "latestMessageAuthor",
              table: "workspaceIdentity",
              related: [{ subquery: { alias: "messages", table: "message" } }],
            },
          },
        ],
      }),
    ).toThrowError("Synchronized relation workspaceIdentity.messages is unbounded.");
  });

  it("keeps every reviewed table, column, named query, relation, and result bound explicit", () => {
    const synchronizedColumns = Object.fromEntries(
      Object.entries(schema.tables).map(([tableName, table]) => [
        tableName,
        Object.keys(table.columns),
      ]),
    );
    expect(synchronizedColumns).toEqual({
      workspace: ["id", "name", "createdAt"],
      workspaceIdentity: [
        "id",
        "workspaceId",
        "accountId",
        "name",
        "avatarUrl",
        "role",
        "membershipStartedAt",
        "membershipEndedAt",
        "createdAt",
      ],
      channel: [
        "id",
        "workspaceId",
        "name",
        "purpose",
        "visibility",
        "maintainerIdentityId",
        "createdAt",
      ],
      channelMembership: ["workspaceId", "channelId", "identityId", "createdAt"],
      topic: [
        "id",
        "workspaceId",
        "channelId",
        "title",
        "intent",
        "openedByIdentityId",
        "messageCount",
        "latestMessageId",
        "latestMessagePreview",
        "latestMessageAuthorIdentityId",
        "latestMessagePosition",
        "latestMessageCreatedAt",
        "latestMessageEditedAt",
        "latestMessageDeletedAt",
        "lastActivityAt",
        "createdAt",
      ],
      message: [
        "id",
        "workspaceId",
        "topicId",
        "authorIdentityId",
        "body",
        "position",
        "version",
        "producedByCommandId",
        "createdAt",
        "editedAt",
        "deletedAt",
      ],
    });

    const namedQueries = Object.entries(queries)
      .filter(([namespace]) => namespace !== "~")
      .flatMap(([namespace, group]) =>
        Object.keys(group)
          .filter((name) => name !== "~")
          .map((name) => `${namespace}.${name}`),
      );
    expect(namedQueries).toEqual([
      "access.channelMembership",
      "topics.inChannel",
      "topics.byId",
      "messages.openingBrief",
      "messages.replies",
    ]);

    expect({
      "access.channelMembership": queryShape(
        queryAst(queries.access.channelMembership.fn({ args: channelArguments, ctx: context })),
      ),
      "topics.inChannel": queryShape(
        queryAst(
          queries.topics.inChannel.fn({
            args: { ...channelArguments, limit: CHANNEL_TOPIC_LIVE_MAXIMUM },
            ctx: context,
          }),
        ),
      ),
      "topics.byId": queryShape(
        queryAst(queries.topics.byId.fn({ args: topicArguments, ctx: context })),
      ),
      "messages.openingBrief": queryShape(
        queryAst(queries.messages.openingBrief.fn({ args: topicArguments, ctx: context })),
      ),
      "messages.replies": queryShape(
        queryAst(queries.messages.replies.fn({ args: topicArguments, ctx: context })),
      ),
    }).toEqual({
      "access.channelMembership": {
        table: "channelMembership",
        limit: 1,
        orderBy: [],
        related: [],
      },
      "topics.inChannel": {
        table: "topic",
        limit: 500,
        orderBy: [
          ["lastActivityAt", "desc"],
          ["id", "asc"],
        ],
        related: [
          {
            alias: "latestMessageAuthor",
            table: "workspaceIdentity",
            cardinality: "one",
            limit: undefined,
            orderBy: [],
            related: [],
          },
        ],
      },
      "topics.byId": {
        table: "topic",
        limit: 1,
        orderBy: [],
        related: [],
      },
      "messages.openingBrief": {
        table: "message",
        limit: 1,
        orderBy: [],
        related: [
          {
            alias: "author",
            table: "workspaceIdentity",
            cardinality: "one",
            limit: undefined,
            orderBy: [],
            related: [],
          },
        ],
      },
      "messages.replies": {
        table: "message",
        limit: TOPIC_REPLY_PAGE_SIZE,
        orderBy: [["position", "desc"]],
        related: [
          {
            alias: "author",
            table: "workspaceIdentity",
            cardinality: "one",
            limit: undefined,
            orderBy: [],
            related: [],
          },
        ],
      },
    });
  });

  it("documents the required human review when the synchronized contract expands", async () => {
    const checklist = await readFile(
      new URL("../GROWTH-PRIVACY-REVIEW.md", import.meta.url),
      "utf8",
    );

    expect(checklist).toContain("Every named query has an explicit maximum row count");
    expect(checklist).toContain(
      "Every related shape is bounded by cardinality or an explicit limit",
    );
    expect(checklist).toContain(
      "Every synchronized table and column has a participant-visible need",
    );
    expect(checklist).toContain("content-free and low-cardinality");
  });
});
