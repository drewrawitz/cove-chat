ALTER TABLE "audit_events"
ADD COLUMN "event_version" INTEGER,
ADD COLUMN "metadata" JSONB;

UPDATE "audit_events"
SET
  "event_version" = 1,
  "metadata" = CASE
    WHEN "event_type" = 'authentication.sign_in'
      THEN '{"authenticationMethod":"magic_link"}'::JSONB
    ELSE '{}'::JSONB
  END;

ALTER TABLE "audit_events"
ALTER COLUMN "event_version" SET NOT NULL,
ALTER COLUMN "metadata" SET NOT NULL;
