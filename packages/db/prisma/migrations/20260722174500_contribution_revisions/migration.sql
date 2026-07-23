ALTER TABLE "contributions"
  ALTER COLUMN "body" DROP NOT NULL,
  ADD COLUMN "edited_at" TIMESTAMPTZ(6),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

ALTER TABLE "contributions"
  ADD CONSTRAINT "contributions_body_tombstone_check"
  CHECK (
    ("deleted_at" IS NULL AND "body" IS NOT NULL)
    OR ("deleted_at" IS NOT NULL AND "body" IS NULL)
  ) NOT VALID;

ALTER TABLE "contributions"
  VALIDATE CONSTRAINT "contributions_body_tombstone_check";

CREATE TYPE "ContributionRevisionOperation" AS ENUM ('edit', 'delete');

CREATE TABLE "contribution_revisions" (
  "id" BIGSERIAL NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "topic_id" TEXT NOT NULL,
  "contribution_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "operation" "ContributionRevisionOperation" NOT NULL,
  "revised_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "contribution_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contribution_revisions_contribution_fkey"
    FOREIGN KEY ("workspace_id", "topic_id", "contribution_id")
    REFERENCES "contributions" ("workspace_id", "topic_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "contribution_revisions_workspace_id_topic_id_contribution_id_id_idx"
  ON "contribution_revisions" ("workspace_id", "topic_id", "contribution_id", "id");
