-- Release 0.10 (#335, spec #332): the Tags of a game. The new table `game_tags` holds one row per game and Tag: `key` (the normalised spelling, one Tag
-- whatever the case or spacing), `label` (the spelling shown), `position` (the order the editor sent them) and `created_at` (which row is the earliest of a
-- key, whose label the Tags in use show). Primary key (game_id, key); rows go with their game; an index on `key` serves the label lookup and the Tags in use.
-- No unique on (game_id, position): an edit reorders the rows in place.
-- Switch-over (ADR 0007): the 0.9 code serves until the switch-over. It never reads or writes `game_tags`, and it inserts and updates `games` with explicit
-- columns. A game it creates or edits just has no Tags, which is valid, and the new code shows it with `tags: []`. Nothing to backfill. A 0.9 browser tab open
-- across the switch-over sends a PATCH without `tags`; the new server reads an absent `tags` as unchanged, so such a tab never wipes Tags.
CREATE TABLE "game_tags" (
	"game_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_tags_game_id_key_pk" PRIMARY KEY("game_id","key"),
	CONSTRAINT "game_tags_position_check" CHECK ("game_tags"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "game_tags" ADD CONSTRAINT "game_tags_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_tags_key_idx" ON "game_tags" USING btree ("key");