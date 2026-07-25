import {
  ChannelUnavailable,
  MessageCommandConflict,
  MessageCommandFailure,
  MessageCommandKind,
  MessageCommandRejected,
  MessageCommandSucceeded,
  MessageCommands,
  MessageMutationForbidden,
  MessageUnavailable,
  StaleMessageVersion,
  TopicUnavailable,
  type MessageCommand,
  type MessageCommandRejection,
  type MessageCommandStatus,
} from "@cove/application";
import {
  ChannelId,
  MessageBody,
  MessageCommandId,
  MessageId,
  MessageVersion,
  TopicId,
  TopicSummaryPreview,
  UserId,
  WorkspaceId,
  WorkspaceIdentityId,
  makeMessageId,
  makeTopicSummaryPreview,
} from "@cove/domain";
import { Clock, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { createHash, randomUUID } from "node:crypto";

const ActiveActorRequest = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
});

const ActiveActorRow = Schema.Struct({
  actorIdentityId: WorkspaceIdentityId,
});
interface ActiveActorRow extends Schema.Schema.Type<typeof ActiveActorRow> {}

const ClaimReceiptRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  commandId: MessageCommandId,
  actorIdentityId: WorkspaceIdentityId,
  kind: MessageCommandKind,
  fingerprint: Schema.String,
  channelId: ChannelId,
  topicId: TopicId,
  messageId: Schema.NullOr(MessageId),
  createdAt: Schema.Date,
});

const ReceiptRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  commandId: MessageCommandId,
});

const ReceiptRow = Schema.Struct({
  commandId: MessageCommandId,
  actorIdentityId: WorkspaceIdentityId,
  kind: MessageCommandKind,
  fingerprint: Schema.String,
  outcome: Schema.Literals(["pending", "succeeded", "rejected"]),
  rejection: Schema.NullOr(
    Schema.Literals([
      "channel_unavailable",
      "topic_unavailable",
      "message_unavailable",
      "mutation_forbidden",
      "stale_version",
    ]),
  ),
  messageId: Schema.NullOr(MessageId),
  messageVersion: Schema.NullOr(MessageVersion),
});
interface ReceiptRow extends Schema.Schema.Type<typeof ReceiptRow> {}

const ExistingReceiptRow = Schema.Struct({
  ...ReceiptRow.fields,
  actorAccountId: UserId,
});
interface ExistingReceiptRow extends Schema.Schema.Type<typeof ExistingReceiptRow> {}

const CommandContextRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  actorIdentityId: WorkspaceIdentityId,
  channelId: ChannelId,
  topicId: TopicId,
});

const CommandContextRow = Schema.Struct({
  hasChannelMembership: Schema.Boolean,
  topicAvailable: Schema.Boolean,
});
interface CommandContextRow extends Schema.Schema.Type<typeof CommandContextRow> {}

const AppendRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  actorIdentityId: WorkspaceIdentityId,
  topicId: TopicId,
  messageId: MessageId,
  commandId: MessageCommandId,
  body: MessageBody,
  createdAt: Schema.Date,
  preview: TopicSummaryPreview,
});

const MessageResultRow = Schema.Struct({
  messageId: MessageId,
  messageVersion: MessageVersion,
});
interface MessageResultRow extends Schema.Schema.Type<typeof MessageResultRow> {}

const MutationTargetRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  topicId: TopicId,
  messageId: MessageId,
});

const MutationTargetRow = Schema.Struct({
  authorIdentityId: WorkspaceIdentityId,
  body: Schema.NullOr(MessageBody),
  version: MessageVersion,
  deletedAt: Schema.NullOr(Schema.Date),
});
interface MutationTargetRow extends Schema.Schema.Type<typeof MutationTargetRow> {}

const ReviseRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  topicId: TopicId,
  messageId: MessageId,
  commandId: MessageCommandId,
  body: Schema.NullOr(MessageBody),
  operation: Schema.Literals(["edit", "delete"]),
  revisedAt: Schema.Date,
  preview: Schema.NullOr(Schema.String),
});

const CompleteSuccessRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  commandId: MessageCommandId,
  messageId: MessageId,
  messageVersion: MessageVersion,
  completedAt: Schema.Date,
});

const CompleteRejectionRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  commandId: MessageCommandId,
  rejection: Schema.Literals([
    "channel_unavailable",
    "topic_unavailable",
    "message_unavailable",
    "mutation_forbidden",
    "stale_version",
  ]),
  completedAt: Schema.Date,
});

const StatusRequest = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  commandId: MessageCommandId,
});

