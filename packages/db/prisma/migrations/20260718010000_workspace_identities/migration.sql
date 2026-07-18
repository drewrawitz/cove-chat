-- Add guest as the fourth workspace-scoped role.
ALTER TYPE "WorkspaceRole" ADD VALUE 'guest';

-- A workspace identity is durable profile and attribution data. Membership below is only access.
CREATE TABLE "workspace_identities" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_identities_pkey" PRIMARY KEY ("workspace_id", "id")
);

CREATE UNIQUE INDEX "workspace_identities_workspace_id_account_id_key"
ON "workspace_identities"("workspace_id", "account_id");
CREATE INDEX "workspace_identities_account_id_idx" ON "workspace_identities"("account_id");

ALTER TABLE "workspace_identities"
ADD CONSTRAINT "workspace_identities_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_identities"
ADD CONSTRAINT "workspace_identities_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve any pre-existing memberships by giving each account its durable workspace identity.
INSERT INTO "workspace_identities" ("id", "workspace_id", "account_id", "name", "avatar_url", "created_at")
SELECT
    'identity:' || membership."workspace_id" || ':' || membership."user_id",
    membership."workspace_id",
    membership."user_id",
    account."display_name",
    '/avatars/default.svg',
    membership."created_at"
FROM "workspace_memberships" AS membership
INNER JOIN "users" AS account ON account."id" = membership."user_id";

ALTER TABLE "workspace_memberships" ADD COLUMN "identity_id" TEXT;
ALTER TABLE "workspace_memberships" ADD COLUMN "ended_at" TIMESTAMPTZ(6);
ALTER TABLE "workspace_memberships" RENAME COLUMN "created_at" TO "started_at";

UPDATE "workspace_memberships" AS membership
SET "identity_id" = identity."id"
FROM "workspace_identities" AS identity
WHERE identity."workspace_id" = membership."workspace_id"
  AND identity."account_id" = membership."user_id";

ALTER TABLE "channel_memberships" ADD COLUMN "identity_id" TEXT;
UPDATE "channel_memberships" AS channel_membership
SET "identity_id" = identity."id"
FROM "workspace_identities" AS identity
WHERE identity."workspace_id" = channel_membership."workspace_id"
  AND identity."account_id" = channel_membership."user_id";

ALTER TABLE "channel_memberships" DROP CONSTRAINT "channel_memberships_workspace_id_user_id_fkey";
ALTER TABLE "channel_memberships" DROP CONSTRAINT "channel_memberships_pkey";
DROP INDEX "channel_memberships_workspace_id_user_id_idx";

ALTER TABLE "workspace_memberships" DROP CONSTRAINT "workspace_memberships_user_id_fkey";
ALTER TABLE "workspace_memberships" DROP CONSTRAINT "workspace_memberships_workspace_id_fkey";
ALTER TABLE "workspace_memberships" DROP CONSTRAINT "workspace_memberships_pkey";
DROP INDEX "workspace_memberships_user_id_idx";

ALTER TABLE "channel_memberships" ALTER COLUMN "identity_id" SET NOT NULL;
ALTER TABLE "channel_memberships" DROP COLUMN "user_id";
ALTER TABLE "channel_memberships"
ADD CONSTRAINT "channel_memberships_pkey" PRIMARY KEY ("workspace_id", "channel_id", "identity_id");
CREATE INDEX "channel_memberships_workspace_id_identity_id_idx"
ON "channel_memberships"("workspace_id", "identity_id");
ALTER TABLE "channel_memberships"
ADD CONSTRAINT "channel_memberships_workspace_id_identity_id_fkey"
FOREIGN KEY ("workspace_id", "identity_id")
REFERENCES "workspace_identities"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_memberships" ALTER COLUMN "identity_id" SET NOT NULL;
ALTER TABLE "workspace_memberships" DROP COLUMN "user_id";
ALTER TABLE "workspace_memberships"
ADD CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("workspace_id", "identity_id");
CREATE INDEX "workspace_memberships_workspace_id_ended_at_idx"
ON "workspace_memberships"("workspace_id", "ended_at");
ALTER TABLE "workspace_memberships"
ADD CONSTRAINT "workspace_memberships_workspace_id_identity_id_fkey"
FOREIGN KEY ("workspace_id", "identity_id")
REFERENCES "workspace_identities"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
