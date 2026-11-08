-- Release 0.9.1 (#301): step 2 of #286 drops the Tiebreaker pool's column and type for good. Every pool row keeps its Event and game.
-- Switch-over (ADR 0007): the 0.9 code that serves while this runs never names `pool`, so the drop needs no compatibility step.
ALTER TABLE "event_pool_games" DROP COLUMN "pool";--> statement-breakpoint
DROP TYPE "public"."pool_kind";