const fingerprint = (command: MessageCommand): string => {
  const semanticRequest =
    command._tag === "create"
      ? [command._tag, command.actorAccountId, command.channelId, command.topicId, command.body]
      : command._tag === "edit"
        ? [
            command._tag,
            command.actorAccountId,
            command.channelId,
            command.topicId,
            command.messageId,
            command.expectedVersion,
            command.body,
          ]
        : [
            command._tag,
            command.actorAccountId,
            command.channelId,
            command.topicId,
            command.messageId,
            command.expectedVersion,
          ];
  return createHash("sha256").update(JSON.stringify(semanticRequest)).digest("hex");
};

const receiptStatus = (receipt: ReceiptRow): MessageCommandStatus | undefined => {
  if (
    receipt.outcome === "succeeded" &&
    receipt.messageId !== null &&
    receipt.messageVersion !== null
  ) {
    return MessageCommandSucceeded.make({
      commandId: receipt.commandId,
      kind: receipt.kind,
      messageId: receipt.messageId,
      messageVersion: receipt.messageVersion,
    });
  }
  if (receipt.outcome === "rejected" && receipt.rejection !== null) {
    return MessageCommandRejected.make({
      commandId: receipt.commandId,
      kind: receipt.kind,
      rejection: receipt.rejection,
      ...(receipt.messageId === null ? {} : { messageId: receipt.messageId }),
    });
  }
  return undefined;
};

