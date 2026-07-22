CREATE TYPE "TopicIntent" AS ENUM (
  'question',
  'proposal',
  'decision',
  'update',
  'discussion'
);

CREATE TABLE "topics" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "intent" "TopicIntent",
  "opened_by_identity_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "topics_pkey" PRIMARY KEY ("workspace_id", "id"),
  CONSTRAINT "topics_title_nonempty" CHECK (
    "title" = btrim("title") AND length("title") > 0
  )
);

CREATE TABLE "contributions" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "topic_id" TEXT NOT NULL,
  "author_identity_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contributions_pkey" PRIMARY KEY ("workspace_id", "topic_id", "id"),
  CONSTRAINT "contributions_body_nonempty" CHECK (
    "body" = btrim("body") AND length("body") > 0
  ),
  CONSTRAINT "contributions_position_positive" CHECK ("position" > 0)
);

CREATE INDEX "topics_workspace_id_channel_id_created_at_idx"
ON "topics" ("workspace_id", "channel_id", "created_at");

CREATE INDEX "topics_workspace_id_opened_by_identity_id_idx"
ON "topics" ("workspace_id", "opened_by_identity_id");

CREATE UNIQUE INDEX "contributions_workspace_id_topic_id_position_key"
ON "contributions" ("workspace_id", "topic_id", "position");

CREATE INDEX "contributions_workspace_id_author_identity_id_idx"
ON "contributions" ("workspace_id", "author_identity_id");

ALTER TABLE "topics"
ADD CONSTRAINT "topics_workspace_id_channel_id_fkey"
FOREIGN KEY ("workspace_id", "channel_id")
REFERENCES "channels" ("workspace_id", "id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "topics"
ADD CONSTRAINT "topics_workspace_id_opened_by_identity_id_fkey"
FOREIGN KEY ("workspace_id", "opened_by_identity_id")
REFERENCES "workspace_identities" ("workspace_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "contributions"
ADD CONSTRAINT "contributions_workspace_id_topic_id_fkey"
FOREIGN KEY ("workspace_id", "topic_id")
REFERENCES "topics" ("workspace_id", "id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "contributions"
ADD CONSTRAINT "contributions_workspace_id_author_identity_id_fkey"
FOREIGN KEY ("workspace_id", "author_identity_id")
REFERENCES "workspace_identities" ("workspace_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
