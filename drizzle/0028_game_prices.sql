-- Release 0.10 (#337, spec #332): the Price of a game (GLOSSARY: Price). `games` gets `price_cents` (integer, the amount in cents), `price_source` (the
-- new enum `price_source`: steam, epic, gog, publisher, steam_key, free_to_play, subscription) and `price_checked_at` (the day it was last checked,
-- timestamptz), all nullable, no default, no index: nothing filters or joins on them. Checks: the day is set exactly when the source is; an amount is
-- set only for a paid source (not free_to_play, not subscription), and it is 1 to 99 999 cents. The source check spells out `IS NOT NULL` because a
-- CHECK passes on NULL: without it, an amount with no source would slip through.
-- Switch-over (ADR 0007): the code that serves until the switch-over (0.9 and the 0.10 build so far) inserts and updates `games` with explicit columns and
-- never writes or selects the new ones. A game it creates has NULL/NULL/NULL, which passes all three checks. A game it edits keeps its Price, because its
-- UPDATE does not name the columns. A browser tab of the old frontend sends a PATCH without `price`; the new server reads an absent `price` as unchanged,
-- so such a tab never wipes a Price. Nothing to backfill.
CREATE TYPE "public"."price_source" AS ENUM('steam', 'epic', 'gog', 'publisher', 'steam_key', 'free_to_play', 'subscription');--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "price_source" "price_source";--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "price_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_price_checked_pair_check" CHECK (("games"."price_checked_at" IS NULL) = ("games"."price_source" IS NULL));--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_price_cents_source_check" CHECK ("games"."price_cents" IS NULL OR ("games"."price_source" IS NOT NULL AND "games"."price_source" NOT IN ('free_to_play', 'subscription')));--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_price_cents_range_check" CHECK ("games"."price_cents" IS NULL OR "games"."price_cents" BETWEEN 1 AND 99999);