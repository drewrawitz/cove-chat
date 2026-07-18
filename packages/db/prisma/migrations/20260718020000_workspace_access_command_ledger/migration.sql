CREATE TABLE "workspace_access_commands" (
  "actor_user_id" TEXT NOT NULL,
  "command_id" TEXT NOT NULL,
  "command_kind" TEXT NOT NULL,
  "input_fingerprint" TEXT NOT NULL,
  "outcome_version" INTEGER NOT NULL,
  "outcome" JSONB NOT NULL,
  "committed_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "workspace_access_commands_pkey" PRIMARY KEY ("actor_user_id", "command_id"),
  CONSTRAINT "workspace_access_commands_command_id_not_empty" CHECK (length("command_id") > 0),
  CONSTRAINT "workspace_access_commands_command_kind_check" CHECK (
    "command_kind" IN (
      'create_workspace',
      'join_workspace',
      'update_workspace_identity',
      'leave_workspace'
    )
  ),
  CONSTRAINT "workspace_access_commands_input_fingerprint_version_check" CHECK (
    "input_fingerprint" ~ '^v1:sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT "workspace_access_commands_outcome_version_check" CHECK ("outcome_version" = 1)
);

CREATE INDEX "workspace_access_commands_committed_at_idx"
ON "workspace_access_commands"("committed_at");

ALTER TABLE "workspace_access_commands"
ADD CONSTRAINT "workspace_access_commands_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
