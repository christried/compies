-- Release 0.16 (#467, spec #717 § B): a game can be archived, `games.archived_at` (null = not archived). One nullable column, no default, no CHECK and no index:
-- no request selects games by it, every read goes through `created_by` or `id`.
-- Switch-over (ADR 0007): the code that serves until the switch-over inserts and updates `games` with explicit columns and never names `archived_at`, so a
-- nullable column without a default keeps working for it, and a row it updates keeps its `archived_at`. Only the new route writes the column, so nothing is
-- archived before the new code serves and the old code never meets an Archived game. No data migration.
ALTER TABLE "games" ADD COLUMN "archived_at" timestamp with time zone;
