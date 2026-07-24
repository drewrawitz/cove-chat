import {
  ChannelId,
  Message,
  MessageBody,
  MessageId,
  MessagePosition,
  Topic,
  TopicId,
  TopicIntent,
  TopicSummaryPreview,
  TopicTitle,
  UserId,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
  type Message as MessageType,
  type Topic as TopicType,
  makeTopicSummaryPreview,
} from "@cove/domain";
import {
  StoredMessage,
  TopicMessageRecord,
  TopicRecord,
  TopicRepository,
  TopicSummaryRecord,
} from "@cove/ports";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { persistenceError } from "../persistence-error.ts";

const TopicRow = Schema.Struct({
  id: TopicId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  title: TopicTitle,
  intent: Schema.NullOr(TopicIntent),
  openedByIdentityId: WorkspaceIdentityId,
  messageCount: Schema.Int.check(Schema.isGreaterThan(0)),
  latestMessageId: MessageId,
  latestMessagePreview: Schema.NullOr(TopicSummaryPreview),
  lastActivityAt: Schema.Date,
  createdAt: Schema.Date,
});
interface TopicRow extends Schema.Schema.Type<typeof TopicRow> {}

const TopicRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  topicId: TopicId,
});
interface TopicRequest extends Schema.Schema.Type<typeof TopicRequest> {}

const ArchiveCursorInsert = Schema.Struct({
  cursor: Schema.String,
  snapshotId: Schema.String,
  pageOffset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  snapshotAt: Schema.Date,
  snapshotLastActivityAt: Schema.Date,
  snapshotTopicId: TopicId,
  afterLastActivityAt: Schema.Date,
  afterTopicId: TopicId,
});

const ArchiveNextCursorInsert = Schema.Struct({
  ...ArchiveCursorInsert.fields,
  expiresAt: Schema.Date,
});

const ArchiveCursorRequest = Schema.Struct({
  cursor: Schema.String,
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
});

const ArchiveCursorPosition = Schema.Struct({
  snapshotId: Schema.String,
  pageOffset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  snapshotAt: Schema.Date,
  snapshotLastActivityAt: Schema.Date,
  snapshotTopicId: TopicId,
  afterLastActivityAt: Schema.Date,
  afterTopicId: TopicId,
  expiresAt: Schema.Date,
});
interface ArchiveCursorPosition extends Schema.Schema.Type<typeof ArchiveCursorPosition> {}

const ArchivePageRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  snapshotAt: Schema.Date,
  snapshotLastActivityAt: Schema.Date,
  snapshotTopicId: TopicId,
  hasAfter: Schema.Boolean,
  afterLastActivityAt: Schema.Date,
  afterTopicId: TopicId,
});

const ArchiveNextCursor = Schema.Struct({ cursor: Schema.String });
const ArchiveCleanupResult = Schema.Struct({ deletedCount: Schema.Int });
const ArchiveSnapshotLock = Schema.Struct({ locked: Schema.Boolean });

const TopicSummaryRow = Schema.Struct({
  ...TopicRow.fields,
  archiveLastActivityAt: Schema.Date,
  messageId: MessageId,
  messagePosition: MessagePosition,
  messageCreatedAt: Schema.Date,
  messageEditedAt: Schema.NullOr(Schema.Date),
  messageDeletedAt: Schema.NullOr(Schema.Date),
  authorIdentityId: WorkspaceIdentityId,
  authorName: WorkspaceIdentityName,
  authorAvatarUrl: WorkspaceAvatarUrl,
});
interface TopicSummaryRow extends Schema.Schema.Type<typeof TopicSummaryRow> {}

const FirstTopicSummaryRow = Schema.Struct({
  ...TopicSummaryRow.fields,
  snapshotAt: Schema.Date,
  snapshotLastActivityAt: Schema.Date,
  snapshotTopicId: TopicId,
});
interface FirstTopicSummaryRow extends Schema.Schema.Type<typeof FirstTopicSummaryRow> {}

const MessageRow = Schema.Struct({
  id: MessageId,
  workspaceId: WorkspaceId,
  topicId: TopicId,
  authorIdentityId: WorkspaceIdentityId,
  body: Schema.NullOr(Schema.String),
  position: MessagePosition,
  createdAt: Schema.Date,
  editedAt: Schema.NullOr(Schema.Date),
  deletedAt: Schema.NullOr(Schema.Date),
  authorName: WorkspaceIdentityName,
  authorAvatarUrl: WorkspaceAvatarUrl,
});
interface MessageRow extends Schema.Schema.Type<typeof MessageRow> {}

