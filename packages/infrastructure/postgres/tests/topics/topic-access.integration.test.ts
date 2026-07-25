import { expect, layer } from "@effect/vitest";
import {
  ChannelUnavailable,
  CreateTopicCommand,
  TopicAccess,
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

const ARCHIVE_PAGE_SIZE = 100;
const ARCHIVE_TEST_TOPIC_COUNT = CHANNEL_TOPIC_LIVE_MAXIMUM + ARCHIVE_PAGE_SIZE * 2 + 2;
const archiveTopicId = (position: number) => `archive-topic-${String(position).padStart(3, "0")}`;

layer(TestPostgres, { timeout: "2 minutes" })("PostgreSQL Topic access", (it) => {
  it.effect("persists and reads a versioned Opening Brief at the Topic boundary", () =>
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
        expect(topic).toMatchObject({ id: fixtures.topicId, messageCount: 1 });
        expect(openingBrief?.message).toMatchObject({
          body: "Capture the remaining launch risks.",
          version: 1,
        });
        expect(createWithoutMembership).toBeInstanceOf(ChannelUnavailable);
        expect(hiddenPrivateChannel).toBeInstanceOf(ChannelUnavailable);
        expect(wrongChannel).toBeUndefined();
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

        yield* sql`
          UPDATE topics
          SET last_activity_at = ${new Date("2026-07-23T13:00:00.000Z")}
          WHERE workspace_id = ${fixtures.workspaceId}
            AND id = ${archiveTopicId(
              CHANNEL_TOPIC_LIVE_MAXIMUM + ARCHIVE_PAGE_SIZE + ARCHIVE_PAGE_SIZE / 2,
            )}
        `;
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
