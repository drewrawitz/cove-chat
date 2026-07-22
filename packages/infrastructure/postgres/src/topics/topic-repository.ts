import {
  ChannelId,
  Contribution,
  ContributionBody,
  ContributionId,
  ContributionPosition,
  Topic,
  TopicId,
  TopicIntent,
  TopicTitle,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
  type Contribution as ContributionType,
  type Topic as TopicType,
} from "@cove/domain";
import {
  TopicContributionRecord,
  TopicRecord,
  TopicRepository,
  TopicSummaryRecord,
} from "@cove/ports";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { persistenceError } from "../persistence-error.ts";

const TopicRow = Schema.Struct({
  id: TopicId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  title: TopicTitle,
  intent: Schema.NullOr(TopicIntent),
  openedByIdentityId: WorkspaceIdentityId,
  createdAt: Schema.Date,
});
interface TopicRow extends Schema.Schema.Type<typeof TopicRow> {}

const TopicRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  topicId: TopicId,
});
interface TopicRequest extends Schema.Schema.Type<typeof TopicRequest> {}

const TopicSummaryRow = Schema.Struct({
  ...TopicRow.fields,
  contributionId: ContributionId,
  contributionBody: Schema.NullOr(ContributionBody),
  contributionPosition: ContributionPosition,
  contributionCreatedAt: Schema.Date,
  contributionEditedAt: Schema.NullOr(Schema.Date),
  contributionDeletedAt: Schema.NullOr(Schema.Date),
  authorIdentityId: WorkspaceIdentityId,
  authorName: WorkspaceIdentityName,
  authorAvatarUrl: WorkspaceAvatarUrl,
  contributionCount: Schema.Int.check(Schema.isGreaterThan(0)),
});
interface TopicSummaryRow extends Schema.Schema.Type<typeof TopicSummaryRow> {}

const ContributionRow = Schema.Struct({
  id: ContributionId,
  workspaceId: WorkspaceId,
  topicId: TopicId,
  authorIdentityId: WorkspaceIdentityId,
  body: Schema.NullOr(ContributionBody),
  position: ContributionPosition,
  createdAt: Schema.Date,
  editedAt: Schema.NullOr(Schema.Date),
  deletedAt: Schema.NullOr(Schema.Date),
  authorName: WorkspaceIdentityName,
  authorAvatarUrl: WorkspaceAvatarUrl,
});
interface ContributionRow extends Schema.Schema.Type<typeof ContributionRow> {}

const StoredContributionRow = Schema.Struct({
  id: ContributionId,
  workspaceId: WorkspaceId,
  topicId: TopicId,
  authorIdentityId: WorkspaceIdentityId,
  body: Schema.NullOr(ContributionBody),
  position: ContributionPosition,
  createdAt: Schema.Date,
  editedAt: Schema.NullOr(Schema.Date),
  deletedAt: Schema.NullOr(Schema.Date),
});
interface StoredContributionRow extends Schema.Schema.Type<typeof StoredContributionRow> {}

const ContributionRevisionOperation = Schema.Literals(["edit", "delete"]);

const ReviseContributionRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  topicId: TopicId,
  contributionId: ContributionId,
  body: Schema.NullOr(ContributionBody),
  operation: ContributionRevisionOperation,
  revisedAt: Schema.Date,
});

function topic(row: TopicRow): TopicType {
  const fields = {
    id: row.id,
    workspaceId: row.workspaceId,
    channelId: row.channelId,
    title: row.title,
    openedByIdentityId: row.openedByIdentityId,
    createdAt: row.createdAt,
  };
  return row.intent === null ? Topic.make(fields) : Topic.make({ ...fields, intent: row.intent });
}

function contribution(row: StoredContributionRow): ContributionType {
  return Contribution.make({
    id: row.id,
    workspaceId: row.workspaceId,
    topicId: row.topicId,
    authorIdentityId: row.authorIdentityId,
    ...(row.body === null ? {} : { body: row.body }),
    position: row.position,
    createdAt: row.createdAt,
    ...(row.editedAt === null ? {} : { editedAt: row.editedAt }),
    ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt }),
  });
}

