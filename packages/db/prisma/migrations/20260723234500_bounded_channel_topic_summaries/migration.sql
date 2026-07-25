DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM topics
    WHERE octet_length(title) > 512
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce the 512-byte Topic title limit while oversized titles exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM channels
    WHERE octet_length(purpose) > 2048
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce the 2048-byte Channel purpose limit while oversized purposes exist';
  END IF;
END
$$;

ALTER TABLE "topics"
  ADD COLUMN "message_count" INTEGER,
  ADD COLUMN "latest_message_id" TEXT,
  ADD COLUMN "latest_message_preview" TEXT,
  ADD COLUMN "latest_message_author_identity_id" TEXT,
  ADD COLUMN "latest_message_position" INTEGER,
  ADD COLUMN "latest_message_created_at" TIMESTAMPTZ(6),
  ADD COLUMN "latest_message_edited_at" TIMESTAMPTZ(6),
  ADD COLUMN "latest_message_deleted_at" TIMESTAMPTZ(6),
  ADD COLUMN "last_activity_at" TIMESTAMPTZ(6);

WITH latest_messages AS (
  SELECT DISTINCT ON (message.workspace_id, message.topic_id)
    message.workspace_id,
    message.topic_id,
    message.id,
    message.author_identity_id,
    message.body,
    message.position,
    message.created_at,
    message.edited_at,
    message.deleted_at
  FROM messages AS message
  ORDER BY
    message.workspace_id,
    message.topic_id,
    message.position DESC,
    message.id
),
message_counts AS (
  SELECT
    message.workspace_id,
    message.topic_id,
    count(*)::integer AS message_count
  FROM messages AS message
  GROUP BY message.workspace_id, message.topic_id
)
UPDATE topics AS topic
SET
  message_count = message_counts.message_count,
  latest_message_id = latest_messages.id,
  latest_message_preview = CASE
    WHEN latest_messages.deleted_at IS NOT NULL OR latest_messages.body IS NULL THEN NULL
    ELSE left(
      latest_messages.body,
      (
        SELECT max(character_count)
        FROM generate_series(
          0,
          least(char_length(latest_messages.body), 512)
        ) AS character_count
        WHERE octet_length(left(latest_messages.body, character_count)) <= 512
      )
    )
  END,
  latest_message_author_identity_id = latest_messages.author_identity_id,
  latest_message_position = latest_messages.position,
  latest_message_created_at = latest_messages.created_at,
  latest_message_edited_at = latest_messages.edited_at,
  latest_message_deleted_at = latest_messages.deleted_at,
  last_activity_at = latest_messages.created_at
FROM latest_messages, message_counts
WHERE latest_messages.workspace_id = topic.workspace_id
  AND latest_messages.topic_id = topic.id
  AND message_counts.workspace_id = topic.workspace_id
  AND message_counts.topic_id = topic.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM topics
    WHERE message_count IS NULL
      OR latest_message_id IS NULL
      OR latest_message_author_identity_id IS NULL
      OR latest_message_position IS NULL
      OR latest_message_created_at IS NULL
      OR last_activity_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill a Topic without an Opening Brief';
  END IF;
END
$$;

ALTER TABLE "topics"
  ALTER COLUMN "message_count" SET NOT NULL,
  ALTER COLUMN "latest_message_id" SET NOT NULL,
  ALTER COLUMN "latest_message_author_identity_id" SET NOT NULL,
  ALTER COLUMN "latest_message_position" SET NOT NULL,
  ALTER COLUMN "latest_message_created_at" SET NOT NULL,
  ALTER COLUMN "last_activity_at" SET NOT NULL,
  ADD CONSTRAINT "topics_message_count_positive"
    CHECK ("message_count" > 0),
  ADD CONSTRAINT "topics_latest_message_position_positive"
    CHECK ("latest_message_position" > 0),
  ADD CONSTRAINT "topics_title_bytes"
    CHECK (octet_length("title") <= 512),
  ADD CONSTRAINT "topics_latest_message_preview_bytes"
    CHECK (
      "latest_message_preview" IS NULL
      OR octet_length("latest_message_preview") <= 512
    ),
  ADD CONSTRAINT "topics_latest_message_author_fkey"
    FOREIGN KEY ("workspace_id", "latest_message_author_identity_id")
    REFERENCES "workspace_identities" ("workspace_id", "id")
    ON DELETE RESTRICT;

ALTER TABLE "channels"
  ADD CONSTRAINT "channels_purpose_bytes"
    CHECK (octet_length("purpose") <= 2048);

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_body_bytes"
    CHECK ("body" IS NULL OR octet_length("body") <= 8192)
    NOT VALID;

CREATE INDEX "topics_channel_activity_idx"
  ON "topics" ("workspace_id", "channel_id", "last_activity_at" DESC, "id");

CREATE INDEX "topics_latest_message_author_idx"
  ON "topics" ("workspace_id", "latest_message_author_identity_id");
