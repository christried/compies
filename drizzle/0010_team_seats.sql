ALTER TABLE "event_members" ADD COLUMN "team" integer;--> statement-breakpoint
ALTER TABLE "event_members" ADD COLUMN "team_joined_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "event_members_event_id_team_idx" ON "event_members" USING btree ("event_id","team");--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_team_zone_check" CHECK (("event_members"."zone" = 'team') = ("event_members"."team" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_team_joined_at_check" CHECK (("event_members"."team" IS NULL) = ("event_members"."team_joined_at" IS NULL));