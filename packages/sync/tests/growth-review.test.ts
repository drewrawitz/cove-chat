import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import { CHANNEL_TOPIC_LIVE_MAXIMUM, queries, schema } from "../src/index.ts";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const reviewSurfaceError = (surface: string) =>
  new Error(
    `The Zero ${surface} surface changed; update the synchronized growth and privacy review gate.`,
  );

const readQueryAst = (value: unknown, surface: string): QueryAst => {
  if (!isRecord(value) || typeof value.table !== "string") {
    throw reviewSurfaceError(surface);
  }
  if (value.alias !== undefined && typeof value.alias !== "string") {
    throw reviewSurfaceError(`${surface}.alias`);
  }
  if (value.limit !== undefined && typeof value.limit !== "number") {
    throw reviewSurfaceError(`${surface}.limit`);
  }

  const orderBy = value.orderBy;
  if (
    orderBy !== undefined &&
    (!Array.isArray(orderBy) ||
      orderBy.some(
        (entry) =>
          !Array.isArray(entry) ||
          entry.length !== 2 ||
          typeof entry[0] !== "string" ||
          (entry[1] !== "asc" && entry[1] !== "desc"),
      ))
  ) {
    throw reviewSurfaceError(`${surface}.orderBy`);
  }

  const related = value.related;
  if (related !== undefined && !Array.isArray(related)) {
    throw reviewSurfaceError(`${surface}.related`);
  }

  return {
    alias: value.alias,
    table: value.table,
    limit: value.limit,
    orderBy: orderBy?.map(([column, direction]) => [column, direction]),
    related: related?.map((relation, index) => {
      if (!isRecord(relation) || !("subquery" in relation)) {
        throw reviewSurfaceError(`${surface}.related[${index}]`);
      }
      return {
        subquery: readQueryAst(relation.subquery, `${surface}.related[${index}].subquery`),
      };
    }),
  };
};

const queryAst = (query: unknown): QueryAst => {
  if (!isRecord(query) || !("ast" in query)) {
    throw reviewSurfaceError("query.ast");
  }
  return readQueryAst(query.ast, "query.ast");
};

interface Relationship {
  readonly cardinality: "many" | "one";
  readonly destSchema: string;
}

const relationships = (() => {
  const value: unknown = schema.relationships;
  if (!isRecord(value)) throw reviewSurfaceError("schema.relationships");
  return value;
})();

const readRelationship = (table: string, alias: string): Relationship => {
  const tableRelationships = relationships[table];
  if (!isRecord(tableRelationships)) {
    throw reviewSurfaceError(`schema.relationships.${table}`);
  }
  const candidates = tableRelationships[alias];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw reviewSurfaceError(`schema.relationships.${table}.${alias}`);
  }
  const relationship: unknown = candidates[0];
  if (
    !isRecord(relationship) ||
    (relationship.cardinality !== "many" && relationship.cardinality !== "one") ||
    typeof relationship.destSchema !== "string"
  ) {
    throw reviewSurfaceError(`schema.relationships.${table}.${alias}[0]`);
  }
  return {
    cardinality: relationship.cardinality,
    destSchema: relationship.destSchema,
  };
};

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
    const relationship = readRelationship(ast.table, alias);
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
  it("explains when Zero no longer exposes the reviewed query surface", () => {
    expect(() => queryAst({})).toThrowError(
      "The Zero query.ast surface changed; update the synchronized growth and privacy review gate.",
    );
  });

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
        limit: 100,
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
