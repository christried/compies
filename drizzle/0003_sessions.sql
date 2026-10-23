CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"starts_at" timestamp with time zone,
	"previous_starts_at" timestamp with time zone,
	"slot_id" uuid,
	"ics_sequence" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_slot_id_poll_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."poll_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Hand-written data step (not in the generated SQL): every Event gets one Session that carries its Date,
-- its withdrawn Date and its calendar sequence. The Session takes the Event's id, so the calendar UID
-- `<id>@compies` stays the same for entries that were already imported (#48).
INSERT INTO "sessions" ("id", "event_id", "starts_at", "previous_starts_at", "ics_sequence")
SELECT "id", "id", "starts_at", "previous_starts_at", "ics_sequence" FROM "events";--> statement-breakpoint
-- A Session whose Date equals one of its Event's Slots refers to that Slot, so the Slot is no longer open.
UPDATE "sessions" SET "slot_id" = "poll_slots"."id"
FROM "poll_slots"
WHERE "poll_slots"."event_id" = "sessions"."event_id"
	AND "sessions"."starts_at" IS NOT NULL
	AND "poll_slots"."starts_at" = "sessions"."starts_at";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "date_mode";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "starts_at";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "previous_starts_at";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "ics_sequence";--> statement-breakpoint
DROP TYPE "public"."date_mode";
