-- Release 0.9 (#309, spec #308): the Award ceremony's start. `events` gets `ceremony_starts_at` (the latest start instant) and `ceremony_gag` (the new
-- enum `ceremony_gag`: trip, bonk), both nullable, no default, no index: nothing filters or joins on them. Checks: both are set together, and only in a
-- finished or archived Event. The run's end is not stored; the code derives it from the start, the Party count and the gag.
-- Switch-over (ADR 0007): the 0.8 code serves until the switch-over. It inserts and updates `events` with explicit columns and never writes or selects
-- the new ones, so NULL/NULL passes both checks. It never moves a Phase backwards, and its Finish writes `phase = 'finished'` without the columns, which
-- is a valid row. An Event finished on 0.8 has no ceremony and can start one with the new code. A 0.8 tab shows no layer and no button. Nothing to backfill.
CREATE TYPE "public"."ceremony_gag" AS ENUM('trip', 'bonk');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ceremony_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ceremony_gag" "ceremony_gag";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_ceremony_pair_check" CHECK (("events"."ceremony_starts_at" IS NULL) = ("events"."ceremony_gag" IS NULL));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_ceremony_phase_check" CHECK ("events"."ceremony_starts_at" IS NULL OR "events"."phase" IN ('finished', 'archived'));