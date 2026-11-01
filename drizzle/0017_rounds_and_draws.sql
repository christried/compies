-- Glücksrad (0.7, #228): the six tables of the game round in one migration, though #228 uses only rounds and draws. New tables only: the previous deployment, which serves until the switch-over (ADR 0007), neither reads nor writes them, so nothing here needs a second step.
CREATE TYPE "public"."coin_side" AS ENUM('heads', 'tails');--> statement-breakpoint
CREATE TYPE "public"."draw_kind" AS ENUM('spin', 'set');--> statement-breakpoint
CREATE TYPE "public"."draw_outcome" AS ENUM('vetoed', 'set');--> statement-breakpoint
CREATE TYPE "public"."draw_source" AS ENUM('pool', 'library');--> statement-breakpoint
CREATE TABLE "bonus_vetoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"team" integer NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "bonus_vetoes_team_check" CHECK ("bonus_vetoes"."team" >= 1)
);
--> statement-breakpoint
CREATE TABLE "coin_tosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"side" "coin_side" NOT NULL,
	"tossed_by" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"lands_at" timestamp with time zone NOT NULL,
	CONSTRAINT "coin_tosses_lands_after_start_check" CHECK ("coin_tosses"."lands_at" >= "coin_tosses"."started_at")
);
--> statement-breakpoint
CREATE TABLE "countdowns" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"duration_ms" integer NOT NULL,
	"remaining_ms" integer NOT NULL,
	"started_at" timestamp with time zone,
	CONSTRAINT "countdowns_duration_check" CHECK ("countdowns"."duration_ms" BETWEEN 5000 AND 5999000),
	CONSTRAINT "countdowns_remaining_check" CHECK ("countdowns"."remaining_ms" BETWEEN 0 AND "countdowns"."duration_ms")
);
--> statement-breakpoint
CREATE TABLE "draws" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"source" "draw_source" NOT NULL,
	"kind" "draw_kind" NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"spin_start_at" timestamp with time zone,
	"stop_at" timestamp with time zone NOT NULL,
	"veto_ends_at" timestamp with time zone,
	"outcome" "draw_outcome",
	"settled_at" timestamp with time zone,
	"slice_game_ids" uuid[],
	"slice_labels" text[],
	"result_index" integer,
	"result_offset" double precision,
	CONSTRAINT "draws_settled_check" CHECK (("draws"."outcome" IS NULL) = ("draws"."settled_at" IS NULL)),
	CONSTRAINT "draws_instants_check" CHECK ("draws"."stop_at" >= "draws"."committed_at" AND ("draws"."spin_start_at" IS NULL OR ("draws"."spin_start_at" >= "draws"."committed_at" AND "draws"."stop_at" >= "draws"."spin_start_at")) AND ("draws"."veto_ends_at" IS NULL OR "draws"."veto_ends_at" >= "draws"."stop_at")),
	CONSTRAINT "draws_spin_check" CHECK (CASE WHEN "draws"."kind" = 'spin' THEN "draws"."spin_start_at" IS NOT NULL AND "draws"."slice_game_ids" IS NOT NULL AND "draws"."result_index" IS NOT NULL AND "draws"."result_offset" IS NOT NULL ELSE "draws"."spin_start_at" IS NULL AND "draws"."slice_game_ids" IS NULL AND "draws"."slice_labels" IS NULL AND "draws"."result_index" IS NULL AND "draws"."result_offset" IS NULL END),
	CONSTRAINT "draws_result_check" CHECK ("draws"."kind" <> 'spin' OR ("draws"."result_index" >= 0 AND "draws"."result_index" < cardinality("draws"."slice_game_ids") AND "draws"."slice_game_ids"["draws"."result_index" + 1] = "draws"."game_id" AND ("draws"."slice_labels" IS NULL OR cardinality("draws"."slice_labels") = cardinality("draws"."slice_game_ids")) AND "draws"."result_offset" >= 0 AND "draws"."result_offset" < 1))
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"game_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"set_at" timestamp with time zone,
	"put_back_at" timestamp with time zone,
	CONSTRAINT "rounds_set_game_check" CHECK (("rounds"."set_at" IS NULL) = ("rounds"."game_id" IS NULL)),
	CONSTRAINT "rounds_put_back_after_set_check" CHECK ("rounds"."put_back_at" IS NULL OR "rounds"."set_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "vetoes" (
	"draw_id" uuid NOT NULL,
	"team" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"cast_at" timestamp with time zone NOT NULL,
	CONSTRAINT "vetoes_draw_id_team_pk" PRIMARY KEY("draw_id","team"),
	CONSTRAINT "vetoes_team_check" CHECK ("vetoes"."team" >= 1)
);
--> statement-breakpoint
ALTER TABLE "bonus_vetoes" ADD CONSTRAINT "bonus_vetoes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_vetoes" ADD CONSTRAINT "bonus_vetoes_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_tosses" ADD CONSTRAINT "coin_tosses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_tosses" ADD CONSTRAINT "coin_tosses_tossed_by_users_id_fk" FOREIGN KEY ("tossed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "countdowns" ADD CONSTRAINT "countdowns_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vetoes" ADD CONSTRAINT "vetoes_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vetoes" ADD CONSTRAINT "vetoes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bonus_vetoes_event_id_team_idx" ON "bonus_vetoes" USING btree ("event_id","team");--> statement-breakpoint
CREATE INDEX "coin_tosses_event_id_started_at_idx" ON "coin_tosses" USING btree ("event_id","started_at");--> statement-breakpoint
CREATE INDEX "draws_round_id_idx" ON "draws" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_one_drawn_per_event_idx" ON "rounds" USING btree ("event_id") WHERE "rounds"."set_at" IS NULL AND "rounds"."put_back_at" IS NULL;--> statement-breakpoint
CREATE INDEX "rounds_event_id_started_at_idx" ON "rounds" USING btree ("event_id","started_at");--> statement-breakpoint
CREATE INDEX "rounds_game_id_idx" ON "rounds" USING btree ("game_id");