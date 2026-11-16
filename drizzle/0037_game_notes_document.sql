-- Release 0.16 (#727, spec #717 § C, ADR 0019): Game notes become a document. `games.notes_doc` (jsonb, nullable, no default) holds the editor's document (shared/notes-doc.ts);
-- the 0.15 text column `games.notes` stays as it is, type and text (ADR 0007). The new code reads and writes `notes_doc` only; the Release after 0.16 drops `notes`, both triggers and both functions.
-- The conversion (every game, a copy made by 0035 included, since a copy is a `games` row with the original's `notes`): one paragraph per line, `\r\n` and `\n` both, an empty line an empty
-- paragraph without `content`, a line kept as it is (no trimming), no list and no link inferred; a `NULL` or whitespace-only note stays `NULL`. `games_notes_doc_of` is that rule in SQL,
-- the twin of `notesFromLines` in shared/notes-doc.ts (the migration test pins them to each other).
-- Switch-over (ADR 0007, spec #717 „The migration window“): the 0.15 code serves while the build migrates and keeps writing `notes` (a new game, an edit). A BEFORE trigger carries
-- every such write into `notes_doc`, so the first 0.16 read of a game saved in the window shows its note. It fires when an INSERT carries a note or an UPDATE has `notes` in its SET list,
-- which the 0.16 code never does (it writes `notes_doc` only), so it cannot overwrite a 0.16 write.
-- Needs the operator's approval for production (Release PR).
ALTER TABLE "games" ADD COLUMN "notes_doc" jsonb;--> statement-breakpoint
CREATE FUNCTION games_notes_doc_of(text_notes text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN text_notes IS NULL OR btrim(text_notes, E' \t\r\n') = '' THEN NULL ELSE (
    SELECT jsonb_build_object('type', 'doc', 'content', jsonb_agg(
      CASE WHEN line = '' THEN jsonb_build_object('type', 'paragraph')
      ELSE jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', line))) END
      ORDER BY n))
    FROM regexp_split_to_table(text_notes, E'\r?\n') WITH ORDINALITY AS l(line, n)) END
$$;--> statement-breakpoint
UPDATE games SET notes_doc = games_notes_doc_of(notes) WHERE notes IS NOT NULL;--> statement-breakpoint
CREATE FUNCTION games_sync_notes_doc() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.notes_doc := games_notes_doc_of(NEW.notes); RETURN NEW; END $$;--> statement-breakpoint
CREATE TRIGGER games_sync_notes_doc_update BEFORE UPDATE OF notes ON games FOR EACH ROW EXECUTE FUNCTION games_sync_notes_doc();--> statement-breakpoint
CREATE TRIGGER games_sync_notes_doc_insert BEFORE INSERT ON games FOR EACH ROW WHEN (NEW.notes IS NOT NULL) EXECUTE FUNCTION games_sync_notes_doc();
