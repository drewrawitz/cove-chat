import { expect, layer } from "@effect/vitest";
import {
  AddMessageCommand,
  ChannelUnavailable,
  CreateTopicCommand,
  DeleteMessageCommand,
  EditMessageCommand,
  TopicAccess,
  TopicAccessFailure,
  TopicArchiveCursorInvalid,
} from "@cove/application";
import {
  MessageBody,
  makeChannelId,
  makeMessageId,
  makeTopicId,
  makeTopicTitle,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { TopicRepository } from "@cove/ports";
import { CHANNEL_TOPIC_LIVE_MAXIMUM } from "@cove/sync";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/database.ts";

const makeFixtures = Effect.gen(function* () {
  const suffix = randomUUID();
  return {
    workspaceId: yield* makeWorkspaceId(`topic-workspace-${suffix}`),
    authorAccountId: yield* makeUserId(`topic-author-account-${suffix}`),
    authorIdentityId: yield* makeWorkspaceIdentityId(`topic-author-identity-${suffix}`),
    readerAccountId: yield* makeUserId(`topic-reader-account-${suffix}`),
    readerIdentityId: yield* makeWorkspaceIdentityId(`topic-reader-identity-${suffix}`),
    publicChannelId: yield* makeChannelId(`topic-public-${suffix}`),
    privateChannelId: yield* makeChannelId(`topic-private-${suffix}`),
    topicId: yield* makeTopicId(`topic-${suffix}`),
    messageId: yield* makeMessageId(`opening-brief-${suffix}`),
  };
});

const ARCHIVE_PAGE_SIZE = 100;
const ARCHIVE_TEST_TOPIC_COUNT = CHANNEL_TOPIC_LIVE_MAXIMUM + ARCHIVE_PAGE_SIZE * 2 + 2;
const archiveTopicId = (position: number) => `archive-topic-${String(position).padStart(3, "0")}`;

type Fixtures = Effect.Success<typeof makeFixtures>;

const seedFixtures = Effect.fn("TopicPostgresTest.seedFixtures")(function* (fixtures: Fixtures) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    INSERT INTO users (id, email, display_name)
    VALUES
      (${fixtures.authorAccountId}, ${`${fixtures.authorAccountId}@example.test`}, 'Topic Author'),
      (${fixtures.readerAccountId}, ${`${fixtures.readerAccountId}@example.test`}, 'Topic Reader')
  `;
  yield* sql`
    INSERT INTO workspaces (id, name)
    VALUES (${fixtures.workspaceId}, 'Topic Workspace')
  `;
  yield* sql`
    INSERT INTO workspace_identities (id, workspace_id, account_id, name, avatar_url)
    VALUES
      (${fixtures.authorIdentityId}, ${fixtures.workspaceId}, ${fixtures.authorAccountId}, 'Topic Author', '/avatars/author.svg'),
      (${fixtures.readerIdentityId}, ${fixtures.workspaceId}, ${fixtures.readerAccountId}, 'Topic Reader', '/avatars/reader.svg')
  `;
  yield* sql`
    INSERT INTO channels (id, workspace_id, name, purpose, visibility, maintainer_identity_id)
    VALUES
      (${fixtures.publicChannelId}, ${fixtures.workspaceId}, 'public-topics', 'Coordinate visible topics.', 'public', ${fixtures.authorIdentityId}),
      (${fixtures.privateChannelId}, ${fixtures.workspaceId}, 'private-topics', 'Coordinate private topics.', 'private', ${fixtures.authorIdentityId})
  `;
  yield* sql`
    INSERT INTO channel_memberships (workspace_id, channel_id, identity_id)
    VALUES
      (${fixtures.workspaceId}, ${fixtures.publicChannelId}, ${fixtures.authorIdentityId}),
      (${fixtures.workspaceId}, ${fixtures.privateChannelId}, ${fixtures.authorIdentityId})
  `;
});

const removeFixtures = Effect.fn("TopicPostgresTest.removeFixtures")(function* (
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

layer(TestPostgres, { timeout: "2 minutes" })("PostgreSQL Topic access", (it) => {
  it.effect("uses bounded Topic metadata and single-Message persistence lookups", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const topics = yield* TopicAccess;
        const repository = yield* TopicRepository;
        const created = yield* topics.create(
          CreateTopicCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            openingBriefMessageId: fixtures.messageId,
            title: yield* makeTopicTitle("Release readiness"),
            openingBrief: MessageBody.make("Capture the remaining launch risks."),
            intent: "question",
          }),
        );
        yield* topics.addMessage(
          AddMessageCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            messageId: yield* makeMessageId(`latest-${fixtures.messageId}`),
            body: MessageBody.make("The release candidate passed smoke testing."),
          }),
        );

        const topic = yield* repository.findTopicById(
          fixtures.workspaceId,
          fixtures.publicChannelId,
          fixtures.topicId,
        );
        const openingBrief = yield* repository.findMessageById(
          fixtures.workspaceId,
          fixtures.topicId,
          fixtures.messageId,
        );
        const createWithoutMembership = yield* topics
          .create(
            CreateTopicCommand.make({
              actorAccountId: fixtures.readerAccountId,
              workspaceId: fixtures.workspaceId,
              channelId: fixtures.publicChannelId,
              topicId: yield* makeTopicId(`reader-${fixtures.topicId}`),
              openingBriefMessageId: yield* makeMessageId(`reader-${fixtures.messageId}`),
              title: yield* makeTopicTitle("Reader topic"),
              openingBrief: MessageBody.make("This should not be persisted."),
            }),
          )
          .pipe(Effect.flip);
        const hiddenPrivateChannel = yield* topics
          .listArchiveForActor(
            fixtures.readerAccountId,
            fixtures.workspaceId,
            fixtures.privateChannelId,
          )
          .pipe(Effect.flip);
        const wrongChannel = yield* repository.findTopicById(
          fixtures.workspaceId,
          fixtures.privateChannelId,
          fixtures.topicId,
        );

        expect(created.messages).toHaveLength(1);
        expect(topic).toMatchObject({ id: fixtures.topicId, messageCount: 2 });
        expect(openingBrief?.message.body).toBe("Capture the remaining launch risks.");
        expect(createWithoutMembership).toBeInstanceOf(ChannelUnavailable);
        expect(hiddenPrivateChannel).toBeInstanceOf(ChannelUnavailable);
        expect(wrongChannel).toBeUndefined();
      }),
    ),
  );

  it.effect("appends concurrent flat Messages in a stable Topic order", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const topics = yield* TopicAccess;
        const repository = yield* TopicRepository;
        yield* topics.create(
          CreateTopicCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            openingBriefMessageId: fixtures.messageId,
            title: yield* makeTopicTitle("Release readiness"),
            openingBrief: MessageBody.make("Capture the remaining launch risks."),
          }),
        );
        const firstReplyId = yield* makeMessageId(`first-${fixtures.messageId}`);
        const secondReplyId = yield* makeMessageId(`second-${fixtures.messageId}`);

        yield* Effect.all(
          [
            topics.addMessage(
              AddMessageCommand.make({
                actorAccountId: fixtures.authorAccountId,
                workspaceId: fixtures.workspaceId,
                channelId: fixtures.publicChannelId,
                topicId: fixtures.topicId,
                messageId: firstReplyId,
                body: MessageBody.make("The release candidate passed smoke testing."),
              }),
            ),
            topics.addMessage(
              AddMessageCommand.make({
                actorAccountId: fixtures.authorAccountId,
                workspaceId: fixtures.workspaceId,
                channelId: fixtures.publicChannelId,
                topicId: fixtures.topicId,
                messageId: secondReplyId,
                body: MessageBody.make("Documentation review is complete."),
              }),
            ),
          ],
          { concurrency: "unbounded" },
        );

        const messages = yield* Effect.all([
          repository.findMessageById(fixtures.workspaceId, fixtures.topicId, fixtures.messageId),
          repository.findMessageById(fixtures.workspaceId, fixtures.topicId, firstReplyId),
          repository.findMessageById(fixtures.workspaceId, fixtures.topicId, secondReplyId),
        ]);
        expect(
          messages
            .flatMap((record) => (record === undefined ? [] : [record.message]))
            .map(({ position }) => position)
            .sort((left, right) => left - right),
        ).toEqual([1, 2, 3]);
        expect(
          messages
            .flatMap((record) => (record?.message.body === undefined ? [] : [record.message.body]))
            .slice(1),
        ).toEqual(
          expect.arrayContaining([
            "The release candidate passed smoke testing.",
            "Documentation review is complete.",
          ]),
        );
      }),
    ),
  );

  it.effect("keeps Topic activity monotonic across out-of-order append timestamps", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const topics = yield* TopicAccess;
        const repository = yield* TopicRepository;
        yield* topics.create(
          CreateTopicCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            openingBriefMessageId: fixtures.messageId,
            title: yield* makeTopicTitle("Monotonic activity"),
            openingBrief: MessageBody.make("Capture append ordering."),
          }),
        );
        const newerActivity = new Date("2026-07-24T12:05:00.000Z");
        const olderActivity = new Date("2026-07-24T12:04:00.000Z");
        const newerMessageId = yield* makeMessageId(`newer-${fixtures.messageId}`);
        const olderMessageId = yield* makeMessageId(`older-${fixtures.messageId}`);

        yield* repository.appendMessage({
          id: newerMessageId,
          workspaceId: fixtures.workspaceId,
          topicId: fixtures.topicId,
          authorIdentityId: fixtures.authorIdentityId,
          body: MessageBody.make("Captured later."),
          createdAt: newerActivity,
        });
        yield* repository.appendMessage({
          id: olderMessageId,
          workspaceId: fixtures.workspaceId,
          topicId: fixtures.topicId,
          authorIdentityId: fixtures.authorIdentityId,
          body: MessageBody.make("Committed later with an earlier timestamp."),
          createdAt: olderActivity,
        });

        const topic = yield* repository.findTopicById(
          fixtures.workspaceId,
          fixtures.publicChannelId,
          fixtures.topicId,
        );
        expect(topic).toMatchObject({
          latestMessageId: olderMessageId,
          latestMessagePosition: 3,
          latestMessageCreatedAt: olderActivity,
          lastActivityAt: newerActivity,
        });
      }),
    ),
  );

  it.effect("retains edit and deletion revisions while returning a stable tombstone", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const topics = yield* TopicAccess;
        const repository = yield* TopicRepository;
        const sql = yield* SqlClient.SqlClient;
        yield* topics.create(
          CreateTopicCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            openingBriefMessageId: fixtures.messageId,
            title: yield* makeTopicTitle("Release readiness"),
            openingBrief: MessageBody.make("Capture the remaining launch risks."),
          }),
        );
        const replyId = yield* makeMessageId(`reply-${fixtures.messageId}`);
        yield* topics.addMessage(
          AddMessageCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            messageId: replyId,
            body: MessageBody.make("The release candidate passed smoke testng."),
          }),
        );
        const edited = yield* topics.editMessage(
          EditMessageCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            messageId: replyId,
            body: MessageBody.make("The release candidate passed smoke testing."),
          }),
        );
        const deleted = yield* topics.deleteMessage(
          DeleteMessageCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            messageId: replyId,
          }),
        );
        const stored = yield* repository.findMessageById(
          fixtures.workspaceId,
          fixtures.topicId,
          replyId,
        );
        const revisions = yield* sql<{ readonly body: string; readonly operation: string }>`
          SELECT body, operation
          FROM message_revisions
          WHERE workspace_id = ${fixtures.workspaceId}
            AND message_id = ${replyId}
          ORDER BY id
        `;

        expect(edited.message.editedAt).toBeInstanceOf(Date);
        expect(deleted.message).toMatchObject({ id: replyId, position: 2 });
        expect(deleted.message).not.toHaveProperty("body");
        expect(stored?.message).toMatchObject({
          id: replyId,
          position: 2,
        });
        expect(stored?.message).not.toHaveProperty("body");
        expect(revisions).toEqual([
          { body: "The release candidate passed smoke testng.", operation: "edit" },
          { body: "The release candidate passed smoke testing.", operation: "delete" },
        ]);
      }),
    ),
  );

  it.effect(
    "maintains the bounded latest-Message projection atomically without reordering edits or deletions",
    () =>
      withFixtures((fixtures) =>
        Effect.gen(function* () {
          const topics = yield* TopicAccess;
          const repository = yield* TopicRepository;
          const sql = yield* SqlClient.SqlClient;
          yield* topics.create(
            CreateTopicCommand.make({
              actorAccountId: fixtures.authorAccountId,
              workspaceId: fixtures.workspaceId,
              channelId: fixtures.publicChannelId,
              topicId: fixtures.topicId,
              openingBriefMessageId: fixtures.messageId,
              title: yield* makeTopicTitle("Release readiness"),
              openingBrief: MessageBody.make("Capture the remaining launch risks."),
            }),
          );

          const initial = yield* repository.findTopicById(
            fixtures.workspaceId,
            fixtures.publicChannelId,
            fixtures.topicId,
          );
          expect(initial).toMatchObject({
            messageCount: 1,
            latestMessageId: fixtures.messageId,
            latestMessagePreview: "Capture the remaining launch risks.",
          });

          for (const { statement, constraint } of [
            {
              statement: sql`
                UPDATE topics
                SET title = ${"é".repeat(257)}
                WHERE workspace_id = ${fixtures.workspaceId}
                  AND id = ${fixtures.topicId}
              `,
              constraint: "topics_title_bytes",
            },
            {
              statement: sql`
                UPDATE topics
                SET latest_message_preview = ${"é".repeat(257)}
                WHERE workspace_id = ${fixtures.workspaceId}
                  AND id = ${fixtures.topicId}
              `,
              constraint: "topics_latest_message_preview_bytes",
            },
            {
              statement: sql`
                UPDATE channels
                SET purpose = ${"é".repeat(1025)}
                WHERE workspace_id = ${fixtures.workspaceId}
                  AND id = ${fixtures.publicChannelId}
              `,
              constraint: "channels_purpose_bytes",
            },
          ]) {
            expect(yield* statement.pipe(Effect.flip)).toMatchObject({
              reason: {
                _tag: "ConstraintError",
                cause: { constraint },
              },
            });
          }

          const replyId = yield* makeMessageId(`reply-${fixtures.messageId}`);
          const appended = yield* topics.addMessage(
            AddMessageCommand.make({
              actorAccountId: fixtures.authorAccountId,
              workspaceId: fixtures.workspaceId,
              channelId: fixtures.publicChannelId,
              topicId: fixtures.topicId,
              messageId: replyId,
              body: MessageBody.make("🙂".repeat(129)),
            }),
          );
          const afterAppend = yield* repository.findTopicById(
            fixtures.workspaceId,
            fixtures.publicChannelId,
            fixtures.topicId,
          );
          expect(afterAppend).toMatchObject({
            messageCount: 2,
            latestMessageId: replyId,
            latestMessagePreview: "🙂".repeat(128),
            lastActivityAt: appended.message.createdAt,
          });

          const duplicate = yield* topics
            .addMessage(
              AddMessageCommand.make({
                actorAccountId: fixtures.authorAccountId,
                workspaceId: fixtures.workspaceId,
                channelId: fixtures.publicChannelId,
                topicId: fixtures.topicId,
                messageId: replyId,
                body: MessageBody.make("This append must roll back."),
              }),
            )
            .pipe(Effect.flip);
          expect(duplicate).toBeInstanceOf(TopicAccessFailure);

          yield* topics.editMessage(
            EditMessageCommand.make({
              actorAccountId: fixtures.authorAccountId,
              workspaceId: fixtures.workspaceId,
              channelId: fixtures.publicChannelId,
              topicId: fixtures.topicId,
              messageId: replyId,
              body: MessageBody.make("é".repeat(300)),
            }),
          );
          const afterEdit = yield* repository.findTopicById(
            fixtures.workspaceId,
            fixtures.publicChannelId,
            fixtures.topicId,
          );
          expect(afterEdit).toMatchObject({
            messageCount: 2,
            latestMessageId: replyId,
            latestMessagePreview: "é".repeat(256),
            lastActivityAt: appended.message.createdAt,
          });

          yield* topics.deleteMessage(
            DeleteMessageCommand.make({
              actorAccountId: fixtures.authorAccountId,
              workspaceId: fixtures.workspaceId,
              channelId: fixtures.publicChannelId,
              topicId: fixtures.topicId,
              messageId: replyId,
            }),
          );
          const afterDelete = yield* repository.findTopicById(
            fixtures.workspaceId,
            fixtures.publicChannelId,
            fixtures.topicId,
          );
          const deletedMessage = yield* repository.findMessageById(
            fixtures.workspaceId,
            fixtures.topicId,
            replyId,
          );
          expect(afterDelete).toMatchObject({
            messageCount: 2,
            latestMessageId: replyId,
            lastActivityAt: appended.message.createdAt,
          });
          expect(afterDelete).not.toHaveProperty("latestMessagePreview");
          expect(deletedMessage?.message).toMatchObject({
            id: replyId,
            deletedAt: expect.any(Date),
          });
        }),
      ),
  );

  it.effect("pages Topics after the live window with scope-bound stateless keysets", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const topics = yield* TopicAccess;
        const sql = yield* SqlClient.SqlClient;
        const activityAt = new Date("2026-07-22T12:00:00.000Z");

        yield* sql`
            INSERT INTO topics (
              id,
              workspace_id,
              channel_id,
              title,
              opened_by_identity_id,
              message_count,
              latest_message_id,
              latest_message_preview,
              latest_message_author_identity_id,
              latest_message_position,
              latest_message_created_at,
              latest_message_edited_at,
              latest_message_deleted_at,
              last_activity_at,
              created_at
            )
            SELECT
              'archive-topic-' || lpad(number::text, 3, '0'),
              ${fixtures.workspaceId},
              ${fixtures.publicChannelId},
              'Archive Topic ' || lpad(number::text, 3, '0'),
              ${fixtures.authorIdentityId},
              1,
              'archive-message-' || lpad(number::text, 3, '0'),
              'Archived summary ' || lpad(number::text, 3, '0'),
              ${fixtures.authorIdentityId},
              1,
              ${activityAt},
              NULL,
              NULL,
              ${activityAt},
              ${activityAt}
            FROM generate_series(1, ${ARCHIVE_TEST_TOPIC_COUNT}) AS number
          `;
        yield* sql`
            INSERT INTO messages (
              id,
              workspace_id,
              topic_id,
              author_identity_id,
              body,
              position,
              created_at
            )
            SELECT
              'archive-message-' || lpad(number::text, 3, '0'),
              ${fixtures.workspaceId},
              'archive-topic-' || lpad(number::text, 3, '0'),
              ${fixtures.authorIdentityId},
              'Archived summary ' || lpad(number::text, 3, '0'),
              1,
              ${activityAt}
            FROM generate_series(1, ${ARCHIVE_TEST_TOPIC_COUNT}) AS number
          `;

        const first = yield* topics.listArchiveForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
        );
        expect(first.topics).toHaveLength(ARCHIVE_PAGE_SIZE);
        expect(first.topics.at(0)?.topic.id).toBe(archiveTopicId(CHANNEL_TOPIC_LIVE_MAXIMUM + 1));
        expect(first.topics.at(-1)?.topic.id).toBe(
          archiveTopicId(CHANNEL_TOPIC_LIVE_MAXIMUM + ARCHIVE_PAGE_SIZE),
        );
        expect(first.nextCursor).toEqual(expect.any(String));

        const crossActorCursor = yield* topics
          .listArchiveForActor(
            fixtures.authorAccountId,
            fixtures.workspaceId,
            fixtures.publicChannelId,
            first.nextCursor,
          )
          .pipe(Effect.flip);
        expect(crossActorCursor).toBeInstanceOf(TopicArchiveCursorInvalid);

        yield* sql`
            UPDATE topics
            SET last_activity_at = ${new Date("2026-07-23T12:00:00.000Z")}
            WHERE workspace_id = ${fixtures.workspaceId}
              AND id = ${archiveTopicId(CHANNEL_TOPIC_LIVE_MAXIMUM + ARCHIVE_PAGE_SIZE + 1)}
          `;

        const freshVisit = yield* topics.listArchiveForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
        );
        expect(freshVisit.topics.at(0)?.topic.id).toBe(archiveTopicId(CHANNEL_TOPIC_LIVE_MAXIMUM));

        const second = yield* topics.listArchiveForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
          first.nextCursor,
        );
        expect(second.topics.at(0)?.topic.id).toBe(
          archiveTopicId(CHANNEL_TOPIC_LIVE_MAXIMUM + ARCHIVE_PAGE_SIZE + 2),
        );
        expect(second.topics.at(-1)?.topic.id).toBe(
          archiveTopicId(CHANNEL_TOPIC_LIVE_MAXIMUM + ARCHIVE_PAGE_SIZE * 2 + 1),
        );
        expect(second.nextCursor).toEqual(expect.any(String));
        const [{ liveAfterActivity }] = yield* sql<{ readonly liveAfterActivity: boolean }>`
          SELECT EXISTS (
            SELECT 1
            FROM (
              SELECT id
              FROM topics
              WHERE workspace_id = ${fixtures.workspaceId}
                AND channel_id = ${fixtures.publicChannelId}
              ORDER BY last_activity_at DESC, id
              LIMIT ${CHANNEL_TOPIC_LIVE_MAXIMUM}
            ) AS live_topic
            WHERE live_topic.id = ${archiveTopicId(
              CHANNEL_TOPIC_LIVE_MAXIMUM + ARCHIVE_PAGE_SIZE + 1,
            )}
          ) AS "liveAfterActivity"
        `;
        expect(liveAfterActivity).toBe(true);

        yield* topics.addMessage(
          AddMessageCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: yield* makeTopicId(
              archiveTopicId(
                CHANNEL_TOPIC_LIVE_MAXIMUM + ARCHIVE_PAGE_SIZE + ARCHIVE_PAGE_SIZE / 2,
              ),
            ),
            messageId: yield* makeMessageId(`archive-activity-${randomUUID()}`),
            body: MessageBody.make("Snapshot-visible activity"),
          }),
        );
        const repeatedSecond = yield* topics.listArchiveForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
          first.nextCursor,
        );
        expect(repeatedSecond.topics.map(({ topic }) => topic.id)).not.toContain(
          archiveTopicId(CHANNEL_TOPIC_LIVE_MAXIMUM + ARCHIVE_PAGE_SIZE + ARCHIVE_PAGE_SIZE / 2),
        );
        expect(repeatedSecond.topics.at(-1)?.topic.id).toBe(
          archiveTopicId(ARCHIVE_TEST_TOPIC_COUNT),
        );
        expect(repeatedSecond.nextCursor).toBeUndefined();

        const third = yield* topics.listArchiveForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
          second.nextCursor,
        );
        expect(third.topics.map(({ topic }) => topic.id)).toEqual([
          archiveTopicId(ARCHIVE_TEST_TOPIC_COUNT),
        ]);
        expect(third.nextCursor).toBeUndefined();
        const traversedTopicIds = [...first.topics, ...second.topics, ...third.topics].map(
          ({ topic }) => topic.id,
        );
        expect(new Set(traversedTopicIds).size).toBe(traversedTopicIds.length);

        const invalidCursor = yield* topics
          .listArchiveForActor(
            fixtures.readerAccountId,
            fixtures.workspaceId,
            fixtures.publicChannelId,
            "not-a-cursor",
          )
          .pipe(Effect.flip);
        expect(invalidCursor).toBeInstanceOf(TopicArchiveCursorInvalid);
      }),
    ),
  );
});
