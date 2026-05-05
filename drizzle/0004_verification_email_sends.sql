CREATE TABLE IF NOT EXISTS "verification_email_sends" (
  "auth0_id" text PRIMARY KEY NOT NULL,
  "last_sent_at" timestamptz NOT NULL
);
