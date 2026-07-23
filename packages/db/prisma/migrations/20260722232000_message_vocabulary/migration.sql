ALTER TABLE "contributions" RENAME TO "messages";

ALTER TABLE "messages"
  RENAME CONSTRAINT "contributions_pkey" TO "messages_pkey";
ALTER TABLE "messages"
  RENAME CONSTRAINT "contributions_body_nonempty" TO "messages_body_nonempty";
ALTER TABLE "messages"
  RENAME CONSTRAINT "contributions_position_positive" TO "messages_position_positive";
ALTER TABLE "messages"
  RENAME CONSTRAINT "contributions_body_tombstone_check"
  TO "messages_body_tombstone_check";
ALTER TABLE "messages"
  RENAME CONSTRAINT "contributions_workspace_id_topic_id_fkey"
  TO "messages_workspace_id_topic_id_fkey";
ALTER TABLE "messages"
  RENAME CONSTRAINT "contributions_workspace_id_author_identity_id_fkey"
  TO "messages_workspace_id_author_identity_id_fkey";

ALTER INDEX "contributions_workspace_id_topic_id_position_key"
  RENAME TO "messages_workspace_id_topic_id_position_key";
ALTER INDEX "contributions_workspace_id_author_identity_id_idx"
  RENAME TO "messages_workspace_id_author_identity_id_idx";

ALTER TYPE "ContributionRevisionOperation" RENAME TO "MessageRevisionOperation";

ALTER TABLE "contribution_revisions" RENAME TO "message_revisions";
ALTER TABLE "message_revisions" RENAME COLUMN "contribution_id" TO "message_id";
ALTER TABLE "message_revisions"
  RENAME CONSTRAINT "contribution_revisions_pkey" TO "message_revisions_pkey";
ALTER TABLE "message_revisions"
  RENAME CONSTRAINT "contribution_revisions_contribution_fkey"
  TO "message_revisions_message_fkey";

ALTER INDEX "contribution_revisions_workspace_id_topic_id_contribution_id_id_idx"
  RENAME TO "message_revisions_workspace_id_topic_id_message_id_id_idx";
ALTER SEQUENCE "contribution_revisions_id_seq" RENAME TO "message_revisions_id_seq";
