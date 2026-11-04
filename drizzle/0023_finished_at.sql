-- Release 0.8 (#277, spec #272): the Event's end. `events` gets `finished_at` (nullable, no default, no index: nothing filters or joins on it) and
-- the check that a stored end belongs to a finished or archived Event. The converse is not checked: the code under the Event lock is the one writer.
-- Switch-over (ADR 0007): the 0.7 code serves until the switch-over. It inserts and updates `events` with explicit columns, never `finished_at`
-- (NULL passes the check), and it never writes the Phase `finished`, so no Event is finished or has `finished_at` before the new code serves.
-- A 0.7 tab open across the switch-over reads a Phase `finished` Event like any other Phase it already styles. No data migration.
ALTER TABLE "events" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_finished_at_phase_check" CHECK ("events"."finished_at" IS NULL OR "events"."phase" IN ('finished', 'archived'));