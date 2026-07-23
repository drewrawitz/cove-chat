import {
  ChannelId,
  Message,
  MessageBody,
  MessageId,
  MessagePosition,
  Topic,
  TopicId,
  TopicIntent,
  TopicTitle,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
  type Message as MessageType,
  type Topic as TopicType,
} from "@cove/domain";
import { TopicMessageRecord, TopicRecord, TopicRepository, TopicSummaryRecord } from "@cove/ports";
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
  messageId: MessageId,
  messageBody: Schema.NullOr(MessageBody),
  messagePosition: MessagePosition,
  messageCreatedAt: Schema.Date,
  messageEditedAt: Schema.NullOr(Schema.Date),
  messageDeletedAt: Schema.NullOr(Schema.Date),
  authorIdentityId: WorkspaceIdentityId,
  authorName: WorkspaceIdentityName,
  authorAvatarUrl: WorkspaceAvatarUrl,
  messageCount: Schema.Int.check(Schema.isGreaterThan(0)),
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

function messageRecord(row: MessageRow): TopicMessageRecord {
  return TopicMessageRecord.make({
    message: message(row),
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
    openingBrief: messageRecord({
      id: row.messageId,
      workspaceId: row.workspaceId,
      topicId: row.id,
      authorIdentityId: row.authorIdentityId,
      body: row.messageBody,
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
        opening.id AS "messageId",
        opening.body AS "messageBody",
        opening.position AS "messagePosition",
        opening.created_at AS "messageCreatedAt",
        opening.edited_at AS "messageEditedAt",
        opening.deleted_at AS "messageDeletedAt",
        opening.author_identity_id AS "authorIdentityId",
        author.name AS "authorName",
        author.avatar_url AS "authorAvatarUrl",
        count(message.id)::integer AS "messageCount"
      FROM topics AS topic
      INNER JOIN messages AS opening
        ON opening.workspace_id = topic.workspace_id
        AND opening.topic_id = topic.id
        AND opening.position = 1
      INNER JOIN workspace_identities AS author
        ON author.workspace_id = opening.workspace_id
        AND author.id = opening.author_identity_id
      INNER JOIN messages AS message
        ON message.workspace_id = topic.workspace_id
        AND message.topic_id = topic.id
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
      )
      INSERT INTO messages (
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
      RETURNING
        message.id,
        message.workspace_id AS "workspaceId",
        message.topic_id AS "topicId",
        message.author_identity_id AS "authorIdentityId",
        message.body,
        message.position,
        message.created_at AS "createdAt",
        message.edited_at AS "editedAt",
        message.deleted_at AS "deletedAt"
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