const StoredMessageRow = Schema.Struct({
  id: MessageId,
  workspaceId: WorkspaceId,
  topicId: TopicId,
  authorIdentityId: WorkspaceIdentityId,
  body: Schema.NullOr(MessageBody),
  position: MessagePosition,
  createdAt: Schema.Date,
  editedAt: Schema.NullOr(Schema.Date),
  deletedAt: Schema.NullOr(Schema.Date),
});
interface StoredMessageRow extends Schema.Schema.Type<typeof StoredMessageRow> {}

const MessageRevisionOperation = Schema.Literals(["edit", "delete"]);

const ReviseMessageRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  topicId: TopicId,
  messageId: MessageId,
  body: Schema.NullOr(MessageBody),
  operation: MessageRevisionOperation,
  revisedAt: Schema.Date,
});

function topic(row: TopicRow): TopicType {
  const fields = {
    id: row.id,
    workspaceId: row.workspaceId,
    channelId: row.channelId,
    title: row.title,
    openedByIdentityId: row.openedByIdentityId,
    messageCount: row.messageCount,
    latestMessageId: row.latestMessageId,
    ...(row.latestMessagePreview === null
      ? {}
      : { latestMessagePreview: row.latestMessagePreview }),
    lastActivityAt: row.lastActivityAt,
    createdAt: row.createdAt,
  };
  return row.intent === null ? Topic.make(fields) : Topic.make({ ...fields, intent: row.intent });
}

