CREATE TYPE "public"."activity_type" AS ENUM('member_joined', 'member_moved', 'date_set', 'date_rescheduled', 'date_reopened', 'session_added', 'session_removed', 'session_started', 'session_ended', 'team_name_reset', 'game_count_changed', 'team_size_changed');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"type" "activity_type" NOT NULL,
	"actor_id" uuid,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_event_id_at_idx" ON "activity" USING btree ("event_id","at");