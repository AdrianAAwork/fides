CREATE TABLE IF NOT EXISTS "global_rate_limits" (
  "date" date PRIMARY KEY NOT NULL,
  "count" smallint DEFAULT 0 NOT NULL
);
