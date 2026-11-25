-- Release 0.21 (#915, spec #907): the mark of a Deleted User (GLOSSARY: Deleted User, ADR 0020), a nullable `timestamptz` on `users`: the time of the deletion, null for a User who is not deleted.
-- Switch-over (ADR 0007): the code that serves until the switch-over (0.20) names `users` columns explicitly in its selects, and Better Auth's insert and update send the columns Better Auth
-- knows (ADR 0004), none of them this one; the column stays null. Nothing old writes it, so no data migration runs. No index (no request filters or joins on it yet), no CHECK (what a marked row holds is #681's).
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;
