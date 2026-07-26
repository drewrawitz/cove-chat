import { PgClient } from "@effect/sql-pg";
import { Config, Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { seedDemo } from "./seed.ts";

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
    FROM generate_series(1, 19) AS channel_number
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
    FROM generate_series(1, 19) AS channel_number
    ON CONFLICT (workspace_id, channel_id, identity_id) DO NOTHING
  `;
  yield* sql`
    WITH fixture_topics AS (
      SELECT
        topic_number,
        CASE WHEN topic_number = 1 THEN 1001 WHEN topic_number <= 18 THEN 19 ELSE 18 END AS message_count,
        timestamptz '2026-01-01T00:00:00Z' +
          make_interval(mins => 500 - topic_number) AS topic_created_at
      FROM generate_series(1, 500) AS topic_number
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

const program = Effect.gen(function* () {
  const databaseUrl = yield* Config.redacted("DATABASE_URL");
  const layer = PgClient.layer({ url: databaseUrl });
  yield* Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(seedDemo.pipe(Effect.andThen(moderateSeed)));
  }).pipe(Effect.provide(layer));
});

await Effect.runPromise(program);
console.log(
  "Moderate fixture ready: 20 Channels, 500 Topics in General, 10,000 Messages, 1,000 Replies in the longest Topic.",
);
