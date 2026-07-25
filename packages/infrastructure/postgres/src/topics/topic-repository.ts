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
  TopicRepository,
  TopicSummaryRecord,
} from "@cove/ports";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { persistenceError } from "../persistence-error.ts";
import { TopicArchiveCursorCodec } from "./topic-archive-cursor.ts";

const ARCHIVE_PAGE_SIZE = 100;
const LIVE_BOUNDARY_OFFSET = 499;

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
  latestMessageAuthorIdentityId: WorkspaceIdentityId,
  latestMessagePosition: MessagePosition,
  latestMessageCreatedAt: Schema.Date,
  latestMessageEditedAt: Schema.NullOr(Schema.Date),
  latestMessageDeletedAt: Schema.NullOr(Schema.Date),
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

const MessageRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  topicId: TopicId,
  messageId: MessageId,
});

const ArchiveFirstPageRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  channelId: ChannelId,
});

const ArchivePageRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  afterLastActivityAt: Schema.Date,
  afterTopicId: TopicId,
});

const TopicSummaryRow = Schema.Struct({
  ...TopicRow.fields,
  authorName: WorkspaceIdentityName,
  authorAvatarUrl: WorkspaceAvatarUrl,
});
interface TopicSummaryRow extends Schema.Schema.Type<typeof TopicSummaryRow> {}

