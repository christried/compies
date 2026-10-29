CREATE TYPE "public"."event_format" AS ENUM('teams', 'ffa');--> statement-breakpoint
CREATE TYPE "public"."pool_kind" AS ENUM('main', 'tiebreaker');--> statement-breakpoint
CREATE TYPE "public"."selection_mode" AS ENUM('lucky_wheel', 'admin_pick', 'pick_ban', 'losers_pick', 'losers_advantage');--> statement-breakpoint
CREATE TABLE "event_pool_games" (
	"event_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"pool" "pool_kind" NOT NULL,
	CONSTRAINT "event_pool_games_event_id_game_id_pool_pk" PRIMARY KEY("event_id","game_id","pool")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"image_key" text,
	"youtube_id" text,
	"clip_start" integer DEFAULT 0 NOT NULL,
	"clip_length" integer DEFAULT 30 NOT NULL,
	"players_min" integer,
	"players_max" integer,
	"formats" "event_format"[] DEFAULT '{}' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "format" "event_format";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "team_count" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "team_size" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "game_count" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "points_table" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "selection_mode" "selection_mode";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "hidden_wheel" boolean;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "veto_allowance" integer;--> statement-breakpoint
ALTER TABLE "event_pool_games" ADD CONSTRAINT "event_pool_games_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_pool_games" ADD CONSTRAINT "event_pool_games_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_created_by_idx" ON "games" USING btree ("created_by");