function contributionRecord(row: ContributionRow): TopicContributionRecord {
  return TopicContributionRecord.make({
    contribution: contribution(row),
    author: {
      id: row.authorIdentityId,
      name: row.authorName,
      avatarUrl: row.authorAvatarUrl,
    },
  });
}

function summaryRecord(row: TopicSummaryRow): TopicSummaryRecord {
  return TopicSummaryRecord.make({
    topic: topic(row),
    openingBrief: contributionRecord({
      id: row.contributionId,
      workspaceId: row.workspaceId,
      topicId: row.id,
      authorIdentityId: row.authorIdentityId,
      body: row.contributionBody,
      position: row.contributionPosition,
      createdAt: row.contributionCreatedAt,
      editedAt: row.contributionEditedAt,
      deletedAt: row.contributionDeletedAt,
      authorName: row.authorName,
      authorAvatarUrl: row.authorAvatarUrl,
    }),
    contributionCount: row.contributionCount,
  });
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const listSummaryRows = SqlSchema.findAll({
    Request: Schema.Struct({ workspaceId: WorkspaceId, channelId: ChannelId }),
    Result: TopicSummaryRow,
    execute: ({ workspaceId, channelId }) => sql<TopicSummaryRow>`
      SELECT
        topic.id,
        topic.workspace_id AS "workspaceId",
        topic.channel_id AS "channelId",
        topic.title,
        topic.intent,
        topic.opened_by_identity_id AS "openedByIdentityId",
        topic.created_at AS "createdAt",
        opening.id AS "contributionId",
        opening.body AS "contributionBody",
        opening.position AS "contributionPosition",
        opening.created_at AS "contributionCreatedAt",
        opening.edited_at AS "contributionEditedAt",
        opening.deleted_at AS "contributionDeletedAt",
        opening.author_identity_id AS "authorIdentityId",
        author.name AS "authorName",
        author.avatar_url AS "authorAvatarUrl",
        count(contribution.id)::integer AS "contributionCount"
      FROM topics AS topic
      INNER JOIN contributions AS opening
        ON opening.workspace_id = topic.workspace_id
        AND opening.topic_id = topic.id
        AND opening.position = 1
      INNER JOIN workspace_identities AS author
        ON author.workspace_id = opening.workspace_id
        AND author.id = opening.author_identity_id
      INNER JOIN contributions AS contribution
        ON contribution.workspace_id = topic.workspace_id
        AND contribution.topic_id = topic.id
      WHERE topic.workspace_id = ${workspaceId}
        AND topic.channel_id = ${channelId}
      GROUP BY topic.workspace_id, topic.id, opening.workspace_id, opening.topic_id, opening.id,
        author.workspace_id, author.id
      ORDER BY topic.created_at DESC, topic.id
    `,
  });

  const findTopicRow = SqlSchema.findOneOption({
    Request: TopicRequest,
    Result: TopicRow,
    execute: ({ workspaceId, channelId, topicId }) => sql<TopicRow>`
      SELECT
        id,
        workspace_id AS "workspaceId",
        channel_id AS "channelId",
        title,
        intent,
        opened_by_identity_id AS "openedByIdentityId",
        created_at AS "createdAt"
      FROM topics
      WHERE workspace_id = ${workspaceId}
        AND channel_id = ${channelId}
        AND id = ${topicId}
      LIMIT 1
    `,
  });

  const listContributionRows = SqlSchema.findAll({
    Request: Schema.Struct({ workspaceId: WorkspaceId, topicId: TopicId }),
    Result: ContributionRow,
    execute: ({ workspaceId, topicId }) => sql<ContributionRow>`
      SELECT
        contribution.id,
        contribution.workspace_id AS "workspaceId",
        contribution.topic_id AS "topicId",
        contribution.author_identity_id AS "authorIdentityId",
        contribution.body,
        contribution.position,
        contribution.created_at AS "createdAt",
        contribution.edited_at AS "editedAt",
        contribution.deleted_at AS "deletedAt",
        author.name AS "authorName",
        author.avatar_url AS "authorAvatarUrl"
      FROM contributions AS contribution
      INNER JOIN workspace_identities AS author
        ON author.workspace_id = contribution.workspace_id
        AND author.id = contribution.author_identity_id
      WHERE contribution.workspace_id = ${workspaceId}
        AND contribution.topic_id = ${topicId}
      ORDER BY contribution.position, contribution.id
    `,
  });

  const insertTopic = SqlSchema.findOne({
    Request: Topic,
    Result: TopicRow,
    execute: (value) => sql<TopicRow>`
      INSERT INTO topics (
        id, workspace_id, channel_id, title, intent, opened_by_identity_id, created_at
      )
      VALUES (
        ${value.id}, ${value.workspaceId}, ${value.channelId}, ${value.title},
        ${value.intent ?? null}, ${value.openedByIdentityId}, ${value.createdAt}
      )
      RETURNING
        id,
        workspace_id AS "workspaceId",
        channel_id AS "channelId",
        title,
        intent,
        opened_by_identity_id AS "openedByIdentityId",
        created_at AS "createdAt"
    `,
  });

  const insertContribution = SqlSchema.findOne({
    Request: Contribution,
    Result: Contribution,
    execute: (value) => sql<ContributionType>`
      INSERT INTO contributions (
        id, workspace_id, topic_id, author_identity_id, body, position, created_at
      )
      VALUES (
        ${value.id}, ${value.workspaceId}, ${value.topicId}, ${value.authorIdentityId},
        ${value.body}, ${value.position}, ${value.createdAt}
      )
      RETURNING
        id,
        workspace_id AS "workspaceId",
        topic_id AS "topicId",
        author_identity_id AS "authorIdentityId",
        body,
        position,
        created_at AS "createdAt"
    `,
  });

  const appendContribution = SqlSchema.findOne({
    Request: Schema.Struct({
      id: ContributionId,
      workspaceId: WorkspaceId,
      topicId: TopicId,
      authorIdentityId: WorkspaceIdentityId,
      body: ContributionBody,
      createdAt: Schema.Date,
    }),
    Result: StoredContributionRow,
    execute: (value) => sql<StoredContributionRow>`
      WITH locked_topic AS (
        SELECT id
        FROM topics
        WHERE workspace_id = ${value.workspaceId}
          AND id = ${value.topicId}
        FOR UPDATE
      ), next_position AS (
        SELECT coalesce(max(contribution.position), 0)::integer + 1 AS position
        FROM locked_topic
        LEFT JOIN contributions AS contribution
          ON contribution.workspace_id = ${value.workspaceId}
          AND contribution.topic_id = locked_topic.id
        GROUP BY locked_topic.id
      )
      INSERT INTO contributions (
        id, workspace_id, topic_id, author_identity_id, body, position, created_at
      )
      SELECT
        ${value.id}, ${value.workspaceId}, ${value.topicId}, ${value.authorIdentityId},
        ${value.body}, next_position.position, ${value.createdAt}
      FROM next_position
      RETURNING
        id,
        workspace_id AS "workspaceId",
        topic_id AS "topicId",
        author_identity_id AS "authorIdentityId",
        body,
        position,
        created_at AS "createdAt",
        edited_at AS "editedAt",
        deleted_at AS "deletedAt"
    `,
  });

  const reviseContribution = SqlSchema.findOne({
    Request: ReviseContributionRequest,
    Result: StoredContributionRow,
    execute: (value) => sql<StoredContributionRow>`
      WITH previous AS (
        SELECT workspace_id, topic_id, id, body
        FROM contributions
        WHERE workspace_id = ${value.workspaceId}
          AND topic_id = ${value.topicId}
          AND id = ${value.contributionId}
          AND deleted_at IS NULL
        FOR UPDATE
      ), revision AS (
        INSERT INTO contribution_revisions (
          workspace_id, topic_id, contribution_id, body, operation, revised_at
        )
        SELECT
          workspace_id,
          topic_id,
          id,
          body,
          CAST(${value.operation} AS "ContributionRevisionOperation"),
          ${value.revisedAt}
        FROM previous
        RETURNING id
      )
      UPDATE contributions AS contribution
      SET
        body = ${value.body},
        edited_at = CASE
          WHEN ${value.operation} = 'edit' THEN ${value.revisedAt}
          ELSE contribution.edited_at
        END,
        deleted_at = CASE
          WHEN ${value.operation} = 'delete' THEN ${value.revisedAt}
          ELSE contribution.deleted_at
        END
      FROM previous, revision
      WHERE contribution.workspace_id = previous.workspace_id
        AND contribution.topic_id = previous.topic_id
        AND contribution.id = previous.id
      RETURNING
        contribution.id,
        contribution.workspace_id AS "workspaceId",
        contribution.topic_id AS "topicId",
        contribution.author_identity_id AS "authorIdentityId",
        contribution.body,
        contribution.position,
        contribution.created_at AS "createdAt",
        contribution.edited_at AS "editedAt",
        contribution.deleted_at AS "deletedAt"
    `,
  });

  const mapFailure = <A, E, R>(operation: string, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.mapError((cause) => persistenceError(operation, cause)));

  return TopicRepository.of({
    listSummariesInChannel: Effect.fn("PostgresTopicRepository.listSummariesInChannel")(
      (workspaceId, channelId) =>
        listSummaryRows({ workspaceId, channelId }).pipe(
          Effect.map((rows) => rows.map(summaryRecord)),
        ),
      (effect) => mapFailure("TopicRepository.listSummariesInChannel", effect),
    ),
    findById: Effect.fn("PostgresTopicRepository.findById")(
      (workspaceId, channelId, topicId) =>
        Effect.gen(function* () {
          const row = yield* findTopicRow({ workspaceId, channelId, topicId });
          if (Option.isNone(row)) return undefined;
          const contributions = yield* listContributionRows({ workspaceId, topicId });
          return TopicRecord.make({
            topic: topic(row.value),
            contributions: contributions.map(contributionRecord),
          });
        }),
      (effect) => mapFailure("TopicRepository.findById", effect),
    ),
    insertTopic: Effect.fn("PostgresTopicRepository.insertTopic")(
      (value) => insertTopic(value).pipe(Effect.asVoid),
      (effect) => mapFailure("TopicRepository.insertTopic", effect),
    ),
    insertContribution: Effect.fn("PostgresTopicRepository.insertContribution")(
      (value) => insertContribution(value).pipe(Effect.asVoid),
      (effect) => mapFailure("TopicRepository.insertContribution", effect),
    ),
    appendContribution: Effect.fn("PostgresTopicRepository.appendContribution")(
      (value) => appendContribution(value).pipe(Effect.map(contribution)),
      (effect) => mapFailure("TopicRepository.appendContribution", effect),
    ),
    editContribution: Effect.fn("PostgresTopicRepository.editContribution")(
      (value) =>
        reviseContribution({
          workspaceId: value.workspaceId,
          topicId: value.topicId,
          contributionId: value.contributionId,
          body: value.body,
          operation: "edit",
          revisedAt: value.editedAt,
        }).pipe(Effect.map(contribution)),
      (effect) => mapFailure("TopicRepository.editContribution", effect),
    ),
    tombstoneContribution: Effect.fn("PostgresTopicRepository.tombstoneContribution")(
      (value) =>
        reviseContribution({
          workspaceId: value.workspaceId,
          topicId: value.topicId,
          contributionId: value.contributionId,
          body: null,
          operation: "delete",
          revisedAt: value.deletedAt,
        }).pipe(Effect.map(contribution)),
      (effect) => mapFailure("TopicRepository.tombstoneContribution", effect),
    ),
  });
});

export const PostgresTopicRepository = Layer.effect(TopicRepository, make);
