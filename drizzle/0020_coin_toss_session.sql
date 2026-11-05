-- A toss belongs to its Session (0.8, #259, review 0.7 Q10): `coin_tosses.session_id`, nullable, with its foreign key and an index. The migration only adds; there is no backfill.
-- Switch-over (ADR 0007): the 0.7 code serves until the switch-over. It inserts `coin_tosses` rows WITHOUT `session_id` (NULL), and it stamps a Session's start and end with the database's `now()` (nothing compares those any more).
-- The new code shows a toss with a NULL `session_id` in no Session: a toss the Host made in a running Session during the deploy vanishes from the Event read and the Host tosses again. The release goes out on a day without a Session (docs/agents/release.md), so this stays theoretical.
-- The 0.7 end-of-Session code deletes the Countdown itself, so nothing else changes.
ALTER TABLE "coin_tosses" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "coin_tosses" ADD CONSTRAINT "coin_tosses_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coin_tosses_session_id_started_at_idx" ON "coin_tosses" USING btree ("session_id","started_at");