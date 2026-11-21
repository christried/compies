-- Release 0.18.1 (#957, spec #961 § Uncover): the Host uncovers a Hidden wheel, `events.wheel_uncovered_at` (null = not uncovered). One nullable column, no
-- default, no CHECK and no index: no request selects Events by it, the Event is read by its slug or id, and the uncover route under the Event lock is its one writer.
-- Switch-over (ADR 0007): the code that serves until the switch-over inserts and updates `events` with explicit columns and never names `wheel_uncovered_at`,
-- so a nullable column without a default keeps working for it, and a row it updates keeps its value. Only the new route writes the column, so no wheel is
-- uncovered before the new code serves. No data migration.
ALTER TABLE "events" ADD COLUMN "wheel_uncovered_at" timestamp with time zone;