const MessageRow = Schema.Struct({
  id: MessageId,
  workspaceId: WorkspaceId,
  topicId: TopicId,
  authorIdentityId: WorkspaceIdentityId,
  body: Schema.NullOr(MessageBody),
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
    latestMessageAuthorIdentityId: row.latestMessageAuthorIdentityId,
    latestMessagePosition: row.latestMessagePosition,
    latestMessageCreatedAt: row.latestMessageCreatedAt,
    ...(row.latestMessageEditedAt === null
      ? {}
      : { latestMessageEditedAt: row.latestMessageEditedAt }),
    ...(row.latestMessageDeletedAt === null
      ? {}
      : { latestMessageDeletedAt: row.latestMessageDeletedAt }),
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
      id: row.latestMessageId,
      workspaceId: row.workspaceId,
      topicId: row.id,
      authorIdentityId: row.latestMessageAuthorIdentityId,
      body: null,
      position: row.latestMessagePosition,
      createdAt: row.latestMessageCreatedAt,
      editedAt: row.latestMessageEditedAt,
      deletedAt: row.latestMessageDeletedAt,
      authorName: row.authorName,
      authorAvatarUrl: row.authorAvatarUrl,
    }),
    messageCount: row.messageCount,
  });
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const archiveCursors = yield* TopicArchiveCursorCodec;

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
        latest_message_author_identity_id AS "latestMessageAuthorIdentityId",
        latest_message_position AS "latestMessagePosition",
        latest_message_created_at AS "latestMessageCreatedAt",
        latest_message_edited_at AS "latestMessageEditedAt",
        latest_message_deleted_at AS "latestMessageDeletedAt",
        last_activity_at AS "lastActivityAt",
        created_at AS "createdAt"
      FROM topics
      WHERE workspace_id = ${workspaceId}
        AND channel_id = ${channelId}
        AND id = ${topicId}
      LIMIT 1
    `,
  });

  const listFirstArchiveRows = SqlSchema.findAll({
    Request: ArchiveFirstPageRequest,
    Result: TopicSummaryRow,
    execute: ({ workspaceId, channelId }) => sql<TopicSummaryRow>`
      WITH live_boundary AS (
        SELECT
          last_activity_at,
          id
        FROM topics
        WHERE workspace_id = ${workspaceId}
          AND channel_id = ${channelId}
        ORDER BY last_activity_at DESC, id
        OFFSET ${LIVE_BOUNDARY_OFFSET}
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
        topic.latest_message_author_identity_id AS "latestMessageAuthorIdentityId",
        topic.latest_message_position AS "latestMessagePosition",
        topic.latest_message_created_at AS "latestMessageCreatedAt",
        topic.latest_message_edited_at AS "latestMessageEditedAt",
        topic.latest_message_deleted_at AS "latestMessageDeletedAt",
        topic.last_activity_at AS "lastActivityAt",
        topic.created_at AS "createdAt",
        author.name AS "authorName",
        author.avatar_url AS "authorAvatarUrl"
      FROM topics AS topic
      CROSS JOIN live_boundary
      INNER JOIN workspace_identities AS author
        ON author.workspace_id = topic.workspace_id
        AND author.id = topic.latest_message_author_identity_id
      WHERE topic.workspace_id = ${workspaceId}
        AND topic.channel_id = ${channelId}
        AND (
          topic.last_activity_at < live_boundary.last_activity_at
          OR (
            topic.last_activity_at = live_boundary.last_activity_at
            AND topic.id > live_boundary.id
          )
      )
      ORDER BY topic.last_activity_at DESC, topic.id
      LIMIT ${ARCHIVE_PAGE_SIZE + 1}
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
        topic.latest_message_author_identity_id AS "latestMessageAuthorIdentityId",
        topic.latest_message_position AS "latestMessagePosition",
        topic.latest_message_created_at AS "latestMessageCreatedAt",
        topic.latest_message_edited_at AS "latestMessageEditedAt",
        topic.latest_message_deleted_at AS "latestMessageDeletedAt",
        topic.last_activity_at AS "lastActivityAt",
        topic.created_at AS "createdAt",
        author.name AS "authorName",
        author.avatar_url AS "authorAvatarUrl"
      FROM topics AS topic
      INNER JOIN workspace_identities AS author
        ON author.workspace_id = topic.workspace_id
        AND author.id = topic.latest_message_author_identity_id
      WHERE topic.workspace_id = ${value.workspaceId}
        AND topic.channel_id = ${value.channelId}
        AND (
          topic.last_activity_at < ${value.afterLastActivityAt}
          OR (
            topic.last_activity_at = ${value.afterLastActivityAt}
            AND topic.id > ${value.afterTopicId}
          )
      )
      ORDER BY topic.last_activity_at DESC, topic.id
      LIMIT ${ARCHIVE_PAGE_SIZE + 1}
    `,
  });

  const findMessageRow = SqlSchema.findOneOption({
    Request: MessageRequest,
    Result: MessageRow,
    execute: ({ workspaceId, topicId, messageId }) => sql<MessageRow>`
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
        AND message.id = ${messageId}
      LIMIT 1
    `,
  });

  const insertTopic = SqlSchema.findOne({
    Request: Topic,
    Result: TopicRow,
    execute: (value) => sql<TopicRow>`
      INSERT INTO topics (
        id, workspace_id, channel_id, title, intent, opened_by_identity_id,
        message_count, latest_message_id, latest_message_preview,
        latest_message_author_identity_id, latest_message_position,
        latest_message_created_at, latest_message_edited_at, latest_message_deleted_at,
        last_activity_at, created_at
      )
      VALUES (
        ${value.id}, ${value.workspaceId}, ${value.channelId}, ${value.title},
        ${value.intent ?? null}, ${value.openedByIdentityId}, ${value.messageCount},
        ${value.latestMessageId}, ${value.latestMessagePreview ?? null},
        ${value.latestMessageAuthorIdentityId}, ${value.latestMessagePosition},
        ${value.latestMessageCreatedAt}, ${value.latestMessageEditedAt ?? null},
        ${value.latestMessageDeletedAt ?? null},
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
        latest_message_author_identity_id AS "latestMessageAuthorIdentityId",
        latest_message_position AS "latestMessagePosition",
        latest_message_created_at AS "latestMessageCreatedAt",
        latest_message_edited_at AS "latestMessageEditedAt",
        latest_message_deleted_at AS "latestMessageDeletedAt",
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
        SELECT id, latest_message_position + 1 AS next_position
        FROM topics
        WHERE workspace_id = ${value.workspaceId}
          AND id = ${value.topicId}
        FOR UPDATE
      ), inserted_message AS (
        INSERT INTO messages (
          id, workspace_id, topic_id, author_identity_id, body, position, created_at
        )
        SELECT
          ${value.id}, ${value.workspaceId}, ${value.topicId}, ${value.authorIdentityId},
          ${value.body}, locked_topic.next_position, ${value.createdAt}
        FROM locked_topic
        RETURNING *
      ), updated_topic AS (
        UPDATE topics AS topic
        SET
          message_count = topic.message_count + 1,
          latest_message_id = inserted_message.id,
          latest_message_preview = ${makeTopicSummaryPreview(value.body)},
          latest_message_author_identity_id = inserted_message.author_identity_id,
          latest_message_position = inserted_message.position,
          latest_message_created_at = inserted_message.created_at,
          latest_message_edited_at = inserted_message.edited_at,
          latest_message_deleted_at = inserted_message.deleted_at,
          last_activity_at = greatest(topic.last_activity_at, inserted_message.created_at)
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
        SET
          latest_message_preview = ${
            value.body === null ? null : makeTopicSummaryPreview(value.body)
          },
          latest_message_edited_at = revised_message.edited_at,
          latest_message_deleted_at = revised_message.deleted_at
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
        const rows =
          cursor === undefined
            ? yield* listFirstArchiveRows({ workspaceId, channelId })
            : yield* Effect.gen(function* () {
                const position = Option.getOrUndefined(
                  archiveCursors.decodeForScope(cursor, {
                    actorAccountId,
                    workspaceId,
                    channelId,
                  }),
                );
                if (position === undefined) {
                  return undefined;
                }
                return yield* listArchiveRows({
                  workspaceId,
                  channelId,
                  afterLastActivityAt: position.afterLastActivityAt,
                  afterTopicId: position.afterTopicId,
                });
              });
        if (rows === undefined) {
          return { summaries: [], cursorValid: false };
        }

        const hasMore = rows.length > ARCHIVE_PAGE_SIZE;
        const pageRows = rows.slice(0, ARCHIVE_PAGE_SIZE);
        if (!hasMore) {
          return {
            summaries: pageRows.map(summaryRecord),
            cursorValid: true,
          };
        }

        const after = pageRows.at(-1)!;
        return {
          summaries: pageRows.map(summaryRecord),
          cursorValid: true,
          nextCursor: archiveCursors.encode({
            version: 1,
            actorAccountId,
            workspaceId,
            channelId,
            afterLastActivityAt: after.lastActivityAt,
            afterTopicId: after.id,
          }),
        };
      },
      (effect) => mapFailure("TopicRepository.listArchivePageInChannel", effect),
    ),
    findTopicById: Effect.fn("PostgresTopicRepository.findTopicById")(
      (workspaceId, channelId, topicId) =>
        Effect.gen(function* () {
          const row = yield* findTopicRow({ workspaceId, channelId, topicId });
          return Option.isNone(row) ? undefined : topic(row.value);
        }),
      (effect) => mapFailure("TopicRepository.findTopicById", effect),
    ),
    findMessageById: Effect.fn("PostgresTopicRepository.findMessageById")(
      (workspaceId, topicId, messageId) =>
        Effect.gen(function* () {
          const row = yield* findMessageRow({ workspaceId, topicId, messageId });
          return Option.isNone(row) ? undefined : messageRecord(row.value);
        }),
      (effect) => mapFailure("TopicRepository.findMessageById", effect),
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
