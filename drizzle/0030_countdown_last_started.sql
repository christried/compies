-- Release 0.12 (#441, spec #425): when a Countdown was last started or resumed. `countdowns` gets `last_started_at` (timestamptz), nullable, no default, no index:
-- nothing filters or joins on it. The Event page's stage lifts the Countdown block at that instant, and `started_at` cannot say it, because a pause clears it.
-- Backfill: a Countdown that runs now has `started_at`, which is its last start; the UPDATE copies it. A paused or ready one stays NULL (its block does not lift).
-- Switch-over (ADR 0007): the build that serves until the switch-over writes `started_at` only and never names the new column. A Countdown it starts has a stale or NULL
-- `last_started_at`, a pause by it leaves the old value; that is why the client takes the later of `started_at` and `last_started_at`. A Countdown it sets keeps the column as it was.
ALTER TABLE "countdowns" ADD COLUMN "last_started_at" timestamp with time zone;--> statement-breakpoint
UPDATE "countdowns" SET "last_started_at" = "started_at" WHERE "started_at" IS NOT NULL;
