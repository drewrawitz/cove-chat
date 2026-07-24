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
  TopicUnavailable,
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
  it.effect("creates and opens a Topic through inherited Channel access", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const topics = yield* TopicAccess;
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

        const detail = yield* topics.getForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
          fixtures.topicId,
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
        const wrongChannel = yield* topics
          .getForActor(
            fixtures.authorAccountId,
            fixtures.workspaceId,
            fixtures.privateChannelId,
            fixtures.topicId,
          )
          .pipe(Effect.flip);

        expect(created.messages).toHaveLength(1);
        expect(detail.messages[0]?.message.body).toBe("Capture the remaining launch risks.");
        expect(createWithoutMembership).toBeInstanceOf(ChannelUnavailable);
        expect(hiddenPrivateChannel).toBeInstanceOf(ChannelUnavailable);
        expect(wrongChannel).toBeInstanceOf(TopicUnavailable);
      }),
    ),
  );

  it.effect("appends concurrent flat Messages in a stable Topic order", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const topics = yield* TopicAccess;
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

        const detail = yield* topics.getForActor(
          fixtures.authorAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
          fixtures.topicId,
        );
        expect(detail.messages.map(({ message }) => message.position)).toEqual([1, 2, 3]);
        expect(detail.messages.slice(1).map(({ message }) => message.body)).toEqual(
          expect.arrayContaining([
            "The release candidate passed smoke testing.",
            "Documentation review is complete.",
          ]),
        );
      }),
    ),
  );

  it.effect("retains edit and deletion revisions while returning a stable tombstone", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const topics = yield* TopicAccess;
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
        const detail = yield* topics.getForActor(
          fixtures.authorAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
          fixtures.topicId,
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
        expect(detail.messages[1]?.message).toMatchObject({
          id: replyId,
          position: 2,
        });
        expect(detail.messages[1]?.message).not.toHaveProperty("body");
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

          const initial = yield* topics.getForActor(
            fixtures.authorAccountId,
            fixtures.workspaceId,
            fixtures.publicChannelId,
            fixtures.topicId,
          );
          expect(initial.topic).toMatchObject({
            messageCount: 1,
            latestMessageId: fixtures.messageId,
            latestMessagePreview: "Capture the remaining launch risks.",
          });

          for (const oversizedUpdate of [
            sql`
              UPDATE topics
              SET title = ${"é".repeat(257)}
              WHERE workspace_id = ${fixtures.workspaceId}
                AND id = ${fixtures.topicId}
            `,
            sql`
              UPDATE topics
              SET latest_message_preview = ${"é".repeat(257)}
              WHERE workspace_id = ${fixtures.workspaceId}
                AND id = ${fixtures.topicId}
            `,
            sql`
              UPDATE channels
              SET purpose = ${"é".repeat(1025)}
              WHERE workspace_id = ${fixtures.workspaceId}
                AND id = ${fixtures.publicChannelId}
            `,
          ]) {
            expect(yield* oversizedUpdate.pipe(Effect.flip)).toBeDefined();
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
          const afterAppend = yield* topics.getForActor(
            fixtures.authorAccountId,
            fixtures.workspaceId,
            fixtures.publicChannelId,
            fixtures.topicId,
          );
          expect(afterAppend.topic).toMatchObject({
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
          const afterEdit = yield* topics.getForActor(
            fixtures.authorAccountId,
            fixtures.workspaceId,
            fixtures.publicChannelId,
            fixtures.topicId,
          );
          expect(afterEdit.topic).toMatchObject({
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
          const afterDelete = yield* topics.getForActor(
            fixtures.authorAccountId,
            fixtures.workspaceId,
            fixtures.publicChannelId,
            fixtures.topicId,
          );
          expect(afterDelete.topic).toMatchObject({
            messageCount: 2,
            latestMessageId: replyId,
            lastActivityAt: appended.message.createdAt,
          });
          expect(afterDelete.topic).not.toHaveProperty("latestMessagePreview");
          expect(afterDelete.messages.at(-1)?.message).toMatchObject({
            id: replyId,
            deletedAt: expect.any(Date),
          });
        }),
      ),
  );

  it.effect("pages Topics after the 500-Topic live window in deterministic stable snapshots", () =>
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
              ${activityAt},
              ${activityAt}
            FROM generate_series(1, 702) AS number
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
            FROM generate_series(1, 702) AS number
          `;

        const first = yield* topics.listArchiveForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
        );
        expect(first.topics).toHaveLength(100);
        expect(first.topics.at(0)?.topic.id).toBe("archive-topic-501");
        expect(first.topics.at(-1)?.topic.id).toBe("archive-topic-600");
        expect(first.nextCursor).toEqual(expect.any(String));

        const [cursorStorage] = yield* sql<{
          readonly cursorCount: number;
          readonly snapshotCount: number;
        }>`
          SELECT
            count(*)::integer AS "cursorCount",
            count(DISTINCT snapshot_id)::integer AS "snapshotCount"
          FROM topic_archive_cursors
          WHERE workspace_id = ${fixtures.workspaceId}
            AND channel_id = ${fixtures.publicChannelId}
            AND account_id = ${fixtures.readerAccountId}
        `;
        expect(cursorStorage).toEqual({ cursorCount: 1, snapshotCount: 1 });

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
              AND id = 'archive-topic-601'
          `;

        const freshVisit = yield* topics.listArchiveForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
        );
        expect(freshVisit.topics.at(0)?.topic.id).toBe("archive-topic-500");

        const second = yield* topics.listArchiveForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
          first.nextCursor,
        );
        expect(second.topics.at(0)?.topic.id).toBe("archive-topic-601");
        expect(second.topics.at(-1)?.topic.id).toBe("archive-topic-700");
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
              LIMIT 500
            ) AS live_topic
            WHERE live_topic.id = 'archive-topic-601'
          ) AS "liveAfterActivity"
        `;
        expect(liveAfterActivity).toBe(true);

        yield* topics.addMessage(
          AddMessageCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: yield* makeTopicId("archive-topic-650"),
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
        expect(repeatedSecond.topics.map(({ topic }) => topic.id)).toEqual(
          second.topics.map(({ topic }) => topic.id),
        );
        expect(repeatedSecond.nextCursor).toBe(second.nextCursor);
        expect(
          second.topics.find(({ topic }) => topic.id === "archive-topic-650")?.topic,
        ).toMatchObject({
          messageCount: 1,
          latestMessageId: "archive-message-650",
        });
        expect(
          repeatedSecond.topics.find(({ topic }) => topic.id === "archive-topic-650")?.topic,
        ).toMatchObject({
          messageCount: 2,
          latestMessagePreview: "Snapshot-visible activity",
        });

        const third = yield* topics.listArchiveForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
          second.nextCursor,
        );
        expect(third.topics.map(({ topic }) => topic.id)).toEqual([
          "archive-topic-701",
          "archive-topic-702",
        ]);
        expect(third.nextCursor).toBeUndefined();

        yield* sql`
          UPDATE topic_archive_cursors
          SET expires_at = ${new Date("2020-01-01T00:00:00.000Z")}
          WHERE workspace_id = ${fixtures.workspaceId}
            AND channel_id = ${fixtures.publicChannelId}
            AND account_id = ${fixtures.readerAccountId}
        `;
        const expiredCursor = yield* topics
          .listArchiveForActor(
            fixtures.readerAccountId,
            fixtures.workspaceId,
            fixtures.publicChannelId,
            first.nextCursor,
          )
          .pipe(Effect.flip);
        expect(expiredCursor).toBeInstanceOf(TopicArchiveCursorInvalid);

        yield* topics.listArchiveForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
        );
        const [{ snapshotCount }] = yield* sql<{ readonly snapshotCount: number }>`
          SELECT count(DISTINCT snapshot_id)::integer AS "snapshotCount"
          FROM topic_archive_cursors
          WHERE workspace_id = ${fixtures.workspaceId}
            AND channel_id = ${fixtures.publicChannelId}
            AND account_id = ${fixtures.readerAccountId}
        `;
        expect(snapshotCount).toBe(1);

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
