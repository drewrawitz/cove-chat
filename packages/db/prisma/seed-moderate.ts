import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import {
  MODERATE_ADDITIONAL_CHANNEL_COUNT,
  MODERATE_CHANNEL_COUNT,
  MODERATE_DEFAULT_TOPIC_MESSAGE_COUNT,
  MODERATE_HIGH_MESSAGE_TOPIC_COUNT,
  MODERATE_HIGH_MESSAGE_TOPIC_MESSAGE_COUNT,
  MODERATE_LONG_TOPIC_REPLY_COUNT,
  MODERATE_LONG_TOPIC_MESSAGE_COUNT,
  MODERATE_MESSAGE_COUNT,
  MODERATE_TOPIC_COUNT,
} from "./moderate-fixture.ts";
import { seedConfiguredDatabase, seedDemo } from "./seed.ts";

export * from "./moderate-fixture.ts";

const moderateSeed = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    INSERT INTO channels (
      id,
      workspace_id,
      name,
      purpose,
      visibility,
      maintainer_identity_id,
      created_at
    )
    SELECT
      'moderate-channel-' || lpad(channel_number::text, 2, '0'),
      'demo-workspace',
      CASE
        WHEN channel_number = 1 THEN 'showcase-private'
        ELSE 'showcase-' || lpad(channel_number::text, 2, '0')
      END,
      'Deterministic growth-readiness Channel ' || lpad(channel_number::text, 2, '0') || '.',
      CASE WHEN channel_number = 1 THEN 'private'::"ChannelVisibility" ELSE 'public'::"ChannelVisibility" END,
      'demo-bob-identity',
      timestamptz '2026-01-01T00:00:00Z' + make_interval(mins => channel_number)
    FROM generate_series(1, ${MODERATE_ADDITIONAL_CHANNEL_COUNT}::int) AS channel_number
    ON CONFLICT (workspace_id, id) DO UPDATE
    SET
      name = EXCLUDED.name,
      purpose = EXCLUDED.purpose,
      visibility = EXCLUDED.visibility,
      maintainer_identity_id = EXCLUDED.maintainer_identity_id,
      created_at = EXCLUDED.created_at
  `;
  yield* sql`
    INSERT INTO channel_memberships (workspace_id, channel_id, identity_id, created_at)
    SELECT
      'demo-workspace',
      'moderate-channel-' || lpad(channel_number::text, 2, '0'),
      'demo-bob-identity',
      timestamptz '2026-01-01T00:00:00Z' + make_interval(mins => channel_number)
    FROM generate_series(1, ${MODERATE_ADDITIONAL_CHANNEL_COUNT}::int) AS channel_number
    ON CONFLICT (workspace_id, channel_id, identity_id) DO NOTHING
  `;
  yield* sql`
    WITH fixture_topics AS (
      SELECT
        topic_number,
        CASE
          WHEN topic_number = 1 THEN ${MODERATE_LONG_TOPIC_MESSAGE_COUNT}::int
          WHEN topic_number <= ${MODERATE_HIGH_MESSAGE_TOPIC_COUNT}::int
            THEN ${MODERATE_HIGH_MESSAGE_TOPIC_MESSAGE_COUNT}::int
          ELSE ${MODERATE_DEFAULT_TOPIC_MESSAGE_COUNT}::int
        END AS message_count,
        timestamptz '2026-01-01T00:00:00Z' +
          make_interval(mins => ${MODERATE_TOPIC_COUNT}::int - topic_number) AS topic_created_at
      FROM generate_series(1, ${MODERATE_TOPIC_COUNT}::int) AS topic_number
    )
    INSERT INTO topics (
      id,
      workspace_id,
      channel_id,
      title,
      intent,
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
      'moderate-topic-' || lpad(fixture.topic_number::text, 4, '0'),
      'demo-workspace',
      'general',
      'Growth Topic ' || lpad(fixture.topic_number::text, 4, '0'),
      (
        ARRAY[
          'question'::"TopicIntent",
          'proposal'::"TopicIntent",
          'decision'::"TopicIntent",
          'update'::"TopicIntent",
          'discussion'::"TopicIntent"
        ]
      )[((fixture.topic_number - 1) % 5) + 1],
      'demo-bob-identity',
      fixture.message_count,
      'moderate-message-' || lpad(fixture.topic_number::text, 4, '0') || '-' ||
        lpad(fixture.message_count::text, 4, '0'),
      'Moderate Message ' || lpad(fixture.topic_number::text, 4, '0') || '/' ||
        lpad(fixture.message_count::text, 4, '0'),
      'demo-bob-identity',
      fixture.message_count,
      fixture.topic_created_at + make_interval(secs => fixture.message_count),
      NULL,
      NULL,
      fixture.topic_created_at + make_interval(secs => fixture.message_count),
      fixture.topic_created_at
    FROM fixture_topics AS fixture
    ON CONFLICT (workspace_id, id) DO UPDATE
    SET
      channel_id = EXCLUDED.channel_id,
      title = EXCLUDED.title,
      intent = EXCLUDED.intent,
      opened_by_identity_id = EXCLUDED.opened_by_identity_id,
      message_count = EXCLUDED.message_count,
      latest_message_id = EXCLUDED.latest_message_id,
      latest_message_preview = EXCLUDED.latest_message_preview,
      latest_message_author_identity_id = EXCLUDED.latest_message_author_identity_id,
      latest_message_position = EXCLUDED.latest_message_position,
      latest_message_created_at = EXCLUDED.latest_message_created_at,
      latest_message_edited_at = EXCLUDED.latest_message_edited_at,
      latest_message_deleted_at = EXCLUDED.latest_message_deleted_at,
      last_activity_at = EXCLUDED.last_activity_at,
      created_at = EXCLUDED.created_at
  `;
  yield* sql`
    INSERT INTO messages (
      id,
      workspace_id,
      topic_id,
      author_identity_id,
      body,
      position,
      version,
      produced_by_command_id,
      created_at,
      edited_at,
      deleted_at
    )
    SELECT
      'moderate-message-' || right(topic.id, 4) || '-' ||
        lpad(message_position::text, 4, '0'),
      'demo-workspace',
      topic.id,
      'demo-bob-identity',
      'Moderate Message ' || right(topic.id, 4) || '/' ||
        lpad(message_position::text, 4, '0'),
      message_position,
      1,
      NULL,
      topic.created_at + make_interval(secs => message_position),
      NULL,
      NULL
    FROM topics AS topic
    CROSS JOIN LATERAL generate_series(1, topic.message_count) AS message_position
    WHERE topic.workspace_id = 'demo-workspace'
      AND topic.id LIKE 'moderate-topic-%'
    ON CONFLICT (workspace_id, topic_id, id) DO UPDATE
    SET
      author_identity_id = EXCLUDED.author_identity_id,
      body = EXCLUDED.body,
      position = EXCLUDED.position,
      version = EXCLUDED.version,
      produced_by_command_id = EXCLUDED.produced_by_command_id,
      created_at = EXCLUDED.created_at,
      edited_at = EXCLUDED.edited_at,
      deleted_at = EXCLUDED.deleted_at
  `;
});

const program = seedConfiguredDatabase(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(seedDemo.pipe(Effect.andThen(moderateSeed)));
  }),
);

await Effect.runPromise(program);
console.log(
  `Moderate fixture ready: ${MODERATE_CHANNEL_COUNT} Channels, ${MODERATE_TOPIC_COUNT} Topics in General, ${MODERATE_MESSAGE_COUNT} Messages, ${MODERATE_LONG_TOPIC_REPLY_COUNT} Replies in the longest Topic.`,
);
