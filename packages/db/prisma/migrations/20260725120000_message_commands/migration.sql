CREATE TYPE "MessageCommandKind" AS ENUM ('create', 'edit', 'delete');
CREATE TYPE "MessageCommandOutcome" AS ENUM ('pending', 'succeeded', 'rejected');
CREATE TYPE "MessageCommandRejection" AS ENUM (
  'channel_unavailable',
  'topic_unavailable',
  'message_unavailable',
  'mutation_forbidden',
  'stale_version'
);

CREATE TABLE "message_command_receipts" (
  "workspace_id" TEXT NOT NULL,
  "command_id" TEXT NOT NULL,
  "actor_identity_id" TEXT NOT NULL,
  "kind" "MessageCommandKind" NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "outcome" "MessageCommandOutcome" NOT NULL DEFAULT 'pending',
  "rejection" "MessageCommandRejection",
  "channel_id" TEXT NOT NULL,
  "topic_id" TEXT NOT NULL,
  "message_id" TEXT,
  "message_version" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "completed_at" TIMESTAMPTZ(6),

  CONSTRAINT "message_command_receipts_pkey"
    PRIMARY KEY ("workspace_id", "command_id"),
  CONSTRAINT "message_command_receipts_fingerprint_sha256"
    CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "message_command_receipts_terminal_outcome"
    CHECK (
      (
        "outcome" = 'pending'
        AND "rejection" IS NULL
        AND "message_version" IS NULL
        AND "completed_at" IS NULL
      )
      OR (
        "outcome" = 'succeeded'
        AND "rejection" IS NULL
        AND "message_id" IS NOT NULL
        AND "message_version" > 0
        AND "completed_at" IS NOT NULL
      )
      OR (
        "outcome" = 'rejected'
        AND "rejection" IS NOT NULL
        AND "message_version" IS NULL
        AND "completed_at" IS NOT NULL
      )
    )
);

CREATE INDEX "message_command_receipts_actor_created_idx"
  ON "message_command_receipts" (
    "workspace_id",
    "actor_identity_id",
    "created_at"
  );

ALTER TABLE "message_command_receipts"
  ADD CONSTRAINT "message_command_receipts_workspace_fkey"
    FOREIGN KEY ("workspace_id")
    REFERENCES "workspaces" ("id")
    ON DELETE CASCADE,
  ADD CONSTRAINT "message_command_receipts_actor_fkey"
    FOREIGN KEY ("workspace_id", "actor_identity_id")
    REFERENCES "workspace_identities" ("workspace_id", "id")
    ON DELETE RESTRICT;

ALTER TABLE "messages"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "produced_by_command_id" TEXT,
  ADD CONSTRAINT "messages_version_positive"
    CHECK ("version" > 0)
    NOT VALID,
  ADD CONSTRAINT "messages_producing_command_fkey"
    FOREIGN KEY ("workspace_id", "produced_by_command_id")
    REFERENCES "message_command_receipts" ("workspace_id", "command_id")
    ON DELETE SET NULL ("produced_by_command_id")
    NOT VALID;

CREATE INDEX "messages_producing_command_idx"
  ON "messages" ("workspace_id", "produced_by_command_id");

ALTER TABLE "messages"
  VALIDATE CONSTRAINT "messages_version_positive",
  VALIDATE CONSTRAINT "messages_producing_command_fkey";
