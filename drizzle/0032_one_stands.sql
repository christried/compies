-- Release 0.12 (#437, spec #425): one place outside the teams (GLOSSARY: Stands; the Bench is gone). Every `bench` seat in `event_members` becomes
-- `stands`, and the column's default becomes `stands`. The enum value `bench` is not dropped: the deployment before 0.12 may still write it.
-- No index: nothing filters on the zone. The check `event_members_team_zone_check` is about `team` and stays true: a bench row and its stands row both have `team` null.
-- Switch-over (ADR 0007): the 0.11 code serves until the switch-over, and after this migration it can still
--   1. move a Member to the Bench: `POST /api/e/:slug/move` with `to: { zone: 'bench' }` (an old tab's „Auf die Bench“ or a drag onto the Bench zone), and
--      lowering the team count (`benchRemovedTeams`). Result: a `bench` row. The 0.12 code reads it as the Stands (`placeOf`) and never writes it;
--   2. insert a Member without a zone (join, Event creation): it gets the new default `stands`;
--   3. publish `member.moved` and write `member_moved` feed entries with `{ zone: 'bench' }`. A new client hears the Bench place as the Stands
--      (`useBoardPlaces`), and the feed renders any place that is no team as the Tribüne (`movedText`). Old feed entries are not rewritten.
-- A stale 0.11 tab that POSTs `{ zone: 'bench' }` to the new server is answered as a move to the Stands (`parsePlace`).
UPDATE "event_members" SET "zone" = 'stands' WHERE "zone" = 'bench';--> statement-breakpoint
ALTER TABLE "event_members" ALTER COLUMN "zone" SET DEFAULT 'stands';
