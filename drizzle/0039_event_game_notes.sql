CREATE TABLE "event_game_notes" (
	"event_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"notes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_game_notes_event_id_game_id_pk" PRIMARY KEY("event_id","game_id")
);
--> statement-breakpoint
ALTER TABLE "event_game_notes" ADD CONSTRAINT "event_game_notes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_game_notes" ADD CONSTRAINT "event_game_notes_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_game_notes_game_id_idx" ON "event_game_notes" USING btree ("game_id");