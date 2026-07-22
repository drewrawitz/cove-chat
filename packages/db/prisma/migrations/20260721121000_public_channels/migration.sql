ALTER TABLE "channels"
ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'Purpose not recorded.',
ADD COLUMN "maintainer_identity_id" TEXT;

UPDATE "channels" AS channel
SET "maintainer_identity_id" = (
  SELECT identity.id
  FROM "workspace_identities" AS identity
  WHERE identity."workspace_id" = channel."workspace_id"
    AND identity."membership_ended_at" IS NULL
    AND identity.role IN ('owner', 'admin', 'member')
  ORDER BY
    CASE identity.role
      WHEN 'owner' THEN 0
      WHEN 'admin' THEN 1
      ELSE 2
    END,
    identity."membership_started_at",
    identity.id
  LIMIT 1
);

ALTER TABLE "channels"
ADD CONSTRAINT "channels_maintainer_identity_id_not_null"
CHECK ("maintainer_identity_id" IS NOT NULL)
NOT VALID;

ALTER TABLE "channels"
VALIDATE CONSTRAINT "channels_maintainer_identity_id_not_null";

ALTER TABLE "channels"
ALTER COLUMN "maintainer_identity_id" SET NOT NULL;

ALTER TABLE "channels"
DROP CONSTRAINT "channels_maintainer_identity_id_not_null";

CREATE INDEX CONCURRENTLY "channels_workspace_id_maintainer_identity_id_idx"
ON "channels" ("workspace_id", "maintainer_identity_id");

ALTER TABLE "channels"
ADD CONSTRAINT "channels_workspace_id_maintainer_identity_id_fkey"
FOREIGN KEY ("workspace_id", "maintainer_identity_id")
REFERENCES "workspace_identities"("workspace_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE
NOT VALID;

ALTER TABLE "channels"
VALIDATE CONSTRAINT "channels_workspace_id_maintainer_identity_id_fkey";
