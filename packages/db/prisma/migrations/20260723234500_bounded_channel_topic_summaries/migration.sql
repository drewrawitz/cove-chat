ALTER TABLE "topics"
  ADD COLUMN "message_count" INTEGER,
  ADD COLUMN "latest_message_id" TEXT,
  ADD COLUMN "latest_message_preview" TEXT,
  ADD COLUMN "last_activity_at" TIMESTAMPTZ(6);

WITH latest_messages AS (
  SELECT DISTINCT ON (message.workspace_id, message.topic_id)
    message.workspace_id,
    message.topic_id,
    message.id,
    message.body,
    message.deleted_at,
    message.created_at
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
      OR last_activity_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill a Topic without an Opening Brief';
  END IF;
END
$$;

UPDATE topics
SET title = left(
  title,
  (
    SELECT max(character_count)
    FROM generate_series(0, least(char_length(title), 512)) AS character_count
    WHERE octet_length(left(title, character_count)) <= 512
  )
)
WHERE octet_length(title) > 512;

UPDATE channels
SET purpose = left(
  purpose,
  (
    SELECT max(character_count)
    FROM generate_series(0, least(char_length(purpose), 2048)) AS character_count
    WHERE octet_length(left(purpose, character_count)) <= 2048
  )
)
WHERE octet_length(purpose) > 2048;

ALTER TABLE "topics"
  ALTER COLUMN "message_count" SET NOT NULL,
  ALTER COLUMN "latest_message_id" SET NOT NULL,
  ALTER COLUMN "last_activity_at" SET NOT NULL,
  ADD CONSTRAINT "topics_message_count_positive"
    CHECK ("message_count" > 0),
  ADD CONSTRAINT "topics_title_bytes"
    CHECK (octet_length("title") <= 512),
  ADD CONSTRAINT "topics_latest_message_preview_bytes"
    CHECK (
      "latest_message_preview" IS NULL
      OR octet_length("latest_message_preview") <= 512
    );

ALTER TABLE "channels"
  ADD CONSTRAINT "channels_purpose_bytes"
    CHECK (octet_length("purpose") <= 2048);

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_body_bytes"
    CHECK ("body" IS NULL OR octet_length("body") <= 8192)
    NOT VALID;

CREATE TABLE "topic_activity_versions" (
  "id" BIGSERIAL NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "topic_id" TEXT NOT NULL,
  "last_activity_at" TIMESTAMPTZ(6) NOT NULL,
  "valid_from" TIMESTAMPTZ(6) NOT NULL,
  "valid_to" TIMESTAMPTZ(6),
  CONSTRAINT "topic_activity_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "topic_activity_versions_topic_fkey"
    FOREIGN KEY ("workspace_id", "topic_id")
    REFERENCES "topics" ("workspace_id", "id")
    ON DELETE CASCADE
);

INSERT INTO "topic_activity_versions" (
  "workspace_id",
  "channel_id",
  "topic_id",
  "last_activity_at",
  "valid_from"
)
SELECT
  "workspace_id",
  "channel_id",
  "id",
  "last_activity_at",
  CURRENT_TIMESTAMP
FROM "topics";

CREATE UNIQUE INDEX "topic_activity_versions_current_key"
  ON "topic_activity_versions" ("workspace_id", "topic_id")
  WHERE "valid_to" IS NULL;

CREATE INDEX "topic_activity_versions_archive_idx"
  ON "topic_activity_versions" (
    "workspace_id",
    "channel_id",
    "last_activity_at" DESC,
    "topic_id",
    "valid_from",
    "valid_to"
  );

CREATE INDEX "topic_activity_versions_valid_to_idx"
  ON "topic_activity_versions" ("valid_to");

CREATE FUNCTION "maintain_topic_activity_version"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  changed_at TIMESTAMPTZ(6);
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW."workspace_id" || chr(31) || NEW."channel_id",
      0
    )
  );
  changed_at := clock_timestamp();

  IF TG_OP = 'UPDATE' THEN
    UPDATE "topic_activity_versions"
    SET "valid_to" = changed_at
    WHERE "workspace_id" = OLD."workspace_id"
      AND "topic_id" = OLD."id"
      AND "valid_to" IS NULL;
  END IF;

  INSERT INTO "topic_activity_versions" (
    "workspace_id",
    "channel_id",
    "topic_id",
    "last_activity_at",
    "valid_from"
  )
  VALUES (
    NEW."workspace_id",
    NEW."channel_id",
    NEW."id",
    NEW."last_activity_at",
    changed_at
  );

  WITH stale_versions AS (
    SELECT version."id"
    FROM "topic_activity_versions" AS version
    WHERE version."valid_to" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "topic_archive_cursors" AS cursor
        WHERE cursor."workspace_id" = version."workspace_id"
          AND cursor."channel_id" = version."channel_id"
          AND cursor."expires_at" > CURRENT_TIMESTAMP
          AND cursor."snapshot_at" >= version."valid_from"
          AND cursor."snapshot_at" < version."valid_to"
      )
    ORDER BY version."valid_to", version."id"
    LIMIT 100
  )
  DELETE FROM "topic_activity_versions" AS version
  USING stale_versions
  WHERE version."id" = stale_versions."id";

  RETURN NEW;
END
$$;

CREATE TRIGGER "topics_activity_version_insert"
AFTER INSERT ON "topics"
FOR EACH ROW
EXECUTE FUNCTION "maintain_topic_activity_version"();

CREATE TRIGGER "topics_activity_version_update"
AFTER UPDATE OF "last_activity_at" ON "topics"
FOR EACH ROW
WHEN (OLD."last_activity_at" IS DISTINCT FROM NEW."last_activity_at")
EXECUTE FUNCTION "maintain_topic_activity_version"();

CREATE TABLE "topic_archive_cursors" (
  "id" TEXT NOT NULL,
  "snapshot_id" TEXT NOT NULL,
  "page_offset" INTEGER NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "snapshot_at" TIMESTAMPTZ(6) NOT NULL,
  "snapshot_last_activity_at" TIMESTAMPTZ(6) NOT NULL,
  "snapshot_topic_id" TEXT NOT NULL,
  "after_last_activity_at" TIMESTAMPTZ(6) NOT NULL,
  "after_topic_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "topic_archive_cursors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "topic_archive_cursors_snapshot_page_key"
    UNIQUE ("snapshot_id", "page_offset"),
  CONSTRAINT "topic_archive_cursors_page_offset_nonnegative"
    CHECK ("page_offset" >= 0),
  CONSTRAINT "topic_archive_cursors_channel_fkey"
    FOREIGN KEY ("workspace_id", "channel_id")
    REFERENCES "channels" ("workspace_id", "id")
    ON DELETE CASCADE,
  CONSTRAINT "topic_archive_cursors_account_fkey"
    FOREIGN KEY ("account_id")
    REFERENCES "users" ("id")
    ON DELETE CASCADE
);

CREATE INDEX "topic_archive_cursors_expires_at_idx"
  ON "topic_archive_cursors" ("expires_at");

CREATE INDEX "topic_archive_cursors_snapshot_scope_idx"
  ON "topic_archive_cursors" (
    "workspace_id",
    "channel_id",
    "expires_at",
    "snapshot_at"
  );

CREATE INDEX "topics_channel_activity_idx"
  ON "topics" ("workspace_id", "channel_id", "last_activity_at" DESC, "id");