function message(row: StoredMessageRow): MessageType {
  return Message.make({
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

function storedMessage(row: MessageRow): StoredMessage {
  return StoredMessage.make({
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

function messageRecord(row: MessageRow): TopicMessageRecord {
  return TopicMessageRecord.make({
    message: storedMessage(row),
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
    latestMessage: messageRecord({
      id: row.messageId,
      workspaceId: row.workspaceId,
      topicId: row.id,
      authorIdentityId: row.authorIdentityId,
      body: null,
      position: row.messagePosition,
      createdAt: row.messageCreatedAt,
      editedAt: row.messageEditedAt,
      deletedAt: row.messageDeletedAt,
      authorName: row.authorName,
      authorAvatarUrl: row.authorAvatarUrl,
    }),
    messageCount: row.messageCount,
  });
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

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
        message_count AS "messageCount",
        latest_message_id AS "latestMessageId",
        latest_message_preview AS "latestMessagePreview",
        last_activity_at AS "lastActivityAt",
        created_at AS "createdAt"
      FROM topics
      WHERE workspace_id = ${workspaceId}
        AND channel_id = ${channelId}
        AND id = ${topicId}
      LIMIT 1
    `,
  });

  const deleteExpiredArchiveCursors = SqlSchema.findOne({
    Request: Schema.Struct({}),
    Result: ArchiveCleanupResult,
    execute: () => sql<{ readonly deletedCount: number }>`
      WITH expired AS (
        SELECT id
        FROM topic_archive_cursors
        WHERE expires_at <= CURRENT_TIMESTAMP
        ORDER BY expires_at, id
        LIMIT 100
      ), deleted AS (
        DELETE FROM topic_archive_cursors AS cursor
        USING expired
        WHERE cursor.id = expired.id
        RETURNING cursor.id
      )
      SELECT count(*)::integer AS "deletedCount"
      FROM deleted
    `,
  });

  const deleteStaleActivityVersions = SqlSchema.findOne({
    Request: Schema.Struct({}),
    Result: ArchiveCleanupResult,
    execute: () => sql<{ readonly deletedCount: number }>`
      WITH stale_versions AS (
        SELECT version.id
        FROM topic_activity_versions AS version
        WHERE version.valid_to IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM topic_archive_cursors AS cursor
            WHERE cursor.workspace_id = version.workspace_id
              AND cursor.channel_id = version.channel_id
              AND cursor.expires_at > CURRENT_TIMESTAMP
              AND cursor.snapshot_at >= version.valid_from
              AND cursor.snapshot_at < version.valid_to
          )
        ORDER BY version.valid_to, version.id
        LIMIT 100
      ), deleted AS (
        DELETE FROM topic_activity_versions AS version
        USING stale_versions
        WHERE version.id = stale_versions.id
        RETURNING version.id
      )
      SELECT count(*)::integer AS "deletedCount"
      FROM deleted
    `,
  });

  const lockArchiveSnapshot = SqlSchema.findOne({
    Request: Schema.Struct({
      workspaceId: WorkspaceId,
      channelId: ChannelId,
    }),
    Result: ArchiveSnapshotLock,
    execute: ({ workspaceId, channelId }) => sql<{ readonly locked: boolean }>`
      SELECT TRUE AS locked
      FROM (
        SELECT pg_advisory_xact_lock(
          hashtextextended(${workspaceId} || chr(31) || ${channelId}, 0)
        )
      ) AS snapshot_lock
    `,
  });

  const resolveArchiveCursor = SqlSchema.findOneOption({
    Request: ArchiveCursorRequest,
    Result: ArchiveCursorPosition,
    execute: ({ cursor, actorAccountId, workspaceId, channelId }) =>
      sql<ArchiveCursorPosition>`
      SELECT
        snapshot_id AS "snapshotId",
        page_offset AS "pageOffset",
        snapshot_at AS "snapshotAt",
        snapshot_last_activity_at AS "snapshotLastActivityAt",
        snapshot_topic_id AS "snapshotTopicId",
        after_last_activity_at AS "afterLastActivityAt",
        after_topic_id AS "afterTopicId",
        expires_at AS "expiresAt"
      FROM topic_archive_cursors
      WHERE id = ${cursor}
        AND account_id = ${actorAccountId}
        AND workspace_id = ${workspaceId}
        AND channel_id = ${channelId}
        AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `,
  });

  const listFirstArchiveRows = SqlSchema.findAll({
    Request: Schema.Struct({
      workspaceId: WorkspaceId,
      channelId: ChannelId,
    }),
    Result: FirstTopicSummaryRow,
    execute: ({ workspaceId, channelId }) => sql<FirstTopicSummaryRow>`
      WITH snapshot_clock AS MATERIALIZED (
        SELECT statement_timestamp() AS snapshot_at
      ), snapshot_boundary AS (
        SELECT
          activity.last_activity_at,
          activity.topic_id
        FROM topic_activity_versions AS activity
        CROSS JOIN snapshot_clock
        WHERE activity.workspace_id = ${workspaceId}
          AND activity.channel_id = ${channelId}
          AND activity.valid_from <= snapshot_clock.snapshot_at
          AND (
            activity.valid_to IS NULL
            OR activity.valid_to > snapshot_clock.snapshot_at
          )
        ORDER BY activity.last_activity_at DESC, activity.topic_id
        OFFSET 499
        LIMIT 1
      )
      SELECT
        topic.id,
        topic.workspace_id AS "workspaceId",
        topic.channel_id AS "channelId",
        topic.title,
        topic.intent,
        topic.opened_by_identity_id AS "openedByIdentityId",
        topic.message_count AS "messageCount",
        topic.latest_message_id AS "latestMessageId",
        topic.latest_message_preview AS "latestMessagePreview",
        topic.last_activity_at AS "lastActivityAt",
        activity.last_activity_at AS "archiveLastActivityAt",
        topic.created_at AS "createdAt",
        latest.id AS "messageId",
        latest.position AS "messagePosition",
        latest.created_at AS "messageCreatedAt",
        latest.edited_at AS "messageEditedAt",
        latest.deleted_at AS "messageDeletedAt",
        latest.author_identity_id AS "authorIdentityId",
        author.name AS "authorName",
        author.avatar_url AS "authorAvatarUrl",
        snapshot_clock.snapshot_at AS "snapshotAt",
        snapshot_boundary.last_activity_at AS "snapshotLastActivityAt",
        snapshot_boundary.topic_id AS "snapshotTopicId"
      FROM snapshot_clock
      CROSS JOIN snapshot_boundary
      INNER JOIN topic_activity_versions AS activity
        ON activity.workspace_id = ${workspaceId}
        AND activity.channel_id = ${channelId}
        AND activity.valid_from <= snapshot_clock.snapshot_at
        AND (
          activity.valid_to IS NULL
          OR activity.valid_to > snapshot_clock.snapshot_at
        )
        AND (
          activity.last_activity_at < snapshot_boundary.last_activity_at
          OR (
            activity.last_activity_at = snapshot_boundary.last_activity_at
            AND activity.topic_id > snapshot_boundary.topic_id
          )
        )
      INNER JOIN topics AS topic
        ON topic.workspace_id = activity.workspace_id
        AND topic.id = activity.topic_id
      INNER JOIN messages AS latest
        ON latest.workspace_id = topic.workspace_id
        AND latest.topic_id = topic.id
        AND latest.id = topic.latest_message_id
      INNER JOIN workspace_identities AS author
        ON author.workspace_id = latest.workspace_id
        AND author.id = latest.author_identity_id
      ORDER BY activity.last_activity_at DESC, activity.topic_id
      LIMIT 101
    `,
  });

  const listArchiveRows = SqlSchema.findAll({
    Request: ArchivePageRequest,
    Result: TopicSummaryRow,
    execute: (value) => sql<TopicSummaryRow>`
      SELECT
        topic.id,
        topic.workspace_id AS "workspaceId",
        topic.channel_id AS "channelId",
        topic.title,
        topic.intent,
        topic.opened_by_identity_id AS "openedByIdentityId",
        topic.message_count AS "messageCount",
        topic.latest_message_id AS "latestMessageId",
        topic.latest_message_preview AS "latestMessagePreview",
        topic.last_activity_at AS "lastActivityAt",
        activity.last_activity_at AS "archiveLastActivityAt",
        topic.created_at AS "createdAt",
        latest.id AS "messageId",
        latest.position AS "messagePosition",
        latest.created_at AS "messageCreatedAt",
        latest.edited_at AS "messageEditedAt",
        latest.deleted_at AS "messageDeletedAt",
        latest.author_identity_id AS "authorIdentityId",
        author.name AS "authorName",
        author.avatar_url AS "authorAvatarUrl"
      FROM topic_activity_versions AS activity
      INNER JOIN topics AS topic
        ON topic.workspace_id = activity.workspace_id
        AND topic.id = activity.topic_id
      INNER JOIN messages AS latest
        ON latest.workspace_id = topic.workspace_id
        AND latest.topic_id = topic.id
        AND latest.id = topic.latest_message_id
      INNER JOIN workspace_identities AS author
        ON author.workspace_id = latest.workspace_id
        AND author.id = latest.author_identity_id
      WHERE activity.workspace_id = ${value.workspaceId}
        AND activity.channel_id = ${value.channelId}
        AND activity.valid_from <= ${value.snapshotAt}
        AND (
          activity.valid_to IS NULL
          OR activity.valid_to > ${value.snapshotAt}
        )
        AND (
          activity.last_activity_at < ${value.snapshotLastActivityAt}
          OR (
            activity.last_activity_at = ${value.snapshotLastActivityAt}
            AND activity.topic_id > ${value.snapshotTopicId}
          )
        )
        AND (
          ${value.hasAfter} = FALSE
          OR activity.last_activity_at < ${value.afterLastActivityAt}
          OR (
            activity.last_activity_at = ${value.afterLastActivityAt}
            AND activity.topic_id > ${value.afterTopicId}
          )
        )
      ORDER BY activity.last_activity_at DESC, activity.topic_id
      LIMIT 101
    `,
  });

  const createInitialArchiveCursor = SqlSchema.findOne({
    Request: ArchiveCursorInsert,
    Result: ArchiveNextCursor,
    execute: (value) => sql<{ readonly cursor: string }>`
      INSERT INTO topic_archive_cursors (
        id, snapshot_id, page_offset, workspace_id, channel_id, account_id,
        snapshot_at, snapshot_last_activity_at, snapshot_topic_id,
        after_last_activity_at, after_topic_id, expires_at
      )
      VALUES (
        ${value.cursor}, ${value.snapshotId}, ${value.pageOffset},
        ${value.workspaceId}, ${value.channelId}, ${value.actorAccountId},
        ${value.snapshotAt}, ${value.snapshotLastActivityAt}, ${value.snapshotTopicId},
        ${value.afterLastActivityAt}, ${value.afterTopicId},
        CURRENT_TIMESTAMP + INTERVAL '1 hour'
      )
      RETURNING id AS cursor
    `,
  });

  const createNextArchiveCursor = SqlSchema.findOne({
    Request: ArchiveNextCursorInsert,
    Result: ArchiveNextCursor,
    execute: (value) => sql<{ readonly cursor: string }>`
      INSERT INTO topic_archive_cursors (
        id, snapshot_id, page_offset, workspace_id, channel_id, account_id,
        snapshot_at, snapshot_last_activity_at, snapshot_topic_id,
        after_last_activity_at, after_topic_id, expires_at
      )
      VALUES (
        ${value.cursor}, ${value.snapshotId}, ${value.pageOffset},
        ${value.workspaceId}, ${value.channelId}, ${value.actorAccountId},
        ${value.snapshotAt}, ${value.snapshotLastActivityAt}, ${value.snapshotTopicId},
        ${value.afterLastActivityAt}, ${value.afterTopicId}, ${value.expiresAt}
      )
      ON CONFLICT (snapshot_id, page_offset)
      DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id
      RETURNING id AS cursor
    `,
  });

  const listMessageRows = SqlSchema.findAll({
    Request: Schema.Struct({ workspaceId: WorkspaceId, topicId: TopicId }),
    Result: MessageRow,
    execute: ({ workspaceId, topicId }) => sql<MessageRow>`
      SELECT
        message.id,
        message.workspace_id AS "workspaceId",
        message.topic_id AS "topicId",
        message.author_identity_id AS "authorIdentityId",
        message.body,
        message.position,
        message.created_at AS "createdAt",
        message.edited_at AS "editedAt",
        message.deleted_at AS "deletedAt",
        author.name AS "authorName",
        author.avatar_url AS "authorAvatarUrl"
      FROM messages AS message
      INNER JOIN workspace_identities AS author
        ON author.workspace_id = message.workspace_id
        AND author.id = message.author_identity_id
      WHERE message.workspace_id = ${workspaceId}
        AND message.topic_id = ${topicId}
      ORDER BY message.position, message.id
    `,
  });

  const insertTopic = SqlSchema.findOne({
    Request: Topic,
    Result: TopicRow,
    execute: (value) => sql<TopicRow>`
      INSERT INTO topics (
        id, workspace_id, channel_id, title, intent, opened_by_identity_id,
        message_count, latest_message_id, latest_message_preview, last_activity_at, created_at
      )
      VALUES (
        ${value.id}, ${value.workspaceId}, ${value.channelId}, ${value.title},
        ${value.intent ?? null}, ${value.openedByIdentityId}, ${value.messageCount},
        ${value.latestMessageId}, ${value.latestMessagePreview ?? null},
        ${value.lastActivityAt}, ${value.createdAt}
      )
      RETURNING
        id,
        workspace_id AS "workspaceId",
        channel_id AS "channelId",
        title,
        intent,
        opened_by_identity_id AS "openedByIdentityId",
        message_count AS "messageCount",
        latest_message_id AS "latestMessageId",
        latest_message_preview AS "latestMessagePreview",
        last_activity_at AS "lastActivityAt",
        created_at AS "createdAt"
    `,
  });

  const insertMessage = SqlSchema.findOne({
    Request: Message,
    Result: Message,
    execute: (value) => sql<MessageType>`
      INSERT INTO messages (
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

  const appendMessage = SqlSchema.findOne({
    Request: Schema.Struct({
      id: MessageId,
      workspaceId: WorkspaceId,
      topicId: TopicId,
      authorIdentityId: WorkspaceIdentityId,
      body: MessageBody,
      createdAt: Schema.Date,
    }),
    Result: StoredMessageRow,
    execute: (value) => sql<StoredMessageRow>`
      WITH locked_topic AS (
        SELECT id
        FROM topics
        WHERE workspace_id = ${value.workspaceId}
          AND id = ${value.topicId}
        FOR UPDATE
      ), next_position AS (
        SELECT coalesce(max(message.position), 0)::integer + 1 AS position
        FROM locked_topic
        LEFT JOIN messages AS message
          ON message.workspace_id = ${value.workspaceId}
          AND message.topic_id = locked_topic.id
        GROUP BY locked_topic.id
      ), inserted_message AS (
        INSERT INTO messages (
          id, workspace_id, topic_id, author_identity_id, body, position, created_at
        )
        SELECT
          ${value.id}, ${value.workspaceId}, ${value.topicId}, ${value.authorIdentityId},
          ${value.body}, next_position.position, ${value.createdAt}
        FROM next_position
        RETURNING *
      ), updated_topic AS (
        UPDATE topics AS topic
        SET
          message_count = topic.message_count + 1,
          latest_message_id = inserted_message.id,
          latest_message_preview = ${makeTopicSummaryPreview(value.body)},
          last_activity_at = inserted_message.created_at
        FROM inserted_message
        WHERE topic.workspace_id = inserted_message.workspace_id
          AND topic.id = inserted_message.topic_id
        RETURNING topic.id
      )
      SELECT
        inserted_message.id,
        inserted_message.workspace_id AS "workspaceId",
        inserted_message.topic_id AS "topicId",
        inserted_message.author_identity_id AS "authorIdentityId",
        inserted_message.body,
        inserted_message.position,
        inserted_message.created_at AS "createdAt",
        inserted_message.edited_at AS "editedAt",
        inserted_message.deleted_at AS "deletedAt"
      FROM inserted_message, updated_topic
    `,
  });

  const reviseMessage = SqlSchema.findOne({
    Request: ReviseMessageRequest,
    Result: StoredMessageRow,
    execute: (value) => sql<StoredMessageRow>`
      WITH previous AS (
        SELECT workspace_id, topic_id, id, body
        FROM messages
        WHERE workspace_id = ${value.workspaceId}
          AND topic_id = ${value.topicId}
          AND id = ${value.messageId}
          AND deleted_at IS NULL
        FOR UPDATE
      ), revision AS (
        INSERT INTO message_revisions (
          workspace_id, topic_id, message_id, body, operation, revised_at
        )
        SELECT
          workspace_id,
          topic_id,
          id,
          body,
          CAST(${value.operation} AS "MessageRevisionOperation"),
          ${value.revisedAt}
        FROM previous
        RETURNING id
      )
      , revised_message AS (
        UPDATE messages AS message
        SET
          body = ${value.body},
          edited_at = CASE
            WHEN ${value.operation} = 'edit' THEN ${value.revisedAt}
            ELSE message.edited_at
          END,
          deleted_at = CASE
            WHEN ${value.operation} = 'delete' THEN ${value.revisedAt}
            ELSE message.deleted_at
          END
        FROM previous, revision
        WHERE message.workspace_id = previous.workspace_id
          AND message.topic_id = previous.topic_id
          AND message.id = previous.id
        RETURNING message.*
      ), updated_topic AS (
        UPDATE topics AS topic
        SET latest_message_preview = ${
          value.body === null ? null : makeTopicSummaryPreview(value.body)
        }
        FROM revised_message
        WHERE topic.workspace_id = revised_message.workspace_id
          AND topic.id = revised_message.topic_id
          AND topic.latest_message_id = revised_message.id
        RETURNING topic.id
      )
      SELECT
        revised_message.id,
        revised_message.workspace_id AS "workspaceId",
        revised_message.topic_id AS "topicId",
        revised_message.author_identity_id AS "authorIdentityId",
        revised_message.body,
        revised_message.position,
        revised_message.created_at AS "createdAt",
        revised_message.edited_at AS "editedAt",
        revised_message.deleted_at AS "deletedAt"
      FROM revised_message
      LEFT JOIN updated_topic ON TRUE
    `,
  });

  const mapFailure = <A, E, R>(operation: string, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.mapError((cause) => persistenceError(operation, cause)));

  return TopicRepository.of({
    listArchivePageInChannel: Effect.fn("PostgresTopicRepository.listArchivePageInChannel")(
      function* (actorAccountId, workspaceId, channelId, cursor) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* deleteExpiredArchiveCursors({});
            yield* deleteStaleActivityVersions({});

            if (cursor === undefined) {
              yield* lockArchiveSnapshot({ workspaceId, channelId });
              const rows = yield* listFirstArchiveRows({ workspaceId, channelId });
              const hasMore = rows.length > 100;
              const pageRows = rows.slice(0, 100);
              if (!hasMore) {
                return {
                  summaries: pageRows.map(summaryRecord),
                  cursorValid: true,
                };
              }

              const boundary = rows[0]!;
              const after = pageRows.at(-1)!;
              const nextCursor = yield* createInitialArchiveCursor({
                cursor: randomUUID(),
                snapshotId: randomUUID(),
                pageOffset: 100,
                actorAccountId,
                workspaceId,
                channelId,
                snapshotAt: boundary.snapshotAt,
                snapshotLastActivityAt: boundary.snapshotLastActivityAt,
                snapshotTopicId: boundary.snapshotTopicId,
                afterLastActivityAt: after.archiveLastActivityAt,
                afterTopicId: after.id,
              });
              return {
                summaries: pageRows.map(summaryRecord),
                cursorValid: true,
                nextCursor: nextCursor.cursor,
              };
            }

            const position = Option.getOrUndefined(
              yield* resolveArchiveCursor({
                cursor,
                actorAccountId,
                workspaceId,
                channelId,
              }),
            );
            if (position === undefined) {
              return { summaries: [], cursorValid: false };
            }

            const rows = yield* listArchiveRows({
              workspaceId,
              channelId,
              snapshotAt: position.snapshotAt,
              snapshotLastActivityAt: position.snapshotLastActivityAt,
              snapshotTopicId: position.snapshotTopicId,
              hasAfter: true,
              afterLastActivityAt: position.afterLastActivityAt,
              afterTopicId: position.afterTopicId,
            });
            const hasMore = rows.length > 100;
            const pageRows = rows.slice(0, 100);
            if (!hasMore) {
              return {
                summaries: pageRows.map(summaryRecord),
                cursorValid: true,
              };
            }

            const after = pageRows.at(-1)!;
            const nextCursor = yield* createNextArchiveCursor({
              cursor: randomUUID(),
              snapshotId: position.snapshotId,
              pageOffset: position.pageOffset + 100,
              actorAccountId,
              workspaceId,
              channelId,
              snapshotAt: position.snapshotAt,
              snapshotLastActivityAt: position.snapshotLastActivityAt,
              snapshotTopicId: position.snapshotTopicId,
              afterLastActivityAt: after.archiveLastActivityAt,
              afterTopicId: after.id,
              expiresAt: position.expiresAt,
            });
            return {
              summaries: pageRows.map(summaryRecord),
              cursorValid: true,
              nextCursor: nextCursor.cursor,
            };
          }),
        );
      },
      (effect) => mapFailure("TopicRepository.listArchivePageInChannel", effect),
    ),
    findById: Effect.fn("PostgresTopicRepository.findById")(
      (workspaceId, channelId, topicId) =>
        Effect.gen(function* () {
          const row = yield* findTopicRow({ workspaceId, channelId, topicId });
          if (Option.isNone(row)) return undefined;
          const messages = yield* listMessageRows({ workspaceId, topicId });
          return TopicRecord.make({
            topic: topic(row.value),
            messages: messages.map(messageRecord),
          });
        }),
      (effect) => mapFailure("TopicRepository.findById", effect),
    ),
    insertTopic: Effect.fn("PostgresTopicRepository.insertTopic")(
      (value) => insertTopic(value).pipe(Effect.asVoid),
      (effect) => mapFailure("TopicRepository.insertTopic", effect),
    ),
    insertMessage: Effect.fn("PostgresTopicRepository.insertMessage")(
      (value) => insertMessage(value).pipe(Effect.asVoid),
      (effect) => mapFailure("TopicRepository.insertMessage", effect),
    ),
    appendMessage: Effect.fn("PostgresTopicRepository.appendMessage")(
      (value) => appendMessage(value).pipe(Effect.map(message)),
      (effect) => mapFailure("TopicRepository.appendMessage", effect),
    ),
    editMessage: Effect.fn("PostgresTopicRepository.editMessage")(
      (value) =>
        reviseMessage({
          workspaceId: value.workspaceId,
          topicId: value.topicId,
          messageId: value.messageId,
          body: value.body,
          operation: "edit",
          revisedAt: value.editedAt,
        }).pipe(Effect.map(message)),
      (effect) => mapFailure("TopicRepository.editMessage", effect),
    ),
    tombstoneMessage: Effect.fn("PostgresTopicRepository.tombstoneMessage")(
      (value) =>
        reviseMessage({
          workspaceId: value.workspaceId,
          topicId: value.topicId,
          messageId: value.messageId,
          body: null,
          operation: "delete",
          revisedAt: value.deletedAt,
        }).pipe(Effect.map(message)),
      (effect) => mapFailure("TopicRepository.tombstoneMessage", effect),
    ),
  });
});

export const PostgresTopicRepository = Layer.effect(TopicRepository, make);
