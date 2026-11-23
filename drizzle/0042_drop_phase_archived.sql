-- Release 0.20 (#887, spec #683): the Phase `archived` goes; finished is the last Phase (GLOSSARY: Phase). The enum `event_phase` loses the value and the two checks that
-- named it (`events_finished_at_phase_check` from 0023, `events_ceremony_phase_check` from 0025) read `= 'finished'`; `events_ceremony_pair_check` is untouched. Nothing is
-- rewritten silently: an Event still in `archived` stops the migration (story 65), the operator moves it by hand first. No code moves an Event there, so none is.
-- Switch-over (ADR 0007): the code that serves until the switch-over (0.19) never writes `archived`, and its queries on the Phase name only the Phases before the Finish
-- (`LIVE_PHASES`); its inserts and updates send the Phase as a parameter, which Postgres types as the new `event_phase`, and its Finish writes pass the rewritten checks.
-- Every request opens its own Pool (ADR 0005), so no prepared statement outlives the type's replacement. The ALTER COLUMN rewrites `events` (a few rows) under the table's lock.
DO $$
DECLARE archived_count integer;
BEGIN
  SELECT count(*) INTO archived_count FROM "events" WHERE "phase" = 'archived';
  IF archived_count > 0 THEN
    RAISE EXCEPTION 'Event in the Phase archived (%): move it by hand before this migration', archived_count;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_finished_at_phase_check";--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_ceremony_phase_check";--> statement-breakpoint
ALTER TYPE "public"."event_phase" RENAME TO "event_phase_old";--> statement-breakpoint
CREATE TYPE "public"."event_phase" AS ENUM('draft', 'poll', 'date_set', 'running', 'finished');--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "phase" SET DATA TYPE "public"."event_phase" USING "phase"::text::"public"."event_phase";--> statement-breakpoint
DROP TYPE "public"."event_phase_old";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_finished_at_phase_check" CHECK ("events"."finished_at" IS NULL OR "events"."phase" = 'finished');--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_ceremony_phase_check" CHECK ("events"."ceremony_starts_at" IS NULL OR "events"."phase" = 'finished');