const rejectionFailure = (
  command: MessageCommand,
  rejection: MessageCommandRejection,
):
  | ChannelUnavailable
  | TopicUnavailable
  | MessageUnavailable
  | MessageMutationForbidden
  | StaleMessageVersion
  | MessageCommandFailure => {
  switch (rejection) {
    case "channel_unavailable":
      return new ChannelUnavailable({ channelId: command.channelId });
    case "topic_unavailable":
      return new TopicUnavailable({ topicId: command.topicId });
    case "message_unavailable":
      return command._tag === "create"
        ? new MessageCommandFailure({
            operation: "MessageCommands.execute.invalidCreateRejection",
          })
        : new MessageUnavailable({ messageId: command.messageId });
    case "mutation_forbidden":
      return command._tag === "create"
        ? new MessageCommandFailure({
            operation: "MessageCommands.execute.invalidCreateRejection",
          })
        : new MessageMutationForbidden({ messageId: command.messageId });
    case "stale_version":
      return command._tag === "create"
        ? new MessageCommandFailure({
            operation: "MessageCommands.execute.invalidCreateRejection",
          })
        : new StaleMessageVersion({
            messageId: command.messageId,
            expectedVersion: command.expectedVersion,
          });
  }
};

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const findActiveActor = SqlSchema.findOneOption({
    Request: ActiveActorRequest,
    Result: ActiveActorRow,
    execute: ({ actorAccountId, workspaceId }) => sql<ActiveActorRow>`
      SELECT identity.id AS "actorIdentityId"
      FROM workspace_identities AS identity
      WHERE identity.workspace_id = ${workspaceId}
        AND identity.account_id = ${actorAccountId}
        AND identity.membership_ended_at IS NULL
      LIMIT 1
      FOR SHARE
    `,
  });

  const claimReceipt = SqlSchema.findOneOption({
    Request: ClaimReceiptRequest,
    Result: ReceiptRow,
    execute: (value) => sql<ReceiptRow>`
      INSERT INTO message_command_receipts (
        workspace_id,
        command_id,
        actor_identity_id,
        kind,
        fingerprint,
        channel_id,
        topic_id,
        message_id,
        created_at
      )
      VALUES (
        ${value.workspaceId},
        ${value.commandId},
        ${value.actorIdentityId},
        CAST(${value.kind} AS "MessageCommandKind"),
        ${value.fingerprint},
        ${value.channelId},
        ${value.topicId},
        ${value.messageId},
        ${value.createdAt}
      )
      ON CONFLICT (workspace_id, command_id) DO NOTHING
      RETURNING
        command_id AS "commandId",
        actor_identity_id AS "actorIdentityId",
        kind,
        fingerprint,
        outcome,
        rejection,
        message_id AS "messageId",
        message_version AS "messageVersion"
    `,
  });

  const findReceiptForUpdate = SqlSchema.findOneOption({
    Request: ReceiptRequest,
    Result: ExistingReceiptRow,
    execute: ({ workspaceId, commandId }) => sql<ExistingReceiptRow>`
      SELECT
        receipt.command_id AS "commandId",
        actor.account_id AS "actorAccountId",
        receipt.actor_identity_id AS "actorIdentityId",
        receipt.kind,
        receipt.fingerprint,
        receipt.outcome,
        receipt.rejection,
        receipt.message_id AS "messageId",
        receipt.message_version AS "messageVersion"
      FROM message_command_receipts AS receipt
      INNER JOIN workspace_identities AS actor
        ON actor.workspace_id = receipt.workspace_id
        AND actor.id = receipt.actor_identity_id
      WHERE receipt.workspace_id = ${workspaceId}
        AND receipt.command_id = ${commandId}
      FOR UPDATE OF receipt
    `,
  });

  const readCommandContext = SqlSchema.findOne({
    Request: CommandContextRequest,
    Result: CommandContextRow,
    execute: (value) => sql<CommandContextRow>`
      SELECT
        EXISTS (
          SELECT 1
          FROM channels AS channel
          INNER JOIN channel_memberships AS membership
            ON membership.workspace_id = channel.workspace_id
            AND membership.channel_id = channel.id
            AND membership.identity_id = ${value.actorIdentityId}
          WHERE channel.workspace_id = ${value.workspaceId}
            AND channel.id = ${value.channelId}
        ) AS "hasChannelMembership",
        EXISTS (
          SELECT 1
          FROM topics AS topic
          WHERE topic.workspace_id = ${value.workspaceId}
            AND topic.channel_id = ${value.channelId}
            AND topic.id = ${value.topicId}
        ) AS "topicAvailable"
    `,
  });

  const appendMessage = SqlSchema.findOne({
    Request: AppendRequest,
    Result: MessageResultRow,
    execute: (value) => sql<MessageResultRow>`
      WITH locked_topic AS (
        SELECT id, latest_message_position + 1 AS next_position
        FROM topics
        WHERE workspace_id = ${value.workspaceId}
          AND id = ${value.topicId}
        FOR UPDATE
      ), inserted_message AS (
        INSERT INTO messages (
          id,
          workspace_id,
          topic_id,
          author_identity_id,
          body,
          position,
          version,
          produced_by_command_id,
          created_at
        )
        SELECT
          ${value.messageId},
          ${value.workspaceId},
          ${value.topicId},
          ${value.actorIdentityId},
          ${value.body},
          locked_topic.next_position,
          1,
          ${value.commandId},
          ${value.createdAt}
        FROM locked_topic
        RETURNING *
      ), updated_topic AS (
        UPDATE topics AS topic
        SET
          message_count = topic.message_count + 1,
          latest_message_id = inserted_message.id,
          latest_message_preview = ${value.preview},
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
        inserted_message.id AS "messageId",
        inserted_message.version AS "messageVersion"
      FROM inserted_message, updated_topic
    `,
  });

  const findMutationTarget = SqlSchema.findOneOption({
    Request: MutationTargetRequest,
    Result: MutationTargetRow,
    execute: (value) => sql<MutationTargetRow>`
      SELECT
        author_identity_id AS "authorIdentityId",
        body,
        version,
        deleted_at AS "deletedAt"
      FROM messages
      WHERE workspace_id = ${value.workspaceId}
        AND topic_id = ${value.topicId}
        AND id = ${value.messageId}
      FOR UPDATE
    `,
  });

  const reviseMessage = SqlSchema.findOne({
    Request: ReviseRequest,
    Result: MessageResultRow,
    execute: (value) => sql<MessageResultRow>`
      WITH revision AS (
        INSERT INTO message_revisions (
          workspace_id,
          topic_id,
          message_id,
          body,
          operation,
          revised_at
        )
        SELECT
          workspace_id,
          topic_id,
          id,
          body,
          CAST(${value.operation} AS "MessageRevisionOperation"),
          ${value.revisedAt}
        FROM messages
        WHERE workspace_id = ${value.workspaceId}
          AND topic_id = ${value.topicId}
          AND id = ${value.messageId}
        RETURNING id
      ), revised_message AS (
        UPDATE messages AS message
        SET
          body = ${value.body},
          version = message.version + 1,
          produced_by_command_id = ${value.commandId},
          edited_at = CASE
            WHEN ${value.operation} = 'edit' THEN ${value.revisedAt}
            ELSE message.edited_at
          END,
          deleted_at = CASE
            WHEN ${value.operation} = 'delete' THEN ${value.revisedAt}
            ELSE message.deleted_at
          END
        FROM revision
        WHERE message.workspace_id = ${value.workspaceId}
          AND message.topic_id = ${value.topicId}
          AND message.id = ${value.messageId}
        RETURNING message.*
      ), updated_topic AS (
        UPDATE topics AS topic
        SET
          latest_message_preview = ${value.preview},
          latest_message_edited_at = revised_message.edited_at,
          latest_message_deleted_at = revised_message.deleted_at
        FROM revised_message
        WHERE topic.workspace_id = revised_message.workspace_id
          AND topic.id = revised_message.topic_id
          AND topic.latest_message_id = revised_message.id
        RETURNING topic.id
      )
      SELECT
        revised_message.id AS "messageId",
        revised_message.version AS "messageVersion"
      FROM revised_message
      LEFT JOIN updated_topic ON TRUE
    `,
  });

  const completeSuccess = SqlSchema.findOne({
    Request: CompleteSuccessRequest,
    Result: ReceiptRow,
    execute: (value) => sql<ReceiptRow>`
      UPDATE message_command_receipts
      SET
        outcome = 'succeeded',
        message_id = ${value.messageId},
        message_version = ${value.messageVersion},
        completed_at = ${value.completedAt}
      WHERE workspace_id = ${value.workspaceId}
        AND command_id = ${value.commandId}
      RETURNING
        command_id AS "commandId",
        actor_identity_id AS "actorIdentityId",
        kind,
        fingerprint,
        outcome,
        rejection,
        message_id AS "messageId",
        message_version AS "messageVersion"
    `,
  });

  const completeRejection = SqlSchema.findOne({
    Request: CompleteRejectionRequest,
    Result: ReceiptRow,
    execute: (value) => sql<ReceiptRow>`
      UPDATE message_command_receipts
      SET
        outcome = 'rejected',
        rejection = CAST(${value.rejection} AS "MessageCommandRejection"),
        completed_at = ${value.completedAt}
      WHERE workspace_id = ${value.workspaceId}
        AND command_id = ${value.commandId}
      RETURNING
        command_id AS "commandId",
        actor_identity_id AS "actorIdentityId",
        kind,
        fingerprint,
        outcome,
        rejection,
        message_id AS "messageId",
        message_version AS "messageVersion"
    `,
  });

  const readStatus = SqlSchema.findOneOption({
    Request: StatusRequest,
    Result: ReceiptRow,
    execute: (value) => sql<ReceiptRow>`
      SELECT
        receipt.command_id AS "commandId",
        receipt.actor_identity_id AS "actorIdentityId",
        receipt.kind,
        receipt.fingerprint,
        receipt.outcome,
        receipt.rejection,
        receipt.message_id AS "messageId",
        receipt.message_version AS "messageVersion"
      FROM message_command_receipts AS receipt
      INNER JOIN workspace_identities AS actor
        ON actor.workspace_id = receipt.workspace_id
        AND actor.id = receipt.actor_identity_id
      WHERE receipt.workspace_id = ${value.workspaceId}
        AND receipt.command_id = ${value.commandId}
        AND actor.account_id = ${value.actorAccountId}
      LIMIT 1
    `,
  });

  const reject = (command: MessageCommand, rejection: MessageCommandRejection, completedAt: Date) =>
    completeRejection({
      workspaceId: command.workspaceId,
      commandId: command.commandId,
      rejection,
      completedAt,
    }).pipe(Effect.map(receiptStatus));

  const replay = (
    command: MessageCommand,
    requestFingerprint: string,
    receipt: ExistingReceiptRow,
  ) =>
    receipt.actorAccountId !== command.actorAccountId ||
    receipt.kind !== command._tag ||
    receipt.fingerprint !== requestFingerprint
      ? ({ _tag: "conflict" } as const)
      : receiptStatus(receipt);

  const executeClaimed = Effect.fn("PostgresMessageCommands.executeClaimed")(function* (
    command: MessageCommand,
    actorIdentityId: WorkspaceIdentityId,
    completedAt: Date,
  ) {
    const context = yield* readCommandContext({
      workspaceId: command.workspaceId,
      actorIdentityId,
      channelId: command.channelId,
      topicId: command.topicId,
    });
    if (!context.hasChannelMembership) {
      return yield* reject(command, "channel_unavailable", completedAt);
    }
    if (!context.topicAvailable) {
      return yield* reject(command, "topic_unavailable", completedAt);
    }

    if (command._tag === "create") {
      const messageId = yield* makeMessageId(randomUUID());
      const result = yield* appendMessage({
        workspaceId: command.workspaceId,
        actorIdentityId,
        topicId: command.topicId,
        messageId,
        commandId: command.commandId,
        body: command.body,
        createdAt: completedAt,
        preview: makeTopicSummaryPreview(command.body),
      });
      return receiptStatus(
        yield* completeSuccess({
          workspaceId: command.workspaceId,
          commandId: command.commandId,
          messageId: result.messageId,
          messageVersion: result.messageVersion,
          completedAt,
        }),
      );
    }

    const targetOption = yield* findMutationTarget({
      workspaceId: command.workspaceId,
      topicId: command.topicId,
      messageId: command.messageId,
    });
    if (Option.isNone(targetOption) || targetOption.value.deletedAt !== null) {
      return yield* reject(command, "message_unavailable", completedAt);
    }
    const target = targetOption.value;
    if (target.authorIdentityId !== actorIdentityId) {
      return yield* reject(command, "mutation_forbidden", completedAt);
    }
    if (target.version !== command.expectedVersion) {
      return yield* reject(command, "stale_version", completedAt);
    }

    const result = yield* reviseMessage({
      workspaceId: command.workspaceId,
      topicId: command.topicId,
      messageId: command.messageId,
      commandId: command.commandId,
      body: command._tag === "edit" ? command.body : null,
      operation: command._tag,
      revisedAt: completedAt,
      preview: command._tag === "edit" ? makeTopicSummaryPreview(command.body) : null,
    });
    return receiptStatus(
      yield* completeSuccess({
        workspaceId: command.workspaceId,
        commandId: command.commandId,
        messageId: result.messageId,
        messageVersion: result.messageVersion,
        completedAt,
      }),
    );
  });

  return MessageCommands.of({
    execute: Effect.fn("PostgresMessageCommands.execute")(function* (command) {
      const result = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const requestFingerprint = fingerprint(command);
            const existingReceipt = yield* findReceiptForUpdate({
              workspaceId: command.workspaceId,
              commandId: command.commandId,
            });
            if (Option.isSome(existingReceipt)) {
              return replay(command, requestFingerprint, existingReceipt.value);
            }

            const actorOption = yield* findActiveActor({
              actorAccountId: command.actorAccountId,
              workspaceId: command.workspaceId,
            });
            if (Option.isNone(actorOption)) {
              return { _tag: "unreceipted-channel-rejection" } as const;
            }
            const now = new Date(yield* Clock.currentTimeMillis);
            const claimed = yield* claimReceipt({
              workspaceId: command.workspaceId,
              commandId: command.commandId,
              actorIdentityId: actorOption.value.actorIdentityId,
              kind: command._tag,
              fingerprint: requestFingerprint,
              channelId: command.channelId,
              topicId: command.topicId,
              messageId: command._tag === "create" ? null : command.messageId,
              createdAt: now,
            });
            if (Option.isSome(claimed)) {
              return yield* executeClaimed(command, actorOption.value.actorIdentityId, now);
            }

            const receipt = yield* findReceiptForUpdate({
              workspaceId: command.workspaceId,
              commandId: command.commandId,
            });
            return Option.isNone(receipt)
              ? undefined
              : replay(command, requestFingerprint, receipt.value);
          }),
        )
        .pipe(
          Effect.tapError((cause) => Effect.logError("MessageCommands.execute", cause)),
          Effect.mapError(
            () => new MessageCommandFailure({ operation: "MessageCommands.execute" }),
          ),
        );

      if (result === undefined) {
        yield* Effect.logError("MessageCommands.execute.pendingReceipt", {
          workspaceId: command.workspaceId,
          commandId: command.commandId,
        });
        return yield* Effect.fail(
          new MessageCommandFailure({ operation: "MessageCommands.execute.pendingReceipt" }),
        );
      }
      if (result._tag === "unreceipted-channel-rejection") {
        return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
      }
      if (result._tag === "conflict") {
        return yield* Effect.fail(new MessageCommandConflict({ commandId: command.commandId }));
      }
      if (result._tag === "rejected") {
        return yield* Effect.fail(rejectionFailure(command, result.rejection));
      }
      return result;
    }),
    status: Effect.fn("PostgresMessageCommands.status")(
      function* (actorAccountId, workspaceId, commandId) {
        const receipt = yield* readStatus({ actorAccountId, workspaceId, commandId });
        return Option.flatMap(receipt, (value) => Option.fromNullishOr(receiptStatus(value)));
      },
      (effect) =>
        effect.pipe(
          Effect.tapError((cause) => Effect.logError("MessageCommands.status", cause)),
          Effect.mapError(() => new MessageCommandFailure({ operation: "MessageCommands.status" })),
        ),
    ),
  });
});

export const PostgresMessageCommands = Layer.effect(MessageCommands, make);
