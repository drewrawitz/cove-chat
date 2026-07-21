INSERT INTO "channels" (
  "id",
  "workspace_id",
  "name",
  "purpose",
  "visibility",
  "maintainer_identity_id"
)
SELECT
  'general',
  workspace.id,
  'general',
  'A shared place for workspace-wide topics.',
  'public',
  maintainer.id
FROM "workspaces" AS workspace
INNER JOIN LATERAL (
  SELECT identity.id
  FROM "workspace_identities" AS identity
  WHERE identity."workspace_id" = workspace.id
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
) AS maintainer ON TRUE
ON CONFLICT ("workspace_id", "id") DO NOTHING;

INSERT INTO "channel_memberships" ("workspace_id", "channel_id", "identity_id")
SELECT
  channel."workspace_id",
  channel.id,
  channel."maintainer_identity_id"
FROM "channels" AS channel
WHERE channel.id = 'general'
ON CONFLICT ("workspace_id", "channel_id", "identity_id") DO NOTHING;
