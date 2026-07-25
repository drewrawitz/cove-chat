import { expect, layer } from "@effect/vitest";
import {
  ChannelUnavailable,
  CreateReplyCommand,
  CreateTopicCommand,
  DeleteMessageCommand,
  EditMessageCommand,
  MessageCommandConflict,
  MessageCommandFailure,
  MessageCommands,
  StaleMessageVersion,
  TopicAccess,
} from "@cove/application";
import {
  MessageBody,
  MessageVersion,
  makeChannelId,
  makeMessageCommandId,
  makeMessageId,
  makeTopicId,
  makeTopicTitle,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { Effect, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/database.ts";

const makeFixtures = Effect.gen(function* () {
  const suffix = randomUUID();
  return {
    workspaceId: yield* makeWorkspaceId(`command-workspace-${suffix}`),
    authorAccountId: yield* makeUserId(`command-author-account-${suffix}`),
    authorIdentityId: yield* makeWorkspaceIdentityId(`command-author-identity-${suffix}`),
    readerAccountId: yield* makeUserId(`command-reader-account-${suffix}`),
    readerIdentityId: yield* makeWorkspaceIdentityId(`command-reader-identity-${suffix}`),
    channelId: yield* makeChannelId(`command-channel-${suffix}`),
    topicId: yield* makeTopicId(`command-topic-${suffix}`),
    openingMessageId: yield* makeMessageId(`command-opening-${suffix}`),
  };
});

type Fixtures = Effect.Success<typeof makeFixtures>;

const seedFixtures = Effect.fn("MessageCommandPostgresTest.seedFixtures")(function* (
  fixtures: Fixtures,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    INSERT INTO users (id, email, display_name)
    VALUES
      (
        ${fixtures.authorAccountId},
        ${`${fixtures.authorAccountId}@example.test`},
        'Command Author'
      ),
      (
        ${fixtures.readerAccountId},
        ${`${fixtures.readerAccountId}@example.test`},
        'Command Reader'
      )
  `;
  yield* sql`
    INSERT INTO workspaces (id, name)
    VALUES (${fixtures.workspaceId}, 'Command Workspace')
  `;
  yield* sql`
    INSERT INTO workspace_identities (id, workspace_id, account_id, name, avatar_url)
    VALUES
      (
        ${fixtures.authorIdentityId},
        ${fixtures.workspaceId},
        ${fixtures.authorAccountId},
        'Command Author',
        '/avatars/author.svg'
      ),
      (
        ${fixtures.readerIdentityId},
        ${fixtures.workspaceId},
        ${fixtures.readerAccountId},
        'Command Reader',
        '/avatars/reader.svg'
      )
  `;
  yield* sql`
    INSERT INTO channels (id, workspace_id, name, purpose, visibility, maintainer_identity_id)
    VALUES (
      ${fixtures.channelId},
      ${fixtures.workspaceId},
      'message-commands',
      'Exercise durable Message commands.',
      'public',
      ${fixtures.authorIdentityId}
    )
  `;
  yield* sql`
    INSERT INTO channel_memberships (workspace_id, channel_id, identity_id)
    VALUES (${fixtures.workspaceId}, ${fixtures.channelId}, ${fixtures.authorIdentityId})
  `;

  const topics = yield* TopicAccess;
  yield* topics.create(
    CreateTopicCommand.make({
      actorAccountId: fixtures.authorAccountId,
      workspaceId: fixtures.workspaceId,
      channelId: fixtures.channelId,
      topicId: fixtures.topicId,
      openingBriefMessageId: fixtures.openingMessageId,
      title: yield* makeTopicTitle("Durable commands"),
      openingBrief: MessageBody.make("Prove every Message command executes at most once."),
    }),
  );
});

const removeFixtures = Effect.fn("MessageCommandPostgresTest.removeFixtures")(function* (
  fixtures: Fixtures,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`DELETE FROM workspaces WHERE id = ${fixtures.workspaceId}`;
  yield* sql`
    DELETE FROM users
    WHERE id = ${fixtures.authorAccountId}
       OR id = ${fixtures.readerAccountId}
  `;
});

const withFixtures = <A, E, R>(use: (fixtures: Fixtures) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    makeFixtures,
    (fixtures) => seedFixtures(fixtures).pipe(Effect.andThen(use(fixtures))),
    removeFixtures,
  );

const createReply = (
  fixtures: Fixtures,
  commandId: CreateReplyCommand["commandId"],
  body = "The release candidate passed smoke testing.",
) =>
  CreateReplyCommand.make({
    actorAccountId: fixtures.authorAccountId,
    workspaceId: fixtures.workspaceId,
    channelId: fixtures.channelId,
    topicId: fixtures.topicId,
    commandId,
    body: MessageBody.make(body),
  });

layer(TestPostgres, { timeout: "2 minutes" })("PostgreSQL Message commands", (it) => {
  it.effect("returns a stored success for a sequential identical retry", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const commands = yield* MessageCommands;
        const sql = yield* SqlClient.SqlClient;
        const commandId = yield* makeMessageCommandId(randomUUID());
        const command = createReply(fixtures, commandId);

        const first = yield* commands.execute(command);
        const retry = yield* commands.execute(command);
        const otherActorStatus = yield* commands.status(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          commandId,
        );
        const rows = yield* sql<{ readonly count: number }>`
          SELECT count(*)::integer AS count
          FROM messages
          WHERE workspace_id = ${fixtures.workspaceId}
            AND topic_id = ${fixtures.topicId}
            AND produced_by_command_id = ${commandId}
        `;
        const receipts = yield* sql<{
          readonly fingerprint: string;
          readonly outcome: string;
        }>`
          SELECT fingerprint, outcome
          FROM message_command_receipts
          WHERE workspace_id = ${fixtures.workspaceId}
            AND command_id = ${commandId}
        `;

        expect(retry).toEqual(first);
        expect(first).toMatchObject({
          _tag: "succeeded",
          commandId,
          kind: "create",
          messageVersion: 1,
        });
        expect(rows).toEqual([{ count: 1 }]);
        expect(Option.isNone(otherActorStatus)).toBe(true);
        expect(receipts).toEqual([
          { fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/), outcome: "succeeded" },
        ]);
      }),
    ),
  );

  it.effect("serializes concurrent identical retries around one mutation", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const commands = yield* MessageCommands;
        const sql = yield* SqlClient.SqlClient;
        const commandId = yield* makeMessageCommandId(randomUUID());
        const command = createReply(fixtures, commandId);

        const outcomes = yield* Effect.all([commands.execute(command), commands.execute(command)], {
          concurrency: "unbounded",
        });
        const counts = yield* sql<{ readonly messages: number; readonly receipts: number }>`
          SELECT
            (
              SELECT count(*)::integer
              FROM messages
              WHERE workspace_id = ${fixtures.workspaceId}
                AND produced_by_command_id = ${commandId}
            ) AS messages,
            (
              SELECT count(*)::integer
              FROM message_command_receipts
              WHERE workspace_id = ${fixtures.workspaceId}
                AND command_id = ${commandId}
            ) AS receipts
        `;

        expect(outcomes[1]).toEqual(outcomes[0]);
        expect(counts).toEqual([{ messages: 1, receipts: 1 }]);
      }),
    ),
  );

  it.effect("rejects semantic reuse without mutating twice", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const commands = yield* MessageCommands;
        const sql = yield* SqlClient.SqlClient;
        const commandId = yield* makeMessageCommandId(randomUUID());
        yield* commands.execute(createReply(fixtures, commandId, "First semantic request."));

        const conflict = yield* commands
          .execute(createReply(fixtures, commandId, "Different semantic request."))
          .pipe(Effect.flip);
        const messages = yield* sql<{ readonly body: string }>`
          SELECT body
          FROM messages
          WHERE workspace_id = ${fixtures.workspaceId}
            AND produced_by_command_id = ${commandId}
        `;

        expect(conflict).toBeInstanceOf(MessageCommandConflict);
        expect(messages).toEqual([{ body: "First semantic request." }]);
      }),
    ),
  );

  it.effect("scopes the same opaque command ID independently to each Workspace", () =>
    withFixtures((firstFixtures) =>
      withFixtures((secondFixtures) =>
        Effect.gen(function* () {
          const commands = yield* MessageCommands;
          const commandId = yield* makeMessageCommandId(randomUUID());

          const [first, second] = yield* Effect.all(
            [
              commands.execute(createReply(firstFixtures, commandId)),
              commands.execute(createReply(secondFixtures, commandId)),
            ],
            { concurrency: "unbounded" },
          );

          expect(first.commandId).toBe(commandId);
          expect(second.commandId).toBe(commandId);
          expect(first.messageId).not.toBe(second.messageId);
        }),
      ),
    ),
  );

  it.effect("keeps an authenticated terminal rejection stable after access changes", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const commands = yield* MessageCommands;
        const sql = yield* SqlClient.SqlClient;
        const commandId = yield* makeMessageCommandId(randomUUID());
        const command = CreateReplyCommand.make({
          ...createReply(fixtures, commandId),
          actorAccountId: fixtures.readerAccountId,
        });

        const rejected = yield* commands.execute(command).pipe(Effect.flip);
        yield* sql`
          INSERT INTO channel_memberships (workspace_id, channel_id, identity_id)
          VALUES (${fixtures.workspaceId}, ${fixtures.channelId}, ${fixtures.readerIdentityId})
        `;
        const retry = yield* commands.execute(command).pipe(Effect.flip);
        const status = yield* commands.status(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          commandId,
        );
        yield* sql`
          UPDATE workspace_identities
          SET membership_ended_at = ${new Date("2026-07-25T12:00:00.000Z")}
          WHERE workspace_id = ${fixtures.workspaceId}
            AND id = ${fixtures.readerIdentityId}
        `;
        const endedMembershipRetry = yield* commands.execute(command).pipe(Effect.flip);
        const endedMembershipStatus = yield* commands.status(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          commandId,
        );

        expect(rejected).toBeInstanceOf(ChannelUnavailable);
        expect(retry).toBeInstanceOf(ChannelUnavailable);
        expect(endedMembershipRetry).toBeInstanceOf(ChannelUnavailable);
        expect(Option.getOrUndefined(status)).toMatchObject({
          _tag: "rejected",
          rejection: "channel_unavailable",
        });
        expect(endedMembershipStatus).toEqual(status);
      }),
    ),
  );

  it.effect("does not claim a command receipt without an active Workspace Identity", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const commands = yield* MessageCommands;
        const sql = yield* SqlClient.SqlClient;
        const commandId = yield* makeMessageCommandId(randomUUID());
        const command = CreateReplyCommand.make({
          ...createReply(fixtures, commandId),
          actorAccountId: fixtures.readerAccountId,
        });
        yield* sql`
          UPDATE workspace_identities
          SET membership_ended_at = ${new Date("2026-07-25T11:00:00.000Z")}
          WHERE workspace_id = ${fixtures.workspaceId}
            AND id = ${fixtures.readerIdentityId}
        `;

        const rejected = yield* commands.execute(command).pipe(Effect.flip);
        const initialStatus = yield* commands.status(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          commandId,
        );

        yield* sql`
          UPDATE workspace_identities
          SET membership_ended_at = NULL
          WHERE workspace_id = ${fixtures.workspaceId}
            AND id = ${fixtures.readerIdentityId}
        `;
        yield* sql`
          INSERT INTO channel_memberships (workspace_id, channel_id, identity_id)
          VALUES (${fixtures.workspaceId}, ${fixtures.channelId}, ${fixtures.readerIdentityId})
        `;
        const retry = yield* commands.execute(command);
        const status = yield* commands.status(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          commandId,
        );

        expect(rejected).toBeInstanceOf(ChannelUnavailable);
        expect(Option.isNone(initialStatus)).toBe(true);
        expect(retry).toMatchObject({ _tag: "succeeded", commandId });
        expect(Option.getOrUndefined(status)).toEqual(retry);
      }),
    ),
  );

  it.effect(
    "rejects stale edits while preserving the committed version and attempted text hash",
    () =>
      withFixtures((fixtures) =>
        Effect.gen(function* () {
          const commands = yield* MessageCommands;
          const sql = yield* SqlClient.SqlClient;
          const create = yield* commands.execute(
            createReply(fixtures, yield* makeMessageCommandId(randomUUID())),
          );
          const firstEdit = EditMessageCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.channelId,
            topicId: fixtures.topicId,
            commandId: yield* makeMessageCommandId(randomUUID()),
            messageId: create.messageId,
            expectedVersion: MessageVersion.make(1),
            body: MessageBody.make("Committed edit."),
          });
          yield* commands.execute(firstEdit);
          const staleCommandId = yield* makeMessageCommandId(randomUUID());
          const stale = yield* commands
            .execute(
              EditMessageCommand.make({
                ...firstEdit,
                commandId: staleCommandId,
                body: MessageBody.make("Retain this stale edit in the browser."),
              }),
            )
            .pipe(Effect.flip);
          const stored = yield* sql<{
            readonly body: string;
            readonly version: number;
            readonly producedByCommandId: string;
          }>`
          SELECT
            body,
            version,
            produced_by_command_id AS "producedByCommandId"
          FROM messages
          WHERE workspace_id = ${fixtures.workspaceId}
            AND topic_id = ${fixtures.topicId}
            AND id = ${create.messageId}
        `;
          const receiptColumns = yield* sql<{ readonly columnName: string }>`
          SELECT column_name AS "columnName"
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'message_command_receipts'
        `;

          expect(stale).toBeInstanceOf(StaleMessageVersion);
          expect(stored).toEqual([
            {
              body: "Committed edit.",
              version: 2,
              producedByCommandId: firstEdit.commandId,
            },
          ]);
          expect(receiptColumns.map(({ columnName }) => columnName)).not.toContain("body");
        }),
      ),
  );

  it.effect("increments edits and tombstones while retaining revisions atomically", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const commands = yield* MessageCommands;
        const sql = yield* SqlClient.SqlClient;
        const created = yield* commands.execute(
          createReply(fixtures, yield* makeMessageCommandId(randomUUID()), "Original reply."),
        );
        const edited = yield* commands.execute(
          EditMessageCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.channelId,
            topicId: fixtures.topicId,
            commandId: yield* makeMessageCommandId(randomUUID()),
            messageId: created.messageId,
            expectedVersion: created.messageVersion,
            body: MessageBody.make("Edited reply."),
          }),
        );
        const deleted = yield* commands.execute(
          DeleteMessageCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.channelId,
            topicId: fixtures.topicId,
            commandId: yield* makeMessageCommandId(randomUUID()),
            messageId: created.messageId,
            expectedVersion: edited.messageVersion,
          }),
        );
        const tombstone = yield* sql<{
          readonly body: string | null;
          readonly version: number;
          readonly producedByCommandId: string;
          readonly deleted: boolean;
        }>`
          SELECT
            body,
            version,
            produced_by_command_id AS "producedByCommandId",
            deleted_at IS NOT NULL AS deleted
          FROM messages
          WHERE workspace_id = ${fixtures.workspaceId}
            AND topic_id = ${fixtures.topicId}
            AND id = ${created.messageId}
        `;
        const revisions = yield* sql<{ readonly body: string; readonly operation: string }>`
          SELECT body, operation
          FROM message_revisions
          WHERE workspace_id = ${fixtures.workspaceId}
            AND topic_id = ${fixtures.topicId}
            AND message_id = ${created.messageId}
          ORDER BY id
        `;

        expect(deleted.messageVersion).toBe(3);
        expect(tombstone).toEqual([
          {
            body: null,
            version: 3,
            producedByCommandId: deleted.commandId,
            deleted: true,
          },
        ]);
        expect(revisions).toEqual([
          { body: "Original reply.", operation: "edit" },
          { body: "Edited reply.", operation: "delete" },
        ]);
      }),
    ),
  );

  it.effect("rolls back edit receipt, revision, Message, and Topic summary together", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const commands = yield* MessageCommands;
        const sql = yield* SqlClient.SqlClient;
        const created = yield* commands.execute(
          createReply(fixtures, yield* makeMessageCommandId(randomUUID()), "Original reply."),
        );
        const editCommandId = yield* makeMessageCommandId(randomUUID());
        const editCommand = EditMessageCommand.make({
          actorAccountId: fixtures.authorAccountId,
          workspaceId: fixtures.workspaceId,
          channelId: fixtures.channelId,
          topicId: fixtures.topicId,
          commandId: editCommandId,
          messageId: created.messageId,
          expectedVersion: created.messageVersion,
          body: MessageBody.make("Edited atomically."),
        });

        yield* sql`
          CREATE FUNCTION fail_edit_command_completion()
          RETURNS trigger
          LANGUAGE plpgsql
          AS $$
          BEGIN
            RAISE EXCEPTION 'simulated edit receipt completion failure';
          END
          $$
        `;
        yield* sql`
          CREATE TRIGGER fail_edit_command_completion
          BEFORE UPDATE ON message_command_receipts
          FOR EACH ROW
          WHEN (NEW.outcome = 'succeeded')
          EXECUTE FUNCTION fail_edit_command_completion()
        `;

        const failed = yield* commands.execute(editCommand).pipe(
          Effect.flip,
          Effect.ensuring(
            Effect.gen(function* () {
              yield* sql`DROP TRIGGER fail_edit_command_completion ON message_command_receipts`;
              yield* sql`DROP FUNCTION fail_edit_command_completion()`;
            }).pipe(Effect.orDie),
          ),
        );
        const rolledBack = yield* sql<{
          readonly body: string;
          readonly version: number;
          readonly producedByCommandId: string;
          readonly preview: string;
          readonly revisions: number;
          readonly receipts: number;
        }>`
          SELECT
            message.body,
            message.version,
            message.produced_by_command_id AS "producedByCommandId",
            topic.latest_message_preview AS preview,
            (
              SELECT count(*)::integer
              FROM message_revisions
              WHERE workspace_id = ${fixtures.workspaceId}
                AND topic_id = ${fixtures.topicId}
                AND message_id = ${created.messageId}
            ) AS revisions,
            (
              SELECT count(*)::integer
              FROM message_command_receipts
              WHERE workspace_id = ${fixtures.workspaceId}
                AND command_id = ${editCommandId}
            ) AS receipts
          FROM messages AS message
          INNER JOIN topics AS topic
            ON topic.workspace_id = message.workspace_id
            AND topic.id = message.topic_id
          WHERE message.workspace_id = ${fixtures.workspaceId}
            AND message.topic_id = ${fixtures.topicId}
            AND message.id = ${created.messageId}
        `;

        const retried = yield* commands.execute(editCommand);
        const committed = yield* sql<{
          readonly body: string;
          readonly version: number;
          readonly producedByCommandId: string;
          readonly preview: string;
          readonly revisions: number;
          readonly outcome: string;
        }>`
          SELECT
            message.body,
            message.version,
            message.produced_by_command_id AS "producedByCommandId",
            topic.latest_message_preview AS preview,
            (
              SELECT count(*)::integer
              FROM message_revisions
              WHERE workspace_id = ${fixtures.workspaceId}
                AND topic_id = ${fixtures.topicId}
                AND message_id = ${created.messageId}
            ) AS revisions,
            receipt.outcome
          FROM messages AS message
          INNER JOIN topics AS topic
            ON topic.workspace_id = message.workspace_id
            AND topic.id = message.topic_id
          INNER JOIN message_command_receipts AS receipt
            ON receipt.workspace_id = message.workspace_id
            AND receipt.command_id = message.produced_by_command_id
          WHERE message.workspace_id = ${fixtures.workspaceId}
            AND message.topic_id = ${fixtures.topicId}
            AND message.id = ${created.messageId}
        `;

        expect(failed).toBeInstanceOf(MessageCommandFailure);
        expect(rolledBack).toEqual([
          {
            body: "Original reply.",
            version: 1,
            producedByCommandId: created.commandId,
            preview: "Original reply.",
            revisions: 0,
            receipts: 0,
          },
        ]);
        expect(retried).toMatchObject({
          commandId: editCommandId,
          messageId: created.messageId,
          messageVersion: 2,
        });
        expect(committed).toEqual([
          {
            body: "Edited atomically.",
            version: 2,
            producedByCommandId: editCommandId,
            preview: "Edited atomically.",
            revisions: 1,
            outcome: "succeeded",
          },
        ]);
      }),
    ),
  );

  it.effect("rolls back a failed receipt completion and permits an explicit retry once", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const commands = yield* MessageCommands;
        const sql = yield* SqlClient.SqlClient;
        const commandId = yield* makeMessageCommandId(randomUUID());
        const command = createReply(fixtures, commandId);

        yield* sql`
          CREATE FUNCTION fail_message_command_completion()
          RETURNS trigger
          LANGUAGE plpgsql
          AS $$
          BEGIN
            RAISE EXCEPTION 'simulated receipt completion failure';
          END
          $$
        `;
        yield* sql`
          CREATE TRIGGER fail_message_command_completion
          BEFORE UPDATE ON message_command_receipts
          FOR EACH ROW
          WHEN (NEW.outcome = 'succeeded')
          EXECUTE FUNCTION fail_message_command_completion()
        `;

        const failed = yield* commands.execute(command).pipe(
          Effect.flip,
          Effect.ensuring(
            Effect.gen(function* () {
              yield* sql`DROP TRIGGER fail_message_command_completion ON message_command_receipts`;
              yield* sql`DROP FUNCTION fail_message_command_completion()`;
            }).pipe(Effect.orDie),
          ),
        );
        const afterFailure = yield* sql<{
          readonly messages: number;
          readonly receipts: number;
        }>`
          SELECT
            (
              SELECT count(*)::integer
              FROM messages
              WHERE workspace_id = ${fixtures.workspaceId}
                AND produced_by_command_id = ${commandId}
            ) AS messages,
            (
              SELECT count(*)::integer
              FROM message_command_receipts
              WHERE workspace_id = ${fixtures.workspaceId}
                AND command_id = ${commandId}
            ) AS receipts
        `;

        const retried = yield* commands.execute(command);
        const afterRetry = yield* sql<{ readonly messages: number; readonly receipts: number }>`
          SELECT
            (
              SELECT count(*)::integer
              FROM messages
              WHERE workspace_id = ${fixtures.workspaceId}
                AND produced_by_command_id = ${commandId}
            ) AS messages,
            (
              SELECT count(*)::integer
              FROM message_command_receipts
              WHERE workspace_id = ${fixtures.workspaceId}
                AND command_id = ${commandId}
            ) AS receipts
        `;

        expect(failed).toBeInstanceOf(MessageCommandFailure);
        expect(afterFailure).toEqual([{ messages: 0, receipts: 0 }]);
        expect(retried).toMatchObject({ _tag: "succeeded", commandId });
        expect(afterRetry).toEqual([{ messages: 1, receipts: 1 }]);
      }),
    ),
  );
});
