-- Release 0.9 (#286, ADR 0014): one Game pool in the code and on the wire. Step 1 of 2; #301 drops the column and the type.
-- Switch-over (ADR 0007): the 0.8 code serves while this runs and while 0.9 builds. It still selects and inserts `pool = 'main'`, so `pool` stays NOT NULL with the default 'main' and `pool_kind` keeps both values. Only the primary key changes.
-- The 0.7 code could still write `tiebreaker` rows during the 0.7 -> 0.8 switch-over: they go first, so no game is left twice under the new key. A game cannot be in `main` twice under the old key.
DELETE FROM "event_pool_games" WHERE "pool" = 'tiebreaker';--> statement-breakpoint
ALTER TABLE "event_pool_games" DROP CONSTRAINT "event_pool_games_event_id_game_id_pool_pk";--> statement-breakpoint
ALTER TABLE "event_pool_games" ALTER COLUMN "pool" SET DEFAULT 'main';--> statement-breakpoint
ALTER TABLE "event_pool_games" ADD CONSTRAINT "event_pool_games_event_id_game_id_pk" PRIMARY KEY("event_id","game_id");
