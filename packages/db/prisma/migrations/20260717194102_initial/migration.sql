-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'member', 'guest');

-- CreateEnum
CREATE TYPE "ChannelVisibility" AS ENUM ('public', 'private');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_identities" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'member',
    "membership_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membership_ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_identities_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visibility" "ChannelVisibility" NOT NULL DEFAULT 'public',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "channel_memberships" (
    "workspace_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "identity_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_memberships_pkey" PRIMARY KEY ("workspace_id","channel_id","identity_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_identities_workspace_id_account_id_key" ON "workspace_identities"("workspace_id", "account_id");

-- CreateIndex
CREATE INDEX "workspace_identities_account_id_idx" ON "workspace_identities"("account_id");

-- CreateIndex
CREATE INDEX "workspace_identities_workspace_id_membership_ended_at_idx" ON "workspace_identities"("workspace_id", "membership_ended_at");

-- CreateIndex
CREATE INDEX "channels_workspace_id_visibility_idx" ON "channels"("workspace_id", "visibility");

-- CreateIndex
CREATE INDEX "channel_memberships_workspace_id_identity_id_idx" ON "channel_memberships"("workspace_id", "identity_id");

-- AddForeignKey
ALTER TABLE "workspace_identities" ADD CONSTRAINT "workspace_identities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_identities" ADD CONSTRAINT "workspace_identities_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_workspace_id_channel_id_fkey" FOREIGN KEY ("workspace_id", "channel_id") REFERENCES "channels"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_workspace_id_identity_id_fkey" FOREIGN KEY ("workspace_id", "identity_id") REFERENCES "workspace_identities"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
