-- Release 0.12 (#438, spec #425): Team names follow the Team words until the Finish (GLOSSARY: Team name). Data only, no schema change: `event_teams` and its
-- column `frozen_name` stay (the previous deployment writes them, ADR 0007), the new code reads them only in an Event that is finished (Phase `finished` or
-- `archived`, the Phase is the one source of "finished", not `finished_at`).
-- 1. A team whose frozen name is NULL is one the Host reset after the start (or one that had no words at the start, which clears nothing): its words go,
--    so its name stays the colour name. A team with a frozen name keeps its words: its name is now composed from them.
-- 2. The frozen names of every Event that is not finished go. A finished Event keeps its rows and its words: it shows its names as they were.
-- Switch-over (ADR 0007): while the build migrates, the previous deployment may (a) start a Session, which inserts `event_teams` rows with the composed name
-- for an Event that then runs; (b) answer a Host's reset after a start, which sets `frozen_name` to NULL and keeps the words; (c) answer a Team word after a
-- start with `teams_locked`. The new code ignores the rows of an Event that is not finished, so the Event shows its words: (a) changes nothing, a reset of
-- (b) is undone for that team (the Host resets again), (c) is only an error for a Player. The Finish deletes (a)'s rows, so the names do not jump back at the
-- end. Nothing to backfill.
UPDATE "event_members" AS m SET "team_word" = NULL
FROM "event_teams" AS t JOIN "events" AS e ON e."id" = t."event_id"
WHERE m."event_id" = t."event_id" AND m."team" = t."position"
  AND t."frozen_name" IS NULL AND e."phase" NOT IN ('finished', 'archived');--> statement-breakpoint
DELETE FROM "event_teams" AS t USING "events" AS e
WHERE e."id" = t."event_id" AND e."phase" NOT IN ('finished', 'archived');
