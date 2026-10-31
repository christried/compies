CREATE TABLE "event_teams" (
	"event_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"frozen_name" text,
	CONSTRAINT "event_teams_event_id_position_pk" PRIMARY KEY("event_id","position"),
	CONSTRAINT "event_teams_position_check" CHECK ("event_teams"."position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_teams" ADD CONSTRAINT "event_teams_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_one_running_per_event_idx" ON "sessions" USING btree ("event_id") WHERE "sessions"."started_at" IS NOT NULL AND "sessions"."ended_at" IS NULL AND "sessions"."removed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_ended_after_started_check" CHECK ("sessions"."ended_at" IS NULL OR "sessions"."started_at" IS NOT NULL);