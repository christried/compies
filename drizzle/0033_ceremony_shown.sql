-- Release 0.12 (#445, spec #425): the finished page waits for the Award ceremony (GLOSSARY: Award ceremony). `events` gets `ceremony_shown` (boolean, NOT NULL, default
-- false): true once the Host has started the ceremony at least once. A restart changes nothing. No index (nothing filters on it) and no CHECK (the converse of the
-- existing ceremony checks is not enforced either). Every Event finished before 0.12 is marked shown: the UPDATE sets `finished` and `archived` Events, the only Phases
-- that hold a ceremony start or an end, so their page shows its result as before.
-- Switch-over (ADR 0007): the code that serves until the switch-over (0.11) (1) inserts and updates `events` with explicit columns and never names `ceremony_shown`: an
-- Event it creates gets false, which is right, and its UPDATEs keep the value. (2) It starts the ceremony of a finished Event by writing `ceremony_starts_at` and
-- `ceremony_gag` only, so such a row has `ceremony_shown = false` with a stored start; the read counts a stored start as shown too (ceremonyShownOf). (3) It finishes an
-- Event after this migration ran: the Event has false, so the new code shows its page pending until the Host starts the ceremony. Accepted: the migration cannot mark an
-- Event that does not exist yet, and the Host's dock offers „Siegerehrung starten“.
ALTER TABLE "events" ADD COLUMN "ceremony_shown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "events" SET "ceremony_shown" = true WHERE "phase" IN ('finished', 'archived');
