CREATE TABLE "workspace_invitations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "invitee_account_id" TEXT NOT NULL,
    "invited_by_account_id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'member',
    "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(6),

    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_invitations_member_role" CHECK ("role" = 'member')
);

CREATE INDEX "workspace_invitations_invitee_account_id_accepted_at_idx"
ON "workspace_invitations"("invitee_account_id", "accepted_at");

CREATE INDEX "workspace_invitations_workspace_id_accepted_at_idx"
ON "workspace_invitations"("workspace_id", "accepted_at");

CREATE UNIQUE INDEX "workspace_invitations_pending_invitee_key"
ON "workspace_invitations"("workspace_id", "invitee_account_id")
WHERE "accepted_at" IS NULL;

ALTER TABLE "workspace_invitations"
ADD CONSTRAINT "workspace_invitations_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_invitations"
ADD CONSTRAINT "workspace_invitations_invitee_account_id_fkey"
FOREIGN KEY ("invitee_account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workspace_invitations"
ADD CONSTRAINT "workspace_invitations_invited_by_account_id_fkey"
FOREIGN KEY ("invited_by_account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
