CREATE TYPE "public"."game_suitability" AS ENUM('teams', 'ffa', 'one_v_one');--> statement-breakpoint
ALTER TABLE "games" RENAME COLUMN "formats" TO "suitabilities";--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "suitabilities" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "suitabilities" SET DATA TYPE "public"."game_suitability"[] USING "suitabilities"::text[]::"public"."game_suitability"[];--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "suitabilities" SET DEFAULT '{}';--> statement-breakpoint
CREATE INDEX "games_image_key_idx" ON "games" USING btree ("image_key");--> statement-breakpoint
CREATE INDEX "event_pool_games_game_id_idx" ON "event_pool_games" USING btree ("game_id");
