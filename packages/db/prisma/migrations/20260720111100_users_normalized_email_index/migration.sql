CREATE UNIQUE INDEX CONCURRENTLY "users_normalized_email_key"
ON "users"(lower("email"));
