-- Release 0.9.1 (#301): step 2 of #286 drops the Tiebreaker pool's column and type for good. Every pool row keeps its Event and game.
-- Switch-over (ADR 0007): the 0.9.0 code that serves while this runs still declares `pool`, and drizzle lists every declared column in an INSERT (`default` for the missing ones). A 0.9.0 pool save (Event create with a pool, settings pool save) therefore fails with „column pool does not exist“ between this migration and the switch-over. The window is accepted: no data is lost and nothing reads `pool` (the Release PR names it).
ALTER TABLE "event_pool_games" DROP COLUMN "pool";--> statement-breakpoint
DROP TYPE "public"."pool_kind";
